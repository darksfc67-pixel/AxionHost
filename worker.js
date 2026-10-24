const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGIN || "").split(",").map(v => v.trim()).filter(Boolean);
  const valid = origin && (allowed.includes("*") || allowed.includes(origin));
  return {
    "Access-Control-Allow-Origin": valid ? origin : (allowed.includes("*") ? "*" : "null"),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}

function cleanName(value) {
  return String(value || "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 32);
}

async function verifyFirebaseToken(request, env) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error("Inicia sesión para crear un servidor."), { status: 401 });
  if (!env.FIREBASE_WEB_API_KEY) throw Object.assign(new Error("Falta configurar FIREBASE_WEB_API_KEY en Cloudflare."), { status: 503 });

  const response = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(env.FIREBASE_WEB_API_KEY), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: match[1] })
  });
  const data = await response.json().catch(() => ({}));
  const user = data.users && data.users[0];
  if (!response.ok || !user || !user.localId) {
    throw Object.assign(new Error("Tu sesión no es válida. Cierra sesión y vuelve a entrar."), { status: 401 });
  }
  if (user.emailVerified !== true) {
    throw Object.assign(new Error("Verifica tu correo electrónico antes de crear un servidor."), { status: 403 });
  }
  return { uid: user.localId, email: user.email || "" };
}

function requiredEnv(env, names) {
  const missing = names.filter(name => !env[name]);
  if (missing.length) throw Object.assign(new Error("Falta configurar en Cloudflare: " + missing.join(", ")), { status: 503 });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (origin && cors["Access-Control-Allow-Origin"] === "null") return json({ error: "Origen no autorizado." }, 403, cors);
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({ service: "AxionHost provisioning API", status: "online", providerConfigured: Boolean(env.PTERO_URL && env.PTERO_APP_KEY) }, 200, cors);
    }
    if (request.method !== "POST" || url.pathname !== "/api/servers") {
      return json({ error: "Ruta no encontrada." }, 404, cors);
    }

    try {
      const user = await verifyFirebaseToken(request, env);
      requiredEnv(env, ["PTERO_URL", "PTERO_APP_KEY", "PTERO_USER_ID", "PTERO_EGG_ID", "PTERO_ALLOCATION_ID", "PTERO_DOCKER_IMAGE", "PTERO_STARTUP", "AXION_DB"]);

      const body = await request.json();
      const name = cleanName(body.name);
      const description = String(body.description || "").trim().slice(0, 160);
      if (name.length < 3 || !/[a-zA-Z0-9]/.test(name)) return json({ error: "El nombre debe tener entre 3 y 32 caracteres y contener letras o números." }, 400, cors);
      if (!description) return json({ error: "Escribe una descripción para el servidor." }, 400, cors);
      if (body.plan && body.plan !== "FREE") return json({ error: "Por ahora solo se admite el plan FREE." }, 400, cors);

      const reservation = await env.AXION_DB.prepare(
        "INSERT OR IGNORE INTO axion_servers (firebase_uid, status, server_name, created_at) VALUES (?, 'pending', ?, datetime('now'))"
      ).bind(user.uid, name).run();
      if (!reservation.meta || reservation.meta.changes !== 1) {
        const existing = await env.AXION_DB.prepare(
          "SELECT status, server_name, server_identifier, address, port FROM axion_servers WHERE firebase_uid = ?"
        ).bind(user.uid).first();
        return json({
          error: existing && existing.status === "ready" ? "Tu cuenta ya tiene un servidor FREE." : "Ya hay una creación en curso para esta cuenta.",
          server: existing || null
        }, 409, cors);
      }

      let envVars = {};
      if (env.PTERO_ENV_JSON) {
        try { envVars = JSON.parse(env.PTERO_ENV_JSON); }
        catch { throw Object.assign(new Error("PTERO_ENV_JSON no contiene JSON válido."), { status: 503 }); }
      }
      // Never accept resource limits or provider identifiers from the public browser.
      envVars.SERVER_NAME = name;
      envVars.SERVER_DESCRIPTION = description;
      const panelBase = env.PTERO_URL.replace(/\/+$/, "");
      const panelResponse = await fetch(panelBase + "/api/application/servers", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.PTERO_APP_KEY,
          "Accept": "Application/vnd.pterodactyl.v1+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name,
          description,
          user: Number(env.PTERO_USER_ID),
          egg: Number(env.PTERO_EGG_ID),
          docker_image: env.PTERO_DOCKER_IMAGE,
          startup: env.PTERO_STARTUP,
          environment: envVars,
          limits: {
            memory: Number(env.PTERO_MEMORY_MB || 2048),
            swap: 0,
            disk: Number(env.PTERO_DISK_MB || 5120),
            io: 500,
            cpu: Number(env.PTERO_CPU_PERCENT || 100)
          },
          feature_limits: { databases: 0, backups: 0, allocations: 1 },
          allocation: { default: Number(env.PTERO_ALLOCATION_ID) },
          start_on_completion: true
        })
      });
      const panelData = await panelResponse.json().catch(() => ({}));
      if (!panelResponse.ok) {
        await env.AXION_DB.prepare("DELETE FROM axion_servers WHERE firebase_uid = ? AND status = 'pending'").bind(user.uid).run();
        const detail = panelData.errors && panelData.errors[0] && panelData.errors[0].detail;
        return json({
          error: panelResponse.status === 401 || panelResponse.status === 403
            ? "El panel rechazó la clave o sus permisos. Revisa PTERO_APP_KEY."
            : "El proveedor no pudo crear el servidor. " + (detail || "Revisa el egg Bedrock, la asignación de puerto y los recursos disponibles.")
        }, 502, cors);
      }

      const attrs = panelData.attributes || {};
      const allocations = attrs.relationships && attrs.relationships.allocations && attrs.relationships.allocations.data || [];
      const allocation = allocations[0] && allocations[0].attributes || {};
      const address = allocation.ip || "";
      const port = allocation.port || null;
      await env.AXION_DB.prepare(
        "UPDATE axion_servers SET status='ready', server_id=?, server_identifier=?, server_name=?, address=?, port=? WHERE firebase_uid=?"
      ).bind(String(attrs.id || ""), attrs.identifier || "", attrs.name || name, address, port, user.uid).run();

      return json({
        ok: true,
        message: "El proveedor creó el servidor.",
        server: {
          id: attrs.identifier || String(attrs.id || ""),
          name: attrs.name || name,
          status: attrs.status || "installing",
          address,
          port,
          joinAddress: address && port ? address + ":" + port : null
        }
      }, 201, cors);
    } catch (error) {
      const status = Number(error && error.status) || 500;
      return json({ error: status === 500 ? "Error interno al procesar la creación. Revisa los logs del Worker." : error.message }, status, cors);
    }
  }
};

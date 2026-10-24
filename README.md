# AxionHost

Hosting para Minecraft Bedrock con interfaz naranja y amarilla.

## Estado del proyecto
- La web estática se publica desde GitHub Pages.
- El formulario de creación ya puede llamar a un backend real.
- El backend de Cloudflare Workers usa Firebase Authentication y un panel compatible con Pterodactyl.
- **La creación real no estará activa hasta desplegar el Worker, crear la base de datos D1 y configurar un proveedor/panel con permisos de creación.** El repositorio por sí solo no aporta máquinas ni recursos gratuitos.

## Configurar hosting real
Sigue la guía completa: [AXIONHOST_REAL_HOSTING.md](./AXIONHOST_REAL_HOSTING.md).

Archivos:
- [index.html](./index.html) — interfaz web.
- [worker.js](./worker.js) — API segura de provisión.
- [schema.sql](./schema.sql) — esquema de la base de datos D1.

Nunca pongas la clave de Application API de Pterodactyl en el frontend ni en el repositorio.

# AxionHost: conexión con servidores Minecraft Bedrock reales

Esta integración usa un backend de Cloudflare Workers y un panel compatible con Pterodactyl. **No crea máquinas ni consigue recursos gratuitos por sí misma**: necesitas un proveedor/panel que te permita crear servidores mediante su Application API y tenga instalado un egg compatible con Bedrock. La API de Pterodactyl para crear servidores requiere permisos de administración del panel. No pongas esa clave en el navegador ni en GitHub.

## Archivos
- `worker.js`: backend que valida la sesión de Firebase, limita a un servidor por cuenta Firebase y llama a Pterodactyl.
- `schema.sql`: tabla D1 que evita que una cuenta cree más de un servidor desde AxionHost.
- `index.html`: formulario actualizado para llamar al Worker, en lugar de mostrar una carga simulada.

## 1. Crear el backend
1. En Cloudflare Dashboard, crea un Worker llamado, por ejemplo, `axionhost-api`.
2. Copia el contenido de `worker.js` al editor del Worker y despliega.
3. Crea una base de datos D1 llamada `axionhost-db`.
4. Ejecuta `schema.sql` en la consola SQL de D1.
5. En Worker → Settings → Bindings, agrega un binding D1 llamado exactamente `AXION_DB` y selecciona `axionhost-db`.

## 2. Variables del Worker
Configura estas variables en Settings → Variables and Secrets. La clave del panel debe ser **Secret**.

- `ALLOWED_ORIGIN` = `https://darksfc67-pixel.github.io` (añade el dominio real de tu web si es diferente)
- `FIREBASE_WEB_API_KEY` = la apiKey pública del proyecto Firebase `axionhost-1ab63` (se usa para validar ID tokens en Firebase Identity Toolkit)
- `PTERO_URL` = URL base del panel, sin barra final
- `PTERO_APP_KEY` = **Secret**, Application API key con permisos mínimos necesarios para crear servidores
- `PTERO_USER_ID` = ID numérico de la cuenta dueña que recibirá los servidores
- `PTERO_EGG_ID` = ID numérico del egg de Minecraft Bedrock instalado en el panel
- `PTERO_ALLOCATION_ID` = ID numérico de un puerto/alocación UDP disponible para Bedrock
- `PTERO_DOCKER_IMAGE` = imagen Docker válida para ese egg
- `PTERO_STARTUP` = comando de inicio esperado por ese egg
- `PTERO_ENV_JSON` = JSON con las variables de entorno que exige ese egg, si las requiere
- Opcionales: `PTERO_MEMORY_MB` = `2048`, `PTERO_DISK_MB` = `5120`, `PTERO_CPU_PERCENT` = `100`

Los IDs, la imagen, el comando y las variables de entorno dependen de cómo esté configurado el panel. No los adivines: pídelos al administrador del panel/proveedor. La asignación debe tener el puerto UDP correcto para Bedrock.

## 3. Conectar el sitio
1. Abre AxionHost, inicia sesión y verifica tu correo en Firebase.
2. En la configuración del servidor, toca **Conectar backend** y pega la URL de tu Worker, por ejemplo `https://axionhost-api.TU-CUENTA.workers.dev` (usa la URL real).
3. Pulsa **CREAR SERVIDOR**. Si todo está configurado, el backend pedirá la creación real al panel y mostrará la dirección de conexión si el panel la devuelve.

La URL del Worker se guarda en el navegador; no es una contraseña. Las claves privadas nunca deben introducirse en la página ni en el chat.

## Límite importante sobre hosting gratis
La cuenta gratuita de GitHub Pages/Cloudflare aloja la web y el backend pequeño, pero **no aloja el proceso de Minecraft Bedrock**. Si tu proveedor gratuito solo deja crear servidores desde su propio panel y no ofrece una API de creación a terceros, AxionHost no puede automatizar la creación allí sin permiso del proveedor. En ese caso, la integración de esta versión requiere otro panel/proveedor con API compatible o que el proveedor publique una API oficial.

## Prueba de salud
Abre `https://TU-WORKER.workers.dev/api/health`. Debe responder JSON con `service`, `status` y `providerConfigured`. Si `providerConfigured` es `false`, aún faltan `PTERO_URL` o `PTERO_APP_KEY`.

# Sonora 3.0 — compartir una biblioteca de hasta 100 canciones

Sonora está publicada en `/sonora.html`. **La biblioteca local sigue funcionando sin configurar nada**. La opción privada de GitHub permite guardar hasta 100 canciones autorizadas y recuperarlas desde otro navegador.

## Primera opción: repositorio PRIVADO de GitHub (sin disco de Render)

1. En GitHub crea un repositorio **privado y separado** de `JuanDavidSol/SolangeMiSol`, por ejemplo `Sonora-Biblioteca`. Inicialízalo con un archivo `README.md` para que exista la rama `main`. **Nunca pongas las canciones en el repositorio público de la web.**
2. En GitHub, en **Settings → Developer settings → Personal access tokens → Fine-grained tokens**, crea un token destinado únicamente a ese repositorio privado. Dale acceso al repositorio seleccionado y permiso **Contents: Read and write**. Configura una caducidad y renueva el token cuando venza.
3. En el servicio de Render que ejecuta Snoopy/Sonora, abre **Environment** e introduce:
   - `SONORA_GITHUB_REPOSITORY`: `TU_USUARIO/Sonora-Biblioteca` (el nombre exacto del repositorio privado).
   - `SONORA_GITHUB_TOKEN`: el token de acceso de GitHub, **solo en Render**.
   - `SONORA_GITHUB_BRANCH`: `main` (opcional; debe coincidir con la rama de ese repositorio).
   - `SONORA_LIBRARY_TOKEN`: contraseña privada para que las dos personas entren en Sonora, de al menos **16 caracteres**. **No es el token GitHub ni la clave Gemini**.
4. Guarda y despliega. Comprueba en `/api/sonora/status` que figuren `enabled:true` y `provider:"github"`.
5. Abre `/sonora.html` en cada dispositivo, introduce la contraseña **de biblioteca** y pulsa **Conectar**. Pulsa **Subir música local** para subir las canciones que hayas añadido a ese navegador, o **Traer música compartida** para recibir canciones del repositorio privado.

La contraseña de biblioteca solo permanece en la memoria de la pestaña; no se guarda en GitHub ni en localStorage. El token privado de GitHub está exclusivamente en las variables de entorno del servidor, sin exponerse al navegador. La contraseña permite consultar y cargar canciones, por eso solo debes compartirla con personas autorizadas.

### Límites importantes

- Máximo **100 canciones**, con **20 MB por archivo** y **850 MB en total** para los archivos de la biblioteca.
- GitHub recomienda mantener un repositorio por debajo de aproximadamente **1 GB** y no hacer más de **6 actualizaciones por minuto**. Por eso Sonora limita el ritmo de subida a alrededor de una canción cada 10,5 segundos; subir 100 canciones puede llevar bastante tiempo.
- GitHub **no es una plataforma de streaming ni almacenamiento musical**. Esta función está planteada como una biblioteca pequeña de uso personal, no como una distribución pública. Si el uso crece, convendrá migrar a almacenamiento de objetos.
- Comparte **únicamente canciones que tengas permiso para subir y compartir**. No copies canciones comerciales sin autorización.
- No hay sincronización automática: la subida es explícita y se puede importar manualmente desde otro navegador. La biblioteca local continúa funcionando, incluso si GitHub no está disponible.
- Es recomendable mantener copias de seguridad aparte. Git conserva versiones históricas y un repositorio que recibe muchas modificaciones puede crecer con el tiempo.
- No coloques `SONORA_GITHUB_TOKEN`, `SONORA_LIBRARY_TOKEN` ni claves Gemini en código de GitHub, capturas de pantalla o chats.

## Segunda opción: disco persistente en Render (si prefieres no usar GitHub)

El backend conserva la integración anterior con disco. Si no se configura GitHub, puedes añadir en **Render → Disk** un volumen persistente montado en `/var/data`, y en **Environment**:
- `SONORA_STORAGE_DIR=/var/data/sonora`
- `SONORA_LIBRARY_TOKEN=CONTRASEÑA_PRIVADA_DE_16_CARACTERES_O_MAS`

En el disco anterior la capacidad del servidor era de 200 canciones. Si se configura GitHub, **GitHub tiene prioridad** y aplica el límite de 100 canciones. Los discos persistentes de Render requieren un servicio compatible y pueden generar cargos; en Render Free no hay discos persistentes.

## Enlaces útiles

- [Documentación oficial de límites de GitHub](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits)
- [API de Git blobs](https://docs.github.com/en/rest/git/blobs)
- [Discos persistentes de Render](https://render.com/docs/disks)

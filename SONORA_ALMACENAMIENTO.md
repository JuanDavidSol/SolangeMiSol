# Sonora 3.0 — Biblioteca compartida opcional

Sonora está en `/sonora.html`. La biblioteca local funciona sin configuración adicional y guarda los archivos de música mediante IndexedDB en el navegador del visitante.

## Diferencia entre guardar localmente y en el servidor

- **Local (predeterminado):** al pulsar «Añadir música», las canciones se guardan únicamente en ese navegador. No se suben por sí solas.
- **Compartida (opcional):** permite subir canciones de forma explícita y descargarlas desde otro navegador introduciendo una contraseña independiente de Gemini.
- La biblioteca remota está **desactivada** hasta configurar almacenamiento persistente y una contraseña. Nunca se guarda automáticamente música en el sistema de archivos temporal de Render.
- La clave de Gemini y la contraseña de la biblioteca compartida son independientes. No deben subirse al repositorio.

## Activar biblioteca compartida en Render

1. Elige un servicio de Render con disco persistente. Los servicios **Free no admiten discos persistentes** y borran sus archivos locales tras reinicios, despliegues y suspensión.
2. En la sección **Disk** del servicio, adjunta un disco con ruta de montaje `/var/data`. El disco y el servicio de pago pueden generar cargos; revisa el precio antes de activarlos.
3. En **Environment**, añade estas variables (no las escribas en archivos de GitHub):
   - `SONORA_STORAGE_DIR`: `/var/data/sonora`
   - `SONORA_LIBRARY_TOKEN`: una contraseña privada y aleatoria de **al menos 16 caracteres**; distinta de cualquier clave API.
4. Guarda y despliega el servicio. Comprueba que `GET /api/sonora/status` devuelva `enabled: true`.
5. Abre `/sonora.html`, introduce la contraseña en «Nuestra biblioteca compartida», y pulsa **Conectar**.
6. Usa **☁ Subir música local** para guardar las canciones de ese navegador en el disco o **↓ Traer música compartida** para traer las canciones al dispositivo actual.

La contraseña se conserva solo en la memoria de la página; será necesario volver a introducirla al recargar. El acceso de lectura y escritura al servidor requiere esa contraseña.

## Límites y precauciones

- Hasta **200 canciones** de **20 MB** cada una en el almacén remoto; extensiones MP3, M4A, WAV, OGG, FLAC, AAC y OPUS.
- No subas canciones de terceros sin permiso para compartirlas. Evita exponer la contraseña a personas no autorizadas.
- La biblioteca compartida no sustituye una copia de seguridad. Configura copias en otro lugar cuando sea importante conservar los archivos.
- Si prefieres seguir en el plan gratuito de Render, la alternativa para un futuro es integrar almacenamiento externo (por ejemplo un proveedor de almacenamiento de objetos) con autenticación y cuotas; esta versión todavía **no** incorpora un proveedor externo.

Documentación oficial: https://render.com/docs/disks y https://render.com/docs/free.

# 🐶 Asistente de Snoopy

Asistente virtual para tu web, **sin dependencias**. Responde primero con tu **base de conocimientos** (rápido y exacta). Cuando la base no tiene la respuesta, conversa con **Gemini** (IA en línea) y, si Gemini no está disponible, con **Ollama** (IA local y gratuita). Si ninguna IA responde, **sigue funcionando** solo con la base de conocimientos.

## Cómo decide qué responder

1. **Saludos y preguntas simples** (hola, gracias, quién eres…): respuesta inmediata.
2. **Base de conocimientos**: si la pregunta coincide casi por completo (cobertura ≥ 0,8) con una respuesta del panel, se responde esa, tal cual. Así los datos (por ejemplo, «25 galletas») nunca los cambia la IA, y es más rápido.
3. **Gemini**: para el resto, con los fragmentos de tu base como contexto. El texto se va mostrando **mientras se escribe** (streaming). Ante un error temporal (429 o 503) **reintenta** hasta 2 veces con una espera corta antes de rendirse.
4. **Ollama**: si Gemini falla o no está configurado.
5. **Base de conocimientos** con coincidencia parcial, o el mensaje «no sé» con botones de ayuda.

Las preguntas que la base **no supo responder** se anotan en el panel para que las conviertas en respuestas nuevas.

## Qué incluye

| Parte | Dónde |
|---|---|
| Página del asistente (chat completo) | `public/index.html` → `http://localhost:3000/asistente/` |
| Botón flotante para cualquier página | `public/chat.js` (modo `float`) |
| Panel de administración | `public/admin.html` → `http://localhost:3000/asistente/admin.html` |
| Servidor (Node, API y archivos) | `server/index.js` |
| Lógica del asistente (intenciones, contexto, personalidad) | `server/assistant.js` |
| IA en línea / IA local | `server/gemini.js` / `server/ollama.js` |
| Búsqueda en español (errores de escritura y sinónimos) | `server/search.js` |
| Lector de tu web | `server/indexer.js` |
| Base de datos (archivos JSON) | `data/` (se crea sola) |

## Instalación (5 minutos)

1. Instala **Node.js 18 o superior** desde <https://nodejs.org> (versión LTS).
2. Pon la carpeta `asistente` **dentro de la carpeta de tu web**, junto a `juegos.html`:

   ```
   mi-web/
   ├── juegos.html
   ├── index.html
   └── asistente/        ← esta carpeta
   ```
3. Abre una terminal dentro de `asistente` y ejecuta:

   ```
   npm start
   ```
4. La primera vez se muestra **una contraseña de administración generada al azar. Cópiala**, solo se muestra una vez. Para cambiarla: `npm run set-password -- "mi nueva contraseña"`.
5. Abre <http://localhost:3000/asistente/> y prueba el chat. El panel está en <http://localhost:3000/asistente/admin.html>.

El servidor también sirve tu web en <http://localhost:3000/>, así que `juegos.html` y el asistente funcionan juntos. Tu carpeta `asistente` (código, datos y contraseña) **nunca se publica** como archivo. Del resto de tu web solo se sirven archivos con extensiones conocidas (`.html`, `.css`, `.js`, imágenes, audio, fuentes, `.pdf`…); cualquier otro responde 404.

## Activar Gemini (IA en línea, opcional)

1. Crea una clave en Google AI Studio.
2. Arranca el asistente con la variable `GEMINI_API_KEY`. En Windows (PowerShell): `$env:GEMINI_API_KEY="tu-clave"; npm start`
3. Mira el panel, pestaña **Estado**: debe decir «Configurada».

El modelo se cambia con `GEMINI_MODEL`. **Comprueba que el nombre exista en tu cuenta**: si no existe, Gemini devolverá error en cada pregunta y el asistente pasará a Ollama sin avisar (verás `Gemini no disponible:` en la consola).

## Activar la IA local (Ollama, opcional)

1. Instala Ollama desde <https://ollama.com>.
2. Descarga un modelo pequeño. El predeterminado es `qwen3:4b-instruct`: `ollama pull qwen3:4b-instruct` (también sirven `qwen2.5:3b` o `llama3.2:3b`).
3. Reinicia el asistente. Verás en la consola `IA local: Ollama activo…` y en el panel, pestaña **Estado**.

Para usar otro modelo: variable `OLLAMA_MODEL`, o el campo «Modelo de Ollama» en **Ajustes**.

Las IA **solo reciben fragmentos de tu base de conocimientos** y tienen instrucciones de no inventar datos de la web. Si Gemini y Ollama se apagan, el asistente cambia solo a la base de conocimientos.

> Un modelo local pequeño responde peor que los grandes en línea y necesita un equipo con memoria suficiente (unos 4 GB libres para un modelo de 3B–4B). La parte más fiable del asistente es siempre la base de conocimientos.

## Respuesta en tiempo real

Cuando responde Gemini, el texto aparece poco a poco, como si Snoopy lo estuviera escribiendo; se siente mucho más rápido que esperar la respuesta completa. Las respuestas de la base de conocimientos y de Ollama aparecen enteras de una vez.

- El chat usa `POST /api/chat/stream`, que envía **una línea JSON por evento**: `delta` (un trozo de texto), `done` (la respuesta final completa, con enlaces y sugerencias) o `error`. Al llegar `done`, el texto final reemplaza al que se iba escribiendo (por ejemplo, si se recortó una respuesta muy larga).
- Si la conexión con Gemini se corta a mitad, el visitante conserva lo recibido, marcado con «…». Si falla **antes** de que llegue texto, se prueba con Ollama como siempre.
- `POST /api/chat` (respuesta única) sigue disponible. `chat.js` lo usa solo si el servidor no tiene el endpoint nuevo o el navegador no sabe leer flujos.
- Los límites de mensajes, el guardado de conversaciones y el enmascarado de correos y teléfonos funcionan igual en las dos versiones.

## Personalidad y alcance

Snoopy habla en español, con tono amable, **breve** y con pocos emojis. En **Ajustes → Qué puede responder la IA** eliges:

- **General** (predeterminado): ayuda con tu web y, además, con preguntas generales y de programación.
- **Solo la web**: rechaza con amabilidad lo que no tenga que ver con juegos, galletas, premios y tienda.

El texto del chat admite **negritas**, *cursiva*, listas, `código` y bloques de código. Se convierte con un conversor propio que **nunca usa `innerHTML`**, así que la IA no puede inyectar HTML.

## Enlazarlo desde tus páginas

**Enlace a la página del asistente** (ya añadido a `juegos.html`):

```html
<a href="asistente/">💬 Preguntar a Snoopy</a>
```

**Botón flotante** en cualquier página (esquina inferior derecha). Pega esto antes de `</body>`:

```html
<script src="/asistente/chat.js" data-mode="float" defer></script>
```

Si el servidor del asistente está apagado, el botón simplemente no aparece y no rompe nada.

Opciones del script: `data-api="https://tu-servidor"` (servidor en otra dirección) y `data-timeout="60"` (segundos que espera una respuesta antes de mostrar «estoy tardando más de lo normal»; de 10 a 120, por defecto 60).

**Respuestas según la sección:** el chat envía la sección donde está el visitante. En `juegos.html` ya se rellena con la pestaña activa (`document.body.dataset.assistantSection`). Las respuestas con ese mismo valor en el campo «sección» tienen prioridad y salen como botones rápidos.

## Mantener el conocimiento al día

- **Preguntas y respuestas:** en el panel, añade, edita, desactiva o elimina. Los cambios se aplican al instante.
- **Sin respuesta:** lista de lo que los visitantes preguntaron y la base no supo responder (las más repetidas primero). Con **Crear respuesta** se abre el editor con la pregunta ya escrita; al guardar, sale de la lista.
- **Opiniones:** los visitantes pueden marcar 👍 o 👎 en cada respuesta. Revisa las 👎 y conviértelas en respuestas mejores.
- **Leer tu web:** el botón **↻ Actualizar desde la web** (o `npm run reindex`) lee los `.html` de tu carpeta y los convierte en fragmentos consultables. Hazlo cada vez que cambies el contenido. La página de juegos construye casi todo con JavaScript, por eso viene con respuestas ya escritas a mano.
- **Palabras clave y sinónimos:** los errores de escritura pequeños («galetas») se corrigen solos. Para palabras distintas con el mismo significado, usa **Ajustes → Búsqueda: sinónimos** (un grupo por línea: `consigo, obtengo, gano`) o las «palabras clave» de cada respuesta.

## Panel de administración

Preguntas y respuestas (con FAQ y sección), preguntas sin respuesta, opiniones 👍/👎, ajustes (nombre, bienvenida, mensaje cuando no sabe, alcance de la IA, sinónimos, activar/desactivar funciones, enlace de contacto), conversaciones (ver y borrar) y estado de Gemini y Ollama.

## Variables de entorno

| Variable | Para qué | Por defecto |
|---|---|---|
| `PORT` | Puerto | `3000` |
| `HOST` | `127.0.0.1` = solo tu equipo; `0.0.0.0` = abrirlo a la red | `127.0.0.1` |
| `SITE_DIR` | Carpeta de tu web | la carpeta que contiene a `asistente` |
| `GEMINI_API_KEY` | Clave de Gemini (sin ella, no se usa Gemini) | — |
| `GEMINI_MODEL` | Modelo de Gemini | ver `server/config.js` |
| `GEMINI_TIMEOUT` | Milisegundos máximos por intento | `45000` |
| `GEMINI_RETRIES` | Reintentos ante 429 o 503 | `2` |
| `OLLAMA_URL` / `OLLAMA_MODEL` | Dónde está Ollama y qué modelo usar | `http://127.0.0.1:11434` / `qwen3:4b-instruct` |
| `OLLAMA_TIMEOUT` | Milisegundos máximos de Ollama | `300000` |
| `ADMIN_PASSWORD` | Contraseña fija (si no, se genera y se guarda cifrada) | — |
| `ALLOWED_ORIGINS` | Otras webs que pueden usar el chat, separadas por comas | — |
| `RATE_CHAT_PER_MIN` | Mensajes por minuto y por visitante | `20` |
| `TRUST_PROXY` | `1` si estás detrás de un proxy inverso | — |
| `DATA_DIR` | Dónde guardar los datos | `asistente/data` |
| `SAVE_DELAY` | Milisegundos que se espera para guardar por lotes conversaciones, opiniones y preguntas sin respuesta | `3000` |

En Windows (PowerShell): `$env:PORT=4000; npm start`

> El chat de la página espera **60 s** como máximo (`data-timeout`), pero Ollama puede tardar hasta 5 minutos (`OLLAMA_TIMEOUT`) si tiene que cargar el modelo. Si usas Ollama como respaldo con un equipo lento, baja `OLLAMA_TIMEOUT` a unos `50000` o sube `data-timeout`, para que ambos tiempos sean coherentes.

## Seguridad

- Contraseña de administración cifrada (scrypt), sesiones de 8 h y límite de intentos de acceso.
- Límite de mensajes (y de opiniones) por visitante, tamaño máximo de mensaje y validación de todos los datos.
- El texto se muestra siempre construyendo elementos del DOM (no con HTML en bruto) y solo se aceptan enlaces relativos o `http(s)`.
- Se enmascaran correos y teléfonos antes de guardar conversaciones, opiniones y preguntas sin respuesta; todo se borra solo a los 30 días (configurable). Puedes desactivar el guardado en Ajustes.
- No se guardan direcciones IP.
- Solo se sirven extensiones de archivo conocidas; cabeceras de seguridad y política CSP en las páginas del asistente.

## Si lo publicas en internet

- Pon delante un servidor con **HTTPS** (Caddy, Nginx o el que ofrezca tu hosting) y usa `TRUST_PROXY=1`.
- Si tu web está en un hosting **estático** (GitHub Pages, etc.), esas páginas no pueden ejecutar este servidor: tendrás que alojarlo aparte (un VPS o un servicio gratuito de Node) y usar `data-api="https://tu-servidor"` en el script, más `ALLOWED_ORIGINS`.
- **Ollama necesita un equipo encendido y con memoria.** En un hosting normal no podrás usarlo; el asistente seguirá funcionando con Gemini y con la base de conocimientos.
- **Protege tu clave de Gemini**: va solo en el servidor, nunca en las páginas.

## Limitaciones honestas

- La base de datos son archivos JSON: perfecta para una web personal o pequeña; para mucho tráfico conviene migrar a SQLite o PostgreSQL. Las conversaciones se guardan **por lotes** (cada pocos segundos y al cerrar con Ctrl+C); si el equipo se apaga de golpe, se pueden perder los últimos segundos. Lo que editas en el panel se guarda al instante.
- El límite de mensajes vive en memoria y se reinicia al reiniciar el servidor.
- La búsqueda corrige errores pequeños y entiende los sinónimos que tú añadas, pero no «entiende» el significado como una IA: para eso están Gemini y Ollama.
- Si pones un **proxy inverso** delante (Nginx, Apache, Cloudflare…), desactiva el almacenamiento en búfer para `/api/chat/stream`; si no, la respuesta llegará de golpe en vez de escribirse poco a poco. El servidor ya envía la cabecera `X-Accel-Buffering: no`, que Nginx respeta; con otros proxies puede hacer falta configurarlo.

## Pruebas

```
npm test
```

Arranca un servidor real en una carpeta temporal, con un Ollama y un Gemini simulados, y comprueba respuestas, orden de prioridad (base → IA), reintentos y respuesta en tiempo real de Gemini, errores de escritura y sinónimos, preguntas sin respuesta, opiniones, panel, seguridad, límites, guardado por lotes y archivos protegidos.

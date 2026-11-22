# Imágenes de personajes

Aquí van las imágenes que reemplazan a los emojis en `juegos.html`. Las carga `personajes.js`.

## Nombres de archivo

| Archivo | Reemplaza este emoji |
|---|---|
| `snoopypng.png` | 🐶 |
| `woodstock.png` | 🐤 |
| `galleta.png` | 🍪 |
| `globo.png` | 🎈 |
| `corazon.png` | ❤️ |
| `estrella.png` | ⭐ |

Cada imagen reemplaza a su emoji **en todos los sitios donde aparezca**: casillas, títulos, reglas, botones, confeti, el contador de galletas y los juegos de lienzo. También sirven `.webp` en vez de `.png`. Si falta un archivo, ese personaje sigue saliendo como emoji; no hace falta tenerlos todos.

## Cómo deben ser las imágenes

- Formato PNG o WebP con **fondo transparente**.
- Cuadradas, por ejemplo **256 × 256 px**, con el personaje centrado y un pequeño margen alrededor.
- Peso bajo (idealmente menos de 100 KB cada una) para que el móvil las cargue rápido.
- Todas con un estilo parecido, para que no desentonen entre sí dentro del mismo juego.

## Cómo comprobar que funcionan

1. Abre `juegos.html` con el servidor o la web publicada.
2. Abre la consola del navegador (tecla F12) y escribe `personajes.estado()`.
3. Verás una tabla con cada personaje y si su imagen se encontró. Si dice «falta», revisa el nombre del archivo.

Si cambias una imagen y sigues viendo la anterior, recarga con Ctrl+F5.

## Para añadir más personajes

Abre `personajes.js`, agrega una línea a la lista `PERSONAJES` (por ejemplo `{ archivo: 'casita', emojis: ['🏠'] }`) y guarda la imagen con ese nombre.

## Permisos

Peanuts Worldwide es quien tiene los derechos de los personajes. Guarda aquí solo imágenes que tengas permiso para usar, y conserva el mensaje o contrato donde te lo concedieron.

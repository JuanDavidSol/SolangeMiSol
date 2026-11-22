'use strict';
/* Contenido inicial del asistente. Puedes cambiarlo todo desde el panel de administración. */
const qa = (question, answer, keywords = [], link = '', faq = false, page = '') =>
  ({ question, answer, keywords, link, linkText: link ? 'Ir a los juegos' : '', faq, page, enabled: true });

const knowledge = [
  qa('¿Qué juegos hay?', 'Hay 14 juegos: Tres en raya, Sudoku, Memorama, Dulces, Ahorcado, Snoopy dice, Woodstock, Corazones, Barón Rojo, Conecta 4, 2048, Flappy, Pac-Snoopy y la Aventura. Además tienes la Tienda de vales y tus Premios.', ['lista', 'jugar', 'catalogo', 'pestañas', 'todos'], 'juegos.html', true),
  qa('¿Cómo gano galletas?', 'Ganas galletas 🍪 al terminar cada juego, según tu resultado. También te dan galletas los premios que desbloqueas y el bono diario de la tienda.', ['monedas', 'puntos', 'conseguir', 'consigo', 'ganar', 'gano', 'obtener'], 'juegos.html', true),
  qa('¿Para qué sirven las galletas?', 'Las galletas se canjean por vales en la Tienda de vales 🛍️. Hay vales desde 10 galletas (un abrazo gigante) hasta 250 (una escapada juntos).', ['moneda', 'tienda', 'canjear', 'vales', 'precio', 'cuesta'], 'juegos.html', true),
  qa('¿Qué es el bono diario y la racha?', 'En la tienda puedes cobrar un bono una vez al día. Si entras días seguidos tu racha sube y el bono crece, hasta un máximo a los 7 días.', ['bono', 'diario', 'racha', 'cada dia', 'regalo'], 'juegos.html', false, 'shop'),
  qa('¿Cómo funciona el cofre sorpresa?', 'El cofre cuesta 25 galletas. A veces trae un vale gratis y otras veces trae entre 15 y 45 galletas.', ['cofre', 'sorpresa', 'azar', 'premio'], 'juegos.html', false, 'shop'),
  qa('¿Cómo uso o canjeo un vale?', 'Compra el vale en la tienda y aparecerá en "Mis vales". Pulsa "Usar vale" para marcarlo como usado y "Avisar" para enviar un mensaje por WhatsApp.', ['usar', 'vale', 'whatsapp', 'avisar', 'cobrar', 'mis vales'], 'juegos.html', true, 'shop'),
  qa('¿Qué son los premios?', 'Los premios son logros que desbloqueas al cumplir retos en los juegos, como ganar tu primera partida. Algunos traen un vale y todos te dan galletas. Los ves en la pestaña Premios 🏆.', ['logros', 'medallas', 'retos', 'desbloquear'], 'juegos.html', false, 'rewards'),
  qa('¿Dónde se guarda mi progreso?', 'Tus galletas, vales, premios y récords se guardan en el navegador de cada dispositivo. Si abres la página en otro móvil o navegador, empezarás de cero.', ['guardar', 'progreso', 'perder', 'otro movil', 'datos', 'sincronizar'], 'juegos.html', true),
  qa('¿Cómo borro mi progreso?', 'En la pestaña Premios hay un botón "Borrar progreso". Te pedirá confirmación porque no se puede deshacer.', ['borrar', 'reiniciar', 'empezar de cero', 'resetear'], 'juegos.html', false, 'rewards'),
  qa('¿Cómo silencio el sonido?', 'Pulsa el botón del altavoz 🔊 que está arriba a la derecha, junto a tus galletas.', ['sonido', 'musica', 'silencio', 'volumen', 'mute'], 'juegos.html'),
  qa('¿Cómo se juega desde el móvil?', 'Todos los juegos funcionan con el dedo. Pac-Snoopy y la Aventura tienen botones táctiles, el 2048 y Pac-Snoopy se manejan deslizando, y en Dulces puedes arrastrar o tocar las fichas.', ['movil', 'celular', 'tactil', 'dedo', 'controles', 'telefono'], 'juegos.html', true),
  qa('¿Cómo se juega con el teclado?', 'Las flechas mueven a Snoopy en Corazones, Barón Rojo, Pac-Snoopy, 2048 y la Aventura (con espacio para saltar). Tres en raya acepta las teclas 1-9, Snoopy dice las teclas 1-4, Sudoku los números y el Ahorcado las letras.', ['teclado', 'flechas', 'teclas', 'ordenador', 'pc'], 'juegos.html'),
  qa('¿Cómo se juega al Tres en raya?', 'Junta tres fichas en línea antes que tu rival. Puedes jugar contra Woodstock en fácil o difícil, o de dos jugadores. En difícil no se le puede ganar, ¡pero sí empatar!', ['tres en raya', 'gato', 'ttt', 'woodstock'], 'juegos.html', false, 'ttt'),
  qa('¿Cómo se juega al Sudoku?', 'Llena la cuadrícula con números del 1 al 9 sin repetir en filas, columnas ni cuadros de 3×3. Hay tres dificultades, un cronómetro con tu mejor tiempo y un botón de pista 💡.', ['sudoku', 'numeros', 'cuadricula', 'pista', 'tiempo'], 'juegos.html', false, 'sudoku'),
  qa('¿Cómo se juega al Memorama?', 'Voltea cartas de dos en dos para encontrar las parejas con el menor número de intentos. Tiene 4 niveles, desde 6 hasta 12 parejas.', ['memorama', 'memoria', 'parejas', 'cartas'], 'juegos.html', false, 'memo'),
  qa('¿Cómo se juega a Dulces?', 'Cambia dos fichas vecinas para juntar 3 o más iguales y llegar a los puntos de la meta. Juntar 4 crea una ficha que limpia una fila o columna, y juntar 5 crea una estrella ⭐. El botón Barajar cuesta 1 movimiento.', ['dulces', 'fichas', 'combo', 'estrella', 'candy', 'match'], 'juegos.html', false, 'm3'),
  qa('¿Cómo funcionan las pistas del Ahorcado?', 'Cada palabra trae una pista escrita arriba y su número de letras. Si fallas 3 veces aparece una pista extra: con qué letra empieza. También hay un botón de letra extra que cuesta un globo.', ['ahorcado', 'pista', 'palabra', 'letras', 'globos'], 'juegos.html', true, 'hang'),
  qa('¿Cómo se juega a Snoopy dice?', 'Mira la secuencia de colores y sonidos y repítela en el mismo orden. Cada ronda añade un paso más y va más rápido. Si llegas a la ronda 8 ganas un premio.', ['snoopy dice', 'simon', 'secuencia', 'colores', 'ronda'], 'juegos.html', false, 'simon'),
  qa('¿Cómo se juega a Woodstock?', 'Toca a Woodstock 🐤 cuando aparezca en un agujero. La estrella ⭐ vale 3 puntos, pero si tocas a Snoopy 🐶 pierdes 2. Dura 30 segundos.', ['woodstock', 'atrapa', 'agujeros', 'topos', 'reflejos'], 'juegos.html', false, 'mole'),
  qa('¿Cómo se juega a Corazones?', 'Mueve a Snoopy para atrapar corazones ❤️ y galletas 🍪 (valen 2). Esquiva las tormentas 🌩️. Un globo 🎈 te da una vida extra. Empiezas con 3 vidas.', ['corazones', 'lluvia', 'atrapar', 'tormentas', 'vidas'], 'juegos.html', false, 'catch'),
  qa('¿Cómo se juega al Barón Rojo?', 'Mueve a Snoopy, que dispara solo. Derriba aviones, recoge galletas (triple disparo), corazones (vida extra) y estrellas (escudo). Cada 15 derribos aparece el jefe, el Barón Rojo.', ['baron rojo', 'aviones', 'jefe', 'disparar', 'avion'], 'juegos.html', false, 'ace'),
  qa('¿Cómo se juega a Conecta 4?', 'Suelta fichas en las columnas y junta 4 en línea, en horizontal, vertical o diagonal. Puedes jugar contra Woodstock en fácil o difícil, o de dos jugadores.', ['conecta 4', 'cuatro en linea', 'columnas', 'fichas'], 'juegos.html', false, 'c4'),
  qa('¿Cómo se juega al 2048?', 'Desliza el dedo o usa las flechas para juntar fichas iguales y sumarlas. Si llegas a la ficha 512 ganas un premio con vale, y a 2048 ganas un bono de galletas.', ['2048', 'numeros', 'deslizar', 'sumar'], 'juegos.html', false, 'g2048'),
  qa('¿Cómo se juega a Flappy Woodstock?', 'Toca la pantalla o pulsa espacio para que Woodstock aletee y pase entre los tubos sin chocar. Pasar 15 tubos da un premio.', ['flappy', 'tubos', 'volar', 'aletear', 'pajaro'], 'juegos.html', false, 'flap'),
  qa('¿Cómo se juega a Pac-Snoopy?', 'Come todas las bolitas del laberinto. Las galletas grandes 🍪 asustan a los fantasmas 8 segundos y puedes comértelos. Tienes 3 vidas y ganas una extra cada 150 puntos.', ['pac', 'pacman', 'fantasmas', 'laberinto', 'bolitas'], 'juegos.html', false, 'pac'),
  qa('¿Cómo se juega a la Aventura de Snoopy?', 'Corre y salta hasta la bandera 🏁. Aplasta a los bichos 🐢 saltándoles encima y recoge galletas: cada 20 te dan una vida. Tienes 5 vidas y ganas una más al superar cada nivel.', ['aventura', 'mario', 'saltar', 'plataformas', 'bandera', 'bichos'], 'juegos.html', false, 'mario'),
];

const settings = {
  assistantName: 'Snoopy',
  siteName: 'el Rincón de juegos',
  welcome: '¡{saludo}! Soy {nombre} 🐶 Puedo ayudarte con los juegos, las galletas, los premios y la tienda de vales. ¿Qué necesitas?',
  fallbackMessage: 'Todavía no tengo información sobre eso 😅 Prueba a preguntarlo de otra forma o elige una de estas opciones.',
  disabledMessage: 'El asistente está descansando por ahora. ¡Vuelve en un ratito!',
  enabled: true,
  aiEnabled: true,
  logConversations: true,
  retentionDays: 30,
  siteBase: '/',
  contactLink: '',
  contactText: 'Contactar',
  showFaqs: true,
  quickCount: 4,
  ollamaModel: '',
};

module.exports = { knowledge: knowledge.map((k, i) => ({ id: 'seed-' + (i + 1), ...k })), settings };

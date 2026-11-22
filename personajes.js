/* personajes.js — Cambia los emojis de los juegos por imágenes de tus personajes.
   - Si una imagen existe en img/personajes/, se usa. Si no existe, se sigue viendo el emoji de siempre.
   - Funciona en todos los juegos sin tocarlos: en los de casillas y botones (tres en raya, memorama, topos,
     ahorcado, Conecta 4, confeti, títulos…) y también en los de lienzo (corazones, aviones, Flappy, Pac-Snoopy, Aventura).
   - Para añadir un personaje nuevo, agrega una línea a PERSONAJES y pon la imagen en la carpeta.
   - Para comprobar qué imágenes se encontraron, abre la consola del navegador y escribe: personajes.estado() */
(() => {
  'use strict';

  /* ================= CONFIGURACIÓN ================= */
  const CARPETA = 'img/personajes/';          // carpeta donde van las imágenes, junto a juegos.html
  const EXTENSIONES = ['png', 'webp'];        // formatos que se buscan, por orden
  const PERSONAJES = [
    /* archivo = nombre del archivo sin extensión · emojis = qué emojis reemplaza */
    { archivo: 'snoopypng', emojis: ['🐶'] },
    { archivo: 'woodstock', emojis: ['🐤'] },
    { archivo: 'galleta',   emojis: ['🍪'] },
    { archivo: 'globo',     emojis: ['🎈'] },
    { archivo: 'corazon',   emojis: ['❤️'] },
    { archivo: 'estrella',  emojis: ['⭐'] },
    /* Ejemplos para añadir más:
       { archivo: 'baron-rojo', emojis: ['🛩️'] },
       { archivo: 'casita',     emojis: ['🏠'] }, */
  ];
  const TAMANO_LIENZO = 192;                  // las imágenes más grandes se reducen para los juegos de lienzo (más rápido)

  /* ================= PREPARACIÓN ================= */
  const quitaVS = texto => String(texto).replace(/\uFE0F/g, '');          // el emoji ❤️ lleva un carácter invisible; se ignora
  const escapa = texto => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const fichas = new Map();     // archivo → { archivo, listo, url, img, lienzo }
  const porEmoji = new Map();   // emoji sin carácter invisible → ficha
  for (const p of PERSONAJES) {
    const ficha = { archivo: p.archivo, listo: false, url: '', img: null, lienzo: null };
    fichas.set(p.archivo, ficha);
    for (const e of p.emojis) porEmoji.set(quitaVS(e), ficha);
  }
  if (!porEmoji.size) return;

  const patron = [...porEmoji.keys()].sort((a, b) => b.length - a.length).map(k => escapa(k) + '\uFE0F?').join('|');
  const pruebaRe = new RegExp(patron);
  const EXCLUIR = 'script,style,textarea,option,select,title,canvas,.pj,[data-sin-personajes]';

  const estilo = document.createElement('style');
  estilo.textContent =
    '.pj{display:inline-block;position:relative;width:1.15em;height:1.15em;vertical-align:-.22em;line-height:1;pointer-events:none}' +
    '.pj *{pointer-events:none}' +   // los toques los recibe el botón o la casilla, igual que con el emoji
    '.pj img{display:block;width:100%;height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none}' +
    '.pj-t{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}';   // el emoji queda como texto oculto: lectores de pantalla y lógica de los juegos lo siguen leyendo
  document.head.append(estilo);

  /* ================= CASILLAS Y BOTONES (texto → imagen) ================= */
  function creaImagen(ficha, emoji) {
    const caja = document.createElement('span');
    caja.className = 'pj';
    const img = new Image();
    img.src = ficha.url; img.alt = ''; img.decoding = 'async'; img.draggable = false;
    const texto = document.createElement('span');
    texto.className = 'pj-t'; texto.textContent = emoji;
    caja.append(img, texto);
    return caja;
  }

  function cambiaTexto(nodo) {
    const texto = nodo.nodeValue;
    if (!texto || !pruebaRe.test(texto)) return;
    const padre = nodo.parentElement;
    if (!padre || padre.closest(EXCLUIR)) return;
    const trozos = document.createDocumentFragment();
    let ultimo = 0, hubo = false;
    for (const m of texto.matchAll(new RegExp(patron, 'g'))) {
      const ficha = porEmoji.get(quitaVS(m[0]));
      if (!ficha || !ficha.listo) continue;           // sin imagen: se deja el emoji
      if (m.index > ultimo) trozos.append(texto.slice(ultimo, m.index));
      trozos.append(creaImagen(ficha, m[0]));
      ultimo = m.index + m[0].length; hubo = true;
    }
    if (!hubo) return;
    if (ultimo < texto.length) trozos.append(texto.slice(ultimo));
    nodo.replaceWith(trozos);
  }

  function recorre(nodo) {
    if (nodo.nodeType === 3) return cambiaTexto(nodo);
    if (nodo.nodeType !== 1 || nodo.closest('.pj')) return;
    const andador = document.createTreeWalker(nodo, NodeFilter.SHOW_TEXT);
    const textos = [];
    while (andador.nextNode()) textos.push(andador.currentNode);   // primero se reúnen y luego se cambian
    textos.forEach(cambiaTexto);
  }

  /* Los juegos repintan su contenido todo el rato: se vigila y se cambian solo los nodos nuevos, agrupados por cuadro */
  let pendientes = new Set(), cuadro = 0;
  const observador = new MutationObserver(cambios => {
    for (const c of cambios) {
      if (c.type === 'characterData') pendientes.add(c.target);
      else c.addedNodes.forEach(n => pendientes.add(n));
    }
    if (pendientes.size && !cuadro) cuadro = requestAnimationFrame(procesa);
  });
  const observa = () => observador.observe(document.body, { childList: true, subtree: true, characterData: true });
  function procesa() {
    cuadro = 0;
    const lote = pendientes; pendientes = new Set();
    observador.disconnect();                          // no vigilar los cambios que hacemos nosotros mismos
    try { for (const n of lote) if (n.isConnected) recorre(n); } finally { observa(); }
  }
  const revisaTodo = () => { pendientes.add(document.body); if (!cuadro) cuadro = requestAnimationFrame(procesa); };

  /* ================= LIENZOS (fillText → drawImage) ================= */
  const fillTextOriginal = CanvasRenderingContext2D.prototype.fillText;

  function dibujaEnLienzo(ctx, ficha, x, y) {
    const px = parseFloat((/(\d+(?:\.\d+)?)px/.exec(ctx.font) || [])[1]) || 24;
    const lado = px * 1.15;
    let cx = x, cy = y;
    switch (ctx.textAlign) { case 'center': break; case 'right': case 'end': cx = x - lado / 2; break; default: cx = x + lado / 2; }
    switch (ctx.textBaseline) {
      case 'middle': break;
      case 'top': case 'hanging': cy = y + lado / 2; break;
      case 'bottom': cy = y - lado / 2; break;
      default: cy = y - px * 0.38;                    // línea base normal: el emoji queda sobre ella
    }
    const fuente = ficha.lienzo || ficha.img;
    const w = fuente.width || fuente.naturalWidth, h = fuente.height || fuente.naturalHeight;
    if (!w || !h) return false;
    const k = Math.min(lado / w, lado / h);
    ctx.drawImage(fuente, cx - (w * k) / 2, cy - (h * k) / 2, w * k, h * k);
    return true;
  }

  CanvasRenderingContext2D.prototype.fillText = function (texto, x, y, ...resto) {
    if (typeof texto === 'string') {
      const ficha = porEmoji.get(quitaVS(texto));
      if (ficha && ficha.listo) {
        try { if (dibujaEnLienzo(this, ficha, x, y)) return; } catch { /* si algo falla, se dibuja el emoji */ }
      }
    }
    return fillTextOriginal.call(this, texto, x, y, ...resto);
  };

  /* ================= CARGA DE IMÁGENES ================= */
  function reduce(img) {
    const w = img.naturalWidth, h = img.naturalHeight, mayor = Math.max(w, h);
    if (!mayor || mayor <= TAMANO_LIENZO) return img;
    const k = TAMANO_LIENZO / mayor, c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  let intentos = fichas.size;
  function cargaFicha(ficha, i = 0) {
    if (i >= EXTENSIONES.length) { if (--intentos === 0) resumen(); return; }
    const url = `${CARPETA}${ficha.archivo}.${EXTENSIONES[i]}`;
    const img = new Image();
    img.onload = () => {
      ficha.img = img; ficha.url = url; ficha.lienzo = reduce(img); ficha.listo = true;
      revisaTodo();
      if (--intentos === 0) resumen();
    };
    img.onerror = () => cargaFicha(ficha, i + 1);
    img.src = url;
  }

  const encontradas = () => [...fichas.values()].filter(f => f.listo).map(f => f.archivo);
  function resumen() {
    const lista = encontradas();
    if (lista.length) console.info(`[personajes] imágenes encontradas: ${lista.join(', ')}`);
  }

  window.personajes = {
    /* Muestra una tabla con cada personaje y si su imagen se encontró */
    estado() {
      console.table(PERSONAJES.map(p => ({
        archivo: p.archivo, emojis: p.emojis.join(' '),
        imagen: fichas.get(p.archivo).listo ? fichas.get(p.archivo).url : `falta ${CARPETA}${p.archivo}.${EXTENSIONES.join(' o .')}`
      })));
    }
  };

  observa();
  for (const ficha of fichas.values()) cargaFicha(ficha);
})();

/* juegos-extras.js — Pausa real, pantalla completa y partidas guardadas
   para los juegos de lienzo: Pac-Snoopy, La aventura, Barón Rojo, Lluvia de corazones y Flappy Woodstock.

   - Al cambiar de pestaña (dentro de la página o del navegador) el juego se PAUSA en vez de terminar. Al volver, sigue donde iba.
   - Botones «⏸ Pausa» y «⛶ Pantalla completa» junto a «Jugar». Teclas: P = pausa, F = pantalla completa.
   - Si empiezas otra partida o cierras la página con una a medias, se guardan tu marca y tus galletas.
   - No cambia la lógica de los juegos: usa sus variables y funciones. Para quitarlo, borra su línea <script> del HTML. */
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const h = (tag, props = {}, ...hijos) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    el.append(...hijos.flat().filter(x => x != null));
    return el;
  };

  /* ================= LOS JUEGOS ================= */
  /* estado/bucle: variables y funciones de cada juego · mejor: dónde guarda su marca ·
     galletas: lo que da al terminar (igual que el propio juego) · resto: alto que ocupan los botones al ir a pantalla completa */
  const JUEGOS = {
    pac:     { estado: () => pac,   bucle: () => pacLoop,   mejor: 'snoopy-pac-best',   galletas: p => p / 12,  resto: 260 },
    mario:   { estado: () => mario, bucle: () => marioLoop, mejor: 'snoopy-mario-best', galletas: p => p / 3,   resto: 190 },
    ace:     { estado: () => ace,   bucle: () => aceLoop,   mejor: 'snoopy-ace-best',   galletas: p => p / 5,   resto: 120 },
    'catch': { estado: () => cg,    bucle: () => catchLoop, mejor: 'snoopy-catch-best', galletas: p => p / 3,   resto: 120 },
    flap:    { estado: () => fl,    bucle: () => flLoop,    mejor: 'snoopy-flap-best',  galletas: p => p * 1.5, resto: 120 },
  };
  for (const [id, j] of Object.entries(JUEGOS)) {
    j.panel = $(`#${id}-panel`); j.cv = $(`#${id}-canvas`); j.inicio = $(`#${id}-start`);
    if (!j.panel || !j.cv) delete JUEGOS[id];        // si falta alguno en la página, se ignora
  }

  const pausado = new Set();      // juegos en pausa
  const tPausa = {};              // cuándo se pausó cada uno
  const ids = () => Object.keys(JUEGOS);
  const enCurso = id => { try { return Boolean(JUEGOS[id].estado().running); } catch { return false; } };
  const visible = () => ids().find(id => !JUEGOS[id].panel.hidden) || null;

  /* ================= ESTILOS ================= */
  const estilo = document.createElement('style');
  estilo.textContent = `
    .pc-btn:disabled { opacity: .45; cursor: default; }
    .pc-on { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 6px; box-sizing: border-box; margin: 0; padding: 8px; overflow: auto; border: 0; border-radius: 0; box-shadow: none; background: var(--bg, #fff4ea); }
    .pc-on[hidden] { display: none; }
    .pc-on > h2, .pc-on > .rules, .pc-on > .score { display: none; }
    .pc-on .bar { margin-bottom: 0; }
    .pc-on canvas { width: min(calc(100vw - 16px), calc((100vh - var(--pc-resto, 150px)) * var(--ar, .8))) !important; height: auto !important; max-width: none !important; }
    @supports (height: 100dvh) { .pc-on canvas { width: min(calc(100vw - 16px), calc((100dvh - var(--pc-resto, 150px)) * var(--ar, .8))) !important; } }
    html.pc-lock, html.pc-lock body { overflow: hidden !important; }
  `;
  document.head.append(estilo);

  /* ================= PAUSA ================= */
  function dibujaPausa(id) {
    const j = JUEGOS[id], c = j.cv, x = c.getContext('2d'), w = c.width, alto = c.height;
    if (!j.foto) return;
    x.clearRect(0, 0, w, alto);
    x.drawImage(j.foto, 0, 0);                         // el último cuadro del juego, sin acumular capas
    x.save();
    x.fillStyle = 'rgba(59,58,74,.62)'; x.fillRect(0, 0, w, alto);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '700 30px Poppins, sans-serif'; x.fillText('Pausa', w / 2, alto / 2 - 16);
    x.font = '600 14px Poppins, sans-serif'; x.fillText('Toca aquí o pulsa P para seguir', w / 2, alto / 2 + 18);
    x.restore();
  }

  function pausa(id) {
    if (!JUEGOS[id] || !enCurso(id)) return false;
    const j = JUEGOS[id];
    j.estado().running = false;                        // el bucle del juego se detiene solo, sin dar la partida por terminada
    pausado.add(id); tPausa[id] = performance.now();
    j.foto = document.createElement('canvas'); j.foto.width = j.cv.width; j.foto.height = j.cv.height;
    j.foto.getContext('2d').drawImage(j.cv, 0, 0);
    dibujaPausa(id); pinta();
    return true;
  }

  function sigue(id) {
    if (!pausado.has(id)) return;
    const j = JUEGOS[id], espera = Math.max(0, 50 - (performance.now() - (tPausa[id] || 0)));   // deja morir el cuadro que ya estaba programado
    setTimeout(() => {
      if (!pausado.has(id)) return;                    // mientras tanto empezó otra partida
      pausado.delete(id); j.foto = null;
      const s = j.estado(); s.running = true; s.last = performance.now();
      requestAnimationFrame(j.bucle());
      pinta();
    }, espera);
  }

  const alterna = id => (pausado.has(id) ? sigue(id) : pausa(id));

  /* ================= GUARDAR LA PARTIDA A MEDIAS ================= */
  /* Igual que cuando el juego termina: guarda la marca si es récord y da las galletas. */
  function cierra(id, aviso) {
    const j = JUEGOS[id]; let s;
    try { s = j.estado(); } catch { return; }
    if (!s || !(s.running || pausado.has(id))) return;
    s.running = false; pausado.delete(id); j.foto = null;
    const puntos = Math.round(Number(s.score) || 0);
    if (puntos <= 0) return;
    try {
      const record = puntos > store.get(j.mejor, 0);
      if (record) store.set(j.mejor, puntos);
      if (id === 'pac' && puntos >= 300) unlock('pac-300');
      const galletas = Math.round(j.galletas(puntos));
      earn(galletas, true);
      if (aviso) toast(`💾 Partida anterior guardada: ${puntos} puntos${record ? ' (¡récord!)' : ''}${galletas > 0 ? ` · +${galletas} 🍪` : ''}`);
    } catch { /* si algo falla, no se molesta al jugador */ }
  }

  /* ================= PANTALLA COMPLETA ================= */
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  let falso = null;       // juego en pantalla completa "simulada" (iPhone y navegadores sin la función)

  const bloqueaPagina = on => document.documentElement.classList.toggle('pc-lock', on);
  function limpiaPantalla() {
    for (const id of ids()) JUEGOS[id].panel.classList.remove('pc-on');
    falso = null; bloqueaPagina(false);
    try { screen.orientation.unlock(); } catch { /* no disponible */ }
  }
  function salirPantalla() {
    const salir = document.exitFullscreen || document.webkitExitFullscreen;
    if (fsEl() && salir) { try { Promise.resolve(salir.call(document)).catch(() => {}); } catch { /* ya no estaba */ } }
    limpiaPantalla(); pinta();
  }
  function pantalla(id) {
    const j = JUEGOS[id];
    if (j.panel.classList.contains('pc-on')) return salirPantalla();
    j.cv.style.setProperty('--ar', String(j.cv.width / j.cv.height));      // el lienzo conserva su proporción al agrandarse
    j.panel.style.setProperty('--pc-resto', j.resto + 'px');
    j.panel.classList.add('pc-on');
    const pedir = j.panel.requestFullscreen || j.panel.webkitRequestFullscreen;
    const simulada = () => { falso = id; bloqueaPagina(true); };
    if (!pedir) simulada();
    else {
      Promise.resolve().then(() => pedir.call(j.panel))
        .then(() => {
          /* La aventura se ve mejor en horizontal (solo funciona en algunos móviles Android) */
          if (j.cv.width > j.cv.height && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
        })
        .catch(simulada);                              // si el navegador no lo permite, se simula
    }
    pinta();
  }
  for (const evento of ['fullscreenchange', 'webkitfullscreenchange']) {
    document.addEventListener(evento, () => { if (!fsEl() && !falso) { limpiaPantalla(); pinta(); } });
  }

  /* ================= BOTONES ================= */
  for (const [id, j] of Object.entries(JUEGOS)) {
    const barra = j.panel.querySelector('.bar') || j.cv.insertAdjacentElement('beforebegin', h('div', { class: 'bar' }));
    j.bPausa = h('button', { class: 'tool pc-btn', type: 'button', title: 'Pausar o seguir (tecla P)', onclick: () => alterna(id) }, '⏸ Pausa');
    j.bPantalla = h('button', { class: 'tool pc-btn', type: 'button', title: 'Pantalla completa (tecla F)', onclick: () => pantalla(id) }, '⛶ Pantalla completa');
    barra.append(j.bPausa, j.bPantalla);

    j.cv.addEventListener('click', () => { if (pausado.has(id)) sigue(id); });          // tocar el juego en pausa lo reanuda
    for (const tipo of ['pointermove', 'pointerdown']) {
      /* Barón Rojo y Corazones repintan al mover el dedo o el ratón: se vuelve a poner el cartel de pausa */
      j.cv.addEventListener(tipo, () => { if (pausado.has(id)) dibujaPausa(id); });
    }
    /* Al pulsar «Jugar» con una partida a medias, esa partida se guarda antes de empezar la nueva */
    j.panel.addEventListener('click', e => { if (j.inicio && e.target.closest && e.target.closest('#' + j.inicio.id)) cierra(id, true); }, true);
  }

  function pinta() {
    for (const id of ids()) {
      const j = JUEGOS[id], enPausa = pausado.has(id);
      j.bPausa.textContent = enPausa ? '▶ Seguir' : '⏸ Pausa';
      j.bPausa.disabled = !(enPausa || enCurso(id));
      j.bPantalla.textContent = j.panel.classList.contains('pc-on') ? '✕ Salir de pantalla completa' : '⛶ Pantalla completa';
    }
  }
  setInterval(pinta, 300);
  pinta();

  /* ================= CUÁNDO SE PAUSA Y SE GUARDA ================= */
  /* Al cambiar de pestaña de la página: se pausa ANTES de que el juego oculte su panel (si no, daría la partida por perdida) */
  document.addEventListener('click', e => {
    const pestana = e.target.closest && e.target.closest('.tabs button');
    if (!pestana) return;
    for (const id of ids()) if (pestana.dataset.tab !== id) pausa(id);
  }, true);

  /* Al cambiar de pestaña del navegador o minimizar */
  document.addEventListener('visibilitychange', () => { if (document.hidden) ids().forEach(pausa); });

  /* Al cerrar o recargar la página con una partida a medias (si la página puede volver con el botón atrás, no se toca) */
  addEventListener('pagehide', e => { if (!e.persisted) ids().forEach(id => cierra(id, false)); });

  /* Teclas: P = pausa · F = pantalla completa · Esc sale de la pantalla completa simulada */
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || '')) return;
    const id = visible();
    if (e.key === 'Escape' && falso) { salirPantalla(); return; }
    if (!id) return;
    const tecla = e.key.toLowerCase();
    if (tecla === 'p') { e.preventDefault(); alterna(id); }
    else if (tecla === 'f') { e.preventDefault(); pantalla(id); }
  });
})();
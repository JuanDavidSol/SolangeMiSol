/* =====================================================================
   Tema "Tiras de Snoopy" para el Rincón de juegos
   Solo decora y reacciona: NO toca la lógica de los juegos.
   Para quitarlo: borra la línea <script ... snoopy-tema.js> del HTML.

   Modelo 3D (opcional): pon tu archivo en  img/snoopy.glb  y se mostrará
   en lugar de la imagen, girando con el dedo o el mouse. Si no existe,
   no pasa nada. Para otra ruta, define antes de este script:
   <script>window.SNOOPY_MODELO_3D = 'img/otro-nombre.glb'</script>
   ===================================================================== */
(() => {
  'use strict';

  const MODELO_3D = window.SNOOPY_MODELO_3D || 'img/snoopy.glb';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (selector, root = document) => root.querySelector(selector);
  const make = (tag, className, html) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html) node.innerHTML = html;          // solo texto/SVG escrito aquí, nunca de visitantes
    return node;
  };
  const pick = list => list[Math.floor(Math.random() * list.length)];

  const wrap = $('.wrap');
  const header = $('header');
  if (!wrap || !header) return;

  /* ---------- 1. Fondo que flota: corazones, estrellas y avioncitos ---------- */
  function ambient() {
    if (reduce) return;

    const layer = make('div', 'sn-layer');
    layer.setAttribute('aria-hidden', 'true');

    const plane = '<svg viewBox="0 0 40 28"><path d="M2 14 38 2 28 26 20 17z" fill="#fff" stroke="#3b3a4a" stroke-width="2" stroke-linejoin="round"/><path d="M20 17 38 2" stroke="#3b3a4a" stroke-width="2"/></svg>';
    const kinds = [
      ['sn-amb sn-heart', '♥'],
      ['sn-amb sn-star', '✦'],
      ['sn-amb sn-plane', plane]
    ];

    const total = innerWidth < 600 ? 8 : 14;

    for (let i = 0; i < total; i++) {
      const [className, html] = pick(kinds);
      const item = make('span', className, html);

      item.style.cssText = [
        `left:${(Math.random() * 100).toFixed(1)}%`,
        `font-size:${(12 + Math.random() * 18).toFixed(0)}px`,
        `--dx:${Math.round(Math.random() * 160 - 80)}px`,
        `--rot:${Math.round(Math.random() * 360 - 180)}deg`,
        `animation-duration:${(18 + Math.random() * 20).toFixed(1)}s`,
        `animation-delay:-${(Math.random() * 30).toFixed(1)}s`
      ].join(';');

      layer.append(item);
    }

    document.body.prepend(layer);
  }

  /* ---------- 2. Snoopy habla: el subtítulo del encabezado hace de globo ---------- */
  const sub = $('p', header);
  const subOriginal = sub ? sub.textContent : '';
  let sayTimer;

  function say(text, ms = 5500) {
    if (!sub) return;
    sub.textContent = text;
    sub.classList.add('sn-say');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => {
      sub.textContent = subOriginal;
      sub.classList.remove('sn-say');
    }, ms);
  }

  const PLATICA = [
    '¡Hola, preciosa! ♡',
    'Hoy te toca ganar 🍪',
    'Respira, vas increíble ✨',
    'Te mando un abrazo gigante 🤗',
    '¿Jugamos otra? 🐾',
    'Eres mi persona favorita ♡'
  ];

  const POR_JUEGO = {
    ttt: 'Tres en línea y gana el corazón ♡',
    sudoku: 'Con calma, un número a la vez 🏠',
    memo: '¡Yo recuerdo dónde estaba cada una! 🎈',
    m3: 'Dulces, galletas y mucha dulzura 🍪',
    hang: '¡Cuidemos esos globos! 🎈',
    simon: 'Escucha bien… y repite 🎵',
    mole: '¡Woodstock se esconde rápido! 🐤',
    catch: 'Atrapa todos los corazones ❤️',
    ace: '¡Despegamos! ✈️',
    c4: 'Cuatro en línea, ¡tú puedes!',
    g2048: 'Junta, junta, junta… 🔢',
    flap: 'Aletea con ritmo 🐤',
    pac: '¡Cuidado con los fantasmas! 👻',
    mario: '¡A correr y a saltar! 🏁',
    shop: '¿Qué vale te llevas hoy? 🛍️',
    rewards: '¡Mira todo lo que has ganado! 🏆'
  };

  /* ---------- 3. La mascota: flota, mira al mouse y reacciona ---------- */
  const stage = make('div', 'sn-stage');
  const mascotFirst = $('.mascot', header);

  if (mascotFirst) {
    mascotFirst.replaceWith(stage);
    stage.append(mascotFirst);
  } else {
    header.prepend(stage);
  }

  stage.tabIndex = 0;
  stage.setAttribute('role', 'button');
  stage.setAttribute('aria-label', 'Saludar a Snoopy');

  const mascot = () => $('.mascot', stage);

  function hop() {
    stage.classList.remove('sn-hop');
    void stage.offsetWidth;                   // reinicia la animación
    stage.classList.add('sn-hop');
  }
  stage.addEventListener('animationend', event => {
    if (event.animationName === 'sn-hop') stage.classList.remove('sn-hop');
  });

  function burst(count = 7) {
    if (reduce) return;
    const box = stage.getBoundingClientRect();

    for (let i = 0; i < count; i++) {
      const heart = make('span', 'sn-burst', '♥');
      const angle = (Math.PI * 2 * i) / count + Math.random() * .6;
      const distance = 40 + Math.random() * 40;

      heart.style.cssText = [
        `left:${box.left + box.width / 2}px`,
        `top:${box.top + box.height / 2}px`,
        `--bx:${(Math.cos(angle) * distance).toFixed(0)}px`,
        `--by:${(Math.sin(angle) * distance - 20).toFixed(0)}px`
      ].join(';');

      document.body.append(heart);
      setTimeout(() => heart.remove(), 900);
    }
  }

  function greet() {
    hop();
    burst();
    say(pick(PLATICA));
  }

  stage.addEventListener('click', greet);
  stage.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      greet();
    }
  });

  /* Efecto 3D: la mascota gira suavemente hacia donde mueves el mouse o el dedo */
  let tiltFrame = 0;

  addEventListener('pointermove', event => {
    if (reduce || tiltFrame) return;

    tiltFrame = requestAnimationFrame(() => {
      tiltFrame = 0;
      const node = mascot();
      if (!node) return;

      const x = event.clientX / innerWidth - .5;
      const y = event.clientY / innerHeight - .5;
      node.style.setProperty('--rx', (-y * 16).toFixed(1) + 'deg');
      node.style.setProperty('--ry', (x * 22).toFixed(1) + 'deg');
    });
  }, { passive: true });

  /* Un comentario al cambiar de juego */
  const tabs = $('.tabs');
  if (tabs) {
    tabs.addEventListener('click', event => {
      const button = event.target.closest('[data-tab]');
      if (button && POR_JUEGO[button.dataset.tab]) say(POR_JUEGO[button.dataset.tab]);
    });
  }

  /* ---------- 4. Reacciona a los premios (confeti) y a las galletas ---------- */
  let lastParty = 0;

  new MutationObserver(changes => {
    for (const change of changes) {
      for (const node of change.addedNodes) {
        if (node.nodeType === 1 && node.classList.contains('conf') && Date.now() - lastParty > 3000) {
          lastParty = Date.now();
          hop();
          burst(10);
          say('¡Lo lograste! 🎉 Eres increíble ♡', 7000);
        }
      }
    }
  }).observe(document.body, { childList: true });

  function floatText(text, anchor) {
    if (reduce) return;
    const box = anchor.getBoundingClientRect();
    const node = make('span', 'sn-float');

    node.textContent = text;
    node.style.left = box.left + box.width / 2 + 'px';
    node.style.top = box.top + 'px';
    document.body.append(node);
    setTimeout(() => node.remove(), 1000);
  }

  const coins = $('#coins');

  if (coins) {
    const read = () => parseInt(coins.textContent.replace(/\D/g, ''), 10) || 0;
    let last = read();
    let lastFloat = 0;

    new MutationObserver(() => {
      const now = read();

      if (now > last && Date.now() - lastFloat > 250) {
        lastFloat = Date.now();
        floatText(`+${now - last} 🍪`, coins);
      }

      last = now;
    }).observe(coins, { childList: true, characterData: true, subtree: true });
  }

  /* ---------- 5. Modelo 3D propio (solo si existe el archivo) ---------- */
  async function modelo3d() {
    try {
      const response = await fetch(MODELO_3D, { cache: 'force-cache' });
      if (!response.ok) return;
      response.body?.cancel();

      await import('https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js');

      const viewer = make('model-viewer', 'sn-3d mascot');
      viewer.setAttribute('src', MODELO_3D);
      viewer.setAttribute('alt', 'Snoopy en 3D: arrástralo para girarlo');
      viewer.setAttribute('camera-controls', '');
      viewer.setAttribute('auto-rotate', '');
      viewer.setAttribute('disable-zoom', '');
      viewer.setAttribute('interaction-prompt', 'none');
      viewer.setAttribute('shadow-intensity', '1');

      const actual = mascot();
      if (actual) actual.replaceWith(viewer);
      else stage.append(viewer);
    } catch {
      /* Sin modelo o sin internet: se queda la imagen de siempre */
    }
  }

  /* ---------- 6. Pie con la casita roja ---------- */
  function casita() {
    const foot = make('div', 'sn-casita', `
      <svg viewBox="0 0 120 100" aria-hidden="true">
        <path d="M10 48 60 10l50 38z" fill="#e8505b" stroke="#3b3a4a" stroke-width="4" stroke-linejoin="round"/>
        <rect x="20" y="48" width="80" height="44" rx="4" fill="#fff" stroke="#3b3a4a" stroke-width="4"/>
        <path d="M46 92V68a14 14 0 0 1 28 0v24z" fill="#3b3a4a"/>
        <circle cx="60" cy="31" r="5" fill="#fff" stroke="#3b3a4a" stroke-width="3"/>
        <path d="M2 94h116" stroke="#3b3a4a" stroke-width="4" stroke-linecap="round"/>
      </svg>
      <b>Hecho con mucho cariño ♡</b>
      Un ratito de juegos, un montón de ternura ✨
    `);
    wrap.append(foot);
  }

  /* ---------- Arranque ---------- */
  ambient();
  casita();
  modelo3d();

  const hora = new Date().getHours();
  setTimeout(() => say(
    hora < 6 ? '¡Qué desvelo! Juguemos bajito 🌙'
      : hora < 12 ? '¡Buenos días, preciosa! ☀️'
      : hora < 19 ? '¡Buenas tardes! ¿Jugamos? 🌷'
      : '¡Buenas noches! Un ratito más ✨'
  ), 700);
})();

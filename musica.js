/* musica.js — Música de fondo para juegos.html
   Es independiente de los efectos de sonido: NO toca SFX, sfx() ni el botón #mute. Solo añade dos controles a su lado.
   - Botón 🎵 para reproducir / pausar y barra de volumen (se muestra solo cuando la música está activada).
   - Recuerda si estaba activada y el volumen (localStorage). Nunca arranca sola: espera al primer toque o tecla.
   - Música: si existe el archivo audio/musica.mp3 se usa; si no, la propia página genera una melodía suave y tranquila. */
(() => {
  'use strict';

  /* ================= CONFIGURACIÓN ================= */
  const RUTA_ARCHIVO = 'audio/musica.mp3';   // opcional (ver instrucciones). Si no existe, suena la música generada
  const CLAVE = 'snoopy-musica';             // nombre con el que se guardan las preferencias
  const VOLUMEN_INICIAL = 50;                // 0 a 100, la primera vez

  const mute = document.getElementById('mute');
  if (!mute) { console.warn('[musica] No se encontró el botón #mute: no se añadió la música.'); return; }

  /* ================= PREFERENCIAS ================= */
  const pref = { on: false, vol: VOLUMEN_INICIAL };
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (g && typeof g === 'object') {
      pref.on = g.on === true;
      const v = Number(g.vol);
      if (Number.isFinite(v)) pref.vol = Math.min(100, Math.max(0, Math.round(v)));
    }
  } catch { /* sin almacenamiento: se usan los valores iniciales */ }
  const guarda = () => { try { localStorage.setItem(CLAVE, JSON.stringify(pref)); } catch { /* ignorar */ } };

  const curva = () => Math.pow(pref.vol / 100, 2);   // curva suave: el volumen medio no resulta fuerte
  const nivelArchivo = () => curva();
  const nivelGenerada = () => 1.6 * curva();

  /* ================= MÚSICA GENERADA (sin archivos) =================
     Acordes suaves (Do maj7 – La m7 – Re m7 – Sol 7 …), arpegios tipo caja de música y notas sueltas con eco. Original, sin derechos de terceros. */
  let ctx = null, master = null, bus = null, timer = 0, proximo = 0, compas = 0, genActiva = false;
  const TIEMPO = 60 / 64;                                          // 64 pulsos por minuto: tranquilo
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const ACORDES = [
    { bajo: 48, notas: [60, 64, 67, 71] },   // Do mayor 7
    { bajo: 45, notas: [60, 64, 67, 69] },   // La menor 7
    { bajo: 50, notas: [60, 62, 65, 69] },   // Re menor 7
    { bajo: 43, notas: [59, 62, 65, 67] },   // Sol 7
    { bajo: 48, notas: [60, 64, 67, 71] },   // Do mayor 7
    { bajo: 40, notas: [59, 62, 64, 67] },   // Mi menor 7
    { bajo: 41, notas: [57, 60, 64, 65] },   // Fa mayor 7
    { bajo: 43, notas: [59, 62, 65, 67] },   // Sol 7
  ];
  const PATRON = [0, 1, 2, 3, 2, 1, 2, 1];   // orden del arpegio dentro de cada compás

  function prepara() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0;
      bus = ctx.createGain();
      const retardo = ctx.createDelay(1); retardo.delayTime.value = TIEMPO * 0.75;
      const filtro = ctx.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 2200;
      const realimenta = ctx.createGain(); realimenta.gain.value = 0.32;
      const eco = ctx.createGain(); eco.gain.value = 0.55;
      bus.connect(master);                                          // sonido directo
      bus.connect(retardo); retardo.connect(filtro);                // eco suave
      filtro.connect(realimenta); realimenta.connect(retardo);
      filtro.connect(eco); eco.connect(master);
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();                    // se llama dentro del toque del usuario (necesario en iPhone)
    return true;
  }

  function voz(f, t, dur, tipo, vol, ataque) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = tipo; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  const campana = (m, t, dur, vol) => { voz(hz(m), t, dur, 'sine', vol, 0.008); voz(hz(m) * 2, t, dur * 0.5, 'sine', vol * 0.35, 0.005); };

  function programaCompas(t0, a) {
    const n = a.notas;
    n.forEach(m => voz(hz(m - 12), t0, TIEMPO * 4.2, 'sine', 0.032, 1.1));      // base de acordes, entra despacio
    voz(hz(a.bajo), t0, TIEMPO * 3, 'sine', 0.09, 0.03);                         // nota grave
    voz(hz(a.bajo), t0 + TIEMPO * 2, TIEMPO * 1.8, 'sine', 0.055, 0.03);
    PATRON.forEach((p, i) => {                                                   // arpegio de caja de música
      if (Math.random() < 0.2) return;                                           // algunos huecos para que respire
      const t = t0 + i * (TIEMPO / 2) + (Math.random() - 0.5) * 0.016;
      voz(hz(n[p]), t, TIEMPO * 1.5, 'triangle', 0.045, 0.012);
      voz(hz(n[p]) * 2, t, TIEMPO * 0.6, 'sine', 0.012, 0.006);
    });
    [0, 1.5, 2, 3].forEach(b => {                                                // notas sueltas agudas, a veces
      if (Math.random() < 0.55) return;
      campana(n[Math.floor(Math.random() * n.length)] + 12, t0 + b * TIEMPO, TIEMPO * 2.4, 0.05);
    });
  }

  function programa() {
    if (!ctx || !genActiva) return;
    while (proximo < ctx.currentTime + 1.5) {
      programaCompas(proximo, ACORDES[compas % ACORDES.length]);
      proximo += 4 * TIEMPO; compas++;
    }
  }

  function arrancaGenerada() {
    if (!prepara()) return;
    genActiva = true;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(nivelGenerada(), ctx.currentTime, 0.4);          // entra suavemente
    proximo = Math.max(proximo, ctx.currentTime + 0.1);                          // si venía de una pausa, continúa donde iba
    clearInterval(timer); timer = setInterval(programa, 400); programa();
  }

  function paraGenerada() {
    if (!ctx) return;
    genActiva = false; clearInterval(timer); timer = 0;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.12);                       // se apaga suavemente
    const c = ctx;
    setTimeout(() => { if (!genActiva && c.state === 'running') c.suspend(); }, 700);
  }

  /* ================= REPRODUCCIÓN (archivo o música generada) ================= */
  let el = null, modo = null, archivoNoSirve = false, suena = false;

  function motorOn() {
    prepara();
    if (archivoNoSirve) return arrancaGenerada();
    if (!el) { el = new Audio(RUTA_ARCHIVO); el.loop = true; el.preload = 'none'; }
    el.volume = nivelArchivo();
    el.play().then(() => {
      modo = 'archivo';
      if (!suena || document.hidden) el.pause();
      else if (ctx && ctx.state === 'running') ctx.suspend();                    // el motor generado no hace falta
    }).catch(err => {
      if (err && err.name === 'AbortError') return;                              // se pausó mientras cargaba: no es un fallo
      archivoNoSirve = true; modo = 'generada';                                  // no hay archivo (o no se puede leer): música generada
      if (suena && !document.hidden) arrancaGenerada();
    });
  }
  function motorOff() { if (el) el.pause(); paraGenerada(); }
  function aplicaVolumen() {
    if (el) el.volume = nivelArchivo();
    if (ctx && master && genActiva) master.gain.setTargetAtTime(nivelGenerada(), ctx.currentTime, 0.05);
  }
  const inicia = () => { suena = true; motorOn(); };
  const para = () => { suena = false; motorOff(); };

  /* Al cambiar de pestaña del navegador o minimizar, se pausa; al volver, continúa */
  document.addEventListener('visibilitychange', () => {
    if (!suena) return;
    if (document.hidden) motorOff(); else motorOn();
  });

  /* ================= CONTROLES ================= */
  const estilo = document.createElement('style');
  estilo.textContent =
    '.mus{display:inline-flex;align-items:center;gap:6px;vertical-align:middle}' +
    '.mus-btn[aria-pressed="false"]{opacity:.6}' +
    '.mus-vol{width:72px;height:20px;margin:0;cursor:pointer;accent-color:#e8505b;vertical-align:middle}' +
    '.mus-off .mus-vol{display:none}' +                              // con la música apagada, la barra no ocupa sitio
    '@media (max-width:600px){.mus{gap:4px}.mus-vol{width:54px}}' +
    '@media (pointer:coarse){.mus-vol{height:28px}}';
  document.head.append(estilo);

  const caja = document.createElement('span');
  caja.className = 'mus';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'musica';
  /* Mismo aspecto que el botón de efectos, sin copiar clases de estado (apagado, silenciado…) */
  btn.className = (mute.className.split(/\s+/).filter(c => c && !/^(muted|off|on|active|mute)$/i.test(c)).concat('mus-btn')).join(' ');
  btn.textContent = '🎵';
  btn.setAttribute('aria-label', 'Música de fondo');

  const barra = document.createElement('input');
  barra.type = 'range'; barra.className = 'mus-vol';
  barra.min = '0'; barra.max = '100'; barra.step = '1'; barra.value = String(pref.vol);
  barra.setAttribute('aria-label', 'Volumen de la música');
  barra.title = 'Volumen de la música';

  caja.append(btn, barra);
  mute.insertAdjacentElement('afterend', caja);

  function pinta() {
    btn.setAttribute('aria-pressed', String(pref.on));
    btn.title = pref.on ? 'Pausar la música' : 'Reproducir música de fondo';
    caja.classList.toggle('mus-off', !pref.on);
  }

  btn.addEventListener('click', e => {
    if (pref.on && !suena) inicia();                                 // estaba activada pero aún esperaba un toque: arranca
    else if (pref.on) { pref.on = false; para(); }
    else { pref.on = true; inicia(); }
    guarda(); pinta();
    if (e.detail) btn.blur();                                        // tras un clic de ratón o dedo, la barra espaciadora no lo vuelve a pulsar
  });

  barra.addEventListener('input', () => {
    pref.vol = Number(barra.value); aplicaVolumen(); guarda();
  });

  /* Las teclas de estos controles no deben llegar a los juegos (flechas, espacio…) */
  [btn, barra].forEach(x => x.addEventListener('keydown', e => e.stopPropagation()));

  pinta();

  /* Si estaba activada la última vez, arranca con el primer toque o tecla (los navegadores no permiten sonido antes) */
  if (pref.on) {
    const eventos = ['click', 'keydown', 'touchend'];
    const arranca = ev => {
      if (caja.contains(ev.target)) return;                          // si toca estos controles, lo gestiona el botón
      eventos.forEach(n => removeEventListener(n, arranca, true));
      if (pref.on && !suena) inicia();
    };
    eventos.forEach(n => addEventListener(n, arranca, true));
  }
})();

/*
 * LA AVENTURA DE SNOOPY — motor independiente
 * Compatible con el panel existente: #mario-panel, #mario-canvas,
 * #mario-start y #mario-ctrl. No requiere librerías externas.
 * Mantiene las interfaces globales que consulta juegos-extras.js.
 */
(function (window, document) {
  'use strict';

  if (window.__snoopyAventuraLoaded) return;
  window.__snoopyAventuraLoaded = true;

  const W = 480;
  const H = 270;
  const GROUND_Y = 226;
  const GRAVITY = 0.48;
  const MAX_FALL = 10.5;
  const MOVE_SPEED = 3.8;
  const JUMP_FORCE = -11.25;
  const SAVE_KEY = 'snoopy-aventura-save-v2';
  const PROGRESS_KEY = 'snoopy-aventura-unlocked-v2';
  const BEST_KEY = 'snoopy-mario-best';
  const TOTAL_LEVELS = 15;
  const BOSS_LEVELS = [3, 6, 9, 12, 15];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function easier() { return state.difficulty === 'facil'; }
  // Generación determinista: al cargar un checkpoint no cambian los huecos ni objetos.
  let seededRandom = null;
  function seededLevel(level) {
    let seed = (0x6D2B79F5 ^ (level * 2654435761)) >>> 0;
    return function () {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = (a, b) => a + (seededRandom ? seededRandom() : Math.random()) * (b - a);
  const META_KEY = 'snoopy-aventura-meta-v3';
  const DIFFICULTY_KEY = 'snoopy-aventura-dificultad-v25';
  const BIRD_RANGE = 195; // El pajarito solo ataca a amenazas realmente cercanas.
  const BIRD_COOLDOWN = 1.85; // Menos frecuencia para que funcione como ayuda y no como modo automático.
  const SHOP = [
    { id: 'heart', name: 'Corazón extra', cost: 20, desc: 'Empieza con 4 corazones.' },
    { id: 'magnet', name: 'Imán de galletas', cost: 28, desc: 'Recoge galletas desde más lejos.' },
    { id: 'dash', name: 'Turbo recargable', cost: 24, desc: 'Reduce el tiempo de recarga de la carrera.' },
    { id: 'ammo', name: 'Proyectiles mejorados', cost: 32, desc: 'Más munición y disparos perforantes.' },
    { id: 'double', name: 'Doble salto permanente', cost: 42, desc: 'Salta dos veces sin necesitar una cápsula.' },
    { id: 'shield', name: 'Escudo de inicio', cost: 50, desc: 'Protección temporal al comenzar cada nivel.' }
  ];
  const rects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  const canvas = document.getElementById('mario-canvas');
  if (!canvas) {
    console.warn('[Aventura] No se encontró #mario-canvas. Carga aventura.js después del HTML del juego.');
    window.__snoopyAventuraLoaded = false;
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = W;
  canvas.height = H;
  canvas.setAttribute('aria-label', 'Juego de plataformas La aventura de Snoopy');
  canvas.setAttribute('tabindex', '0');

  const worlds = [
    { name: 'Bosque de las galletas', short: 'BOSQUE', sky: ['#9bdcf5', '#e5f8ff'], ground: '#5caa57', top: '#8bd36b', accent: '#e8b75a', platform: '#8b6848', enemy: ['🐢', '🐝'], boss: '🐢', bossName: 'Tortuga gigante', power: 'double', decor: 'forest' },
    { name: 'Montañas heladas', short: 'NIEVE', sky: ['#87c9ec', '#f1fbff'], ground: '#8bb7ca', top: '#e7f8ff', accent: '#7ac7e6', platform: '#a9d8e9', enemy: ['🐧', '☃️'], boss: '☃️', bossName: 'Monstruo de hielo', power: 'shield', decor: 'snow' },
    { name: 'Reino de los dulces', short: 'DULCES', sky: ['#f6b6d2', '#fff0f6'], ground: '#c77d9d', top: '#f7b1cf', accent: '#ffcf70', platform: '#b86d9b', enemy: ['🍬', '🐝'], boss: '🐉', bossName: 'Dragón de chocolate', power: 'speed', decor: 'candy' },
    { name: 'Castillo embrujado', short: 'CASTILLO', sky: ['#5d568c', '#b3a0cb'], ground: '#655c78', top: '#9286a8', accent: '#c0a6e8', platform: '#514963', enemy: ['👻', '🦇'], boss: '👻', bossName: 'Fantasma gigante', power: 'shot', decor: 'haunted' },
    { name: 'Reino de las estrellas', short: 'ESTRELLAS', sky: ['#172b68', '#6d80b8'], ground: '#424e89', top: '#8fa6ed', accent: '#ffe28a', platform: '#6673bd', enemy: ['⭐', '🪽'], boss: '🐉', bossName: 'Dragón de las estrellas', power: 'shot', decor: 'stars' }
  ];

  const state = {
    mode: 'menu', // menu | playing | bossIntro | levelClear | gameover | victory
    world: 1,
    level: 1,
    camera: 0,
    time: 0,
    lastFrame: 0,
    score: 0,
    cookies: 0,
    lives: 3,
    best: 0,
    unlocked: 1,
    grounds: [],
    platforms: [],
    cookiesOnMap: [],
    powerups: [],
    foes: [],
    shots: [],
    particles: [],
    defeatFx: [],
    checkpoint: null,
    flagX: 0,
    boss: null,
    bossIntroTimer: 0,
    transitionTimer: 0,
    toast: '',
    toastTimer: 0,
    saveAt: 0,
    pendingReward: false,
    source: 'new',
    walls: [], tunnels: [], hazards: [], secrets: [], blocks: [], warpPipes: [], bonus: null, warpCooldown: 0, levelTime: 0,
    stats: { hits: 0, cookies: 0, defeats: 0, secrets: 0, challenges: 0 },
    startingLives: 3,
    meta: { wallet: 0, upgrades: {}, stars: {}, bestTimes: {} },
    lastStars: 0,
    musicOn: false,
    shopOpen: false,
    mapOpen: false,
    difficulty: safeStoreGet(DIFFICULTY_KEY, 'facil') === 'normal' ? 'normal' : 'facil',
    birdShots: [],
    companion: { x: 48, y: 156, attackTimer: 0, cooldown: 1, kills: 0, bossHits: 0, target: null, blocks: 0, activeTime: 0 }
  };

  const player = {
    x: 34, y: 150, w: 25, h: 31, vx: 0, vy: 0,
    onGround: false, facing: 1, jumps: 0, invuln: 0,
    safe: { x: 34, y: 150 },
    power: null,
    powerTime: 0,
    ammo: 0,
    shotCooldown: 0,
    carrier: null,
    anim: 0,
    slideTime: 0, dashTime: 0, dashCooldown: 0,
    wallSide: 0, wallLock: 0, normalHeight: 31, coyote: 0, jumpBuffer: 0,
    previousFeet: 181, descentSpeed: 0, landingGrace: 0
  };

  // Mantener nombres públicos usados por juegos-extras.js.
  const mario = {
    running: false,
    last: 0,
    acc: 0,
    score: 0,
    lives: 3,
    level: 1,
    p: player,
    foes: state.foes,
    state,
    pausedByGame: false
  };
  window.mario = mario;
  window.mkeys = window.mkeys || { left: false, right: false, up: false, jump: false, power: false };
  window.marioLoop = 0;

  function safeStoreGet(key, fallback) {
    try {
      if (window.store && typeof window.store.get === 'function') {
        const value = window.store.get(key);
        if (value !== undefined && value !== null) return value;
      }
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : raw;
    } catch (_) { return fallback; }
  }
  function safeStoreSet(key, value) {
    try {
      if (window.store && typeof window.store.set === 'function') window.store.set(key, value);
      else localStorage.setItem(key, String(value));
    } catch (_) { /* el juego sigue aunque el almacenamiento esté bloqueado */ }
  }
  function readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Se conservan los guardados v2 existentes, con campos v3 opcionales.
      if (!data || (data.version !== 2 && data.version !== 3)) return null;
      if (!Number.isFinite(Number(data.level))) return null;
      return data;
    } catch (_) { return null; }
  }
  function readMeta() {
    try {
      const data = JSON.parse(localStorage.getItem(META_KEY) || '{}');
      const upgrades = {}, stars = {}, bestTimes = {};
      for (const item of SHOP) upgrades[item.id] = data.upgrades?.[item.id] === true;
      for (let i = 1; i <= TOTAL_LEVELS; i++) {
        stars[i] = clamp(Math.floor(Number(data.stars?.[i]) || 0), 0, 3);
        if (Number.isFinite(+data.bestTimes?.[i]) && +data.bestTimes[i] > 0) bestTimes[i] = +data.bestTimes[i];
      }
      return { wallet: clamp(Math.floor(Number(data.wallet) || 0), 0, 999999), upgrades, stars, bestTimes };
    } catch (_) { return { wallet: 0, upgrades: {}, stars: {}, bestTimes: {} }; }
  }
  function writeMeta() {
    try { localStorage.setItem(META_KEY, JSON.stringify(state.meta)); } catch (_) { /* almacenamiento opcional */ }
  }
  function writeSave() {
    try {
      if (state.mode === 'victory' || state.mode === 'menu') return;
      const cleared = state.mode === 'levelClear';
      const data = {
        version: 2, // Compatibilidad con lectores de los guardados anteriores.
        level: cleared ? Math.min(TOTAL_LEVELS, state.level + 1) : state.level,
        unlocked: state.unlocked,
        score: state.score, cookies: state.cookies, lives: state.lives,
        checkpointX: cleared ? 34 : (state.checkpoint?.reached ? state.checkpoint.x : 34),
        checkpointReached: !cleared && !!state.checkpoint?.reached,
        stats: cleared ? null : state.stats,
        levelTime: cleared ? 0 : state.levelTime,
        collectedCookies: cleared ? [] : state.cookiesOnMap.filter(c => c.taken).map(c => c.id),
        collectedSecrets: cleared ? [] : state.secrets.filter(c => c.taken).map(c => c.id),
        collectedPowerups: cleared ? [] : state.powerups.filter(c => c.taken).map(c => c.id),
        usedBlocks: cleared ? [] : state.blocks.filter(b => b.used).map(b => b.id),
        timestamp: Date.now()
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      state.saveAt = Date.now();
      writeMeta();
    } catch (_) { /* no bloquear el juego */ }
  }
  function syncCompatibility() {
    mario.score = state.score;
    mario.lives = state.lives;
    mario.level = state.level;
    mario.foes = state.foes;
    mario.p = player;
    mario.state = state;
  }

  function notify(message) {
    state.toast = message;
    state.toastTimer = 2.0;
    if (typeof window.toast === 'function') {
      try { window.toast(message); } catch (_) { /* ignorar */ }
    }
  }
  // Síntesis sonora local con WebAudio: no requiere MP3, red ni bibliotecas.
  const audio = { ctx: null, note: 0, elapsed: 0, world: 0 };
  const melodies = [
    [523,659,784,659,587,698,659,0,523,587,659,784,0],
    [440,523,587,0,659,587,523,440,392,440,523,0],
    [587,784,880,784,698,587,659,0,784,988,880,0],
    [392,466,523,0,349,392,466,311,349,392,0],
    [659,784,988,880,784,659,1047,0,880,988,1175,0]
  ];
  function enableAudio() {
    try {
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (!audio.ctx && AudioClass) audio.ctx = new AudioClass();
      if (audio.ctx?.state === 'suspended') audio.ctx.resume().catch(() => {});
    } catch (_) { /* navegador sin audio */ }
  }
  function tone(freq, duration, kind, volume) {
    if (!state.musicOn || !audio.ctx || audio.ctx.state !== 'running' || !freq) return;
    try {
      const now = audio.ctx.currentTime;
      const oscillator = audio.ctx.createOscillator();
      const gain = audio.ctx.createGain();
      oscillator.type = kind || 'sine';
      oscillator.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume || 0.035), now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain); gain.connect(audio.ctx.destination);
      oscillator.start(now); oscillator.stop(now + duration + 0.02);
    } catch (_) { /* sonido opcional */ }
  }
  function sound(name) {
    if (typeof window.sfx === 'function') {
      try { window.sfx(name); } catch (_) { /* integración opcional */ }
    }
    const notes = {
      start: [523,0.17], jump: [590,0.12], coin: [880,0.09],
      power: [1047,0.28], shoot: [740,0.07], stomp: [350,0.12],
      hurt: [196,0.24], shield: [670,0.2], checkpoint: [785,0.34],
      boss: [235,0.11], bossHit: [420,0.12], bossWin: [988,0.4],
      bird: [1180,0.09],
      win: [784,0.35], secret: [1175,0.34], dash: [440,0.08],
      slide: [310,0.07], shop: [659,0.17]
    };
    const n = notes[name]; if (n) tone(n[0], n[1], name === 'hurt' || name === 'boss' ? 'sawtooth' : 'triangle', 0.06);
  }
  function updateMusic(dt) {
    if (!state.musicOn || !audio.ctx || state.shopOpen || !mario.running) return;
    if (audio.world !== state.world) { audio.world = state.world; audio.note = 0; audio.elapsed = 0; }
    audio.elapsed -= dt;
    if (audio.elapsed > 0) return;
    audio.elapsed = state.boss?.alive && player.x > state.boss.x - 340 ? 0.21 : 0.31;
    const melody = melodies[state.world - 1] || melodies[0];
    tone(melody[audio.note++ % melody.length], 0.22, 'sine', 0.018);
  }

  function loadProgress() {
    const bestRaw = safeStoreGet(BEST_KEY, '0');
    state.best = Number(bestRaw) || 0;
    const saved = readSave();
    state.meta = readMeta();
    let unlocked = Number(safeStoreGet(PROGRESS_KEY, '1')) || 1;
    // Compatibilidad con el desbloqueo previo del nivel 3.
    if (safeStoreGet('mario-l3', null)) unlocked = Math.max(unlocked, 3);
    state.unlocked = clamp(Math.max(unlocked, saved ? Number(saved.unlocked) || 1 : 1), 1, TOTAL_LEVELS);
  }

  function getLevelWorld(level) { return Math.floor((level - 1) / 3); }
  function levelHasBoss(level) { return BOSS_LEVELS.includes(level); }
  function levelName(level) {
    const w = worlds[getLevelWorld(level)];
    const n = ((level - 1) % 3) + 1;
    return `Mundo ${getLevelWorld(level) + 1}-${n}: ${LEVEL_DESIGNS[level-1]?.name||'Aventura'}`;
  }

  // V3: 15 trazados editoriales explícitos. Sin sorteos para el recorrido principal.
  // gaps: aberturas cortas con puentes; ledges: plataformas secundarias;
  // walls/spikes/beam: obstáculos visualmente anticipables.
  const LEVEL_DESIGNS = [
    {name:'Sendero de bienvenida', gaps:[[680,34],[1460,34]], ledges:[[400,157,98],[810,148,92],[1050,162,96],[1330,150,100],[1730,153,92]], walls:[423,1025], spikes:[780], beam:[1160], foes:[[575,'turtle'],[900,'bee'],[1240,'turtle'],[1630,'bee']], coinBands:[145,510,880,1275,1730]},
    {name:'Puentes del bosque', gaps:[[560,40],[1110,38],[1580,40]], ledges:[[380,156,96],[680,151,100],[945,140,100],[1270,162,91],[1710,147,97]], walls:[425,1360], spikes:[790,1730], beam:[1050], foes:[[640,'turtle'],[840,'bee'],[1240,'turtle'],[1480,'bee'],[1770,'turtle']], coinBands:[150,560,930,1310,1770]},
    {name:'Guardia del gran roble', gaps:[[650,40],[1240,40]], ledges:[[380,153,102],[760,152,90],[1010,164,96],[1350,149,90],[1790,159,96]], walls:[421,965], spikes:[825,1410], beam:[1160], foes:[[550,'turtle'],[855,'bee'],[1100,'turtle'],[1500,'bee'],[1800,'turtle']], coinBands:[130,530,940,1350,1830]},
    {name:'Primeras nieves', gaps:[[730,36],[1550,38]], ledges:[[382,164,95],[805,155,95],[1040,142,94],[1320,164,98],[1760,149,88]], walls:[422,995], spikes:[875], beam:[1180], foes:[[620,'penguin'],[900,'snowman'],[1265,'penguin'],[1740,'snowman']], coinBands:[170,590,935,1320,1780]},
    {name:'Paso de los pingüinos', gaps:[[530,40],[1010,35],[1620,42]], ledges:[[380,159,90],[650,148,92],[885,164,91],[1175,147,96],[1770,159,95]], walls:[425,1400], spikes:[760,1730], beam:[1120], foes:[[590,'penguin'],[900,'snowman'],[1280,'penguin'],[1520,'snowman'],[1780,'penguin']], coinBands:[155,520,940,1290,1760]},
    {name:'Fortaleza de hielo', gaps:[[615,38],[1340,42]], ledges:[[375,153,100],[740,162,98],[990,142,100],[1200,156,95],[1795,153,91]], walls:[424,965,1580], spikes:[825,1515], beam:[1120], foes:[[560,'penguin'],[900,'snowman'],[1270,'penguin'],[1720,'snowman']], coinBands:[145,560,950,1290,1820]},
    {name:'Camino de caramelo', gaps:[[695,36],[1490,40]], ledges:[[383,158,99],[810,149,94],[1090,164,90],[1290,147,98],[1700,158,94]], walls:[420,985], spikes:[790], beam:[1160], foes:[[590,'candy'],[900,'bee'],[1240,'candy'],[1690,'bee']], coinBands:[135,560,950,1360,1750]},
    {name:'Río de chocolate', gaps:[[585,42],[1040,40],[1690,40]], ledges:[[385,160,98],[735,150,93],[930,142,100],[1180,159,94],[1760,151,98]], walls:[422,1410], spikes:[810,1610], beam:[1180], foes:[[605,'candy'],[870,'bee'],[1270,'candy'],[1550,'bee'],[1800,'candy']], coinBands:[135,545,925,1290,1830]},
    {name:'Dragón de azúcar', gaps:[[730,42],[1320,43]], ledges:[[383,158,94],[820,146,94],[1080,159,91],[1460,145,96],[1810,155,96]], walls:[425,1000,1580], spikes:[910,1470], beam:[1170], foes:[[600,'candy'],[910,'bee'],[1270,'candy'],[1750,'bee']], coinBands:[130,560,960,1315,1860]},
    {name:'Puerta de los espectros', gaps:[[610,38],[1580,40]], ledges:[[385,159,96],[745,146,90],[1000,163,100],[1335,153,96],[1725,142,96]], walls:[422,965], spikes:[845,1650], beam:[1130], foes:[[590,'ghost'],[905,'bat'],[1260,'ghost'],[1680,'bat']], coinBands:[150,560,925,1300,1790]},
    {name:'Pasadizos del castillo', gaps:[[570,40],[1010,35],[1530,42]], ledges:[[380,153,96],[705,164,94],[910,145,98],[1190,159,88],[1755,147,96]], walls:[424,1385], spikes:[820,1635], beam:[1110], foes:[[615,'ghost'],[900,'bat'],[1250,'ghost'],[1540,'bat'],[1770,'ghost']], coinBands:[140,545,905,1285,1820]},
    {name:'Torre del fantasma', gaps:[[720,40],[1280,40]], ledges:[[380,153,95],[790,147,100],[1020,161,95],[1430,146,96],[1790,160,95]], walls:[423,992,1550], spikes:[850,1470], beam:[1160], foes:[[580,'ghost'],[905,'bat'],[1230,'ghost'],[1705,'bat']], coinBands:[130,555,940,1325,1830]},
    {name:'Sendero de constelaciones', gaps:[[640,39],[1580,40]], ledges:[[380,155,100],[775,147,100],[1010,159,96],[1310,145,90],[1740,160,96]], walls:[424,975], spikes:[820], beam:[1125], foes:[[590,'starling'],[920,'bat'],[1240,'starling'],[1680,'bat']], coinBands:[150,540,930,1310,1790]},
    {name:'Órbita de cristales', gaps:[[565,40],[1120,40],[1640,41]], ledges:[[385,160,94],[685,148,98],[940,158,98],[1240,144,93],[1760,158,95]], walls:[423,1390], spikes:[850,1590], beam:[1190], foes:[[615,'starling'],[900,'bat'],[1250,'starling'],[1520,'bat'],[1800,'starling']], coinBands:[135,530,935,1325,1800]},
    {name:'Corazón de las estrellas', gaps:[[670,40],[1320,40]], ledges:[[382,157,100],[790,144,96],[1040,163,94],[1450,149,92],[1800,154,97]], walls:[424,985,1580], spikes:[855,1450], beam:[1160], foes:[[590,'starling'],[895,'bat'],[1240,'starling'],[1720,'bat']], coinBands:[135,540,930,1310,1820]}
  ];

  // V3.0.2: tres recompensas visibles y accesibles por recorrido, colocadas a mano.
  // ID 0 conserva el poder principal antiguo; ID 1 conserva el del pajarito.
  // IDs 2 y 3 son nuevas recompensas que no sustituyen las compras anteriores.
  const LEVEL_POWER_PLANS = [
    [{id:2,x:207,type:'shield'}, {id:0,x:810,type:'double'}, {id:3,x:1510,type:'speed'}],
    [{id:2,x:206,type:'speed'}, {id:0,x:765,type:'double'}, {id:1,x:1390,type:'bird'}],
    [{id:2,x:212,type:'shield'}, {id:0,x:847,type:'double'}, {id:1,x:1510,type:'bird'}],
    [{id:2,x:208,type:'double'}, {id:0,x:765,type:'shield'}, {id:3,x:1460,type:'shot'}],
    [{id:2,x:207,type:'speed'}, {id:0,x:830,type:'shield'}, {id:1,x:1480,type:'bird'}],
    [{id:2,x:210,type:'double'}, {id:0,x:854,type:'shield'}, {id:1,x:1550,type:'bird'}],
    [{id:2,x:211,type:'shield'}, {id:0,x:834,type:'speed'}, {id:3,x:1480,type:'shot'}],
    [{id:2,x:208,type:'double'}, {id:0,x:824,type:'speed'}, {id:1,x:1440,type:'bird'}],
    [{id:2,x:210,type:'shield'}, {id:0,x:845,type:'speed'}, {id:1,x:1480,type:'bird'}],
    [{id:2,x:208,type:'double'}, {id:0,x:790,type:'shot'}, {id:3,x:1480,type:'shield'}],
    [{id:2,x:209,type:'shield'}, {id:0,x:832,type:'shot'}, {id:1,x:1420,type:'bird'}],
    [{id:2,x:210,type:'speed'}, {id:0,x:850,type:'shot'}, {id:1,x:1510,type:'bird'}],
    [{id:2,x:208,type:'shield'}, {id:0,x:826,type:'shot'}, {id:3,x:1475,type:'double'}],
    [{id:2,x:212,type:'speed'}, {id:0,x:794,type:'shot'}, {id:1,x:1450,type:'bird'}],
    [{id:2,x:209,type:'shield'}, {id:0,x:850,type:'shot'}, {id:1,x:1510,type:'bird'}],
  ];

  function enemyBehavior(type) {
    return ({turtle:'patrol',penguin:'slide',snowman:'guard',candy:'bounce',
      bee:'hover',ghost:'phase',bat:'swoop',starling:'orbital'})[type]||'patrol';
  }

  // Escenarios 2.6: se construyen por tramos jugables, sin enemigos flotantes,
  // objetos inaccesibles ni obstáculos que se solapen accidentalmente.
  function makeLevel(level, checkpointX, restored) {
    seededRandom = seededLevel(level);
    state.time = 0; // Mismos patrones al entrar/reintentar el mismo nivel.
    const worldIndex = getLevelWorld(level);
    const world = worlds[worldIndex];
    const design = LEVEL_DESIGNS[level - 1];
    const length = levelHasBoss(level) ? 2600 : 2200;
    const grounds = [], platforms = [], cookies = [], powerups = [], foes = [];
    const walls = [], tunnels = [], hazards = [], secrets = [], blocks = [], warpPipes = [];
    const arenaStart = length - (levelHasBoss(level) ? 610 : 345);
    const ground = (x, w, type = 'ground') => grounds.push({ x, y: GROUND_Y, w, h: 70, type });
    const overlapsX = (x, w, item, pad = 0) => x < item.x + item.w + pad && x + w > item.x - pad;
    const tooClose = (x, w, items, pad = 0) => items.some(item => overlapsX(x, w, item, pad));
    const supported = (x, w, margin = 8) => grounds.find(g => x >= g.x + margin && x + w <= g.x + g.w - margin && g.type !== 'bonus');
    function snapToGround(target, w = 25, margin = 16, minWidth = 80) {
      const options = grounds.filter(g => g.w >= Math.max(minWidth, w + margin * 2) && g.type !== 'bonus');
      if (!options.length) return null;
      let best = null, bestDistance = Infinity;
      for (const g of options) {
        const x = clamp(target, g.x + margin, g.x + g.w - w - margin);
        const d = Math.abs(target - x);
        if (d < bestDistance) { bestDistance = d; best = { x, ground: g }; }
      }
      return best;
    }

    // Suelo por segmentos fijos, diseñados manualmente para cada uno de los 15 niveles.
    // Hay puentes físicos en todos los huecos; ningún salto del camino principal
    // depende de un poder temporal o de un impulso extremo.
    let cursor = 0;
    for (const [start, width] of design.gaps) {
      if (start >= arenaStart - 120) continue;
      if (start > cursor) ground(cursor, start - cursor);
      cursor = start + width;
    }
    if (cursor < arenaStart) ground(cursor, arenaStart - cursor);
    ground(arenaStart, length - arenaStart);
    // Fusionar tramos contiguos para evitar costuras y colisiones duplicadas.
    grounds.sort((a,b) => a.x - b.x);
    for (let i = grounds.length - 1; i > 0; i--) {
      const prev = grounds[i-1], cur = grounds[i];
      if (prev.x + prev.w >= cur.x - .001) {
        prev.w = Math.max(prev.w, cur.x + cur.w - prev.x);
        grounds.splice(i, 1);
      }
    }

    // Plataformas colocadas una por una, con altura y anchura constantes y alcanzables.
    design.ledges.forEach(([x,y,w],i) => platforms.push({x,y,w,h:13,
      type:['wood','ice','candy','stone','star'][worldIndex],
      moving:i === 3 && level % 3 === 2, horizontal:true, phase:0,
      baseX:x,baseY:y,dx:0,dy:0}));
    // Puentes jugables a la misma altura del suelo: antes quedaban tan altos que
    // podían verse como un camino, pero Snoopy podía caer por debajo de ellos.
    const gaps = [];
    for (let i = 1; i < grounds.length; i++) {
      const prev = grounds[i - 1], cur = grounds[i];
      const start = prev.x + prev.w, width = cur.x - start;
      if (width > 4 && start < arenaStart) gaps.push({ x: start, w: width });
    }
    gaps.forEach((gap, i) => {
      // Las rutas principales tienen puentes funcionales y visibles en ambos modos.
      // La dificultad Normal se concentra en peligros y enemigos, no en caídas engañosas.
      const bridgeY = GROUND_Y - 6;
      platforms.push({ x: gap.x - 15, y: bridgeY, w: gap.w + 30, h: 8,
        type: ['wood','ice','candy','stone','star'][worldIndex],
        moving: false, horizontal: false, phase: 0, baseX: gap.x - 15,
        baseY: bridgeY, dx: 0, dy: 0, bridge: true });
    });

    // La tubería de bonificación no interrumpe el inicio ni se mezcla con otros objetos.
    warpPipes.push({ x: 302, y: GROUND_Y - 38, w: 36, h: 38, entrance: true });
    // Obstáculos planificados. Se descartan únicamente los que dejarían de tener
    // apoyo por cambios de dificultad o se solaparían con entradas de bonus.
    for (const x of design.walls) {
      if (supported(x,24,4) && !tooClose(x,24,warpPipes,25))
        walls.push({x,y:GROUND_Y-34,w:24,h:34});
    }
    for (const x of design.spikes) {
      if (supported(x,29,18) && !tooClose(x,29,walls.concat(warpPipes),90) &&
          !gaps.some(g=>x<g.x+g.w+(easier()?150:135)&&x+29>g.x-(easier()?135:115)) &&
          !platforms.some(p=>!p.bridge && overlapsX(x,29,p,18)))
        hazards.push({x,y:GROUND_Y-11,w:29,h:11,kind:['spikes','ice','candy','magic','magic'][worldIndex]});
    }
    for (const x of design.beam) {
      if (supported(x,70,10) && !tooClose(x,70,walls.concat(hazards,warpPipes),48))
        tunnels.push({x,y:GROUND_Y-46,w:70,h:22,kind:world.decor});
    }

    // Enemigos asignados por especie y por nivel, con rutas cerradas y aterrizajes libres.
    for (const [wanted, type] of design.foes) {
      const fly = ['bee','bat','starling','ghost'].includes(type);
      const found = snapToGround(wanted,27,28,125);
      if (!found || found.x > arenaStart - 105) continue;
      const ex = found.x;
      // Un volador no aparece en el inicio/fin de un puente: espacio para aterrizar.
      if(fly && design.gaps.some(([gx,gw])=>ex>gx-95&&ex<gx+gw+155))continue;
      if (!fly && tooClose(ex,27,walls.concat(hazards,tunnels,warpPipes),40)) continue;
      if (foes.some(f=>Math.abs(f.x-ex)<85)) continue;
      const nearLedge = platforms.some(p=>!p.bridge && overlapsX(ex-40,107,p,26));
      // Los voladores dejan espacio encima de las plataformas: su altura se calcula
      // para que la zona de aterrizaje no coincida con el cuerpo del enemigo.
      const ey = fly ? (nearLedge ? GROUND_Y-125 : GROUND_Y-91) : GROUND_Y-27;
      const minX = fly ? Math.max(465,ex-38) : Math.max(found.ground.x+12,ex-37);
      const maxX = fly ? Math.min(arenaStart-88,ex+38) : Math.min(found.ground.x+found.ground.w-45,ex+37);
      foes.push({x:ex,y:ey,w:27,h:27,vx: type==='penguin' ? .95 : .65,vy:0,
        type,alive:true,minX,maxX:Math.max(minX+2,maxX),baseY:ey,phase:((level*13+ex)%15)/4,
        fly,hp:1,hitFlash:0,ai:enemyBehavior(type),cooldown:1.5,spawnX:ex,attackFlash:0});
    }
    // Retos: añadir guardianes terrestres solo si faltan objetivos accesibles.
    const fallbackType = ['turtle','penguin','candy','ghost','starling'][worldIndex];
    for (const ex of [550,1085,1565,1790]) {
      if (foes.length >= 3) break;
      const found=snapToGround(ex,27,35,125);
      if (!found || tooClose(found.x,27,walls.concat(hazards,tunnels,warpPipes),45) ||
          foes.some(f=>Math.abs(f.x-found.x)<90)) continue;
      const type=fallbackType, fly=['ghost','starling'].includes(type);
      foes.push({x:found.x,y:fly?GROUND_Y-92:GROUND_Y-27,w:27,h:27,
        vx:.55,vy:0,type,alive:true,minX:found.x-20,maxX:found.x+20,
        baseY:fly?GROUND_Y-92:GROUND_Y-27,phase:1,fly,hp:1,hitFlash:0,
        ai:enemyBehavior(type),cooldown:2,spawnX:found.x,attackFlash:0});
    }

    // Cinco senderos de monedas por nivel. Los del camino principal se recogen
    // andando, y los elevados quedan sobre plataformas o a altura de salto normal.
    let coinId = 0;
    for (let section=0;section<design.coinBands.length;section++) {
      const origin = design.coinBands[section];
      for (let i=0;i<6;i++) {
        const desired=origin+i*29;
        if (desired>=arenaStart-95) break;
        const found=snapToGround(desired,1,16,80);
        if (!found || tooClose(found.x,1,warpPipes.concat(walls,tunnels),10)) continue;
        const upper=section%3===1 && i===3;
        const overhead=platforms.find(p=>!p.bridge && found.x>p.x+12 && found.x<p.x+p.w-12);
        const cy=upper && overhead ? overhead.y-21 : GROUND_Y-(i%5===3?47:32);
        if (hazards.some(h=>Math.abs(h.x+h.w/2-found.x)<29)) continue;
        cookies.push({id:coinId++,x:found.x,y:cy,r:8,taken:false,phase:i*.4});
      }
    }

    // Distribución editorial: inicio, zona media y tramo final.
    // Solo se colocan sobre suelo accesible, lejos de precipicios, trampas,
    // enemigos y obstáculos. El jugador los recoge caminando, sin salto obligatorio.
    const previousPowerIds = new Set();
    for (const wanted of LEVEL_POWER_PLANS[level-1]) {
      let chosen = null, bestDistance = Infinity;
      const target = clamp(wanted.x, 165, arenaStart - 180);
      // Buscar a poca distancia de la ubicación diseñada; no desplazar el poder
      // al extremo opuesto del mapa por encontrar suelo allí.
      for (let radius = 0; radius <= 144; radius += 8) {
        for (const sign of (radius === 0 ? [1] : [-1,1])) {
          const x = Math.round(target + radius * sign);
          if (x < 160 || x > arenaStart - 165) continue;
          if (!supported(x - 12,24,18)) continue;
          if (tooClose(x - 12,24,walls.concat(tunnels,warpPipes,hazards),48)) continue;
          if (gaps.some(g => x > g.x - 64 && x < g.x + g.w + 64)) continue;
          if (foes.some(f => Math.abs((f.spawnX || f.x + f.w/2) - x) < 68)) continue;
          if (powerups.some(p => Math.abs(p.x - x) < 178)) continue;
          if (Math.abs(x - 302) < 82 || Math.abs(x - 416) < 64) continue;
          const distance = Math.abs(x - target);
          if (distance < bestDistance) { chosen = x; bestDistance = distance; }
        }
        if (chosen !== null) break;
      }
      if (chosen !== null) {
        powerups.push({id:wanted.id,x:chosen,y:GROUND_Y-32,type:wanted.type,taken:false,bob:0});
        previousPowerIds.add(wanted.id);
      }
    }
    // Respaldos deterministas, limitados al sector correspondiente.
    // Así ningún nivel se queda sin poder por culpa de una trampa cercana.
    for (const wanted of LEVEL_POWER_PLANS[level-1]) {
      if (previousPowerIds.has(wanted.id)) continue;
      const shift = [0,-16,16,-32,32,-48,48,-64,64];
      for (const delta of shift) {
        const x = wanted.x+delta;
        if (!supported(x-12,24,12) || x < 170 || x > arenaStart-120) continue;
        if (tooClose(x-12,24,walls.concat(tunnels,warpPipes,hazards),25)) continue;
        if (powerups.some(p => Math.abs(p.x-x)<135)) continue;
        powerups.push({id:wanted.id,x,y:GROUND_Y-32,type:wanted.type,taken:false,bob:0});
        previousPowerIds.add(wanted.id);
        break;
      }
    }

    // Antes de cada jefe hay una fuente de proyectiles claramente visible:
    // el combate no exige acertar cuatro saltos sobre un enemigo móvil.
    if(levelHasBoss(level)){
      powerups.push({id:41,x:arenaStart-122,y:GROUND_Y-34,type:'shot',taken:false,bob:0});
      powerups.push({id:42,x:arenaStart+68,y:GROUND_Y-34,type:'shot',taken:false,bob:0});
    }

    // Gemas secretas elevadas pero alcanzables con un salto normal.
    [2,7].forEach((i,id) => {
      const platform = platforms[i];
      if (platform && !platform.bridge) secrets.push({ id, x:platform.x + platform.w/2,
        y:platform.y - 24, r:11, taken:false, phase:rand(0,6) });
    });
    // Cada nivel contiene bloques reales. Su hitbox coincide con lo que se dibuja.
    function validBlock(x,y) {
      if (!supported(x,24,20) || x > arenaStart + (levelHasBoss(level) ? -90 : 145)) return false;
      if (tooClose(x,24,walls.concat(tunnels,warpPipes),35)) return false;
      // Un bloque sobre un salto obligatorio puede cortar la trayectoria.
      if (tooClose(x,24,hazards,85)) return false;
      if (gaps.some(g=> x < g.x+g.w+54 && x+24 > g.x-54)) return false;
      if (blocks.some(block=>overlapsX(x,24,block,30))) return false;
      if (foes.some(foe=>Math.abs(foe.x-x)<40 && Math.abs(foe.baseY-y)<45)) return false;
      if (platforms.some(p=>overlapsX(x,24,p,6) && Math.abs(p.y-y)<32)) return false;
      return true;
    }
    const blockCandidates=[205,695,1010,1350,1640];
    for (let i=0;i<blockCandidates.length;i++) {
      const desired=blockCandidates[i]+(level%3)*9;
      const y=GROUND_Y-(i%2?104:87);
      let chosen=null;
      for (const offset of [0,-24,24,-48,48,-72,72,-96,96,-128,128,-155,155,-185,185,-215,215]) {
        const x=Math.round(desired+offset);
        if (validBlock(x,y)) {chosen=x;break;}
      }
      if (chosen===null) {
        // Búsqueda de respaldo sobre las partes más largas de suelo firme.
        const candidates=[];
        for(const g of grounds) {
          if (g.type==='bonus'||g.x>=arenaStart-90) continue;
          for(let x=Math.round(g.x+26);x+50<g.x+g.w;x+=27)
            if(validBlock(x,y)) candidates.push(x);
        }
        candidates.sort((x,y)=>Math.abs(x-desired)-Math.abs(y-desired));
        chosen=candidates[0] ?? null;
      }
      if (chosen!==null) blocks.push({id:i,x:chosen,y,w:24,h:24,
        kind:i===1?'power':'coin',used:false,bump:0});
    }

    // Zonas extra para mantener cinco bloques utilizables en todos los mundos.
    // No se colocan sobre huecos, pinchos ni junto a las tuberías.
    let extraBlockId = 5;
    for (const [x,y] of [[112,139],[162,122],[355,132],[1820,139],[1900,122],
                         [1320,139],[540,122],[1710,139],[1180,122],[80,122]]) {
      if (blocks.length >= 5) break;
      if (validBlock(x,y)) blocks.push({ id:extraBlockId++, x,y,w:24,h:24,
        kind:'coin',used:false,bump:0 });
    }

    // Cuarto bonus físicamente aislado del camino y sin enemigo ni obstáculo.
    const bonusStart = length + 280;
    ground(bonusStart, 520, 'bonus');
    for (let i = 0; i < 10; i++) cookies.push({ id:1000 + level*20 + i,
      x:bonusStart + 108 + i*35, y:GROUND_Y - 53 - (i%2)*25,
      r:8, taken:false, phase:i });
    platforms.push({ x:bonusStart+200, y:GROUND_Y-82, w:96, h:13,
      type:['wood','ice','candy','stone','star'][worldIndex], moving:false,
      phase:0, baseX:bonusStart+200, baseY:GROUND_Y-82, dx:0, dy:0 });
    secrets.push({ id:50, x:bonusStart+249, y:GROUND_Y-108, r:11, taken:false, phase:1 });
    warpPipes.push({ x:bonusStart+25, y:GROUND_Y-38, w:36, h:38, entrance:false });
    const bonus = { active:false, start:bonusStart, end:bonusStart+520, remaining:25 };

    // Checkpoint en suelo seguro; su posición se recalcula al migrar un guardado viejo.
    let checkpointPos = 34;
    let bestCheckpointDistance = Infinity;
    for (const g of grounds) {
      if (g.type === 'bonus' || g.x > 1430 || g.x + g.w < 700) continue;
      for (let spot = Math.max(g.x+18,700); spot+player.w+18 < g.x+g.w && spot <=1430; spot+=8) {
        if (tooClose(spot,player.w,hazards.concat(walls,tunnels,warpPipes),35)) continue;
        if (foes.some(f => !f.fly && Math.abs(f.spawnX-spot) < 75)) continue;
        const distance = Math.abs(spot-1100);
        if (distance < bestCheckpointDistance) { bestCheckpointDistance = distance; checkpointPos=spot; }
      }
    }
    if (bestCheckpointDistance === Infinity) {
      const closest = snapToGround(1100,player.w,20,110);
      checkpointPos = closest ? closest.x : 34;
    }
    const resumeCheckpoint = !!checkpointX;
    // Un guardado en la arena del jefe debe volver a esa arena, no al
    // checkpoint de mitad del mapa. Para partidas antiguas se usa el seguro.
    const bossResume = levelHasBoss(level) && Number(checkpointX) >= arenaStart + 20 &&
      Number(checkpointX) < arenaStart + 200;
    const safeCheckpoint = bossResume ? arenaStart + 45 : checkpointPos;
    const cookieSet = new Set(Array.isArray(restored?.collectedCookies) ? restored.collectedCookies : []);
    const secretSet = new Set(Array.isArray(restored?.collectedSecrets) ? restored.collectedSecrets : []);
    const powerSet = new Set(Array.isArray(restored?.collectedPowerups) ? restored.collectedPowerups : []);
    const blockSet = new Set(Array.isArray(restored?.usedBlocks) ? restored.usedBlocks : []);
    cookies.forEach(c => { c.taken = cookieSet.has(c.id); });
    secrets.forEach(c => { c.taken = secretSet.has(c.id); });
    powerups.forEach(c => { c.taken = powerSet.has(c.id); });
    blocks.forEach(b => { b.used = blockSet.has(b.id); });
    seededRandom = null;
    state.world = worldIndex + 1;
    state.level = level;
    state.grounds = grounds;
    state.platforms = platforms;
    state.cookiesOnMap = cookies;
    state.powerups = powerups;
    state.foes = foes;
    state.walls = walls;
    state.tunnels = tunnels;
    state.hazards = hazards;
    state.secrets = secrets;
    state.blocks = blocks;
    state.warpPipes = warpPipes;
    state.bonus = bonus; state.warpCooldown = 0;
    state.levelTime = Number.isFinite(+restored?.levelTime) ? Math.max(0, +restored.levelTime) : 0;
    state.stats = {
      hits: clamp(Number(restored?.stats?.hits) || 0, 0, 99),
      cookies: clamp(Number(restored?.stats?.cookies) || 0, 0, 99),
      defeats: clamp(Number(restored?.stats?.defeats) || 0, 0, 99),
      secrets: clamp(Number(restored?.stats?.secrets) || 0, 0, 99),
      challenges: clamp(Number(restored?.stats?.challenges) || 0, 0, 99)
    };
    // Los nuevos campos no existen en los guardados antiguos.
    if (!restored?.stats) {
      state.stats.cookies = cookieSet.size;
      state.stats.secrets = secretSet.size;
    }
    state.startingLives = state.lives;
    state.shots = [];
    state.birdShots = [];
    state.companion = { x: player.x + 15, y: player.y - 16, attackTimer: 0, cooldown: 0.75,
      guardCooldown: 0, blocks: 0, kills: 0, bossHits: 0, target: null, activeTime: 0 };
    state.particles = [];
    state.defeatFx = [];
    state.flagX = length - 58;
    state.camera = clamp(player.x - 145, 0, Math.max(0, state.flagX - W + 255));
    state.boss = levelHasBoss(level) ? makeBoss(worldIndex, length - 330) : null;
    state.checkpoint = { x: resumeCheckpoint ? safeCheckpoint : checkpointPos,
      reached: resumeCheckpoint, y: GROUND_Y - player.normalHeight };

    player.h = player.normalHeight;
    player.x = resumeCheckpoint ? safeCheckpoint : 34;
    player.y = GROUND_Y - player.h;
    player.vx = 0; player.vy = 0; player.onGround = true;
    player.safe = { x: player.x, y: player.y };
    state.companion.x = player.x + 15; state.companion.y = player.y - 16;
    player.jumps = 0; player.carrier = null; player.wallSide = 0;
    player.slideTime = 0; player.dashTime = 0; player.dashCooldown = 0;
    player.coyote = 0.09; player.jumpBuffer = 0;
    player.previousFeet = player.y + player.h;
    player.descentSpeed = 0; player.landingGrace = 0;
    player.h = player.normalHeight;
    player.invuln = 0;
    state.camera = clamp(player.x - 145, 0, Math.max(0, state.flagX - W + 255));
    if (state.meta.upgrades.shield && !restored) {
      player.power = 'shield'; player.powerTime = 6;
    }
    syncCompatibility();
  }

  function makeBoss(worldIndex, x) {
    const names = ['🐢', '☃️', '🐉', '👻', '🐉'];
    return {
      x, y: GROUND_Y - 51, w: 58, h: 51,
      hp: easier() ? 3 + Math.floor(worldIndex / 3) : (worldIndex === 2 ? 3 : 4),
      maxHp: easier() ? 3 + Math.floor(worldIndex / 3) : (worldIndex === 2 ? 3 : 4),
      vx: -1.05 - worldIndex * 0.12, vy: 0,
      alive: true, type: names[worldIndex], name: worlds[worldIndex].bossName,
      minX: x - 65, maxX: x + 120, cooldown: easier() ? 2.8 : 1.6,
      phase: 0, attack: 0, flash: 0, defeated: false, worldIndex, baseY: GROUND_Y - 51, chargeTimer: 0
    };
  }

  function startGame(useSave) {
    const saved = useSave ? readSave() : null;
    state.score = saved ? Number(saved.score) || 0 : 0;
    state.cookies = saved ? Number(saved.cookies) || 0 : 0;
    state.lives = saved ? clamp(Math.max(easier() ? 4 : 1, Number(saved.lives) || 3), 1, 9)
      : (easier() ? (state.meta.upgrades.heart ? 6 : 5) : (state.meta.upgrades.heart ? 5 : 4));
    state.unlocked = Math.max(state.unlocked, saved ? Number(saved.unlocked) || 1 : 1);
    const level = saved ? clamp(Number(saved.level) || 1, 1, TOTAL_LEVELS) : 1;
    const cp = saved && saved.checkpointReached ? Number(saved.checkpointX) || 1050 : 0;
    player.power = null; player.powerTime = 0; player.ammo = 0;
    makeLevel(level, cp, saved && level === Number(saved.level) ? saved : null);
    state.mode = 'playing';
    mario.running = true;
    mario.last = 0; mario.acc = 0;
    state.source = saved ? 'continue' : 'new';
    state.pendingReward = false;
    canvas.focus();
    sound('start');
    if (saved) notify('¡Continuamos tu aventura!');
    else notify('¡A recoger galletas!');
    saveSoon();
    syncCompatibility();
  }

  function marioLoad(level) {
    const n = clamp(Number(level) || 1, 1, TOTAL_LEVELS);
    state.score = 0; state.cookies = 0; state.lives = easier() ? (state.meta.upgrades.heart ? 6 : 5) : (state.meta.upgrades.heart ? 5 : 4); state.pendingReward = false;
    player.power = null; player.powerTime = 0; player.ammo = 0;
    makeLevel(n, 0);
    state.mode = 'playing';
    mario.running = true;
    state.source = 'new';
    saveSoon();
    syncCompatibility();
  }
  window.marioLoad = marioLoad;

  function saveSoon() {
    // Guardado inmediato en checkpoints/cambios y automático cada pocos segundos.
    writeSave();
  }

  function triggerCheckpoint() {
    if (!state.checkpoint) return;
    // Punto de control adicional al llegar a la arena: perder contra un jefe
    // no obliga a repetir el kilómetro anterior del recorrido.
    if (state.boss && state.checkpoint.reached) {
      const arenaCheckpoint = state.boss.minX - 170;
      if (state.checkpoint.x < arenaCheckpoint - 20 && player.x >= arenaCheckpoint) {
        state.checkpoint.x = arenaCheckpoint;
        player.safe = { x: arenaCheckpoint, y: GROUND_Y - player.normalHeight };
        notify('🏁 ¡Punto de control antes del jefe!');
        sound('checkpoint'); saveSoon();
      }
    }
    if (state.checkpoint.reached) return;
    if (player.x + player.w * 0.5 >= state.checkpoint.x) {
      state.checkpoint.reached = true;
      player.safe = { x: state.checkpoint.x, y: GROUND_Y - player.h };
      notify('🏁 ¡Punto de control guardado!');
      sound('checkpoint');
      saveSoon();
      burst(state.checkpoint.x, GROUND_Y - 35, '#ffe28a', 14);
    }
  }

  function activatePower() {
    if (!player.power) return;
    if (player.power === 'double') {
      player.powerTime = Math.max(player.powerTime, 9);
      player.jumps = Math.min(player.jumps, 1);
      notify('✨ ¡Doble salto activado!');
    } else if (player.power === 'shield') {
      player.powerTime = 9;
      notify('🛡️ ¡Escudo protector!');
    } else if (player.power === 'speed') {
      player.powerTime = 7;
      notify('💨 ¡Snoopy a toda velocidad!');
    } else if (player.power === 'shot') {
      player.powerTime = Math.max(player.powerTime, 10);
      player.ammo = Math.max(player.ammo, state.meta.upgrades.ammo ? 7 : 3);
      shoot();
    } else if (player.power === 'bird') {
      player.powerTime = Math.max(player.powerTime, easier() ? 12 : 9);
      notify('🐤 ¡Woodstock está listo para ayudar!');
    }
    sound('power');
  }

  function collectPower(item) {
    if (item.taken) return;
    item.taken = true;
    player.power = item.type;
    player.powerTime = item.type === 'shot' ? 12 : item.type === 'bird' ? (easier() ? 12 : 9) : 9;
    player.ammo = item.type === 'shot' ? (state.meta.upgrades.ammo ? 7 : 3) : 0;
    const labels = { double: 'Doble salto', shield: 'Escudo', speed: 'Supervelocidad', shot: 'Proyectiles', bird: 'Ayuda de Woodstock' };
    notify(`⭐ Poder obtenido: ${labels[item.type] || 'Poder especial'}`);
    sound('power');
    burst(item.x, item.y, '#fff0a6', 18);
  }

  function shoot() {
    if (player.power !== 'shot' || player.ammo <= 0 || player.shotCooldown > 0) return;
    state.shots.push({ x: player.x + (player.facing > 0 ? player.w : -8), y: player.y + 14, w: 13, h: 8, vx: player.facing * (state.meta.upgrades.ammo ? 8.6 : 6.2), life: 1.5, pierce: state.meta.upgrades.ammo ? 2 : 0, hitBoss: false });
    player.ammo--;
    player.shotCooldown = 0.28;
    sound('shoot');
  }

  function resetSlide() {
    if (player.h !== player.normalHeight) {
      const feet = player.y + player.h;
      // Evita levantarse dentro de una plataforma o un muro.
      const expanded = { x: player.x, y: feet - player.normalHeight, w: player.w, h: player.normalHeight };
      if (state.walls.concat(state.tunnels).some(w => rects(expanded, w))) return false;
      player.h = player.normalHeight; player.y = feet - player.h;
    }
    player.slideTime = 0;
    return true;
  }
  function jump() {
    if (player.slideTime > 0 && !resetSlide()) return false;
    if (player.wallSide && !player.onGround) {
      player.vy = JUMP_FORCE * 0.94;
      player.vx = -player.wallSide * 6.2;
      player.wallLock = 0.18;
      player.jumps = 1;
      player.wallSide = 0;
      player.coyote = 0;
      sound('jump');
      burst(player.x + player.w / 2, player.y + player.h, '#b4edff', 10);
      return true;
    }
    const grounded = player.onGround || (player.coyote || 0) > 0;
    if (grounded) player.jumps = 0;
    const hasDouble = state.meta.upgrades.double || (player.power === 'double' && player.powerTime > 0);
    const maxJumps = hasDouble ? 2 : 1;
    if (player.jumps >= maxJumps) return false;
    player.vy = player.jumps === 0 ? JUMP_FORCE : JUMP_FORCE * 0.9;
    player.jumps++;
    player.onGround = false;
    player.coyote = 0;
    player.carrier = null;
    sound('jump');
    burst(player.x + player.w / 2, player.y + player.h, '#ffffff', 4);
    return true;
  }
  function triggerDash() {
    if (player.dashCooldown > 0 || player.dashTime > 0) return;
    if (player.slideTime > 0) resetSlide();
    player.dashTime = 0.18;
    player.dashCooldown = state.meta.upgrades.dash ? 0.8 : 1.75;
    player.vx = 7.8 * player.facing;
    sound('dash');
    burst(player.x + 12, player.y + 17, '#d8f6ff', 12);
  }
  function triggerSlide() {
    if (!player.onGround || player.slideTime > 0 || player.dashTime > 0) return;
    const feet = player.y + player.h;
    player.h = 19;
    player.y = feet - player.h;
    player.slideTime = 0.43;
    sound('slide');
  }
  function handleWarp(dt) {
    if (!state.bonus) return;
    if (state.warpCooldown > 0) state.warpCooldown = Math.max(0, state.warpCooldown - dt);
    if (state.bonus.active) {
      state.bonus.remaining -= dt;
      if (state.bonus.remaining <= 0 || player.x > state.bonus.end - 36) {
        exitBonus();
      }
    }
    const keys = window.mkeys;
    if (!(keys.downPressed || keys.warpPressed)) return;
    keys.downPressed = false; keys.warpPressed = false;
    if (state.warpCooldown > 0 || !player.onGround) return;
    if (state.bonus.active) { exitBonus(); return; }
    const pipe = state.warpPipes.find(p => p.entrance !== state.bonus.active &&
      Math.abs((player.x + player.w / 2) - (p.x + p.w / 2)) < 47 &&
      (Math.abs(player.y + player.h - GROUND_Y) < 7 ||
       Math.abs(player.y + player.h - p.y) < 7));
    if (!pipe) return;
    if (pipe.entrance) {
      state.bonus.active = true;
      state.bonus.remaining = 25;
      player.slideTime = 0; player.h = player.normalHeight;
      player.x = state.bonus.start + 80;
      player.y = GROUND_Y - player.h;
      player.vx = 0; player.vy = 0;
      state.camera = Math.max(0, player.x - 145);
      state.warpCooldown = 0.6;
      notify('¡Tubería secreta! Recoge los tesoros · S para salir');
      burst(player.x, player.y, '#f9e077', 12);
      sound('secret');
      saveSoon();
    } else exitBonus();
  }
  function exitBonus() {
    if (!state.bonus || !state.bonus.active) return;
    state.bonus.active = false;
    player.slideTime = 0; player.h = player.normalHeight;
    const entrance = state.warpPipes.find(p => p.entrance);
    player.x = entrance ? entrance.x + entrance.w + 12 : 352;
    player.y = GROUND_Y - player.h;
    player.vx = 0; player.vy = 0;
    state.camera = 0;
    state.warpCooldown = 0.6;
    notify('¡Volviste del bonus!');
    sound('checkpoint');
    saveSoon();
  }
  function bumpBlock(block) {
    if (block.used) return;
    block.used = true; block.bump = 0.18;
    if (block.kind === 'coin') {
      state.cookies++; state.stats.cookies++; state.meta.wallet++;
      addScore(1); sound('coin'); notify('¡Moneda de bloque!');
      burst(block.x + 12, block.y - 6, '#ffe372', 10);
    } else {
      const kinds = ['double','shield','speed','shot','bird'];
      collectPower({ x: block.x + 12, y: block.y, type: kinds[(state.level - 1) % kinds.length], taken: false });
      notify('¡Poder del bloque sorpresa!');
    }
    saveSoon();
  }

  function getGroundAt(x, width) {
    return state.grounds.find(g => x + width > g.x && x < g.x + g.w) || null;
  }
  function movePlayer(dt) {
    const keys = window.mkeys;
    const left = !!(keys.left || keys.a || keys.ArrowLeft || keys['37']);
    const right = !!(keys.right || keys.d || keys.ArrowRight || keys['39']);

    if (keys.powerPressed) { activatePower(); keys.powerPressed = false; }
    if (keys.shootPressed) { shoot(); keys.shootPressed = false; }
    if (keys.dashPressed) { triggerDash(); keys.dashPressed = false; }
    if (keys.slidePressed) { triggerSlide(); keys.slidePressed = false; }
    if (keys.jumpPressed) { player.jumpBuffer = 0.11; keys.jumpPressed = false; }
    if (player.jumpBuffer > 0) player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
    player.landingGrace = Math.max(0, (player.landingGrace || 0) - dt);

    if (player.dashCooldown > 0) player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    if (player.wallLock > 0) player.wallLock = Math.max(0, player.wallLock - dt);
    player.coyote = player.onGround ? 0.09 : Math.max(0, (player.coyote || 0) - dt);
    if (player.jumpBuffer > 0 && jump()) player.jumpBuffer = 0;
    if (player.dashTime > 0) {
      player.dashTime -= dt;
      player.vx = 7.8 * player.facing;
      player.vy *= 0.75;
    } else if (player.slideTime > 0) {
      player.slideTime -= dt;
      player.vx = 5.6 * player.facing;
      if (player.slideTime <= 0 && !resetSlide()) player.slideTime = 0.1;
    } else if (!player.wallLock) {
      const maxSpeed = (player.power === 'speed' && player.powerTime > 0 ? MOVE_SPEED * 1.58 : MOVE_SPEED) * (keys.run ? 1.37 : 1);
      const dir = (right ? 1 : 0) - (left ? 1 : 0);
      const accel = player.onGround ? 0.15 : 0.085;
      if (dir) {
        player.vx += (dir * maxSpeed - player.vx) * accel;
        player.facing = dir > 0 ? 1 : -1;
      } else if (player.onGround) {
        player.vx *= 0.78;
        if (Math.abs(player.vx) < 0.08) player.vx = 0;
      } else {
        player.vx *= 0.992;
      }
    }

    if (player.carrier && player.onGround) player.x += player.carrier.dx || 0;
    const oldX = player.x;
    const oldY = player.y;
    player.previousFeet = oldY + player.h;
    player.x = Math.max(0, player.x + player.vx);
    player.wallSide = 0;
    for (const w of state.walls.concat(state.tunnels, state.warpPipes)) {
      if (!rects(player, w)) continue;
      if (player.vx > 0 && oldX + player.w <= w.x + 4) {
        player.x = w.x - player.w;
        player.wallSide = 1;
        if (player.dashTime > 0) player.dashTime = 0;
      } else if (player.vx < 0 && oldX >= w.x + w.w - 4) {
        player.x = w.x + w.w;
        player.wallSide = -1;
        if (player.dashTime > 0) player.dashTime = 0;
      }
    }
    for (const g of state.grounds) {
      if (!rects(player, g) || player.y + player.h <= g.y + 5) continue;
      if (player.vx > 0 && oldX + player.w <= g.x + 3) player.x = g.x - player.w;
      else if (player.vx < 0 && oldX >= g.x + g.w - 3) player.x = g.x + g.w;
    }
    if (player.wallSide && player.vy > 2.35) player.vy = 2.35;
    player.vy = Math.min(MAX_FALL, player.vy + GRAVITY);
    player.descentSpeed = player.vy; // conservar el descenso antes de caer sobre una plataforma
    player.y += player.vy;
    if (player.vy < 0) {
      for (const b of state.blocks) {
        if (player.x + player.w <= b.x + 2 || player.x >= b.x + b.w - 2) continue;
        if (oldY >= b.y + b.h - 4 && player.y <= b.y + b.h) {
          player.y = b.y + b.h; player.vy = 1.7; bumpBlock(b); break;
        }
      }
    }
    player.onGround = false;
    player.carrier = null;

    const solids = state.grounds.concat(state.platforms, state.walls, state.tunnels, state.warpPipes, state.blocks);
    let landing = null;
    for (const surface of solids) {
      const overlapX = player.x + player.w > surface.x && player.x < surface.x + surface.w;
      const crossedTop = oldY + player.h <= surface.y + 6 && player.y + player.h >= surface.y;
      if (overlapX && player.vy >= 0 && crossedTop && (!landing || surface.y < landing.y)) landing = surface;
    }
    if (landing) {
      player.y = landing.y - player.h;
      // Una décima de segundo para resolver los pisotones que coinciden con
      // el contacto en una plataforma; no protege de choques laterales.
      if (player.descentSpeed > 0.8) player.landingGrace = 0.10;
      player.vy = 0;
      player.onGround = true;
      player.coyote = 0.09;
      player.jumps = 0;
      player.wallSide = 0;
      if (landing.moving) player.carrier = landing;
      if (player.jumpBuffer > 0 && jump()) player.jumpBuffer = 0;
    }
    if (player.y > H + 75) marioHurt('caída');
    if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
    if (player.powerTime > 0) {
      player.powerTime -= dt;
      if (player.powerTime <= 0) {
        player.powerTime = 0;
        player.power = null;
        player.ammo = 0;
        notify('El poder se ha agotado');
      }
    }
    if (player.shotCooldown > 0) player.shotCooldown = Math.max(0, player.shotCooldown - dt);
    player.anim += Math.abs(player.vx) * dt * 0.25;
    if (!state.bonus?.active) triggerCheckpoint();
  }

  function updatePlatforms(dt) {
    for (const p of state.platforms) {
      p.dx = 0; p.dy = 0;
      if (!p.moving) continue;
      const oldY = p.y, oldX = p.x;
      p.phase += dt * 1.1;
      if (p.horizontal) p.x = p.baseX + Math.sin(p.phase) * 24;
      else p.y = p.baseY + Math.sin(p.phase) * 17;
      p.dx = p.x - oldX;
      p.dy = p.y - oldY;
    }
  }

  function spawnDefeatEffect(enemy, boss) {
    if (!enemy || !state.defeatFx) return;
    state.defeatFx.push({
      type: enemy.type, worldIndex: boss ? enemy.worldIndex : -1,
      x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h,
      facing: enemy.vx < 0 ? -1 : 1, remaining: boss ? 0.85 : 0.42,
      duration: boss ? 0.85 : 0.42
    });
  }
  function updateDefeatFx(dt) {
    for (const e of state.defeatFx) e.remaining -= dt;
    state.defeatFx = state.defeatFx.filter(e => e.remaining > 0);
  }

  // El acompañante utiliza su propio atlas y proyectiles. No consume poderes de Snoopy.
  function acquireBirdTarget() {
    const bird = state.companion;
    let best = null, distance = Infinity;
    for (const foe of state.foes) {
      if (!foe.alive) continue;
      const d = Math.hypot(foe.x + foe.w / 2 - bird.x, (foe.y + foe.h / 2 - bird.y) * 1.18);
      // Evita ataques desde el otro extremo de la pantalla o de la sala secreta.
      if (d < BIRD_RANGE && Math.abs(foe.x - player.x) < 210 && d < distance) {
        best = foe; distance = d;
      }
    }
    if (state.boss && state.boss.alive) {
      const boss = state.boss;
      const d = Math.hypot(boss.x + boss.w / 2 - bird.x, boss.y + boss.h / 2 - bird.y);
      if (d < BIRD_RANGE && Math.abs(boss.x - player.x) < 220 && (best === null || d < distance * 1.15)) best = boss;
    }
    return best;
  }

  function birdCombatActive() {
    return player.power === 'bird' && player.powerTime > 0;
  }

  function updateCompanion(dt) {
    const bird = state.companion;
    if (!bird) return;
    const restX = player.x + player.w / 2 + player.facing * 18;
    const restY = player.y - 16 + Math.sin(state.time * 7) * 3;
    // Vuelo amortiguado para que el pájaro siga al jugador incluso cuando salta.
    bird.x += (restX - bird.x) * Math.min(1, dt * 10);
    bird.y += (restY - bird.y) * Math.min(1, dt * 10);
    bird.attackTimer = Math.max(0, bird.attackTimer - dt);
    bird.cooldown = Math.max(0, bird.cooldown - dt);
    bird.guardCooldown = Math.max(0, (bird.guardCooldown || 0) - dt);
    bird.activeTime = birdCombatActive() ? player.powerTime : 0;
    if (!birdCombatActive() || state.bonus?.active || state.mode !== 'playing' || bird.cooldown > 0) return;
    const target = acquireBirdTarget();
    bird.target = target;
    if (!target) return;
    const tx = target.x + target.w / 2;
    const ty = target.y + target.h / 2;
    const length = Math.max(1, Math.hypot(tx - bird.x, ty - bird.y));
    bird.attackTimer = 0.33;
    bird.cooldown = easier() ? 1.45 : BIRD_COOLDOWN;
    state.birdShots.push({ x: bird.x, y: bird.y - 6, w: 10, h: 10,
      vx: (tx - bird.x) / length * 4.8, vy: (ty - bird.y) / length * 4.8,
      target, life: 1.15, trail: 0 });
    sound('bird');
    burst(bird.x, bird.y - 6, '#ffeb72', 4);
  }

  function updateBirdShots(dt) {
    for (const shot of state.birdShots) {
      if (shot.life <= 0) continue;
      const target = shot.target;
      if (target && target.alive && !state.bonus?.active) {
        const dx = target.x + target.w / 2 - shot.x;
        const dy = target.y + target.h / 2 - shot.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        shot.vx += ((dx / length) * 6.5 - shot.vx) * 0.16;
        shot.vy += ((dy / length) * 6.5 - shot.vy) * 0.16;
      }
      shot.x += shot.vx;
      shot.y += shot.vy;
      shot.life -= dt;
      const hitbox = { x: shot.x - 5, y: shot.y - 5, w: shot.w, h: shot.h };
      // Solo daña al objetivo elegido; nunca al jugador ni a amigos.
      if (!target || !target.alive || !rects(hitbox, target) || state.bonus?.active) continue;
      shot.life = 0;
      if (target === state.boss) {
        target.hp = Math.max(0, target.hp - (easier() ? 1 : 0.75));
        target.flash = 0.22;
        state.companion.bossHits++;
        if (state.companion.bossHits === 1) notify('🐤 ¡Tu pajarito está ayudando contra el jefe!');
        burst(shot.x, shot.y, '#fdef75', 10);
        sound('bossHit');
        if (target.hp <= 0) defeatBoss();
      } else {
        spawnDefeatEffect(target, false);
        target.alive = false;
        state.stats.defeats++;
        state.companion.kills++;
        if (state.companion.kills === 1) notify('🐤 ¡Tu pajarito derrotó a un enemigo!');
        addScore(2);
        burst(shot.x, shot.y, '#ffef8a', 9);
        sound('stomp');
      }
    }
    state.birdShots = state.birdShots.filter(s => s.life > 0 && s.x > player.x - 280 && s.x < player.x + 300);
  }

  // Detectar contacto desde arriba usando el descenso ANTES de aterrizar.
  // La versión anterior exigía una franja de 10 px y podía castigar al jugador
  // aun cuando descendía sobre una abeja o sobre una plataforma vecina.
  function canStompEnemy(enemy) {
    const descending = player.descentSpeed > 0.45 || player.landingGrace > 0;
    const feet = player.y + player.h;
    const oldFeet = Number.isFinite(player.previousFeet) ? player.previousFeet : feet;
    const nearUpperSurface = feet <= enemy.y + enemy.h * 0.96;
    const cameFromAbove = oldFeet <= enemy.y + enemy.h * 0.86 + 4;
    const bodyMostlyAbove = player.y + player.h * 0.50 < enemy.y + enemy.h * 0.55;
    return descending && player.y < enemy.y && nearUpperSurface &&
      (cameFromAbove || bodyMostlyAbove);
  }

  // Tortugas terrestres: caminan hasta encontrar una pared, tubería, pinchos
  // o el borde del suelo, se detienen ante el obstáculo y regresan.
  // No persiguen al jugador ni crean proyectiles.
  function updateTurtlePatrol(foe) {
    const ground = state.grounds.find(g => g.type !== 'bonus' &&
      foe.x + foe.w / 2 >= g.x - 1 && foe.x + foe.w / 2 <= g.x + g.w + 1 &&
      Math.abs(foe.y + foe.h - g.y) < 3);
    if (!ground) {
      // Respaldo para datos de un escenario cargado desde una versión anterior.
      foe.vx = -(foe.vx || 0.7);
      return;
    }
    const leftLimit = ground.x + 5;
    const rightLimit = Math.max(leftLimit + 1, ground.x + ground.w - foe.w - 5);
    const speed = clamp(Math.abs(foe.vx) || 0.75, 0.5, easier() ? 0.88 : 1.15);
    let direction = Math.sign(foe.vx) || 1;
    let nextX = foe.x + direction * speed;
    let turn = (direction > 0 && nextX >= rightLimit) ||
      (direction < 0 && nextX <= leftLimit);
    nextX = clamp(nextX, leftLimit, rightLimit);
    // Se detecta el choque con la parte física de cada obstáculo, no con el
    // dibujo de fondo. Los bloques elevados no bloquean a las tortugas.
    const blockers = state.walls.concat(state.tunnels, state.warpPipes, state.hazards, state.blocks);
    for (const obstacle of blockers) {
      if (foe.y + foe.h <= obstacle.y + 1 || foe.y >= obstacle.y + obstacle.h - 1) continue;
      if (direction > 0 && foe.x + foe.w <= obstacle.x + 2 &&
          nextX + foe.w >= obstacle.x - 2) {
        nextX = Math.min(nextX, obstacle.x - foe.w - 2);
        turn = true;
      } else if (direction < 0 && foe.x >= obstacle.x + obstacle.w - 2 &&
          nextX <= obstacle.x + obstacle.w + 2) {
        nextX = Math.max(nextX, obstacle.x + obstacle.w + 2);
        turn = true;
      }
    }
    foe.x = clamp(nextX, leftLimit, rightLimit);
    if (turn) direction *= -1;
    foe.vx = direction * speed;
    foe.ai = 'patrol';
  }

  function updateEnemies(dt) {
    for (const foe of state.foes) {
      if (!foe.alive) continue;
      const behavior = enemyBehavior(foe.type);
      const direction = Math.sign(foe.vx || 1);
      const playerDist = player.x - foe.x;
      foe.hitFlash = Math.max(0, foe.hitFlash - dt);
      foe.attackFlash = Math.max(0,(foe.attackFlash||0)-dt);
      if (behavior==='patrol' || behavior==='slide' || behavior==='bounce' || behavior==='guard') {
        if (behavior==='guard') { // Muñeco de nieve: centinela inmóvil, aviso al disparar.
          foe.vx=0;
        } else {
          const speed=behavior==='slide' ? (easier()?.87:1.2) : behavior==='bounce' ? .64 : .75;
          const next=foe.x+direction*speed;
          const within=next>=foe.minX && next<=foe.maxX;
          const obstacle=state.walls.concat(state.tunnels,state.warpPipes)
            .some(o=>next<o.x+o.w+3 && next+foe.w>o.x-3 && foe.y+foe.h>o.y+2);
          const supportedNext=state.grounds.some(g=>g.type!=='bonus' && next+foe.w/2>=g.x+6 && next+foe.w/2<g.x+g.w-6);
          if (within&&!obstacle&&supportedNext) foe.x=next;
          else foe.vx=-direction*speed;
        }
        if(behavior==='bounce') foe.y=foe.baseY-Math.abs(Math.sin(state.time*3.3+foe.phase))*10;
      } else {
        // Voladores: órbitas legibles, sin perseguir al jugador sobre plataformas.
        const speed=behavior==='swoop' ? .9 : behavior==='hover' ? .65 : .55;
        foe.x+=direction*speed;
        if(foe.x<=foe.minX||foe.x>=foe.maxX){foe.x=clamp(foe.x,foe.minX,foe.maxX);foe.vx=-direction*speed;}
        const amplitude=behavior==='swoop'?20:behavior==='phase'?9:12;
        const frequency=behavior==='swoop'?2.15:behavior==='orbital'?1.65:2.5;
        foe.y=foe.baseY+Math.sin(state.time*frequency+foe.phase)*amplitude;
      }
      // Solo los enemigos que tienen un ataque propio disparan. Abejas, tortugas,
      // pingüinos, murciélagos y fantasmas no producen balas inesperadas.
      if ((behavior==='guard'||behavior==='orbital'||behavior==='bounce') &&
          Math.abs(playerDist)<(behavior==='guard'?175:160) &&
          Math.abs(player.y-foe.y)<115) {
        foe.cooldown-=dt;
        if(foe.cooldown<=0){
          foe.cooldown=(behavior==='guard'?3.1:behavior==='bounce'?2.8:2.4)*(easier()?1.4:1);
          foe.attackFlash=.35;
          const dir=Math.sign(playerDist)||1;
          state.shots.push({x:foe.x+10,y:foe.y+9,w:9,h:9,
            vx:dir*(behavior==='guard'?1.75:2.25),
            vy:clamp((player.y-foe.y)/170,-.45,.45),life:1.6,hostile:true});
        }
      }
      if (rects(player,foe)) {
        const stomp=canStompEnemy(foe);
        if(stomp||player.dashTime>0){
          spawnDefeatEffect(foe,false);foe.alive=false;
          if(stomp){player.vy=-7.8;player.onGround=false;player.landingGrace=0;player.invuln=Math.max(player.invuln,.18);}
          state.stats.defeats++;addScore(2);burst(foe.x+13,foe.y+13,'#fff0a6',10);sound('stomp');
        } else if (player.invuln<=0 && !(player.power==='shield' && player.powerTime>0)) {
          marioHurt('enemigo');
        } else if (player.power==='shield' && player.powerTime>0){
          spawnDefeatEffect(foe,false);foe.alive=false;state.stats.defeats++;burst(foe.x+13,foe.y+13,'#9ceaff',9);
        }
      }
    }
  }

  function updateHazards() {
    for (const hazard of state.hazards) {
      if (player.invuln <= 0 && rects(player, hazard)) marioHurt('obstáculo');
    }
  }

  function updateBoss(dt) {
    const boss = state.boss;
    if (!boss || !boss.alive) return;
    boss.x += boss.vx;
    if (boss.x < boss.minX || boss.x > boss.maxX) {
      boss.x = clamp(boss.x, boss.minX, boss.maxX);
      boss.vx = Math.abs(boss.vx) * (boss.x === boss.minX ? 1 : -1);
    }
    boss.cooldown -= dt;
    boss.flash = Math.max(0, boss.flash - dt);
    boss.phase += dt;
    if (boss.worldIndex === 3) boss.y = boss.baseY + Math.sin(boss.phase * 1.8) * 17;
    if (boss.worldIndex === 0 && (boss.chargeTimer || 0) > 0) {
      boss.chargeTimer = Math.max(0, boss.chargeTimer - dt);
      if (boss.chargeTimer === 0) boss.vx = Math.sign(boss.vx || -1) * 1.05;
    }
    if (boss.cooldown <= 0 && Math.abs(player.x - boss.x) < 310) {
      boss.cooldown = Math.max(0.62, (1.75 - state.world * 0.1) * (boss.hp <= boss.maxHp / 2 ? 0.82 : 1)) * (easier() ? 1.95 : 1.15);
      if (boss.worldIndex === 0) {
        // La tortuga gigante del bosque no dispara: acelera al embestir y
        // regresa al llegar al límite de su arena de combate.
        boss.cooldown = easier() ? 3.4 : 2.65;
        boss.chargeTimer = easier() ? 0.62 : 0.88;
        boss.vx = Math.sign(boss.vx || -1) * (easier() ? 2.0 : 2.45);
        burst(boss.x + boss.w / 2, boss.y + boss.h, '#b6dc8b', 8);
        sound('dash');
        boss.attack = (boss.attack + 1) % 3;
      } else {
      const direction = player.x < boss.x ? -1 : 1;
      const originX = boss.x + (direction < 0 ? 0 : boss.w);
      const originY = boss.y + 22;
      const makeHostile = (vy, speed, width, height, offsetY) => state.shots.push({
        x: originX, y: originY + (offsetY || 0), w: width || 14, h: height || 12,
        vx: direction * speed * (easier() ? 0.78 : 1), vy: (vy || 0) * (easier() ? 0.82 : 1), life: 2.5, hostile: true
      });
      // Cada guardián tiene un patrón distinto y legible.
      if (boss.worldIndex === 1) {
        // Monstruo de hielo: una bola inicial, dos en su segunda fase.
        // Las trayectorias quedan anunciadas por un gesto antes del ataque.
        const tracks=boss.hp>boss.maxHp/2?[0]:[-0.65,0.65];
        tracks.forEach(vy => makeHostile(vy, 2.05, 14, 14, 0));
      } else if (boss.worldIndex === 2) {
        // Dragón: tres llamas con trayectorias diagonales.
        [-1.05, 0, 1.05].forEach(vy => makeHostile(vy, 3.05, 15, 13, vy * 4));
      } else if (boss.worldIndex === 3) {
        // Fantasma: dos orbes que cubren alturas diferentes.
        makeHostile(player.y < boss.y ? -0.65 : 0.65, 2.35, 15, 15, -7);
        makeHostile(player.y < boss.y ? 0.65 : -0.65, 2.35, 15, 15, 9);
      } else {
        // Dragón estelar: abanico de cinco estrellas.
        [-1.25, -0.65, 0, 0.65, 1.25].forEach(vy => makeHostile(vy, 2.85, 12, 12, 0));
      }
      // Segunda fase del jefe: un disparo adicional y ritmo más exigente.
      if (!easier() && boss.hp <= boss.maxHp / 2) makeHostile(boss.attack % 2 ? -1.2 : 1.2, 3.7, 12, 12, -10);
      boss.attack = (boss.attack + 1) % 3;
      sound('boss');
      }
    }
    if (rects(player, boss)) {
      const stomp = canStompEnemy(boss);
      if (stomp && player.invuln <= 0) {
        boss.hp--;
        boss.flash = 0.22;
        player.vy = -8.3;
        player.invuln = 0.32;
        burst(boss.x + boss.w / 2, boss.y, '#ffe38c', 12);
        sound('bossHit');
        if (boss.hp <= 0) defeatBoss();
      } else if (!stomp && player.invuln <= 0) {
        if (player.power === 'shield' && player.powerTime > 0) {
          boss.hp--;
          boss.flash = 0.2;
          player.invuln = 0.5; // Una colisión no consume varios puntos del jefe.
          if (boss.hp <= 0) defeatBoss();
        } else marioHurt('jefe');
      }
    }
  }

  function updateShots(dt) {
    for (const shot of state.shots) {
      shot.x += shot.vx;
      shot.y += shot.vy || 0;
      shot.life -= dt;
      // El pajarito también protege a Snoopy: bloquea ocasionalmente un disparo
      // que se aproxima, sin hacer invulnerable al jugador todo el tiempo.
      if (shot.hostile && shot.life > 0 && birdCombatActive() && state.companion &&
          state.companion.guardCooldown <= 0 &&
          shot.x < player.x + player.w + 34 && shot.x + shot.w > player.x - 26 &&
          shot.y < player.y + player.h + 10 && shot.y + shot.h > player.y - 10 &&
          Math.hypot(shot.x - state.companion.x, shot.y - state.companion.y) < 125) {
        shot.life = 0;
        state.companion.guardCooldown = easier() ? 1.7 : 1.55;
        state.companion.blocks = (state.companion.blocks || 0) + 1;
        burst(shot.x, shot.y, '#ffe77a', 8);
        sound('shield');
        continue;
      }
      if (shot.hostile && rects(player, shot) && player.invuln <= 0) {
        if (player.power === 'shield' && player.powerTime > 0) {
          shot.life = 0;
          burst(shot.x, shot.y, '#9ceaff', 6);
        } else {
          shot.life = 0;
          marioHurt('proyectil');
        }
      } else if (!shot.hostile) {
        for (const foe of state.foes) {
          if (foe.alive && rects(shot, foe)) {
            spawnDefeatEffect(foe, false);
            foe.alive = false;
            state.stats.defeats++;
            if (shot.pierce > 0) shot.pierce--; else shot.life = 0;
            addScore(2);
            burst(foe.x, foe.y, '#fff0a6', 8);
            break;
          }
        }
        const boss = state.boss;
        if (boss && boss.alive && !shot.hitBoss && shot.life > 0 && rects(shot, boss)) {
          boss.hp--; boss.flash = 0.2; shot.hitBoss = true;
          if (!shot.pierce) shot.life = 0;
          burst(boss.x + boss.w / 2, boss.y + 10, '#ffe38c', 7);
          if (boss.hp <= 0) defeatBoss();
        }
      }
    }
    state.shots = state.shots.filter(s => s.life > 0 && s.x > state.camera - 40 && s.x < state.camera + W + 50);
  }

  function collectItems() {
    for (const c of state.cookiesOnMap) {
      if (c.taken) continue;
      const hit = { x: c.x - 8, y: c.y - 8, w: 16, h: 16 };
      const reach = state.meta.upgrades.magnet ? 40 : (easier() ? 18 : 10);
      if (rects({ x: player.x - reach, y: player.y - reach, w: player.w + reach * 2, h: player.h + reach * 2 }, hit)) {
        c.taken = true;
        state.cookies++;
        state.stats.cookies++;
        state.meta.wallet++;
        addScore(1);
        sound('coin');
        burst(c.x, c.y, '#ffd86b', 5);
        saveSoon(); // Persiste la moneda y marca su galleta como recogida.
      }
    }
    for (const secret of state.secrets) {
      if (secret.taken || !rects(player, { x: secret.x - 12, y: secret.y - 12, w: 24, h: 24 })) continue;
      secret.taken = true;
      state.stats.secrets++;
      state.meta.wallet += 5;
      addScore(7);
      sound('secret');
      notify('💎 ¡Secreto encontrado! +5 monedas');
      burst(secret.x, secret.y, '#f9e07b', 18);
      saveSoon();
    }
    for (const item of state.powerups) {
      if (!item.taken && rects(player, { x: item.x - 12, y: item.y - 12, w: 24, h: 24 })) {
        collectPower(item); saveSoon();
      }
    }
  }

  function updateChallenge() {
    if (state.stats.challenges) return;
    const type = state.level % 3;
    const success = type === 1 ? state.stats.defeats >= 3 :
      type === 2 ? state.stats.cookies >= 12 : state.stats.secrets >= 1;
    if (!success) return;
    state.stats.challenges = 1;
    state.meta.wallet += 7;
    notify('🏅 ¡Reto extra completado! +7 monedas');
    sound('win');
    saveSoon();
  }
  function challengeLabel() {
    const type = state.level % 3;
    return type === 1 ? `Derrota 3 enemigos (${Math.min(3,state.stats.defeats)}/3)` :
      type === 2 ? `Recoge 12 galletas (${Math.min(12,state.stats.cookies)}/12)` :
      `Encuentra 1 secreto (${Math.min(1,state.stats.secrets)}/1)`;
  }
  function awardStars() {
    const stars = 1 + (state.stats.cookies >= Math.ceil(state.cookiesOnMap.length * 0.6) ? 1 : 0) +
      (state.stats.hits === 0 || state.stats.secrets > 0 ? 1 : 0);
    state.lastStars = stars;
    state.meta.stars[state.level] = Math.max(state.meta.stars[state.level] || 0, stars);
    if (!state.meta.bestTimes[state.level] || state.levelTime < state.meta.bestTimes[state.level])
      state.meta.bestTimes[state.level] = Math.round(state.levelTime * 10) / 10;
    writeMeta();
  }

  function addScore(amount) {
    state.score += amount;
    state.best = Math.max(state.best, state.score);
    safeStoreSet(BEST_KEY, String(state.best));
    syncCompatibility();
  }

  function defeatBoss() {
    if (!state.boss || !state.boss.alive) return;
    spawnDefeatEffect(state.boss, true);
    state.boss.alive = false;
    state.boss.defeated = true;
    addScore(15);
    state.unlocked = Math.max(state.unlocked, Math.min(TOTAL_LEVELS, state.level + 1));
    notify(`🏆 ¡Derrotaste a ${state.boss.name}!`);
    sound('bossWin');
    confettiBurst();
    saveSoon();
  }

  function marioHurt(reason) {
    if (player.invuln > 0 || state.mode !== 'playing') return;
    if (state.bonus?.active) exitBonus();
    if (player.power === 'shield' && player.powerTime > 0) {
      player.power = null; player.powerTime = 0;
      player.invuln = easier() ? 1.2 : 0.8;
      notify('🛡️ ¡El escudo te protegió!');
      burst(player.x + 12, player.y + 15, '#9ceaff', 15);
      sound('shield');
      return;
    }
    state.lives--;
    state.stats.hits++;
    player.invuln = easier() ? 2.3 : 2.05;
    state.birdShots = [];
    sound('hurt');
    if (state.lives <= 0) {
      state.lives = 0;
      state.mode = 'gameover';
      mario.running = false;
      writeSave();
      syncCompatibility();
      return;
    }
    player.h = player.normalHeight; player.slideTime = 0; player.dashTime = 0;
    player.x = player.safe.x;
    player.y = player.safe.y;
    player.vx = 0; player.vy = -2;
    player.descentSpeed = 0; player.landingGrace = 0;
    player.previousFeet = player.y + player.h;
    state.companion.x = player.x + 15; state.companion.y = player.y - 16;
    state.companion.target = null;
    state.camera = clamp(player.x - 110, 0, 99999);
    notify(reason === 'caída' ? '¡Cuidado con los huecos!' : '¡Perdiste un corazón!');
    syncCompatibility();
    saveSoon();
  }
  window.marioHurt = marioHurt;

  function nextLevel() {
    awardStars();
    if (state.level >= TOTAL_LEVELS) {
      state.mode = 'victory';
      mario.running = false;
      finishRewards();
      return;
    }
    state.unlocked = Math.max(state.unlocked, state.level + 1);
    // Premio por completar un nivel: recuperas una vida (hasta el máximo del modo).
    // Así una equivocación anterior no arruina una aventura de quince niveles.
    state.lives = Math.min(easier() ? 5 : 4, state.lives + 1);
    safeStoreSet(PROGRESS_KEY, String(state.unlocked));
    if (state.level >= 3 && typeof window.unlock === 'function') {
      try { window.unlock('mario-l3'); } catch (_) { /* integración opcional */ }
    }
    state.mode = 'levelClear';
    state.transitionTimer = 1.7;
    mario.running = false;
    writeSave();
    sound('win');
  }

  function finishRewards() {
    if (state.pendingReward) return;
    state.pendingReward = true;
    writeMeta();
    const reward = Math.floor(state.score / 3);
    if (reward > 0 && typeof window.earn === 'function') {
      try { window.earn(reward, true); } catch (_) { /* compatible con versiones distintas */ }
    }
    safeStoreSet(PROGRESS_KEY, String(TOTAL_LEVELS));
    safeStoreSet(BEST_KEY, String(Math.max(state.best, state.score)));
    try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* no bloquear victoria */ }
    if (typeof window.confetti === 'function') {
      try { window.confetti(); } catch (_) { /* decoración opcional */ }
    }
  }

  function marioEnd(reason) {
    mario.running = false;
    if (reason === 'win' || state.mode === 'victory') finishRewards();
    else writeSave();
  }
  window.marioEnd = marioEnd;

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      state.particles.push({ x, y, vx: rand(-2.2, 2.2), vy: rand(-3.2, -0.3), life: rand(0.25, 0.75), max: 0.75, color, size: rand(2, 4) });
    }
  }
  function confettiBurst() {
    for (let i = 0; i < 45; i++) state.particles.push({ x: player.x + 20, y: player.y, vx: rand(-4, 4), vy: rand(-5, -1), life: rand(0.7, 1.5), max: 1.5, color: ['#ffd166', '#ef8eae', '#9bdcf5', '#a4d88a'][i % 4], size: rand(3, 6) });
  }

  function marioStep(dtMs) {
    const dt = clamp((Number(dtMs) || 16.67) / 1000, 0.001, 0.05);
    if (state.mode !== 'playing' || !mario.running) return;
    state.time += dt;
    state.levelTime += dt;
    updateMusic(dt);
    updateDefeatFx(dt);
    updatePlatforms(dt);
    movePlayer(dt);
    handleWarp(dt);
    if (state.mode !== 'playing') return;
    updateHazards();
    if (state.mode !== 'playing') return;
    if (!state.bonus?.active) updateEnemies(dt);
    if (!state.bonus?.active) updateBoss(dt);
    updateCompanion(dt);
    updateBirdShots(dt);
    updateShots(dt);
    if (state.mode !== 'playing') return;
    collectItems();
    updateChallenge();
    for (const b of state.blocks) if (b.bump > 0) b.bump -= dt;
    for (const p of state.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= dt; }
    state.particles = state.particles.filter(p => p.life > 0);
    // Cámara clásica (como en la versión 2.11): sigue a Snoopy sin
    // anticipación de dirección ni interpolación que provoque retrasos.
    state.camera = clamp(player.x - 145, 0,
      state.bonus?.active ? state.bonus.end - W + 80 : Math.max(0, state.flagX - W + 255));
    if (state.toastTimer > 0) state.toastTimer -= dt;

    const bossDone = !state.boss || !state.boss.alive;
    if (!state.bonus?.active && player.x + player.w >= state.flagX && bossDone) nextLevel();
    if (Date.now() - state.saveAt > 8000) writeSave();
    syncCompatibility();
  }
  window.marioStep = marioStep;

  function roundRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function pixelCloud(x, y, s) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 4*s, y, 10*s, 5*s);
    ctx.fillRect(x + 1*s, y + 4*s, 16*s, 5*s);
    ctx.fillRect(x, y + 9*s, 18*s, 5*s);
    ctx.fillRect(x + 3*s, y + 14*s, 12*s, 4*s);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.fillRect(x + 3*s, y + 5*s, 2*s, 2*s);
  }
  function hillShape(x, y, w, h, body, spots) {
    roundRect(x, y, w, h, 22, body, '#2b4c29');
    ctx.fillStyle = spots;
    ctx.beginPath(); ctx.ellipse(x + w*0.33, y + h*0.45, w*0.13, h*0.16, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + w*0.63, y + h*0.36, w*0.1, h*0.12, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillRect(x + w*0.38, y + h*0.48, 4, 8); ctx.fillRect(x + w*0.56, y + h*0.48, 4, 8);
    ctx.fillRect(x + w*0.44, y + h*0.68, 18, 3);
  }
  function drawBrickTile(x, y, w, h, top, body, mortar) {
    ctx.fillStyle = body; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = top; ctx.fillRect(x, y, w, 3);
    ctx.strokeStyle = mortar; ctx.lineWidth = 1;
    for (let yy = y + 8; yy < y + h; yy += 8) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
    const rows = Math.max(1, Math.floor(h / 8));
    for (let row = 0; row < rows; row++) {
      const yy = y + row * 8;
      const off = row % 2 ? 6 : 0;
      for (let xx = x + off; xx < x + w; xx += 12) { ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, Math.min(y + h, yy + 8)); ctx.stroke(); }
    }
  }
  function drawPipe(x, y, w, h) {
    ctx.fillStyle = '#1f9b35'; ctx.fillRect(x, y + 7, w, h - 7);
    ctx.fillStyle = '#41c857'; ctx.fillRect(x + 4, y + 10, Math.max(4, w - 8), h - 13);
    ctx.fillStyle = '#28ad3f'; ctx.fillRect(x - 4, y, w + 8, 10);
    ctx.fillStyle = '#76ef7e'; ctx.fillRect(x, y + 2, w, 3);
    ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(x + w - 8, y + 7, 4, h - 7);
    ctx.strokeStyle = '#0f611f'; ctx.strokeRect(x - 4, y, w + 8, 10);
  }
  function drawQuestionBlock(x, y, bob, color) {
    ctx.fillStyle = color || '#d89a3f'; ctx.fillRect(x, y + bob, 24, 24);
    ctx.fillStyle = '#f7cc68'; ctx.fillRect(x + 2, y + 2 + bob, 20, 4);
    ctx.strokeStyle = '#8e5a12'; ctx.lineWidth = 1; ctx.strokeRect(x, y + bob, 24, 24);
    ctx.fillStyle = '#fff3b0'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', x + 12, y + 13 + bob);
  }

  // Los cinco mundos tienen siluetas, iluminación y elementos propios.
  // Los adornos de fondo NO son obstáculos: solo los elementos de drawTerrain colisionan.
  function drawBackground(world, camera) {
    const theme = world.decor;
    const skies = {
      forest:['#69b9ff','#b5e7ff'], snow:['#93d4f7','#e1f7ff'],
      candy:['#ef9ed2','#ffe1f0'], haunted:['#292544','#66537c'],
      stars:['#0b1950','#526ab3']
    };
    const sky = skies[theme] || skies.forest;
    ctx.fillStyle = sky[0]; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = sky[1]; ctx.fillRect(0,128,W,GROUND_Y-128);
    const parallax = (n, speed, period) => ((n-camera*speed)%period+period)%period;
    if (theme==='forest') {
      // Nubes, colinas verdes y arbustos: todo se mueve a distinta velocidad.
      for (let i=0;i<6;i++) pixelCloud(parallax(i*123,.19,730)-55,27+(i%3)*19,1.2);
      for (let i=0;i<5;i++) {
        const x=parallax(i*155,.12,800)-110;
        hillShape(x,162+(i%2)*8,115,66,'#52a66a','#76cd74');
      }
      for (let i=0;i<9;i++) {
        const x=parallax(i*91,.38,820)-40;
        ctx.fillStyle='#805b38'; ctx.fillRect(x+17,163,11,64);
        ctx.fillStyle='#2d8d56'; ctx.fillRect(x+1,151,42,17);
        ctx.fillStyle='#3ba961'; ctx.fillRect(x+7,140,31,15);
        ctx.fillStyle='#75c86b'; ctx.fillRect(x+12,136,18,5);
      }
    } else if (theme==='snow') {
      // Picos nevados escalonados, con nieve y pinos azulados.
      for (let i=0;i<5;i++) pixelCloud(parallax(i*149,.12,770)-80,22+(i%2)*23,.95);
      for (let i=0;i<6;i++) {
        const x=parallax(i*141,.18,870)-95;
        ctx.fillStyle='#7cbbd4'; ctx.beginPath(); ctx.moveTo(x,223);ctx.lineTo(x+59,105+(i%3)*10);ctx.lineTo(x+118,223);ctx.fill();
        ctx.fillStyle='#f1fcff'; ctx.beginPath();ctx.moveTo(x+40,144+(i%3)*7);ctx.lineTo(x+59,105+(i%3)*10);ctx.lineTo(x+78,144+(i%3)*7);ctx.lineTo(x+63,139);ctx.lineTo(x+55,145);ctx.fill();
      }
      for (let i=0;i<11;i++) {
        const x=parallax(i*82,.41,880)-40;
        ctx.fillStyle='#5b92ae'; ctx.fillRect(x+12,191,5,35);
        ctx.fillStyle='#5ca7ac'; ctx.beginPath(); ctx.moveTo(x-5,210);ctx.lineTo(x+15,162);ctx.lineTo(x+35,210);ctx.fill();
        ctx.fillStyle='#e9fbff';ctx.fillRect(x+5,178,20,3);
      }
    } else if (theme==='candy') {
      // Cúpulas glaseadas, bastones de caramelo y piruletas en el horizonte.
      for (let i=0;i<6;i++) pixelCloud(parallax(i*122,.16,780)-40,21+(i%2)*20,1.05);
      for (let i=0;i<6;i++) {
        const x=parallax(i*139,.20,810)-55;
        hillShape(x,167+(i%2)*11,100,63,'#d981b7','#ffbadd');
        ctx.fillStyle='#ffe4f1'; ctx.fillRect(x+30,172,39,5);
      }
      for (let i=0;i<10;i++) {
        const x=parallax(i*87,.46,880)-25;
        ctx.fillStyle='#fff3e4';ctx.fillRect(x+16,173,8,55);
        ctx.fillStyle='#db598e';ctx.fillRect(x+19,174,3,55);
        ctx.fillStyle=i%2?'#ffdf77':'#ff9bbb';ctx.beginPath();ctx.arc(x+20,166,17,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.75)';ctx.fillRect(x+12,157,14,4);
      }
    } else if (theme==='haunted') {
      // Luna, árboles torcidos y torres medievales: ya no aparecen colinas sonrientes.
      ctx.fillStyle='#e6d9bc';ctx.beginPath();ctx.arc(378,44,22,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#66537c';ctx.beginPath();ctx.arc(386,38,20,0,Math.PI*2);ctx.fill();
      for (let i=0;i<8;i++) {
        const x=parallax(i*117,.27,830)-45;
        ctx.fillStyle=i%2?'#403650':'#55475e';ctx.fillRect(x+8,135,45,93);
        ctx.fillStyle='#322c48';ctx.fillRect(x+4,126,54,13);
        for (let k=0;k<3;k++) ctx.fillRect(x+6+k*19,114,14,17);
        ctx.fillStyle='#c6a4e2';ctx.fillRect(x+20,152,8,19);
        ctx.fillRect(x+40,181,5,15);
      }
      for (let i=0;i<6;i++) {
        const x=parallax(i*159,.40,920)-45;
        ctx.strokeStyle='#342c41';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x+17,227);ctx.lineTo(x+19,171);ctx.lineTo(x+5,155);ctx.moveTo(x+19,188);ctx.lineTo(x+37,161);ctx.stroke();
      }
    } else {
      // Cielo nocturno y ruinas astrales. No es el mismo bosque con tintes azules.
      for (let i=0;i<42;i++) {
        const x=parallax((i*79)%811,.055,520);
        const y=14+(i*37)%151;
        ctx.fillStyle=i%4?'#f9edbd':'#96d8ff';ctx.fillRect(x,y,1+(i%3===0?1:0),1+(i%5===0?1:0));
      }
      for (let i=0;i<6;i++) {
        const x=parallax(i*142,.19,920)-80;
        ctx.fillStyle='#364880'; ctx.beginPath();ctx.moveTo(x+10,228);ctx.lineTo(x+55,127+(i%2)*17);ctx.lineTo(x+99,228);ctx.fill();
        ctx.fillStyle='#8294e6';ctx.fillRect(x+47,149+(i%2)*17,15,5);
      }
      for (let i=0;i<9;i++) {
        const x=parallax(i*96,.4,930)-30;
        ctx.fillStyle='#6666ac';ctx.fillRect(x+10,174,36,53);
        ctx.fillStyle='#e6cc68';ctx.fillRect(x+24,158,8,19);
        ctx.fillRect(x+14,190,9,9);ctx.fillRect(x+34,190,9,9);
      }
    }
  }

  function drawTerrain(world, camera) {
    for (const ground of state.grounds) {
      const x = ground.x - camera;
      if (x + ground.w < -5 || x > W + 5) continue;
      const material = world.decor === 'snow' ? ['#d7f4ff','#9bbcc7','#659ba8'] : world.decor === 'haunted' ? ['#bbb0cd','#736d83','#48405d'] : world.decor === 'stars' ? ['#8796db','#43518f','#303969'] : world.decor === 'candy' ? ['#ffc2d9','#cf7ea4','#934d80'] : ['#e1b45e','#9a5c2d','#76411e'];
      drawBrickTile(x, ground.y, ground.w, ground.h, ...material);
      ctx.fillStyle = world.decor === 'snow' ? '#f7fcff' : world.decor === 'candy' ? '#ff9ac1' : world.decor === 'haunted' ? '#6c5f93' : world.decor === 'stars' ? '#8389dc' : '#3ebf48';
      ctx.fillRect(x, ground.y - 2, ground.w, 6);
      ctx.fillStyle = world.decor === 'snow' ? '#ffffff' : '#b5e5ff'; ctx.fillRect(x, ground.y - 2, ground.w, 2);
    }
    // Marcas de aviso en los bordes de los huecos (no generan colisión).
    for (let i=1;i<state.grounds.length;i++) {
      const a=state.grounds[i-1],b=state.grounds[i];
      if (a.type==='bonus'||b.type==='bonus') continue;
      const gap=b.x-(a.x+a.w);
      if (gap<14||gap>90) continue;
      const x=a.x+a.w-13-camera;
      if (x<-25||x>W+20) continue;
      ctx.fillStyle='#ffdc74';ctx.fillRect(x,GROUND_Y-5,12,5);
      ctx.fillStyle='#8b5b27';ctx.fillRect(x+4,GROUND_Y-4,4,3);
    }
    for (const wall of state.walls) {
      const x = wall.x - camera;
      if (x < -50 || x > W + 10) continue;
      const stone = world.decor === 'snow' ? ['#efffff','#a7cbdc','#6d98b8'] :
        world.decor === 'candy' ? ['#ffe4f3','#e29bbb','#aa668e'] :
        world.decor === 'haunted' ? ['#b6a5c2','#635773','#3d354b'] :
        world.decor === 'stars' ? ['#b0b9ec','#666ba6','#454978'] :
        ['#edc77c','#ad7544','#73462c'];
      drawBrickTile(x, wall.y, wall.w, wall.h, ...stone);
    }
    for (const pipe of state.warpPipes) {
      const x = pipe.x - camera;
      if (x < -70 || x > W + 20) continue;
      drawPipe(x, pipe.y, pipe.w, pipe.h);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('S ↓', x + pipe.w / 2, pipe.y - 8);
    }
    for (const tunnel of state.tunnels) {
      const x = tunnel.x - camera;
      if (x < -80 || x > W + 10) continue;
      // Pasadizo bajo: una viga suspendida. El hueco inferior está libre para deslizarse.
      const beamColor = world.decor === 'snow' ? '#acdce5' :
        world.decor === 'candy' ? '#e88fb8' : world.decor === 'stars' ? '#8096da' :
        world.decor === 'haunted' ? '#80748e' : '#a87749';
      ctx.fillStyle = '#352e35'; ctx.fillRect(x-2,tunnel.y-2,tunnel.w+4,tunnel.h+4);
      ctx.fillStyle = beamColor; ctx.fillRect(x,tunnel.y,tunnel.w,tunnel.h);
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x+3,tunnel.y+3,tunnel.w-6,4);
      ctx.fillStyle = '#fff5c5'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('S ↘',x+tunnel.w/2,tunnel.y-7);
      ctx.fillStyle = 'rgba(23,30,41,.35)'; ctx.fillRect(x+2,tunnel.y+tunnel.h-3,tunnel.w-4,3);
    }
    for (const hazard of state.hazards) {
      const x = hazard.x - camera;
      if (x < -50 || x > W + 10) continue;
      ctx.fillStyle = hazard.kind === 'ice' ? '#bdeeff' : hazard.kind === 'magic' ? '#d8a2ff' : '#f06f6f';
      ctx.strokeStyle = '#6e3131'; ctx.lineWidth = 1;
      for (let n = 0; n < Math.max(3, Math.floor(hazard.w / 10)); n++) {
        const bx = x + n * 10;
        ctx.beginPath(); ctx.moveTo(bx, hazard.y + hazard.h); ctx.lineTo(bx + 5, hazard.y); ctx.lineTo(bx + 10, hazard.y + hazard.h); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    for (const b of state.blocks) {
      const x = b.x - camera;
      if (x < -28 || x > W + 28) continue;
      if (b.used) drawBrickTile(x, b.y, b.w, b.h, '#c38c58', '#8c572f', '#603918');
      else drawQuestionBlock(x, b.y - (b.bump > 0 ? 3 : 0), 0, '#e2a23b');
    }
    for (const p of state.platforms) {
      const x = p.x - camera;
      if (x + p.w < -10 || x > W + 10) continue;
      if (p.type === 'candy') {
        // Plataforma de caramelo: se dibuja exactamente en su hitbox (antes sobresalía).
        ctx.fillStyle='#c76d97';ctx.fillRect(x,p.y,p.w,p.h);
        ctx.fillStyle='#ffb9d6';ctx.fillRect(x+2,p.y+2,p.w-4,5);
        ctx.fillStyle='#fff1ef';for(let i=9;i<p.w-4;i+=18) ctx.fillRect(x+i,p.y+8,5,3);
        ctx.strokeStyle='#a55581';ctx.strokeRect(x,p.y,p.w,p.h);
      } else if (p.type === 'star') {
        ctx.fillStyle='#5868b7';ctx.fillRect(x,p.y,p.w,p.h);
        ctx.fillStyle='#9dc1f7';ctx.fillRect(x+2,p.y+2,p.w-4,4);
        ctx.fillStyle='#ffe58d';for(let i=12;i<p.w-4;i+=25) ctx.fillRect(x+i,p.y+8,4,3);
        ctx.strokeStyle='#303f86';ctx.strokeRect(x,p.y,p.w,p.h);
      } else if (p.type === 'ice') {
        ctx.fillStyle = '#8fe9ff'; ctx.fillRect(x, p.y, p.w, p.h);
        ctx.fillStyle = '#ddfbff'; ctx.fillRect(x+1, p.y+1, p.w-2, 4); ctx.strokeStyle='#59b8db'; ctx.strokeRect(x, p.y, p.w, p.h);
      } else if (p.type === 'stone') {
        drawBrickTile(x, p.y, p.w, p.h, '#c6c6c6', '#888', '#6b6b6b');
      } else {
        drawBrickTile(x, p.y, p.w, p.h, '#e5b66e', '#ae6b39', '#80451e');
      }
      if (p.moving) { ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.fillText(p.horizontal ? '↔' : '↕', x + p.w / 2, p.y - 5); }
    }
  }

  // Power-up de Woodstock: animación extraída de la hoja aportada por el usuario.
  // No modifica el poder, su hitbox ni las cápsulas de las otras habilidades.
  function drawPowerPickup(x, y, bob, type) {
    if (type === 'bird' && woodstockPickupSprites.ready && woodstockPickupSprites.image) {
      const frame = Math.floor(state.time * 6.5) % 8;
      const bubbleY = y + bob;
      ctx.save();
      ctx.fillStyle = 'rgba(80, 196, 255, .20)';
      ctx.beginPath(); ctx.ellipse(x, bubbleY + 20, 12, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(woodstockPickupSprites.image, frame * 40, 0, 40, 40,
        Math.round(x - 19), Math.round(bubbleY - 19), 38, 38);
      ctx.restore();
      return;
    }
    // Mantener el antiguo dibujo como respaldo si falla la carga del archivo.
    const info = {
      double: { color: '#9a6bff', edge: '#4a2ca8', symbol: '⇈', label: 'D', glow: 'rgba(180,140,255,.35)' },
      shield: { color: '#5ec5ff', edge: '#236c95', symbol: '◈', label: 'S', glow: 'rgba(120,220,255,.35)' },
      speed: { color: '#5edf72', edge: '#23863a', symbol: '⚡', label: 'V', glow: 'rgba(130,255,160,.35)' },
      shot: { color: '#ff6c6c', edge: '#9d2727', symbol: '✦', label: 'P', glow: 'rgba(255,130,130,.35)' },
      bird: { color: '#ffd347', edge: '#b47a13', symbol: '🐤', label: 'A', glow: 'rgba(255,230,120,.35)' }
    }[type] || { color: '#d88d35', edge: '#8e5a12', symbol: '*', label: '?' , glow: 'rgba(255,210,120,.3)'};
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = info.glow;
    ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
    if (type === 'shield') {
      ctx.fillStyle = info.color;
      ctx.beginPath(); ctx.moveTo(0,-13); ctx.lineTo(10,-8); ctx.lineTo(10,0); ctx.lineTo(0,12); ctx.lineTo(-10,0); ctx.lineTo(-10,-8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = info.edge; ctx.lineWidth = 2; ctx.stroke();
    } else if (type === 'speed') {
      ctx.fillStyle = info.color;
      ctx.beginPath(); ctx.moveTo(-4,-13); ctx.lineTo(7,-13); ctx.lineTo(1,-2); ctx.lineTo(9,-2); ctx.lineTo(-4,13); ctx.lineTo(-1,2); ctx.lineTo(-9,2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = info.edge; ctx.lineWidth = 2; ctx.stroke();
    } else if (type === 'shot') {
      ctx.fillStyle = info.color;
      ctx.beginPath(); ctx.moveTo(0,-13); ctx.lineTo(4,-4); ctx.lineTo(13,-4); ctx.lineTo(6,2); ctx.lineTo(8,12); ctx.lineTo(0,6); ctx.lineTo(-8,12); ctx.lineTo(-6,2); ctx.lineTo(-13,-4); ctx.lineTo(-4,-4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = info.edge; ctx.lineWidth = 2; ctx.stroke();
    } else if (type === 'bird') {
      ctx.fillStyle = info.color;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff3ab'; ctx.beginPath(); ctx.arc(-3, -2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e38a22'; ctx.beginPath(); ctx.moveTo(7,0); ctx.lineTo(13,2); ctx.lineTo(7,5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = info.edge; ctx.lineWidth = 2; ctx.strokeStyle = info.edge; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#2d2d2d'; ctx.fillRect(1, -3, 2, 2);
    } else {
      ctx.fillStyle = info.color;
      ctx.beginPath(); ctx.roundRect(-12, -12, 24, 24, 7); ctx.fill();
      ctx.strokeStyle = info.edge; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.fillStyle = type === 'bird' ? '#2d2d2d' : '#fffef3';
    ctx.font = type === 'bird' ? 'bold 8px monospace' : 'bold 12px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(info.symbol, 0, type === 'bird' ? 13 : 1);
    ctx.restore();
  }

  function drawCollectibles(camera) {
    for (const c of state.cookiesOnMap) {
      if (c.taken) continue;
      const x = c.x - camera;
      if (x < -15 || x > W + 15) continue;
      const bob = Math.sin(state.time * 4 + c.phase) * 2;
      ctx.fillStyle = '#ffd347'; ctx.beginPath(); ctx.ellipse(x, c.y + bob, c.r - 0.5, c.r + 1.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#b97a16'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#ffef95'; ctx.fillRect(x - 1, c.y + bob - 6, 2, 12);
    }
    for (const gem of state.secrets) {
      if (gem.taken) continue;
      const x = gem.x - camera;
      if (x < -25 || x > W + 25) continue;
      const bob = Math.sin(state.time * 4 + gem.phase) * 3;
      ctx.save(); ctx.translate(x, gem.y + bob); ctx.rotate(Math.sin(state.time * 2 + gem.id) * 0.1);
      ctx.fillStyle = '#ffde59'; ctx.strokeStyle = '#fff6c2'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0,-12); ctx.lineTo(4,-4); ctx.lineTo(12,-4); ctx.lineTo(6,2); ctx.lineTo(8,12); ctx.lineTo(0,6); ctx.lineTo(-8,12); ctx.lineTo(-6,2); ctx.lineTo(-12,-4); ctx.lineTo(-4,-4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    for (const item of state.powerups) {
      if (item.taken) continue;
      const x = item.x - camera;
      if (x < -25 || x > W + 25) continue;
      const bob = Math.sin(state.time * 3 + item.x) * 2;
      drawPowerPickup(x, item.y, bob, item.type);
    }
  }

  // Atlas transparentes de enemigos, guardianes y compañero, tomados de las hojas del usuario.
  // Cada sprite conserva su cuadro propio; no afecta a las cajas de colisión ni al guardado.
  const ENEMY_CELL = 160;
  const BIRD_CELL = 112;
  const ENEMY_TYPES = { turtle: 0, bee: 1, penguin: 2, snowman: 8,
    candy: 3, ghost: 4, bat: 5, starling: 6 };
  const spriteSources = {};
  function loadGameSprite(name, path) {
    const record = { image: null, ready: false };
    spriteSources[name] = record;
    if (typeof window.Image !== 'function') return record;
    const image = new window.Image();
    record.image = image;
    image.onload = () => { record.ready = image.naturalWidth > 0; };
    image.onerror = () => { record.ready = false; };
    const source = document.currentScript && document.currentScript.src;
    image.src = source ? new URL(path, source).href : path;
    return record;
  }
  const enemySprites = loadGameSprite('enemies', 'assets/enemigos-jefes-sprites.png');
  const birdSprites = loadGameSprite('bird', 'assets/pajarito-sprites.png');
  const woodstockPickupSprites = loadGameSprite('woodstockPickup', 'assets/woodstock-bubble-pickup.png');
  function paintGameSprite(record, cell, row, frame, middleX, bottomY, drawW, drawH, facing) {
    if (!record.ready || !record.image || !record.image.naturalWidth) return false;
    ctx.save();
    ctx.translate(Math.round(middleX), Math.round(bottomY));
    ctx.scale(facing < 0 ? -1 : 1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(record.image, frame * cell, row * cell, cell, cell,
      -Math.round(drawW / 2), -drawH, drawW, drawH);
    ctx.restore();
    return true;
  }
  function drawBird(camera) {
    const bird = state.companion;
    const isFast = player.dashTime > 0 || (Math.abs(player.vx) > 4.2);
    const air = !player.onGround;
    const moved = Math.abs(player.vx) > 0.5;
    let row = 0, count = 4, fps = 4;
    if (bird.attackTimer > 0) { row = 8; count = 4; fps = 12; }
    else if (player.power === 'shield' && player.powerTime > 0) { row = 11; count = 2; fps = 4; }
    else if (state.mode === 'victory') { row = 9; count = 6; fps = 5; }
    else if (player.slideTime > 0) { row = 6; count = 3; fps = 5; }
    else if (air) { row = player.vy < 0 ? 3 : 5; count = 6; fps = 10; }
    else if (isFast) { row = 2; count = 6; fps = 15; }
    else if (moved) { row = 1; count = 6; fps = 9; }
    const frame = Math.floor(state.time * fps) % count;
    const hover = air ? Math.sin(state.time * 9) * 3 : Math.sin(state.time * 4) * 1.4;
    const middleX = bird.x - camera;
    const bottomY = bird.y + 17 + hover;
    if (!paintGameSprite(birdSprites, BIRD_CELL, row, frame,
      middleX, bottomY, 29, 29, player.facing)) {
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '16px sans-serif'; ctx.fillText('🐤', middleX, bottomY - 14);
      ctx.restore();
    }
  }
  function drawDefeatSprites(camera) {
    for (const fx of state.defeatFx) {
      const row = fx.worldIndex >= 0 ? 7 + fx.worldIndex : ENEMY_TYPES[fx.type];
      if (row === undefined) continue;
      const boss = fx.worldIndex >= 0;
      const frame = fx.remaining < fx.duration / 2 ? 5 : 4;
      const scale = boss ? 108 : 39;
      ctx.save(); ctx.globalAlpha = Math.min(1, fx.remaining / 0.18);
      paintGameSprite(enemySprites, ENEMY_CELL, row, frame,
        fx.x - camera + fx.w / 2, fx.y + fx.h + 2, scale, boss ? 92 : 40, fx.facing);
      ctx.restore();
    }
  }

  function drawFoes(camera) {
    for (const foe of state.foes) {
      if (!foe.alive) continue;
      const x = foe.x - camera;
      if (x < -40 || x > W + 40) continue;
      const row = ENEMY_TYPES[foe.type];
      const attacking = (foe.attackFlash || 0) > 0;
      const col = attacking ? 3 + (Math.floor(state.time * 10) % 2)
        : Math.floor(state.time * (foe.fly ? 10 : 8) + foe.phase) % 3;
      if (row !== undefined && enemySprites.ready) {
        ctx.save();
        if (foe.hitFlash > 0) ctx.globalAlpha = 0.55;
        paintGameSprite(enemySprites, ENEMY_CELL, row, col,
          x + foe.w / 2, foe.y + foe.h + 2, foe.fly ? 44 : 40, foe.fly ? 42 : 40, foe.vx < 0 ? -1 : 1);
        ctx.restore();
        continue;
      }
      ctx.save();
      if (foe.hitFlash > 0) ctx.globalAlpha = 0.55;
      if (/bee|bat/.test(foe.type)) {
        ctx.fillStyle = '#643d12'; ctx.beginPath(); ctx.ellipse(x + foe.w/2, foe.y + foe.h/2, 11, 8, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#f9d14d'; ctx.fillRect(x + foe.w/2 - 8, foe.y + foe.h/2 - 6, 4, 12); ctx.fillRect(x + foe.w/2 + 2, foe.y + foe.h/2 - 6, 4, 12);
        ctx.fillStyle = 'rgba(225,245,255,.85)'; ctx.beginPath(); ctx.ellipse(x + foe.w/2 - 8, foe.y + foe.h/2 - 7, 6, 4, -0.4, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + foe.w/2 + 8, foe.y + foe.h/2 - 7, 6, 4, 0.4, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.fillStyle = foe.type === 'ghost' ? '#eef4ff' : foe.type === 'snowman' ? '#edfaff' : '#d48c44';
        ctx.beginPath(); ctx.ellipse(x + foe.w/2, foe.y + foe.h/2 + 3, 12, 10, 0, 0, Math.PI*2); ctx.fill();
        if (foe.type === 'turtle' || foe.type === 'penguin' || foe.type === 'starling') {
          ctx.fillStyle = foe.type === 'penguin' ? '#5d6e87' : foe.type === 'starling' ? '#e0c23f' : '#5ab15c';
          ctx.fillRect(x + 6, foe.y + 12, foe.w - 12, foe.h - 10);
        }
        ctx.fillStyle = '#fff'; ctx.fillRect(x + foe.w/2 - 6, foe.y + foe.h/2 - 2, 4, 4); ctx.fillRect(x + foe.w/2 + 2, foe.y + foe.h/2 - 2, 4, 4);
        ctx.fillStyle = '#222'; ctx.fillRect(x + foe.w/2 - 4, foe.y + foe.h/2, 2, 2); ctx.fillRect(x + foe.w/2 + 4, foe.y + foe.h/2, 2, 2);
      }
      ctx.restore();
    }
  }

  function drawBoss(camera) {
    const boss = state.boss;
    if (!boss || !boss.alive) return;
    const x = boss.x - camera;
    if (x < -90 || x > W + 90) return;
    if (enemySprites.ready) {
      const attacking = boss.cooldown < 0.33;
      const frame = boss.flash > 0 ? 4 : attacking ? 2 + (Math.floor(state.time * 10) % 2)
        : Math.floor(state.time * 5) % 2;
      ctx.save();
      if (boss.flash > 0) ctx.globalAlpha = 0.65;
      paintGameSprite(enemySprites, ENEMY_CELL, 7 + boss.worldIndex, frame,
        x + boss.w / 2, boss.y + boss.h + 6, 106, 96, boss.vx < 0 ? -1 : 1);
      ctx.restore();
    } else {
    ctx.save();
    if (boss.flash > 0) ctx.globalAlpha = 0.5;
    drawBrickTile(x + 8, boss.y + 18, boss.w - 16, boss.h - 22, '#d59f53', '#9d5c2e', '#6f3d1b');
    ctx.fillStyle = '#fff6e0'; ctx.beginPath(); ctx.ellipse(x + boss.w/2, boss.y + boss.h/2 - 6, 28, 22, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillRect(x + boss.w/2 - 12, boss.y + boss.h/2 - 10, 5, 5); ctx.fillRect(x + boss.w/2 + 7, boss.y + boss.h/2 - 10, 5, 5);
    ctx.fillStyle = '#e03a3a'; ctx.fillRect(x + boss.w/2 - 20, boss.y + boss.h/2 - 28, 40, 8);
    ctx.fillStyle = '#2b2b2b'; ctx.fillRect(x + boss.w/2 - 26, boss.y + boss.h/2 + 8, 52, 10);
    ctx.restore();
    }
    if (x < W - 20 && x + boss.w > 0) {
      roundRect(301, 44, 158, 14, 3, 'rgba(25,25,25,.7)');
      roundRect(304, 47, 152 * (boss.hp / boss.maxHp), 8, 2, '#f04f4f');
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'right';
      ctx.fillText((boss.name || 'JEFE').toUpperCase(), 456, 39);
    }
  }


  // Fotogramas separados desde la hoja de sprites de Snoopy: 112 px por celda.
  // Se preservan los movimientos, colisiones y guardados originales del motor.
  const SPRITE_CELL = 112;
  const SPRITE_COLS = 8;
  const SPRITE_FRAMES = {"idle":[0,1,2,3],"walk":[4,5,6,7,8,9,10],"run":[11,12,13,14,15,16,17],"jump":[18,19,20,21],"fall":[22,23],"land":[24,25,26],"slide":[27,28,29,30],"dash":[31,32,33,34],"hurt":[35,36,37,38],"win":[39,40,41,42],"shield":[43],"speed":[44],"double":[45],"shot":[46],"star":[47]};
  let spriteAtlas = null;
  let spriteAtlasReady = false;
  if (typeof window.Image === 'function') {
    spriteAtlas = new window.Image();
    spriteAtlas.onload = () => { spriteAtlasReady = true; };
    spriteAtlas.onerror = () => { spriteAtlasReady = false; };
    const source = document.currentScript && document.currentScript.src;
    spriteAtlas.src = source ? new URL('assets/snoopy-sprites.png', source).href : 'assets/snoopy-sprites.png';
  }

  function drawAnimatedSnoopy(camera) {
    if (!spriteAtlasReady || !spriteAtlas || !spriteAtlas.naturalWidth) return false;
    const x = player.x - camera;
    const y = player.y + player.h;
    const moving = Math.abs(player.vx) > 0.55;
    let pose = 'idle';
    let fps = 4;
    if (state.mode === 'victory') { pose = 'win'; fps = 6; }
    else if (player.slideTime > 0) { pose = 'slide'; fps = 14; }
    else if (player.dashTime > 0) { pose = 'dash'; fps = 16; }
    else if (!player.onGround && player.vy < 0) { pose = 'jump'; fps = 8; }
    else if (!player.onGround && player.vy > 0) { pose = 'fall'; fps = 6; }
    else if (moving) { pose = Math.abs(player.vx) > 4.1 ? 'run' : 'walk'; fps = pose === 'run' ? 14 : 10; }
    if (player.powerTime > 0 && pose !== 'slide' && pose !== 'dash') {
      if (player.power === 'shield' && !moving) pose = 'shield';
      else if (player.power === 'speed' && moving) pose = 'speed';
      else if (player.power === 'double' && !player.onGround) pose = 'double';
      else if (player.power === 'shot' && player.shotCooldown > 0) pose = 'shot';
    }
    if (player.invuln > 0 && Math.floor(state.time * 13) % 2 === 0) return true;
    const list = SPRITE_FRAMES[pose] || SPRITE_FRAMES.idle;
    let pos = Math.floor(state.time * fps) % list.length;
    if (pose === 'jump') pos = player.vy < -6 ? 1 : player.vy < -2 ? 2 : 3;
    const frame = list[pos];
    const isSlide = pose === 'slide';
    const drawW = isSlide ? 51 : pose === 'speed' ? 53 : 48;
    const drawH = isSlide ? 32 : 45;
    ctx.save();
    ctx.translate(Math.round(x + player.w / 2), Math.round(y));
    ctx.scale(player.facing, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(spriteAtlas, (frame % SPRITE_COLS) * SPRITE_CELL, Math.floor(frame / SPRITE_COLS) * SPRITE_CELL, SPRITE_CELL, SPRITE_CELL, -drawW / 2, -drawH, drawW, drawH);
    ctx.restore();
    drawBird(camera);
    return true;
  }

  function drawPlayer(camera) {
    if (drawAnimatedSnoopy(camera)) return;
    // Respaldo dibujado con vectores si la imagen aún no cargó o está ausente.
    if (player.invuln > 0 && Math.floor(state.time * 13) % 2 === 0) return;
    const x = player.x - camera;
    ctx.save();
    if (player.power === 'shield' && player.powerTime > 0) {
      ctx.strokeStyle = 'rgba(117,220,255,.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x + player.w / 2, player.y + player.h / 2, 24 + Math.sin(state.time * 8) * 2, 0, Math.PI * 2); ctx.stroke();
    }
    if (player.dashTime > 0 || player.power === 'speed' && player.powerTime > 0) {
      ctx.fillStyle = 'rgba(255,255,255,.34)';
      for (let i = 1; i <= 3; i++) ctx.fillRect(x - player.facing * i * 10, player.y + i * 3, 13, 3);
    }
    const cy = player.y + player.h;
    ctx.translate(x + player.w / 2, cy);
    ctx.scale(player.facing, 1);
    const sliding = player.slideTime > 0;
    const run = player.onGround && Math.abs(player.vx) > 0.4 ? Math.sin(player.anim * 22) * 3 : 0;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#232323'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.ellipse(-2, sliding ? -8 : -10, sliding ? 15 : 12.5, sliding ? 8 : 10.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2867c9'; ctx.fillRect(-12, sliding ? -13 : -17, 20, 10);
    ctx.fillStyle = '#d43131'; ctx.fillRect(-4, sliding ? -18 : -24, 13, 6);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(6, sliding ? -14 : -22, 12, 11, 0.12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1d1d25'; ctx.beginPath(); ctx.ellipse(-1, sliding ? -15 : -21, 5.5, 10, -0.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(13, sliding ? -9 : -17, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#24232b'; ctx.beginPath(); ctx.ellipse(17, sliding ? -11 : -20, 3, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(10, sliding ? -18 : -28, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ec6475'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(2, sliding ? -10 : -16); ctx.lineTo(11, sliding ? -8 : -14); ctx.stroke();
    ctx.strokeStyle = '#36343a'; ctx.lineWidth = 2.1;
    if (!sliding) {
      ctx.beginPath(); ctx.moveTo(-7,-4); ctx.lineTo(-8 + run,0); ctx.moveTo(5,-4); ctx.lineTo(5 - run,0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-12,-14); ctx.quadraticCurveTo(-22,-18 - run,-18,-24); ctx.stroke();
    }
    ctx.restore();
    drawBird(camera);
  }

  function drawShots(camera) {
    for (const shot of state.birdShots) {
      const x = shot.x - camera, y = shot.y;
      if (x < -10 || x > W + 10) continue;
      ctx.globalAlpha = Math.min(1, Math.max(0.25, shot.life * 2));
      ctx.fillStyle = '#fff2a0';
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fbbf24'; ctx.fillRect(x-2,y-8,4,16); ctx.fillRect(x-8,y-2,16,4);
      ctx.fillStyle = '#fff'; ctx.fillRect(x-1,y-1,2,2);
    }
    ctx.globalAlpha = 1;
    for (const s of state.shots) {
      ctx.fillStyle = s.hostile ? '#b98af0' : '#fff0a6';
      ctx.beginPath(); ctx.ellipse(s.x - camera + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(s.x - camera + 2, s.y + 2, 3, 2);
    }
    for (const p of state.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color; ctx.fillRect(p.x - camera, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawHUD(world) {
    roundRect(8, 8, 464, 30, 3, 'rgba(0,0,0,.55)');
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff';
    ctx.fillText('SNOOPY', 16, 23);
    ctx.fillText('MUNDO ' + state.world + '-' + (((state.level - 1) % 3) + 1), 100, 23);
    ctx.fillText('VIDAS ' + state.lives, 200, 23);
    ctx.fillStyle = '#ffd347'; ctx.fillText('MONEDAS ' + state.cookies, 278, 23);
    ctx.fillStyle = '#ffffff'; ctx.fillText('PUNTOS ' + state.score, 372, 23);
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    const powerMeta = player.power ? ({
      double:{name:'PODER DOBLE', icon:'⇈', color:'#c9b0ff'},
      shield:{name:'PODER ESCUDO', icon:'◈', color:'#8ee4ff'},
      speed:{name:'PODER VELOZ', icon:'⚡', color:'#8bf19b'},
      shot:{name:'PODER DISPARO', icon:'✦', color:'#ff9a9a'},
      bird:{name:'WOODSTOCK', icon:'🐤', color:'#b9f1ff'}
    }[player.power]) : null;
    if (powerMeta) {
      ctx.fillStyle = powerMeta.color;
      if (player.power === 'bird' && woodstockPickupSprites.ready) {
        const spriteFrame = Math.floor(state.time * 5) % 8;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(woodstockPickupSprites.image, spriteFrame * 40, 0, 40, 40, 14, 43, 20, 20);
        ctx.restore();
        ctx.fillText('WOODSTOCK', 38, 56);
      } else {
        ctx.fillText(powerMeta.icon + ' ' + powerMeta.name, 18, 56);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillText(Math.ceil(Math.max(0, player.powerTime)) + 's', 164, 56);
    }
    ctx.textAlign = 'right'; ctx.fillStyle = '#fffbd9'; ctx.fillText('★ ' + (state.meta.stars[state.level] || 0) + '/3  ·  🪙 ' + state.meta.wallet, 462, 56);
    if (player.dashCooldown > 0) {
      ctx.textAlign = 'left'; ctx.fillStyle = '#d0ecff'; ctx.fillText('TURBO', 18, 74);
      ctx.fillStyle = '#27485f'; ctx.fillRect(63, 70, 96, 6);
      ctx.fillStyle = '#7fd9ff'; ctx.fillRect(63, 70, 96 * (1 - player.dashCooldown / (state.meta.upgrades.dash ? 0.8 : 1.75)), 6);
    }
    const ready = birdCombatActive() && state.companion.cooldown <= 0;
    ctx.textAlign = 'right'; ctx.font = 'bold 9px monospace';
    ctx.fillStyle = ready ? '#faffad' : '#ffffff';
    ctx.fillText(!birdCombatActive() ? '🐤 PODER INACTIVO' : ready ? '🐤 ALIADO LISTO' : '🐤 AYUDA ' + Math.ceil(state.companion.cooldown) + 's', 460, 72);
    if (state.stats.challenges) {
      ctx.textAlign = 'center'; ctx.font = 'bold 9px monospace'; ctx.fillStyle = '#fff4b8';
      ctx.fillText('RETO COMPLETADO', W / 2, 47);
    }
  }

  // Señalización puramente visual: indica la ruta segura sin crear colisiones.
  function drawRouteSigns(world, camera) {
    if (state.bonus?.active) return;
    const design = LEVEL_DESIGNS[state.level - 1];
    if (!design) return;
    const signs = [];
    for (const [gapX] of design.gaps) signs.push({x:gapX-87,label:'PUENTE',tone:'#fcdf78'});
    for (const spikeX of design.spikes) {
      // Solo señalar peligros que el generador colocó realmente.
      if (state.hazards.some(h=>Math.abs(h.x-spikeX)<8))
        signs.push({x:spikeX-61,label:'¡OJO!',tone:'#ffb3ad'});
    }
    if (state.boss) signs.push({x:state.boss.minX-230,label:'JEFE',tone:'#ffc0c0'});
    const visible = signs.filter(s=>s.x-camera>-48 && s.x-camera<W+18);
    for (const sign of visible) {
      const x=Math.round(sign.x-camera), y=GROUND_Y-50;
      ctx.fillStyle='#785737';ctx.fillRect(x+17,y+16,4,34);
      roundRect(x,y,43,19,3,'#fff9e7','#7b6a49');
      ctx.fillStyle=sign.tone;ctx.fillRect(x+3,y+3,37,13);
      ctx.textBaseline='middle';ctx.textAlign='center';ctx.font='bold 8px monospace';
      ctx.fillStyle='#483c3b';ctx.fillText(sign.label,x+21,y+10);
    }
  }

  function drawWorld() {
    const world = worlds[state.world - 1] || worlds[0];
    const camera = state.camera;
    drawBackground(world, camera);
    drawTerrain(world, camera);
    drawRouteSigns(world, camera);
    drawCollectibles(camera);
    drawFoes(camera);
    drawDefeatSprites(camera);
    drawBoss(camera);
    drawShots(camera);
    drawPlayer(camera);

    // Checkpoint y meta.
    if (state.checkpoint) {
      const cx = state.checkpoint.x - camera;
      if (cx > -10 && cx < W + 10) {
        ctx.fillStyle = '#81613c'; ctx.fillRect(cx, GROUND_Y - 45, 4, 45);
        ctx.fillStyle = state.checkpoint.reached ? '#57d05a' : '#e9e4da';
        ctx.beginPath(); ctx.moveTo(cx + 4, GROUND_Y - 44); ctx.lineTo(cx + 25, GROUND_Y - 36); ctx.lineTo(cx + 4, GROUND_Y - 28); ctx.closePath(); ctx.fill();
      }
    }
    const fx = state.flagX - camera;
    if (fx > -25 && fx < W + 25) {
      ctx.fillStyle = '#3d9f2d'; ctx.fillRect(fx, GROUND_Y - 72, 4, 72);
      ctx.fillStyle = '#f4f4f4'; ctx.fillRect(fx + 1, GROUND_Y - 72, 2, 72);
      ctx.fillStyle = '#5fd661'; ctx.beginPath(); ctx.moveTo(fx + 4, GROUND_Y - 69); ctx.lineTo(fx + 32, GROUND_Y - 58); ctx.lineTo(fx + 4, GROUND_Y - 47); ctx.closePath(); ctx.fill();
      ctx.font = 'bold 10px monospace'; ctx.fillStyle = '#fffbcc'; ctx.fillText('GO!', fx + 18, GROUND_Y - 53);
    }
    if (!state.bonus?.active) {
      const cx = state.flagX + 37 - camera;
      if (cx > -90 && cx < W + 30) {
        const theme = world.decor;
        const walls = theme==='snow' ? ['#8db5d5','#d5f5ff','#638cab'] :
          theme==='candy' ? ['#c56e99','#ffd0e5','#954d79'] :
          theme==='haunted' ? ['#3c354c','#6c5c7c','#30283b'] :
          theme==='stars' ? ['#404b8b','#8495df','#2b3769'] :
          ['#b56a43','#e4a477','#7e4328'];
        ctx.fillStyle=walls[0];ctx.fillRect(cx,GROUND_Y-67,60,67);
        ctx.fillStyle=walls[1];ctx.fillRect(cx+4,GROUND_Y-63,52,59);
        ctx.fillStyle=walls[2];
        for(let i=0;i<4;i++)ctx.fillRect(cx+i*17-2,GROUND_Y-75,13,14);
        ctx.fillStyle='#30252d';ctx.fillRect(cx+22,GROUND_Y-27,17,27);
        ctx.fillStyle=theme==='haunted'?'#eac4fb':'#fff5b0';
        ctx.fillRect(cx+10,GROUND_Y-49,8,12);ctx.fillRect(cx+42,GROUND_Y-49,8,12);
        if (theme==='snow') {ctx.fillStyle='#ffffff';ctx.fillRect(cx+3,GROUND_Y-65,55,5);}
        if (theme==='candy') {ctx.fillStyle='#ff90ad';ctx.fillRect(cx+3,GROUND_Y-63,54,6);}
        if (theme==='stars') {ctx.fillStyle='#ffe28a';ctx.font='bold 18px monospace';ctx.fillText('✦',cx+27,GROUND_Y-80);}
      }
    } else {
      roundRect(113, 42, 255, 26, 5, 'rgba(39,56,88,.82)');
      ctx.fillStyle = '#ffe47f'; ctx.textAlign = 'center'; ctx.font = 'bold 12px monospace';
      ctx.fillText('ZONA BONUS · ' + Math.ceil(state.bonus.remaining) + 's · S PARA SALIR', 240, 55);
    }
    drawHUD(world);
    if(state.levelTime<4 && state.mode==='playing'){
      ctx.fillStyle='rgba(10,27,53,.55)';ctx.fillRect(125,85,230,19);
      ctx.textAlign='center';ctx.fillStyle='#fff5bd';ctx.font='bold 10px monospace';
      ctx.fillText(LEVEL_DESIGNS[state.level-1].name.toUpperCase(),240,97);
    }
    if (state.mode === 'playing' && state.levelTime < 8 && !state.stats.challenges) {
      roundRect(108, 244, 264, 18, 3, 'rgba(0,0,0,.62)');
      ctx.textAlign = 'center'; ctx.font = 'bold 10px monospace'; ctx.fillStyle = '#fff'; ctx.fillText('RETO: ' + challengeLabel(), 240, 253);
    }
    if (state.toastTimer > 0 && state.toast) {
      roundRect(105, 70, 270, 28, 10, 'rgba(38,43,61,.76)');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '12px Arial'; ctx.fillStyle = '#fff'; ctx.fillText(state.toast, 240, 84);
    }
  }

  function drawOverlay(title, subtitle, hint, accent) {
    ctx.fillStyle = 'rgba(16,24,40,.68)'; ctx.fillRect(0, 0, W, H);
    roundRect(58, 44, 364, 176, 8, 'rgba(253,248,229,.97)', '#ffffff');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = accent || '#d96f94'; ctx.font = 'bold 22px monospace'; ctx.fillText(title, 240, 84);
    ctx.fillStyle = '#444a59'; ctx.font = 'bold 12px monospace'; ctx.fillText(subtitle || '', 240, 118);
    ctx.fillStyle = '#6d7283'; ctx.font = '11px monospace'; ctx.fillText(hint || '', 240, 178);
  }

  function drawMenu() {
    const world = worlds[0];
    drawBackground(world, 0);
    drawTerrain(world, 0);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0, W, H);
    roundRect(42, 24, 396, 222, 8, 'rgba(252,248,231,.97)', '#fff');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#d13d3d'; ctx.font = 'bold 18px monospace'; ctx.fillText('LA AVENTURA DE SNOOPY', 240, 58);
    ctx.fillStyle = '#2f63d0'; ctx.font = 'bold 12px monospace'; ctx.fillText('EDICION 3.0 · MUNDOS DISEÑADOS', 240, 80);
    ctx.fillStyle = '#333'; ctx.font = 'bold 28px monospace'; ctx.fillText('◼ ◻ ◼', 240, 109);
    ctx.fillStyle = '#444a59'; ctx.font = 'bold 12px monospace'; ctx.fillText('15 NIVELES · 5 MUNDOS · 5 JEFES', 240, 138);
    ctx.font = '11px monospace'; ctx.fillText('EL PAJARITO AYUDA AL ACTIVAR SU PODER TEMPORAL', 240, 160);
    ctx.fillText('ESPACIO SALTAR · SHIFT CORRER · Q DASH · S TUBERIA', 240, 177);
    const saved = readSave();
    const label = saved ? 'PULSA JUGAR PARA CONTINUAR' : 'PULSA JUGAR PARA EMPEZAR';
    roundRect(102, 205, 276, 22, 3, '#e05d3f');
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace'; ctx.fillText(label, 240, 216);
  }

  function drawSpecialScreen() {
    if (state.mode === 'menu') return drawMenu();
    if (state.mode === 'playing') {
      drawWorld();
      if (!mario.running) drawOverlay('PAUSA', 'La aventura está detenida', 'Pulsa Escape para continuar', '#6d83b7');
      return;
    }
    if (state.mode === 'levelClear') {
      drawWorld();
      drawOverlay('¡NIVEL COMPLETADO! ' + '★'.repeat(state.lastStars) + '☆'.repeat(3-state.lastStars), `Siguiente: ${levelName(state.level + 1)}`, 'Galletas 60% = estrella · Sin daño o secreto = estrella', '#5caa72');
      return;
    }
    if (state.mode === 'gameover') {
      drawWorld();
      drawOverlay('¡FIN DE LA PARTIDA!', `Llegaste al nivel ${state.level} · Puntuación ${state.score}`, 'Pulsa JUGAR para intentarlo otra vez · Tu progreso quedó guardado', '#d96f78');
      return;
    }
    if (state.mode === 'victory') {
      drawWorld();
      drawOverlay('¡AVENTURA COMPLETADA!', `¡Salvaste los cinco mundos! · ${state.score} puntos`, `${Object.values(state.meta.stars).reduce((a,b)=>a+b,0)}/45 estrellas · ¡Gracias por jugar!`, '#c89437');
      return;
    }
  }

  function drawMario() {
    ctx.clearRect(0, 0, W, H);
    drawSpecialScreen();
  }
  window.drawMario = drawMario;

  let frameAccumulator = 0;
  function frame(timestamp) {
    if (!state.lastFrame) state.lastFrame = timestamp;
    const dt = clamp((timestamp - state.lastFrame) / 1000, 0, 0.05);
    state.lastFrame = timestamp;
    if (state.mode === 'playing' && mario.running) {
      frameAccumulator += dt;
      let steps = 0;
      while (frameAccumulator >= 1/60 && steps++ < 4 && mario.running && state.mode === 'playing') {
        marioStep(1000 / 60);
        frameAccumulator -= 1/60;
      }
    } else frameAccumulator = 0;
    if (state.mode === 'levelClear' && !state.mapOpen && !state.shopOpen) {
      state.transitionTimer -= dt;
      if (state.transitionTimer <= 0) {
        const next = state.level + 1;
        makeLevel(next, 0);
        state.mode = 'playing';
        mario.running = true;
        notify(levelName(next));
        saveSoon();
        refreshLevelOptions();
      }
    }
    drawMario();
    window.marioLoop = window.requestAnimationFrame(frame);
  }

  function beginLoop() {
    if (!window.marioLoop) window.marioLoop = window.requestAnimationFrame(frame);
  }

  // API pública para extras de pausa y reanudación.
  window.marioResume = function () {
    if (state.mode === 'playing') mario.running = true;
    mario.last = 0;
  };
  window.marioPause = function () { mario.running = false; };
  window.marioStart = function (fresh) {
    if (fresh === true) {
      try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* no-op */ }
      startGame(false);
    } else if (state.mode === 'gameover' || state.mode === 'victory') {
      startGame(false);
    } else startGame(true);
  };

  // Tienda y menú de niveles añadidos al panel sin alterar la integración anterior.
  let mapNode = null, mapPausedRunning = false;
  let shopNode = null;
  let shopPausedRunning = false;
  let audioButton = null;
  let difficultyButton = null;
  let levelSelect = null;
  function totalStars() { return Object.values(state.meta.stars).reduce((total, n) => total + n, 0); }
  function refreshLevelOptions() {
    if (!levelSelect) return;
    const old = levelSelect.value;
    levelSelect.textContent = '';
    for (let n = 1; n <= state.unlocked; n++) {
      const option = document.createElement('option');
      option.value = String(n);
      option.textContent = `Nivel ${n} · ${'★'.repeat(state.meta.stars[n] || 0)}${'☆'.repeat(3 - (state.meta.stars[n] || 0))}`;
      levelSelect.appendChild(option);
    }
    levelSelect.value = old && +old <= state.unlocked ? old : String(state.level);
  }
  function refreshAudioButton() {
    if (audioButton) {
      audioButton.textContent = state.musicOn ? '🔊 Música: sí' : '🔇 Música: no';
      audioButton.setAttribute('aria-pressed', String(state.musicOn));
    }
  }
  function toggleAudio() {
    state.musicOn = !state.musicOn;
    if (state.musicOn) { enableAudio(); sound('start'); }
    else audio.elapsed = 0;
    refreshAudioButton();
  }
  function refreshDifficultyButton() {
    if (!difficultyButton) return;
    difficultyButton.textContent = easier() ? '😊 Fácil' : '🎮 Normal';
    difficultyButton.setAttribute('aria-label', 'Dificultad: ' + (easier() ? 'Fácil' : 'Normal'));
    difficultyButton.setAttribute('aria-pressed', String(easier()));
  }
  function toggleDifficulty() {
    state.difficulty = easier() ? 'normal' : 'facil';
    safeStoreSet(DIFFICULTY_KEY, state.difficulty);
    refreshDifficultyButton();
    notify(easier() ? '😊 Modo fácil activo. Menos peligros en el próximo nivel.' : '🎮 Modo normal activo. Nuevos niveles más desafiantes.');
    if (easier() && state.mode === 'playing') state.lives = Math.max(state.lives, 4);
    writeSave(); syncCompatibility();
  }
  function renderShop() {
    if (!shopNode) return;
    const content = shopNode.querySelector('.snoopy-shop-content');
    content.textContent = '';
    const stats = document.createElement('p');
    stats.className = 'snoopy-shop-summary';
    stats.textContent = `🪙 ${state.meta.wallet} monedas disponibles · ★ ${totalStars()}/45 estrellas`;
    content.appendChild(stats);
    for (const item of SHOP) {
      const row = document.createElement('div'); row.className = 'snoopy-shop-item';
      const info = document.createElement('div');
      const heading = document.createElement('strong'); heading.textContent = item.name;
      const detail = document.createElement('small'); detail.textContent = item.desc;
      info.append(heading, detail);
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = state.meta.upgrades[item.id] ? '✓ Adquirida' : `🪙 ${item.cost}`;
      button.disabled = !!state.meta.upgrades[item.id] || state.meta.wallet < item.cost;
      button.title = button.disabled && !state.meta.upgrades[item.id] ? 'Necesitas más monedas' : item.name;
      button.addEventListener('click', () => {
        if (state.meta.upgrades[item.id] || state.meta.wallet < item.cost) return;
        state.meta.wallet -= item.cost;
        state.meta.upgrades[item.id] = true;
        if (item.id === 'heart' && state.mode === 'playing') state.lives = Math.min(9, state.lives + 1);
        writeMeta(); writeSave(); sound('shop');
        notify(`¡Mejora conseguida: ${item.name}!`);
        renderShop();
      });
      row.append(info, button); content.appendChild(row);
    }
    const tip = document.createElement('p'); tip.className = 'snoopy-shop-hint';
    tip.textContent = 'Las mejoras, estrellas y monedas se mantienen aunque empieces una partida nueva.';
    content.appendChild(tip);
  }
  function openShop() {
    if (!shopNode || state.shopOpen) return;
    if(state.mapOpen)closeWorldMap();
    shopPausedRunning = mario.running;
    mario.running = false;
    state.shopOpen = true;
    renderShop();
    shopNode.hidden = false;
    shopNode.querySelector('.snoopy-shop-close').focus();
  }
  function closeShop() {
    if (!shopNode || !state.shopOpen) return;
    state.shopOpen = false;
    shopNode.hidden = true;
    if (state.mode === 'playing') mario.running = shopPausedRunning;
    canvas.focus();
    refreshLevelOptions();
  }
  function renderWorldMap() {
    if (!mapNode) return;
    const grid = mapNode.querySelector('.snoopy-map-grid');
    grid.replaceChildren();
    const themes = ['🌳','❄️','🍬','🏰','✨'];
    const scenery = [['🌳','🌲','🍄'],['🏔️','❄️','🌲'],['🍭','🍬','🧁'],['🦇','🏰','👻'],['⭐','🌙','🪐']];
    const powerSymbols = {double:'⇈',shield:'◈',speed:'⚡',shot:'✦',bird:'🐤'};
    for (let world=0; world<5; world++) {
      const section = document.createElement('section');
      section.className = 'snoopy-map-world theme-' + world;
      section.setAttribute('aria-label', 'Mundo ' + (world+1) + ': ' + worlds[world].name);
      const scene = document.createElement('div');
      scene.className = 'snoopy-map-scenery'; scene.setAttribute('aria-hidden','true');
      scenery[world].forEach((symbol,i) => {
        const decoration=document.createElement('span');decoration.textContent=symbol;
        decoration.className='snoopy-map-decoration decor-'+i;scene.appendChild(decoration);
      });
      section.appendChild(scene);
      const header = document.createElement('div');header.className='snoopy-map-world-head';
      const heading = document.createElement('h3');
      heading.textContent = themes[world] + ' MUNDO ' + (world+1) + ' · ' + worlds[world].name;
      const progress = document.createElement('small');progress.className='snoopy-map-world-progress';
      const got = [1,2,3].reduce((n,step)=>n+(state.meta.stars[world*3+step]||0),0);
      const unlocked = [1,2,3].filter(step=>world*3+step<=state.unlocked).length;
      progress.textContent = got+'/9 ★ · '+unlocked+'/3 accesibles · '+powerSymbols[worlds[world].power]+' poder';
      header.append(heading,progress);section.appendChild(header);
      const route = document.createElement('div');route.className='snoopy-map-route';
      for (let stage=0; stage<3; stage++) {
        const level=world*3+stage+1;
        const enabled=level<=state.unlocked;
        const stars=state.meta.stars[level]||0;
        const stop=document.createElement('div');stop.className='snoopy-map-stop';
        const button=document.createElement('button');button.type='button';
        button.className='snoopy-map-node '+(enabled?'':'locked ')+(state.level===level?'current':'')+(stars===3?' completed':'');
        button.disabled=!enabled;
        button.setAttribute('aria-label',enabled?
          `Entrar en el nivel ${world+1}-${stage+1}: ${LEVEL_DESIGNS[level-1].name}, ${stars} estrellas`:
          `Nivel ${world+1}-${stage+1} bloqueado`);
        const figure=document.createElement('span');figure.className='snoopy-map-marker';
        figure.textContent = enabled ? (stage===2?'👑':stars===3?'★':state.level===level?'🐶':'●') : '🔒';
        const number=document.createElement('strong');number.textContent=(world+1)+'-'+(stage+1);
        button.append(figure,number);
        const name=document.createElement('span');name.className='snoopy-map-stop-name';
        name.textContent=enabled?LEVEL_DESIGNS[level-1].name:'Por descubrir';
        const rating=document.createElement('small');rating.className='snoopy-map-stop-rating';
        rating.textContent=enabled?'★'.repeat(stars)+'☆'.repeat(3-stars):'○ ○ ○';
        stop.append(button,name,rating);route.appendChild(stop);
        if(enabled) button.addEventListener('click',()=>{
          closeWorldMap();marioLoad(level);enableAudio();canvas.focus();
          notify('¡'+LEVEL_DESIGNS[level-1].name+'!');
        });
      }
      section.appendChild(route);grid.appendChild(section);
    }
    mapNode.querySelector('.snoopy-map-progress').textContent =
      '★ '+totalStars()+'/45 · '+state.unlocked+'/15 niveles desbloqueados';
  }
  function openWorldMap(){
    if(!mapNode||state.mapOpen)return;
    if(state.shopOpen)closeShop();
    mapPausedRunning=mario.running;
    mario.running=false;state.mapOpen=true;
    renderWorldMap();mapNode.hidden=false;
    mapNode.querySelector('.snoopy-map-close').focus();
  }
  function closeWorldMap(){
    if(!mapNode||!state.mapOpen)return;
    mapNode.hidden=true;state.mapOpen=false;
    if(state.mode==='playing')mario.running=mapPausedRunning;
    canvas.focus();
  }

  function makeShopAndTools() {
    const panel = document.getElementById('mario-panel') || canvas.parentElement;
    if (!panel) return;
    const style = document.createElement('style');
    style.id = 'snoopy-v22-style';
    style.textContent = `
      #snoopy-tools {display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;margin:12px auto;font:600 12px system-ui,sans-serif}
      #snoopy-tools button,#snoopy-tools select {border:2px solid #275188;border-radius:5px;background:#fff8d9;color:#263b69;padding:9px 11px;min-height:40px;font:inherit;cursor:pointer}
      #snoopy-tools select {max-width:145px}
      #snoopy-tools button:hover {background:#ffe39b}
      #mario-ctrl {display:grid !important;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px !important;max-width:610px !important;width:100%;margin:13px auto 2px;touch-action:none}
      #mario-ctrl button {min-width:0 !important;min-height:52px !important;touch-action:none !important;-webkit-user-select:none;user-select:none}
      #mario-ctrl button.is-active {background:#9fddff !important;transform:scale(.97)}
      .snoopy-map-overlay[hidden]{display:none!important}
      .snoopy-map-overlay{position:fixed;inset:0;z-index:999998;background:rgba(9,19,44,.87);display:flex;align-items:center;justify-content:center;padding:12px;font-family:ui-monospace,Consolas,monospace}
      .snoopy-map-card{width:min(780px,100%);max-height:92vh;overflow:auto;background:#fef7de;border:4px solid #214b75;border-radius:13px;box-shadow:0 12px 0 #112643;padding:clamp(10px,2vw,20px);color:#183758}
      .snoopy-map-head{display:flex;align-items:center;gap:9px;justify-content:space-between;flex-wrap:wrap;margin-bottom:13px}
      .snoopy-map-head h2{margin:0;font-size:clamp(16px,3vw,22px);color:#b83f32}
      .snoopy-map-head button{border:2px solid #274e80;border-radius:6px;background:#fff;padding:9px 12px;cursor:pointer}
      .snoopy-map-progress{font-size:12px;font-weight:800;color:#385587}
      .snoopy-map-grid{display:grid;grid-template-columns:1fr;gap:13px}
      .snoopy-map-world{--sky:#9ce2ff;--ground:#6cc66a;--edge:#357548;--surface:#e3ffe0;position:relative;isolation:isolate;overflow:hidden;border:3px solid var(--edge);border-radius:11px;padding:12px 12px 13px;background:linear-gradient(180deg,var(--sky) 0 53%,var(--ground) 53% 100%);box-shadow:inset 0 -5px rgba(16,49,50,.14)}
      .snoopy-map-world.theme-1{--sky:#c4e7ff;--ground:#b3e6ed;--edge:#528da9;--surface:#e6faff}
      .snoopy-map-world.theme-2{--sky:#ffe4ec;--ground:#ecb0cc;--edge:#b15b89;--surface:#fff4d3}
      .snoopy-map-world.theme-3{--sky:#6d668f;--ground:#4b456e;--edge:#b29ad8;--surface:#f4ddff;color:#fff}
      .snoopy-map-world.theme-4{--sky:#263d88;--ground:#5968b5;--edge:#cfceff;--surface:#e0ebff;color:#fff}
      .snoopy-map-scenery{position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:.62;background:radial-gradient(ellipse at 20% 75%,rgba(255,255,255,.26) 0 14%,transparent 14.5%),radial-gradient(ellipse at 82% 68%,rgba(255,255,255,.24) 0 18%,transparent 18.5%)}
      .snoopy-map-decoration{position:absolute;display:block;font-size:clamp(25px,5vw,44px);filter:drop-shadow(0 3px rgba(25,45,55,.13))}
      .snoopy-map-decoration.decor-0{left:3%;bottom:5%}.snoopy-map-decoration.decor-1{right:7%;top:5%}.snoopy-map-decoration.decor-2{right:2%;bottom:6%}
      .snoopy-map-world-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;position:relative;z-index:1;background:rgba(255,255,255,.82);border-radius:5px;padding:5px 8px;color:#1d3956}
      .snoopy-map-world-head h3{font-size:clamp(11px,2.3vw,14px);margin:0;line-height:1.35}
      .snoopy-map-world-progress{font-size:10px;font-weight:800;color:#4a6277}
      .snoopy-map-route{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;position:relative;padding:8px 0 0}
      .snoopy-map-route:before{content:'';position:absolute;top:36px;left:16.5%;right:16.5%;border-top:6px dashed rgba(255,250,205,.95);filter:drop-shadow(0 2px #4a6470);z-index:0}
      .snoopy-map-stop{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:3px;min-width:0;position:relative;z-index:1;text-align:center}
      .snoopy-map-node{border:3px solid #254976;border-radius:50%;width:60px;height:60px;background:#fff8dc;color:#244e7c;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;cursor:pointer;box-shadow:0 4px 0 rgba(20,45,68,.5);font:inherit;transition:transform .12s}
      .snoopy-map-node:hover:not(:disabled){transform:translateY(-2px)}
      .snoopy-map-node .snoopy-map-marker{font-size:20px;line-height:1.2}
      .snoopy-map-node strong{font-size:12px;line-height:1.4}
      .snoopy-map-node.current{background:#ffe69a;border-color:#dd692e;box-shadow:0 0 0 3px #fff,0 5px 0 #a75a2a}
      .snoopy-map-node.completed{background:#fff0b7;border-color:#e1ab32}
      .snoopy-map-node.locked{background:#ccd5df;color:#53677b;opacity:.85;cursor:not-allowed}
      .snoopy-map-node:focus-visible{outline:4px solid #ffc13a;outline-offset:4px}
      .snoopy-map-stop-name{font-size:11px;line-height:1.25;max-width:180px;min-height:27px;overflow-wrap:anywhere;font-weight:800;text-shadow:0 1px rgba(255,255,255,.55)}
      .snoopy-map-stop-rating{font-size:13px;letter-spacing:1px;color:#ffd157;text-shadow:0 1px #584724}
      @media(max-width:550px){.snoopy-map-card{padding:8px;border-width:3px}.snoopy-map-world{padding:7px}.snoopy-map-head{gap:6px}.snoopy-map-node{width:52px;height:52px}.snoopy-map-route:before{top:32px}.snoopy-map-stop-name{font-size:9px;min-height:28px}.snoopy-map-world-progress{font-size:9px}}
      .snoopy-shop-overlay:not([hidden]) {display:flex}
      .snoopy-shop-overlay[hidden] {display:none !important}
      .snoopy-shop-overlay {position:fixed;inset:0;z-index:999999;background:rgba(24,30,49,.75);align-items:center;justify-content:center;padding:16px;font-family:system-ui,sans-serif;overflow-y:auto}
      .snoopy-shop-card {width:min(520px,100%);max-height:min(92vh,760px);overflow:auto;border-radius:8px;background:#fff8e5;color:#273c5f;box-shadow:0 20px 70px rgba(15,21,38,.3);padding:20px}
      .snoopy-shop-heading {display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}
      .snoopy-shop-heading h2 {font-size:22px;margin:0;color:#d44d35}
      .snoopy-shop-heading button {font-size:22px;background:white;border:2px solid #275188;border-radius:5px;width:38px;height:38px;cursor:pointer}
      .snoopy-shop-summary {font-weight:800;background:#fff0d8;border-radius:11px;padding:11px;text-align:center}
      .snoopy-shop-content {display:grid;gap:8px}
      .snoopy-shop-item {display:flex;justify-content:space-between;gap:10px;align-items:center;background:#fff2c9;border:2px solid #dcba67;border-radius:4px;padding:12px}
      .snoopy-shop-item strong,.snoopy-shop-item small {display:block}
      .snoopy-shop-item small {color:#7a7780;font-size:11px;margin-top:5px;line-height:1.4}
      .snoopy-shop-item button {flex:0 0 auto;background:#d95340;color:white;border:2px solid #9f3928;border-radius:4px;padding:10px;font:700 12px system-ui;cursor:pointer;min-width:112px}
      .snoopy-shop-item button:disabled {background:#e5d7dc;color:#827d83;cursor:default}
      .snoopy-shop-hint {font-size:11px;color:#7e7981;text-align:center;margin:6px 0}
      @media(max-width:550px) {#mario-ctrl{gap:6px !important}#mario-ctrl button{font-size:11px !important;min-height:52px !important}#snoopy-tools{gap:5px}#snoopy-tools button,#snoopy-tools select{font-size:11px;padding:7px 8px}.snoopy-shop-card{padding:13px}.snoopy-shop-item{padding:9px}.snoopy-shop-item button{min-width:94px}}
    `;
    document.head.appendChild(style);
    const tools = document.createElement('div'); tools.id = 'snoopy-tools';
    const shopBtn = document.createElement('button'); shopBtn.type = 'button';
    shopBtn.textContent = '🛍️ Tienda'; shopBtn.addEventListener('click', openShop);
    audioButton = document.createElement('button'); audioButton.type = 'button';
    audioButton.addEventListener('click', toggleAudio); refreshAudioButton();
    difficultyButton = document.createElement('button'); difficultyButton.type = 'button';
    difficultyButton.title = 'Alternar entre Fácil y Normal; al cargar otro nivel se aplican huecos y enemigos nuevos';
    difficultyButton.addEventListener('click', toggleDifficulty); refreshDifficultyButton();
    levelSelect = document.createElement('select'); levelSelect.id = 'snoopy-level-select';
    levelSelect.setAttribute('aria-label', 'Nivel desbloqueado');
    refreshLevelOptions();
    const levelBtn = document.createElement('button'); levelBtn.type = 'button';
    levelBtn.textContent = '▶ Nivel'; levelBtn.addEventListener('click', () => {
      const n = Number(levelSelect.value);
      if (!Number.isInteger(n) || n < 1 || n > state.unlocked) return;
      if (state.shopOpen) closeShop();
      marioLoad(n);
      enableAudio();
      canvas.focus();
      notify(`¡Nivel ${n}!`);
    });
    const mapBtn=document.createElement('button');mapBtn.type='button';
    mapBtn.id='snoopy-map-button';mapBtn.textContent='🗺️ Mapa de mundos';
    mapBtn.addEventListener('click',openWorldMap);
    tools.append(shopBtn, mapBtn, audioButton, difficultyButton, levelSelect, levelBtn);
    const actions = document.getElementById('mario-start')?.parentElement;
    if (actions && actions.parentElement === panel) actions.insertAdjacentElement('afterend', tools);
    else panel.appendChild(tools);
    shopNode = document.createElement('div'); shopNode.className = 'snoopy-shop-overlay';
    shopNode.id = 'snoopy-shop'; shopNode.hidden = true; shopNode.setAttribute('role','dialog');
    shopNode.setAttribute('aria-modal','true'); shopNode.setAttribute('aria-label','Tienda de mejoras de la aventura');
    shopNode.innerHTML = '<div class="snoopy-shop-card"><div class="snoopy-shop-heading"><h2>🛍️ Tienda Retro de Snoopy</h2><button type="button" class="snoopy-shop-close" aria-label="Cerrar tienda">×</button></div><div class="snoopy-shop-content"></div></div>';
    shopNode.querySelector('.snoopy-shop-close').addEventListener('click', closeShop);
    shopNode.addEventListener('pointerdown', e => { if (e.target === shopNode) closeShop(); });
    document.body.appendChild(shopNode);
    mapNode=document.createElement('div');
    mapNode.id='snoopy-map';mapNode.className='snoopy-map-overlay';mapNode.hidden=true;
    mapNode.setAttribute('role','dialog');mapNode.setAttribute('aria-modal','true');
    mapNode.setAttribute('aria-label','Mapa de mundos y selección de niveles');
    mapNode.innerHTML='<div class="snoopy-map-card"><div class="snoopy-map-head"><h2>🗺️ MAPA DE LOS CINCO MUNDOS</h2><strong class="snoopy-map-progress"></strong><button type="button" class="snoopy-map-close">✕ Cerrar</button></div><div class="snoopy-map-grid"></div></div>';
    mapNode.querySelector('.snoopy-map-close').addEventListener('click',closeWorldMap);
    mapNode.addEventListener('pointerdown',e=>{if(e.target===mapNode)closeWorldMap();});
    document.body.appendChild(mapNode);
  }
  function bindControls() {
    makeShopAndTools();
    const startButton = document.getElementById('mario-start');
    if (startButton) {
      startButton.addEventListener('click', function () {
        if (state.shopOpen) closeShop();
        enableAudio();
        if (state.mode === 'playing') {
          mario.running = !mario.running;
          notify(mario.running ? '¡A jugar!' : 'Partida pausada');
          return;
        }
        if (state.mode === 'victory' || state.mode === 'gameover') startGame(false);
        else startGame(!!readSave());
        refreshLevelOptions();
      });
    }
    const panel = document.getElementById('mario-panel') || canvas.parentElement;
    if (panel) panel.addEventListener('pointerdown', () => {
      if (state.mode === 'playing' && !state.shopOpen) canvas.focus();
    }, { passive: true });
    const ctrl = document.getElementById('mario-ctrl');
    if (ctrl) {
      // Añadir controles a las versiones anteriores sin borrar botones existentes.
      for (const [key, label] of [['dash','⚡ DASH'], ['slide','↘ DESLIZAR'], ['run','🏃 CORRER']]) {
        if (!ctrl.querySelector('[data-dir="' + key + '"]')) {
          const b = document.createElement('button');
          b.type = 'button'; b.dataset.dir = key; b.setAttribute('aria-label', label);
          b.textContent = label; ctrl.appendChild(b);
        }
      }
      const controls = ctrl.querySelectorAll('[data-dir], [data-key], button');
      controls.forEach(function (button) {
        const value = button.dataset.dir || button.dataset.key || button.getAttribute('aria-label') || '';
        const key = /left|izq/i.test(value) ? 'left' : /right|der/i.test(value) ? 'right' :
          /jump|up|salto/i.test(value) ? 'jump' : /power|poder/i.test(value) ? 'power' :
          /shoot|fire|disparo/i.test(value) ? 'shoot' : /dash|turbo/i.test(value) ? 'dash' :
          /slide|desliz/i.test(value) ? 'slide' : /run|correr/i.test(value) ? 'run' : null;
        if (!key) return;
        const down = function (event) {
          event.preventDefault();
          if (state.shopOpen) return;
          enableAudio();
          if (event.pointerId !== undefined && button.setPointerCapture) {
            try { button.setPointerCapture(event.pointerId); } catch (_) {}
          }
          button.classList.add('is-active');
          if (['left','right','run'].includes(key)) window.mkeys[key] = true;
          else window.mkeys[key + 'Pressed'] = true;
        };
        const up = function (event) {
          if (event) event.preventDefault();
          button.classList.remove('is-active');
          if (key === 'left' || key === 'right' || key === 'run') window.mkeys[key] = false;
          if (key === 'jump' && player.vy < -4) player.vy *= 0.58;
        };
        button.addEventListener('pointerdown', down);
        ['pointerup','pointercancel','lostpointercapture'].forEach(ev => button.addEventListener(ev, up));
        button.addEventListener('contextmenu', e => e.preventDefault());
      });
    }
  }

  const keyMap = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  document.addEventListener('keydown', function (event) {
    const tag = event.target?.tagName;
    if (state.mapOpen) { if (event.code==='Escape'){event.preventDefault();closeWorldMap();} return; }
    if (state.shopOpen) {
      if (event.code === 'Escape') { event.preventDefault(); closeShop(); }
      return;
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const mapped = keyMap[event.code];
    if (mapped && state.mode === 'playing') { window.mkeys[mapped] = true; event.preventDefault(); }
    if (['Space','ArrowUp','KeyW'].includes(event.code) && state.mode === 'playing') {
      if (!event.repeat) window.mkeys.jumpPressed = true;
      event.preventDefault();
    }
    if (event.code === 'KeyX' && !event.repeat) window.mkeys.powerPressed = true;
    if (['KeyZ','KeyC'].includes(event.code) && !event.repeat) window.mkeys.shootPressed = true;
    if (['ShiftLeft','ShiftRight'].includes(event.code)) { window.mkeys.run = true; event.preventDefault(); }
    if (event.code === 'KeyQ' && !event.repeat) window.mkeys.dashPressed = true;
    if (['ArrowDown','KeyS'].includes(event.code) && !event.repeat) {
      window.mkeys.slidePressed = true; window.mkeys.downPressed = true; event.preventDefault();
    }
    if (event.code === 'KeyB' && !event.repeat) { event.preventDefault(); openShop(); }
    if (event.code === 'KeyG' && !event.repeat) {event.preventDefault();openWorldMap();}
    if (event.code === 'KeyM' && !event.repeat) toggleAudio();
    if (event.code === 'KeyF' && !event.repeat) toggleDifficulty();
    if (event.code === 'Escape' && state.mode === 'playing') {
      mario.running = !mario.running;
      notify(mario.running ? 'Partida reanudada' : 'Partida pausada');
    }
  });
  document.addEventListener('keyup', function (event) {
    const mapped = keyMap[event.code];
    if (mapped) window.mkeys[mapped] = false;
    if (['ShiftLeft','ShiftRight'].includes(event.code)) window.mkeys.run = false;
    if (['Space','ArrowUp','KeyW'].includes(event.code) && player.vy < -4) player.vy *= 0.58;
  });
  window.addEventListener('blur', function () {
    window.mkeys.left = false; window.mkeys.right = false; window.mkeys.run = false;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode === 'playing') {
      mario.running = false; writeSave();
    }
  });
  window.snoopyAventura = {
    getSpriteStatus: () => ({ loaded: spriteAtlasReady, width: spriteAtlas && spriteAtlas.naturalWidth || 0, frames: 48, enemiesLoaded: enemySprites.ready, enemyFrames: 72, birdLoaded: birdSprites.ready, birdFrames: 72 }),
    openShop, closeShop, openWorldMap, closeWorldMap, toggleAudio, toggleDifficulty,
    getStatus: () => ({ version: '3.0-mundos-disenados', difficulty: state.difficulty,
      bird: { kills: state.companion.kills, bossHits: state.companion.bossHits, blocks: state.companion.blocks || 0, cooldown: state.companion.cooldown, projectiles: state.birdShots.length },
      level: state.level, world: state.world, unlocked: state.unlocked, levelName: LEVEL_DESIGNS[state.level-1].name, mapOpen: state.mapOpen,
      stars: { ...state.meta.stars }, wallet: state.meta.wallet, upgrades: { ...state.meta.upgrades },
      challenge: challengeLabel(), music: state.musicOn })
  };

  loadProgress();
  bindControls();
  drawMario();
  beginLoop();

})(window, document);

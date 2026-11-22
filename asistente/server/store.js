'use strict';
/* Base de datos en archivos JSON (sin dependencias). Escritura atómica: se guarda en un temporal y se renombra.
   Los datos que cambian con cada mensaje (conversaciones, opiniones, preguntas sin respuesta) se guardan POR LOTES:
   se espera unos segundos y se escribe una sola vez. Lo que edita el administrador se guarda al instante. */
const fs = require('fs');
const path = require('path');
const { DATA, SAVE_DELAY } = require('./config');
const seed = require('./seed');

function save(name, value) {
  fs.mkdirSync(DATA, { recursive: true });
  const file = path.join(DATA, name + '.json'), tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}
function load(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, name + '.json'), 'utf8')); }
  catch (e) {
    const file = path.join(DATA, name + '.json');
    if (e.code === 'ENOENT') { save(name, fallback); return fallback; }
    /* El archivo existe pero está dañado: NO se sobrescribe sin guardar antes una copia */
    try { fs.copyFileSync(file, file + '.danado-' + Date.now()); } catch { /* sin copia posible */ }
    console.error(`⚠ ${name}.json está dañado: se guardó una copia (.danado) y se usan valores por defecto.`);
    return fallback;
  }
}

const db = {
  knowledge: load('knowledge', seed.knowledge),
  settings: { ...seed.settings, ...load('settings', seed.settings) },
  pages: load('pages', []),
  conversations: load('conversations', {}),
  unanswered: load('unanswered', []),   // preguntas que la base de conocimientos no supo responder
  feedback: load('feedback', []),       // 👍 / 👎 de los visitantes
  admin: load('admin', {}),
};

/* Se guardan al instante: son cambios del administrador y no deben perderse */
const IMMEDIATE = new Set(['knowledge', 'settings', 'pages', 'admin']);
const timers = new Map();

function persist(name) {
  if (IMMEDIATE.has(name)) {
    clearTimeout(timers.get(name)); timers.delete(name);
    return save(name, db[name]);
  }
  if (timers.has(name)) return;   // ya hay un guardado pendiente: este cambio entra en el mismo lote
  const t = setTimeout(() => {
    timers.delete(name);
    try { save(name, db[name]); } catch (e) { console.error(`No se pudo guardar ${name}.json:`, e.message); }
  }, SAVE_DELAY);
  t.unref();
  timers.set(name, t);
}

/* Guarda de inmediato lo que esté pendiente (al cerrar el servidor) */
function flush() {
  for (const [name, t] of timers) {
    clearTimeout(t);
    try { save(name, db[name]); } catch { /* sin más opciones al cerrar */ }
  }
  timers.clear();
}
process.on('exit', flush);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flush(); process.exit(0); });

/* Borra conversaciones, opiniones y preguntas sin respuesta más antiguas que "retentionDays" */
function purgeConversations() {
  const limit = Date.now() - (Number(db.settings.retentionDays) || 30) * 86400000;
  let removed = 0;
  for (const [id, c] of Object.entries(db.conversations)) if ((c.updated || 0) < limit) { delete db.conversations[id]; removed++; }
  if (removed) persist('conversations');

  const before = db.unanswered.length + db.feedback.length;
  db.unanswered = db.unanswered.filter(u => (u.last || 0) >= limit);
  db.feedback = db.feedback.filter(f => (f.ts || 0) >= limit);
  if (db.unanswered.length + db.feedback.length !== before) { persist('unanswered'); persist('feedback'); }
  return removed;
}

module.exports = { db, persist, flush, purgeConversations };

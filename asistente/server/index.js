'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const { db, persist, purgeConversations } = require('./store');
const sec = require('./security');
const assistant = require('./assistant');
const ollama = require('./ollama');
const gemini = require('./gemini');
const personalGemini = require('./gemini-personal');
const sonoraStore = require('./sonora-store');
const indexer = require('./indexer');

/* Solo se sirven archivos con estas extensiones. Cualquier otra (sin extensión, .env, .log, .bak…) responde 404 */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.pdf': 'application/pdf'
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'";

/* ---------- Utilidades ---------- */
function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers });
  res.end(data);
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0, done = false; const parts = [];
    const fail = (status, error) => { if (!done) { done = true; reject({ status, error }); } };
    req.on('data', c => {
      size += c.length;
      if (size > 1048576) return req.destroy();                  // corta cualquier envío enorme
      if (size > cfg.MAX_BODY) return fail(413, 'Mensaje demasiado grande');
      parts.push(c);
    });
    req.on('end', () => { if (done) return; try { const v = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); done = true; resolve(v && typeof v === 'object' ? v : {}); } catch { fail(400, 'JSON no válido'); } });
    req.on('error', () => fail(400, 'Solicitud no válida'));
  });
}
function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && cfg.ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
}

/* ---------- Sesiones de chat en memoria (contexto de la conversación) ---------- */
const memory = new Map();
function turnsOf(sid) {
  const m = memory.get(sid);
  if (m) m.last = Date.now();
  return m ? m.turns : [];
}
function remember(sid, user, bot) {
  let m = memory.get(sid);
  if (!m) {
    if (memory.size >= 2000) memory.delete(memory.keys().next().value);
    m = { turns: [], last: 0 }; memory.set(sid, m);
  }
  m.turns.push({ r: 'u', t: user }, { r: 'a', t: bot });
  m.turns = m.turns.slice(-12); m.last = Date.now();
}
setInterval(() => { const old = Date.now() - 30 * 60000; for (const [k, m] of memory) if (m.last < old) memory.delete(k); }, 5 * 60000).unref();

function logTurn(sid, page, user, bot, source) {
  if (!db.settings.logConversations) return;
  const now = Date.now();
  const c = db.conversations[sid] || (db.conversations[sid] = { id: sid, started: now, updated: now, page, messages: [] });
  c.updated = now;
  if (c.messages.length < 200) c.messages.push({ r: 'u', t: sec.maskPII(user), ts: now }, { r: 'a', t: bot, ts: now, src: source });
  persist('conversations');   // se guarda por lotes (ver store.js), no en cada mensaje
}

/* ---------- Validación de datos del panel ---------- */
const bool = v => v === true || v === 'true';
function sanitizeEntry(b) {
  const question = sec.clean(b.question, 300), answer = sec.clean(b.answer, 2000);
  if (!question || !answer) return null;
  const keywords = (Array.isArray(b.keywords) ? b.keywords : String(b.keywords || '').split(',')).map(k => sec.clean(String(k), 40)).filter(Boolean).slice(0, 20);
  return { question, answer, keywords, link: sec.safeUrl(b.link), linkText: sec.clean(b.linkText, 60), faq: bool(b.faq), page: sec.clean(b.page, 40), enabled: b.enabled !== false && b.enabled !== 'false' };
}
/* Sinónimos: un grupo por línea, palabras separadas por comas. Solo letras, números, comas, espacios y guiones */
function sanitizeSynonyms(v) {
  return String(v || '').replace(/\r/g, '').split('\n').slice(0, 100)
    .map(line => line.replace(/[^\p{L}\p{N}, -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 200))
    .filter(Boolean).join('\n');
}
function sanitizeSettings(b) {
  const s = {}, str = (k, n) => { if (typeof b[k] === 'string') s[k] = sec.clean(b[k], n); }, flag = k => { if (k in b) s[k] = bool(b[k]); };
  str('assistantName', 40); str('siteName', 80); str('welcome', 500); str('fallbackMessage', 500); str('disabledMessage', 300); str('contactText', 60); str('ollamaModel', 60);
  ['enabled', 'aiEnabled', 'logConversations', 'showFaqs'].forEach(flag);
  if ('retentionDays' in b) s.retentionDays = Math.min(365, Math.max(1, parseInt(b.retentionDays, 10) || 30));
  if ('quickCount' in b) s.quickCount = Math.min(8, Math.max(0, parseInt(b.quickCount, 10) || 0));
  if ('siteBase' in b) { const v = sec.safeUrl(b.siteBase); s.siteBase = v && (v.startsWith('/') || /^https?:/i.test(v)) ? v : '/'; }
  if ('contactLink' in b) s.contactLink = sec.safeUrl(b.contactLink);
  if ('aiScope' in b) s.aiScope = b.aiScope === 'web' ? 'web' : 'general';   // "web": solo habla de tu web · "general": también programación y otros temas
  if ('synonyms' in b) s.synonyms = sanitizeSynonyms(b.synonyms);
  return s;
}

/* ---------- API pública ---------- */
async function publicApi(req, res, url) {
  const p = url.pathname;
  if (req.method === 'GET' && p === '/api/config') {
    const S = db.settings, page = sec.clean(url.searchParams.get('page') || '', 80), section = sec.clean(url.searchParams.get('section') || '', 40);
    return send(res, 200, { name: S.assistantName, welcome: S.welcome, enabled: S.enabled, siteBase: S.siteBase, faqs: S.showFaqs ? assistant.faqs(page, section, S.quickCount) : [] });
  }
  /* Prueba real de Gemini: sin guardar la clave, el mensaje ni la respuesta. */
  if (req.method === 'POST' && p === '/api/gemini/test') {
    if (!sec.limit('gemini-test:' + sec.ip(req), 6, 60000))
      return send(res, 429, { error: 'Demasiadas pruebas. Espera un minuto.' });
    const b = await readJson(req);
    const key = typeof b.personalGeminiKey === 'string' ? b.personalGeminiKey.trim() : '';
    const model = typeof b.personalGeminiModel === 'string' ? b.personalGeminiModel.trim() : personalGemini.DEFAULT_MODEL;
    if (!personalGemini.validKey(key))
      return send(res, 400, { error: 'Introduce una clave de Gemini con un formato válido.' });
    if (!personalGemini.validModel(model))
      return send(res, 400, { error: 'Selecciona un modelo Gemini válido.' });
    try {
      await personalGemini.reply({ key, model, text: 'Di solamente: listo.' });
      return send(res, 200, { ok: true, model });
    } catch (error) {
      return send(res, 502, { ok: false, error: error.publicMessage || 'No se pudo conectar con Gemini.' });
    }
  }
  if (req.method === 'POST' && (p === '/api/chat' || p === '/api/chat/stream')) {
    if (!sec.limit('chat:' + sec.ip(req), cfg.RATE_CHAT_PER_MIN, 60000)) return send(res, 429, { error: 'Vas muy rápido 😅 Espera un momento y vuelve a intentarlo.' });
    const b = await readJson(req);
    const text = sec.clean(b.message, cfg.MAX_MESSAGE), sid = /^[A-Za-z0-9_-]{8,64}$/.test(b.session || '') ? b.session : '';
    if (!text) return send(res, 400, { error: 'Escribe un mensaje.' });
    if (!sid) return send(res, 400, { error: 'Sesión no válida.' });
    const page = sec.clean(b.page, 80), section = sec.clean(b.section, 40);
    const safe = sec.maskPII(text);   // a la IA no se le envían correos ni teléfonos
    const history = turnsOf(sid);
    // La clave solo se usa en esta solicitud; nunca se persiste ni se registra.
    const personalKey = typeof b.personalGeminiKey === 'string' ? b.personalGeminiKey.trim() : '';
    if (personalKey && !personalGemini.validKey(personalKey)) {
      return send(res, 400, { error: 'La clave personal de Gemini no tiene un formato válido.' });
    }
    const personalModel = typeof b.personalGeminiModel === 'string' ? b.personalGeminiModel.trim() : personalGemini.DEFAULT_MODEL;
    if (personalKey && !personalGemini.validModel(personalModel))
      return send(res, 400, { error: 'El modelo personal de Gemini no es válido.' });
    const respond = opts => personalKey
      ? personalGemini.reply({ ...opts, key: personalKey, model: personalModel, assistantName: db.settings.assistantName,
          faqs: assistant.faqs(page, section, 7) })
      : assistant.reply(opts);

    /* Versión clásica: una sola respuesta JSON cuando la IA termina */
    if (p === '/api/chat') {
      let r;
      try {
        r = await respond({ text: safe, page, section, history });
      } catch (error) {
        if (personalKey) return send(res, 502, { error: error.publicMessage || 'No se pudo contactar con Gemini.' });
        throw error;
      }
      remember(sid, safe, r.reply); if (!personalKey) logTurn(sid, page, text, r.reply, r.source);
      return send(res, 200, { reply: r.reply, links: r.links, suggestions: r.suggestions, source: r.source });
    }

    /* Respuesta en tiempo real: una línea JSON por evento (NDJSON).
         {"type":"delta","text":"…"}   trozo de texto (solo cuando responde Gemini)
         {"type":"done","reply":…}     respuesta final completa, con enlaces y sugerencias (reemplaza a los trozos)
         {"type":"error","error":"…"}  fallo inesperado
       Los errores de validación y de límite (400/429) se responden como JSON normal, antes de empezar a transmitir. */
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    let open = true;
    res.on('close', () => { open = false; });   // si el visitante cierra la página, se deja de escribir
    const line = o => { if (open) res.write(JSON.stringify(o) + '\n'); };
    try {
      const r = await respond({ text: safe, page, section, history, onText: t => line({ type: 'delta', text: t }) });
      remember(sid, safe, r.reply); if (!personalKey) logTurn(sid, page, text, r.reply, r.source);
      line({ type: 'done', reply: r.reply, links: r.links, suggestions: r.suggestions, source: r.source });
    } catch (e) {
      console.error('Error en el chat:', e && e.message);
      line({ type: 'error', error: personalKey && e.publicMessage ? e.publicMessage : 'Ups, algo salió mal. Inténtalo de nuevo.' });
    }
    res.end();
    return true;
  }
  /* 👍 / 👎 sobre una respuesta. Solo se guarda si el guardado de conversaciones está activado */
  if (req.method === 'POST' && p === '/api/feedback') {
    if (!sec.limit('fb:' + sec.ip(req), 30, 60000)) return send(res, 429, { error: 'Vas muy rápido 😅' });
    const b = await readJson(req);
    const value = b.value === 'up' || b.value === 'down' ? b.value : '';
    const question = sec.maskPII(sec.clean(b.question, cfg.MAX_MESSAGE)), reply = sec.clean(b.reply, 1500);
    if (!value || !question || !reply) return send(res, 400, { error: 'Opinión no válida.' });
    if (db.settings.logConversations) {
      db.feedback.push({ id: 'f-' + crypto.randomBytes(5).toString('hex'), ts: Date.now(), value, question, reply, source: sec.clean(b.source, 20), page: sec.clean(b.page, 80) });
      if (db.feedback.length > 500) db.feedback.splice(0, db.feedback.length - 500);
      persist('feedback');
    }
    return send(res, 200, { ok: true });
  }
  return false;
}

/* ---------- API de administración ---------- */
async function adminApi(req, res, url) {
  const p = url.pathname, ip = sec.ip(req);
  if (req.method === 'POST' && p === '/api/admin/login') {
    if (!sec.limit('login:' + ip, 5, 15 * 60000)) return send(res, 429, { error: 'Demasiados intentos. Espera 15 minutos.' });
    const token = sec.login((await readJson(req)).password);
    return token ? send(res, 200, { token }) : send(res, 401, { error: 'Contraseña incorrecta.' });
  }
  if (!sec.checkToken((req.headers.authorization || '').replace(/^Bearer /, ''))) return send(res, 401, { error: 'No autorizado.' });
  let m;
  if (req.method === 'GET' && p === '/api/admin/state') {
    const st = await ollama.status(true);
    return send(res, 200, {
      knowledge: db.knowledge, settings: db.settings,
      stats: { pages: db.pages.length, conversations: Object.keys(db.conversations).length, unanswered: db.unanswered.length, up: db.feedback.filter(f => f.value === 'up').length, down: db.feedback.filter(f => f.value === 'down').length },
      ollama: { ok: st.ok, model: st.model, reason: st.reason }, gemini: gemini.status(), passwordFromEnv: Boolean(cfg.ADMIN_PASSWORD)
    });
  }
  if (req.method === 'POST' && p === '/api/admin/knowledge') {
    const e = sanitizeEntry(await readJson(req));
    if (!e) return send(res, 400, { error: 'La pregunta y la respuesta son obligatorias.' });
    const entry = { id: 'k-' + crypto.randomBytes(5).toString('hex'), ...e };
    db.knowledge.push(entry); persist('knowledge'); assistant.invalidate();
    return send(res, 201, entry);
  }
  if ((m = p.match(/^\/api\/admin\/knowledge\/([\w-]{1,40})$/))) {
    const i = db.knowledge.findIndex(k => k.id === m[1]);
    if (i < 0) return send(res, 404, { error: 'No existe.' });
    if (req.method === 'PUT') {
      const e = sanitizeEntry(await readJson(req));
      if (!e) return send(res, 400, { error: 'La pregunta y la respuesta son obligatorias.' });
      db.knowledge[i] = { id: m[1], ...e }; persist('knowledge'); assistant.invalidate();
      return send(res, 200, db.knowledge[i]);
    }
    if (req.method === 'DELETE') { db.knowledge.splice(i, 1); persist('knowledge'); assistant.invalidate(); return send(res, 200, { ok: true }); }
  }
  if (req.method === 'PUT' && p === '/api/admin/settings') {
    Object.assign(db.settings, sanitizeSettings(await readJson(req))); persist('settings'); assistant.invalidate();
    return send(res, 200, db.settings);
  }
  /* Preguntas que no supo responder: las más repetidas primero */
  if (req.method === 'GET' && p === '/api/admin/unanswered') {
    return send(res, 200, [...db.unanswered].sort((a, b) => b.count - a.count || b.last - a.last));
  }
  if (req.method === 'DELETE' && p === '/api/admin/unanswered') { db.unanswered = []; persist('unanswered'); return send(res, 200, { ok: true }); }
  if ((m = p.match(/^\/api\/admin\/unanswered\/([\w-]{1,40})$/)) && req.method === 'DELETE') {
    const i = db.unanswered.findIndex(u => u.id === m[1]);
    if (i < 0) return send(res, 404, { error: 'No existe.' });
    db.unanswered.splice(i, 1); persist('unanswered');
    return send(res, 200, { ok: true });
  }
  /* Opiniones 👍 / 👎 */
  if (req.method === 'GET' && p === '/api/admin/feedback') return send(res, 200, [...db.feedback].reverse().slice(0, 200));
  if (req.method === 'DELETE' && p === '/api/admin/feedback') { db.feedback = []; persist('feedback'); return send(res, 200, { ok: true }); }
  if ((m = p.match(/^\/api\/admin\/feedback\/([\w-]{1,40})$/)) && req.method === 'DELETE') {
    const i = db.feedback.findIndex(f => f.id === m[1]);
    if (i < 0) return send(res, 404, { error: 'No existe.' });
    db.feedback.splice(i, 1); persist('feedback');
    return send(res, 200, { ok: true });
  }
  if (req.method === 'GET' && p === '/api/admin/conversations') {
    const list = Object.values(db.conversations).sort((a, b) => b.updated - a.updated).slice(0, 200)
      .map(c => ({ id: c.id, started: c.started, updated: c.updated, page: c.page, count: c.messages.length / 2, preview: (c.messages[0] || {}).t || '' }));
    return send(res, 200, list);
  }
  if ((m = p.match(/^\/api\/admin\/conversations\/([\w-]{8,64})$/))) {
    const c = db.conversations[m[1]];
    if (!c) return send(res, 404, { error: 'No existe.' });
    if (req.method === 'GET') return send(res, 200, c);
    if (req.method === 'DELETE') { delete db.conversations[m[1]]; persist('conversations'); return send(res, 200, { ok: true }); }
  }
  if (req.method === 'DELETE' && p === '/api/admin/conversations') { db.conversations = {}; persist('conversations'); return send(res, 200, { ok: true }); }
  if (req.method === 'POST' && p === '/api/admin/reindex') {
    const r = indexer.indexSite(); assistant.invalidate();
    return send(res, 200, r);
  }
  if (req.method === 'POST' && p === '/api/admin/password') {
    if (cfg.ADMIN_PASSWORD) return send(res, 400, { error: 'La contraseña se define con ADMIN_PASSWORD; cámbiala allí.' });
    const pw = (await readJson(req)).password;
    if (typeof pw !== 'string' || pw.length < 8 || pw.length > 200) return send(res, 400, { error: 'Mínimo 8 caracteres.' });
    sec.setPassword(pw);
    return send(res, 200, { ok: true });
  }
  return false;
}

/* ---------- Archivos estáticos ---------- */
function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Método no permitido' });
  if (pathname === '/asistente') { res.writeHead(301, { Location: '/asistente/' }); return res.end(); }
  const isAssistant = pathname.startsWith('/asistente/');
  const base = isAssistant ? cfg.PUBLIC : cfg.SITE_DIR;
  const rel = isAssistant ? pathname.slice('/asistente/'.length) : pathname.slice(1);
  let file = path.resolve(base, rel || 'index.html');
  const inside = f => f === base || f.startsWith(base + path.sep);
  const hidden = f => path.relative(base, f).split(path.sep).some(s => s.startsWith('.'));
  const protectedProject = !isAssistant && (file === cfg.ROOT || file.startsWith(cfg.ROOT + path.sep));
  if (!inside(file) || hidden(file) || protectedProject) return send(res, 404, { error: 'No encontrado' });
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch { /* se trata abajo */ }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      if (pathname === '/') { res.writeHead(302, { Location: '/asistente/' }); return res.end(); }
      return send(res, 404, { error: 'No encontrado' });
    }
    const ext = path.extname(file).toLowerCase();
    if (!MIME[ext]) return send(res, 404, { error: 'No encontrado' });   // solo extensiones conocidas
    const headers = { 'Content-Type': MIME[ext], 'Content-Length': st.size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300' };
    if (isAssistant) { headers['Content-Security-Policy'] = CSP; headers['Referrer-Policy'] = 'no-referrer'; }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------- Servidor ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname; try { pathname = decodeURIComponent(url.pathname); } catch { return send(res, 400, { error: 'URL no válida' }); }
    url.pathname = pathname;
    if (pathname.startsWith('/api/')) {
      cors(req, res);
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      const handled = pathname.startsWith('/api/sonora/')
        ? await sonoraStore(req, res, url)
        : pathname.startsWith('/api/admin/') ? await adminApi(req, res, url) : await publicApi(req, res, url);
      if (handled === false) send(res, 404, { error: 'No encontrado' });
      return;
    }
    serveStatic(req, res, pathname);
  } catch (e) {
    if (e && e.status) return send(res, e.status, { error: e.error });
    console.error('Error:', e && e.message);
    if (!res.headersSent) send(res, 500, { error: 'Error interno' });
  }
});

function start(port = cfg.PORT, host = cfg.HOST) {
  const first = sec.initAdmin();
  purgeConversations();
  setInterval(purgeConversations, 3600000).unref();
  return new Promise(resolve => server.listen(port, host, () => {
    if (first) console.log(`\n  🔑 Contraseña de administración (se muestra solo esta vez): ${first}\n     Cámbiala con: npm run set-password -- "nueva contraseña"\n`);
    resolve(server);
  }));
}
module.exports = { start, server };

if (require.main === module) {
  start().then(async () => {
    const st = await ollama.status(true), g = gemini.status();
    console.log(`Asistente listo en http://${cfg.HOST}:${cfg.PORT}/asistente/`);
    console.log(`Panel de administración: http://${cfg.HOST}:${cfg.PORT}/asistente/admin.html`);
    console.log(g.ok ? `IA en línea: Gemini activo con el modelo ${g.model}` : `IA en línea: no disponible (${g.reason}).`);
    console.log(st.ok ? `IA local: Ollama activo con el modelo ${st.model}` : `IA local: no disponible (${st.reason}). Se usará la base de conocimientos.`);
  });
}

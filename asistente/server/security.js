'use strict';
const crypto = require('crypto');
const cfg = require('./config');
const { db, persist } = require('./store');

/* ---- Límite de solicitudes (en memoria; no se guardan IPs en disco) ---- */
const hits = new Map();
function limit(key, max, windowMs) {
  const now = Date.now();
  let h = hits.get(key);
  if (!h || h.reset < now) { h = { count: 0, reset: now + windowMs }; hits.set(key, h); }
  return ++h.count <= max;
}
setInterval(() => { const n = Date.now(); for (const [k, h] of hits) if (h.reset < n) hits.delete(k); }, 60000).unref();

function ip(req) {
  if (process.env.TRUST_PROXY === '1') { const f = req.headers['x-forwarded-for']; if (f) return String(f).split(',')[0].trim(); }
  return req.socket.remoteAddress || '?';
}

/* ---- Limpieza de texto ---- */
const clean = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
function maskPII(t) {
  return t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[correo]').replace(/(?:\+?\d[\s().-]?){7,}/g, '[número]');
}
/* Solo enlaces relativos o http(s). Rechaza javascript:, data:, etc. */
function safeUrl(u) {
  u = String(u || '').trim();
  if (!u || u.length > 300) return '';
  if (/^https?:\/\//i.test(u)) return u.replace(/[\u0000-\u001f"'<>\\]/g, '');
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return '';
  return u.replace(/[\u0000-\u001f"'<>\\]/g, '');
}

/* ---- Contraseña y sesiones de administración ---- */
const sessions = new Map();
let envHash = null;
function hashPw(pw, salt = crypto.randomBytes(16).toString('hex')) { return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'); }
function verifyPw(pw, stored) {
  const [salt, h] = String(stored || '').split(':');
  if (!salt || !h) return false;
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
/* Devuelve la contraseña generada si es la primera vez (para mostrarla una sola vez en consola). */
function initAdmin() {
  if (cfg.ADMIN_PASSWORD) { envHash = hashPw(cfg.ADMIN_PASSWORD); return null; }
  if (!db.admin.hash) { const pw = crypto.randomBytes(9).toString('base64url'); db.admin.hash = hashPw(pw); persist('admin'); return pw; }
  return null;
}
function login(pw) {
  if (typeof pw !== 'string' || !pw || pw.length > 200) return null;
  if (!verifyPw(pw, envHash || db.admin.hash)) return null;
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + 8 * 3600e3);
  return token;
}
function checkToken(t) {
  const exp = sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}
function setPassword(pw) { db.admin.hash = hashPw(pw); persist('admin'); sessions.clear(); }

module.exports = { limit, ip, clean, maskPII, safeUrl, initAdmin, login, checkToken, setPassword };

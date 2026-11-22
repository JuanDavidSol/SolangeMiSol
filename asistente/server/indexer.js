'use strict';
/* Lee los archivos .html de tu web y los convierte en "fragmentos" que el asistente puede consultar.
   Ejecuta:  npm run reindex   (o usa el botón "Actualizar desde la web" del panel). */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { db, persist } = require('./store');

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decode = s => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, m => ENT[m]);
const strip = h => decode(h.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function listHtml(dir, depth = 0, acc = []) {
  if (depth > 4) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (full === cfg.ROOT || full.startsWith(cfg.ROOT + path.sep)) continue;   // no indexar el propio asistente
    if (e.isDirectory()) listHtml(full, depth + 1, acc);
    else if (/\.html?$/i.test(e.name)) acc.push(full);
  }
  return acc;
}

function chunksOf(html, url) {
  html = html.replace(/<(script|style|noscript|template|svg|canvas)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const title = strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || url);
  const desc = decode((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || [])[1] || '');
  const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [null, html])[1];
  const parts = body.split(/(?=<h[1-3][\s>])/i);
  const chunks = [];
  if (desc) chunks.push({ heading: '', text: desc });
  for (const part of parts) {
    const h = (part.match(/^<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i) || [])[1];
    const text = strip(part.replace(/^<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>/i, ' '));
    const heading = h ? strip(h) : '';
    if (text.length < 25 && !heading) continue;
    for (let i = 0; i < Math.max(1, text.length); i += 600) {
      const piece = text.slice(i, i + 600).trim();
      if (piece.length >= 25 || (i === 0 && heading)) chunks.push({ heading, text: piece || heading });
    }
  }
  return chunks.map((c, i) => ({ id: `${url}#${i}`, url, title, heading: c.heading, text: c.text }));
}

function indexSite() {
  const files = listHtml(cfg.SITE_DIR);
  const pages = [];
  for (const f of files) {
    const url = path.relative(cfg.SITE_DIR, f).split(path.sep).join('/');
    try { pages.push(...chunksOf(fs.readFileSync(f, 'utf8'), url)); } catch { /* archivo ilegible: se omite */ }
  }
  db.pages = pages; persist('pages');
  return { files: files.length, chunks: pages.length };
}

module.exports = { indexSite };
if (require.main === module) { const r = indexSite(); console.log(`Indexados ${r.files} archivos HTML (${r.chunks} fragmentos) desde ${cfg.SITE_DIR}`); }

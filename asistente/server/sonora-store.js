'use strict';
// Biblioteca musical opcional. SOLO funciona al configurar una carpeta realmente persistente
// (Render Disk o volumen equivalente) y SONORA_LIBRARY_TOKEN.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { once } = require('events');

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_TRACKS = 200;
const DIR = process.env.SONORA_STORAGE_DIR || '';
const TOKEN = process.env.SONORA_LIBRARY_TOKEN || '';
const enabled = path.isAbsolute(DIR) && TOKEN.length >= 16;
const MIMES = Object.freeze({
  '.mp3':'audio/mpeg', '.m4a':'audio/mp4', '.wav':'audio/wav', '.ogg':'audio/ogg',
  '.flac':'audio/flac', '.aac':'audio/aac', '.opus':'audio/ogg'
});
function reply(res, code, payload) {
  if (res.headersSent) return;
  res.writeHead(code, {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer'
  });
  res.end(JSON.stringify(payload));
}
function authorized(req) {
  const value = req.headers['x-sonora-library-token'];
  if (typeof value !== 'string' || value.length < 1 || value.length > 300) return false;
  const expected = crypto.createHash('sha256').update(TOKEN).digest();
  const received = crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(expected, received);
}
function sameSite(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; }
  catch (_) { return false; }
}
function safeName(input) {
  const last = String(input || '').split(/[\\/]/).pop();
  return last.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim().slice(0, 145);
}
async function list() {
  let entries;
  try { entries = await fs.promises.readdir(DIR); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const results = [];
  for (const file of entries.filter(name => /^[a-f0-9]{24}\.json$/.test(name)).slice(0, MAX_TRACKS)) {
    try {
      const track = JSON.parse(await fs.promises.readFile(path.join(DIR, file), 'utf8'));
      if (track && /^[a-f0-9]{24}$/.test(track.id) && track.size <= MAX_BYTES) results.push(track);
    } catch (_) { /* ignorar metadatos dañados */ }
  }
  return results.sort((a, b) => a.added - b.added);
}
async function upload(req, res, url) {
  const length = Number(req.headers['content-length']);
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_BYTES)
    return reply(res, 413, {error:'Archivo vacío o mayor de 20 MB (o tamaño desconocido).'});
  const name = safeName(url.searchParams.get('name') || 'archivo');
  const ext = path.extname(name).toLowerCase();
  if (!name || !MIMES[ext]) return reply(res, 415, {error:'Solo se aceptan archivos MP3, M4A, WAV, OGG, FLAC, AAC u OPUS.'});
  if ((await list()).length >= MAX_TRACKS) return reply(res, 507, {error:'La biblioteca ya tiene 200 canciones.'});
  await fs.promises.mkdir(DIR, {recursive:true, mode:0o700});
  const id = crypto.randomBytes(12).toString('hex');
  const temporary = path.join(DIR, id + '.partial');
  const target = path.join(DIR, id + '.audio');
  const sink = fs.createWriteStream(temporary, {flags:'wx', mode:0o600});
  let written = 0;
  try {
    for await (const chunk of req) {
      written += chunk.length;
      if (written > MAX_BYTES) throw Object.assign(new Error('Archivo demasiado grande'), {status:413});
      if (!sink.write(chunk)) await once(sink, 'drain');
    }
    if (written !== length) throw Object.assign(new Error('Carga incompleta'), {status:400});
    await new Promise((resolve,reject) => {
      sink.once('error', reject);
      sink.end(resolve);
    });
    await fs.promises.rename(temporary, target);
    const metadata = {id, name, size:written, mime:MIMES[ext], added:Date.now()};
    await fs.promises.writeFile(path.join(DIR, id+'.json'), JSON.stringify(metadata), {flag:'wx', mode:0o600});
    return reply(res, 201, {ok:true, track:metadata});
  } catch (error) {
    sink.destroy();
    await Promise.all([temporary,target].map(p=>fs.promises.unlink(p).catch(()=>{})));
    return reply(res, error.status || 500, {error:error.status ? error.message : 'No se pudo guardar el audio. Comprueba el espacio del disco persistente.'});
  }
}
async function download(res, id) {
  try {
    const meta = JSON.parse(await fs.promises.readFile(path.join(DIR,id+'.json'),'utf8'));
    const file = path.join(DIR,id+'.audio');
    const stat = await fs.promises.stat(file);
    res.writeHead(200,{
      'Content-Type':Object.values(MIMES).includes(meta.mime) ? meta.mime : 'application/octet-stream',
      'Content-Length':stat.size, 'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer'
    });
    return fs.createReadStream(file).pipe(res);
  } catch (_) { return reply(res,404,{error:'La canción ya no está disponible.'}); }
}
module.exports = async function handleSonora(req,res,url) {
  const p=url.pathname;
  if(p==='/api/sonora/status' && req.method==='GET')
    return reply(res,200,{enabled,maxFileMB:20,maxTracks:MAX_TRACKS,private:true});
  if(!enabled) return reply(res,503,{error:'Almacenamiento de Sonora no configurado. Debe usarse un disco persistente y una contraseña exclusiva.'});
  if(!sameSite(req)) return reply(res,403,{error:'Solicitud de origen no permitido.'});
  if(!authorized(req)) return reply(res,401,{error:'Contraseña de la biblioteca incorrecta.'});
  if(p==='/api/sonora/tracks' && req.method==='GET')
    return reply(res,200,await list());
  if(p==='/api/sonora/tracks' && req.method==='POST')
    return upload(req,res,url);
  const matched=/^\/api\/sonora\/tracks\/([a-f0-9]{24})\/audio$/.exec(p);
  if(matched && req.method==='GET') return download(res,matched[1]);
  return false;
};

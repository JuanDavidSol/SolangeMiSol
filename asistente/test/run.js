'use strict';
/* Prueba de extremo a extremo: copia el proyecto a una web de ejemplo, arranca el servidor de verdad y prueba la API. */
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), { spawn } = require('child_process');
const assert = require('assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asistente-test-'));
const site = path.join(tmp, 'site'), proj = path.join(site, 'asistente');
fs.mkdirSync(site, { recursive: true });
fs.cpSync(path.resolve(__dirname, '..'), proj, { recursive: true, filter: s => !/[\\/](data|node_modules|test)([\\/]|$)/.test(s) });
fs.writeFileSync(path.join(site, 'juegos.html'), '<html><head><title>Rincón de juegos</title></head><body><h2>Horario de atención</h2><p>Atendemos los sábados por la tarde en el salón principal de la casa.</p><script>var x=1</script></body></html>');
fs.writeFileSync(path.join(site, 'secreto.txt'), 'ok-publico');
fs.writeFileSync(path.join(site, 'datos.xyz'), 'extension desconocida');
fs.writeFileSync(path.join(site, 'sin-extension'), 'sin extension');

let pass = 0;
const test = async (name, fn) => { try { await fn(); pass++; console.log('  ✔', name); } catch (e) { console.log('  ✘', name, '\n     ', e.message); process.exitCode = 1; } };

/* Ollama falso */
let ollamaUp = true, ollamaChats = 0;
const fake = http.createServer((req, res) => {
  if (!ollamaUp) { req.destroy(); return; }
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'qwen2.5:3b' }] }));
  if (req.url === '/api/chat') { ollamaChats++; let b = ''; req.on('data', c => b += c); req.on('end', () => { const j = JSON.parse(b); assert(j.messages[0].content.includes('CONTEXTO')); res.end(JSON.stringify({ message: { content: 'Respuesta desde la IA local 🤖' } })); }); return; }
  res.statusCode = 404; res.end('{}');
});

(async () => {
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  const PORT = 4300 + Math.floor(Math.random() * 500), base = `http://127.0.0.1:${PORT}`;
  const child = spawn(process.execPath, [path.join(proj, 'server/index.js')], { env: { ...process.env, PORT, HOST: '127.0.0.1', ADMIN_PASSWORD: 'clave-de-prueba-123', GEMINI_API_KEY: '', SITE_DIR: site, ALLOWED_ORIGINS: '', OLLAMA_MODEL: 'qwen2.5:3b', OLLAMA_URL: `http://127.0.0.1:${fake.address().port}`, DATA_DIR: path.join(tmp, 'data') }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, no) => { child.stdout.on('data', d => /Asistente listo/.test(d) && ok()); child.on('exit', c => no(new Error('el servidor se cerró: ' + c))); setTimeout(() => no(new Error('timeout al arrancar')), 8000); });

  const call = async (method, p, body, token, headers = {}) => {
    const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: r.status, json, text, headers: r.headers };
  };
  const raw = p => new Promise((ok, no) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { r.resume(); ok(r.statusCode); }).on('error', no));
  const sid = 'sesion-' + Math.random().toString(36).slice(2, 12);
  const chat = (message, s = sid, extra = {}) => call('POST', '/api/chat', { session: s, message, page: 'juegos.html', ...extra });
  const admin = async () => (await call('POST', '/api/admin/login', { password: 'clave-de-prueba-123' })).json.token;

  console.log('\nPrueba del asistente (con Ollama simulado, empieza APAGADO para probar la base de conocimientos)\n');
  ollamaUp = false;
  /* Desactivar la IA al inicio: el estado de Ollama se comprueba al arrancar y queda en caché 10 s */
  let token = await admin();
  await call('GET', '/api/admin/state', null, token);   // fuerza la comprobación (Ollama apagado)

  await test('config pública con preguntas frecuentes', async () => {
    const r = await call('GET', '/api/config?page=juegos.html&section=pac');
    assert.equal(r.status, 200); assert(r.json.faqs.length === 4); assert(r.json.faqs.some(q => /Pac-Snoopy/.test(q)), 'debe priorizar la sección');
    assert(!('ollamaModel' in r.json), 'no debe exponer ajustes internos');
  });
  await test('responde con la base de conocimientos', async () => {
    const r = await chat('¿cómo consigo galletas?'); assert.equal(r.json.source, 'kb'); assert(/galletas/i.test(r.json.reply)); assert(r.json.links.length === 1);
  });
  await test('saludo y agradecimiento', async () => {
    assert.equal((await chat('hola')).json.source, 'intent'); assert.equal((await chat('muchas gracias')).json.source, 'intent');
  });
  await test('no inventa: reconoce que no sabe y orienta', async () => {
    const r = await chat('¿cuánto cuesta un iPhone 15?'); assert.equal(r.json.source, 'unknown'); assert(r.json.suggestions.length > 0);
  });
  await test('mantiene el contexto en preguntas cortas de seguimiento', async () => {
    const s = 'ctx-' + sid; await chat('háblame del cofre sorpresa', s);
    const r = await chat('y cuánto cuesta', s); assert(/25 galletas/.test(r.json.reply), r.json.reply);
  });
  await test('respuestas según la sección', async () => {
    const r = await chat('pistas', 'sec-' + sid, { section: 'hang' }); assert(/Ahorcado|pista/i.test(r.json.reply), r.json.reply);
  });
  await test('valida los mensajes', async () => {
    assert.equal((await chat('   ')).status, 400);
    assert.equal((await call('POST', '/api/chat', { session: 'x', message: 'hola' })).status, 400);
    assert.equal((await call('POST', '/api/chat', 'no-json', null, { 'Content-Type': 'text/plain' })).status, 400);
    const big = await fetch(base + '/api/chat', { method: 'POST', body: JSON.stringify({ session: sid, message: 'a'.repeat(30000) }) }); assert.equal(big.status, 413);
  });
  await test('mensajes con código no se ejecutan ni rompen nada', async () => {
    const r = await chat('<img src=x onerror=alert(1)> <script>alert(1)</script>'); assert.equal(r.status, 200); assert(!/<script/i.test(r.json.reply));
  });
  await test('enmascara correos y teléfonos al guardar', async () => {
    await chat('mi correo es ana@correo.com y mi móvil 987 654 321', 'pii-' + sid);
    const list = (await call('GET', '/api/admin/conversations', null, token)).json;
    const c = (await call('GET', '/api/admin/conversations/' + list.find(x => x.id === 'pii-' + sid).id, null, token)).json;
    assert(!/ana@correo|987/.test(JSON.stringify(c)), JSON.stringify(c.messages[0]));
  });

  await test('panel: exige contraseña', async () => {
    assert.equal((await call('GET', '/api/admin/state')).status, 401);
    assert.equal((await call('GET', '/api/admin/state', null, 'falso')).status, 401);
    assert.equal((await call('POST', '/api/admin/login', { password: 'mal' })).status, 401);
  });
  await test('panel: lista de preguntas que no supo responder', async () => {
    const list = (await call('GET', '/api/admin/unanswered', null, token)).json;
    const item = list.find(u => /iphone/i.test(u.text)); assert(item, 'debe registrar la pregunta que no supo responder'); assert(item.count >= 1);
    assert.equal((await call('GET', '/api/admin/unanswered')).status, 401);
    assert.equal((await call('DELETE', '/api/admin/unanswered/' + item.id, null, token)).status, 200);
    assert(!(await call('GET', '/api/admin/unanswered', null, token)).json.some(u => u.id === item.id));
  });
  await test('opiniones 👍/👎: se validan, se enmascaran y se ven en el panel', async () => {
    assert.equal((await call('POST', '/api/feedback', { value: 'meh', question: 'a', reply: 'b' })).status, 400);
    assert.equal((await call('POST', '/api/feedback', { value: 'down', question: 'mi correo es ana@correo.com', reply: 'Respuesta de prueba', source: 'gemini', page: 'juegos.html' })).status, 200);
    const list = (await call('GET', '/api/admin/feedback', null, token)).json;
    assert(list.length === 1 && list[0].value === 'down', JSON.stringify(list)); assert(!/ana@correo/.test(JSON.stringify(list)));
    assert.equal((await call('GET', '/api/admin/state', null, token)).json.stats.down, 1);
    assert.equal((await call('DELETE', '/api/admin/feedback/' + list[0].id, null, token)).status, 200);
  });
  await test('panel: crear, editar y eliminar respuestas', async () => {
    const c = await call('POST', '/api/admin/knowledge', { question: '¿Cuál es el horario de atención?', answer: 'Los sábados por la tarde.', keywords: 'horario, hora, sabado', link: 'javascript:alert(1)', faq: true }, token);
    assert.equal(c.status, 201); assert.equal(c.json.link, '', 'debe rechazar javascript:');
    assert(/sábados/.test((await chat('cuál es el horario')).json.reply), 'la nueva respuesta debe usarse al instante');
    const u = await call('PUT', '/api/admin/knowledge/' + c.json.id, { ...c.json, answer: 'Los domingos.' }, token); assert.equal(u.json.answer, 'Los domingos.');
    assert.equal((await call('DELETE', '/api/admin/knowledge/' + c.json.id, null, token)).status, 200);
    assert.notEqual((await chat('cuál es el horario')).json.source, 'x');
    assert.equal((await call('POST', '/api/admin/knowledge', { question: '', answer: '' }, token)).status, 400);
  });
  await test('panel: ajustes (mensaje de bienvenida, desactivar)', async () => {
    await call('PUT', '/api/admin/settings', { welcome: 'Hola {nombre}!', retentionDays: 9999, quickCount: 2 }, token);
    const cfg = (await call('GET', '/api/config')).json; assert.equal(cfg.welcome, 'Hola {nombre}!'); assert.equal(cfg.faqs.length, 2);
    assert.equal((await call('GET', '/api/admin/state', null, token)).json.settings.retentionDays, 365);
    await call('PUT', '/api/admin/settings', { enabled: false }, token); assert.equal((await chat('hola')).json.source, 'system');
    await call('PUT', '/api/admin/settings', { enabled: true, quickCount: 4 }, token);
  });
  await test('panel: alcance de la IA solo admite "web" o "general"', async () => {
    await call('PUT', '/api/admin/settings', { aiScope: 'web' }, token);
    assert.equal((await call('GET', '/api/admin/state', null, token)).json.settings.aiScope, 'web');
    await call('PUT', '/api/admin/settings', { aiScope: '<raro>' }, token);
    assert.equal((await call('GET', '/api/admin/state', null, token)).json.settings.aiScope, 'general');
  });
  await test('actualiza el conocimiento leyendo las páginas de la web', async () => {
    const r = await call('POST', '/api/admin/reindex', null, token); assert(r.json.files === 1 && r.json.chunks >= 1, JSON.stringify(r.json));
    const a = await chat('atienden los sabados por la tarde en el salon'); assert(/Encontré esto|sábados/.test(a.json.reply), a.json.reply);
    assert(!/var x=1/.test(JSON.stringify(a.json)), 'no debe incluir código');
  });
  await test('tolera errores de escritura y usa los sinónimos del panel', async () => {
    const typo = await chat('como consigo galetas', 'typo-' + sid); assert.equal(typo.json.source, 'kb'); assert(/galletas/i.test(typo.json.reply), typo.json.reply);
    await call('PUT', '/api/admin/settings', { synonyms: 'galletas, bizcochitos\n<script>' }, token);
    assert.equal((await call('GET', '/api/admin/state', null, token)).json.settings.synonyms, 'galletas, bizcochitos\nscript', 'debe limpiar caracteres raros');
    const syn = await chat('como consigo bizcochitos', 'syn-' + sid); assert.equal(syn.json.source, 'kb'); assert(/galletas/i.test(syn.json.reply), syn.json.reply);
  });

  await test('con Ollama disponible: la base responde directo y la IA solo lo que la base no tiene', async () => {
    ollamaUp = true; const st = (await call('GET', '/api/admin/state', null, token)).json; assert.equal(st.ollama.ok, true);
    const kb = await chat('cómo consigo galletas', 'kbfirst-' + sid); assert.equal(kb.json.source, 'kb'); assert.equal(ollamaChats, 0, 'con respuesta casi exacta no se llama a la IA');
    const r = await chat('explícame qué es una variable en javascript', 'ia-' + sid); assert.equal(r.json.source, 'ollama'); assert(/IA local/.test(r.json.reply)); assert.equal(ollamaChats, 1);
  });
  await test('si Ollama se cae, sigue funcionando con la base de conocimientos', async () => {
    ollamaUp = false; await call('GET', '/api/admin/state', null, token);
    const r = await chat('cuéntame de los premios', 'ia2-' + sid); assert.equal(r.json.source, 'kb');
  });
  await test('Gemini reintenta ante 503 y 429, y se rinde tras los reintentos', async () => {
    let hits = 0, mode = 'recupera';
    const gem = http.createServer((req, res) => {
      hits++; req.resume(); res.setHeader('Content-Type', 'application/json');
      if (mode === 'siempre-503' || hits === 1) { res.statusCode = 503; return res.end(JSON.stringify({ error: { message: 'saturado' } })); }
      if (hits === 2) { res.statusCode = 429; return res.end('{}'); }
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: '¡Hola desde Gemini!' }] } }] }));
    });
    await new Promise(r => gem.listen(0, '127.0.0.1', r));
    process.env.GEMINI_API_KEY = 'clave-falsa'; process.env.GEMINI_BASE_URL = `http://127.0.0.1:${gem.address().port}`;
    try {
      const g = require(path.join(proj, 'server/gemini.js'));
      assert.equal(await g.chat([{ role: 'user', content: 'hola' }]), '¡Hola desde Gemini!'); assert.equal(hits, 3, 'dos fallos temporales y un éxito');
      hits = 0; mode = 'siempre-503';
      await assert.rejects(() => g.chat([{ role: 'user', content: 'hola' }]), /saturado|503/); assert.equal(hits, 3, 'un intento y dos reintentos');
    } finally { gem.close(); }
  });

  await test('Gemini en tiempo real: junta los trozos, reintenta antes del primer byte y conserva lo recibido si se corta', async () => {
    let hits = 0, mode = 'completo';
    const sse = txt => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n`;
    const gem = http.createServer((req, res) => {
      hits++; req.resume();
      assert(req.url.includes(':streamGenerateContent') && req.url.includes('alt=sse'), req.url);
      if (mode === 'completo' && hits === 1) { res.statusCode = 503; return res.end('{}'); }   // fallo temporal antes de empezar
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(sse('¡Hola'));
      if (mode === 'corte') return setTimeout(() => res.destroy(), 40);                        // la conexión se cae a mitad
      const last = sse('Gemini!');
      setTimeout(() => {
        res.write(sse(' desde '));
        res.write(last.slice(0, 20));                                                          // un evento llega partido en dos
        setTimeout(() => res.end(last.slice(20)), 30);
      }, 30);
    });
    await new Promise(r => gem.listen(0, '127.0.0.1', r));
    try {
      process.env.GEMINI_API_KEY = 'clave-falsa';
      const g = require(path.join(proj, 'server/gemini.js')), c = require(path.join(proj, 'server/config.js'));
      c.GEMINI_BASE_URL = `http://127.0.0.1:${gem.address().port}`;   // config ya se cargó en la prueba anterior: se apunta al servidor nuevo

      let deltas = [];
      const full = await g.chatStream([{ role: 'user', content: 'hola' }], t => deltas.push(t));
      assert.equal(full, '¡Hola desde Gemini!'); assert.equal(deltas.join(''), '¡Hola desde Gemini!'); assert(deltas.length >= 3, 'debe entregar varios trozos'); assert.equal(hits, 2, 'un reintento y un éxito');

      hits = 0; mode = 'corte'; deltas = [];
      await assert.rejects(() => g.chatStream([{ role: 'user', content: 'hola' }], t => deltas.push(t)), e => e.partial === '¡Hola');
      assert.equal(hits, 1, 'una vez empezado el texto no se reintenta');
    } finally { gem.close(); }
  });
  await test('/api/chat/stream: transmite líneas JSON y termina con "done"; los errores siguen siendo JSON normal', async () => {
    const r = await fetch(base + '/api/chat/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: 'st-' + sid, message: 'cómo consigo galletas', page: 'juegos.html' }) });
    assert.equal(r.status, 200); assert(/ndjson/.test(r.headers.get('content-type')), r.headers.get('content-type'));
    const events = (await r.text()).trim().split('\n').map(l => JSON.parse(l));
    const done = events[events.length - 1];
    assert.equal(done.type, 'done'); assert.equal(done.source, 'kb'); assert(/galletas/i.test(done.reply)); assert(Array.isArray(done.links));
    assert.equal((await call('POST', '/api/chat/stream', { session: 'st-' + sid, message: '   ' })).status, 400);
    assert.equal((await call('POST', '/api/chat/stream', { session: 'x', message: 'hola' })).status, 400);
  });

  await test('archivos: sirve la web y protege el proyecto', async () => {
    assert.equal((await call('GET', '/juegos.html')).status, 200);
    assert.equal((await call('GET', '/asistente/')).status, 200);
    assert.equal((await call('GET', '/asistente/admin.html')).headers.get('content-security-policy').includes("script-src 'self'"), true);
    for (const p of ['/asistente/server/index.js', '/asistente/data/admin.json', '/asistente/package.json', '/%61sistente/data/conversations.json', '/asistente/..%2fserver%2findex.js', '/asistente/..%2f..%2fsecreto.txt', '/asistente/%2e%2e%2fserver%2findex.js', '//asistente/server/index.js', '/..%2f..%2fetc/passwd', '/.git/config'])
      assert.equal(await raw(p), 404, p);
    assert.equal((await call('GET', '/secreto.txt')).text, 'ok-publico');
  });
  await test('archivos: solo se sirven extensiones conocidas', async () => {
    assert.equal(await raw('/datos.xyz'), 404); assert.equal(await raw('/sin-extension'), 404); assert.equal(await raw('/secreto.txt'), 200);
  });
  await test('límite de solicitudes (429) tras demasiados mensajes', async () => {
    let limited = false; for (let i = 0; i < 30 && !limited; i++) limited = (await chat('hola ' + i, 'rl-' + sid)).status === 429; assert(limited);
  });
  await test('límite de intentos de acceso al panel', async () => {
    let limited = false; for (let i = 0; i < 8 && !limited; i++) limited = (await call('POST', '/api/admin/login', { password: 'x' + i })).status === 429; assert(limited);
  });
  await test('guardado por lotes: las conversaciones llegan al disco y al cerrar no se pierde nada', async () => {
    const file = path.join(tmp, 'data', 'conversations.json');
    child.kill('SIGTERM');                                    // al cerrar, el servidor vacía lo pendiente
    await new Promise(r => child.once('exit', r));
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert(saved['kbfirst-' + sid] || saved[sid], 'la última conversación debe estar guardada');
  });

  console.log(`\n${pass} pruebas correctas${process.exitCode ? ' — HAY FALLOS' : ' ✅'}\n`);
  child.kill(); fake.close(); fs.rmSync(tmp, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });

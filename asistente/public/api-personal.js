/* Ejecutar desde la carpeta asistente: node integrar-api-personal.js
   Crea una copia .antes-api-personal.bak antes de cambiar index.js. */
'use strict';
const fs = require('fs');
const path = require('path');
const target = path.join(__dirname, 'server', 'index.js');
const companion = path.join(__dirname, 'server', 'gemini-personal.js');
const page = path.join(__dirname, 'public', 'index.html');
const script = path.join(__dirname, 'public', 'api-personal.js');
for (const file of [target, companion, page, script]) {
  if (!fs.existsSync(file)) { console.error('Falta el archivo:', file); process.exit(1); }
}
let code = fs.readFileSync(target, 'utf8');
if (code.includes('personalGeminiKey') && code.includes("require('./gemini-personal')")) {
  console.log('La integración ya estaba instalada. No se ha modificado el servidor.');
  process.exit(0);
}
const before = code;
function replaceOne(pattern, replacement, message) {
  const matches = code.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'));
  if (!matches || matches.length !== 1) throw new Error('No se encontró de forma única: ' + message + '. No se ha cambiado ningún archivo.');
  code = code.replace(pattern, replacement);
}
try {
  replaceOne(/(const gemini\s*=\s*require\(['"]\.\/gemini['"]\);)/, "$1\nconst personalGemini = require('./gemini-personal');", 'import de gemini');
  replaceOne(/(const history\s*=\s*turnsOf\(sid\)\s*;)/, `$1
    // Clave opcional suministrada solo en esta solicitud; nunca se persiste.
    const personalKey = typeof b.personalGeminiKey === 'string' ? b.personalGeminiKey.trim() : '';
    if (personalKey && !/^[A-Za-z0-9_-]{20,256}$/.test(personalKey)) return send(res, 400, { error: 'Clave de Gemini no válida.' });
    const respond = opts => personalKey
      ? personalGemini.reply({ ...opts, key: personalKey, assistantName: db.settings.assistantName,
          faqs: assistant.faqs(page, section, 7) })
      : assistant.reply(opts);
`, 'declaración de history');
  replaceOne(/const r\s*=\s*await assistant\.reply\(\{\s*text:\s*safe,\s*page,\s*section,\s*history\s*\}\);/, `let r;
      try { r = await respond({ text: safe, page, section, history }); }
      catch (error) {
        if (personalKey) return send(res, 502, { error: error.publicMessage || 'Gemini no está disponible.' });
        throw error;
      }`, 'respuesta clásica');
  replaceOne(/const r\s*=\s*await assistant\.reply\(\{\s*text:\s*safe,\s*page,\s*section,\s*history,\s*onText:\s*t\s*=>\s*line\(\{\s*type:\s*'delta',\s*text:\s*t\s*\}\)\s*\}\);/, "const r = await respond({ text: safe, page, section, history, onText: t => line({ type: 'delta', text: t }) });", 'respuesta streaming');
  const logCalls = /remember\(sid,\s*safe,\s*r\.reply\);\s*logTurn\(sid,\s*page,\s*text,\s*r\.reply,\s*r\.source\);/g;
  const count = (code.match(logCalls) || []).length;
  if (count !== 2) throw new Error('No se encontraron exactamente dos llamadas de guardado. No se modifica el archivo.');
  code = code.replace(logCalls, 'remember(sid, safe, r.reply); if (!personalKey) logTurn(sid, page, text, r.reply, r.source);');
  replaceOne(/line\(\{\s*type:\s*'error',\s*error:\s*'Ups, algo salió mal\. Inténtalo de nuevo\.'\s*\}\);/, "line({ type: 'error', error: personalKey && e.publicMessage ? e.publicMessage : 'Ups, algo salió mal. Inténtalo de nuevo.' });", 'errores de stream');
  const backup = target + '.antes-api-personal.bak';
  fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(target, code, 'utf8');
  console.log('✅ Integración activada en server/index.js');
  console.log('Se guardó una copia de seguridad:', backup);
  console.log('Ya puedes ejecutar npm start para hacer la prueba local.');
} catch (error) {
  console.error('No se aplicaron los cambios:', error.message);
  process.exitCode = 1;
}

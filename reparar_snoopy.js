/*
 * Reparación de la integración con API personal de Gemini para SolangeMiSol/Snoopy.
 * Ejecutar con Node.js: node reparar_snoopy.js
 * Colocar en la raíz del repositorio o dentro de la carpeta asistente.
 * No solicita ni guarda claves API.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const loc = [
  path.join(__dirname, 'asistente'),
  __dirname
].find(p => fs.existsSync(path.join(p, 'server', 'index.js')) && fs.existsSync(path.join(p, 'public', 'chat.js')));

if (!loc) {
  console.error('No se encontró la carpeta asistente. Coloca reparar_snoopy.js junto a la carpeta asistente (o dentro de ella).');
  process.exit(1);
}

const backend = path.join(loc, 'server', 'index.js');
const chat = path.join(loc, 'public', 'chat.js');
const browserKey = path.join(loc, 'public', 'api-personal.js');
const personal = path.join(loc, 'server', 'gemini-personal.js');
if (!fs.existsSync(personal)) {
  console.error('Falta asistente/server/gemini-personal.js. No se ha cambiado nada.');
  process.exit(1);
}

function swap1(source, from, to, label) {
  if (source.includes(to)) return source; // compatible con nuevas ejecuciones
  const at = source.indexOf(from);
  if (at < 0 || source.indexOf(from, at + from.length) !== -1) {
    throw new Error('No se encontró exactamente una vez: ' + label + '. No se ha modificado ningún archivo.');
  }
  return source.slice(0, at) + to + source.slice(at + from.length);
}
function swapCount(source, from, to, count, label) {
  if (source.includes(to) && !source.includes(from)) return source;
  const n = source.split(from).length - 1;
  if (n !== count) throw new Error('Se esperaban ' + count + ' apariciones de ' + label + ' y se encontraron ' + n + '. No se ha modificado ningún archivo.');
  return source.split(from).join(to);
}

const originalBackend = fs.readFileSync(backend, 'utf8');
const originalChat = fs.readFileSync(chat, 'utf8');
const originalPersonal = fs.readFileSync(personal, 'utf8');
let s = originalBackend;
let c = originalChat;
let m = originalPersonal;

try {
  s = swap1(s,
    "const gemini = require('./gemini');",
    "const gemini = require('./gemini');\nconst personalGemini = require('./gemini-personal');",
    'importar el servicio Gemini personal'
  );
  s = swap1(s,
    '    const history = turnsOf(sid);',
    `    const history = turnsOf(sid);
    // La clave solo se usa en esta solicitud, nunca se persiste.
    const personalKey = typeof b.personalGeminiKey === 'string' ? b.personalGeminiKey.trim() : '';
    if (personalKey && !/^[A-Za-z0-9_-]{20,256}$/.test(personalKey)) {
      return send(res, 400, { error: 'La clave personal de Gemini no tiene un formato válido.' });
    }
    const respond = opts => personalKey
      ? personalGemini.reply({ ...opts, key: personalKey, assistantName: db.settings.assistantName,
          faqs: assistant.faqs(page, section, 7) })
      : assistant.reply(opts);`,
    'leer la clave personal'
  );
  s = swap1(s,
    '      const r = await assistant.reply({ text: safe, page, section, history });',
    `      let r;
      try {
        r = await respond({ text: safe, page, section, history });
      } catch (error) {
        if (personalKey) return send(res, 502, { error: error.publicMessage || 'No se pudo contactar con Gemini.' });
        throw error;
      }`,
    'respuesta clásica'
  );
  s = swap1(s,
    "       const r = await assistant.reply({ text: safe, page, section, history, onText: t => line({ type: 'delta', text: t }) });",
    "       const r = await respond({ text: safe, page, section, history, onText: t => line({ type: 'delta', text: t }) });",
    'respuesta de streaming'
  );
  s = swapCount(s,
    'remember(sid, safe, r.reply); logTurn(sid, page, text, r.reply, r.source);',
    'remember(sid, safe, r.reply); if (!personalKey) logTurn(sid, page, text, r.reply, r.source);',
    2,
    'guardar mensajes'
  );
  s = swap1(s,
    "line({ type: 'error', error: 'Ups, algo salió mal. Inténtalo de nuevo.' });",
    "line({ type: 'error', error: personalKey && e.publicMessage ? e.publicMessage : 'Ups, algo salió mal. Inténtalo de nuevo.' });",
    'mostrar errores reales en el chat'
  );
  c = swap1(c,
    "   const payload = text => JSON.stringify({ session: state.sid, message: text, page: page(), section: section() });",
    `   const payload = text => {
     const body = { session: state.sid, message: text, page: page(), section: section() };
     const getKey = window.getSnoopyPersonalGeminiKey;
     const key = typeof getKey === 'function' ? getKey() : '';
     if (key) body.personalGeminiKey = key;
     return JSON.stringify(body);
   };`,
    'enviar clave personal desde chat.js'
  );
  // Gemini 2.5 Flash se está retirando. Usar el mismo modelo actual que la API principal.
  m = swapCount(m, "'gemini-2.5-flash'", "'gemini-3.8-flash'", 2, 'modelo Gemini personal predeterminado');
} catch (e) {
  console.error('Error de compatibilidad:', e.message);
  process.exit(1);
}

const client = `/* API personal de Gemini — se guarda solo en memoria hasta recargar la página. */
(() => {
  'use strict';
  let personalKey = '';
  const form = document.getElementById('api-key-form');
  const field = document.getElementById('personal-gemini-key');
  const status = document.getElementById('api-key-status');
  const remove = document.getElementById('api-key-remove');
  window.getSnoopyPersonalGeminiKey = () => personalKey;
  if (!form || !field || !status || !remove) return;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const value = field.value.trim();
    if (!/^[A-Za-z0-9_-]{20,256}$/.test(value)) {
      status.textContent = 'La clave no tiene un formato válido. Comprueba que sea una clave de Gemini.';
      return;
    }
    personalKey = value;
    field.value = ''; // evita que quede visible en el formulario
    status.textContent = 'Clave preparada para este chat. Escribe una pregunta para comprobar la conexión a Gemini. No se guarda al recargar.';
  });
  remove.addEventListener('click', () => {
    personalKey = '';
    field.value = '';
    status.textContent = 'Se quitó la clave de esta página.';
  });
  window.addEventListener('pagehide', () => { personalKey = ''; });
})();
`;

// Guardar copias de seguridad y escribir solo tras validar todos los patrones.
const changes = [
  [backend, originalBackend, s],
  [chat, originalChat, c],
  [personal, originalPersonal, m],
  [browserKey, fs.existsSync(browserKey) ? fs.readFileSync(browserKey, 'utf8') : null, client]
];
try {
  for (const [file, previous, next] of changes) {
    if (previous === next) continue;
    if (previous !== null) {
      const backup = file + '.antes-reparacion.bak';
      if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
    }
    fs.writeFileSync(file, next, 'utf8');
    console.log('Actualizado:', path.relative(loc, file));
  }
  // Comprobar que los JS resultantes sean sintácticamente válidos.
  for (const file of [backend, chat, browserKey, personal]) {
    const result = cp.spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error('Archivo con error: ' + file + '\n' + (result.stderr || ''));
  }
  console.log('\nReparación aplicada. Se comprobó la sintaxis de los 4 archivos.');
  console.log('Siguiente paso: sube los cambios a GitHub y espera a que Render los despliegue.');
  console.log('La clave se escribe en la web; NUNCA la subas a GitHub.');
} catch (e) {
  console.error('No se completó la comprobación:', e.message);
  process.exitCode = 1;
}

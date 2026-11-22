/* Chat del asistente. Dos modos:
   - Página completa:  <script src="chat.js" data-mode="page"></script>  (con un <div id="chat-root">)
   - Botón flotante en cualquier página:  <script src="/asistente/chat.js" data-mode="float" defer></script>
   Si el servidor del asistente no está encendido, el botón flotante simplemente no aparece.
   Opcional: data-timeout="60" (segundos que espera una respuesta antes de rendirse; por defecto 60). */
(() => {
  'use strict';
  const me = document.currentScript;
  const MODE = (me && me.dataset.mode) || 'float';
  const API = ((me && me.dataset.api) || window.ASISTENTE_API || '').replace(/\/$/, '');
  const TIMEOUT = Math.min(120, Math.max(10, Number(me && me.dataset.timeout) || 60)) * 1000;
  const KEY = 'asistente-chat-v1';

  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    el.append(...kids.flat().filter(x => x != null));
    return el;
  };
  const newSid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; } };
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* sin almacenamiento */ } };
  const page = () => location.pathname.split('/').pop() || 'index.html';
  const section = () => document.body.dataset.assistantSection || '';

  let state = load() || { sid: newSid(), msgs: [], open: false, min: false };
  let cfg = null, busy = false, typing = null;
  let liveEl = null, liveText = '', liveRaf = 0;   // respuesta que se está escribiendo en este momento
  const voiceSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  let voiceEnabled = voiceSupported;
  const SpeechRecognizer = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micSupported = typeof SpeechRecognizer === 'function';
  let micSession = null, micSilenceTimer = null;

  /* ---------- Estilos ---------- */
  const css = `
  .as-root{--r:#e8505b;--rs:#ffe0e2;--bg:#fff4ea;--ink:#3b3a4a;--muted:#7b7a8c;--line:#e9dccd;font-family:'Poppins',system-ui,sans-serif;color:var(--ink)}
  .as-root *{box-sizing:border-box}
  .as-fab{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:60px;height:60px;border:0;border-radius:50%;background:var(--r);color:#fff;font-size:30px;line-height:1;cursor:pointer;box-shadow:0 8px 24px #e8505b66;transition:transform .2s}
  .as-fab:hover{transform:scale(1.08)}
  .as-win{position:fixed;right:18px;bottom:90px;z-index:2147483000;width:min(380px,calc(100vw - 16px));height:min(560px,calc(100vh - 110px));display:flex;flex-direction:column;overflow:hidden;border-radius:22px;background:#fff;border:2px solid var(--line);box-shadow:0 18px 50px #0003;animation:as-pop .25s ease}
  .as-win.as-page{position:static;width:min(720px,100%);height:min(680px,78vh);margin:0 auto;animation:none;box-shadow:0 10px 28px #e8505b22}
  .as-win.as-min{height:auto}
  .as-win.as-min .as-log,.as-win.as-min .as-form,.as-win.as-min .as-mic-status{display:none}
  .as-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--r);color:#fff}
  .as-head .as-av{font-size:26px}
  .as-head .as-t{flex:1;min-width:0;line-height:1.2}
  .as-head b{display:block;font-size:15px}.as-head small{font-size:12px;opacity:.9}
  .as-head button{border:0;border-radius:10px;background:#ffffff30;color:#fff;font-size:15px;width:34px;height:34px;cursor:pointer}
  .as-head button:hover{background:#ffffff55}
  .as-head button.as-speech{font-size:20px;width:40px;flex-shrink:0}
  .as-head button:disabled{opacity:.55;cursor:not-allowed}
  .as-replay{margin-top:7px;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:999px;padding:4px 10px;font:500 12px inherit;cursor:pointer}
  .as-replay:hover{border-color:var(--r)}
  .as-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#fffaf5}
  .as-msg{max-width:86%;padding:10px 13px;border-radius:16px;font-size:14px;line-height:1.45;overflow-wrap:anywhere;animation:as-in .2s ease}
  .as-msg.as-a{align-self:flex-start;background:var(--bg);border:1px solid var(--line);border-bottom-left-radius:4px}
  .as-msg.as-u{align-self:flex-end;background:var(--r);color:#fff;border-bottom-right-radius:4px;white-space:pre-wrap}
  .as-md p{margin:0 0 .5em}.as-md p:last-child{margin-bottom:0}
  .as-md ul,.as-md ol{margin:.2em 0 .5em;padding-left:1.3em}.as-md li{margin:.15em 0}
  .as-md a{color:var(--r);font-weight:600}
  .as-md code{font-family:ui-monospace,Consolas,monospace;font-size:.92em;background:#0000000d;padding:1px 5px;border-radius:5px}
  .as-md pre{margin:.4em 0 .6em;padding:10px 12px;border-radius:10px;background:#2b2a3a;color:#f3f0ff;overflow-x:auto;font-size:12.5px;line-height:1.45;white-space:pre}
  .as-md pre code{background:none;padding:0;color:inherit}
  .as-links,.as-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  .as-links a{display:inline-block;padding:6px 12px;border-radius:999px;background:var(--r);color:#fff;font-size:13px;font-weight:600;text-decoration:none}
  .as-chips button{padding:6px 12px;border:2px solid var(--line);border-radius:999px;background:#fff;color:var(--ink);font:600 13px/1.2 inherit;cursor:pointer;text-align:left}
  .as-chips button:hover{border-color:var(--r)}
  .as-rates{display:flex;gap:4px;margin-top:6px;opacity:.75}
  .as-rate{border:0;background:none;font-size:14px;line-height:1;padding:3px 6px;border-radius:8px;cursor:pointer;filter:grayscale(1)}
  .as-rate:hover:not(:disabled){background:#0000000d;filter:none}
  .as-rate.on{filter:none;background:var(--rs)}
  .as-rate:disabled{cursor:default}
  .as-typing{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;border-radius:16px;background:var(--bg);border:1px solid var(--line)}
  .as-typing i{width:7px;height:7px;border-radius:50%;background:var(--muted);animation:as-dot 1s infinite}
  .as-typing i:nth-child(2){animation-delay:.15s}.as-typing i:nth-child(3){animation-delay:.3s}
  .as-form{display:flex;gap:8px;padding:10px;border-top:2px solid var(--line);background:#fff}
  .as-form input{flex:1;min-width:0;padding:10px 14px;border:2px solid var(--line);border-radius:999px;font:inherit;font-size:14px;color:var(--ink)}
  .as-form input:focus{outline:none;border-color:var(--r)}
  .as-form button{border:0;border-radius:999px;padding:0 18px;background:var(--r);color:#fff;font:600 14px inherit;cursor:pointer}
  .as-form button:disabled{opacity:.5;cursor:default}
  .as-form button.as-mic{flex:0 0 44px;width:44px;height:44px;padding:0;background:#fce8ec;color:#9c3045;border:1px solid var(--line);font-size:21px}
  .as-form button.as-mic.listening{background:var(--r);color:#fff;box-shadow:0 0 0 4px #e8505b33;animation:as-mic-pulse 1.3s ease-in-out infinite}
  .as-mic-status{padding:6px 14px;font-size:12px;color:var(--muted);background:#fffaf5;border-top:1px solid var(--line)}
  .as-mic-status[hidden]{display:none}
  .as-err{padding:20px;text-align:center;color:var(--muted);font-size:14px}
  @keyframes as-pop{from{transform:translateY(14px) scale(.97);opacity:0}}
  @keyframes as-in{from{transform:translateY(6px);opacity:0}}
  @keyframes as-dot{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-5px);opacity:1}}
  @keyframes as-mic-pulse{50%{box-shadow:0 0 0 8px #e8505b16}}
  @media (prefers-reduced-motion:reduce){.as-root *{animation:none!important;transition:none!important}}`;
  document.head.append(h('style', {}, css));

  /* ---------- Markdown mínimo y seguro ----------
     Convierte **negrita**, *cursiva*, `código`, bloques ```código```, listas, encabezados y [enlaces](url).
     Todo se construye con nodos DOM y textContent (nunca innerHTML), así que el texto de la IA no puede inyectar HTML. */
  function inline(text) {
    const parts = [];
    const re = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*|__[^_\n]+?__)|(\*[^*\s][^*\n]*?\*)|(\[[^\]\n]+\]\([^)\s]+\))/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      const s = m[0];
      if (m[1]) parts.push(h('code', {}, s.slice(1, -1)));
      else if (m[2]) parts.push(h('strong', {}, ...inline(s.slice(2, -2))));
      else if (m[3]) parts.push(h('em', {}, ...inline(s.slice(1, -1))));
      else {
        const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(s);
        const href = mm && resolveUrl(mm[2]);          // solo http(s) o rutas de la web; nunca javascript:
        parts.push(href ? h('a', { href, target: '_blank', rel: 'noopener' }, mm[1]) : s);
      }
      last = m.index + s.length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  }
  const LI = /^\s*([-*•]|\d+[.)])\s+(.*)$/;
  function renderMd(src) {
    const frag = document.createDocumentFragment();
    const lines = String(src || '').replace(/\r/g, '').split('\n');
    let i = 0, para = [];
    const flush = () => {
      if (!para.length) return;
      const p = h('p');
      para.forEach((l, k) => { if (k) p.append(h('br')); p.append(...inline(l)); });
      frag.append(p); para = [];
    };
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {                       // bloque de código
        flush(); const code = []; i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
        i++;
        frag.append(h('pre', {}, h('code', {}, code.join('\n'))));
        continue;
      }
      const li = LI.exec(line);
      if (li) {                                          // lista (con viñetas o numerada)
        flush();
        const list = h(/\d/.test(li[1]) ? 'ol' : 'ul');
        for (let m; i < lines.length && (m = LI.exec(lines[i])); i++) list.append(h('li', {}, ...inline(m[2])));
        frag.append(list);
        continue;
      }
      const hd = /^#{1,6}\s+(.*)$/.exec(line);          // encabezados: se muestran como texto en negrita
      if (hd) { flush(); frag.append(h('p', {}, h('strong', {}, ...inline(hd[1])))); i++; continue; }
      if (!line.trim()) { flush(); i++; continue; }
      para.push(line); i++;
    }
    flush();
    return frag;
  }

  /* ---------- Piezas ---------- */
  const log = h('div', { class: 'as-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversación con el asistente' });
  const input = h('input', { type: 'text', maxlength: '500', placeholder: 'Escribe tu pregunta…', 'aria-label': 'Escribe tu pregunta', autocomplete: 'off' });
  const sendBtn = h('button', { type: 'submit' }, 'Enviar');
  const micBtn = h('button', {
    type: 'button', class: 'as-mic',
    title: micSupported ? 'Hablar con Snoopy' : 'Este navegador no admite dictado por voz',
    'aria-label': micSupported ? 'Hablar con Snoopy' : 'Dictado no disponible',
    'aria-pressed': 'false', onclick: toggleMic
  }, '🎤');
  micBtn.disabled = !micSupported;
  const micStatus = h('div', { class: 'as-mic-status', role: 'status', 'aria-live': 'polite', hidden: 'hidden' });
  const form = h('form', { class: 'as-form', onsubmit: e => { e.preventDefault(); ask(input.value); } }, input, micBtn, sendBtn);
  const title = h('b', {}, 'Asistente');
  const voiceBtn = h('button', {
    type: 'button', class: 'as-speech',
    title: voiceSupported ? 'Desactivar respuestas por voz' : 'Este navegador no admite voz',
    'aria-label': 'Desactivar respuestas por voz', 'aria-pressed': String(voiceEnabled),
    onclick: toggleVoice
  }, voiceSupported ? '🔊' : '🔇');
  voiceBtn.disabled = !voiceSupported;
  const head = h('div', { class: 'as-head' },
    h('span', { class: 'as-av', 'aria-hidden': 'true' }, '🐶'),
    h('div', { class: 'as-t' }, title, h('small', {}, 'Te ayudo con esta web')),
    voiceBtn,
    h('button', { type: 'button', title: 'Nueva conversación', 'aria-label': 'Nueva conversación', onclick: newChat }, '➕'));
  const win = h('div', { class: 'as-win' + (MODE === 'page' ? ' as-page' : ''), role: 'dialog', 'aria-label': 'Asistente virtual' }, head, log, micStatus, form);
  const root = h('div', { class: 'as-root' });
  const fab = h('button', { class: 'as-fab', type: 'button', 'aria-label': 'Abrir el asistente', onclick: () => setOpen(true) }, '💬');

  if (MODE === 'float') {
    head.append(
      h('button', { type: 'button', title: 'Minimizar', 'aria-label': 'Minimizar', onclick: () => { state.min = !state.min; if (state.min) { stopVoice(); stopMic(true); } save(); layout(); } }, '—'),
      h('button', { type: 'button', title: 'Cerrar', 'aria-label': 'Cerrar el asistente', onclick: () => setOpen(false) }, '✕'));
    root.append(win, fab);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.open) setOpen(false); });
  } else root.append(win);

  /* ---------- Voz calmada y clara en español (Web Speech API) ---------- */
  function stopVoice() {
    if (voiceSupported) window.speechSynthesis.cancel();
  }
  function preferredVoice() {
    if (!voiceSupported) return null;
    const spanish = window.speechSynthesis.getVoices()
      .filter(v => /^es(?:-|$)/i.test(v.lang || ''));
    const score = v => {
      const lang = (v.lang || '').toLowerCase();
      const name = (v.name || '').toLowerCase();
      // Preferimos una voz natural y más suave, diferente de la preferencia es-PE anterior.
      const quality = /neural|natural|premium|online/i.test(name) ? 80 : /google|microsoft/i.test(name) ? 30 : 0;
      const locale = lang.startsWith('es-mx') ? 35 : lang.startsWith('es-es') ? 32
        : lang.startsWith('es-us') ? 22 : lang.startsWith('es-pe') ? 10 : 12;
      return quality + locale + (v.localService ? 2 : 0);
    };
    spanish.sort((a, b) => score(b) - score(a));
    return spanish[0] || null;
  }
  function spokenText(text) {
    return String(text || '')
      .replace(/[\x60]{3}[\s\S]*?[\x60]{3}/g, ' Hay un ejemplo de código en la pantalla. ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[\x60]([^\x60]+)[\x60]/g, '$1')
      .replace(/https?:\/\/\S+/gi, ' un enlace ')
      .replace(/[*_#~>|]/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 3200);
  }
  function speakReply(text, force = false) {
    if (!voiceSupported || (!voiceEnabled && !force)) return;
    const words = spokenText(text);
    if (!words) return;
    stopVoice();
    const speech = new window.SpeechSynthesisUtterance(words);
    const chosen = preferredVoice();
    if (chosen) { speech.voice = chosen; speech.lang = chosen.lang; }
    else speech.lang = 'es-PE';
    speech.rate = 1.18;    // un poco más rápida, manteniendo dicción clara
    speech.pitch = 0.94;   // entonación más serena
    speech.volume = 0.82;  // volumen suave
    window.speechSynthesis.speak(speech);
  }
  function toggleVoice() {
    if (!voiceSupported) return;
    voiceEnabled = !voiceEnabled;
    voiceBtn.textContent = voiceEnabled ? '🔊' : '🔇';
    voiceBtn.title = voiceEnabled ? 'Desactivar respuestas por voz' : 'Activar respuestas por voz';
    voiceBtn.setAttribute('aria-label', voiceBtn.title);
    voiceBtn.setAttribute('aria-pressed', String(voiceEnabled));
    if (!voiceEnabled) stopVoice();
  }

  /* ---------- Dictado por voz: solo después de pulsar el micrófono ---------- */
  function showMicStatus(message) {
    micStatus.textContent = message || '';
    micStatus.hidden = !message;
  }
  function markMicListening(isListening) {
    micBtn.classList.toggle('listening', isListening);
    micBtn.textContent = isListening ? '⏹' : '🎤';
    micBtn.title = isListening ? 'Terminar de hablar' : 'Hablar con Snoopy';
    micBtn.setAttribute('aria-label', micBtn.title);
    micBtn.setAttribute('aria-pressed', String(isListening));
  }
  function stopMic(cancel = false) {
    if (!micSession) return;
    const current = micSession;
    if (cancel) {
      current.cancelled = true;
      micSession = null;
      markMicListening(false);
    } else {
      current.stopping = true; // Detención normal: no mostrar «aborted» como fallo
    }
    if (micSilenceTimer) clearTimeout(micSilenceTimer);
    micSilenceTimer = null;
    if (!cancel && current.waitingRestart) {
      // Chrome ya cerró su turno; completa el dictado con el texto disponible.
      current.recognition.onend();
      return;
    }
    try {
      if (cancel) current.recognition.abort();
      else current.recognition.stop();
    } catch (_) {
      if (micSession === current) {
        micSession = null;
        markMicListening(false);
      }
    }
  }
  function microphoneError(code) {
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      return 'El micrófono está bloqueado. Dale permiso a esta página en Chrome.';
    }
    if (code === 'audio-capture') return 'No se detectó ningún micrófono. Revisa el dispositivo.';
    if (code === 'no-speech') return 'No escuché palabras. Prueba otra vez más cerca del micrófono.';
    if (code === 'network') return 'El reconocimiento de voz no pudo conectarse. Revisa Internet.';
    if (code === 'language-not-supported') return 'Chrome no admite el idioma de dictado seleccionado. Prueba cambiando el idioma del navegador a español.';
    if (code === 'aborted') return 'El reconocimiento se interrumpió. Pulsa 🎤 para intentarlo de nuevo.';
    if (code === 'phrases-not-supported') return 'Chrome no permite esta función de dictado. Prueba con una versión actualizada.';
    return 'El reconocimiento falló (código: ' + String(code || 'desconocido').replace(/[^a-z-]/g, '').slice(0,40) + '). Revisa el permiso del micrófono y vuelve a intentarlo.';
  }
  function toggleMic() {
    if (!micSupported || busy) return;
    if (micSession) {
      stopMic();  // segunda pulsación: finalizar dictado y enviar lo reconocido
      return;
    }
    stopVoice(); // evitar que Snoopy se escuche a sí mismo
    let recognition;
    try { recognition = new SpeechRecognizer(); }
    catch (_) {
      showMicStatus('No se pudo iniciar el reconocimiento de voz.');
      return;
    }
    // Usa el español configurado en Chrome; es-ES como alternativa ampliamente disponible.
    recognition.lang = /^es(?:-|$)/i.test(navigator.language || '') ? navigator.language : 'es-ES';
    // Escucha continua hasta pulsar ⏹. No cortar por una pausa breve.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    const current = {
      recognition, base: input.value.trim(), final: '', interim: '',
      cancelled: false, stopping: false, error: '', audioStarted: false, speechStarted: false, completed: '', waitingRestart: false
    };
    micSession = current;
    recognition.onstart = () => {
      if (micSession !== current) return;
      current.waitingRestart = false;
      markMicListening(true);
      showMicStatus('🎤 Te escucho de forma continua. Pulsa ⏹ cuando termines para enviar lo que dijiste.');
    };
    recognition.onaudiostart = () => {
      if (micSession !== current) return;
      current.audioStarted = true;
      showMicStatus('🎤 Chrome está recibiendo audio. Habla ahora.');
    };
    recognition.onspeechstart = () => {
      if (micSession !== current) return;
      current.speechStarted = true;
      showMicStatus('🎤 Reconociendo lo que dices…');
    };
    recognition.onresult = event => {
      if (micSession !== current) return;
      let final = '', interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const segment = event.results[i];
        const text = segment[0] && segment[0].transcript || '';
        if (segment.isFinal) final += ' ' + text;
        else interim += ' ' + text;
      }
      current.final = [current.completed, final.trim()].filter(Boolean).join(' ').trim();
      current.interim = interim.trim();
      input.value = [current.base, current.final, current.interim].filter(Boolean).join(' ').trim().slice(0, 500);
      // No hay temporizador de silencio: el usuario decide cuándo finalizar.
      showMicStatus(current.interim ? '🎤 Escuchando: ' + current.interim.slice(-100)
        : current.final ? '✓ Entendí: ' + current.final.slice(-110) + '…' : '🎤 Te escucho…');
    };
    recognition.onerror = event => {
      if (micSession !== current) return;
      const errorCode = event && event.error || 'unknown';
      // Chrome puede emitir «aborted» al terminar una captura solicitada por el usuario.
      if (current.stopping && errorCode === 'aborted') return;
      // Si ya reconoció la frase, los errores posteriores no deben borrar la respuesta.
      if (current.final && (errorCode === 'no-speech' || errorCode === 'aborted')) return;
      current.error = errorCode;
      if (errorCode === 'aborted') {
        showMicStatus(current.audioStarted
          ? 'Chrome canceló el reconocimiento después de activar el micrófono. Cierra otras pestañas que lo estén usando y vuelve a pulsar 🎤.'
          : 'Chrome canceló el dictado antes de recibir audio. Revisa el micrófono predeterminado de Windows y los permisos de Chrome.');
      } else {
        showMicStatus(microphoneError(current.error));
      }
    };
    recognition.onend = () => {
      if (micSession !== current) return;
      if (micSilenceTimer) clearTimeout(micSilenceTimer);
      micSilenceTimer = null;
      if (current.cancelled || current.error) {
        micSession = null;
        markMicListening(false);
        return;
      }
      if (!current.stopping) {
        // En algunos navegadores la captura termina sola aunque el modo sea continuo.
        // Conserva lo dictado y reanuda mientras el usuario mantenga activo el botón.
        current.waitingRestart = true;
        current.completed = (current.final || current.completed).trim();
        current.final = current.completed;
        current.interim = '';
        showMicStatus('🎤 Te sigo escuchando… Pulsa ⏹ para enviar.');
        micSilenceTimer = setTimeout(() => {
          micSilenceTimer = null;
          if (micSession !== current || current.stopping || current.cancelled) return;
          if (document.visibilityState === 'hidden') {
            stopMic(true);
            showMicStatus('Micrófono detenido al salir de la pestaña.');
            return;
          }
          try { recognition.start(); }
          catch (_) {
            micSession = null;
            markMicListening(false);
            showMicStatus('Chrome terminó la escucha. El texto reconocido sigue en el campo; puedes enviarlo o volver a pulsar 🎤.');
          }
        }, 350);
        return;
      }
      micSession = null;
      markMicListening(false);
      const heard = (current.final || current.interim).trim();
      if (!heard) {
        showMicStatus(current.audioStarted ? 'No se detectaron palabras. Habla cerca del micrófono y pulsa 🎤 otra vez.' : 'Chrome no recibió audio. Comprueba el dispositivo de entrada de Windows y el permiso del sitio.');
        return;
      }
      const sentence = [current.base, heard].filter(Boolean).join(' ').trim().slice(0, 500);
      showMicStatus('✓ Pregunta reconocida. Enviando a Snoopy…');
      ask(sentence);
    };
    try {
      recognition.start();
      markMicListening(true);
      showMicStatus('Preparando micrófono… Puede que Chrome solicite permiso.');
    } catch (_) {
      micSession = null;
      markMicListening(false);
      showMicStatus('No pude encender el micrófono. Comprueba los permisos del navegador.');
    }
  }

  /* ---------- Lógica ---------- */
  function layout() {
    if (MODE !== 'float') return;
    win.style.display = state.open ? '' : 'none';
    fab.style.display = state.open ? 'none' : '';
    win.classList.toggle('as-min', state.min);
  }
  function setOpen(v) {
    state.open = v;
    if (v) state.min = false;
    else { stopVoice(); stopMic(true); }
    save(); layout();
    if (v) { refreshChips(); setTimeout(() => input.focus(), 50); render(); }
  }
  function resolveUrl(u) {
    try {
      const siteBase = (cfg && cfg.siteBase) || '/';
      const base = /^https?:/i.test(siteBase) ? siteBase : location.origin + siteBase;
      const url = new URL(u, base);
      return /^https?:$/.test(url.protocol) ? url.href : null;
    } catch { return null; }
  }
  function rates(m) {
    const mk = (v, icon, label) => {
      const b = h('button', { type: 'button', class: 'as-rate' + (m.f === v ? ' on' : ''), title: label, 'aria-label': label, 'aria-pressed': String(m.f === v), onclick: () => rate(m, v) }, icon);
      b.disabled = Boolean(m.f);
      return b;
    };
    return h('div', { class: 'as-rates' }, mk('up', '👍', 'Respuesta útil'), mk('down', '👎', 'Respuesta mejorable'));
  }
  function rate(m, value) {
    if (m.f) return;
    const top = log.scrollTop;
    m.f = value; save(); render(); log.scrollTop = top;
    fetch(API + '/api/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: m.q, reply: String(m.t).slice(0, 1500), value, source: m.src || '', page: page() }),
      signal: AbortSignal.timeout(10000)
    }).catch(() => { /* la opinión es opcional: si falla, no se molesta al visitante */ });
  }
  function msgEl(m, last) {
    const el = h('div', { class: 'as-msg ' + (m.r === 'u' ? 'as-u' : 'as-a as-md') });
    if (m.r === 'u') el.append(m.t); else el.append(renderMd(m.t));
    if (m.r === 'a' && m.l && m.l.length) {
      const links = h('div', { class: 'as-links' });
      for (const l of m.l) { const href = resolveUrl(l.url); if (href) links.append(h('a', { href, target: '_blank', rel: 'noopener' }, l.label || 'Ver más')); }
      if (links.children.length) el.append(links);
    }
    if (last && m.r === 'a' && m.s && m.s.length) el.append(h('div', { class: 'as-chips' }, m.s.map(q => h('button', { type: 'button', onclick: () => ask(q) }, q))));
    if (m.r === 'a' && m.q) {
      el.append(rates(m));   // solo las respuestas reales se pueden valorar
      if (voiceSupported) el.append(h('button', {
        type: 'button', class: 'as-replay', title: 'Escuchar esta respuesta',
        'aria-label': 'Escuchar esta respuesta', onclick: () => speakReply(m.t, true)
      }, '🔈 Escuchar otra vez'));
    }
    return el;
  }
  function render() {
    log.replaceChildren(...state.msgs.map((m, i) => msgEl(m, i === state.msgs.length - 1)));
    if (liveEl) log.append(liveEl);   // si algo repinta el chat mientras se escribe la respuesta, no se pierde
    else if (busy) log.append(typing = h('div', { class: 'as-typing', 'aria-label': 'El asistente está escribiendo' }, h('i'), h('i'), h('i')));
    log.scrollTop = log.scrollHeight;
  }
  function welcome() {
    const hour = new Date().getHours(), saludo = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    const t = String(cfg.welcome || '¡Hola!').replace('{saludo}', saludo).replace('{nombre}', cfg.name);
    state.msgs = [{ r: 'a', t, l: [], s: cfg.faqs || [], w: 1 }]; save(); render();
  }
  async function refreshChips() {
    if (!cfg || state.msgs.length !== 1 || !state.msgs[0].w) return;
    try { const c = await (await fetch(`${API}/api/config?page=${encodeURIComponent(page())}&section=${encodeURIComponent(section())}`)).json(); state.msgs[0].s = c.faqs || []; save(); render(); } catch { /* se deja como está */ }
  }
  function newChat() { if (busy) return; stopVoice(); stopMic(true); showMicStatus(''); state = { sid: newSid(), msgs: [], open: true, min: false }; save(); welcome(); input.focus(); }

  /* ---------- Petición al servidor (con respuesta en tiempo real) ---------- */
  const headers = { 'Content-Type': 'application/json' };
  const payload = text => {
    const body = { session: state.sid, message: text, page: page(), section: section() };
    const getKey = window.getSnoopyPersonalGeminiKey;
    const key = typeof getKey === 'function' ? getKey() : '';
    if (key) {
      body.personalGeminiKey = key;
      const getModel = window.getSnoopyPersonalGeminiModel;
      if (typeof getModel === 'function') body.personalGeminiModel = getModel();
    }
    return JSON.stringify(body);
  };
  const botFrom = (j, text) => ({ r: 'a', t: j.reply, l: j.links || [], s: j.suggestions || [], q: text, src: j.source || '' });
  const failBot = msg => ({ r: 'a', t: msg, l: [], s: [] });

  /* Pinta el texto recibido hasta ahora. Se agrupa en un cuadro de animación para no repintar por cada trocito */
  function showLive(t) {
    liveText = t;
    if (!liveEl) {
      if (typing) typing.remove();   // aparece el texto: ya no hacen falta los puntitos
      liveEl = h('div', { class: 'as-msg as-a as-md' });
      log.append(liveEl);
    }
    if (liveRaf) return;
    liveRaf = requestAnimationFrame(() => {
      liveRaf = 0;
      if (!liveEl) return;
      const abajo = log.scrollHeight - log.scrollTop - log.clientHeight < 80;   // solo baja sola si el visitante ya estaba abajo
      liveEl.replaceChildren(renderMd(liveText));
      if (abajo) log.scrollTop = log.scrollHeight;
    });
  }

  /* Versión clásica (una sola respuesta): para servidores sin streaming o navegadores sin lector de flujos */
  async function classicChat(text, signal) {
    const r = await fetch(API + '/api/chat', { method: 'POST', headers, body: payload(text), signal });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.reply ? botFrom(j, text) : failBot(j.error || 'Ups, algo salió mal. Inténtalo de nuevo.');
  }

  /* El servidor envía una línea JSON por evento: "delta" (trozo de texto), "done" (respuesta final) o "error" */
  async function requestChat(text) {
    const signal = AbortSignal.timeout(TIMEOUT);   // límite de espera total; protege de servidores que se cuelgan
    const r = await fetch(API + '/api/chat/stream', { method: 'POST', headers, body: payload(text), signal });
    if (r.status === 404 || !r.body || !r.body.getReader) return classicChat(text, signal);
    if (!r.ok) { const j = await r.json().catch(() => ({})); return failBot(j.error || 'Ups, algo salió mal. Inténtalo de nuevo.'); }

    const reader = r.body.getReader(), decoder = new TextDecoder();
    let buffer = '', acc = '', final = null;
    const onLine = raw => {
      let ev; try { ev = JSON.parse(raw); } catch { return; }
      if (ev.type === 'delta' && typeof ev.text === 'string') showLive(acc += ev.text);
      else if (ev.type === 'done') final = ev;
      else if (ev.type === 'error') { const e = new Error(ev.error); e.userMessage = String(ev.error || ''); throw e; }
    };
    const partial = () => ({ r: 'a', t: acc.trim() + ' …', l: [], s: [], q: text, src: 'gemini' });

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) { const raw = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1); if (raw) onLine(raw); }
      }
      if (buffer.trim()) onLine(buffer.trim());
    } catch (e) {
      if (acc && !final) return partial();   // si ya se veía texto (corte o tiempo agotado), se conserva en vez de perderlo
      throw e;
    }
    if (final) return botFrom(final, text);
    if (acc) return partial();
    throw new Error('Respuesta vacía');
  }

  async function ask(text) {
    text = String(text || '').trim().slice(0, 500);
    if (!text || busy) return;
    if (micSession) stopMic(true);
    stopVoice();
    input.value = ''; busy = true; sendBtn.disabled = true; micBtn.disabled = true;
    state.msgs.push({ r: 'u', t: text }); render();
    let bot;
    try {
      bot = await requestChat(text);
    } catch (e) {
      bot = failBot(e && e.userMessage ? e.userMessage : e && e.name === 'TimeoutError'
        ? 'Estoy tardando más de lo normal en responder 😅 Inténtalo de nuevo en un momento.'
        : 'No puedo conectar con el asistente ahora mismo. Inténtalo en un momento.');
    }
    if (liveRaf) cancelAnimationFrame(liveRaf);
    if (!liveText) await new Promise(r => setTimeout(r, 250));   // pausa breve solo si la respuesta no se vio escribiéndose
    liveEl = null; liveRaf = 0; liveText = '';
    busy = false; sendBtn.disabled = false; micBtn.disabled = !micSupported;
    state.msgs.push(bot); state.msgs = state.msgs.slice(-60); save(); render();
    showMicStatus('');
    if (bot.q && bot.t && (MODE === 'page' || state.open)) speakReply(bot.t);
    if (MODE === 'page' || state.open) input.focus();
  }

  async function init() {
    try {
      const r = await fetch(`${API}/api/config?page=${encodeURIComponent(page())}&section=${encodeURIComponent(section())}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error();
      cfg = await r.json();
    } catch {
      if (MODE === 'page') { document.getElementById('chat-root').append(h('div', { class: 'as-root' }, h('div', { class: 'as-win as-page' }, h('div', { class: 'as-err' }, '😴 El asistente no está conectado ahora mismo. ¿Está encendido el servidor?')))); }
      return;   // en modo flotante, si no hay servidor, no se muestra nada
    }
    title.textContent = cfg.name || 'Asistente';
    if (!state.msgs.length) welcome(); else render();
    if (MODE === 'page') document.getElementById('chat-root').append(root);
    else document.body.append(root);
    layout();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

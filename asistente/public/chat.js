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
  let voiceConversation = false, voiceGeneration = 0;
  let tabPaused = false, manualPaused = false, pendingVoiceText = '', speechState = null;

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
  .as-head .as-av{flex:0 0 38px;width:38px;height:38px;display:grid;place-items:center;border-radius:50%;background:#bfe3f7;overflow:hidden}
  .as-head .as-av img{width:100%;height:100%;display:block;object-fit:contain}
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
  .as-v3{padding:10px 14px;background:#fff8f3;border-bottom:1px solid var(--line);font-size:13px;max-height:min(330px,42vh);overflow:auto;flex-shrink:0}
  .as-v3 [hidden]{display:none!important}
  .as-v3 .as-fish-actions button{min-height:36px}
  .as-v3 .as-fish-actions button:first-child{font-weight:600}
  .as-v3 summary{cursor:pointer;font-weight:700;color:#b73549}
  .as-v3 p{margin:6px 0;color:var(--muted)}
  .as-v3 audio{width:100%;height:32px;margin:4px 0}
  .as-v3 label{display:flex;gap:7px;align-items:flex-start;margin:6px 0}
  .as-v3 input[type=file]{max-width:100%;font-size:12px}
  .as-fish{border-top:1px solid var(--line);padding-top:8px;margin-top:8px}
  .as-fish input[type=password],.as-fish textarea{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font:inherit;color:var(--ink);background:white}
  .as-fish textarea{resize:vertical;min-height:55px}
  .as-fish .as-fish-actions{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
  .as-fish .as-fish-on{background:var(--r);color:white;font-weight:700}
  .as-v3 button,.as-v3-status button{border:1px solid var(--line);border-radius:8px;padding:5px 9px;background:white;color:#b73549;cursor:pointer;font:inherit}
  .as-v3-status{padding:6px 14px;background:#fff8f3;color:#80505a;font-size:12px;flex-shrink:0}
  .as-v3-status[hidden],.as-v3 [hidden],.as-v3-status [hidden],.as-win.as-min .as-v3,.as-win.as-min .as-v3-status{display:none}
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
    h('span', { class: 'as-av', 'aria-hidden': 'true' }, h('img', { src: '/img/snoopy.png', alt: '', loading: 'lazy' })),
    h('div', { class: 'as-t' }, title, h('small', {}, 'Te ayudo con esta web')),
    voiceBtn,
    h('button', { type: 'button', title: 'Nueva conversación', 'aria-label': 'Nueva conversación', onclick: newChat }, '➕'));
  const win = h('div', { class: 'as-win' + (MODE === 'page' ? ' as-page' : ''), role: 'dialog', 'aria-label': 'Asistente virtual' }, head, log, micStatus, form);
  const root = h('div', { class: 'as-root' });
  const fab = h('button', { class: 'as-fab', type: 'button', 'aria-label': 'Abrir el asistente', onclick: () => setOpen(true) }, '💬');

  if (MODE === 'float') {
    head.append(
      h('button', { type: 'button', title: 'Minimizar', 'aria-label': 'Minimizar', onclick: () => { state.min = !state.min; if (state.min) stopVoiceConversation('Conversación detenida al minimizar.'); save(); layout(); } }, '—'),
      h('button', { type: 'button', title: 'Cerrar', 'aria-label': 'Cerrar el asistente', onclick: () => setOpen(false) }, '✕'));
    root.append(win, fab);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.open) setOpen(false); });
  } else root.append(win);

  /* ---------- Snoopy V3: voz de referencia opcional ---------- */
  const V3_KEY = 'snoopy-voice-reference-v3';
  const V3_BASE = 'https://openbmb-voxcpm-demo.hf.space';
  const V3_STYLE = 'Natural conversational Latin American Spanish, preserving the speaker identity, pitch and timbre of the authorized reference recording. Clear articulation, gentle, considerate and naturally warm delivery, subtle expressive intonation with a reassuring but non-theatrical tone, connected words, natural rhythm and appropriate pauses. Avoid exaggerated acting, cartoon effects, robotic delivery and artificial pitch shifts.';
  let v3Ref='', v3Name='', v3Allowed=false, v3Load=0, v3CloudLoaded=false;
  const CLOUD_VOICE_KEY='snoopy-private-voice-enabled-v1';
  if (MODE==='page') try {
    const saved=JSON.parse(localStorage.getItem(V3_KEY)||'null');
    if(saved && typeof saved.ref==='string' && saved.ref.startsWith('data:audio/') && saved.ref.length<4100000){
      v3Ref=saved.ref;v3Name=String(saved.name||'Snoopy V3');v3Allowed=saved.allowed===true;
    }
  } catch(_){}
  const FISH_KEY='snoopy-fish-settings-v4';
  let fishKey='',fishTranscript='',fishOn=false,fishRemember=false,fishWarmup=null,fishLatency='low',fishContinuous=true,fishNoCuts=true,fishConcise=true,fishReplay=null,fishAhead=false,fishProfile=null;
  if(MODE==='page')try{
    const saved=JSON.parse(localStorage.getItem(FISH_KEY)||'null');
    if(saved){
      fishLatency=saved.latency==='balanced'?'balanced':'low';
      fishContinuous=saved.continuous!==false;
      fishNoCuts=saved.noCuts!==false;
      fishConcise=saved.concise!==false;
      fishAhead=saved.ahead===true&&!fishNoCuts;
      fishTranscript=typeof saved.transcript==='string'?saved.transcript.slice(0,1800):'';
      if(saved.remember===true&&typeof saved.key==='string'&&/^[A-Za-z0-9_.-]{16,256}$/.test(saved.key)){
        fishKey=saved.key;fishRemember=true;
        fishOn=saved.active===true&&Boolean(v3Ref&&fishTranscript);
      }
    }
  }catch(_){}
  if(fishOn)v3Allowed=false;
  const v3File=h('input',{type:'file',accept:'audio/*,.mp3,.wav','aria-label':'Seleccionar voz de Snoopy'});
  const v3Consent=h('input',{type:'checkbox'});v3Consent.checked=v3Allowed;
  const v3Label=h('p',{}), v3Preview=h('audio',{controls:'controls',preload:'metadata'});
  const v3Message=h('span',{}), v3Play=h('button',{type:'button',onclick:()=>{
    const s=speechState;if(s && s.v3 && s.audio && !s.paused) v3PlayAudio(s);
  }},'▶ Reproducir respuesta');
  v3Play.hidden=true;
  const v3Bar=h('div',{class:'as-v3-status',role:'status','aria-live':'polite'},v3Message,v3Play);v3Bar.hidden=true;
  const voiceSummary=h('summary',{},'🎙 Mi voz');
  const v3Panel=h('details',{class:'as-v3'},voiceSummary);
  const localVoiceControls=h('div',{},h('p',{},'1. Selecciona tu grabación (o usa la que ya tienes).'),
    v3File,v3Label,v3Preview,
    h('label',{},v3Consent,' Autorizo usar esta voz y enviar la muestra y las respuestas al servicio externo VoxCPM2. No introduciré información privada.'),
    h('button',{type:'button',onclick:()=>{
      v3Load++;forgetCloudVoice();v3CloudLoaded=false;stopVoice();v3Ref='';v3Name='';v3Allowed=false;v3Consent.checked=false;v3File.value='';fishTranscript='';fishText.value='';fishDeactivate();
      v3Refresh();v3Save();v3Status('');
      if(voiceConversation&&!busy)resumeVoiceConversation();
    }},'Quitar referencia'));
  const fishInput=h('input',{type:'password',placeholder:'Pega tu nueva clave de Fish Audio',autocomplete:'off',spellcheck:'false',maxlength:'256','aria-label':'Clave API de Fish Audio'});
  fishInput.value=fishKey;
  const fishText=h('textarea',{placeholder:'Escribe exactamente lo que dice el audio de referencia',maxlength:'1800',rows:'3','aria-label':'Transcripción exacta de la voz'});
  fishText.value=fishTranscript;
  const fishConsent=h('input',{type:'checkbox'});fishConsent.checked=fishOn;
  const fishRememberInput=h('input',{type:'checkbox'});fishRememberInput.checked=fishRemember;
  const fishFast=h('input',{type:'checkbox'});fishFast.checked=fishLatency==='low';
  const fishFlow=h('input',{type:'checkbox'});fishFlow.checked=fishContinuous;
  const fishStrict=h('input',{type:'checkbox'});fishStrict.checked=fishNoCuts;fishFlow.disabled=fishNoCuts;
  const fishShort=h('input',{type:'checkbox'});fishShort.checked=fishConcise;
  const fishAheadInput=h('input',{type:'checkbox'});fishAheadInput.checked=fishAhead;fishFlow.disabled=fishNoCuts||fishAhead;
  const fishInfo=h('p',{role:'status','aria-live':'polite'});
  const fishTiming=h('p',{role:'status','aria-live':'polite'},'La latencia se medirá al empezar a reproducir la voz.');
  function fishSave(){
    try{
      if(fishRemember&&fishKey)localStorage.setItem(FISH_KEY,JSON.stringify({remember:true,key:fishKey,transcript:fishTranscript,active:fishOn,latency:fishLatency,continuous:fishContinuous,noCuts:fishNoCuts,concise:fishConcise,ahead:fishAhead}));
      else localStorage.setItem(FISH_KEY,JSON.stringify({remember:false,transcript:fishTranscript,active:false,latency:fishLatency,continuous:fishContinuous,noCuts:fishNoCuts,concise:fishConcise,ahead:fishAhead}));
      return true;
    }catch(_){return false;}
  }
  function fishRefresh(){
    fishInfo.textContent=fishOn?'Fish Audio V4 activo · modelo gratuito · conexión todavía no verificada.':'Fish Audio no está activo.';
  }
  function fishDeactivate(){
    fishReplay=null;fishProfile=null;fishOn=false;fishConsent.checked=false;fishSave();fishRefresh();
  }
  function fishActivate(){
    const k=fishInput.value.trim(),t=fishText.value.trim();
    if(!/^[A-Za-z0-9_.-]{16,256}$/.test(k)){fishInfo.textContent='Introduce una clave válida de Fish Audio.';return false;}
    if(!v3Ref){fishInfo.textContent='Carga primero el MP3 ganador de Snoopy.';return false;}
    if(!t){fishInfo.textContent='Escribe la transcripción exacta del audio.';return false;}
    if(!fishConsent.checked){fishInfo.textContent='Marca la autorización para activar Fish Audio.';return false;}
    stopVoice();if(k!==fishKey||t!==fishTranscript){fishReplay=null;fishProfile=null;}fishKey=k;fishTranscript=t;fishOn=true;fishRemember=fishRememberInput.checked;
    v3Allowed=false;v3Consent.checked=false;
    v3Refresh();v3Save();fishRefresh();
    if(!fishSave())fishInfo.textContent+=' No se pudo recordar la clave.';
    v3Status('Fish Audio V4 activo. Envía una pregunta o prueba la voz.');
    if(voiceConversation&&!busy)resumeVoiceConversation();
    return true;
  }
  const fishPanel=h('div',{class:'as-fish'},h('strong',{},'🐟 Fish Audio · V4.9 anticipación adaptativa'),
    h('p',{},'Usa la misma muestra de arriba sin crear una voz pública.'),
    fishInput,fishText,
    h('label',{},fishStrict,' Sin cortes de carga: descarga el audio entero antes de hablar. Recomendado si hay pausas.'),
    h('label',{},fishAheadInput,' Generación anticipada experimental (una transmisión continua, reserva adaptada a la velocidad de Fish Audio).'),
    h('label',{},fishShort,' Conversación ágil: Gemini responde más brevemente en preguntas sencillas. Las explicaciones detalladas siguen disponibles.'),
    h('label',{},fishFlow,' Streaming con reserva de audio (si desactivas los dos modos anteriores).'),
    h('label',{},fishFast,' Baja latencia de generación (desmarca para priorizar una voz más natural).'),
    h('label',{},fishConsent,' Tengo permiso para reutilizar esta voz y autorización para usar el servicio. Acepto enviar la muestra, su transcripción y las respuestas a Fish Audio, que puede usar datos del modelo gratuito para mejorar su servicio. No envíes información privada.'),
    h('label',{},fishRememberInput,' Recordar mi clave en este navegador (opcional; se guarda sin cifrado adicional).'),
    h('div',{class:'as-fish-actions'},
      h('button',{type:'button',class:'as-fish-on',onclick:fishActivate},'Activar Fish Audio'),
      h('button',{type:'button',onclick:()=>{
        if(!fishActivate())return;
        if(voiceConversation)stopVoiceConversation('');
        speakReply('Hola. Qué alegría verte de nuevo. ¿Cómo estás hoy?',true);
      }},'Probar voz'),
      h('button',{type:'button',onclick:()=>{
        stopVoice();fishDeactivate();v3Save();v3Refresh();v3Status('Fish Audio desactivado.');
        if(voiceConversation&&!busy)resumeVoiceConversation();
      }},'Desactivar'),
      h('button',{type:'button',onclick:()=>{
        stopVoice();fishKey='';fishInput.value='';fishRemember=false;fishRememberInput.checked=false;fishDeactivate();
        v3Save();v3Refresh();v3Status('Clave de Fish Audio quitada.');
        if(voiceConversation&&!busy)resumeVoiceConversation();
      }},'Quitar clave')),
    fishInfo,fishTiming,
    h('p',{},'La clave viaja por HTTPS a este servidor y a Fish Audio; no se guarda en el servidor. Solo se solicita el modelo s2.1-pro-free. Si no está disponible, no se cambia a un modelo de pago. El acceso gratuito anunciado llega hasta el 30/11/2026. Cada dispositivo necesita su propia configuración.'));
  const voiceTransferFile=h('input',{type:'file',accept:'.snoopyvoice','aria-label':'Importar perfil cifrado de voz'});
  const voiceTransferPass=h('input',{type:'password',autocomplete:'off',maxlength:'256',placeholder:'Frase privada de transferencia','aria-label':'Frase privada de transferencia'});
  const voiceTransferStatus=h('p',{role:'status','aria-live':'polite'});
  const voiceTransferConsent=h('input',{type:'checkbox'});
  const exportVoiceButton=h('button',{type:'button',onclick:()=>transferVoice(false)},'Exportar perfil cifrado');
  const importVoiceButton=h('button',{type:'button',onclick:()=>transferVoice(true)},'Importar perfil cifrado');
  const voiceTransferPanel=h('details',{class:'as-fish'},h('summary',{},'Guardar y transferir voz V3'),
    h('p',{},'Exporta la referencia autorizada a un archivo cifrado. En otro dispositivo, importa el archivo una sola vez y confirma el uso de VoxCPM2. No se incluyen claves API. No se sube el archivo a GitHub ni al servidor de Snoopy.'),
    voiceTransferPass,h('label',{},voiceTransferConsent,' Es mi voz o tengo autorización expresa para transferirla, con los permisos necesarios. Entiendo que quien reciba el perfil puede copiar o reutilizar la voz.'),
    h('div',{class:'as-fish-actions'},exportVoiceButton),voiceTransferFile,h('div',{class:'as-fish-actions'},importVoiceButton),voiceTransferStatus);
  const savedReplyPlayer=h('audio',{controls:'controls',preload:'metadata'});savedReplyPlayer.hidden=true;
  const savedReplyStatus=h('p',{role:'status','aria-live':'polite'},'Cuando termine una respuesta V3, podrás descargarla completa.');
  const savedReplyDownload=h('button',{type:'button',onclick:()=>downloadSavedReply()},'Descargar última respuesta V3');savedReplyDownload.disabled=true;
  const savedReplyClear=h('button',{type:'button',onclick:()=>clearSavedReply()},'Quitar audio de la vista');savedReplyClear.disabled=true;
  const savedReplyPanel=h('details',{class:'as-fish'},h('summary',{},'Respuestas de audio V3'),
    h('p',{},'Guarda cada respuesta completa como WAV para escucharla o compartirla después. Solo se conserva la última respuesta en esta vista; los archivos descargados permanecen en tu dispositivo.'),
    savedReplyStatus,savedReplyPlayer,h('div',{class:'as-fish-actions'},savedReplyDownload,savedReplyClear));
  const cloudPass=h('input',{type:'password',autocomplete:'off',maxlength:'256',placeholder:'Tu clave de voz','aria-label':'Clave privada de voz'});
  const cloudConsent=h('input',{type:'checkbox'});
  const cloudAdmin=h('input',{type:'password',autocomplete:'off',maxlength:'256',placeholder:'Contraseña de administrador','aria-label':'Contraseña de administrador de voz'});
  const cloudShareConsent=h('input',{type:'checkbox'});
  const cloudStatus=h('p',{role:'status','aria-live':'polite'});
  const cloudOpen=h('button',{type:'button',onclick:()=>cloudAction('login')},'Activar mi voz');
  const cloudClose=h('button',{type:'button',onclick:()=>cloudAction('logout')},'Desactivar en este dispositivo');
  const cloudSave=h('button',{type:'button',onclick:()=>cloudAction('save')},'Guardar mi voz');
  const cloudDelete=h('button',{type:'button',onclick:()=>cloudAction('delete')},'Retirar voz de R2');
  const cloudLogin=h('div',{class:'as-fish'},cloudPass,
    h('label',{},cloudConsent,' Acepto usar la voz privada con VoxCPM2, un servicio externo que recibe la referencia y las respuestas. No introduciré información privada.'),
    h('div',{class:'as-fish-actions'},cloudOpen));
  const voiceOwner=h('details',{class:'as-fish'},h('summary',{},'Guardar o cambiar mi voz'),
    localVoiceControls,
    h('p',{},'2. Confirma el guardado privado.'),
    cloudAdmin,h('label',{},cloudShareConsent,' Es mi voz o tengo permiso expreso para compartirla, con las autorizaciones necesarias. La persona autorizada podría copiarla.'),
    h('div',{class:'as-fish-actions'},cloudSave,cloudDelete));
  const advancedVoice=h('details',{class:'as-fish'},h('summary',{},'Configuración avanzada'),
    h('div',{class:'as-fish-actions'},cloudClose),voiceTransferPanel,fishPanel);
  savedReplyPanel.querySelector('summary').textContent='Audios para descargar';
  const cloudPanel=h('div',{},cloudLogin,cloudStatus,voiceOwner);
  v3Panel.append(cloudPanel,savedReplyPanel,advancedVoice);fishRefresh();
  let cloudBusy=false;
  function forgetCloudVoice(){
    try{localStorage.removeItem(CLOUD_VOICE_KEY)}catch{}
  }
  async function cloudApi(path,method='GET',data){
    const r=await fetch('/api/private-voice/'+path,{method,credentials:'same-origin',cache:'no-store',headers:{'X-Snoopy-Voice':'1',...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
    let b={};try{b=await r.json()}catch{}
    if(!r.ok){const e=Error(b.error||'Error '+r.status);e.status=r.status;throw e}return b;
  }
  async function loadCloudVoice(){
    const ticket=++v3Load;
    const profile=await cloudApi('profile');
    if(ticket!==v3Load)return;
    if(typeof profile.ref!=='string'||profile.ref.length>4100000||!profile.ref.startsWith('data:audio/'))throw Error('Perfil de voz no válido.');
    stopVoice();fishDeactivate();v3CloudLoaded=true;v3Ref=profile.ref;v3Name='Voz privada guardada';v3Allowed=true;v3Consent.checked=true;
    try{localStorage.removeItem(V3_KEY);localStorage.setItem(CLOUD_VOICE_KEY,'1')}catch{}
    v3Refresh();cloudStatus.textContent='Voz privada V3 activa en este dispositivo.';
    if(voiceConversation&&!busy)resumeVoiceConversation();
  }
  function dropCloudVoice(){
    forgetCloudVoice();v3Load++;
    if(v3CloudLoaded){stopVoice();fishDeactivate();v3CloudLoaded=false;v3Ref='';v3Name='';v3Allowed=false;v3Consent.checked=false;v3Refresh();v3Save()}
  }
  async function cloudAction(action){
    if(cloudBusy)return;cloudBusy=true;let secret='';
    for(const el of [cloudOpen,cloudClose,cloudSave,cloudDelete])el.disabled=true;
    try{
      if(action==='login'){
        if(!cloudConsent.checked)throw Error('Confirma el uso de VoxCPM2.');
        secret=cloudPass.value;
        if(!secret)throw Error('Introduce la clave privada de voz.');
        if(v3Ref&&!v3CloudLoaded&&!confirm('¿Usar la voz guardada en R2 en lugar de la referencia local?'))return;
        await cloudApi('login','POST',{password:secret});await loadCloudVoice();voiceOwner.open=false;advancedVoice.open=false;v3Panel.open=false;
      }else if(action==='logout'){
        await cloudApi('logout','POST',{});dropCloudVoice();cloudStatus.textContent='Voz privada desactivada en este dispositivo.';
      }else if(action==='save'){
        if(!v3Ref||!v3Allowed||v3CloudLoaded)throw Error('Carga y autoriza primero una referencia local V3.');
        if(!cloudShareConsent.checked)throw Error('Confirma la autorización para compartir la voz.');
        secret=cloudAdmin.value;if(!secret)throw Error('Introduce tu contraseña de administrador.');
        if(!confirm('¿Guardar esta referencia en R2? Sustituirá el perfil compartido anterior, si existe.'))return;
        await cloudApi('profile','PUT',{admin:secret,ref:v3Ref,consent:true});
        cloudStatus.textContent='Voz guardada. En el otro dispositivo, abre Mi voz e introduce la clave de voz.';voiceOwner.open=false;
      }else if(action==='delete'){
        secret=cloudAdmin.value;if(!secret)throw Error('Introduce tu contraseña de administrador.');
        if(!confirm('¿Retirar la voz de R2? No se eliminarán las copias que ya se hayan descargado.'))return;
        await cloudApi('profile','DELETE',{admin:secret});dropCloudVoice();
        cloudStatus.textContent='Perfil retirado de R2. Las copias previas no se eliminan.';
      }
    }catch(e){cloudStatus.textContent=e.message}
    finally{secret='';cloudPass.value='';cloudAdmin.value='';cloudShareConsent.checked=false;cloudBusy=false;for(const el of [cloudOpen,cloudClose,cloudSave,cloudDelete])el.disabled=false}
  }
  let transferBusy=false,lastReplyBlob=null,lastReplyURL=null,replyAssembly=0;
  const transferAAD=new TextEncoder().encode('Snoopy:private-voice-transfer:v1');
  function downloadVoiceFile(blob,name){
    const url=URL.createObjectURL(blob),a=h('a',{href:url,download:name});
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function transferKey(phrase,salt,usage){
    const raw=new TextEncoder().encode(phrase);
    try{const base=await crypto.subtle.importKey('raw',raw,'PBKDF2',false,['deriveKey']);return await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,[usage])}
    finally{raw.fill(0)}
  }
  async function transferVoice(importing){
    if(transferBusy)return;
    let phrase=voiceTransferPass.value,plain=null;
    try{
      if(phrase.length<20)throw Error('Usa una frase privada larga, de al menos 20 caracteres.');
      if(!voiceTransferConsent.checked)throw Error('Confirma primero la autorización.');
      transferBusy=true;exportVoiceButton.disabled=importVoiceButton.disabled=true;
      if(!importing){
        if(!v3Ref||!v3Allowed)throw Error('Primero activa una referencia autorizada de VoxCPM2 V3.');
        plain=new TextEncoder().encode(JSON.stringify({ref:v3Ref,name:v3Name}));
        const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
        const key=await transferKey(phrase,salt,'encrypt');
        const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:transferAAD},key,plain));
        const bytes=new Uint8Array(32+cipher.length);bytes.set([83,86,80,49]);bytes.set(salt,4);bytes.set(iv,20);bytes.set(cipher,32);
        downloadVoiceFile(new Blob([bytes],{type:'application/octet-stream'}),'voz-snoopy.snoopyvoice');
        voiceTransferStatus.textContent='Perfil exportado. Transfiere el archivo y la frase por canales privados separados.';
      }else{
        const file=voiceTransferFile.files?.[0];if(!file||file.size>4200000||file.size<48)throw Error('Selecciona un perfil .snoopyvoice válido.');
        const bytes=new Uint8Array(await file.arrayBuffer());if(![83,86,80,49].every((v,i)=>bytes[i]===v))throw Error('Formato de perfil desconocido.');
        const key=await transferKey(phrase,bytes.slice(4,20),'decrypt');
        try{plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(20,32),additionalData:transferAAD},key,bytes.slice(32)))}catch{throw Error('Frase incorrecta o archivo dañado.')}
        const data=JSON.parse(new TextDecoder().decode(plain));
        if(typeof data.ref!=='string'||data.ref.length>4100000||!/^data:audio\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/i.test(data.ref))throw Error('Referencia de audio inválida.');
        if(v3Ref&&!confirm('¿Sustituir la referencia de voz de este navegador?'))return;
        if(!confirm('VoxCPM2 utiliza un servicio público externo. ¿Autorizas enviar esta referencia y las respuestas al servicio para sintetizar la voz?'))return;
        stopVoice();forgetCloudVoice();v3CloudLoaded=false;fishDeactivate();v3Ref=data.ref;v3Name=typeof data.name==='string'?data.name.slice(0,120):'Voz importada';v3Allowed=true;v3Consent.checked=true;
        v3Refresh();v3Save();voiceTransferStatus.textContent='Voz V3 importada y activa en este navegador.';
      }
    }catch(e){voiceTransferStatus.textContent=e.message}
    finally{if(plain)plain.fill(0);phrase='';voiceTransferPass.value='';voiceTransferConsent.checked=false;voiceTransferFile.value='';transferBusy=false;exportVoiceButton.disabled=importVoiceButton.disabled=false}
  }
  function clearSavedReply(){
    replyAssembly++;savedReplyPlayer.pause();savedReplyPlayer.removeAttribute('src');savedReplyPlayer.load();savedReplyPlayer.hidden=true;
    if(lastReplyURL)URL.revokeObjectURL(lastReplyURL);lastReplyURL=null;lastReplyBlob=null;savedReplyDownload.disabled=savedReplyClear.disabled=true;
    savedReplyStatus.textContent='Cuando termine una respuesta V3, podrás descargarla completa.';
  }
  function downloadSavedReply(){if(lastReplyBlob)downloadVoiceFile(lastReplyBlob,'snoopy-respuesta-'+new Date().toISOString().replace(/[:.]/g,'-')+'.wav')}
  async function assembleSavedReply(parts){
    if(!parts.length)return;
    const generation=++replyAssembly;let ctx=null;
    savedReplyStatus.textContent='Preparando archivo WAV de la respuesta completa…';
    try{
      if(parts.reduce((n,b)=>n+b.size,0)>40000000)throw Error('Respuesta demasiado grande para la descarga.');
      ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:24000});
      const decoded=[];let total=0;
      for(const part of parts){const audio=await ctx.decodeAudioData(await part.arrayBuffer());total+=audio.length;if(total>ctx.sampleRate*60*15)throw Error('Audio demasiado largo.');const mono=new Float32Array(audio.length);for(let ch=0;ch<audio.numberOfChannels;ch++){const samples=audio.getChannelData(ch);for(let i=0;i<samples.length;i++)mono[i]+=samples[i]/audio.numberOfChannels}decoded.push(mono)}
      const wav=new ArrayBuffer(44+total*2),view=new DataView(wav),ascii=(at,str)=>{for(let i=0;i<str.length;i++)view.setUint8(at+i,str.charCodeAt(i))};
      ascii(0,'RIFF');view.setUint32(4,wav.byteLength-8,true);ascii(8,'WAVE');ascii(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,ctx.sampleRate,true);view.setUint32(28,ctx.sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,total*2,true);
      let at=44;for(const chunk of decoded)for(const x of chunk){const v=Math.max(-1,Math.min(1,x));view.setInt16(at,v<0?v*32768:v*32767,true);at+=2}
      if(generation!==replyAssembly)return;
      savedReplyPlayer.pause();if(lastReplyURL)URL.revokeObjectURL(lastReplyURL);
      lastReplyBlob=new Blob([wav],{type:'audio/wav'});lastReplyURL=URL.createObjectURL(lastReplyBlob);savedReplyPlayer.src=lastReplyURL;savedReplyPlayer.hidden=false;
      savedReplyDownload.disabled=savedReplyClear.disabled=false;
      savedReplyStatus.textContent='Respuesta V3 completa lista para descargar.';
    }catch(e){if(generation===replyAssembly)savedReplyStatus.textContent='No se pudo preparar el WAV: '+e.message}
    finally{if(ctx)await ctx.close().catch(()=>{})}
  }
  fishShort.addEventListener('change',()=>{fishConcise=fishShort.checked;fishSave();});
  fishStrict.addEventListener('change',()=>{fishNoCuts=fishStrict.checked;if(fishNoCuts){fishAhead=false;fishAheadInput.checked=false;}fishFlow.disabled=fishNoCuts||fishAhead;clearFishWarmup();fishSave();fishTiming.textContent=fishNoCuts?'Sin cortes de carga: espera el audio completo antes de reproducirlo.':'Streaming activado; pueden ocurrir cortes si la generación es lenta.';});
  fishAheadInput.addEventListener('change',()=>{fishAhead=fishAheadInput.checked;if(fishAhead){fishNoCuts=false;fishStrict.checked=false;}else{fishNoCuts=true;fishStrict.checked=true;}fishFlow.disabled=fishNoCuts||fishAhead;clearFishWarmup();fishSave();fishTiming.textContent=fishAhead?'Generación anticipada experimental: se aplicará en la siguiente respuesta larga.':'Modo estable sin cortes de carga.';});
  fishFlow.addEventListener('change',()=>{fishContinuous=fishFlow.checked;clearFishWarmup();fishSave();fishTiming.textContent=fishContinuous?'Lectura fluida: genera y reproduce a la vez, con colchón de audio.':'Inicio rápido: menos colchón de audio; puede haber cortes.';});
  fishFast.addEventListener('change',()=>{fishLatency=fishFast.checked?'low':'balanced';clearFishWarmup();fishSave();fishTiming.textContent='Modo '+(fishLatency==='low'?'baja latencia':'equilibrado')+' · se aplicará a la próxima respuesta.';});
  fishConsent.addEventListener('change',()=>{
    if(!fishConsent.checked&&fishOn){stopVoice();fishDeactivate();v3Save();v3Refresh();if(voiceConversation&&!busy)resumeVoiceConversation();}
  });
  fishRememberInput.addEventListener('change',()=>{fishRemember=fishRememberInput.checked;if(!fishRemember)fishSave();});
  function v3Status(message,play=false){
    v3Message.textContent=message;v3Play.hidden=!play;v3Bar.hidden=!message&&!play;
  }
  function v3Save(){
    try{
      if(v3CloudLoaded){localStorage.removeItem(V3_KEY);return;}
      if(v3Ref&&(v3Allowed||fishOn))localStorage.setItem(V3_KEY,JSON.stringify({ref:v3Ref,name:v3Name,allowed:v3Allowed}));
      else localStorage.removeItem(V3_KEY);
    }catch(_){v3Label.textContent+=' · No se pudo guardar; vuelve a cargarla al recargar la página.';}
  }
  function v3Refresh(){
    voiceSummary.textContent='🎙 Mi voz · '+(fishOn?'Fish Audio':v3CloudLoaded&&v3Allowed?'Activa desde R2':v3Allowed&&v3Ref?'Activa en este navegador':'Activar');
    cloudLogin.hidden=Boolean(v3CloudLoaded&&v3Allowed&&!fishOn);
    v3Label.textContent=v3Ref?v3Name+(fishOn?' · Fish Audio V4 activo':v3Allowed?' · VoxCPM2 V3 activo':' · Pendiente de autorización'):'Sin audio seleccionado.';
    if(v3Ref){if(v3Preview.getAttribute('src')!==v3Ref)v3Preview.src=v3Ref;v3Preview.hidden=false;}
    else{v3Preview.pause();v3Preview.removeAttribute('src');v3Preview.hidden=true;}
  }
  v3File.addEventListener('change',()=>{
    const file=v3File.files&&v3File.files[0];if(!file)return;
    if(file.size>3000000||!/\.(mp3|wav|ogg|m4a|flac|webm)$/i.test(file.name)){v3Status('Elige un archivo de audio de menos de 3 MB.');return;}
    const id=++v3Load,reader=new FileReader();
    reader.onload=()=>{
      if(id!==v3Load)return;
      const data=String(reader.result||'');
      if(!data.startsWith('data:audio/')){v3Status('Tipo de audio no reconocido; utiliza MP3 o WAV.');return;}
      stopVoice();forgetCloudVoice();v3CloudLoaded=false;v3Ref=data;v3Name=file.name;v3Allowed=false;v3Consent.checked=false;fishTranscript='';fishText.value='';fishDeactivate();
      v3Refresh();v3Save();v3Status('Referencia cargada. Marca la casilla para activar la voz.');
      if(voiceConversation&&!busy)resumeVoiceConversation();
    };
    reader.onerror=()=>v3Status('No se pudo leer el archivo.');
    reader.readAsDataURL(file);
  });
  v3Consent.addEventListener('change',()=>{
    if(!v3Ref){v3Consent.checked=false;v3Status('Selecciona primero el audio de Snoopy.');return;}
    if(v3CloudLoaded&&!v3Consent.checked){dropCloudVoice();cloudStatus.textContent='Voz privada desactivada en este dispositivo.';void cloudApi('logout','POST',{}).catch(()=>{});return;}
    stopVoice();v3Allowed=v3Consent.checked;if(v3Allowed)fishDeactivate();v3Refresh();v3Save();
    v3Status(v3Allowed?'Voz V3 activa. Escribe una pregunta o habla con Snoopy.':'Voz del navegador activada.');
    if(voiceConversation&&!busy)resumeVoiceConversation();
  });
  if(MODE==='page'){win.insertBefore(v3Panel,log);win.insertBefore(v3Bar,micStatus);v3Refresh();
    Promise.resolve().then(async()=>{try{if(localStorage.getItem(CLOUD_VOICE_KEY)==='1')await loadCloudVoice()}catch(e){if(e.status===401||e.status===404)dropCloudVoice();cloudStatus.textContent=e.message}});
  }
  function v3Enabled(){return MODE==='page'&&(v3Allowed||fishOn)&&Boolean(v3Ref);}
  async function v3Fetch(url,options={}){
    const r=await fetch(url,options);if(!r.ok){if(r.status===429)throw Error('límite de solicitudes de VoxCPM2 (HTTP 429)');if(r.status===503)throw Error('VoxCPM2 temporalmente no disponible (HTTP 503)');throw new Error('VoxCPM2 HTTP '+r.status);}return r;
  }
  async function fishResponse(s,phrase,signal){
    const r=await fetch(API+'/api/fish/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:s.fish.key,transcript:s.fish.transcript,text:phrase,reference:s.ref,consent:true,latency:s.fish.latency||'low'}),signal});
    if(!r.ok){let msg='HTTP '+r.status;try{const b=await r.json();if(typeof b.error==='string')msg=b.error;}catch(_){}throw new Error(msg);}
    return r;
  }
  // Adelanta una frase completa y sencilla mientras Gemini sigue generando.
  // No se reproduce hasta confirmar que coincide con el texto final.
  function clearFishWarmup(){
    if(!fishWarmup)return;
    clearTimeout(fishWarmup.timer);fishWarmup.controller.abort();fishWarmup=null;
  }
  function startFishWarmup(raw,turnGeneration){
    if(fishContinuous||turnGeneration!==voiceGeneration||fishWarmup||speechState||!voiceEnabled||!voiceSupported||!fishOn||!v3Enabled()||tabPaused||manualPaused||document.visibilityState==='hidden')return;
    const match=/^\s*([^.\n!?;]{12,175}[.!?](?=\s|$))/.exec(raw);
    if(!match)return;
    const phrase=match[1].trim();
    // Evita adelantar listas, enlaces, Markdown o texto que pudiera cambiar al limpiarlo.
    if(/[\x60\[\]<>*_#~|\\]/.test(phrase)||spokenText(phrase)!==phrase||/\d\.$/.test(phrase))return;
    const controller=new AbortController();
    const warm={phrase,controller,key:fishKey,transcript:fishTranscript,ref:v3Ref,latency:fishLatency,startedAt:performance.now()};
    warm.timer=setTimeout(()=>controller.abort(),90000);
    fishWarmup=warm;
    warm.response=fishResponse({fish:{key:warm.key,transcript:warm.transcript,latency:warm.latency},ref:warm.ref},phrase,controller.signal)
      .then(response=>({response}),error=>({error}));
  }
  function takeFishWarmup(words){
    const w=fishWarmup;
    if(!w)return null;
    if(fishContinuous||!fishOn||!voiceEnabled||w.key!==fishKey||w.ref!==v3Ref||w.transcript!==fishTranscript||w.latency!==fishLatency||w.controller.signal.aborted||
      !words.startsWith(w.phrase)||(words.length>w.phrase.length&&words[w.phrase.length]!==' ')){
      clearFishWarmup();return null;
    }
    fishWarmup=null;clearTimeout(w.timer);return w;
  }
  function fishCanStream(){
    return typeof MediaSource!=='undefined'&&typeof MediaSource.isTypeSupported==='function'&&MediaSource.isTypeSupported('audio/mpeg');
  }
  // El servidor transmite MP3 por HTTP. MSE permite reproducirlo sin esperar el archivo completo.
  function fishWait(target,event,signal,action){
    return new Promise((resolve,reject)=>{
      let done=false;
      const clean=()=>{target.removeEventListener(event,ok);target.removeEventListener('error',fail);target.removeEventListener('abort',fail);signal.removeEventListener('abort',cancel);};
      const settle=(fn,val)=>{if(done)return;done=true;clean();fn(val);};
      const ok=()=>settle(resolve);
      const fail=()=>settle(reject,new Error('Error del flujo de audio'));
      const cancel=()=>settle(reject,new DOMException('Cancelado','AbortError'));
      if(signal.aborted){cancel();return;}
      target.addEventListener(event,ok,{once:true});target.addEventListener('error',fail,{once:true});target.addEventListener('abort',fail,{once:true});
      signal.addEventListener('abort',cancel,{once:true});
      try{if(action)action();}catch(e){settle(reject,e);}
    });
  }
  function v3AttachAudio(s,url,size,streaming){
    s.audioURL=url;s.audio=new Audio();s.audio.preload='auto';s.segmentStarted=false;s.bufferReady=!streaming;s.networkEnded=!streaming;s.buffering=false;s.stalls=0;
    function reportFish(){
      if(!s.fish||speechState!==s)return;
      const seconds=n=>n.toFixed(2)+' s';
      const items=[s.latencyLabel||''];
      if(s.fishHeadersAt!=null&&s.ttsStartedAt!=null)items.push('Inicio de respuesta del servidor: '+seconds((s.fishHeadersAt-s.ttsStartedAt)/1000));
      if(s.fishCompletedAt!=null&&s.ttsStartedAt!=null)items.push('Audio recibido: '+seconds((s.fishCompletedAt-s.ttsStartedAt)/1000));
      if(s.audio&&Number.isFinite(s.audio.duration))items.push('Duración: '+seconds(s.audio.duration));
      if(s.aheadTarget!=null)items.push('Reserva objetivo: '+seconds(s.aheadTarget));
      if(s.aheadRate!=null)items.push('Velocidad de generación: '+s.aheadRate.toFixed(2)+'x');
      items.push('Esperas del reproductor: '+s.stalls);
      if(s.fishCompletedAt!=null)items.push(s.fishCached?'Audio reutilizado de esta sesión':'Audio completo en memoria');
      fishTiming.textContent=items.filter(Boolean).join(' · ');
    }
    s.reportFish=reportFish;
    s.audio.onloadedmetadata=reportFish;
    s.audio.ondurationchange=reportFish;
    s.audio.onplaying=()=>{
      if(speechState!==s)return;
      s.segmentStarted=true;s.buffering=false;
      if(s.fish&&!s.firstAudioMeasured&&s.ttsStartedAt!=null){
        s.firstAudioMeasured=true;
        const now=performance.now(),tts=((now-s.ttsStartedAt)/1000).toFixed(2);
        const total=s.turnStartedAt==null?'': ' · Desde tu pregunta: '+((now-s.turnStartedAt)/1000).toFixed(2)+' s';
        s.latencyLabel='Voz: '+tts+' s'+total;
      }
      reportFish();
    };
    s.audio.onwaiting=()=>{
      if(speechState!==s||!s.fish||!s.segmentStarted||s.paused||s.buffering)return;
      s.stalls++;
      reportFish();
      if(s.networkEnded)return;
      s.buffering=true;
      // Evita intentos de arranque con unas pocas muestras tras un corte de red.
      s.audio.pause();
      v3Status('Recuperando el colchón de audio… ('+s.stalls+' cortes)');
      reportFish();
    };
    s.audio.onended=()=>{
      if(speechState!==s)return;
      v3Dispose(s);s.cursor+=size;s.loading=false;v3Segment(s);
    };
    s.audio.onerror=()=>{if(speechState===s)v3Fallback(s,'error de reproducción');};
    s.audio.src=url;
    if(!streaming&&!s.paused)v3PlayAudio(s);
  }
  // Predice el déficit de audio restante con las mediciones de esta sesión.
  // Si el motor va más lento que la lectura, conserva una reserva mayor.
  function fishAdaptiveTarget(total,produced,rate,margin){
    const remaining=Math.max(0,total-produced);
    const safeRate=Math.max(0.15,Math.min(4,rate));
    const deficit=remaining*Math.max(0,1/safeRate-1);
    return Math.max(2.5,Math.min(18,deficit+margin));
  }
  async function fishAheadStream(s,phrase,size,signal){
    const previous=fishProfile&&fishProfile.ref===s.ref&&fishProfile.latency===s.fish.latency?fishProfile:null;
    const r=await fishResponse(s,phrase,signal);
    if(speechState!==s||signal.aborted){if(r.body)await r.body.cancel().catch(()=>{});return;}
    s.fishHeadersAt=performance.now();
    if(!r.body){
      const blob=await r.blob();
      if(speechState!==s||signal.aborted)return;
      if(!blob.size)throw new Error('Fish Audio no devolvió audio');
      s.fishCompletedAt=performance.now();s.loading=false;s.fishBytes=blob.size;
      v3AttachAudio(s,URL.createObjectURL(blob),size,false);return;
    }
    const ms=new MediaSource();s.mediaSource=ms;
    const reader=r.body.getReader();s.streamReader=reader;
    const alive=()=>speechState===s&&s.v3&&!signal.aborted;
    try{
      await fishWait(ms,'sourceopen',signal,()=>v3AttachAudio(s,URL.createObjectURL(ms),size,true));
      const sb=ms.addSourceBuffer('audio/mpeg');sb.mode='sequence';
      let started=false,bytes=0,firstAt=null,initialEnd=0;
      const totalGuess=phrase.length*(previous?previous.audioPerChar:0.075);
      function reserve(){
        let end=0,ahead=0;const pos=s.audio.currentTime||0;
        for(let i=0;i<sb.buffered.length;i++){
          const a=sb.buffered.start(i),b=sb.buffered.end(i);
          end=Math.max(end,b);
          if(pos>=a-0.08&&pos<=b)ahead=Math.max(ahead,b-pos);
        }
        return {end,ahead};
      }
      function pump(){
        if(!alive()||!s.audio||firstAt==null)return;
        const {end,ahead}=reserve();
        if(!end)return;
        if(!initialEnd){initialEnd=end;firstAt=performance.now();}
        const elapsed=(performance.now()-firstAt)/1000;
        // Ignore the first burst and use historical throughput until enough new data arrives.
        const observed=elapsed>=0.65?Math.max(0.15,Math.min(4,(end-initialEnd)/elapsed)):null;
        const baseline=previous?previous.rate:0.95;
        const weight=observed==null?0:Math.min(0.85,elapsed/5);
        const rate=baseline*(1-weight)+(observed==null?baseline:observed)*weight;
        const margin=previous?previous.margin:2.8;
        const target=fishAdaptiveTarget(Math.max(totalGuess,end),end,rate,margin);
        s.aheadTarget=target;s.aheadRate=rate;
        if(!started&&ahead>=target){
          started=true;s.bufferReady=true;
          if(!s.paused)v3PlayAudio(s);
        }else if(started&&s.buffering&&ahead>=Math.max(3,target)){
          s.buffering=false;
          if(!s.paused)v3PlayAudio(s);
        }else if(!started){
          v3Status('Preparando audio… '+ahead.toFixed(1)+' / '+target.toFixed(1)+' s de reserva.');
        }
        if(s.reportFish)s.reportFish();
      }
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        if(!alive())return;
        if(!value||!value.byteLength)continue;
        bytes+=value.byteLength;
        if(firstAt==null)firstAt=performance.now();
        await fishWait(sb,'updateend',signal,()=>sb.appendBuffer(value));
        pump();
      }
      if(!alive())return;
      if(!bytes||!reserve().end)throw new Error('Fish Audio no devolvió audio reproducible');
      const duration=reserve().end;
      const elapsed=firstAt==null?0:(performance.now()-firstAt)/1000;
      if(elapsed>=0.65&&duration>initialEnd&&phrase.length>=120){
        const measured=Math.max(0.15,Math.min(4,(duration-initialEnd)/elapsed));
        const perChar=Math.max(0.025,Math.min(0.20,duration/phrase.length));
        fishProfile={ref:s.ref,latency:s.fish.latency,
          rate:previous?previous.rate*0.35+measured*0.65:measured,
          audioPerChar:previous?previous.audioPerChar*0.5+perChar*0.5:perChar,
          margin:Math.max(2.5,Math.min(10,(previous?previous.margin:2.8)+(s.stalls?1.8:-0.15)))};
      }
      s.networkEnded=true;s.bufferReady=true;s.fishCompletedAt=performance.now();s.fishBytes=bytes;
      if(ms.readyState==='open')ms.endOfStream();
      s.loading=false;
      if(s.reportFish)s.reportFish();
      const needsPlay=!started||s.buffering;
      s.buffering=false;
      if(needsPlay&&!s.paused)v3PlayAudio(s);
    }finally{
      if(s.streamReader===reader)s.streamReader=null;
      await reader.cancel().catch(()=>{});
      try{reader.releaseLock();}catch(_){}
    }
  }
  async function fishStream(s,phrase,size,signal,warm){
    if(s.fish.ahead&&phrase.length>180&&fishCanStream()){
      await fishAheadStream(s,phrase,size,signal);
      return;
    }
    // Only the most recent complete audio; RAM only, no persistent audio or extra provider calls.
    if(s.fish.noCuts&&fishReplay&&fishReplay.phrase===phrase&&fishReplay.ref===s.ref&&fishReplay.transcript===s.fish.transcript&&fishReplay.latency===s.fish.latency&&!signal.aborted&&speechState===s){
      s.fishCompletedAt=performance.now();s.loading=false;s.fishBytes=fishReplay.blob.size;s.fishCached=true;
      v3AttachAudio(s,URL.createObjectURL(fishReplay.blob),size,false);
      return;
    }
    let r;
    if(warm){const result=await warm.response;if(result.error)throw result.error;r=result.response;}
    else r=await fishResponse(s,phrase,signal);
    if(speechState!==s||signal.aborted){if(r.body)await r.body.cancel().catch(()=>{});return;}
    // Safari y otros navegadores sin MSE MP3 conservan la reproducción normal.
    s.fishHeadersAt=performance.now();
    if(s.fish.noCuts||s.fish.ahead||!fishCanStream()||!r.body){
      v3Status('Recibiendo toda la voz… Snoopy hablará cuando esté lista.');
      const blob=await r.blob();if(!blob.size)throw new Error('Fish Audio no devolvió audio');
      if(speechState!==s||signal.aborted)return;
      s.fishCompletedAt=performance.now();s.loading=false;s.fishBytes=blob.size;
      fishReplay=blob.size<=4000000?{phrase,ref:s.ref,transcript:s.fish.transcript,latency:s.fish.latency,blob}:null;
      v3AttachAudio(s,URL.createObjectURL(blob),size,false);
      return;
    }
    const ms=new MediaSource();s.mediaSource=ms;
    const reader=r.body.getReader();s.streamReader=reader;
    try{
      const opened=fishWait(ms,'sourceopen',signal,()=>v3AttachAudio(s,URL.createObjectURL(ms),size,true));
      await opened;
      const sb=ms.addSourceBuffer('audio/mpeg');
      sb.mode='sequence';
      let started=false,bytes=0,firstChunkAt=null;
      // Espera un colchón inicial, no el audio entero. Si la generación va lenta,
      // aumenta la reserva hasta ocho segundos en modo fluido.
      function pump(){
        if(speechState!==s||!s.audio)return;
        const pos=s.audio.currentTime||0;
        let ahead=0,end=0;
        for(let i=0;i<sb.buffered.length;i++){
          const a=sb.buffered.start(i),b=sb.buffered.end(i);
          end=Math.max(end,b);
          if(pos>=a-0.08&&pos<=b)ahead=Math.max(ahead,b-pos);
        }
        if(!started&&firstChunkAt!=null){
          const elapsed=Math.max(0.25,(performance.now()-firstChunkAt)/1000);
          const rate=end/elapsed;
          const target=s.fish.continuous?Math.min(8,Math.max(3,rate<1.15?5:3,elapsed*0.35)):0.7;
          if(ahead>=target){
            started=true;s.bufferReady=true;
            if(!s.paused)v3PlayAudio(s);
          }
        }else if(started&&s.buffering&&ahead>=(s.fish.continuous?3:1)){
          s.buffering=false;
          if(!s.paused)v3PlayAudio(s);
        }
      }
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        if(signal.aborted||speechState!==s||!s.v3)return;
        if(!value||!value.byteLength)continue;
        bytes+=value.byteLength;
        if(firstChunkAt==null)firstChunkAt=performance.now();
        await fishWait(sb,'updateend',signal,()=>sb.appendBuffer(value));
        pump();
      }
      if(!bytes)throw new Error('Fish Audio no devolvió audio');
      if(signal.aborted||speechState!==s||!s.v3)return;
      s.networkEnded=true;s.bufferReady=true;s.fishCompletedAt=performance.now();s.fishBytes=bytes;
      if(ms.readyState==='open')ms.endOfStream();
      if(s.reportFish)s.reportFish();
      s.loading=false;
      const needsPlay=!started||s.buffering;
      s.buffering=false;
      if(needsPlay&&!s.paused)v3PlayAudio(s);
    }finally{
      if(s.streamReader===reader)s.streamReader=null;
      await reader.cancel().catch(()=>{});
      try{reader.releaseLock();}catch(_){}
    }
  }
  async function v3Generate(s,phrase,signal){
    if(s.fish){
      const r=await fishResponse(s,phrase,signal);
      const blob=await r.blob();if(!blob.size)throw new Error('Fish Audio no devolvió audio');
      return blob;
    }
    if(!s.refPath){
      const fd=new FormData();
      const refBlob=await(await fetch(s.ref,{signal})).blob();
      const mime=(refBlob.type||'').split(';')[0].toLowerCase();
      const ext={'audio/mpeg':'mp3','audio/mp3':'mp3','audio/wav':'wav','audio/x-wav':'wav','audio/wave':'wav','audio/ogg':'ogg','audio/opus':'ogg','audio/flac':'flac','audio/x-flac':'flac','audio/mp4':'m4a','audio/x-m4a':'m4a','audio/webm':'webm','audio/aac':'aac'}[mime];
      if(!ext)throw Error('formato de referencia no reconocido');
      fd.append('files',refBlob,'referencia.'+ext);
      const paths=await(await v3Fetch(V3_BASE+'/gradio_api/upload',{method:'POST',body:fd,signal})).json();
      if(!Array.isArray(paths)||typeof paths[0]!=='string')throw new Error('referencia inválida');
      s.refPath=paths[0];
    }
    const payload={data:[phrase,V3_STYLE,{path:s.refPath,meta:{_type:'gradio.FileData'}},false,'',2,false,false]};
    const event=await(await v3Fetch(V3_BASE+'/gradio_api/call/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal})).json();
    if(typeof event.event_id!=='string')throw new Error('solicitud inválida');
    const raw=await(await v3Fetch(V3_BASE+'/gradio_api/call/generate/'+encodeURIComponent(event.event_id),{signal})).text();
    let result;
    for(const block of raw.replace(/\r\n/g,'\n').split('\n\n')){
      const type=block.match(/^event:\s*(.+)$/m)?.[1];
      const data=block.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');
      if(type==='error'){
        // Never expose upstream payloads, which may include private paths or text.
        const detail=data.toLowerCase();
        if(/quota|rate.limit|gpu.seconds|resource.exhausted|429|too many requests/.test(detail))throw Error('cuota o límite de VoxCPM2 alcanzado');
        if(/queue.full|overload|503|unavailable|capacity/.test(detail))throw Error('VoxCPM2 temporalmente saturado');
        if(/ffmpeg|decode|audio format|invalid audio|unsupported format/.test(detail))throw Error('VoxCPM2 no pudo leer la referencia de audio');
        throw Error('VoxCPM2 rechazó la generación sin especificar la causa');
      }
      if(type==='complete')result=JSON.parse(data);
    }
    const file=Array.isArray(result)?result[0]:null;
    if(!file||typeof file.url!=='string')throw new Error('sin audio generado');
    const url=new URL(file.url,V3_BASE);
    if(url.origin!==V3_BASE)throw new Error('dirección de audio inesperada');
    const blob=await(await v3Fetch(url.href,{signal})).blob();
    if(!blob.size)throw new Error('audio vacío');
    return blob;
  }
  function v3Dispose(s){
    if(s.streamReader){s.streamReader.cancel().catch(()=>{});s.streamReader=null;}
    if(s.audio){s.audio.onended=null;s.audio.onerror=null;s.audio.onplaying=null;s.audio.onwaiting=null;s.audio.onloadedmetadata=null;s.audio.ondurationchange=null;s.audio.pause();s.audio.removeAttribute('src');s.audio.load();s.audio=null;}
    if(s.audioURL){URL.revokeObjectURL(s.audioURL);s.audioURL=null;}
    s.mediaSource=null;
  }
  function v3Fallback(s,reason){
    if(speechState!==s||s.finished)return;
    const partial=s.fish&&s.segmentStarted;
    if(s.controller)s.controller.abort();
    v3Dispose(s);s.v3=false;s.loading=false;
    if(partial){
      v3Status('La transmisión de voz se interrumpió. Pulsa Escuchar otra vez si quieres repetir la respuesta.');
      finishSpeech(s);return;
    }
    v3Status((s.fish?'Fish Audio V4':'Voz V3')+' no disponible ('+reason+'). Se utilizará la voz anterior.');
    if(s.paused){s.fallbackPending=true;return;}
    speakSegment(s);
  }
  function v3PlayAudio(s){
    if(speechState!==s||!s.audio||s.paused||s.finished||(s.fish&&(!s.bufferReady||s.buffering)))return;
    s.audio.play().then(()=>{
      if(speechState===s&&!s.paused)v3Status('Snoopy está hablando con '+(s.fish?'Fish Audio V4.9.'+(s.latencyLabel?' · '+s.latencyLabel:''):'su voz V3.'));
    }).catch(()=>{
      if(speechState===s&&!s.paused)v3Status('Pulsa Reproducir respuesta para escuchar a Snoopy.',true);
    });
  }
  async function v3Segment(s){
    if(speechState!==s||s.finished||s.loading||s.paused)return;
    const remaining=s.words.slice(s.cursor);
    if(!remaining.trim()){v3Status((s.fish?'Fish Audio V4':'Voz V3')+' · respuesta completada.');if(!s.fish&&s.replyParts?.length)void assembleSavedReply(s.replyParts);finishSpeech(s);return;}
    // En navegadores sin streaming, priorizar una primera frase corta.
    const cap=s.fish?3200:320;
    let size=Math.min(cap,remaining.length);
    if(size<remaining.length){
      const cut=remaining.slice(0,size);
      const punct=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('? '),cut.lastIndexOf('! '),cut.lastIndexOf('; '));
      if(punct>80)size=punct+1;else if(cut.lastIndexOf(' ')>0)size=cut.lastIndexOf(' ')+1;
    }
    const warm=s.fish&&s.cursor===0?s.warmup:null;
    s.warmup=null;
    if(warm)size=warm.phrase.length;
    if(s.fish&&s.ttsStartedAt==null)s.ttsStartedAt=warm?warm.startedAt:performance.now();
    s.loading=true;const controller=warm?warm.controller:new AbortController();s.controller=controller;
    const timer=setTimeout(()=>controller.abort(),180000);
    s.segmentStarted=false;
    v3Status(s.fish?(s.fish.noCuts?'Generando toda la voz sin cortes de carga…':s.fish.ahead?'Preparando generación anticipada…':s.fish.continuous?'Generando voz y preparando el colchón de audio…':'Snoopy está preparando los primeros sonidos…'):'Snoopy está generando su voz personalizada…');
    try{
      if(s.fish){await fishStream(s,remaining.slice(0,size).trim(),size,controller.signal,warm);return;}
      const blob=await v3Generate(s,remaining.slice(0,size).trim(),controller.signal);
      if(speechState!==s||s.finished)return;
      if(!s.replyParts)s.replyParts=[];s.replyParts.push(blob);
      s.loading=false;s.audioURL=URL.createObjectURL(blob);s.audio=new Audio(s.audioURL);
      s.audio.onended=()=>{if(speechState!==s)return;v3Dispose(s);s.cursor+=size;v3Segment(s);};
      s.audio.onerror=()=>v3Fallback(s,'error de reproducción');
      if(!s.paused)v3PlayAudio(s);
    }catch(e){
      if(speechState===s&&s.v3)v3Fallback(s,e.name==='AbortError'?'tiempo de espera agotado':String(e.message||'error de conexión').slice(0,100));
    }finally{clearTimeout(timer);if(s.controller===controller)s.controller=null;}
  }

  /* ---------- Voz calmada y clara en español (Web Speech API) ---------- */
  function stopVoice() {
    clearFishWarmup();
    voiceGeneration++;
    const previous=speechState;
    speechState = null;
    if(previous&&previous.controller)previous.controller.abort();
    if(previous&&previous.warmup)previous.warmup.controller.abort();
    if(previous&&previous.v3){v3Dispose(previous);v3Status('');}
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
  /* Mantener el punto de lectura al pausar una respuesta. */
  function finishSpeech(state) {
    if (speechState !== state || state.finished) return;
    state.finished = true;
    speechState = null;
    if (typeof state.onFinished === 'function') state.onFinished();
  }
  function speakSegment(state) {
    if (speechState !== state || state.finished) return;
    const remainder = state.words.slice(state.cursor);
    if (!remainder.trim()) { finishSpeech(state); return; }
    const from = state.cursor;
    const utterance = new window.SpeechSynthesisUtterance(remainder);
    const chosen = preferredVoice();
    if (chosen) { utterance.voice = chosen; utterance.lang = chosen.lang; }
    else utterance.lang = 'es-PE';
    utterance.rate = 1.4;
    utterance.pitch = 0.94;
    utterance.volume = 0.82;
    state.utterance = utterance;
    state.paused = false;
    state.interrupted = false;
    utterance.onboundary = event => {
      if (speechState !== state || state.utterance !== utterance || state.finished) return;
      if (!Number.isFinite(event.charIndex)) return;
      const at = Math.max(0, Math.min(remainder.length, event.charIndex));
      // Si el navegador cancela la voz, empezar después de la última palabra reconocida.
      const gap = remainder.slice(at).search(/\s/);
      state.cursor = Math.max(state.cursor, from + (gap < 0 ? remainder.length : at + gap + 1));
    };
    utterance.onend = () => {
      if (speechState !== state || state.utterance !== utterance) return;
      state.cursor = state.words.length;
      finishSpeech(state);
    };
    utterance.onerror = () => {
      if (speechState !== state || state.utterance !== utterance) return;
      if (state.paused || tabPaused || manualPaused || document.visibilityState === 'hidden') {
        state.interrupted = true;
        return;
      }
      finishSpeech(state);
    };
    try { window.speechSynthesis.speak(utterance); }
    catch (_) { finishSpeech(state); }
  }
  function speakReply(text, force = false, onFinished = null, turnStartedAt = null) {
    if (!voiceSupported || (!voiceEnabled && !force)) {
      if (onFinished) onFinished();
      return;
    }
    const words = spokenText(text);
    if (!words) {
      if (onFinished) onFinished();
      return;
    }
    const warmup=null; // una única petición de voz por respuesta, sin dividir la primera frase
    stopVoice();
    speechState = { words, cursor: 0, utterance: null, paused: false,
      interrupted: false, finished: false, onFinished, turnStartedAt };
    if(v3Enabled()){
      Object.assign(speechState,{v3:true,ref:v3Ref,refName:v3Name,loading:false,fish:fishOn?{key:fishKey,transcript:fishTranscript,latency:fishLatency,continuous:fishContinuous,noCuts:fishNoCuts,concise:fishConcise,ahead:fishAhead}:null,warmup});
      v3Segment(speechState);
    }else speakSegment(speechState);
  }
  function pauseSpokenAnswer() {
    if (!speechState || speechState.finished || speechState.paused) return;
    speechState.paused = true;
    if(speechState.v3){if(speechState.audio)speechState.audio.pause();return;}
    if (typeof window.speechSynthesis.pause === 'function') {
      try { window.speechSynthesis.pause(); }
      catch (_) { speechState.interrupted = true; }
    } else speechState.interrupted = true;
  }
  function resumeSpokenAnswer() {
    const state = speechState;
    if (!state || state.finished) return false;
    if(state.v3){
      state.paused=false;
      if(state.audio)v3PlayAudio(state);else if(!state.loading)v3Segment(state);
      return true;
    }
    if(state.fallbackPending){state.fallbackPending=false;state.paused=false;speakSegment(state);return true;}
    if (state.paused) {
      const synth = window.speechSynthesis;
      // La pausa nativa es lo más preciso: no reinicia ninguna frase.
      if (synth.speaking && !state.interrupted) {
        state.paused = false;
        try { if (synth.paused) synth.resume(); return true; }
        catch (_) { state.interrupted = true; }
      }
      state.paused = false;
      // Recuperar solo lo pendiente cuando Chrome descartó el audio.
      if (state.cursor > 0 && state.cursor < state.words.length) {
        voiceGeneration++;
        try { synth.cancel(); } catch (_) {}
        speakSegment(state);
      } else {
        // Sin posición conocida no repetimos toda la respuesta.
        finishSpeech(state);
      }
    }
    return Boolean(speechState);
  }

  function toggleVoice() {
    if (!voiceSupported) return;
    voiceEnabled = !voiceEnabled;
    voiceBtn.textContent = voiceEnabled ? '🔊' : '🔇';
    voiceBtn.title = voiceEnabled ? 'Desactivar respuestas por voz' : 'Activar respuestas por voz';
    voiceBtn.setAttribute('aria-label', voiceBtn.title);
    voiceBtn.setAttribute('aria-pressed', String(voiceEnabled));
    if (!voiceEnabled) {
      stopVoice();
      if (voiceConversation && !busy && !micSession && !tabPaused && !manualPaused) startListening();
    }
  }

  /* ---------- Conversación por voz con pausa automática al cambiar de pestaña ---------- */
  function showMicStatus(message) {
    micStatus.textContent = message || '';
    micStatus.hidden = !message;
  }
  function markMicListening(isListening) {
    micBtn.classList.toggle('listening', isListening && voiceConversation);
    micBtn.textContent = voiceConversation ? '⏹' : '🎤';
    micBtn.title = voiceConversation ? 'Finalizar conversación por voz' : 'Iniciar conversación por voz';
    micBtn.setAttribute('aria-label', micBtn.title);
    micBtn.setAttribute('aria-pressed', String(voiceConversation));
  }
  function stopVoiceConversation(message = 'Conversación por voz finalizada. Pulsa 🎤 para iniciar otra.') {
    voiceConversation = false;
    manualPaused = false;
    tabPaused = false;
    pendingVoiceText = '';
    stopMic(true);
    stopVoice();
    markMicListening(false);
    showMicStatus(message);
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
    if (!micSupported) return;
    if (voiceConversation) {
      stopVoiceConversation();
      return;
    }
    if (busy) return;
    voiceConversation = true;
    tabPaused = false;
    manualPaused = false;
    pendingVoiceText = '';
    startListening();
  }
  function startListening() {
    if (!voiceConversation || manualPaused || tabPaused || busy || micSession || document.visibilityState === 'hidden') return;
    stopVoice(); // nunca grabar el sonido de la voz de Snoopy
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
      showMicStatus('🎤 Te escucho. Cuando hagas una pausa, Snoopy responderá automáticamente.');
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
      // Una pausa natural marca el final de este turno, no el final de la conversación.
      if (micSilenceTimer) clearTimeout(micSilenceTimer);
      micSilenceTimer = null;
      if ((current.final || current.interim) && voiceConversation) {
        micSilenceTimer = setTimeout(() => {
          if (micSession === current && !current.stopping && voiceConversation) stopMic(false);
        }, 1950);
      }
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
        if (voiceConversation && !current.cancelled) {
          if (current.error === 'no-speech') {
            showMicStatus('🎤 Sigo escuchando…');
            setTimeout(() => { if (voiceConversation && !busy) startListening(); }, 650);
          } else stopVoiceConversation(microphoneError(current.error));
        }
        return;
      }
      if (!current.stopping && (current.final || current.interim)) current.stopping = true;
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
            voiceConversation = false;
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
      voiceConversation = false;
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
    else stopVoiceConversation('Conversación detenida al cerrar.');
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
    const t = '¡'+saludo+'! Qué gusto saludarte. ¿Cómo estás hoy?';
    state.msgs = [{ r: 'a', t, l: [], s: cfg.faqs || [], w: 1 }]; save(); render();
  }
  async function refreshChips() {
    if (!cfg || state.msgs.length !== 1 || !state.msgs[0].w) return;
    try { const c = await (await fetch(`${API}/api/config?page=${encodeURIComponent(page())}&section=${encodeURIComponent(section())}`)).json(); state.msgs[0].s = c.faqs || []; save(); render(); } catch { /* se deja como está */ }
  }
  function newChat() { if (busy) return; stopVoiceConversation(''); showMicStatus(''); state = { sid: newSid(), msgs: [], open: true, min: false }; save(); welcome(); input.focus(); }

  /* ---------- Petición al servidor (con respuesta en tiempo real) ---------- */
  const headers = { 'Content-Type': 'application/json' };
  const payload = text => {
    const body = { session: state.sid, message: text, page: page(), section: section(), conciseVoice: fishOn&&voiceEnabled&&fishConcise };
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
    const turnStartedAt=performance.now();
    if (micSession) stopMic(true);
    stopVoice();
    input.value = ''; busy = true; sendBtn.disabled = true;
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
    if (!liveText && !fishOn) await new Promise(r => setTimeout(r, 250));   // sin demora artificial al usar Fish Audio
    liveEl = null; liveRaf = 0; liveText = '';
    busy = false; sendBtn.disabled = false;
    state.msgs.push(bot); state.msgs = state.msgs.slice(-60); save(); render();
    if (voiceConversation) {
      if (tabPaused || manualPaused || document.visibilityState === 'hidden') {
        pendingVoiceText = bot.t;
        showMicStatus(tabPaused || document.visibilityState === 'hidden'
          ? '⏸ Conversación pausada al cambiar de pestaña; continúa al volver.'
          : '⏸ Conversación pausada. Pulsa Alt + M para reanudar.');
      } else {
        showMicStatus('🔊 Snoopy está hablando. Después volveré a escucharte…');
        speakReply(bot.t, false, () => {
          if (voiceConversation && !tabPaused && !manualPaused && document.visibilityState !== 'hidden' && (MODE === 'page' || state.open)) startListening();
        },turnStartedAt);
      }
    } else {
      showMicStatus('');
      if (bot.q && bot.t && (MODE === 'page' || state.open)) speakReply(bot.t,false,null,turnStartedAt);
    }
    markMicListening(false);
    if (!voiceConversation && (MODE === 'page' || state.open)) input.focus();
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
  /* Pausa/reanudación: cambiar de pestaña no finaliza la conversación. */
  function resumeVoiceConversation() {
    if (!voiceConversation || tabPaused || manualPaused || busy || document.visibilityState === 'hidden') return;
    if (speechState) {
      // Retomar desde donde estaba la voz, no desde el comienzo.
      resumeSpokenAnswer();
      return;
    }
    if (pendingVoiceText) {
      const message = pendingVoiceText;
      pendingVoiceText = '';
      showMicStatus('🔊 Snoopy responde a la pregunta pendiente…');
      speakReply(message, false, () => {
        if (voiceConversation && !tabPaused && !manualPaused) startListening();
      });
    } else startListening();
  }
  function toggleManualVoicePause() {
    if (!voiceConversation) return;
    manualPaused = !manualPaused;
    if (manualPaused) {
      stopMic(true);
      pauseSpokenAnswer();
      showMicStatus('⏸ Conversación pausada. Pulsa Alt + M para continuar o ⏹ para finalizar.');
    } else {
      showMicStatus(tabPaused ? '⏸ Pestaña en segundo plano; se reanudará al regresar.' : '🎤 Reanudando conversación…');
      resumeVoiceConversation();
    }
  }
  document.addEventListener('keydown', event => {
    if (event.altKey && !event.ctrlKey && !event.metaKey && String(event.key).toLowerCase() === 'm' && voiceConversation) {
      event.preventDefault();
      toggleManualVoicePause();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!voiceConversation) return;
    if (document.visibilityState === 'hidden') {
      tabPaused = true;
      stopMic(true);
      pauseSpokenAnswer();
      showMicStatus('⏸ Snoopy está pausado. Al volver seguirá hablando desde donde quedó o solo escuchará si ya terminó.');
    } else {
      tabPaused = false;
      showMicStatus(manualPaused ? '⏸ En pausa manual. Pulsa Alt + M para reanudar.' : '🎤 Volviste. Reanudando…');
      resumeVoiceConversation();
    }
  });
  window.addEventListener('pagehide', () => {
    // Salir o cerrar la página sí finaliza la sesión de voz.
    if (voiceConversation) stopVoiceConversation('');else stopVoice();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

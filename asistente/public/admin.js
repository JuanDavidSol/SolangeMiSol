(() => {
  'use strict';
  const app = document.getElementById('app');
  const TK = 'asistente-admin-token';
  let token = sessionStorage.getItem(TK) || '';
  let state = null, tab = 'qa', filter = '', onlyDown = true;

  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = Boolean(v);
      else el.setAttribute(k, v);
    }
    el.append(...kids.flat().filter(x => x != null && x !== false));
    return el;
  };
  const toast = t => { const el = h('div', { class: 'toast', role: 'status' }, t); document.body.append(el); setTimeout(() => el.remove(), 2600); };
  const fmt = ts => new Date(ts).toLocaleString('es');
  const SRC = { unknown: 'sin IA', gemini: 'respondió Gemini', ollama: 'respondió Ollama', kb: 'base de conocimientos' };

  async function api(method, path, body) {
    const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== '/admin/login') { logout(); throw new Error('Sesión caducada'); }
    if (!r.ok) throw new Error(j.error || 'Error');
    return j;
  }
  function logout() { token = ''; sessionStorage.removeItem(TK); state = null; showLogin(); }
  async function refresh() { state = await api('GET', '/admin/state'); draw(); }

  /* ---------- Acceso ---------- */
  function showLogin() {
    const pw = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Contraseña' });
    const form = h('form', { class: 'card login', onsubmit: async e => {
      e.preventDefault();
      try { token = (await api('POST', '/admin/login', { password: pw.value })).token; sessionStorage.setItem(TK, token); await boot(); }
      catch (err) { toast(err.message); }
    } }, h('h1', {}, '🔒 Administrar el asistente'), h('label', {}, 'Contraseña'), pw, h('p', {}, h('button', { class: 'primary', type: 'submit' }, 'Entrar')));
    app.replaceChildren(form); pw.focus();
  }

  async function boot() {
    try { state = await api('GET', '/admin/state'); } catch { return showLogin(); }
    draw();
  }

  function draw() {
    const st = state.stats || {};
    const names = {
      qa: 'Preguntas y respuestas',
      unans: 'Sin respuesta' + (st.unanswered ? ` (${st.unanswered})` : ''),
      fb: `Opiniones${st.up || st.down ? ` (👍 ${st.up || 0} · 👎 ${st.down || 0})` : ''}`,
      set: 'Ajustes', conv: 'Conversaciones', st: 'Estado'
    };
    app.replaceChildren(
      h('div', { class: 'top' }, h('h1', {}, '🐶 Panel del asistente'), h('button', { class: 'small', onclick: logout }, 'Salir')),
      h('div', { class: 'tabs' }, Object.entries(names).map(([k, v]) => h('button', { class: k === tab ? 'on' : '', onclick: () => { tab = k; draw(); } }, v))),
      h('div', { id: 'view' }));
    ({ qa: viewQA, unans: viewUnans, fb: viewFeedback, set: viewSettings, conv: viewConv, st: viewStatus })[tab]();
  }
  const view = () => document.getElementById('view');

  /* ---------- Preguntas y respuestas ---------- */
  function viewQA() {
    const list = h('div');
    const paint = () => {
      const f = filter.toLowerCase();
      list.replaceChildren(...state.knowledge.filter(k => !f || (k.question + ' ' + k.answer + ' ' + (k.keywords || []).join(' ')).toLowerCase().includes(f)).map(card));
      if (!list.children.length) list.append(h('p', { class: 'muted' }, 'No hay resultados.'));
    };
    const search = h('input', { type: 'text', placeholder: 'Buscar…', value: filter, 'aria-label': 'Buscar', oninput: e => { filter = e.target.value; paint(); } });
    view().append(
      h('div', { class: 'row' },
        h('div', { class: 'grow' }, search),
        h('button', { class: 'primary', onclick: () => editor(null) }, '+ Nueva respuesta'),
        h('button', { onclick: async () => { try { const r = await api('POST', '/admin/reindex'); state = await api('GET', '/admin/state'); toast(`Web leída: ${r.files} páginas, ${r.chunks} fragmentos`); } catch (e) { toast(e.message); } } }, '↻ Actualizar desde la web')),
      h('p', { class: 'muted' }, `${state.knowledge.length} respuestas · ${state.stats.pages} fragmentos leídos de tu web. Las preguntas marcadas como FAQ aparecen como botones rápidos en el chat.`),
      list);
    paint();
  }
  function card(k) {
    return h('div', { class: 'card' + (k.enabled === false ? ' off' : '') },
      h('div', { class: 'row' },
        h('strong', { class: 'grow' }, k.question),
        k.faq && h('span', { class: 'badge' }, 'FAQ'), k.page && h('span', { class: 'badge' }, 'sección: ' + k.page), k.enabled === false && h('span', { class: 'badge' }, 'desactivada')),
      h('p', { class: 'muted' }, k.answer.length > 200 ? k.answer.slice(0, 200) + '…' : k.answer),
      h('div', { class: 'row' },
        h('button', { class: 'small', onclick: () => editor(k) }, 'Editar'),
        h('button', { class: 'small', onclick: async () => { try { await api('PUT', '/admin/knowledge/' + k.id, { ...k, enabled: k.enabled === false }); await refresh(); } catch (e) { toast(e.message); } } }, k.enabled === false ? 'Activar' : 'Desactivar'),
        h('button', { class: 'small danger', onclick: async () => { if (!confirm('¿Eliminar esta respuesta?')) return; try { await api('DELETE', '/admin/knowledge/' + k.id); await refresh(); toast('Eliminada'); } catch (e) { toast(e.message); } } }, 'Eliminar')));
  }
  /* "seed" rellena una respuesta nueva a partir de una pregunta sin respuesta (o con 👎). Si trae unansweredId, se quita de la lista al guardar */
  function editor(k, seed) {
    const f = {
      question: h('input', { type: 'text', maxlength: '300', value: k ? k.question : (seed && seed.question) || '' }),
      answer: h('textarea', { maxlength: '2000' }), keywords: h('input', { type: 'text', value: k ? (k.keywords || []).join(', ') : '' }),
      link: h('input', { type: 'text', value: k ? k.link || '' : '' }), linkText: h('input', { type: 'text', value: k ? k.linkText || '' : '' }),
      page: h('input', { type: 'text', value: k ? k.page || '' : '' }),
      faq: h('input', { type: 'checkbox', checked: k ? k.faq : false }), enabled: h('input', { type: 'checkbox', checked: k ? k.enabled !== false : true }),
    };
    f.answer.value = k ? k.answer : '';
    const box = h('div', { class: 'card' },
      h('h2', {}, k ? 'Editar respuesta' : 'Nueva respuesta'),
      seed ? h('p', { class: 'muted' }, 'Escribe la respuesta a esta pregunta. Añade palabras clave con otras formas de preguntarlo para que se encuentre mejor.') : null,
      h('label', {}, 'Pregunta'), f.question, h('label', {}, 'Respuesta'), f.answer,
      h('label', {}, 'Palabras clave (separadas por comas; ayudan a encontrar esta respuesta)'), f.keywords,
      h('label', {}, 'Enlace (opcional, p. ej. juegos.html o https://…)'), f.link,
      h('label', {}, 'Texto del botón del enlace'), f.linkText,
      h('label', {}, 'Sección donde es más útil (opcional, p. ej. shop, pac, juegos.html)'), f.page,
      h('label', { class: 'check' }, f.faq, 'Mostrar como pregunta frecuente (botón rápido)'),
      h('label', { class: 'check' }, f.enabled, 'Activa'),
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: async () => {
          const body = { question: f.question.value, answer: f.answer.value, keywords: f.keywords.value, link: f.link.value, linkText: f.linkText.value, page: f.page.value, faq: f.faq.checked, enabled: f.enabled.checked };
          try {
            await api(k ? 'PUT' : 'POST', '/admin/knowledge' + (k ? '/' + k.id : ''), body);
            if (seed && seed.unansweredId) await api('DELETE', '/admin/unanswered/' + seed.unansweredId).catch(() => {});
            await refresh(); toast('Guardado ✔');
          } catch (e) { toast(e.message); }
        } }, 'Guardar'),
        h('button', { onclick: draw }, 'Cancelar')));
    view().replaceChildren(box); f.question.focus();
  }

  /* ---------- Preguntas sin respuesta ---------- */
  async function viewUnans() {
    let list; try { list = await api('GET', '/admin/unanswered'); } catch (e) { return toast(e.message); }
    view().replaceChildren(
      h('div', { class: 'row' },
        h('span', { class: 'muted grow' }, `${list.length} preguntas que la base de conocimientos no supo responder (las más repetidas primero). Conviértelas en respuestas nuevas: la próxima vez saldrán al instante y sin errores.`),
        list.length ? h('button', { class: 'small danger', onclick: async () => { if (!confirm('¿Vaciar la lista?')) return; await api('DELETE', '/admin/unanswered'); await refresh(); } }, 'Vaciar lista') : null),
      ...(list.length ? list.map(u => h('div', { class: 'card' },
        h('div', { class: 'row' }, h('strong', { class: 'grow' }, u.text), h('span', { class: 'badge' }, u.count > 1 ? `${u.count} veces` : '1 vez'), h('span', { class: 'badge' }, SRC[u.src] || u.src || '—')),
        h('p', { class: 'muted' }, 'Última vez: ' + fmt(u.last)),
        h('div', { class: 'row' },
          h('button', { class: 'small primary', onclick: () => editor(null, { question: u.text, unansweredId: u.id }) }, 'Crear respuesta'),
          h('button', { class: 'small', onclick: async () => { try { await api('DELETE', '/admin/unanswered/' + u.id); await refresh(); } catch (e) { toast(e.message); } } }, 'Descartar')))) : [h('p', { class: 'muted' }, 'No hay preguntas pendientes 🎉')]));
  }

  /* ---------- Opiniones 👍 / 👎 ---------- */
  async function viewFeedback() {
    let list; try { list = await api('GET', '/admin/feedback'); } catch (e) { return toast(e.message); }
    const shown = onlyDown ? list.filter(f => f.value === 'down') : list;
    const only = h('input', { type: 'checkbox', checked: onlyDown, onchange: e => { onlyDown = e.target.checked; viewFeedback(); } });
    view().replaceChildren(
      h('div', { class: 'row' },
        h('span', { class: 'muted grow' }, `${state.stats.up || 0} 👍 · ${state.stats.down || 0} 👎. Las respuestas con 👎 son las que conviene mejorar.`),
        list.length ? h('button', { class: 'small danger', onclick: async () => { if (!confirm('¿Borrar todas las opiniones?')) return; await api('DELETE', '/admin/feedback'); await refresh(); } }, 'Borrar todas') : null),
      h('label', { class: 'check' }, only, 'Mostrar solo las 👎'),
      ...(shown.length ? shown.map(f => h('div', { class: 'card' },
        h('div', { class: 'row' }, h('span', {}, f.value === 'up' ? '👍' : '👎'), h('strong', { class: 'grow' }, f.question), h('span', { class: 'badge' }, SRC[f.source] || f.source || '—')),
        h('p', { class: 'muted' }, f.reply.length > 300 ? f.reply.slice(0, 300) + '…' : f.reply),
        h('div', { class: 'row' },
          h('span', { class: 'muted grow' }, fmt(f.ts)),
          f.value === 'down' ? h('button', { class: 'small primary', onclick: () => editor(null, { question: f.question }) }, 'Crear respuesta') : null,
          h('button', { class: 'small', onclick: async () => { try { await api('DELETE', '/admin/feedback/' + f.id); await refresh(); } catch (e) { toast(e.message); } } }, 'Descartar')))) : [h('p', { class: 'muted' }, 'Aún no hay opiniones.')]));
  }

  /* ---------- Ajustes ---------- */
  function viewSettings() {
    const S = state.settings, t = (k, label, area) => { const el = area ? h('textarea', {}) : h('input', { type: 'text', value: S[k] || '' }); if (area) el.value = S[k] || ''; return [h('label', {}, label), el, el]; };
    const fields = {};
    const text = (k, label, area) => { const [l, el] = t(k, label, area); fields[k] = el; return [l, el]; };
    const flag = (k, label) => { const el = h('input', { type: 'checkbox', checked: S[k] }); fields[k] = el; return h('label', { class: 'check' }, el, label); };
    const num = (k, label, min, max) => { const el = h('input', { type: 'number', min, max, value: S[k] }); fields[k] = el; return [h('label', {}, label), el]; };
    const scope = h('select', { 'aria-label': 'Alcance de la IA' },
      h('option', { value: 'general' }, 'General: la web, y además programación y otros temas'),
      h('option', { value: 'web' }, 'Solo la web: juegos, galletas, premios y tienda'));
    scope.value = S.aiScope === 'web' ? 'web' : 'general'; fields.aiScope = scope;
    const pw = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Nueva contraseña (mínimo 8 caracteres)' });
    view().append(h('div', { class: 'card' },
      h('h2', {}, 'Mensajes'),
      text('assistantName', 'Nombre del asistente'), text('siteName', 'Nombre de la web (para la IA)'),
      text('welcome', 'Mensaje de bienvenida (usa {saludo} y {nombre})', true), text('fallbackMessage', 'Mensaje cuando no sabe responder', true), text('disabledMessage', 'Mensaje cuando está desactivado'),
      h('h2', {}, 'Funciones'),
      flag('enabled', 'Asistente activado'), flag('aiEnabled', 'Usar IA (Gemini u Ollama) cuando esté disponible'), flag('showFaqs', 'Mostrar preguntas frecuentes como botones'),
      flag('logConversations', 'Guardar conversaciones, opiniones y preguntas sin respuesta (se enmascaran correos y teléfonos)'),
      num('quickCount', 'Cuántas preguntas rápidas mostrar (0-8)', 0, 8), num('retentionDays', 'Borrar conversaciones a los … días', 1, 365),
      h('h2', {}, 'Qué puede responder la IA'),
      h('label', {}, 'Alcance'), scope,
      h('p', { class: 'muted' }, 'Con "Solo la web", Snoopy rechaza con amabilidad lo que no tenga que ver con tu página (programación, tareas…).'),
      h('h2', {}, 'Búsqueda: sinónimos'),
      text('synonyms', 'Un grupo por línea, palabras separadas por comas. Cualquiera de ellas encuentra a las demás. Ejemplo: consigo, obtengo, gano', true),
      h('p', { class: 'muted' }, 'Los errores de escritura pequeños ("galetas") ya se corrigen solos; los sinónimos sirven para palabras distintas con el mismo significado.'),
      h('h2', {}, 'Enlaces y modelo'),
      text('siteBase', 'Dirección base de tu web para los enlaces relativos (p. ej. / o https://mipagina.com/)'),
      text('contactLink', 'Enlace de contacto (se ofrece cuando no sabe responder)'), text('contactText', 'Texto del botón de contacto'),
      text('ollamaModel', 'Modelo de Ollama (vacío = el predeterminado del servidor)'),
      h('p', {}, h('button', { class: 'primary', onclick: async () => {
        const body = {};
        for (const [k, el] of Object.entries(fields)) body[k] = el.type === 'checkbox' ? el.checked : el.value;
        try { await api('PUT', '/admin/settings', body); state = await api('GET', '/admin/state'); toast('Ajustes guardados ✔'); } catch (e) { toast(e.message); }
      } }, 'Guardar ajustes'))),
      h('div', { class: 'card' }, h('h2', {}, 'Contraseña de administración'),
        state.passwordFromEnv ? h('p', { class: 'muted' }, 'La contraseña se define con la variable ADMIN_PASSWORD del servidor; cámbiala allí.') : [pw, h('p', {}, h('button', { onclick: async () => { try { await api('POST', '/admin/password', { password: pw.value }); pw.value = ''; toast('Contraseña cambiada. Vuelve a entrar.'); setTimeout(logout, 1200); } catch (e) { toast(e.message); } } }, 'Cambiar contraseña'))]));
  }

  /* ---------- Conversaciones ---------- */
  async function viewConv() {
    let list; try { list = await api('GET', '/admin/conversations'); } catch (e) { return toast(e.message); }
    view().replaceChildren(
      h('div', { class: 'row' }, h('span', { class: 'muted grow' }, `${list.length} conversaciones recientes`),
        list.length ? h('button', { class: 'small danger', onclick: async () => { if (!confirm('¿Borrar TODAS las conversaciones?')) return; await api('DELETE', '/admin/conversations'); viewConv(); } }, 'Borrar todas') : null),
      ...(list.length ? list.map(c => h('div', { class: 'card' },
        h('div', { class: 'row' }, h('strong', { class: 'grow' }, fmt(c.updated)), h('span', { class: 'badge' }, `${c.count} mensajes`), c.page && h('span', { class: 'badge' }, c.page)),
        h('p', { class: 'muted' }, c.preview), h('button', { class: 'small', onclick: () => openConv(c.id) }, 'Ver'))) : [h('p', { class: 'muted' }, 'Aún no hay conversaciones.')]));
  }
  async function openConv(id) {
    const c = await api('GET', '/admin/conversations/' + id);
    view().replaceChildren(h('div', { class: 'row' }, h('button', { class: 'small', onclick: viewConv }, '← Volver'),
      h('button', { class: 'small danger', onclick: async () => { await api('DELETE', '/admin/conversations/' + id); viewConv(); } }, 'Eliminar')),
      h('p', { class: 'muted' }, `Inició: ${fmt(c.started)} · Página: ${c.page || '—'}`),
      ...c.messages.map(m => h('div', { class: 'msg ' + m.r }, m.t, m.src ? h('div', { class: 'muted' }, 'origen: ' + m.src) : null)));
  }

  /* ---------- Estado ---------- */
  function viewStatus() {
    const o = state.ollama, g = state.gemini || {}, st = state.stats;
    view().append(h('div', { class: 'card' },
      h('h2', {}, 'IA en línea (Gemini)'),
      h('p', {}, g.ok ? h('span', { class: 'ok' }, `Configurada · modelo ${g.model}`) : h('span', { class: 'bad' }, 'No disponible: ' + (g.reason || ''))),
      h('h2', {}, 'IA local (Ollama)'),
      h('p', {}, o.ok ? h('span', { class: 'ok' }, `Conectada · modelo ${o.model}`) : h('span', { class: 'bad' }, 'No disponible: ' + o.reason)),
      h('p', { class: 'muted' }, 'Si no está disponible, el asistente sigue respondiendo con la base de conocimientos.'),
      h('button', { onclick: refresh }, 'Comprobar de nuevo')),
      h('div', { class: 'card' }, h('h2', {}, 'Resumen'),
        h('p', {}, `Respuestas en la base de conocimientos: ${state.knowledge.length}`), h('p', {}, `Fragmentos leídos de la web: ${st.pages}`), h('p', {}, `Conversaciones guardadas: ${st.conversations}`),
        h('p', {}, `Preguntas sin respuesta pendientes: ${st.unanswered || 0}`), h('p', {}, `Opiniones: ${st.up || 0} 👍 · ${st.down || 0} 👎`)));
  }

  token ? boot() : showLogin();
})();

/* API personal de Gemini: la clave permanece únicamente en memoria. */
(() => {
  'use strict';
  let personalKey = '';
  let revision = 0;
  const KEY_STORAGE = 'snoopy-gemini-personal-v1';
  const form = document.getElementById('api-key-form');
  const field = document.getElementById('personal-gemini-key');
  const modelField = document.getElementById('personal-gemini-model');
  const status = document.getElementById('api-key-status');
  const remove = document.getElementById('api-key-remove');
  const test = document.getElementById('api-key-test');
  const settings = document.getElementById('api-settings');
  const activePanel = document.getElementById('api-active');
  const activeLabel = document.getElementById('api-active-label');
  const change = document.getElementById('api-change');
  const remember = document.getElementById('api-key-remember');
  const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
  const usableKey = value => typeof value === 'string' && value.length >= 8 && value.length <= 256 && /^[\x21-\x7e]+$/.test(value);
  window.getSnoopyPersonalGeminiKey = () => personalKey;
  window.getSnoopyPersonalGeminiModel = () => modelField ? modelField.value : DEFAULT_MODEL;
  if (!form || !field || !modelField || !status || !remove || !test || !settings || !activePanel || !activeLabel || !change || !remember) return;

  // Solo se conserva en el almacenamiento de ESTE navegador si se marca la casilla.
  // Se trata de texto local, no de cifrado; no usar esta opción en equipos compartidos.
  function removeStoredKey() {
    try { localStorage.removeItem(KEY_STORAGE); } catch (_) { /* almacenamiento bloqueado */ }
  }
  function saveStoredKey() {
    if (!remember.checked || !personalKey) { removeStoredKey(); return; }
    try {
      localStorage.setItem(KEY_STORAGE, JSON.stringify({ key: personalKey, model: modelField.value }));
    } catch (_) {
      remember.checked = false;
      status.textContent = 'Chrome no permitió guardar la clave. Permanecerá activa solo hasta recargar.';
    }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY_STORAGE) || 'null');
    if (saved && usableKey(saved.key)) {
      personalKey = saved.key;
      if (Array.from(modelField.options).some(option => option.value === saved.model)) modelField.value = saved.model;
      remember.checked = true;
      showActive('✓ Gemini recordado en este navegador (conexión aún no verificada).');
    } else if (saved) removeStoredKey();
  } catch (_) { /* no acceder al almacenamiento disponible es válido */ }
  remember.addEventListener('change', () => {
    saveStoredKey();
    if (personalKey) status.textContent = remember.checked
      ? 'Clave recordada solo en este navegador. Evita esta opción en dispositivos compartidos.'
      : 'Dejaste de recordar la clave. Sigue activa hasta que cierres o recargues esta página.';
  });

  function showActive(message) {
    settings.hidden = true;
    settings.open = false;
    activePanel.hidden = false;
    activeLabel.textContent = message;
  }
  function showSettings() {
    settings.hidden = false;
    settings.open = true;
    activePanel.hidden = true;
  }
  change.addEventListener('click', () => {
    showSettings();
    field.focus();
  });

  function activateFromField() {
    const typed = field.value.trim();
    // El campo se limpia al activar la clave. No confundimos ese campo vacío con una clave inválida.
    const candidate = typed || personalKey;
    if (!candidate) {
      status.textContent = 'No hay ninguna clave activada. Pega la clave de Gemini que usas en Sonora; al recargar la página debes introducirla otra vez.';
      return '';
    }
    if (!usableKey(candidate)) {
      status.textContent = 'La clave parece incompleta o contiene espacios. Pégala completa, sin la palabra Bearer.';
      return '';
    }
    if (typed) {
      personalKey = candidate;
      field.value = '';
      revision++;
      saveStoredKey();
    }
    return personalKey;
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const key = activateFromField();
    if (key) {
      status.textContent = 'Clave activada en esta página. La conexión todavía no se ha probado.';
      showActive('✓ Gemini activado (sin verificar). Ya puedes hablar con Snoopy.');
    }
  });

  modelField.addEventListener('change', () => {
    if (personalKey) saveStoredKey();
    status.textContent = personalKey
      ? 'Clave activada. Modelo seleccionado: ' + modelField.value + '. Pulsa «Probar conexión».'
      : 'Selecciona el modelo, pega tu clave y pulsa «Probar conexión».';
  });

  remove.addEventListener('click', () => {
    personalKey = '';
    revision++;
    field.value = '';
    remember.checked = false;
    removeStoredKey();
    status.textContent = 'Clave quitada de esta página y borrada del almacenamiento de este navegador.';
    showSettings();
  });

  test.addEventListener('click', async () => {
    // La prueba acepta directamente la clave recién pegada; no es obligatorio pulsar «Activar mi API».
    const key = activateFromField();
    if (!key) return;
    const model = modelField.value;
    const currentRevision = revision;
    test.disabled = true;
    status.textContent = 'Probando conexión real con ' + model + '…';
    try {
      const response = await fetch('/api/gemini/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalGeminiKey: key, personalGeminiModel: model }),
        signal: AbortSignal.timeout(35000),
        cache: 'no-store'
      });
      const result = await response.json().catch(() => ({}));
      if (currentRevision !== revision) return;
      status.textContent = response.ok && result.ok
        ? 'Conexión correcta ✓. Gemini funciona con ' + model + '. Puedes preguntarle a Snoopy.'
        : result.error || 'No se pudo completar la prueba (HTTP ' + response.status + ').';
      if (response.ok && result.ok) showActive('✓ Gemini conectado: ' + model + '. Puedes hablar con Snoopy.');
    } catch (error) {
      if (currentRevision !== revision) return;
      status.textContent = error && (error.name === 'TimeoutError' || error.name === 'AbortError')
        ? 'La prueba tardó demasiado. Comprueba que Render está activo.'
        : 'No se pudo contactar con el servidor de Snoopy. Revisa Render.';
    } finally {
      test.disabled = false;
    }
  });

  window.addEventListener('pagehide', () => { personalKey = ''; revision++; });
})();

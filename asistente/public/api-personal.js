/* API personal de Gemini: la clave permanece únicamente en memoria. */
(() => {
  'use strict';
  let personalKey = '';
  let revision = 0;
  const form = document.getElementById('api-key-form');
  const field = document.getElementById('personal-gemini-key');
  const modelField = document.getElementById('personal-gemini-model');
  const status = document.getElementById('api-key-status');
  const remove = document.getElementById('api-key-remove');
  const test = document.getElementById('api-key-test');
  const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
  const usableKey = value => typeof value === 'string' && value.length >= 8 && value.length <= 256 && /^[\x21-\x7e]+$/.test(value);
  window.getSnoopyPersonalGeminiKey = () => personalKey;
  window.getSnoopyPersonalGeminiModel = () => modelField ? modelField.value : DEFAULT_MODEL;
  if (!form || !field || !modelField || !status || !remove || !test) return;

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
    }
    return personalKey;
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const key = activateFromField();
    if (key) status.textContent = 'Clave activada en esta página ✓ (campo borrado por seguridad). Ahora pulsa «Probar conexión».';
  });

  modelField.addEventListener('change', () => {
    status.textContent = personalKey
      ? 'Clave activada. Modelo seleccionado: ' + modelField.value + '. Pulsa «Probar conexión».'
      : 'Selecciona el modelo, pega tu clave y pulsa «Probar conexión».';
  });

  remove.addEventListener('click', () => {
    personalKey = '';
    revision++;
    field.value = '';
    status.textContent = 'Clave quitada de esta página. No quedó guardada.';
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

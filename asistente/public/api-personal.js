/* API personal de Gemini: clave en memoria, nunca en localStorage ni en la URL. */
(() => {
  'use strict';
  let personalKey = '';
  const form = document.getElementById('api-key-form');
  const field = document.getElementById('personal-gemini-key');
  const modelField = document.getElementById('personal-gemini-model');
  const status = document.getElementById('api-key-status');
  const remove = document.getElementById('api-key-remove');
  const test = document.getElementById('api-key-test');
  const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
  window.getSnoopyPersonalGeminiKey = () => personalKey;
  window.getSnoopyPersonalGeminiModel = () => modelField ? modelField.value : DEFAULT_MODEL;
  if (!form || !field || !modelField || !status || !remove || !test) return;

  form.addEventListener('submit', event => {
    event.preventDefault();
    const value = field.value.trim();
    if (!/^[A-Za-z0-9_-]{20,256}$/.test(value)) {
      status.textContent = 'Clave con formato no válido. Comprueba que copiaste una clave de Gemini.';
      return;
    }
    personalKey = value;
    field.value = '';
    status.textContent = 'Clave activada en esta página. Pulsa «Probar conexión» para verificarla.';
  });

  modelField.addEventListener('change', () => {
    status.textContent = personalKey
      ? 'Modelo seleccionado: ' + modelField.value + '. Pulsa «Probar conexión».'
      : 'Selecciona el modelo, activa tu clave y prueba la conexión.';
  });

  remove.addEventListener('click', () => {
    personalKey = '';
    field.value = '';
    status.textContent = 'Clave quitada de esta página.';
  });

  test.addEventListener('click', async () => {
    if (!personalKey) {
      status.textContent = 'Primero activa tu clave de Gemini.';
      return;
    }
    const model = modelField.value;
    const key = personalKey;
    test.disabled = true;
    status.textContent = 'Probando conexión con ' + model + '…';
    try {
      const response = await fetch('/api/gemini/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalGeminiKey: key, personalGeminiModel: model }),
        signal: AbortSignal.timeout(35000),
        cache: 'no-store'
      });
      const result = await response.json().catch(() => ({}));
      if (personalKey !== key) return;
      status.textContent = response.ok && result.ok
        ? 'Conexión correcta con ' + model + '. Ya puedes preguntarle a Snoopy.'
        : result.error || 'No se pudo probar la conexión (HTTP ' + response.status + ').';
    } catch (error) {
      if (personalKey !== key) return;
      status.textContent = error && (error.name === 'TimeoutError' || error.name === 'AbortError')
        ? 'La prueba tardó demasiado. Revisa Render o inténtalo otra vez.'
        : 'No se pudo contactar con el servidor de Snoopy. Revisa Render.';
    } finally {
      test.disabled = false;
    }
  });
  window.addEventListener('pagehide', () => { personalKey = ''; });
})();

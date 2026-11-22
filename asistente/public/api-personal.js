/* API personal de Gemini — se conserva solo en memoria hasta recargar la página. */
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
    field.value = '';
    status.textContent = 'Clave preparada para este chat. Escribe una pregunta para comprobar la conexión a Gemini. No se guarda al recargar.';
  });
  remove.addEventListener('click', () => {
    personalKey = '';
    field.value = '';
    status.textContent = 'Se quitó la clave de esta página.';
  });
  window.addEventListener('pagehide', () => { personalKey = ''; });
})();

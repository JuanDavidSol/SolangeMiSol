
'use strict';

const cfg = require('./config');
const { db } = require('./store');

let cache = {
  at: 0,
  ok: false,
  reason: 'sin comprobar',
  model: ''
};

const model = () =>
  db.settings.ollamaModel || cfg.OLLAMA_MODEL;

async function status(force = false) {
  if (!force && Date.now() - cache.at < 10000) {
    return cache;
  }

  const want = model();

  try {
    const r = await fetch(
      cfg.OLLAMA_URL + '/api/tags',
      { signal: AbortSignal.timeout(3000) }
    );

    if (!r.ok) throw new Error('HTTP ' + r.status);

    const data = await r.json();
    const names = (data.models || []).map(m => m.name || m.model);

    const ok = names.some(name =>
      name === want || name.startsWith(want + ':')
    );

    cache = {
      at: Date.now(),
      ok,
      model: want,
      reason: ok ? '' : `Falta el modelo ${want}`
    };
  } catch (error) {
    cache = {
      at: Date.now(),
      ok: false,
      model: want,
      reason: 'Ollama no responde: ' + error.message
    };
  }

  return cache;
}

async function chat(messages) {
  const selectedModel = model();

  const response = await fetch(
    cfg.OLLAMA_URL + '/api/chat',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages,
        stream: false,
        keep_alive: '10m',
        think: false,
        options: {
          temperature: 0.3,
          num_predict: 350,

        }
      }),
      signal: AbortSignal.timeout(cfg.OLLAMA_TIMEOUT)
    }
  );

  if (!response.ok) {
    throw new Error('Ollama HTTP ' + response.status);
  }

  const data = await response.json();

  const answer = String(
    data.message?.content || ''
  ).trim();

  if (!answer) {
    throw new Error(
      'Ollama no generó una respuesta. Modelo: ' + selectedModel
    );
  }

  return answer;
}

module.exports = { status, chat };

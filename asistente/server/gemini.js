'use strict';

const cfg = require('./config');

/* Errores temporales de Gemini: vale la pena reintentar antes de pasar a Ollama */
const RETRY_STATUS = new Set([429, 503]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function status() {
  return {
    ok: Boolean(cfg.GEMINI_API_KEY),
    model: cfg.GEMINI_MODEL,
    reason: cfg.GEMINI_API_KEY ? '' : 'Falta configurar GEMINI_API_KEY'
  };
}

/* Espera antes del reintento: respeta "Retry-After" si es corto; si no, 0,8 s, 1,6 s… con algo de azar */
function waitFor(response, attempt) {
  const header = Number(response && response.headers.get('retry-after'));
  if (header > 0 && header <= 3) return header * 1000;
  return 800 * (attempt + 1) + Math.floor(Math.random() * 300);
}

async function post(url, body) {
  let lastError;

  for (let attempt = 0; attempt <= cfg.GEMINI_RETRIES; attempt++) {
    let response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': cfg.GEMINI_API_KEY
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(cfg.GEMINI_TIMEOUT)
      });
    } catch (error) {
      /* Un tiempo agotado no se reintenta (ya se esperó mucho); un fallo de red sí */
      if (error.name === 'TimeoutError' || attempt >= cfg.GEMINI_RETRIES) throw error;
      lastError = error;
      await sleep(waitFor(null, attempt));
      continue;
    }

    if (RETRY_STATUS.has(response.status) && attempt < cfg.GEMINI_RETRIES) {
      lastError = new Error(`Gemini HTTP ${response.status}`);
      await sleep(waitFor(response, attempt));
      continue;
    }

    return response;
  }

  throw lastError || new Error('Gemini no respondió');
}

async function chat(messages) {
  if (!cfg.GEMINI_API_KEY) {
    throw new Error('Gemini no tiene una API key configurada');
  }

  const systemMessage = messages.find(m => m.role === 'system');
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || '') }]
    }));

  const url =
    `${cfg.GEMINI_BASE_URL}/models/${encodeURIComponent(cfg.GEMINI_MODEL)}:generateContent`;

  const response = await post(url, {
    systemInstruction: systemMessage
      ? { parts: [{ text: systemMessage.content }] }
      : undefined,
    contents,
    generationConfig: {
      thinkingConfig: { thinkingLevel: 'low' },
      maxOutputTokens: 1500
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error?.message || `Gemini HTTP ${response.status}`
    );
  }

  const answer = (data.candidates?.[0]?.content?.parts || [])
    .map(part => part.text || '')
    .join('')
    .trim();

  if (!answer) {
    throw new Error('Gemini no devolvió una respuesta');
  }

  return answer;
}

/* ---------- Respuesta en tiempo real (streaming) ----------
   Igual que chat(), pero Gemini va enviando el texto por partes (SSE) y cada trozo se entrega a "onText" en cuanto llega.
   Los reintentos (429/503) solo ocurren ANTES de recibir el primer byte; una vez que empieza a llegar texto no se repite.
   Si la conexión se corta a mitad, el error lleva lo recibido hasta ese momento en "error.partial". */
function buildBody(messages) {
  const systemMessage = messages.find(m => m.role === 'system');

  return {
    systemInstruction: systemMessage
      ? { parts: [{ text: systemMessage.content }] }
      : undefined,
    contents: messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content || '') }]
      })),
    generationConfig: {
      thinkingConfig: { thinkingLevel: 'low' },
      maxOutputTokens: 1500
    }
  };
}

async function chatStream(messages, onText) {
  if (!cfg.GEMINI_API_KEY) {
    throw new Error('Gemini no tiene una API key configurada');
  }

  const url =
    `${cfg.GEMINI_BASE_URL}/models/${encodeURIComponent(cfg.GEMINI_MODEL)}:streamGenerateContent?alt=sse`;

  const response = await post(url, buildBody(messages));

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || `Gemini HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  /* Un evento SSE son una o más líneas "data: {...}" */
  const handle = block => {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;

      const raw = line.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;

      let data;
      try { data = JSON.parse(raw); } catch { continue; }

      if (data.error) throw new Error(data.error.message || 'Gemini devolvió un error');

      const text = (data.candidates?.[0]?.content?.parts || [])
        .map(part => part.text || '')
        .join('');

      if (text) {
        full += text;
        onText(text);
      }
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');

      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        handle(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) handle(buffer);
  } catch (error) {
    error.partial = full.trim();
    throw error;
  }

  full = full.trim();

  if (!full) {
    throw new Error('Gemini no devolvió una respuesta');
  }

  return full;
}

module.exports = { status, chat, chatStream };

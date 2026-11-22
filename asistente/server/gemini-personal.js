/* Respuestas con la API de Gemini que aporta el visitante.
   La clave no se guarda ni se incluye en errores o URLs.
   Node 18+ (fetch integrado). */
'use strict';
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
function validModel(model) {
  return typeof model === 'string' && /^gemini-[A-Za-z0-9._-]{3,65}$/.test(model);
}
const ENV_MODEL = process.env.GEMINI_PERSONAL_MODEL || '';
const FALLBACK_MODEL = validModel(ENV_MODEL) ? ENV_MODEL : DEFAULT_MODEL;

async function reply({ key, model, text, history = [], faqs = [], assistantName = 'Snoopy', onText }) {
  if (!/^[A-Za-z0-9_-]{20,256}$/.test(key || '')) {
    const e = new Error('Invalid personal Gemini key');
    e.publicMessage = 'La clave de Gemini no tiene un formato válido.';
    throw e;
  }
  const selectedModel = model || FALLBACK_MODEL;
  if (!validModel(selectedModel)) {
    const e = new Error('Invalid Gemini model');
    e.publicMessage = 'El modelo de Gemini no es válido.';
    throw e;
  }
  const faqBlock = Array.isArray(faqs) ? faqs.slice(0, 7).map(f => {
    const q = String(f.question || f.q || f.title || '').slice(0, 140);
    const a = String(f.answer || f.a || f.text || '').slice(0, 480);
    return q && a ? `Pregunta: ${q}\nRespuesta: ${a}` : '';
  }).filter(Boolean).join('\n\n').slice(0, 4200) : '';
  const system = `Eres ${String(assistantName || 'Snoopy').slice(0, 40)}, un asistente amable de una página de juegos. Responde preguntas generales en español de manera clara y útil, incluyendo matemáticas, tecnología y preguntas sobre juegos. No inventes reglas, premios, galletas ni datos de esta web; si no sabes un dato específico, dilo.\n` +
    (faqBlock ? `Estas son preguntas y respuestas públicas de la web, úsalas solo si son relevantes:\n${faqBlock}` : '');
  const contents = [];
  for (const turn of history.slice(-10)) {
    if (turn && (turn.r === 'u' || turn.r === 'a') && typeof turn.t === 'string') {
      contents.push({ role: turn.r === 'u' ? 'user' : 'model', parts: [{ text: turn.t.slice(0, 1200) }] });
    }
  }
  // Garantizar que cada diálogo comienza con una intervención de usuario.
  while (contents.length && contents[0].role !== 'user') contents.shift();
  contents.push({ role: 'user', parts: [{ text: String(text).slice(0, 1500) }] });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: 1400, ...(selectedModel.startsWith('gemini-3.') ? { thinkingConfig: { thinkingLevel: 'low' } } : {}) } }),
      signal: controller.signal,
      redirect: 'error'
    });
    if (!response.ok) {
      const error = new Error(`Gemini status ${response.status}`);
      const messages = {
        400: 'Gemini rechazó la solicitud (400). Comprueba el modelo seleccionado.',
        401: 'La clave de Gemini no es válida (401).',
        403: 'La clave no tiene permiso para usar Gemini o este modelo (403).',
        404: 'Gemini no encontró el modelo solicitado (404). Elige otro.',
        429: 'Has alcanzado el límite o la cuota de Gemini (429).',
        500: 'Gemini tuvo un error interno (500). Vuelve a intentarlo.',
        503: 'Gemini está temporalmente saturado (503). Inténtalo más tarde.'
      };
      error.publicMessage = messages[response.status] || `Gemini no pudo responder (HTTP ${response.status}).`;
      throw error;
    }
    const data = await response.json();
    const message = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    if (!message) { const e = new Error('Gemini empty reply'); e.publicMessage = 'Gemini no generó una respuesta. Prueba otra vez.'; throw e; }
    if (typeof onText === 'function') onText(message);
    return { reply: message, links: [], suggestions: [], source: 'gemini-personal' };
  } catch (error) {
    if (error && error.name === 'AbortError') {
      const e = new Error('Gemini request timeout'); e.publicMessage = 'Gemini tardó demasiado en responder.'; throw e;
    }
    if (error instanceof TypeError) {
      const e = new Error('Gemini network error');
      e.publicMessage = 'El servidor no pudo conectarse con Gemini. Revisa Render o inténtalo más tarde.';
      throw e;
    }
    throw error;
  } finally { clearTimeout(timeout); }
}
module.exports = { reply, validModel, DEFAULT_MODEL };

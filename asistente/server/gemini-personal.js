/* Respuestas con la API de Gemini que aporta el visitante.
   La clave no se guarda ni se incluye en errores o URLs.
   Node 18+ (fetch integrado). */
'use strict';
const MODEL_ENV = process.env.GEMINI_PERSONAL_MODEL || 'gemini-2.5-flash';
const MODEL = /^[A-Za-z0-9._-]{1,70}$/.test(MODEL_ENV) ? MODEL_ENV : 'gemini-2.5-flash';

async function reply({ key, text, history = [], faqs = [], assistantName = 'Snoopy', onText }) {
  if (!/^[A-Za-z0-9_-]{20,256}$/.test(key || '')) {
    const e = new Error('Invalid personal Gemini key');
    e.publicMessage = 'La clave de Gemini no tiene un formato válido.';
    throw e;
  }
  const faqBlock = Array.isArray(faqs) ? faqs.slice(0, 7).map(f => {
    const q = String(f.question || f.q || f.title || '').slice(0, 140);
    const a = String(f.answer || f.a || f.text || '').slice(0, 480);
    return q && a ? `Pregunta: ${q}\nRespuesta: ${a}` : '';
  }).filter(Boolean).join('\n\n').slice(0, 4200) : '';
  const system = `Eres ${String(assistantName || 'Snoopy').slice(0, 40)}, un asistente amable de una página de minijuegos de Snoopy. Responde en español de manera clara y breve. No inventes reglas, premios, galletas o información sobre la web; si no sabes un dato, dilo.\n` +
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
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: 1400 } }),
      signal: controller.signal,
      redirect: 'error'
    });
    if (!response.ok) {
      const error = new Error(`Gemini status ${response.status}`);
      error.publicMessage = response.status === 400 || response.status === 401 || response.status === 403
        ? 'Gemini rechazó la clave o no tiene acceso al modelo. Revisa tu API.'
        : response.status === 429 ? 'La API de Gemini alcanzó su límite. Inténtalo más tarde.'
        : 'Gemini no está disponible ahora. Prueba más tarde.';
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
    throw error;
  } finally { clearTimeout(timeout); }
}
module.exports = { reply };

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

function validKey(key) {
  // No suponemos el formato exacto que Google asigna a las claves: la API decide si es válida.
  // Solo bloqueamos valores vacíos, excesivamente largos o con caracteres no imprimibles.
  return typeof key === 'string' && key.length >= 8 && key.length <= 256 && /^[\x21-\x7e]+$/.test(key);
}

async function reply({ key, model, text, history = [], faqs = [], assistantName = 'Snoopy', onText, conciseVoice = false }) {
  if (!validKey(key)) {
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
  const system = `Eres ${String(assistantName || 'Snoopy').slice(0, 40)}, un asistente versátil y amable con la personalidad sutil de Snoopy: curioso, imaginativo, bondadoso y ligeramente travieso. Puedes aportar un toque de humor suave, o mencionar alguna siesta o aventura imaginaria cuando resulte oportuno, pero nunca fuerces esos guiños ni los repitas en todas las respuestas. Woodstock es tu pequeño amigo; no afirmes hablar realmente con él ni tener acceso a su reproductor. Prioriza la utilidad y el respeto por el tema: ante asuntos serios, responde sin bromas. Responde en español claro y natural sobre temas generales: juegos, tecnología, aprendizaje, matemáticas, ideas y preguntas cotidianas. A veces el mensaje llega por dictado de voz, con errores de transcripción o sin puntuación: interpreta la intención usando el contexto de la conversación, sin inventar detalles ni cambiar el sentido; si algo importante es ambiguo, pide una aclaración breve. Responde de manera conversacional, útil y no demasiado extensa para que también se pueda escuchar en voz alta. No inventes reglas, premios, galletas ni datos concretos de esta web. Si no sabes un dato, dilo.\n` +
    (faqBlock ? `Estas son preguntas y respuestas públicas de la web, úsalas solo si son relevantes:\n${faqBlock}` : '');
  const voiceSystem = conciseVoice ? system + '\nPara una conversación por voz de baja latencia, responde directamente. Para saludos o preguntas sencillas, usa una a tres frases breves sin introducciones repetitivas. Mantén toda la información necesaria para responder correctamente; cuando el usuario solicite detalle, código, explicación extensa o el tema requiera matices, conserva la extensión necesaria. No cortes una respuesta ni omitas información importante.' : system;
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
  const streaming=typeof onText==='function';
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:${streaming?'streamGenerateContent?alt=sse':'generateContent'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: voiceSystem }] }, contents, generationConfig: { maxOutputTokens: 1400, ...(selectedModel.startsWith('gemini-3.') ? { thinkingConfig: { thinkingLevel: 'low' } } : {}) } }),
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
    const extract=data=>(data.candidates?.[0]?.content?.parts||[]).filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('');
    let message='';
    if(streaming&&response.body&&response.headers.get('content-type')?.includes('text/event-stream')){
      const reader=response.body.getReader(),decoder=new TextDecoder();
      let buffer='',lines=[];
      function event(){
        if(!lines.length)return;
        const payload=lines.join('\n');lines=[];
        if(payload==='[DONE]')return;
        const data=JSON.parse(payload);
        if(data.error){const e=new Error('Gemini stream error');e.publicMessage='Gemini interrumpió la respuesta.';throw e;}
        const chunk=extract(data);
        if(chunk){message+=chunk;onText(chunk);}
      }
      function line(raw){const l=raw.replace(/\r$/,'');if(!l){event();return;}if(l.startsWith('data:'))lines.push(l.slice(5).replace(/^ /,''));}
      try{
        while(true){
          const {done,value}=await reader.read();
          if(done)break;
          buffer+=decoder.decode(value,{stream:true});
          let nl;while((nl=buffer.indexOf('\n'))>=0){line(buffer.slice(0,nl));buffer=buffer.slice(nl+1);}
        }
        buffer+=decoder.decode();if(buffer)line(buffer);event();
      }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    }else{
      const data=await response.json();
      message=extract(data);
      if(streaming&&message)onText(message);
    }
    message=message.trim();
    if (!message) { const e = new Error('Gemini empty reply'); e.publicMessage = 'Gemini no generó una respuesta. Prueba otra vez.'; throw e; }
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
module.exports = { reply, validKey, validModel, DEFAULT_MODEL };

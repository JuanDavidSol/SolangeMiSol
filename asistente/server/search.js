'use strict';
/* Búsqueda por palabras clave (BM25) con normalización para español: sin tildes, sin palabras vacías y con raíz simple.
   Además tolera errores de escritura ("galetas" → "galletas") y usa sinónimos que se editan desde el panel. */
const STOP = new Set('a al algo como con cual cuales cuando de del donde el ella ellos en eres es esa ese eso esta este esto estoy hay la las le les lo los me mi mis muy no nos o para pero por que se si sin sobre soy su sus te tu tus un una uno unos y ya yo quiero quisiera puedo puedes necesito saber dime hacer cuanto cuanta cuantos cuantas quien quienes dame cuentame hablame explicame muestrame tengo tiene tienen'.split(' '));
const ALIAS = { jug: 'jueg', partid: 'jueg', consig: 'conseg', gan: 'gan' };

const normalize = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
function stem(w) {
  if (w.length > 4) w = w.replace(/(mente|aciones|acion|ciones|cion|ando|iendo|ar|er|ir)$/, '');
  if (w.length > 3) w = w.replace(/(es|s)$/, '');
  if (w.length > 3) w = w.replace(/[aeiou]$/, '');
  return ALIAS[w] || w;
}
const tokens = s => normalize(s).split(' ').filter(w => w && (w.length > 1 || /\d/.test(w)) && !STOP.has(w)).map(stem);

/* ---------- Sinónimos ----------
   Texto con un grupo por línea: "consigo, obtengo, gano". Cualquier palabra del grupo encuentra a las demás. */
let SYN = new Map();
function setSynonyms(text) {
  SYN = new Map();
  for (const line of String(text || '').split('\n')) {
    const group = [...new Set(line.split(',').flatMap(w => tokens(w)))];
    if (group.length < 2) continue;
    for (const g of group) {
      const set = SYN.get(g) || new Set();
      for (const other of group) if (other !== g) set.add(other);
      SYN.set(g, set);
    }
  }
}

/* ---------- Errores de escritura ----------
   Distancia de edición (con letras cambiadas de sitio) contra el vocabulario de la base de conocimientos. */
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
function closest(index, t) {
  if (t.length < 4 || /\d/.test(t)) return null;
  const cache = index.fuzzy || (index.fuzzy = new Map());
  if (cache.has(t)) return cache.get(t);
  if (cache.size > 500) cache.clear();
  const max = t.length >= 8 ? 2 : 1;
  let best = null, bestDist = max + 1;
  for (const [word, count] of index.df) {
    const d = distance(t, word, max);
    if (d < bestDist || (d === bestDist && best && count > index.df.get(best))) { bestDist = d; best = word; }
  }
  const found = bestDist <= max ? best : null;
  cache.set(t, found);
  return found;
}

/* docs: [{ id, type, ref, fields: [[texto, peso], ...], weight }] */
function buildIndex(docs) {
  const df = new Map();
  const items = docs.map(doc => {
    const tf = new Map(); let len = 0;
    for (const [text, w] of doc.fields) for (const t of tokens(text)) { tf.set(t, (tf.get(t) || 0) + w); len += w; }
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    return { doc, tf, len };
  });
  const avg = items.reduce((a, i) => a + i.len, 0) / Math.max(1, items.length);
  return { items, df, N: items.length, avg: avg || 1 };
}

/* Devuelve resultados ordenados con "score" (BM25) y "coverage" (0-1: qué parte de la pregunta se encontró).
   "ctx" es la pregunta anterior: solo ayuda a elegir entre resultados (preguntas de seguimiento), no cuenta para la cobertura. */
function query(index, text, boost = () => 1, ctx = '') {
  const qt = [...new Set(tokens(text))];
  if (!qt.length || !index.N) return [];
  const ct = [...new Set(tokens(ctx))].filter(t => !qt.includes(t));
  const df = t => index.df.get(t) || 0;
  const idf = t => Math.log(1 + (index.N - df(t) + .5) / (df(t) + .5));

  /* Formas válidas de cada palabra: ella misma, sus sinónimos y, si no existe en la base, la palabra más parecida */
  const forms = new Map(qt.map(t => {
    const list = [t, ...(SYN.get(t) || [])];
    if (!list.some(x => df(x) > 0)) { const near = closest(index, t); if (near) list.push(near); }
    return [t, list];
  }));
  /* Peso de una palabra: el de la forma conocida más rara (una forma desconocida no puede pesar más que una conocida) */
  const weight = t => { const known = forms.get(t).filter(x => df(x) > 0); return known.length ? Math.min(...known.map(idf)) : idf(t); };

  const total = qt.reduce((a, t) => a + weight(t), 0);   // las palabras que no están en la base bajan la cobertura
  const k1 = 1.4, b = .75, out = [];
  for (const { doc, tf, len } of index.items) {
    let score = 0, matched = 0;
    const part = (w, f) => w * f * (k1 + 1) / (f + k1 * (1 - b + b * len / index.avg));
    for (const t of qt) {
      const f = Math.max(...forms.get(t).map(x => tf.get(x) || 0));
      if (f) { const w = weight(t); score += part(w, f); matched += w; }
    }
    if (!matched) continue;
    for (const t of ct) { const f = tf.get(t); if (f) score += part(idf(t), f) * .6; }
    out.push({ doc, score: score * (doc.weight || 1) * boost(doc), coverage: matched / total });
  }
  return out.sort((a, b) => b.score - a.score);
}

module.exports = { normalize, tokens, buildIndex, query, setSynonyms };

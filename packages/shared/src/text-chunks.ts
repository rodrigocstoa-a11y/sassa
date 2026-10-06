const SENTENCE_BOUNDARY = /(?<=[.!?…])\s+/;

/** Corta uma palavra gigante em pedaços de no máximo `max` caracteres, sem partir pares substitutos (emoji). */
function hardSplit(word: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const ch of word) {
    if (cur.length + ch.length > max) {
      out.push(cur);
      cur = '';
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** Junta `pieces` em blocos de até `max` caracteres usando `sep`; peças maiores que `max` são delegadas a `splitLarge`. */
function pack(pieces: string[], sep: string, max: number, splitLarge: (piece: string) => string[]): string[] {
  const out: string[] = [];
  let cur = '';
  const flush = () => {
    if (cur) out.push(cur);
    cur = '';
  };
  for (const piece of pieces) {
    if (piece.length > max) {
      flush();
      out.push(...splitLarge(piece));
    } else if (!cur) {
      cur = piece;
    } else if (cur.length + sep.length + piece.length <= max) {
      cur += sep + piece;
    } else {
      flush();
      cur = piece;
    }
  }
  flush();
  return out;
}

/**
 * Divide um roteiro em partes de no máximo `maxChars` caracteres, na ordem original.
 * Prefere cortar entre parágrafos, depois entre frases, depois entre palavras;
 * só corta no meio de uma palavra se ela sozinha exceder o limite.
 */
export function splitTextIntoChunks(text: string, maxChars: number): string[] {
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new RangeError('maxChars deve ser um inteiro positivo');
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const byWords = (sentence: string) =>
    pack(sentence.split(/\s+/).filter(Boolean), ' ', maxChars, (w) => hardSplit(w, maxChars));
  const bySentences = (paragraph: string) =>
    pack(paragraph.split(SENTENCE_BOUNDARY).filter(Boolean), ' ', maxChars, byWords);

  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return pack(paragraphs, '\n\n', maxChars, bySentences);
}

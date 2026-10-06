/** Velocidade média de narração usada só como ESTIMATIVA de duração. */
export const WORDS_PER_MINUTE = 150;

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function estimateNarrationMinutes(words: number): number {
  return words / WORDS_PER_MINUTE;
}

/** Minúsculas e sem acentos, para busca ("historia" encontra "História"). */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

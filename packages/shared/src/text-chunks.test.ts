import { describe, expect, it } from 'vitest';
import { splitTextIntoChunks } from './text-chunks';

const words = (s: string) => s.split(/\s+/).filter(Boolean);

describe('splitTextIntoChunks', () => {
  it('retorna vazio para texto vazio e uma parte para texto curto', () => {
    expect(splitTextIntoChunks('  \n ', 100)).toEqual([]);
    expect(splitTextIntoChunks('Olá mundo.', 100)).toEqual(['Olá mundo.']);
  });

  it('prefere cortar entre parágrafos', () => {
    const text = 'Primeiro parágrafo aqui.\n\nSegundo parágrafo aqui.\n\nTerceiro.';
    expect(splitTextIntoChunks(text, 30)).toEqual(['Primeiro parágrafo aqui.', 'Segundo parágrafo aqui.', 'Terceiro.']);
  });

  it('agrupa parágrafos pequenos até o limite', () => {
    expect(splitTextIntoChunks('a\n\nb\n\nc', 5)).toEqual(['a\n\nb', 'c']);
  });

  it('divide parágrafos grandes por frases', () => {
    const chunks = splitTextIntoChunks('Frase um. Frase dois! Frase três? Frase quatro.', 22);
    expect(chunks).toEqual(['Frase um. Frase dois!', 'Frase três?', 'Frase quatro.']);
  });

  it('divide frases enormes por palavras e palavras gigantes no limite', () => {
    expect(splitTextIntoChunks('um dois três quatro cinco', 10)).toEqual(['um dois', 'três', 'quatro', 'cinco']);
    expect(splitTextIntoChunks('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('não parte emojis ao meio', () => {
    const chunks = splitTextIntoChunks('😀😀😀😀', 4);
    expect(chunks).toEqual(['😀😀', '😀😀']);
  });

  it('normaliza quebras de linha do Windows', () => {
    expect(splitTextIntoChunks('a\r\n\r\nb', 100)).toEqual(['a\n\nb']);
  });

  it('rejeita limite inválido', () => {
    expect(() => splitTextIntoChunks('x', 0)).toThrow(RangeError);
    expect(() => splitTextIntoChunks('x', 1.5)).toThrow(RangeError);
  });

  it('propriedade: respeita o limite e preserva todas as palavras na ordem', () => {
    const base = 'Roma foi fundada, segundo a lenda, em 753 a.C. Dizem que Rômulo matou Remo! Será? Ninguém sabe… ';
    const text = Array.from({ length: 40 }, (_, i) => `${base}${i % 3 === 0 ? '\n\n' : ''}`).join('') + 'x'.repeat(75);
    for (const max of [10, 37, 80, 200, 1000]) {
      const chunks = splitTextIntoChunks(text, max);
      expect(chunks.every((c) => c.length > 0 && c.length <= max)).toBe(true);
      expect(words(chunks.join(' ')).join('')).toBe(words(text).join(''));
    }
  });
});

import { describe, expect, it } from 'vitest';
import { scriptInputSchema } from './script';
import { countWords, normalizeForSearch } from './text';

const base = { channelId: 'c1', title: 'Roma Antiga', language: 'pt-BR', topic: '', content: '', status: 'draft' };

describe('scriptInputSchema', () => {
  it('aceita rascunho vazio e preserva a formatação do conteúdo', () => {
    expect(scriptInputSchema.safeParse(base).success).toBe(true);
    const r = scriptInputSchema.safeParse({ ...base, content: '  linha 1\n\nlinha 2  ' });
    expect(r.success && r.data.content).toBe('  linha 1\n\nlinha 2  ');
  });
  it('não permite revisar nem aprovar roteiro vazio', () => {
    for (const status of ['in_review', 'approved']) {
      const r = scriptInputSchema.safeParse({ ...base, status, content: '   ' });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].path).toEqual(['content']);
    }
    expect(scriptInputSchema.safeParse({ ...base, status: 'approved', content: 'texto' }).success).toBe(true);
  });
  it('rejeita status e idioma inválidos', () => {
    expect(scriptInputSchema.safeParse({ ...base, status: 'x' }).success).toBe(false);
    expect(scriptInputSchema.safeParse({ ...base, language: 'xx' }).success).toBe(false);
  });
});

describe('text', () => {
  it('conta palavras', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('  um  dois\ntrês\t ')).toBe(3);
  });
  it('normaliza acentos para busca', () => {
    expect(normalizeForSearch('História Ção')).toBe('historia cao');
  });
});

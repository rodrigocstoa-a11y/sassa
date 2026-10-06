import { describe, expect, it } from 'vitest';
import { DEFAULT_CHANNEL_INPUT, channelInputSchema } from './channel';

const valid = { ...DEFAULT_CHANNEL_INPUT, name: 'Histórias Antigas', niche: 'História' };

describe('channelInputSchema', () => {
  it('aceita um canal válido e remove espaços', () => {
    const r = channelInputSchema.safeParse({ ...valid, name: '  Histórias Antigas  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('Histórias Antigas');
  });

  it('rejeita nome curto, idioma desconhecido e cor inválida', () => {
    expect(channelInputSchema.safeParse({ ...valid, name: 'a' }).success).toBe(false);
    expect(channelInputSchema.safeParse({ ...valid, language: 'xx' }).success).toBe(false);
    expect(channelInputSchema.safeParse({ ...valid, brandPrimaryColor: 'red' }).success).toBe(false);
  });

  it('aceita handle com ou sem @ e vazio', () => {
    expect(channelInputSchema.safeParse({ ...valid, youtubeHandle: '@meu.canal' }).success).toBe(true);
    expect(channelInputSchema.safeParse({ ...valid, youtubeHandle: '' }).success).toBe(true);
    expect(channelInputSchema.safeParse({ ...valid, youtubeHandle: 'a b' }).success).toBe(false);
  });
});

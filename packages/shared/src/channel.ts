import { z } from 'zod';
import { LANGUAGE_CODES } from './languages';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor no formato #RRGGBB');

export const channelInputSchema = z.object({
  name: z.string().trim().min(2, 'Informe ao menos 2 caracteres').max(80),
  language: z.enum(LANGUAGE_CODES, { message: 'Idioma inválido' }),
  niche: z.string().trim().min(2, 'Informe o nicho').max(80),
  description: z.string().trim().max(500),
  youtubeHandle: z
    .string()
    .trim()
    .max(60)
    .regex(/^@?[A-Za-z0-9._-]*$/, 'Handle inválido'),
  brandPrimaryColor: hexColor,
  brandAccentColor: hexColor,
  brandStyle: z.string().trim().max(300),
});

export type ChannelInput = z.infer<typeof channelInputSchema>;

export interface Channel extends ChannelInput {
  id: string;
  /** Preparado para multiusuário; hoje todo canal pertence ao usuário local. */
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_CHANNEL_INPUT: ChannelInput = {
  name: '',
  language: 'pt-BR',
  niche: '',
  description: '',
  youtubeHandle: '',
  brandPrimaryColor: '#7c5cff',
  brandAccentColor: '#22d3ee',
  brandStyle: '',
};

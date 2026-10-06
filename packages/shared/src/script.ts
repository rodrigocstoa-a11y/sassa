import { z } from 'zod';
import { LANGUAGE_CODES } from './languages';

export const SCRIPT_STATUSES = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'in_review', label: 'Em revisão' },
  { value: 'approved', label: 'Aprovado' },
] as const;

export type ScriptStatus = (typeof SCRIPT_STATUSES)[number]['value'];
export const SCRIPT_STATUS_VALUES = SCRIPT_STATUSES.map((s) => s.value) as [ScriptStatus, ...ScriptStatus[]];

export function scriptStatusLabel(status: string): string {
  return SCRIPT_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export const MAX_SCRIPT_CONTENT_LENGTH = 1_000_000;

export const scriptInputSchema = z
  .object({
    channelId: z.string().trim().min(1, 'Escolha um canal'),
    title: z.string().trim().min(2, 'Informe ao menos 2 caracteres').max(200),
    language: z.enum(LANGUAGE_CODES, { message: 'Idioma inválido' }),
    topic: z.string().trim().max(300),
    // Sem trim: preserva a formatação do texto colado.
    content: z.string().max(MAX_SCRIPT_CONTENT_LENGTH, 'Conteúdo acima do limite de 1.000.000 de caracteres'),
    status: z.enum(SCRIPT_STATUS_VALUES, { message: 'Status inválido' }),
  })
  .refine((s) => s.status === 'draft' || s.content.trim().length > 0, {
    path: ['content'],
    message: 'Só é possível enviar para revisão ou aprovar um roteiro com conteúdo',
  });

export type ScriptInput = z.infer<typeof scriptInputSchema>;

export interface Script extends ScriptInput {
  id: string;
  ownerId: string;
  /** Roteiro original, quando este for uma tradução. */
  sourceScriptId: string | null;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

export type ScriptSummary = Omit<Script, 'content'>;

export interface ScriptDetail extends Script {
  /** Preenchido quando este roteiro é uma tradução. */
  source: ScriptSummary | null;
  /** Traduções vinculadas (quando este roteiro é o original). */
  translations: ScriptSummary[];
  /** Tradução que não foi editada depois da última alteração do original. */
  outdated: boolean;
}

export interface ScriptList {
  items: ScriptSummary[];
  total: number;
}

export const scriptTranslationInputSchema = z.object({
  language: z.enum(LANGUAGE_CODES, { message: 'Idioma inválido' }),
});
export type ScriptTranslationInput = z.infer<typeof scriptTranslationInputSchema>;

/** Idiomas de tradução priorizados na interface. Qualquer idioma cadastrado é aceito. */
export const PRIORITY_TRANSLATION_LANGUAGES = ['es', 'it', 'pt-BR'] as const;

export const scriptListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  channelId: z.string().trim().min(1).optional(),
  status: z.enum(SCRIPT_STATUS_VALUES).optional(),
  language: z.enum(LANGUAGE_CODES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ScriptListQuery = z.infer<typeof scriptListQuerySchema>;

/** Pedido de geração automática. Contrato para o futuro provedor LLM; hoje não há provedor. */
export const scriptGenerationRequestSchema = z.object({
  channelId: z.string().trim().min(1),
  topic: z.string().trim().min(3).max(300),
  language: z.enum(LANGUAGE_CODES),
  targetMinutes: z.number().int().min(1).max(300),
  narrativeStyle: z.string().trim().max(200),
});
export type ScriptGenerationRequest = z.infer<typeof scriptGenerationRequestSchema>;

export interface ScriptGenerationStatus {
  available: boolean;
  provider: string | null;
  reason: string | null;
}

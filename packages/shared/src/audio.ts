import { z } from 'zod';
import { LANGUAGE_CODES } from './languages';

export const AUDIO_STATUSES = [
  { value: 'processing', label: 'Processando' },
  { value: 'completed', label: 'Concluído' },
  { value: 'error', label: 'Erro' },
] as const;
export type AudioStatus = (typeof AUDIO_STATUSES)[number]['value'];
export const AUDIO_STATUS_VALUES = AUDIO_STATUSES.map((s) => s.value) as [AudioStatus, ...AudioStatus[]];
export const audioStatusLabel = (s: string) => AUDIO_STATUSES.find((x) => x.value === s)?.label ?? s;

/** Como o áudio entrou na plataforma: arquivo importado pelo usuário ou gerado por um provedor TTS. */
export type AudioSource = 'upload' | 'provider';

export interface AudioSummary {
  id: string;
  ownerId: string;
  channelId: string;
  channelName: string;
  scriptId: string;
  scriptTitle: string;
  title: string;
  language: string;
  status: AudioStatus;
  source: AudioSource;
  providerId: string | null;
  voiceId: string | null;
  voiceName: string | null;
  settings: Record<string, string | number | boolean>;
  mimeType: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
  originalFilename: string | null;
  partsTotal: number;
  partsDone: number;
  errorMessage: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** O roteiro foi alterado depois da criação deste áudio. */
  scriptOutdated: boolean;
  /** Existe um arquivo reproduzível/baixável. */
  hasFile: boolean;
}

export interface AudioList {
  items: AudioSummary[];
  total: number;
}

export const audioListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  channelId: z.string().trim().min(1).optional(),
  scriptId: z.string().trim().min(1).optional(),
  language: z.enum(LANGUAGE_CODES).optional(),
  status: z.enum(AUDIO_STATUS_VALUES).optional(),
  approval: z.enum(['approved', 'pending']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AudioListQuery = z.infer<typeof audioListQuerySchema>;

export const audioUpdateSchema = z.object({
  title: z.string().trim().min(2, 'Informe ao menos 2 caracteres').max(200),
  approved: z.boolean(),
});
export type AudioUpdateInput = z.infer<typeof audioUpdateSchema>;

/** Metadados enviados na query da importação (o corpo da requisição é o arquivo de áudio). */
export const audioUploadQuerySchema = z.object({
  scriptId: z.string().trim().min(1, 'Escolha um roteiro'),
  title: z.string().trim().min(2, 'Informe ao menos 2 caracteres').max(200),
  filename: z.string().trim().max(255).optional(),
  durationMs: z.coerce.number().int().min(0).max(86_400_000).optional(),
});
export type AudioUploadQuery = z.infer<typeof audioUploadQuerySchema>;

export const narrationSettingsSchema = z.object({
  speed: z.number().min(0.5).max(2).default(1),
});
export type NarrationSettings = z.infer<typeof narrationSettingsSchema>;

export const audioGenerationRequestSchema = z.object({
  scriptId: z.string().trim().min(1, 'Escolha um roteiro'),
  voiceId: z.string().trim().min(1, 'Escolha uma voz'),
  title: z.string().trim().min(2).max(200).optional(),
  settings: narrationSettingsSchema.default({ speed: 1 }),
});
export type AudioGenerationRequest = z.infer<typeof audioGenerationRequestSchema>;

export interface AudioGenerationStatus {
  available: boolean;
  provider: { id: string; name: string; maxCharsPerRequest: number } | null;
  reason: string | null;
  /** O que falta para habilitar a narração automática. Vazio quando disponível. */
  requirements: string[];
}

export interface AudioVoicesResponse {
  available: boolean;
  voices: { id: string; name: string; language: string }[];
  reason: string | null;
}

/** Formatos de áudio aceitos na importação (validados pelos bytes iniciais do arquivo). */
export const AUDIO_FORMATS = [
  { ext: 'mp3', mime: 'audio/mpeg', label: 'MP3' },
  { ext: 'wav', mime: 'audio/wav', label: 'WAV' },
  { ext: 'ogg', mime: 'audio/ogg', label: 'OGG' },
  { ext: 'flac', mime: 'audio/flac', label: 'FLAC' },
  { ext: 'm4a', mime: 'audio/mp4', label: 'M4A/AAC' },
  { ext: 'webm', mime: 'audio/webm', label: 'WebM' },
] as const;
export type AudioFormatExt = (typeof AUDIO_FORMATS)[number]['ext'];

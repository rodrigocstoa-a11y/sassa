import type { AudioListQuery, AudioStatus, AudioSummary } from '@rrn/shared';

export interface AudioRecord extends AudioSummary {
  /** Chave interna no armazenamento; nunca é exposta pela API. */
  fileKey: string | null;
}

export interface NewAudio {
  channelId: string;
  scriptId: string;
  title: string;
  language: string;
  status: AudioStatus;
  source: 'upload' | 'provider';
  providerId?: string | null;
  voiceId?: string | null;
  voiceName?: string | null;
  settings?: Record<string, string | number | boolean>;
  fileKey?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationMs?: number | null;
  originalFilename?: string | null;
  partsTotal?: number;
}

export interface AudioPatch {
  title?: string;
  status?: AudioStatus;
  fileKey?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationMs?: number | null;
  partsDone?: number;
  errorMessage?: string | null;
  approvedAt?: string | null;
}

export interface AudioPart {
  idx: number;
  text: string;
  fileKey: string | null;
  mimeType: string | null;
  durationMs: number | null;
}

export type AudioFilters = Pick<AudioListQuery, 'channelId' | 'scriptId' | 'language' | 'status' | 'approval'>;

export abstract class AudiosRepository {
  abstract list(ownerId: string, filters: AudioFilters): AudioRecord[];
  abstract find(ownerId: string, id: string): AudioRecord | undefined;
  abstract create(ownerId: string, data: NewAudio): AudioRecord;
  abstract update(ownerId: string, id: string, patch: AudioPatch): AudioRecord | undefined;
  abstract remove(ownerId: string, id: string): boolean;
  abstract count(ownerId: string): number;
  abstract countByScript(ownerId: string, scriptId: string): number;
  abstract insertParts(audioId: string, texts: string[]): void;
  abstract listParts(audioId: string): AudioPart[];
  abstract updatePart(audioId: string, idx: number, patch: { fileKey: string; mimeType: string; durationMs: number | null }): void;
  /** Marca como erro tudo que ficou "processando" (o servidor reiniciou). Retorna quantos. */
  abstract failInterrupted(message: string): number;
}

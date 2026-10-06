/**
 * Contratos para provedores externos. Nenhum está implementado ainda:
 * cada integração real entra como um adaptador novo, sem alterar os módulos.
 */
export type ProviderKind = 'llm' | 'tts' | 'image';

export interface LlmProvider {
  readonly id: string;
  generateText(req: { system?: string; prompt: string; maxTokens?: number }): Promise<{ text: string }>;
}

export interface Voice {
  id: string;
  name: string;
  language: string;
}

export interface TtsSynthesisResult {
  /** Bytes do áudio da parte (a plataforma cuida do armazenamento). */
  data: Uint8Array;
  mimeType: string;
  durationMs?: number;
}

export interface TtsProvider {
  readonly id: string;
  readonly name: string;
  /** Limite de caracteres por requisição do provedor; define como o roteiro é dividido. */
  readonly maxCharsPerRequest: number;
  listVoices(language?: string): Promise<Voice[]>;
  synthesize(req: { text: string; voiceId: string; language: string; speed?: number }): Promise<TtsSynthesisResult>;
}

export interface ImageProvider {
  readonly id: string;
  generateImage(req: { prompt: string; width: number; height: number; seed?: number }): Promise<{ imagePath: string }>;
}

export interface ProviderSlot {
  kind: ProviderKind;
  label: string;
  configured: boolean;
  note: string;
}

export const PROVIDER_SLOTS: readonly Omit<ProviderSlot, 'configured'>[] = [
  { kind: 'llm', label: 'Geração de roteiros (LLM)', note: 'Interface pronta (Fase 2). Nenhum provedor conectado; a geração automática está desativada.' },
  { kind: 'tts', label: 'Narração (TTS)', note: 'Interface pronta (Fase 3). Nenhum provedor conectado; Talkify Labs aguarda a documentação da API.' },
  { kind: 'image', label: 'Geração de imagens', note: 'Fase 4. Opção local (ex.: Stable Diffusion) a avaliar para 6 GB de VRAM.' },
];

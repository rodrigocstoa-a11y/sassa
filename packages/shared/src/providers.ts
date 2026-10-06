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

export interface TtsProvider {
  readonly id: string;
  listVoices(language?: string): Promise<Voice[]>;
  synthesize(req: { text: string; voiceId: string; language: string }): Promise<{ audioPath: string; durationMs: number }>;
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
  { kind: 'llm', label: 'Geração de roteiros (LLM)', note: 'Fase 2. Provedor ainda não definido.' },
  { kind: 'tts', label: 'Narração (TTS)', note: 'Fase 3. Talkify Labs aguarda a documentação da API.' },
  { kind: 'image', label: 'Geração de imagens', note: 'Fase 4. Opção local (ex.: Stable Diffusion) a avaliar para 6 GB de VRAM.' },
];

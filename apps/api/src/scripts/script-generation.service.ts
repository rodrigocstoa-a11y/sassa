import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import type { LlmProvider, ScriptGenerationRequest, ScriptGenerationStatus } from '@rrn/shared';

/** Token de injeção do provedor LLM. Nenhum provedor está registrado nesta versão. */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export const LLM_NOT_CONFIGURED_MESSAGE =
  'Geração automática de roteiros não está configurada: nenhum provedor LLM foi conectado. Escreva ou cole o roteiro manualmente.';

@Injectable()
export class ScriptGenerationService {
  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider | null) {}

  status(): ScriptGenerationStatus {
    return this.llm
      ? { available: false, provider: this.llm.id, reason: 'Provedor registrado, mas a geração de roteiros ainda não foi implementada.' }
      : { available: false, provider: null, reason: LLM_NOT_CONFIGURED_MESSAGE };
  }

  /** Nunca simula geração: sem provedor, responde 501. */
  generate(_request: ScriptGenerationRequest): never {
    throw new NotImplementedException({ message: this.status().reason, code: 'LLM_NOT_CONFIGURED' });
  }
}

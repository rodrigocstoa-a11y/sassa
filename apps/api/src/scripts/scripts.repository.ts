import type { Script, ScriptInput, ScriptListQuery, ScriptSummary } from '@rrn/shared';

export interface ScriptWrite extends ScriptInput {
  wordCount: number;
  searchText: string;
  approvedAt: string | null;
}

/** Contrato de persistência de roteiros (implementação em PostgreSQL). */
export abstract class ScriptsRepository {
  abstract list(ownerId: string, query: ScriptListQuery): Promise<{ items: ScriptSummary[]; total: number }>;
  abstract find(ownerId: string, id: string): Promise<Script | undefined>;
  abstract translationsOf(ownerId: string, sourceId: string): Promise<ScriptSummary[]>;
  abstract create(ownerId: string, data: ScriptWrite & { sourceScriptId: string | null }): Promise<Script>;
  abstract update(ownerId: string, id: string, data: ScriptWrite): Promise<Script | undefined>;
  abstract remove(ownerId: string, id: string): Promise<boolean>;
  abstract countByChannel(ownerId: string, channelId: string): Promise<number>;
  abstract count(ownerId: string): Promise<number>;
  abstract countAudios(ownerId: string, scriptId: string): Promise<number>;
}

import type { Script, ScriptInput, ScriptListQuery, ScriptSummary } from '@rrn/shared';

export interface ScriptWrite extends ScriptInput {
  wordCount: number;
  searchText: string;
  approvedAt: string | null;
}

/** Contrato de persistência de roteiros (SQLite hoje; PostgreSQL no futuro). */
export abstract class ScriptsRepository {
  abstract list(ownerId: string, query: ScriptListQuery): { items: ScriptSummary[]; total: number };
  abstract find(ownerId: string, id: string): Script | undefined;
  abstract translationsOf(ownerId: string, sourceId: string): ScriptSummary[];
  abstract create(ownerId: string, data: ScriptWrite & { sourceScriptId: string | null }): Script;
  abstract update(ownerId: string, id: string, data: ScriptWrite): Script | undefined;
  abstract remove(ownerId: string, id: string): boolean;
  abstract countByChannel(ownerId: string, channelId: string): number;
  abstract count(ownerId: string): number;
}

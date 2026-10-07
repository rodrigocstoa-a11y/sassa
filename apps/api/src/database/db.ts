export interface DbResult<T> {
  rows: T[];
  /** Linhas afetadas (INSERT/UPDATE/DELETE) ou retornadas (SELECT). */
  count: number;
}

/**
 * Acesso ao PostgreSQL. Duas implementações: `PgDb` (servidor real, produção) e `PgliteDb`
 * (Postgres embutido em memória/arquivo, para desenvolvimento e testes sem Docker). SQL idêntico nas duas.
 */
export abstract class Db {
  abstract execute<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<DbResult<T>>;
  /** Executa vários comandos sem parâmetros (migrações). */
  abstract script(sql: string): Promise<void>;
  abstract transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  abstract close(): Promise<void>;
}

export const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
export const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));
export const num = (v: unknown): number => Number(v);
export const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

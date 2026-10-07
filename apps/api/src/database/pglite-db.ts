import { mkdirSync } from 'node:fs';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { Db, type DbResult } from './db';

type Runner = Pick<PGlite | Transaction, 'query' | 'exec'>;

export class PgliteDb extends Db {
  constructor(private readonly lite: PGlite, private readonly runner: Runner = lite, private readonly nested = false) {
    super();
  }

  /** `:memory:` usa memória; qualquer outro valor é uma pasta de dados persistente. */
  static async open(path: string): Promise<PgliteDb> {
    if (path !== ':memory:') mkdirSync(path, { recursive: true });
    const lite = await PGlite.create(path === ':memory:' ? undefined : path);
    return new PgliteDb(lite);
  }

  async execute<T>(sql: string, params: unknown[] = []): Promise<DbResult<T>> {
    const res = await this.runner.query<T>(sql, params as unknown[]);
    return { rows: res.rows, count: res.affectedRows ?? res.rows.length };
  }

  async script(sql: string) {
    await this.runner.exec(sql);
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    if (this.nested) return fn(this);
    return this.lite.transaction((tx) => fn(new PgliteDb(this.lite, tx, true)));
  }

  async close() {
    if (!this.nested) await this.lite.close();
  }
}

import { Pool, type PoolClient } from 'pg';
import { Db, type DbResult } from './db';

export class PgDb extends Db {
  constructor(private readonly pool: Pool, private readonly client?: PoolClient) {
    super();
  }

  static fromUrl(url: string): PgDb {
    const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
    return new PgDb(new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 10), ssl }));
  }

  private get q() {
    return this.client ?? this.pool;
  }

  async execute<T>(sql: string, params: unknown[] = []): Promise<DbResult<T>> {
    const res = await this.q.query(sql, params as unknown[]);
    return { rows: res.rows as T[], count: res.rowCount ?? res.rows.length };
  }

  async script(sql: string) {
    await this.q.query(sql);
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    if (this.client) return fn(this); // já dentro de uma transação
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(new PgDb(this.pool, client));
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async close() {
    if (!this.client) await this.pool.end();
  }
}

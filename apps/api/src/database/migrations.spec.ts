import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { PgDb } from './pg-db';
import { PgliteDb } from './pglite-db';
import { MIGRATIONS } from './migrations';
import { runMigrations } from './database.module';

const tables = async (db: { execute: PgliteDb['execute'] }) =>
  (await db.execute<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`)).rows.map((r) => r.table_name);

describe('Migrações', () => {
  it('aplicam todas as versões uma única vez e criam o esquema esperado (PGlite)', async () => {
    const db = await PgliteDb.open(':memory:');
    expect(await runMigrations(db)).toBe(MIGRATIONS.length);
    expect(await runMigrations(db)).toBe(0);
    expect(await tables(db)).toEqual(expect.arrayContaining(['channels', 'scripts', 'audios', 'audio_parts', 'users', 'sessions', 'jobs', 'budget_settings', 'cost_events', 'schema_migrations']));
    await db.close();
  });

  const admin = process.env.TEST_DATABASE_URL;
  (admin ? it : it.skip)('duas instâncias subindo ao mesmo tempo não conflitam (PostgreSQL real, lock consultivo)', async () => {
    const name = `rrn_m_${randomBytes(5).toString('hex')}`;
    const c = new Client({ connectionString: admin });
    await c.connect();
    await c.query(`CREATE DATABASE ${name}`);
    const url = new URL(admin!);
    url.pathname = `/${name}`;
    const a = PgDb.fromUrl(url.toString());
    const b = PgDb.fromUrl(url.toString());
    try {
      const [x, y] = await Promise.all([runMigrations(a), runMigrations(b)]);
      expect(x + y).toBe(MIGRATIONS.length); // cada migração aplicada exatamente uma vez
      expect((await tables(a)).length).toBeGreaterThan(8);
    } finally {
      await a.close();
      await b.close();
      await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await c.end();
    }
  });
});

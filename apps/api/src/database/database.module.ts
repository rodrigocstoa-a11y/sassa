import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { databasePath, databaseUrl } from '../config';
import { Db } from './db';
import { MIGRATIONS } from './migrations';
import { PgDb } from './pg-db';
import { PgliteDb } from './pglite-db';

const LOCK_KEY = 727_001; // lock consultivo das migrações

export async function runMigrations(db: Db, log?: Logger): Promise<number> {
  let applied = 0;
  await db.transaction(async (tx) => {
    // O lock vem ANTES de criar a tabela de controle: CREATE TABLE IF NOT EXISTS concorrente também colide no Postgres
    // (acontece quando a API e o worker sobem juntos em um banco novo).
    await tx.execute('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
    await tx.script('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const done = new Set((await tx.execute<{ version: number }>('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    for (let i = 0; i < MIGRATIONS.length; i++) {
      const version = i + 1;
      if (done.has(version)) continue;
      await tx.script(MIGRATIONS[i]);
      await tx.execute('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      log?.log(`Migração ${version} aplicada`);
      applied++;
    }
  });
  return applied;
}

export async function openDatabase(): Promise<Db> {
  const url = databaseUrl();
  const db = url ? PgDb.fromUrl(url) : await PgliteDb.open(databasePath());
  await runMigrations(db, new Logger('Database'));
  return db;
}

@Global()
@Module({ providers: [{ provide: Db, useFactory: openDatabase }], exports: [Db] })
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(Db) private readonly db: Db) {}
  async onApplicationShutdown() {
    await this.db.close();
  }
}

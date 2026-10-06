/**
 * Migrações versionadas e idempotentes (controladas por PRAGMA user_version).
 * Nunca edite uma migração já publicada: adicione uma nova ao final da lista.
 */
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE channels (
     id TEXT PRIMARY KEY,
     owner_id TEXT NOT NULL DEFAULT 'local',
     name TEXT NOT NULL,
     language TEXT NOT NULL,
     niche TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     youtube_handle TEXT NOT NULL DEFAULT '',
     brand_primary_color TEXT NOT NULL,
     brand_accent_color TEXT NOT NULL,
     brand_style TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE INDEX idx_channels_owner ON channels(owner_id);`,
];

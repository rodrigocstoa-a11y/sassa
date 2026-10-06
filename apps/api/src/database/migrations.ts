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
  `CREATE TABLE scripts (
     id TEXT PRIMARY KEY,
     owner_id TEXT NOT NULL DEFAULT 'local',
     channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE RESTRICT,
     source_script_id TEXT REFERENCES scripts(id) ON DELETE RESTRICT,
     title TEXT NOT NULL,
     language TEXT NOT NULL,
     topic TEXT NOT NULL DEFAULT '',
     content TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL CHECK (status IN ('draft', 'in_review', 'approved')),
     word_count INTEGER NOT NULL DEFAULT 0,
     search_text TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     approved_at TEXT
   );
   CREATE INDEX idx_scripts_owner_updated ON scripts(owner_id, updated_at);
   CREATE INDEX idx_scripts_channel ON scripts(channel_id);
   CREATE INDEX idx_scripts_source ON scripts(source_script_id);
   -- No máximo uma tradução por idioma para cada roteiro original.
   CREATE UNIQUE INDEX uq_scripts_translation ON scripts(source_script_id, language) WHERE source_script_id IS NOT NULL;`,
  `CREATE TABLE audios (
     id TEXT PRIMARY KEY,
     owner_id TEXT NOT NULL DEFAULT 'local',
     channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE RESTRICT,
     script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE RESTRICT,
     title TEXT NOT NULL,
     language TEXT NOT NULL,
     status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'error')),
     source TEXT NOT NULL CHECK (source IN ('upload', 'provider')),
     provider_id TEXT,
     voice_id TEXT,
     voice_name TEXT,
     settings_json TEXT NOT NULL DEFAULT '{}',
     file_key TEXT,
     mime_type TEXT,
     size_bytes INTEGER,
     duration_ms INTEGER,
     original_filename TEXT,
     parts_total INTEGER NOT NULL DEFAULT 0,
     parts_done INTEGER NOT NULL DEFAULT 0,
     error_message TEXT,
     approved_at TEXT,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE INDEX idx_audios_owner_updated ON audios(owner_id, updated_at);
   CREATE INDEX idx_audios_script ON audios(script_id);
   CREATE INDEX idx_audios_channel ON audios(channel_id);
   -- Partes de uma narração gerada por provedor (roteiros longos). O texto fica salvo para retomar de onde parou.
   CREATE TABLE audio_parts (
     audio_id TEXT NOT NULL REFERENCES audios(id) ON DELETE CASCADE,
     idx INTEGER NOT NULL,
     text TEXT NOT NULL,
     file_key TEXT,
     mime_type TEXT,
     duration_ms INTEGER,
     PRIMARY KEY (audio_id, idx)
   );`,
];

/**
 * Migrações versionadas (PostgreSQL). Nunca edite uma já publicada: adicione uma nova ao final.
 * O controle fica na tabela schema_migrations; um lock consultivo evita corrida entre instâncias.
 */
export const MIGRATIONS: readonly string[] = [
  // 1: canais, roteiros, áudios (equivalente às Fases 1 a 3, agora em Postgres)
  `CREATE TABLE channels (
     id TEXT PRIMARY KEY,
     seq BIGINT GENERATED ALWAYS AS IDENTITY,
     owner_id TEXT NOT NULL DEFAULT 'local',
     name TEXT NOT NULL,
     language TEXT NOT NULL,
     niche TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     youtube_handle TEXT NOT NULL DEFAULT '',
     brand_primary_color TEXT NOT NULL,
     brand_accent_color TEXT NOT NULL,
     brand_style TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL
   );
   CREATE INDEX idx_channels_owner ON channels(owner_id);

   CREATE TABLE scripts (
     id TEXT PRIMARY KEY,
     seq BIGINT GENERATED ALWAYS AS IDENTITY,
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
     created_at TIMESTAMPTZ NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL,
     approved_at TIMESTAMPTZ
   );
   CREATE INDEX idx_scripts_owner_updated ON scripts(owner_id, updated_at);
   CREATE INDEX idx_scripts_channel ON scripts(channel_id);
   CREATE INDEX idx_scripts_source ON scripts(source_script_id);
   CREATE UNIQUE INDEX uq_scripts_translation ON scripts(source_script_id, language) WHERE source_script_id IS NOT NULL;

   CREATE TABLE audios (
     id TEXT PRIMARY KEY,
     seq BIGINT GENERATED ALWAYS AS IDENTITY,
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
     settings JSONB NOT NULL DEFAULT '{}',
     file_key TEXT,
     mime_type TEXT,
     size_bytes BIGINT,
     duration_ms INTEGER,
     original_filename TEXT,
     parts_total INTEGER NOT NULL DEFAULT 0,
     parts_done INTEGER NOT NULL DEFAULT 0,
     error_message TEXT,
     approved_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL
   );
   CREATE INDEX idx_audios_owner_updated ON audios(owner_id, updated_at);
   CREATE INDEX idx_audios_script ON audios(script_id);
   CREATE INDEX idx_audios_channel ON audios(channel_id);

   CREATE TABLE audio_parts (
     audio_id TEXT NOT NULL REFERENCES audios(id) ON DELETE CASCADE,
     idx INTEGER NOT NULL,
     text TEXT NOT NULL,
     file_key TEXT,
     mime_type TEXT,
     duration_ms INTEGER,
     PRIMARY KEY (audio_id, idx)
   );`,

  // 2: usuários e sessões (login). Sem cadastro público: contas são criadas pelo administrador.
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
     created_at TIMESTAMPTZ NOT NULL,
     last_login_at TIMESTAMPTZ
   );
   CREATE UNIQUE INDEX uq_users_email ON users(lower(email));
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at TIMESTAMPTZ NOT NULL,
     expires_at TIMESTAMPTZ NOT NULL,
     last_used_at TIMESTAMPTZ NOT NULL
   );
   CREATE INDEX idx_sessions_user ON sessions(user_id);`,

  // 3: fila de trabalhos persistente (substitui processamento em memória)
  `CREATE TABLE jobs (
     id TEXT PRIMARY KEY,
     owner_id TEXT NOT NULL,
     type TEXT NOT NULL,
     payload JSONB NOT NULL DEFAULT '{}',
     status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
     priority INTEGER NOT NULL DEFAULT 0,
     attempts INTEGER NOT NULL DEFAULT 0,
     max_attempts INTEGER NOT NULL DEFAULT 3,
     run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     locked_by TEXT,
     locked_until TIMESTAMPTZ,
     cancel_requested BOOLEAN NOT NULL DEFAULT false,
     progress REAL NOT NULL DEFAULT 0,
     error TEXT,
     result JSONB,
     dedupe_key TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     finished_at TIMESTAMPTZ
   );
   CREATE INDEX idx_jobs_claim ON jobs(status, run_at, priority);
   CREATE INDEX idx_jobs_owner ON jobs(owner_id, created_at);
   -- No máximo um job ativo por chave (evita enfileirar o mesmo trabalho duas vezes).
   CREATE UNIQUE INDEX uq_jobs_dedupe ON jobs(dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running');`,

  // 4: orçamento e registro de custos (nenhum provedor pago é chamado sem limite e confirmação)
  `CREATE TABLE budget_settings (
     owner_id TEXT PRIMARY KEY,
     monthly_limit_usd NUMERIC(12, 4),
     updated_at TIMESTAMPTZ NOT NULL
   );
   CREATE TABLE cost_events (
     id TEXT PRIMARY KEY,
     owner_id TEXT NOT NULL,
     provider_kind TEXT NOT NULL CHECK (provider_kind IN ('llm', 'tts', 'image', 'render', 'storage', 'other')),
     provider_id TEXT NOT NULL,
     description TEXT NOT NULL,
     amount_usd NUMERIC(12, 6) NOT NULL CHECK (amount_usd >= 0),
     job_id TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX idx_cost_events_owner_month ON cost_events(owner_id, created_at);`,
];

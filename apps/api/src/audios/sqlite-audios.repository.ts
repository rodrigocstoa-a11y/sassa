import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { AudioSource, AudioStatus } from '@rrn/shared';
import { DATABASE } from '../database/database.module';
import { AudiosRepository, type AudioFilters, type AudioPart, type AudioPatch, type AudioRecord, type NewAudio } from './audios.repository';

interface Row {
  id: string;
  owner_id: string;
  channel_id: string;
  channel_name: string;
  script_id: string;
  script_title: string;
  script_updated_at: string;
  title: string;
  language: string;
  status: AudioStatus;
  source: AudioSource;
  provider_id: string | null;
  voice_id: string | null;
  voice_name: string | null;
  settings_json: string;
  file_key: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_ms: number | null;
  original_filename: string | null;
  parts_total: number;
  parts_done: number;
  error_message: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT = `SELECT a.*, c.name AS channel_name, s.title AS script_title, s.updated_at AS script_updated_at
  FROM audios a
  JOIN channels c ON c.id = a.channel_id
  JOIN scripts s ON s.id = a.script_id`;

const toRecord = (r: Row): AudioRecord => ({
  id: r.id,
  ownerId: r.owner_id,
  channelId: r.channel_id,
  channelName: r.channel_name,
  scriptId: r.script_id,
  scriptTitle: r.script_title,
  title: r.title,
  language: r.language,
  status: r.status,
  source: r.source,
  providerId: r.provider_id,
  voiceId: r.voice_id,
  voiceName: r.voice_name,
  settings: JSON.parse(r.settings_json),
  mimeType: r.mime_type,
  sizeBytes: r.size_bytes,
  durationMs: r.duration_ms,
  originalFilename: r.original_filename,
  partsTotal: r.parts_total,
  partsDone: r.parts_done,
  errorMessage: r.error_message,
  approvedAt: r.approved_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  scriptOutdated: r.script_updated_at > r.created_at,
  hasFile: r.status === 'completed' && r.file_key !== null,
  fileKey: r.file_key,
});

const PATCH_COLUMNS: Record<keyof AudioPatch, string> = {
  title: 'title',
  status: 'status',
  fileKey: 'file_key',
  mimeType: 'mime_type',
  sizeBytes: 'size_bytes',
  durationMs: 'duration_ms',
  partsDone: 'parts_done',
  errorMessage: 'error_message',
  approvedAt: 'approved_at',
};

@Injectable()
export class SqliteAudiosRepository extends AudiosRepository {
  constructor(@Inject(DATABASE) private readonly db: DatabaseSync) {
    super();
  }

  list(ownerId: string, f: AudioFilters) {
    const where = ['a.owner_id = ?'];
    const params: SQLInputValue[] = [ownerId];
    if (f.channelId) { where.push('a.channel_id = ?'); params.push(f.channelId); }
    if (f.scriptId) { where.push('a.script_id = ?'); params.push(f.scriptId); }
    if (f.language) { where.push('a.language = ?'); params.push(f.language); }
    if (f.status) { where.push('a.status = ?'); params.push(f.status); }
    if (f.approval === 'approved') where.push('a.approved_at IS NOT NULL');
    if (f.approval === 'pending') where.push('a.approved_at IS NULL');
    const rows = this.db
      .prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY a.updated_at DESC, a.rowid DESC`)
      .all(...params) as unknown as Row[];
    return rows.map(toRecord);
  }

  find(ownerId: string, id: string) {
    const row = this.db.prepare(`${SELECT} WHERE a.owner_id = ? AND a.id = ?`).get(ownerId, id) as unknown as Row | undefined;
    return row && toRecord(row);
  }

  create(ownerId: string, d: NewAudio) {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO audios (id, owner_id, channel_id, script_id, title, language, status, source, provider_id, voice_id,
           voice_name, settings_json, file_key, mime_type, size_bytes, duration_ms, original_filename, parts_total,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, ownerId, d.channelId, d.scriptId, d.title, d.language, d.status, d.source, d.providerId ?? null,
        d.voiceId ?? null, d.voiceName ?? null, JSON.stringify(d.settings ?? {}), d.fileKey ?? null, d.mimeType ?? null,
        d.sizeBytes ?? null, d.durationMs ?? null, d.originalFilename ?? null, d.partsTotal ?? 0, now, now);
    return this.find(ownerId, id)!;
  }

  update(ownerId: string, id: string, patch: AudioPatch) {
    const keys = (Object.keys(patch) as (keyof AudioPatch)[]).filter((k) => k in PATCH_COLUMNS && patch[k] !== undefined);
    const sets = [...keys.map((k) => `${PATCH_COLUMNS[k]} = ?`), 'updated_at = ?'];
    const values = [...keys.map((k) => patch[k] as SQLInputValue), new Date().toISOString()];
    const res = this.db.prepare(`UPDATE audios SET ${sets.join(', ')} WHERE owner_id = ? AND id = ?`).run(...values, ownerId, id);
    return res.changes ? this.find(ownerId, id) : undefined;
  }

  remove(ownerId: string, id: string) {
    return this.db.prepare('DELETE FROM audios WHERE owner_id = ? AND id = ?').run(ownerId, id).changes > 0;
  }

  count(ownerId: string) {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM audios WHERE owner_id = ?').get(ownerId) as { n: number }).n;
  }

  countByScript(ownerId: string, scriptId: string) {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM audios WHERE owner_id = ? AND script_id = ?').get(ownerId, scriptId) as { n: number }).n;
  }

  insertParts(audioId: string, texts: string[]) {
    const stmt = this.db.prepare('INSERT INTO audio_parts (audio_id, idx, text) VALUES (?, ?, ?)');
    this.db.exec('BEGIN');
    try {
      texts.forEach((t, i) => stmt.run(audioId, i, t));
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  listParts(audioId: string): AudioPart[] {
    const rows = this.db
      .prepare('SELECT idx, text, file_key, mime_type, duration_ms FROM audio_parts WHERE audio_id = ? ORDER BY idx')
      .all(audioId) as unknown as { idx: number; text: string; file_key: string | null; mime_type: string | null; duration_ms: number | null }[];
    return rows.map((r) => ({ idx: r.idx, text: r.text, fileKey: r.file_key, mimeType: r.mime_type, durationMs: r.duration_ms }));
  }

  updatePart(audioId: string, idx: number, p: { fileKey: string; mimeType: string; durationMs: number | null }) {
    this.db
      .prepare('UPDATE audio_parts SET file_key = ?, mime_type = ?, duration_ms = ? WHERE audio_id = ? AND idx = ?')
      .run(p.fileKey, p.mimeType, p.durationMs, audioId, idx);
  }

  failInterrupted(message: string) {
    return this.db
      .prepare("UPDATE audios SET status = 'error', error_message = ?, updated_at = ? WHERE status = 'processing'")
      .run(message, new Date().toISOString()).changes as number;
  }
}

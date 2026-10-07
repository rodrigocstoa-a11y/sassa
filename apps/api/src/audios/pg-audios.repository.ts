import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AudioSource, AudioStatus } from '@rrn/shared';
import { Db, iso, isoOrNull, num, numOrNull } from '../database/db';
import { AudiosRepository, type AudioFilters, type AudioPart, type AudioPatch, type AudioRecord, type NewAudio } from './audios.repository';

interface Row {
  id: string;
  owner_id: string;
  channel_id: string;
  channel_name: string;
  script_id: string;
  script_title: string;
  script_outdated: boolean;
  title: string;
  language: string;
  status: AudioStatus;
  source: AudioSource;
  provider_id: string | null;
  voice_id: string | null;
  voice_name: string | null;
  settings: Record<string, string | number | boolean>;
  file_key: string | null;
  mime_type: string | null;
  size_bytes: string | number | null;
  duration_ms: number | null;
  original_filename: string | null;
  parts_total: number;
  parts_done: number;
  error_message: string | null;
  approved_at: unknown;
  created_at: unknown;
  updated_at: unknown;
}

const SELECT = `SELECT a.*, c.name AS channel_name, s.title AS script_title, (s.updated_at > a.created_at) AS script_outdated
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
  settings: r.settings,
  mimeType: r.mime_type,
  sizeBytes: numOrNull(r.size_bytes),
  durationMs: r.duration_ms,
  originalFilename: r.original_filename,
  partsTotal: r.parts_total,
  partsDone: r.parts_done,
  errorMessage: r.error_message,
  approvedAt: isoOrNull(r.approved_at),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
  scriptOutdated: r.script_outdated,
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
export class PgAudiosRepository extends AudiosRepository {
  constructor(private readonly db: Db) {
    super();
  }

  async list(ownerId: string, f: AudioFilters) {
    const params: unknown[] = [ownerId];
    const where = ['a.owner_id = $1'];
    const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    if (f.channelId) add('a.channel_id = ?', f.channelId);
    if (f.scriptId) add('a.script_id = ?', f.scriptId);
    if (f.language) add('a.language = ?', f.language);
    if (f.status) add('a.status = ?', f.status);
    if (f.approval === 'approved') where.push('a.approved_at IS NOT NULL');
    if (f.approval === 'pending') where.push('a.approved_at IS NULL');
    const { rows } = await this.db.execute<Row>(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY a.updated_at DESC, a.seq DESC`, params);
    return rows.map(toRecord);
  }

  async find(ownerId: string, id: string) {
    const { rows } = await this.db.execute<Row>(`${SELECT} WHERE a.owner_id = $1 AND a.id = $2`, [ownerId, id]);
    return rows[0] && toRecord(rows[0]);
  }

  async findByFileKey(ownerId: string, fileKey: string) {
    const { rows } = await this.db.execute<Row>(`${SELECT} WHERE a.owner_id = $1 AND a.file_key = $2`, [ownerId, fileKey]);
    return rows[0] && toRecord(rows[0]);
  }

  async create(ownerId: string, d: NewAudio) {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO audios (id, owner_id, channel_id, script_id, title, language, status, source, provider_id, voice_id,
         voice_name, settings, file_key, mime_type, size_bytes, duration_ms, original_filename, parts_total, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now(), now())`,
      [id, ownerId, d.channelId, d.scriptId, d.title, d.language, d.status, d.source, d.providerId ?? null, d.voiceId ?? null,
        d.voiceName ?? null, JSON.stringify(d.settings ?? {}), d.fileKey ?? null, d.mimeType ?? null, d.sizeBytes ?? null,
        d.durationMs ?? null, d.originalFilename ?? null, d.partsTotal ?? 0],
    );
    return (await this.find(ownerId, id))!;
  }

  async update(ownerId: string, id: string, patch: AudioPatch) {
    const keys = (Object.keys(patch) as (keyof AudioPatch)[]).filter((k) => k in PATCH_COLUMNS && patch[k] !== undefined);
    const params: unknown[] = [ownerId, id];
    const sets = keys.map((k) => { params.push(patch[k]); return `${PATCH_COLUMNS[k]} = $${params.length}`; });
    const { count } = await this.db.execute(`UPDATE audios SET ${[...sets, 'updated_at = now()'].join(', ')} WHERE owner_id = $1 AND id = $2`, params);
    return count ? this.find(ownerId, id) : undefined;
  }

  async remove(ownerId: string, id: string) {
    return (await this.db.execute('DELETE FROM audios WHERE owner_id = $1 AND id = $2', [ownerId, id])).count > 0;
  }

  async count(ownerId: string) {
    return num((await this.db.execute<{ n: string }>('SELECT COUNT(*) AS n FROM audios WHERE owner_id = $1', [ownerId])).rows[0].n);
  }

  async insertParts(audioId: string, texts: string[]) {
    await this.db.transaction(async (tx) => {
      for (let i = 0; i < texts.length; i++) {
        await tx.execute('INSERT INTO audio_parts (audio_id, idx, text) VALUES ($1, $2, $3)', [audioId, i, texts[i]]);
      }
    });
  }

  async listParts(audioId: string): Promise<AudioPart[]> {
    const { rows } = await this.db.execute<{ idx: number; text: string; file_key: string | null; mime_type: string | null; duration_ms: number | null }>(
      'SELECT idx, text, file_key, mime_type, duration_ms FROM audio_parts WHERE audio_id = $1 ORDER BY idx',
      [audioId],
    );
    return rows.map((r) => ({ idx: r.idx, text: r.text, fileKey: r.file_key, mimeType: r.mime_type, durationMs: r.duration_ms }));
  }

  async updatePart(audioId: string, idx: number, p: { fileKey: string; mimeType: string; durationMs: number | null }) {
    await this.db.execute('UPDATE audio_parts SET file_key = $3, mime_type = $4, duration_ms = $5 WHERE audio_id = $1 AND idx = $2', [audioId, idx, p.fileKey, p.mimeType, p.durationMs]);
  }

  async failOrphaned(message: string) {
    return (
      await this.db.execute(
        `UPDATE audios SET status = 'error', error_message = $1, updated_at = now()
         WHERE status = 'processing' AND NOT EXISTS (
           SELECT 1 FROM jobs j WHERE j.dedupe_key = 'audio:' || audios.id AND j.status IN ('queued', 'running'))`,
        [message],
      )
    ).count;
  }
}

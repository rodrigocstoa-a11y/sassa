import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { normalizeForSearch, type Script, type ScriptListQuery, type ScriptSummary } from '@rrn/shared';
import { Db, iso, isoOrNull, num } from '../database/db';
import { ScriptsRepository, type ScriptWrite } from './scripts.repository';

interface Row {
  id: string;
  owner_id: string;
  channel_id: string;
  source_script_id: string | null;
  title: string;
  language: Script['language'];
  topic: string;
  content?: string;
  status: Script['status'];
  word_count: number;
  created_at: unknown;
  updated_at: unknown;
  approved_at: unknown;
}

const SUMMARY_COLS = 'id, owner_id, channel_id, source_script_id, title, language, topic, status, word_count, created_at, updated_at, approved_at';
const FULL_COLS = SUMMARY_COLS.replace('topic,', 'topic, content,');

const toSummary = (r: Row): ScriptSummary => ({
  id: r.id,
  ownerId: r.owner_id,
  channelId: r.channel_id,
  sourceScriptId: r.source_script_id,
  title: r.title,
  language: r.language,
  topic: r.topic,
  status: r.status,
  wordCount: r.word_count,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
  approvedAt: isoOrNull(r.approved_at),
});
const toScript = (r: Row): Script => ({ ...toSummary(r), content: r.content ?? '' });

@Injectable()
export class PgScriptsRepository extends ScriptsRepository {
  constructor(private readonly db: Db) {
    super();
  }

  async list(ownerId: string, q: ScriptListQuery) {
    const params: unknown[] = [ownerId];
    const where = ['owner_id = $1'];
    const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    if (q.channelId) add('channel_id = ?', q.channelId);
    if (q.status) add('status = ?', q.status);
    if (q.language) add('language = ?', q.language);
    // Cada termo precisa aparecer em título, tema ou conteúdo (sem diferenciar acentos/caixa).
    for (const term of normalizeForSearch(q.q ?? '').split(/\s+/).filter(Boolean)) {
      add("search_text LIKE ? ESCAPE '\\'", `%${term.replace(/[\\%_]/g, '\\$&')}%`);
    }
    const clause = where.join(' AND ');
    const total = num((await this.db.execute<{ n: string }>(`SELECT COUNT(*) AS n FROM scripts WHERE ${clause}`, params)).rows[0].n);
    const { rows } = await this.db.execute<Row>(
      `SELECT ${SUMMARY_COLS} FROM scripts WHERE ${clause} ORDER BY updated_at DESC, seq DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.limit, q.offset],
    );
    return { items: rows.map(toSummary), total };
  }

  async find(ownerId: string, id: string) {
    const { rows } = await this.db.execute<Row>(`SELECT ${FULL_COLS} FROM scripts WHERE owner_id = $1 AND id = $2`, [ownerId, id]);
    return rows[0] && toScript(rows[0]);
  }

  async translationsOf(ownerId: string, sourceId: string) {
    const { rows } = await this.db.execute<Row>(
      `SELECT ${SUMMARY_COLS} FROM scripts WHERE owner_id = $1 AND source_script_id = $2 ORDER BY language`,
      [ownerId, sourceId],
    );
    return rows.map(toSummary);
  }

  async create(ownerId: string, d: ScriptWrite & { sourceScriptId: string | null }) {
    const { rows } = await this.db.execute<Row>(
      `INSERT INTO scripts (id, owner_id, channel_id, source_script_id, title, language, topic, content, status,
         word_count, search_text, created_at, updated_at, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now(), $12) RETURNING ${FULL_COLS}`,
      [randomUUID(), ownerId, d.channelId, d.sourceScriptId, d.title, d.language, d.topic, d.content, d.status, d.wordCount, d.searchText, d.approvedAt],
    );
    return toScript(rows[0]);
  }

  async update(ownerId: string, id: string, d: ScriptWrite) {
    const { rows } = await this.db.execute<Row>(
      `UPDATE scripts SET channel_id = $3, title = $4, language = $5, topic = $6, content = $7, status = $8,
         word_count = $9, search_text = $10, updated_at = now(), approved_at = $11
       WHERE owner_id = $1 AND id = $2 RETURNING ${FULL_COLS}`,
      [ownerId, id, d.channelId, d.title, d.language, d.topic, d.content, d.status, d.wordCount, d.searchText, d.approvedAt],
    );
    return rows[0] && toScript(rows[0]);
  }

  async remove(ownerId: string, id: string) {
    return (await this.db.execute('DELETE FROM scripts WHERE owner_id = $1 AND id = $2', [ownerId, id])).count > 0;
  }

  async countByChannel(ownerId: string, channelId: string) {
    return num((await this.db.execute<{ n: string }>('SELECT COUNT(*) AS n FROM scripts WHERE owner_id = $1 AND channel_id = $2', [ownerId, channelId])).rows[0].n);
  }

  async count(ownerId: string) {
    return num((await this.db.execute<{ n: string }>('SELECT COUNT(*) AS n FROM scripts WHERE owner_id = $1', [ownerId])).rows[0].n);
  }

  async countAudios(ownerId: string, scriptId: string) {
    return num((await this.db.execute<{ n: string }>('SELECT COUNT(*) AS n FROM audios WHERE owner_id = $1 AND script_id = $2', [ownerId, scriptId])).rows[0].n);
  }
}

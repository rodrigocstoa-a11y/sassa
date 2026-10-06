import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { normalizeForSearch, type Script, type ScriptListQuery, type ScriptSummary } from '@rrn/shared';
import { DATABASE } from '../database/database.module';
import { ScriptsRepository, type ScriptWrite } from './scripts.repository';

interface Row {
  id: string;
  owner_id: string;
  channel_id: string;
  source_script_id: string | null;
  title: string;
  language: Script['language'];
  topic: string;
  content: string;
  status: Script['status'];
  word_count: number;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
}

const SUMMARY_COLS =
  'id, owner_id, channel_id, source_script_id, title, language, topic, status, word_count, created_at, updated_at, approved_at';
const FULL_COLS = SUMMARY_COLS.replace('topic,', 'topic, content,');

const toSummary = (r: Omit<Row, 'content'>): ScriptSummary => ({
  id: r.id,
  ownerId: r.owner_id,
  channelId: r.channel_id,
  sourceScriptId: r.source_script_id,
  title: r.title,
  language: r.language,
  topic: r.topic,
  status: r.status,
  wordCount: r.word_count,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  approvedAt: r.approved_at,
});
const toScript = (r: Row): Script => ({ ...toSummary(r), content: r.content });

@Injectable()
export class SqliteScriptsRepository extends ScriptsRepository {
  constructor(@Inject(DATABASE) private readonly db: DatabaseSync) {
    super();
  }

  list(ownerId: string, q: ScriptListQuery) {
    const where = ['owner_id = ?'];
    const params: SQLInputValue[] = [ownerId];
    if (q.channelId) { where.push('channel_id = ?'); params.push(q.channelId); }
    if (q.status) { where.push('status = ?'); params.push(q.status); }
    if (q.language) { where.push('language = ?'); params.push(q.language); }
    // Cada termo precisa aparecer em título, tema ou conteúdo (sem diferenciar acentos/caixa).
    for (const term of normalizeForSearch(q.q ?? '').split(/\s+/).filter(Boolean)) {
      where.push("search_text LIKE ? ESCAPE '\\'");
      params.push(`%${term.replace(/[\\%_]/g, '\\$&')}%`);
    }
    const clause = where.join(' AND ');
    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM scripts WHERE ${clause}`).get(...params) as { n: number }).n;
    const rows = this.db
      .prepare(`SELECT ${SUMMARY_COLS} FROM scripts WHERE ${clause} ORDER BY updated_at DESC, rowid DESC LIMIT ? OFFSET ?`)
      .all(...params, q.limit, q.offset) as unknown as Omit<Row, 'content'>[];
    return { items: rows.map(toSummary), total };
  }

  find(ownerId: string, id: string) {
    const row = this.db
      .prepare(`SELECT ${FULL_COLS} FROM scripts WHERE owner_id = ? AND id = ?`)
      .get(ownerId, id) as unknown as Row | undefined;
    return row && toScript(row);
  }

  translationsOf(ownerId: string, sourceId: string) {
    const rows = this.db
      .prepare(`SELECT ${SUMMARY_COLS} FROM scripts WHERE owner_id = ? AND source_script_id = ? ORDER BY language`)
      .all(ownerId, sourceId) as unknown as Omit<Row, 'content'>[];
    return rows.map(toSummary);
  }

  create(ownerId: string, d: ScriptWrite & { sourceScriptId: string | null }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO scripts (id, owner_id, channel_id, source_script_id, title, language, topic, content, status,
           word_count, search_text, created_at, updated_at, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, ownerId, d.channelId, d.sourceScriptId, d.title, d.language, d.topic, d.content, d.status,
        d.wordCount, d.searchText, now, now, d.approvedAt);
    return this.find(ownerId, id)!;
  }

  update(ownerId: string, id: string, d: ScriptWrite) {
    const res = this.db
      .prepare(
        `UPDATE scripts SET channel_id = ?, title = ?, language = ?, topic = ?, content = ?, status = ?,
           word_count = ?, search_text = ?, updated_at = ?, approved_at = ?
         WHERE owner_id = ? AND id = ?`,
      )
      .run(d.channelId, d.title, d.language, d.topic, d.content, d.status, d.wordCount, d.searchText,
        new Date().toISOString(), d.approvedAt, ownerId, id);
    return res.changes ? this.find(ownerId, id) : undefined;
  }

  remove(ownerId: string, id: string) {
    return this.db.prepare('DELETE FROM scripts WHERE owner_id = ? AND id = ?').run(ownerId, id).changes > 0;
  }

  countByChannel(ownerId: string, channelId: string) {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM scripts WHERE owner_id = ? AND channel_id = ?').get(ownerId, channelId) as { n: number }).n;
  }

  count(ownerId: string) {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM scripts WHERE owner_id = ?').get(ownerId) as { n: number }).n;
  }
}

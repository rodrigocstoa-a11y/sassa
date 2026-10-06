import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Channel, ChannelInput } from '@rrn/shared';
import { DATABASE } from '../database/database.module';
import { ChannelsRepository } from './channels.repository';

interface Row {
  id: string;
  owner_id: string;
  name: string;
  language: Channel['language'];
  niche: string;
  description: string;
  youtube_handle: string;
  brand_primary_color: string;
  brand_accent_color: string;
  brand_style: string;
  created_at: string;
  updated_at: string;
}

const toChannel = (r: Row): Channel => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  language: r.language,
  niche: r.niche,
  description: r.description,
  youtubeHandle: r.youtube_handle,
  brandPrimaryColor: r.brand_primary_color,
  brandAccentColor: r.brand_accent_color,
  brandStyle: r.brand_style,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

@Injectable()
export class SqliteChannelsRepository extends ChannelsRepository {
  constructor(@Inject(DATABASE) private readonly db: DatabaseSync) {
    super();
  }

  list(ownerId: string): Channel[] {
    const rows = this.db
      .prepare('SELECT * FROM channels WHERE owner_id = ? ORDER BY created_at DESC, rowid DESC')
      .all(ownerId) as unknown as Row[];
    return rows.map(toChannel);
  }

  find(ownerId: string, id: string): Channel | undefined {
    const row = this.db
      .prepare('SELECT * FROM channels WHERE owner_id = ? AND id = ?')
      .get(ownerId, id) as unknown as Row | undefined;
    return row && toChannel(row);
  }

  create(ownerId: string, i: ChannelInput): Channel {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO channels (id, owner_id, name, language, niche, description, youtube_handle,
           brand_primary_color, brand_accent_color, brand_style, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, ownerId, i.name, i.language, i.niche, i.description, i.youtubeHandle,
        i.brandPrimaryColor, i.brandAccentColor, i.brandStyle, now, now);
    return this.find(ownerId, id)!;
  }

  update(ownerId: string, id: string, i: ChannelInput): Channel | undefined {
    const res = this.db
      .prepare(
        `UPDATE channels SET name = ?, language = ?, niche = ?, description = ?, youtube_handle = ?,
           brand_primary_color = ?, brand_accent_color = ?, brand_style = ?, updated_at = ?
         WHERE owner_id = ? AND id = ?`,
      )
      .run(i.name, i.language, i.niche, i.description, i.youtubeHandle,
        i.brandPrimaryColor, i.brandAccentColor, i.brandStyle, new Date().toISOString(), ownerId, id);
    return res.changes ? this.find(ownerId, id) : undefined;
  }

  remove(ownerId: string, id: string): boolean {
    return this.db.prepare('DELETE FROM channels WHERE owner_id = ? AND id = ?').run(ownerId, id).changes > 0;
  }
}

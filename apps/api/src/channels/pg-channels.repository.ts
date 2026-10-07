import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Channel, ChannelInput } from '@rrn/shared';
import { Db, iso } from '../database/db';
import { ChannelInUseError, ChannelsRepository } from './channels.repository';

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
  created_at: unknown;
  updated_at: unknown;
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
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

@Injectable()
export class PgChannelsRepository extends ChannelsRepository {
  constructor(private readonly db: Db) {
    super();
  }

  async list(ownerId: string) {
    const { rows } = await this.db.execute<Row>('SELECT * FROM channels WHERE owner_id = $1 ORDER BY created_at DESC, seq DESC', [ownerId]);
    return rows.map(toChannel);
  }

  async find(ownerId: string, id: string) {
    const { rows } = await this.db.execute<Row>('SELECT * FROM channels WHERE owner_id = $1 AND id = $2', [ownerId, id]);
    return rows[0] && toChannel(rows[0]);
  }

  async create(ownerId: string, i: ChannelInput) {
    const { rows } = await this.db.execute<Row>(
      `INSERT INTO channels (id, owner_id, name, language, niche, description, youtube_handle,
         brand_primary_color, brand_accent_color, brand_style, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now()) RETURNING *`,
      [randomUUID(), ownerId, i.name, i.language, i.niche, i.description, i.youtubeHandle, i.brandPrimaryColor, i.brandAccentColor, i.brandStyle],
    );
    return toChannel(rows[0]);
  }

  async update(ownerId: string, id: string, i: ChannelInput) {
    const { rows } = await this.db.execute<Row>(
      `UPDATE channels SET name = $3, language = $4, niche = $5, description = $6, youtube_handle = $7,
         brand_primary_color = $8, brand_accent_color = $9, brand_style = $10, updated_at = now()
       WHERE owner_id = $1 AND id = $2 RETURNING *`,
      [ownerId, id, i.name, i.language, i.niche, i.description, i.youtubeHandle, i.brandPrimaryColor, i.brandAccentColor, i.brandStyle],
    );
    return rows[0] && toChannel(rows[0]);
  }

  async remove(ownerId: string, id: string) {
    try {
      const { count } = await this.db.execute('DELETE FROM channels WHERE owner_id = $1 AND id = $2', [ownerId, id]);
      return count > 0;
    } catch (err) {
      // 23503 = violação de chave estrangeira (canal ainda tem roteiros)
      if ((err as { code?: string })?.code === '23503' || /foreign key/i.test(String((err as Error)?.message))) throw new ChannelInUseError();
      throw err;
    }
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import type { Channel, ChannelInput } from '@rrn/shared';
import { ChannelsRepository } from './channels.repository';

/** Até existir autenticação, toda requisição pertence ao usuário local. */
export const LOCAL_OWNER = 'local';

@Injectable()
export class ChannelsService {
  constructor(private readonly repo: ChannelsRepository) {}

  list(): Channel[] {
    return this.repo.list(LOCAL_OWNER);
  }

  count(): number {
    return this.repo.list(LOCAL_OWNER).length;
  }

  get(id: string): Channel {
    const channel = this.repo.find(LOCAL_OWNER, id);
    if (!channel) throw new NotFoundException('Canal não encontrado');
    return channel;
  }

  create(input: ChannelInput): Channel {
    return this.repo.create(LOCAL_OWNER, input);
  }

  update(id: string, input: ChannelInput): Channel {
    const channel = this.repo.update(LOCAL_OWNER, id, input);
    if (!channel) throw new NotFoundException('Canal não encontrado');
    return channel;
  }

  remove(id: string): void {
    if (!this.repo.remove(LOCAL_OWNER, id)) throw new NotFoundException('Canal não encontrado');
  }
}

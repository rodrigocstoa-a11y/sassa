import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Channel, ChannelInput } from '@rrn/shared';
import { ChannelInUseError, ChannelsRepository } from './channels.repository';

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
    try {
      if (!this.repo.remove(LOCAL_OWNER, id)) throw new NotFoundException('Canal não encontrado');
    } catch (err) {
      if (err instanceof ChannelInUseError) {
        throw new ConflictException('Este canal possui roteiros. Exclua ou mova os roteiros antes de excluir o canal.');
      }
      throw err;
    }
  }
}

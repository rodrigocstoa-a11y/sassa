import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Channel, ChannelInput } from '@rrn/shared';
import { OwnerContext } from '../auth/owner-context';
import { ChannelInUseError, ChannelsRepository } from './channels.repository';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly repo: ChannelsRepository,
    private readonly owner: OwnerContext,
  ) {}

  list(): Promise<Channel[]> {
    return this.repo.list(this.owner.current());
  }

  async count(): Promise<number> {
    return (await this.list()).length;
  }

  async get(id: string): Promise<Channel> {
    const channel = await this.repo.find(this.owner.current(), id);
    if (!channel) throw new NotFoundException('Canal não encontrado');
    return channel;
  }

  create(input: ChannelInput): Promise<Channel> {
    return this.repo.create(this.owner.current(), input);
  }

  async update(id: string, input: ChannelInput): Promise<Channel> {
    const channel = await this.repo.update(this.owner.current(), id, input);
    if (!channel) throw new NotFoundException('Canal não encontrado');
    return channel;
  }

  async remove(id: string): Promise<void> {
    try {
      if (!(await this.repo.remove(this.owner.current(), id))) throw new NotFoundException('Canal não encontrado');
    } catch (err) {
      if (err instanceof ChannelInUseError) {
        throw new ConflictException('Este canal possui roteiros. Exclua ou mova os roteiros antes de excluir o canal.');
      }
      throw err;
    }
  }
}

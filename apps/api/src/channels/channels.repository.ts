import type { Channel, ChannelInput } from '@rrn/shared';

/** Contrato de persistência. SQLite hoje; PostgreSQL pode entrar na nuvem sem mudar o resto. */
export abstract class ChannelsRepository {
  abstract list(ownerId: string): Channel[];
  abstract find(ownerId: string, id: string): Channel | undefined;
  abstract create(ownerId: string, input: ChannelInput): Channel;
  abstract update(ownerId: string, id: string, input: ChannelInput): Channel | undefined;
  abstract remove(ownerId: string, id: string): boolean;
}

import type { Channel, ChannelInput } from '@rrn/shared';

/** Lançado quando o canal ainda possui roteiros vinculados. */
export class ChannelInUseError extends Error {}

/** Contrato de persistência de canais (implementação em PostgreSQL). */
export abstract class ChannelsRepository {
  abstract list(ownerId: string): Promise<Channel[]>;
  abstract find(ownerId: string, id: string): Promise<Channel | undefined>;
  abstract create(ownerId: string, input: ChannelInput): Promise<Channel>;
  abstract update(ownerId: string, id: string, input: ChannelInput): Promise<Channel | undefined>;
  abstract remove(ownerId: string, id: string): Promise<boolean>;
}

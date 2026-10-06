import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { SystemController } from './system.controller';

@Module({ imports: [ChannelsModule], controllers: [SystemController] })
export class SystemModule {}

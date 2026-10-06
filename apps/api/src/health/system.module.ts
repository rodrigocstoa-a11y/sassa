import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { ScriptsModule } from '../scripts/scripts.module';
import { SystemController } from './system.controller';

@Module({ imports: [ChannelsModule, ScriptsModule], controllers: [SystemController] })
export class SystemModule {}

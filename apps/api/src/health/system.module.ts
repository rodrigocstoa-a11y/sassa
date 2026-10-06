import { Module } from '@nestjs/common';
import { AudiosModule } from '../audios/audios.module';
import { ChannelsModule } from '../channels/channels.module';
import { ScriptsModule } from '../scripts/scripts.module';
import { SystemController } from './system.controller';

@Module({ imports: [ChannelsModule, ScriptsModule, AudiosModule], controllers: [SystemController] })
export class SystemModule {}

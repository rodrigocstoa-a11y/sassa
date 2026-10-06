import { Module } from '@nestjs/common';
import { ChannelsModule } from './channels/channels.module';
import { DatabaseModule } from './database/database.module';
import { SystemModule } from './health/system.module';
import { ScriptsModule } from './scripts/scripts.module';

@Module({ imports: [DatabaseModule, ChannelsModule, ScriptsModule, SystemModule] })
export class AppModule {}

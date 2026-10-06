import { Module } from '@nestjs/common';
import { ChannelsModule } from './channels/channels.module';
import { DatabaseModule } from './database/database.module';
import { SystemModule } from './health/system.module';

@Module({ imports: [DatabaseModule, ChannelsModule, SystemModule] })
export class AppModule {}

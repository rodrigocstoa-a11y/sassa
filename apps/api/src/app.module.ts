import { Module } from '@nestjs/common';
import { AudiosModule } from './audios/audios.module';
import { AuthModule } from './auth/auth.module';
import { BudgetModule } from './budget/budget.module';
import { ChannelsModule } from './channels/channels.module';
import { DatabaseModule } from './database/database.module';
import { SystemModule } from './health/system.module';
import { JobsModule } from './jobs/jobs.module';
import { ScriptsModule } from './scripts/scripts.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [DatabaseModule, AuthModule, StorageModule, JobsModule, BudgetModule, ChannelsModule, ScriptsModule, AudiosModule, SystemModule],
})
export class AppModule {}

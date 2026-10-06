import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsRepository } from './channels.repository';
import { ChannelsService } from './channels.service';
import { SqliteChannelsRepository } from './sqlite-channels.repository';

@Module({
  controllers: [ChannelsController],
  providers: [ChannelsService, { provide: ChannelsRepository, useClass: SqliteChannelsRepository }],
  exports: [ChannelsService],
})
export class ChannelsModule {}

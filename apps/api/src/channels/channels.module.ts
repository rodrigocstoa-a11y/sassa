import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsRepository } from './channels.repository';
import { ChannelsService } from './channels.service';
import { PgChannelsRepository } from './pg-channels.repository';

@Module({
  controllers: [ChannelsController],
  providers: [ChannelsService, { provide: ChannelsRepository, useClass: PgChannelsRepository }],
  exports: [ChannelsService],
})
export class ChannelsModule {}

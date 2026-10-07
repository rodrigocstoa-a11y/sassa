import { Module } from '@nestjs/common';
import { ScriptsModule } from '../scripts/scripts.module';
import { AudioGenerationService, TTS_PROVIDER } from './audio-generation.service';
import { AudiosController } from './audios.controller';
import { AudiosRepository } from './audios.repository';
import { AudiosService } from './audios.service';
import { PgAudiosRepository } from './pg-audios.repository';

@Module({
  imports: [ScriptsModule],
  controllers: [AudiosController],
  providers: [
    AudiosService,
    AudioGenerationService,
    { provide: AudiosRepository, useClass: PgAudiosRepository },
    // Sem provedor TTS nesta fase. Uma integração futura (ex.: Talkify Labs) substitui este valor.
    { provide: TTS_PROVIDER, useValue: null },
  ],
  exports: [AudiosService],
})
export class AudiosModule {}

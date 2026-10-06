import { Module } from '@nestjs/common';
import { ScriptsModule } from '../scripts/scripts.module';
import { AudioGenerationService, TTS_PROVIDER } from './audio-generation.service';
import { AudioStorage, LocalAudioStorage } from './audio-storage';
import { AudiosController } from './audios.controller';
import { AudiosRepository } from './audios.repository';
import { AudiosService } from './audios.service';
import { SqliteAudiosRepository } from './sqlite-audios.repository';

@Module({
  imports: [ScriptsModule],
  controllers: [AudiosController],
  providers: [
    AudiosService,
    AudioGenerationService,
    { provide: AudiosRepository, useClass: SqliteAudiosRepository },
    { provide: AudioStorage, useClass: LocalAudioStorage },
    // Sem provedor TTS nesta fase. Uma integração futura (ex.: Talkify Labs) substitui este valor.
    { provide: TTS_PROVIDER, useValue: null },
  ],
  exports: [AudiosService],
})
export class AudiosModule {}

import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { LLM_PROVIDER, ScriptGenerationService } from './script-generation.service';
import { ScriptsController } from './scripts.controller';
import { ScriptsRepository } from './scripts.repository';
import { ScriptsService } from './scripts.service';
import { PgScriptsRepository } from './pg-scripts.repository';

@Module({
  imports: [ChannelsModule],
  controllers: [ScriptsController],
  providers: [
    ScriptsService,
    ScriptGenerationService,
    { provide: ScriptsRepository, useClass: PgScriptsRepository },
    // Sem provedor LLM nesta fase. Uma integração futura substitui este valor.
    { provide: LLM_PROVIDER, useValue: null },
  ],
  exports: [ScriptsService],
})
export class ScriptsModule {}

import { Controller, Get } from '@nestjs/common';
import { authEnabled, databaseUrl, role, storageDriver } from '../config';
import { PROVIDER_SLOTS } from '@rrn/shared';
import { Public } from '../auth/public.decorator';
import { AudiosService } from '../audios/audios.service';
import { ChannelsService } from '../channels/channels.service';
import { Db } from '../database/db';
import { ScriptsService } from '../scripts/scripts.service';

@Controller()
export class SystemController {
  constructor(
    private readonly db: Db,
    private readonly channels: ChannelsService,
    private readonly scripts: ScriptsService,
    private readonly audios: AudiosService,
  ) {}

  @Public()
  @Get('health')
  async health() {
    await this.db.execute('SELECT 1');
    return {
      status: 'ok',
      database: 'ok',
      version: '0.2.0',
      // Informações de configuração (sem segredos) para a tela de Configurações.
      engine: databaseUrl() ? 'postgres' : 'pglite',
      storage: storageDriver(),
      authRequired: authEnabled(),
      role: role(),
    };
  }

  /** Só números reais. Módulos ainda não implementados retornam null (não 0). */
  @Get('dashboard/summary')
  async summary() {
    const [channels, scripts, audios] = await Promise.all([this.channels.count(), this.scripts.count(), this.audios.count()]);
    return { channels, scripts, audios, videos: null, tasksInProgress: null, errors: null };
  }

  /** Nenhum provedor está integrado nesta versão; a lista reflete isso. */
  @Get('providers')
  providers() {
    return PROVIDER_SLOTS.map((p) => ({ ...p, configured: false }));
  }
}

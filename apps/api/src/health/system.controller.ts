import { Controller, Get, Inject } from '@nestjs/common';
import type { DatabaseSync } from 'node:sqlite';
import { PROVIDER_SLOTS } from '@rrn/shared';
import { ChannelsService } from '../channels/channels.service';
import { DATABASE } from '../database/database.module';
import { ScriptsService } from '../scripts/scripts.service';

@Controller()
export class SystemController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseSync,
    private readonly channels: ChannelsService,
    private readonly scripts: ScriptsService,
  ) {}

  @Get('health')
  health() {
    this.db.prepare('SELECT 1').get();
    return { status: 'ok', database: 'ok', version: '0.1.0' };
  }

  /** Só números reais. Módulos ainda não implementados retornam null (não 0). */
  @Get('dashboard/summary')
  summary() {
    return {
      channels: this.channels.count(),
      scripts: this.scripts.count(),
      videos: null,
      tasksInProgress: null,
      errors: null,
    };
  }

  /** Nenhum provedor está integrado nesta versão; a lista reflete isso. */
  @Get('providers')
  providers() {
    return PROVIDER_SLOTS.map((p) => ({ ...p, configured: false }));
  }
}

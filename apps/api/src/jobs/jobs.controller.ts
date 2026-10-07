import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.jobs.list(Math.min(Number(limit) || 50, 200));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.jobs.get(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string) {
    return this.jobs.cancel(id);
  }
}

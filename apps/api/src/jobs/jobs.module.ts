import { Global, Module } from '@nestjs/common';
import { JobRunner } from './job-runner';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Global()
@Module({ controllers: [JobsController], providers: [JobsService, JobRunner], exports: [JobsService, JobRunner] })
export class JobsModule {}

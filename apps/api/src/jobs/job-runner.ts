import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { role } from '../config';
import { OwnerContext } from '../auth/owner-context';
import { JobsService, type ClaimedJob } from './jobs.service';

/** Erro que não deve ser repetido (ex.: configuração inválida, orçamento esgotado). */
export class PermanentJobError extends Error {}
/** O handler interrompeu o trabalho porque o cancelamento foi solicitado. */
export class JobCanceledError extends Error {}

export interface JobContext {
  job: ClaimedJob;
  attempt: number;
  maxAttempts: number;
  setProgress(fraction: number): Promise<void>;
  isCanceled(): Promise<boolean>;
}
export type JobHandler = (ctx: JobContext) => Promise<unknown>;

const intEnv = (name: string, fallback: number) => (process.env[name] !== undefined ? Number(process.env[name]) : fallback);

/**
 * Executa os jobs da fila. Roda dentro do processo da API (ROLE=all, padrão) ou em um processo
 * separado só de worker (ROLE=worker), que é como fica na nuvem.
 */
@Injectable()
export class JobRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(JobRunner.name);
  private readonly handlers = new Map<string, JobHandler>();
  private readonly inflight = new Set<Promise<void>>();
  private readonly workerId = `worker-${randomUUID().slice(0, 8)}`;
  private timer?: NodeJS.Timeout;
  private stopping = false;

  constructor(
    private readonly jobs: JobsService,
    private readonly owner: OwnerContext,
  ) {}

  register(type: string, handler: JobHandler) {
    this.handlers.set(type, handler);
  }

  onApplicationBootstrap() {
    if (role() !== 'api' && process.env.JOBS_DISABLED !== 'true') this.start();
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intEnv('JOB_POLL_MS', 1000));
    this.log.log(`Worker ${this.workerId} iniciado`);
  }

  async onApplicationShutdown() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await Promise.race([Promise.allSettled([...this.inflight]), new Promise((r) => setTimeout(r, 10_000))]);
  }

  private async tick() {
    const concurrency = intEnv('JOB_CONCURRENCY', 2);
    while (!this.stopping && this.inflight.size < concurrency) {
      let job: ClaimedJob | null;
      try {
        job = await this.jobs.claim(this.workerId, intEnv('JOB_LEASE_SEC', 60));
      } catch (err) {
        this.log.error(`Falha ao buscar jobs: ${(err as Error).message}`);
        return;
      }
      if (!job) return;
      const p = this.execute(job).finally(() => this.inflight.delete(p));
      this.inflight.add(p);
    }
  }

  private async execute(job: ClaimedJob) {
    const lease = intEnv('JOB_LEASE_SEC', 60);
    const beat = setInterval(() => void this.jobs.heartbeat(job.id, this.workerId, lease).catch(() => {}), Math.max(1000, (lease * 1000) / 3));
    try {
      const handler = this.handlers.get(job.type);
      if (!handler) throw new PermanentJobError(`Sem handler para o tipo de job "${job.type}"`);
      const ctx: JobContext = {
        job,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
        setProgress: (f) => this.jobs.setProgress(job.id, f),
        isCanceled: () => this.jobs.isCancelRequested(job.id),
      };
      const result = await this.owner.run({ ownerId: job.ownerId, userId: null }, () => handler(ctx));
      await this.jobs.complete(job.id, this.workerId, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const canceled = err instanceof JobCanceledError;
      const retry = !canceled && !(err instanceof PermanentJobError) && job.attempts < job.maxAttempts;
      const base = intEnv('JOB_BACKOFF_SEC', 5);
      this.log.warn(`Job ${job.type} ${job.id} falhou (tentativa ${job.attempts}/${job.maxAttempts}): ${message}`);
      await this.jobs
        .fail(job.id, this.workerId, message, { retry, backoffSec: Math.min(base * 2 ** (job.attempts - 1), 300), canceled })
        .catch((e) => this.log.error(`Não foi possível registrar a falha do job ${job.id}: ${e.message}`));
    } finally {
      clearInterval(beat);
    }
  }
}

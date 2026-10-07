import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { JobStatus, JobSummary } from '@rrn/shared';
import { OwnerContext } from '../auth/owner-context';
import { Db, iso, isoOrNull } from '../database/db';

interface Row {
  id: string;
  owner_id: string;
  type: string;
  payload: Record<string, any>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  progress: number;
  cancel_requested: boolean;
  error: string | null;
  created_at: unknown;
  updated_at: unknown;
  finished_at: unknown;
}

export interface ClaimedJob {
  id: string;
  ownerId: string;
  type: string;
  payload: Record<string, any>;
  attempts: number;
  maxAttempts: number;
}

export interface EnqueueOptions<P> {
  type: string;
  payload: P;
  /** Mesmo valor enquanto o job está ativo = não duplica. */
  dedupeKey?: string;
  maxAttempts?: number;
  priority?: number;
}

const toSummary = (r: Row): JobSummary => ({
  id: r.id,
  type: r.type,
  status: r.status,
  progress: r.progress,
  attempts: r.attempts,
  maxAttempts: r.max_attempts,
  error: r.error,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
  finishedAt: isoOrNull(r.finished_at),
});

/** Fila persistente em PostgreSQL (SELECT … FOR UPDATE SKIP LOCKED): sobrevive a reinícios e permite vários workers. */
@Injectable()
export class JobsService {
  constructor(
    private readonly db: Db,
    private readonly owner: OwnerContext,
  ) {}

  async enqueue<P extends object>(opts: EnqueueOptions<P>): Promise<JobSummary> {
    const ownerId = this.owner.current();
    const { rows } = await this.db.execute<Row>(
      `INSERT INTO jobs (id, owner_id, type, payload, max_attempts, priority, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running') DO NOTHING
       RETURNING *`,
      [randomUUID(), ownerId, opts.type, JSON.stringify(opts.payload), opts.maxAttempts ?? 3, opts.priority ?? 0, opts.dedupeKey ?? null],
    );
    if (rows[0]) return toSummary(rows[0]);
    const existing = await this.db.execute<Row>(
      `SELECT * FROM jobs WHERE dedupe_key = $1 AND status IN ('queued', 'running')`,
      [opts.dedupeKey],
    );
    return toSummary(existing.rows[0]);
  }

  async list(limit = 50): Promise<JobSummary[]> {
    const { rows } = await this.db.execute<Row>('SELECT * FROM jobs WHERE owner_id = $1 ORDER BY created_at DESC LIMIT $2', [this.owner.current(), limit]);
    return rows.map(toSummary);
  }

  async get(id: string): Promise<JobSummary> {
    const { rows } = await this.db.execute<Row>('SELECT * FROM jobs WHERE owner_id = $1 AND id = $2', [this.owner.current(), id]);
    if (!rows[0]) throw new NotFoundException('Trabalho não encontrado');
    return toSummary(rows[0]);
  }

  /** Cancela: imediato se estiver na fila; se estiver rodando, sinaliza e o handler decide parar. */
  async cancel(id: string): Promise<JobSummary> {
    await this.db.execute(
      `UPDATE jobs SET
         status = CASE WHEN status = 'queued' THEN 'canceled' ELSE status END,
         finished_at = CASE WHEN status = 'queued' THEN now() ELSE finished_at END,
         cancel_requested = true, updated_at = now()
       WHERE owner_id = $1 AND id = $2 AND status IN ('queued', 'running')`,
      [this.owner.current(), id],
    );
    return this.get(id);
  }

  // ---- operações do worker ----

  async claim(workerId: string, leaseSec: number): Promise<ClaimedJob | null> {
    // Trabalhos cujo worker morreu e sem tentativas restantes viram falha definitiva.
    await this.db.execute(
      `UPDATE jobs SET status = 'failed', error = 'O worker parou de responder e as tentativas acabaram',
         locked_by = NULL, locked_until = NULL, finished_at = now(), updated_at = now()
       WHERE status = 'running' AND locked_until < now() AND attempts >= max_attempts`,
    );
    const { rows } = await this.db.execute<Row>(
      `UPDATE jobs SET status = 'running', locked_by = $1, locked_until = now() + make_interval(secs => $2),
         attempts = attempts + 1, updated_at = now()
       WHERE id = (
         SELECT id FROM jobs
         WHERE (status = 'queued' AND run_at <= now())
            OR (status = 'running' AND locked_until < now() AND attempts < max_attempts)
         ORDER BY priority DESC, run_at ASC
         LIMIT 1 FOR UPDATE SKIP LOCKED
       ) RETURNING *`,
      [workerId, leaseSec],
    );
    const r = rows[0];
    return r ? { id: r.id, ownerId: r.owner_id, type: r.type, payload: r.payload, attempts: r.attempts, maxAttempts: r.max_attempts } : null;
  }

  async heartbeat(id: string, workerId: string, leaseSec: number) {
    await this.db.execute(
      `UPDATE jobs SET locked_until = now() + make_interval(secs => $3), updated_at = now() WHERE id = $1 AND locked_by = $2 AND status = 'running'`,
      [id, workerId, leaseSec],
    );
  }

  async setProgress(id: string, progress: number) {
    await this.db.execute('UPDATE jobs SET progress = $2, updated_at = now() WHERE id = $1', [id, Math.max(0, Math.min(1, progress))]);
  }

  async isCancelRequested(id: string): Promise<boolean> {
    const { rows } = await this.db.execute<{ c: boolean }>('SELECT cancel_requested AS c FROM jobs WHERE id = $1', [id]);
    return rows[0]?.c === true;
  }

  async complete(id: string, workerId: string, result?: unknown) {
    await this.db.execute(
      `UPDATE jobs SET status = 'succeeded', progress = 1, result = $3, locked_by = NULL, locked_until = NULL,
         finished_at = now(), updated_at = now(), error = NULL
       WHERE id = $1 AND locked_by = $2`,
      [id, workerId, result === undefined ? null : JSON.stringify(result)],
    );
  }

  async fail(id: string, workerId: string, error: string, opts: { retry: boolean; backoffSec: number; canceled?: boolean }) {
    await this.db.execute(
      `UPDATE jobs SET
         status = CASE WHEN $6::boolean THEN 'canceled' WHEN $4::boolean THEN 'queued' ELSE 'failed' END,
         run_at = CASE WHEN $4::boolean AND NOT $6::boolean THEN now() + make_interval(secs => $5) ELSE run_at END,
         error = $3, locked_by = NULL, locked_until = NULL,
         finished_at = CASE WHEN $4::boolean AND NOT $6::boolean THEN NULL ELSE now() END, updated_at = now()
       WHERE id = $1 AND locked_by = $2`,
      [id, workerId, error.slice(0, 1000), opts.retry, opts.backoffSec, opts.canceled ?? false],
    );
  }

  /** Existe job ativo (na fila ou rodando) para a chave? */
  async hasActive(dedupeKey: string): Promise<boolean> {
    const { rows } = await this.db.execute(`SELECT 1 FROM jobs WHERE dedupe_key = $1 AND status IN ('queued', 'running')`, [dedupeKey]);
    return rows.length > 0;
  }
}

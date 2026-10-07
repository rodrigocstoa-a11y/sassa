import 'reflect-metadata';
import { createTestApp, waitFor } from '../test/test-utils';
import { OwnerContext } from '../auth/owner-context';
import { Db } from '../database/db';
import { JobCanceledError, JobRunner, PermanentJobError } from './job-runner';
import { JobsService } from './jobs.service';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let jobs: JobsService;
let db: Db;
let owner: OwnerContext;
const as = <T>(fn: () => Promise<T>) => owner.run({ ownerId: 'local', userId: null }, fn);
const statusOf = async (id: string) => (await db.execute<{ status: string; attempts: number; error: string | null; run_at: Date }>('SELECT status, attempts, error, run_at FROM jobs WHERE id = $1', [id])).rows[0];

beforeAll(async () => {
  ctx = await createTestApp({ runner: false }); // a fila é conduzida manualmente nestes testes
  jobs = ctx.app.get(JobsService);
  db = ctx.app.get(Db);
  owner = ctx.app.get(OwnerContext);
});
afterAll(() => ctx.close());
beforeEach(() => db.execute('DELETE FROM jobs'));

describe('Fila persistente: enfileirar e pegar', () => {
  it('enfileira e não duplica enquanto houver job ativo com a mesma chave', async () => {
    const a = await as(() => jobs.enqueue({ type: 't', payload: { n: 1 }, dedupeKey: 'k1' }));
    const b = await as(() => jobs.enqueue({ type: 't', payload: { n: 2 }, dedupeKey: 'k1' }));
    expect(a.status).toBe('queued');
    expect(b.id).toBe(a.id);
    expect((await db.execute('SELECT 1 FROM jobs')).rows).toHaveLength(1);
    // concluído o job, a chave pode ser reutilizada
    const c = (await jobs.claim('w1', 30))!;
    await jobs.complete(c.id, 'w1');
    expect((await as(() => jobs.enqueue({ type: 't', payload: {}, dedupeKey: 'k1' }))).id).not.toBe(a.id);
  });

  it('respeita prioridade e ordem de chegada', async () => {
    const low = await as(() => jobs.enqueue({ type: 't', payload: {} }));
    const high = await as(() => jobs.enqueue({ type: 't', payload: {}, priority: 5 }));
    const low2 = await as(() => jobs.enqueue({ type: 't', payload: {} }));
    const order = [(await jobs.claim('w', 30))!.id, (await jobs.claim('w', 30))!.id, (await jobs.claim('w', 30))!.id];
    expect(order).toEqual([high.id, low.id, low2.id]);
    expect(await jobs.claim('w', 30)).toBeNull();
  });

  it('workers concorrentes nunca pegam o mesmo job (SKIP LOCKED)', async () => {
    for (let i = 0; i < 8; i++) await as(() => jobs.enqueue({ type: 't', payload: { i } }));
    const claimed = await Promise.all(Array.from({ length: 12 }, (_, i) => jobs.claim(`w${i}`, 30)));
    const ids = claimed.filter(Boolean).map((j) => j!.id);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
  });
});

describe('Fila persistente: falhas, tentativas e queda de worker', () => {
  it('lease vencido (worker caiu): outro worker reassume e conta a tentativa', async () => {
    const j = await as(() => jobs.enqueue({ type: 't', payload: {}, maxAttempts: 3 }));
    const first = (await jobs.claim('morto', -1))!; // lease já vencido (-1 s): simula o worker que caiu
    expect(first).toMatchObject({ id: j.id, attempts: 1 });
    const again = (await jobs.claim('vivo', 30))!;
    expect(again).toMatchObject({ id: j.id, attempts: 2 });
    await jobs.complete(j.id, 'morto'); // o worker antigo não tem mais o lock: nada acontece
    expect((await statusOf(j.id)).status).toBe('running');
    await jobs.complete(j.id, 'vivo');
    expect((await statusOf(j.id)).status).toBe('succeeded');
  });

  it('lease vencido sem tentativas restantes: falha definitiva', async () => {
    const j = await as(() => jobs.enqueue({ type: 't', payload: {}, maxAttempts: 1 }));
    await jobs.claim('morto', -1);
    expect(await jobs.claim('vivo', 30)).toBeNull();
    expect(await statusOf(j.id)).toMatchObject({ status: 'failed', error: expect.stringMatching(/parou de responder/) });
  });

  it('falha com nova tentativa respeita a espera (backoff) e depois reentra na fila', async () => {
    const j = await as(() => jobs.enqueue({ type: 't', payload: {} }));
    await jobs.claim('w', 30);
    await jobs.fail(j.id, 'w', 'erro temporário', { retry: true, backoffSec: 3600 });
    expect(await statusOf(j.id)).toMatchObject({ status: 'queued', error: 'erro temporário' });
    expect(await jobs.claim('w', 30)).toBeNull(); // ainda esperando
    await db.execute(`UPDATE jobs SET run_at = now() WHERE id = $1`, [j.id]);
    expect((await jobs.claim('w', 30))!.attempts).toBe(2);
  });

  it('falha definitiva não volta para a fila', async () => {
    const j = await as(() => jobs.enqueue({ type: 't', payload: {} }));
    await jobs.claim('w', 30);
    await jobs.fail(j.id, 'w', 'fatal', { retry: false, backoffSec: 0 });
    expect((await statusOf(j.id)).status).toBe('failed');
    expect(await jobs.claim('w', 30)).toBeNull();
  });
});

describe('Fila persistente: cancelamento e isolamento', () => {
  it('cancela na fila imediatamente e sinaliza quando já está rodando', async () => {
    const queued = await as(() => jobs.enqueue({ type: 't', payload: {} }));
    expect((await as(() => jobs.cancel(queued.id))).status).toBe('canceled');
    expect(await jobs.claim('w', 30)).toBeNull();

    const running = await as(() => jobs.enqueue({ type: 't', payload: {} }));
    await jobs.claim('w', 30);
    const res = await as(() => jobs.cancel(running.id));
    expect(res.status).toBe('running');
    expect(await jobs.isCancelRequested(running.id)).toBe(true);
  });

  it('cada usuário só enxerga os próprios jobs', async () => {
    const mine = await as(() => jobs.enqueue({ type: 't', payload: {} }));
    const other = owner.run({ ownerId: 'outro', userId: 'outro' }, () => jobs.list());
    expect(await other).toEqual([]);
    await expect(owner.run({ ownerId: 'outro', userId: 'outro' }, () => jobs.get(mine.id))).rejects.toThrow(/não encontrado/);
  });
});

describe('JobRunner (execução)', () => {
  it('executa handlers com o dono correto, registra progresso e resultado; erros permanentes não repetem', async () => {
    const runner = ctx.app.get(JobRunner);
    runner.start(); // o worker foi desligado no setup; ligamos aqui
    const seen: string[] = [];
    runner.register('t.ok', async ({ job, setProgress }) => {
      seen.push(owner.current());
      await setProgress(0.5);
      return { echoed: job.payload.x };
    });
    let permanentCalls = 0;
    runner.register('t.permanent', async () => { permanentCalls++; throw new PermanentJobError('não repita'); });
    let flakyCalls = 0;
    runner.register('t.flaky', async ({ attempt }) => { flakyCalls++; if (attempt < 3) throw new Error(`falha ${attempt}`); return 'ok'; });
    let alwaysCalls = 0;
    runner.register('t.always', async () => { alwaysCalls++; throw new Error('sempre falha'); });
    runner.register('t.cancel', async ({ isCanceled }) => {
      for (let i = 0; i < 200; i++) { if (await isCanceled()) throw new JobCanceledError('cancelado'); await new Promise((r) => setTimeout(r, 20)); }
    });

    const ok = await as(() => jobs.enqueue({ type: 't.ok', payload: { x: 42 } }));
    const perm = await as(() => jobs.enqueue({ type: 't.permanent', payload: {} }));
    const flaky = await as(() => jobs.enqueue({ type: 't.flaky', payload: {} }));
    const always = await as(() => jobs.enqueue({ type: 't.always', payload: {}, maxAttempts: 2 }));
    const unknown = await as(() => jobs.enqueue({ type: 't.sem-handler', payload: {} }));
    const cancelMe = await as(() => jobs.enqueue({ type: 't.cancel', payload: {} }));

    const final = (id: string) => waitFor(() => as(() => jobs.get(id)), (j) => ['succeeded', 'failed', 'canceled'].includes(j.status));
    expect(await final(ok.id)).toMatchObject({ status: 'succeeded', progress: 1 });
    expect(seen).toEqual(['local']);
    expect((await db.execute<{ result: unknown }>('SELECT result FROM jobs WHERE id = $1', [ok.id])).rows[0].result).toEqual({ echoed: 42 });
    expect(await final(perm.id)).toMatchObject({ status: 'failed', attempts: 1, error: 'não repita' });
    expect(permanentCalls).toBe(1);
    expect(await final(flaky.id)).toMatchObject({ status: 'succeeded', attempts: 3 });
    expect(flakyCalls).toBe(3);
    expect(await final(always.id)).toMatchObject({ status: 'failed', attempts: 2, error: 'sempre falha' });
    expect(alwaysCalls).toBe(2);
    expect(await final(unknown.id)).toMatchObject({ status: 'failed', error: expect.stringMatching(/Sem handler/) });

    await waitFor(() => as(() => jobs.get(cancelMe.id)), (j) => j.status === 'running');
    await as(() => jobs.cancel(cancelMe.id));
    expect(await final(cancelMe.id)).toMatchObject({ status: 'canceled' });
  });
});

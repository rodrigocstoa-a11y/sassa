import 'reflect-metadata';
import request from 'supertest';
import type { TtsProvider } from '@rrn/shared';
import { createTestApp, makeWav, waitFor } from '../test/test-utils';

/**
 * ATENÇÃO: este provedor é um DUBLÊ usado APENAS nestes testes para validar o pipeline
 * (divisão, fila, custo, orçamento, erro e retomada). Ele não existe na aplicação real.
 */
let calls: string[] = [];
let failuresLeft = 0;
let gate: Promise<void> | null = null;
let costFactor = 1;
const USD_PER_CHAR = 0.001;
const fake: TtsProvider = {
  id: 'fake-test',
  name: 'Provedor de teste',
  maxCharsPerRequest: 40,
  listVoices: async (lang) => [{ id: 'v1', name: 'Voz 1', language: lang ?? 'pt-BR' }],
  estimateCostUsd: ({ text }) => text.length * USD_PER_CHAR,
  synthesize: async ({ text, speed }) => {
    calls.push(text);
    if (gate) await gate;
    if (failuresLeft > 0) {
      failuresLeft--;
      throw new Error('Falha simulada do provedor de teste');
    }
    expect(speed).toBe(1.25);
    return { data: makeWav(text.length), mimeType: 'audio/wav', durationMs: text.length, costUsd: text.length * USD_PER_CHAR * costFactor };
  },
};

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let http: typeof ctx.http;
let scriptId: string;
const CONTENT = 'Primeira frase do roteiro. Segunda frase do roteiro.\n\nTerceira frase, em outro parágrafo, mais longa que o limite.';
const TOTAL_CHARS = 112;

beforeAll(async () => {
  ctx = await createTestApp({ ttsProvider: fake });
  http = ctx.http;
  const channelId = (await request(http).post('/api/channels').send({
    name: 'Canal', language: 'pt-BR', niche: 'Nicho', description: '', youtubeHandle: '', brandPrimaryColor: '#000000', brandAccentColor: '#ffffff', brandStyle: '',
  })).body.id;
  scriptId = (await request(http).post('/api/scripts').send({ channelId, title: 'Roteiro longo', language: 'pt-BR', topic: '', content: CONTENT, status: 'draft' })).body.id;
});
afterAll(() => ctx.close());
beforeEach(() => { calls = []; failuresLeft = 0; gate = null; costFactor = 1; });

const setBudget = (monthlyLimitUsd: number | null) => request(http).put('/api/budget').send({ monthlyLimitUsd }).expect(200);
const generate = (over: Record<string, unknown> = {}) =>
  request(http).post('/api/audios/generate').send({ scriptId, voiceId: 'v1', settings: { speed: 1.25 }, approvedMaxCostUsd: 10, ...over });
const get = async (id: string) => (await request(http).get(`/api/audios/${id}`)).body;
const settled = (id: string) => waitFor(() => get(id), (a) => a.status !== 'processing');

describe('Provedor, custo e orçamento', () => {
  it('expõe provedor e vozes quando configurado', async () => {
    expect((await request(http).get('/api/audios/generation/status')).body).toMatchObject({
      available: true, provider: { id: 'fake-test', maxCharsPerRequest: 40 }, requirements: [],
    });
    expect((await request(http).get('/api/audios/voices?language=pt-BR')).body.voices[0].id).toBe('v1');
  });

  it('estima o custo antes de gerar', async () => {
    const est = await request(http).post('/api/audios/generation/estimate').send({ scriptId, voiceId: 'v1' }).expect(200);
    expect(est.body.characters).toBeGreaterThan(80);
    expect(est.body.estimateUsd).toBeCloseTo(est.body.characters * USD_PER_CHAR, 6);
    expect(est.body.parts).toBeGreaterThan(2);
  });

  it('sem orçamento definido, bloqueia (padrão seguro: US$ 0) e não cria nada', async () => {
    const res = await generate().expect(402);
    expect(res.body).toMatchObject({ code: 'BUDGET_EXCEEDED', budget: { monthlyLimitUsd: null, remainingUsd: 0 } });
    expect(res.body.message).toMatch(/Nenhum orçamento mensal/);
    expect((await request(http).get('/api/audios')).body.total).toBe(0);
    expect((await request(http).get('/api/jobs')).body).toEqual([]);
  });

  it('exige confirmação do custo e respeita o orçamento restante', async () => {
    await setBudget(0.05);
    const lowApproval = await generate({ approvedMaxCostUsd: 0.01 }).expect(409);
    expect(lowApproval.body).toMatchObject({ code: 'COST_CONFIRMATION_REQUIRED' });
    expect(lowApproval.body.estimateUsd).toBeGreaterThan(0.1);
    const over = await generate({ approvedMaxCostUsd: 10 }).expect(402); // estimativa ~US$ 0,11 > orçamento de US$ 0,05
    expect(over.body.message).toMatch(/Orçamento mensal insuficiente/);
    expect((await request(http).get('/api/audios')).body.total).toBe(0);
  });

  it('valida voz e roteiro', async () => {
    await setBudget(100);
    expect((await generate({ voiceId: 'inexistente' }).expect(400)).body.issues[0].path).toBe('voiceId');
    expect((await generate({ scriptId: 'x' }).expect(400)).body.issues[0].path).toBe('scriptId');
    await generate({ approvedMaxCostUsd: undefined }).expect(400);
  });
});

describe('Pipeline na fila (dublê de teste)', () => {
  beforeAll(() => setBudget(100));

  it('divide no limite, processa em segundo plano, registra o custo e junta os WAVs', async () => {
    let release!: () => void;
    gate = new Promise((r) => (release = r));
    const res = await generate().expect(202);
    const id = res.body.id;
    expect(res.body).toMatchObject({ status: 'processing', source: 'provider', providerId: 'fake-test', voiceName: 'Voz 1', hasFile: false });
    expect(res.body.partsTotal).toBeGreaterThan(2);

    const running = await waitFor(async () => (await request(http).get('/api/jobs')).body[0], (j) => j?.status === 'running');
    expect(running).toMatchObject({ type: 'audio.generate', attempts: 1 });

    // enquanto processa: não pode ser aprovado nem excluído, e não tem arquivo
    expect((await get(id)).status).toBe('processing');
    await request(http).put(`/api/audios/${id}`).send({ title: 'Qualquer', approved: true }).expect(400);
    await request(http).delete(`/api/audios/${id}`).expect(409);
    await request(http).get(`/api/audios/${id}/file`).expect(404);

    release();
    const done = await settled(id);
    expect(done).toMatchObject({ status: 'completed', hasFile: true, mimeType: 'audio/wav', partsDone: res.body.partsTotal, errorMessage: null });
    expect(calls.every((t) => t.length <= 40)).toBe(true);
    expect(done.durationMs).toBe(calls.reduce((n, t) => n + t.length, 0));

    const job = await waitFor(async () => (await request(http).get('/api/jobs')).body[0], (j) => j.status === 'succeeded');
    expect(job.progress).toBe(1);

    const spent = (await request(http).get('/api/budget')).body.spentUsd;
    expect(spent).toBeCloseTo(calls.reduce((n, t) => n + t.length, 0) * USD_PER_CHAR, 6);
    const events = (await request(http).get('/api/budget/events')).body;
    expect(events[0]).toMatchObject({ providerKind: 'tts', providerId: 'fake-test' });
    expect(events.length).toBe(res.body.partsTotal);

    const file = await request(http).get(`/api/audios/${id}/file`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = []; r.on('data', (c: Buffer) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect((file.body as Buffer).toString('latin1', 0, 4)).toBe('RIFF');
    expect((file.body as Buffer).length).toBe(done.sizeBytes);
    await request(http).delete(`/api/audios/${id}`).expect(204);
  });

  it('erro transitório: a fila tenta de novo sozinha e não refaz partes concluídas (nem cobra de novo)', async () => {
    const before = (await request(http).get('/api/budget')).body.spentUsd;
    failuresLeft = 1; // falha 1 vez; a repetição automática conclui
    const res = await generate().expect(202);
    const done = await settled(res.body.id);
    expect(done.status).toBe('completed');
    expect(calls.length).toBe(res.body.partsTotal + 1); // 1 chamada extra, só da parte que falhou
    const spent = (await request(http).get('/api/budget')).body.spentUsd - before;
    expect(spent).toBeCloseTo(TOTAL_CHARS * USD_PER_CHAR, 2); // falhas não geram cobrança
    await request(http).delete(`/api/audios/${res.body.id}`).expect(204);
  });

  it('esgotadas as tentativas: erro; "tentar novamente" retoma sem refazer as partes prontas', async () => {
    failuresLeft = 99; // todas as tentativas falham
    const res = await generate().expect(202);
    const id = res.body.id;
    const failed = await settled(id);
    expect(failed).toMatchObject({ status: 'error', partsDone: 0, hasFile: false });
    expect(failed.errorMessage).toBe('Falha simulada do provedor de teste');
    expect(calls.length).toBe(3); // 3 tentativas da primeira parte
    await request(http).put(`/api/audios/${id}`).send({ title: 'Qualquer', approved: true }).expect(400);

    failuresLeft = 0;
    calls = [];
    await request(http).post(`/api/audios/${id}/retry`).send({}).expect(202);
    const ok = await settled(id);
    expect(ok.status).toBe('completed');
    expect(calls.length).toBe(res.body.partsTotal);
    await request(http).post(`/api/audios/${id}/retry`).send({}).expect(409); // só áudios com erro
    await request(http).delete(`/api/audios/${id}`).expect(204);
  });

  it('o custo autorizado é um teto: se o custo real passa da estimativa, para antes de gastar além', async () => {
    const before = (await request(http).get('/api/budget')).body.spentUsd;
    costFactor = 5; // o provedor cobra 5x mais do que estimou
    const res = await generate({ approvedMaxCostUsd: 0.12 }).expect(202); // cobre a estimativa (≈ 0,112)
    const stopped = await settled(res.body.id);
    expect(stopped.status).toBe('error');
    expect(stopped.errorMessage).toMatch(/custo autorizado/);
    expect(calls.length).toBeLessThan(res.body.partsTotal); // parou no meio
    const spent = (await request(http).get('/api/budget')).body.spentUsd - before;
    expect(spent).toBeLessThan(0.12 * 5); // não gastou o total
    await request(http).delete(`/api/audios/${res.body.id}`).expect(204);
  });

  it('"processando" sem job ativo (trabalho perdido) vira erro na reconciliação', async () => {
    const { AudiosRepository } = await import('./audios.repository');
    const { AudioGenerationService } = await import('./audio-generation.service');
    const sc = (await request(http).get(`/api/scripts/${scriptId}`)).body;
    const rec = await ctx.app.get(AudiosRepository).create('local', {
      channelId: sc.channelId, scriptId, title: 'Órfão', language: 'pt-BR', status: 'processing', source: 'provider', providerId: 'fake-test',
    });
    await ctx.app.get(AudioGenerationService).onApplicationBootstrap();
    expect(await get(rec.id)).toMatchObject({ status: 'error', errorMessage: expect.stringMatching(/perdido/) });
  });
});

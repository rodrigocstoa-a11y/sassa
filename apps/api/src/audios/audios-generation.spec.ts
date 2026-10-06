import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TtsProvider } from '@rrn/shared';
import request from 'supertest';
import { createTestApp, makeWav, waitFor } from './test-utils';

/**
 * ATENÇÃO: este provedor é um DUBLÊ usado APENAS nestes testes para validar o pipeline
 * (divisão, processamento assíncrono, erro, retomada). Ele não existe na aplicação real.
 */
let calls: string[] = [];
let failOn: number | null = null; // índice (1-based) da chamada que deve falhar uma vez
let gate: Promise<void> | null = null;
const fake: TtsProvider = {
  id: 'fake-test',
  name: 'Provedor de teste',
  maxCharsPerRequest: 40,
  listVoices: async (lang) => [{ id: 'v1', name: 'Voz 1', language: lang ?? 'pt-BR' }],
  synthesize: async ({ text, speed }) => {
    calls.push(text);
    if (gate) await gate;
    if (failOn === calls.length) {
      failOn = null;
      throw new Error('Falha simulada do provedor de teste');
    }
    expect(speed).toBe(1.25);
    return { data: makeWav(text.length), mimeType: 'audio/wav', durationMs: text.length };
  },
};

let app: NestExpressApplication;
let http: ReturnType<NestExpressApplication['getHttpServer']>;
let scriptId: string;
const CONTENT = 'Primeira frase do roteiro. Segunda frase do roteiro.\n\nTerceira frase, em outro parágrafo, mais longa que o limite.';

beforeAll(async () => {
  ({ app } = await createTestApp({ ttsProvider: fake }));
  http = app.getHttpServer();
  const channelId = (await request(http).post('/api/channels').send({
    name: 'Canal', language: 'pt-BR', niche: 'Nicho', description: '', youtubeHandle: '', brandPrimaryColor: '#000000', brandAccentColor: '#ffffff', brandStyle: '',
  })).body.id;
  scriptId = (await request(http).post('/api/scripts').send({ channelId, title: 'Roteiro longo', language: 'pt-BR', topic: '', content: CONTENT, status: 'draft' })).body.id;
});
afterAll(() => app.close());
beforeEach(() => { calls = []; failOn = null; gate = null; });

const generate = () => request(http).post('/api/audios/generate').send({ scriptId, voiceId: 'v1', settings: { speed: 1.25 } });
const get = async (id: string) => (await request(http).get(`/api/audios/${id}`)).body;

describe('Geração com provedor (dublê de teste)', () => {
  it('expõe provedor e vozes quando configurado', async () => {
    expect((await request(http).get('/api/audios/generation/status')).body).toMatchObject({
      available: true, provider: { id: 'fake-test', maxCharsPerRequest: 40 }, requirements: [],
    });
    expect((await request(http).get('/api/audios/voices?language=pt-BR')).body.voices[0].id).toBe('v1');
  });

  it('divide o roteiro respeitando o limite, processa em segundo plano e junta os WAVs', async () => {
    let release!: () => void;
    gate = new Promise((r) => (release = r));
    const res = await generate().expect(202);
    const id = res.body.id;
    expect(res.body).toMatchObject({ status: 'processing', source: 'provider', providerId: 'fake-test', voiceName: 'Voz 1', settings: { speed: 1.25 }, hasFile: false });
    expect(res.body.partsTotal).toBeGreaterThan(2);

    // enquanto processa: não pode ser aprovado nem excluído, e não tem arquivo
    expect((await get(id)).status).toBe('processing');
    await request(http).put(`/api/audios/${id}`).send({ title: 'Qualquer', approved: true }).expect(400);
    await request(http).delete(`/api/audios/${id}`).expect(409);
    await request(http).get(`/api/audios/${id}/file`).expect(404);

    release();
    const done = await waitFor(() => get(id), (a) => a.status !== 'processing');
    expect(done).toMatchObject({ status: 'completed', hasFile: true, mimeType: 'audio/wav', partsDone: res.body.partsTotal, errorMessage: null });
    expect(calls.every((t) => t.length <= 40)).toBe(true);
    expect(calls).toHaveLength(res.body.partsTotal);
    expect(done.durationMs).toBe(calls.reduce((n, t) => n + t.length, 0));

    const file = await request(http).get(`/api/audios/${id}/file`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = []; r.on('data', (c: Buffer) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect((file.body as Buffer).toString('latin1', 0, 4)).toBe('RIFF');
    expect((file.body as Buffer).length).toBe(done.sizeBytes);
    await request(http).delete(`/api/audios/${id}`).expect(204);
  });

  it('falha em uma parte: vira erro, preserva o progresso e retoma da parte que falhou', async () => {
    failOn = 2;
    const res = await generate().expect(202);
    const id = res.body.id;
    const failed = await waitFor(() => get(id), (a) => a.status !== 'processing');
    expect(failed).toMatchObject({ status: 'error', partsDone: 1, hasFile: false });
    expect(failed.errorMessage).toBe('Falha simulada do provedor de teste');
    await request(http).put(`/api/audios/${id}`).send({ title: 'Qualquer', approved: true }).expect(400);

    const callsBefore = calls.length;
    await request(http).post(`/api/audios/${id}/retry`).expect(202);
    const ok = await waitFor(() => get(id), (a) => a.status !== 'processing');
    expect(ok.status).toBe('completed');
    expect(calls.length - callsBefore).toBe(res.body.partsTotal - 1); // a parte 1 não foi refeita
    await request(http).post(`/api/audios/${id}/retry`).expect(409); // só áudios com erro
    await request(http).delete(`/api/audios/${id}`).expect(204);
  });

  it('após reinício, "processando" órfão vira erro', async () => {
    const { AudiosRepository } = await import('./audios.repository');
    const { AudioGenerationService } = await import('./audio-generation.service');
    const repo = app.get(AudiosRepository);
    const sc = (await request(http).get(`/api/scripts/${scriptId}`)).body;
    const rec = repo.create('local', { channelId: sc.channelId, scriptId, title: 'Órfão', language: 'pt-BR', status: 'processing', source: 'provider', providerId: 'fake-test' });
    app.get(AudioGenerationService).onModuleInit();
    expect(await get(rec.id)).toMatchObject({ status: 'error', errorMessage: expect.stringMatching(/reiniciado/) });
  });

  it('valida voz e roteiro', async () => {
    const v = await request(http).post('/api/audios/generate').send({ scriptId, voiceId: 'inexistente' }).expect(400);
    expect(v.body.issues[0].path).toBe('voiceId');
    const s = await request(http).post('/api/audios/generate').send({ scriptId: 'x', voiceId: 'v1' }).expect(400);
    expect(s.body.issues[0].path).toBe('scriptId');
  });
});

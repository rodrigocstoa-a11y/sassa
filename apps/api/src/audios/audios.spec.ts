import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { createTestApp, fakeMp3, makeWav } from './test-utils';

let app: NestExpressApplication;
let http: ReturnType<NestExpressApplication['getHttpServer']>;
let root: string;
let channelId: string;
let scriptId: string;
let otherScriptId: string;
let otherChannelId: string;

const channel = (name: string) => ({
  name, language: 'pt-BR', niche: 'História', description: '', youtubeHandle: '',
  brandPrimaryColor: '#7c5cff', brandAccentColor: '#22d3ee', brandStyle: '',
});
const script = (cid: string, over: Record<string, unknown> = {}) => ({
  channelId: cid, title: 'A queda de Roma', language: 'pt-BR', topic: 'Roma', content: 'Texto do roteiro.', status: 'draft', ...over,
});
const upload = (body: Buffer, qs: Record<string, string>, type = 'audio/mpeg') =>
  request(http).post(`/api/audios/upload?${new URLSearchParams(qs)}`).set('Content-Type', type).send(body);

beforeAll(async () => {
  ({ app, storageRoot: root } = await createTestApp());
  http = app.getHttpServer();
  channelId = (await request(http).post('/api/channels').send(channel('Canal A'))).body.id;
  otherChannelId = (await request(http).post('/api/channels').send(channel('Canal B'))).body.id;
  scriptId = (await request(http).post('/api/scripts').send(script(channelId))).body.id;
  otherScriptId = (await request(http).post('/api/scripts').send(script(otherChannelId, { title: 'Vikings', language: 'es' }))).body.id;
});
afterAll(() => app.close());

describe('Áudios: importação e biblioteca', () => {
  let mp3Id: string;
  let wavId: string;

  it('importa MP3 vinculado ao roteiro e ao canal (herdados do roteiro)', async () => {
    const res = await upload(fakeMp3(), { scriptId, title: 'Narração Roma', filename: 'roma.mp3', durationMs: '65000' }).expect(201);
    mp3Id = res.body.id;
    expect(res.body).toMatchObject({
      scriptId, channelId, channelName: 'Canal A', scriptTitle: 'A queda de Roma', language: 'pt-BR',
      status: 'completed', source: 'upload', mimeType: 'audio/mpeg', durationMs: 65000, originalFilename: 'roma.mp3',
      hasFile: true, approvedAt: null, scriptOutdated: false,
    });
    expect(res.body.sizeBytes).toBe(fakeMp3().length);
    expect(res.body).not.toHaveProperty('fileKey');
  });

  it('importa WAV e guarda o arquivo no armazenamento com nome gerado pelo servidor', async () => {
    const res = await upload(makeWav(500), { scriptId: otherScriptId, title: 'Vikings ES' }, 'audio/wav').expect(201);
    wavId = res.body.id;
    expect(res.body).toMatchObject({ language: 'es', channelId: otherChannelId, mimeType: 'audio/wav' });
    const file = await request(http).get(`/api/audios/${wavId}/file`).expect(200);
    expect(file.headers['content-type']).toMatch(/audio\/(x-)?wav/);
  });

  it('valida o formato pelos bytes, não pelo Content-Type', async () => {
    const txt = await upload(Buffer.from('isto não é áudio, apesar do tipo'), { scriptId, title: 'Falso' }).expect(415);
    expect(txt.body.message).toMatch(/Formato de áudio não reconhecido/);
    await upload(Buffer.alloc(0), { scriptId, title: 'Vazio' }).expect(400);
  });

  it('valida metadados e roteiro; respeita o limite de tamanho', async () => {
    const bad = await upload(fakeMp3(), { scriptId: 'nao-existe', title: 'X1' }).expect(400);
    expect(bad.body.issues[0].path).toBe('scriptId');
    await upload(fakeMp3(), { scriptId, title: 'a' }).expect(400);
    await upload(Buffer.concat([fakeMp3(), Buffer.alloc(1.2 * 1024 * 1024)]), { scriptId, title: 'Gigante' }).expect(413);
    expect((await request(http).get('/api/audios').expect(200)).body.total).toBe(2); // nada vazou para o banco
    expect(existsSync(join(root, '.tmp')) ? require('node:fs').readdirSync(join(root, '.tmp')) : []).toEqual([]);
  });

  it('lista com filtros e pesquisa sem acentos', async () => {
    const q = async (qs: string) => (await request(http).get(`/api/audios?${qs}`).expect(200)).body.items.map((a: { title: string }) => a.title);
    expect(await q('')).toEqual(['Vikings ES', 'Narração Roma']);
    expect(await q(`channelId=${channelId}`)).toEqual(['Narração Roma']);
    expect(await q(`scriptId=${otherScriptId}`)).toEqual(['Vikings ES']);
    expect(await q('language=es')).toEqual(['Vikings ES']);
    expect(await q('status=completed')).toHaveLength(2);
    expect(await q('status=error')).toEqual([]);
    expect(await q('q=NARRACAO')).toEqual(['Narração Roma']);
    expect(await q('q=vikings')).toEqual(['Vikings ES']); // título do roteiro
    expect(await q('q=roma.mp3')).toEqual(['Narração Roma']); // nome do arquivo
    expect(await q('approval=approved')).toEqual([]);
    await request(http).get('/api/audios?status=xx').expect(400);
  });

  it('serve o arquivo com Range (pausar/avançar) e permite download', async () => {
    const range = await request(http).get(`/api/audios/${mp3Id}/file`).set('Range', 'bytes=0-9').expect(206);
    expect(range.headers['content-range']).toBe(`bytes 0-9/${fakeMp3().length}`);
    expect(range.headers['accept-ranges']).toBe('bytes');
    const dl = await request(http).get(`/api/audios/${mp3Id}/file?download=1`).expect(200);
    expect(dl.headers['content-disposition']).toMatch(/attachment; filename="Narração Roma\.mp3"|filename\*=UTF-8''Narra/);
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
  });

  it('aprova e renomeia', async () => {
    const res = await request(http).put(`/api/audios/${mp3Id}`).send({ title: 'Roma final', approved: true }).expect(200);
    expect(res.body).toMatchObject({ title: 'Roma final', approvedAt: expect.any(String) });
    expect(await request(http).get('/api/audios?approval=approved').then((r) => r.body.items.length)).toBe(1);
    const back = await request(http).put(`/api/audios/${mp3Id}`).send({ title: 'Roma final', approved: false }).expect(200);
    expect(back.body.approvedAt).toBeNull();
    await request(http).put(`/api/audios/${mp3Id}`).send({ title: '', approved: false }).expect(400);
    await request(http).put('/api/audios/x').send({ title: 'Ok ok', approved: false }).expect(404);
  });

  it('marca o áudio quando o roteiro é alterado depois', async () => {
    await new Promise((r) => setTimeout(r, 10));
    await request(http).put(`/api/scripts/${scriptId}`).send(script(channelId, { content: 'Roteiro mudou.' })).expect(200);
    expect((await request(http).get(`/api/audios/${mp3Id}`)).body.scriptOutdated).toBe(true);
  });

  it('protege roteiro e canal que possuem áudios', async () => {
    await request(http).delete(`/api/scripts/${scriptId}`).expect(409);
    await request(http).put(`/api/scripts/${scriptId}`).send(script(channelId, { language: 'en' })).expect(409);
    await request(http).put(`/api/scripts/${scriptId}`).send(script(otherChannelId)).expect(409);
    await request(http).delete(`/api/channels/${channelId}`).expect(409);
  });

  it('exclui o áudio e o arquivo; depois o roteiro pode ser excluído', async () => {
    const file = join(root, 'audio', 'local');
    const before = require('node:fs').readdirSync(file).length;
    await request(http).delete(`/api/audios/${mp3Id}`).expect(204);
    expect(require('node:fs').readdirSync(file).length).toBe(before - 1);
    await request(http).get(`/api/audios/${mp3Id}/file`).expect(404);
    await request(http).delete(`/api/audios/${mp3Id}`).expect(404);
    await request(http).delete(`/api/scripts/${scriptId}`).expect(204);
  });

  it('o dashboard conta os áudios reais', async () => {
    expect((await request(http).get('/api/dashboard/summary')).body.audios).toBe(1);
  });
});

describe('CORS do envio direto', () => {
  it('autoriza o painel e nega outras origens', async () => {
    const ok = await request(http).options('/api/audios/upload').set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type').expect(204);
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const bad = await request(http).options('/api/audios/upload').set('Origin', 'https://site-malicioso.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Áudios: geração automática não configurada', () => {
  it('explica o que falta', async () => {
    const res = await request(http).get('/api/audios/generation/status').expect(200);
    expect(res.body).toMatchObject({ available: false, provider: null });
    expect(res.body.requirements.join(' ')).toMatch(/Talkify Labs/);
    expect(res.body.requirements.length).toBeGreaterThanOrEqual(3);
    const voices = await request(http).get('/api/audios/voices?language=es').expect(200);
    expect(voices.body).toMatchObject({ available: false, voices: [] });
  });

  it('responde 501 e não cria nenhum registro', async () => {
    const res = await request(http).post('/api/audios/generate').send({ scriptId: otherScriptId, voiceId: 'v1' }).expect(501);
    expect(res.body.code).toBe('TTS_NOT_CONFIGURED');
    expect(res.body.requirements.length).toBeGreaterThan(0);
    expect((await request(http).get('/api/audios')).body.total).toBe(1);
    await request(http).post(`/api/audios/${'x'}/retry`).expect(501);
    await request(http).post('/api/audios/generate').send({ voiceId: '' }).expect(400);
  });
});

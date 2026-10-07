import 'reflect-metadata';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { createTestApp, fakeMp3, makeWav, uploadAudio } from '../test/test-utils';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let http: typeof ctx.http;
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

beforeAll(async () => {
  ctx = await createTestApp();
  http = ctx.http;
  root = ctx.storageRoot;
  channelId = (await request(http).post('/api/channels').send(channel('Canal A'))).body.id;
  otherChannelId = (await request(http).post('/api/channels').send(channel('Canal B'))).body.id;
  scriptId = (await request(http).post('/api/scripts').send(script(channelId))).body.id;
  otherScriptId = (await request(http).post('/api/scripts').send(script(otherChannelId, { title: 'Vikings', language: 'es' }))).body.id;
});
afterAll(() => ctx.close());

describe('Áudios: importação e biblioteca', () => {
  let mp3Id: string;
  let wavId: string;

  it('importa MP3 vinculado ao roteiro e ao canal (herdados do roteiro)', async () => {
    const { init, put, complete } = await uploadAudio(http, fakeMp3(), { scriptId, title: 'Narração Roma', filename: 'roma.mp3', durationMs: 65000 });
    expect(init!.status).toBe(201);
    expect(init!.body).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'audio/mpeg' }, expiresInSec: 3600 });
    expect(put!.status).toBe(200);
    expect(complete!.status).toBe(201);
    mp3Id = complete!.body.id;
    expect(complete!.body).toMatchObject({
      scriptId, channelId, channelName: 'Canal A', scriptTitle: 'A queda de Roma', language: 'pt-BR',
      status: 'completed', source: 'upload', mimeType: 'audio/mpeg', durationMs: 65000, originalFilename: 'roma.mp3',
      hasFile: true, approvedAt: null, scriptOutdated: false, sizeBytes: fakeMp3().length,
    });
    expect(complete!.body).not.toHaveProperty('fileKey');
  });

  it('importa WAV; o idioma vem do roteiro e a chave é gerada pelo servidor', async () => {
    const { complete } = await uploadAudio(http, makeWav(500), { scriptId: otherScriptId, title: 'Vikings ES', contentType: 'audio/wav' });
    wavId = complete!.body.id;
    expect(complete!.body).toMatchObject({ language: 'es', channelId: otherChannelId, mimeType: 'audio/wav' });
    const file = await request(http).get(`/api/audios/${wavId}/file`).expect(200);
    expect(file.headers['content-type']).toMatch(/audio\/(x-)?wav/);
  });

  it('a conclusão é idempotente e não duplica o registro', async () => {
    const init = (await request(http).post('/api/audios/uploads').send({ scriptId, title: 'Idempotente', contentType: 'audio/mpeg', size: fakeMp3().length })).body;
    const url = new URL(init.uploadUrl);
    await request(http).put(url.pathname + url.search).set(init.headers).send(fakeMp3()).expect(200);
    const a = await request(http).post('/api/audios/uploads/complete').send({ uploadToken: init.uploadToken }).expect(201);
    const b = await request(http).post('/api/audios/uploads/complete').send({ uploadToken: init.uploadToken }).expect(201);
    expect(b.body.id).toBe(a.body.id);
    await request(http).delete(`/api/audios/${a.body.id}`).expect(204);
  });

  it('valida o formato pelos bytes, não pelo Content-Type, e apaga o arquivo recusado', async () => {
    const before = readdirSync(join(root, 'audio', 'local')).length;
    const { complete } = await uploadAudio(http, Buffer.from('isto não é áudio, apesar do tipo'), { scriptId, title: 'Falso' });
    expect(complete!.status).toBe(415);
    expect(complete!.body.message).toMatch(/Formato de áudio não reconhecido/);
    expect(readdirSync(join(root, 'audio', 'local')).length).toBe(before);
  });

  it('valida metadados, tamanho e roteiro', async () => {
    const bad = await uploadAudio(http, fakeMp3(), { scriptId: 'nao-existe', title: 'X1' });
    expect(bad.init!.status).toBe(400);
    expect(bad.init!.body.issues[0].path).toBe('scriptId');
    expect((await uploadAudio(http, fakeMp3(), { scriptId, title: 'a' })).init!.status).toBe(400);
    expect((await request(http).post('/api/audios/uploads').send({ scriptId, title: 'Vazio ok', contentType: 'audio/mpeg', size: 0 })).status).toBe(400);
    expect((await request(http).post('/api/audios/uploads').send({ scriptId, title: 'Gigante', contentType: 'audio/mpeg', size: Math.round(1.2 * 1024 * 1024) })).status).toBe(413);
  });

  it('recusa arquivo maior que o declarado, token adulterado e conclusão sem envio', async () => {
    const init = (await request(http).post('/api/audios/uploads').send({ scriptId, title: 'Tamanho', contentType: 'audio/mpeg', size: 100 })).body;
    const url = new URL(init.uploadUrl);
    await request(http).put(url.pathname + url.search).set(init.headers).send(fakeMp3()).expect(413); // 2 KB > 100 B declarados
    await request(http).post('/api/audios/uploads/complete').send({ uploadToken: init.uploadToken }).expect(400); // nada foi enviado
    await request(http).post('/api/audios/uploads/complete').send({ uploadToken: init.uploadToken + 'x' }).expect(400);
    await request(http).put('/api/storage/upload?token=invalido').send(fakeMp3()).expect(403);
    expect(existsSync(join(root, '.tmp')) ? readdirSync(join(root, '.tmp')) : []).toEqual([]);
    expect((await request(http).get('/api/audios').expect(200)).body.total).toBe(2); // nada vazou para o banco
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
    expect(await q('q=vikings')).toEqual(['Vikings ES']);
    expect(await q('q=roma.mp3')).toEqual(['Narração Roma']);
    expect(await q('approval=approved')).toEqual([]);
    await request(http).get('/api/audios?status=xx').expect(400);
  });

  it('serve o arquivo com Range (pausar/avançar) e permite download', async () => {
    const range = await request(http).get(`/api/audios/${mp3Id}/file`).set('Range', 'bytes=0-9').expect(206);
    expect(range.headers['content-range']).toBe(`bytes 0-9/${fakeMp3().length}`);
    const dl = await request(http).get(`/api/audios/${mp3Id}/file?download=1`).expect(200);
    expect(dl.headers['content-disposition']).toMatch(/attachment; filename="Narração Roma\.mp3"|filename\*=UTF-8''Narra/);
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
  });

  it('aprova e renomeia', async () => {
    const res = await request(http).put(`/api/audios/${mp3Id}`).send({ title: 'Roma final', approved: true }).expect(200);
    expect(res.body).toMatchObject({ title: 'Roma final', approvedAt: expect.any(String) });
    expect((await request(http).get('/api/audios?approval=approved')).body.items).toHaveLength(1);
    expect((await request(http).put(`/api/audios/${mp3Id}`).send({ title: 'Roma final', approved: false })).body.approvedAt).toBeNull();
    await request(http).put(`/api/audios/${mp3Id}`).send({ title: '', approved: false }).expect(400);
    await request(http).put('/api/audios/x').send({ title: 'Ok ok', approved: false }).expect(404);
  });

  it('marca o áudio quando o roteiro é alterado depois', async () => {
    await new Promise((r) => setTimeout(r, 15));
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
    const dir = join(root, 'audio', 'local');
    const before = readdirSync(dir).length;
    await request(http).delete(`/api/audios/${mp3Id}`).expect(204);
    expect(readdirSync(dir).length).toBe(before - 1);
    await request(http).get(`/api/audios/${mp3Id}/file`).expect(404);
    await request(http).delete(`/api/audios/${mp3Id}`).expect(404);
    await request(http).delete(`/api/scripts/${scriptId}`).expect(204);
  });

  it('o dashboard conta os áudios reais', async () => {
    expect((await request(http).get('/api/dashboard/summary')).body.audios).toBe(1);
  });
});

describe('CORS', () => {
  it('autoriza o painel (com credenciais) e nega outras origens', async () => {
    const ok = await request(http).options('/api/storage/upload').set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'PUT').set('Access-Control-Request-Headers', 'content-type').expect(204);
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const bad = await request(http).options('/api/storage/upload').set('Origin', 'https://site-malicioso.example').set('Access-Control-Request-Method', 'PUT');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('recusa alterações vindas de outra origem (defesa contra CSRF)', async () => {
    await request(http).post('/api/channels').set('Origin', 'https://site-malicioso.example').send(channel('X')).expect(403);
  });
});

describe('Áudios: geração automática não configurada', () => {
  it('explica o que falta', async () => {
    const res = await request(http).get('/api/audios/generation/status').expect(200);
    expect(res.body).toMatchObject({ available: false, provider: null });
    expect(res.body.requirements.join(' ')).toMatch(/Talkify Labs/);
    expect(res.body.requirements.join(' ')).toMatch(/orçamento/i);
    expect((await request(http).get('/api/audios/voices?language=es').expect(200)).body).toMatchObject({ available: false, voices: [] });
  });

  it('responde 501 e não cria nenhum registro nem job', async () => {
    const res = await request(http).post('/api/audios/generate').send({ scriptId: otherScriptId, voiceId: 'v1', approvedMaxCostUsd: 5 }).expect(501);
    expect(res.body.code).toBe('TTS_NOT_CONFIGURED');
    expect((await request(http).get('/api/audios')).body.total).toBe(1);
    expect((await request(http).get('/api/jobs')).body).toEqual([]);
    await request(http).post('/api/audios/generation/estimate').send({ scriptId: otherScriptId, voiceId: 'v1' }).expect(501);
    await request(http).post('/api/audios/x/retry').send({}).expect(501);
    await request(http).post('/api/audios/generate').send({ voiceId: '' }).expect(400);
  });
});

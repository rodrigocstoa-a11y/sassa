import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

let app: NestExpressApplication;
let http: ReturnType<NestExpressApplication['getHttpServer']>;
let channelId: string;
let otherChannelId: string;

const channel = (name: string) => ({
  name, language: 'pt-BR', niche: 'História', description: '', youtubeHandle: '',
  brandPrimaryColor: '#7c5cff', brandAccentColor: '#22d3ee', brandStyle: '',
});
const script = (over: Record<string, unknown> = {}) => ({
  channelId, title: 'A queda de Roma', language: 'pt-BR', topic: 'Império Romano',
  content: 'Era uma vez um império.\n\nSegundo parágrafo.', status: 'draft', ...over,
});

beforeAll(async () => {
  process.env.DATABASE_PATH = ':memory:';
  const { AppModule } = await import('../app.module');
  const { configureApp } = await import('../configure-app');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  http = app.getHttpServer();
  channelId = (await request(http).post('/api/channels').send(channel('Canal A'))).body.id;
  otherChannelId = (await request(http).post('/api/channels').send(channel('Canal B'))).body.id;
});
afterAll(() => app.close());

describe('Roteiros: CRUD e regras', () => {
  let id: string;

  it('cria vinculado ao canal, com contagem de palavras', async () => {
    const res = await request(http).post('/api/scripts').send(script()).expect(201);
    id = res.body.id;
    expect(res.body).toMatchObject({ channelId, status: 'draft', wordCount: 7, sourceScriptId: null, translations: [], outdated: false });
  });

  it('rejeita canal inexistente e dados inválidos', async () => {
    const bad = await request(http).post('/api/scripts').send(script({ channelId: 'nao-existe' })).expect(400);
    expect(bad.body.issues[0].path).toBe('channelId');
    await request(http).post('/api/scripts').send(script({ title: '', status: 'x' })).expect(400);
    await request(http).post('/api/scripts').send(script({ content: '', status: 'approved' })).expect(400);
  });

  it('edita e controla approvedAt conforme o status', async () => {
    const approved = await request(http).put(`/api/scripts/${id}`).send(script({ status: 'approved', title: 'Roma 2' })).expect(200);
    expect(approved.body.title).toBe('Roma 2');
    expect(approved.body.approvedAt).toEqual(expect.any(String));
    const back = await request(http).put(`/api/scripts/${id}`).send(script({ status: 'in_review' })).expect(200);
    expect(back.body.approvedAt).toBeNull();
  });

  it('preserva a formatação e aceita um roteiro longo (600 mil caracteres)', async () => {
    const long = ('palavra '.repeat(99) + 'fim\n').repeat(1000).slice(0, 600_000);
    const res = await request(http).post('/api/scripts').send(script({ title: 'Longo', content: long })).expect(201);
    const got = await request(http).get(`/api/scripts/${res.body.id}`).expect(200);
    expect(got.body.content).toBe(long);
    expect(got.body.wordCount).toBeGreaterThan(70_000);
    await request(http).post('/api/scripts').send(script({ content: 'x'.repeat(1_000_001) })).expect(400);
    await request(http).delete(`/api/scripts/${res.body.id}`).expect(204);
  });

  it('lista sem o conteúdo e pesquisa ignorando acentos e caixa', async () => {
    await request(http).post('/api/scripts').send(script({ channelId: otherChannelId, title: 'Vikings', topic: 'Escandinávia', content: 'Navegadores do norte' })).expect(201);
    const all = await request(http).get('/api/scripts').expect(200);
    expect(all.body.total).toBe(2);
    expect(all.body.items[0]).not.toHaveProperty('content');
    const q = async (qs: string) => (await request(http).get(`/api/scripts?${qs}`).expect(200)).body.items.map((s: { title: string }) => s.title);
    expect(await q('q=IMPERIO')).toEqual(['A queda de Roma']);
    expect(await q('q=escandinavia')).toEqual(['Vikings']);
    expect(await q('q=navegadores%20norte')).toEqual(['Vikings']);
    expect(await q('q=%25')).toEqual([]); // % é literal, não curinga
    expect(await q(`channelId=${otherChannelId}`)).toEqual(['Vikings']);
    expect(await q('status=in_review')).toEqual(['A queda de Roma']);
    await request(http).get('/api/scripts?status=invalido').expect(400);
  });

  it('retorna 404 para roteiro inexistente', async () => {
    await request(http).get('/api/scripts/x').expect(404);
    await request(http).put('/api/scripts/x').send(script()).expect(404);
    await request(http).delete('/api/scripts/x').expect(404);
  });

  describe('traduções', () => {
    let tid: string;

    it('cria tradução vazia vinculada ao original', async () => {
      const res = await request(http).post(`/api/scripts/${id}/translations`).send({ language: 'es' }).expect(201);
      tid = res.body.id;
      expect(res.body).toMatchObject({ sourceScriptId: id, language: 'es', status: 'draft', content: '', channelId, outdated: false });
      expect(res.body.source.id).toBe(id);
      const orig = await request(http).get(`/api/scripts/${id}`).expect(200);
      expect(orig.body.translations.map((t: { language: string }) => t.language)).toEqual(['es']);
    });

    it('impede duplicata, mesmo idioma e tradução de tradução', async () => {
      await request(http).post(`/api/scripts/${id}/translations`).send({ language: 'es' }).expect(409);
      await request(http).post(`/api/scripts/${id}/translations`).send({ language: 'pt-BR' }).expect(400);
      await request(http).post(`/api/scripts/${tid}/translations`).send({ language: 'it' }).expect(400);
      await request(http).post(`/api/scripts/${id}/translations`).send({ language: 'zz' }).expect(400);
    });

    it('marca a tradução como desatualizada quando o original muda depois', async () => {
      await request(http).put(`/api/scripts/${id}`).send(script({ status: 'in_review', content: 'Texto novo do original' })).expect(200);
      expect((await request(http).get(`/api/scripts/${tid}`)).body.outdated).toBe(true);
      const t = (await request(http).get(`/api/scripts/${tid}`)).body;
      const saved = await request(http).put(`/api/scripts/${tid}`).send({ channelId, title: t.title, language: 'es', topic: t.topic, content: 'Texto traducido', status: 'draft' }).expect(200);
      expect(saved.body.outdated).toBe(false);
    });

    it('protege canal/idioma de traduções e de originais com traduções', async () => {
      await request(http).put(`/api/scripts/${tid}`).send(script({ language: 'it' })).expect(400);
      await request(http).put(`/api/scripts/${tid}`).send(script({ language: 'es', channelId: otherChannelId })).expect(400);
      await request(http).put(`/api/scripts/${id}`).send(script({ channelId: otherChannelId, status: 'in_review' })).expect(409);
      await request(http).put(`/api/scripts/${id}`).send(script({ language: 'en', status: 'in_review' })).expect(409);
    });

    it('não exclui original com traduções nem canal com roteiros', async () => {
      await request(http).delete(`/api/scripts/${id}`).expect(409);
      await request(http).delete(`/api/channels/${channelId}`).expect(409);
    });

    it('permite excluir tradução, depois original, depois canal', async () => {
      await request(http).delete(`/api/scripts/${tid}`).expect(204);
      await request(http).delete(`/api/scripts/${id}`).expect(204);
      await request(http).delete(`/api/channels/${channelId}`).expect(204);
    });
  });

  describe('geração automática (não configurada)', () => {
    it('informa que não está disponível', async () => {
      const res = await request(http).get('/api/scripts/generation/status').expect(200);
      expect(res.body).toMatchObject({ available: false, provider: null });
      expect(res.body.reason).toMatch(/não está configurada/);
    });

    it('responde 501 e nunca devolve texto simulado', async () => {
      const res = await request(http)
        .post('/api/scripts/generate')
        .send({ channelId: otherChannelId, topic: 'Vikings', language: 'pt-BR', targetMinutes: 20, narrativeStyle: 'documentário' })
        .expect(501);
      expect(res.body.code).toBe('LLM_NOT_CONFIGURED');
      expect(res.body).not.toHaveProperty('content');
    });

    it('valida o pedido antes', async () => {
      await request(http).post('/api/scripts/generate').send({ topic: '' }).expect(400);
    });
  });
});

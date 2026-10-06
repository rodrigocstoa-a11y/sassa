import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

let app: NestExpressApplication;
const valid = {
  name: 'Histórias Antigas',
  language: 'pt-BR',
  niche: 'História',
  description: 'Documentários',
  youtubeHandle: '@historias',
  brandPrimaryColor: '#7c5cff',
  brandAccentColor: '#22d3ee',
  brandStyle: 'Sépia, cinematográfico',
};

beforeAll(async () => {
  process.env.DATABASE_PATH = ':memory:';
  const { AppModule } = await import('../app.module');
  const { configureApp } = await import('../configure-app');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
});

afterAll(() => app.close());

describe('Canais (CRUD)', () => {
  it('começa vazio', async () => {
    const res = await request(app.getHttpServer()).get('/api/channels').expect(200);
    expect(res.body).toEqual([]);
  });

  it('cria, lista, busca, edita e exclui', async () => {
    const http = app.getHttpServer();
    const created = await request(http).post('/api/channels').send(valid).expect(201);
    expect(created.body).toMatchObject({ ...valid, ownerId: 'local' });
    const id = created.body.id as string;

    const list = await request(http).get('/api/channels').expect(200);
    expect(list.body).toHaveLength(1);
    await request(http).get(`/api/channels/${id}`).expect(200);

    const updated = await request(http).put(`/api/channels/${id}`).send({ ...valid, name: 'Novo Nome' }).expect(200);
    expect(updated.body.name).toBe('Novo Nome');

    const summary = await request(http).get('/api/dashboard/summary').expect(200);
    expect(summary.body.channels).toBe(1);
    expect(summary.body.videos).toBeNull();

    await request(http).delete(`/api/channels/${id}`).expect(204);
    await request(http).get(`/api/channels/${id}`).expect(404);
    await request(http).delete(`/api/channels/${id}`).expect(404);
  });

  it('rejeita dados inválidos com detalhes', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/channels')
      .send({ ...valid, name: '', language: 'xx' })
      .expect(400);
    expect(res.body.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(['name', 'language']));
  });

  it('retorna 404 ao editar canal inexistente', async () => {
    await request(app.getHttpServer()).put('/api/channels/nao-existe').send(valid).expect(404);
  });

  it('health e provedores refletem que nada está integrado', async () => {
    const http = app.getHttpServer();
    expect((await request(http).get('/api/health').expect(200)).body.status).toBe('ok');
    const providers = (await request(http).get('/api/providers').expect(200)).body;
    expect(providers).toHaveLength(3);
    expect(providers.every((p: { configured: boolean }) => !p.configured)).toBe(true);
  });
});

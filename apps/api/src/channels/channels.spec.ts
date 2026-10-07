import 'reflect-metadata';
import request from 'supertest';
import { createTestApp } from '../test/test-utils';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let http: typeof ctx.http;
const valid = {
  name: 'Histórias Antigas', language: 'pt-BR', niche: 'História', description: 'Documentários', youtubeHandle: '@historias',
  brandPrimaryColor: '#7c5cff', brandAccentColor: '#22d3ee', brandStyle: 'Sépia, cinematográfico',
};

beforeAll(async () => {
  ctx = await createTestApp();
  http = ctx.http;
});
afterAll(() => ctx.close());

describe('Canais (CRUD)', () => {
  it('começa vazio', async () => {
    expect((await request(http).get('/api/channels').expect(200)).body).toEqual([]);
  });

  it('cria, lista, busca, edita e exclui', async () => {
    const created = await request(http).post('/api/channels').send(valid).expect(201);
    expect(created.body).toMatchObject({ ...valid, ownerId: 'local' });
    const id = created.body.id as string;

    expect((await request(http).get('/api/channels').expect(200)).body).toHaveLength(1);
    await request(http).get(`/api/channels/${id}`).expect(200);

    const updated = await request(http).put(`/api/channels/${id}`).send({ ...valid, name: 'Novo Nome' }).expect(200);
    expect(updated.body.name).toBe('Novo Nome');
    expect(new Date(updated.body.updatedAt) >= new Date(created.body.updatedAt)).toBe(true);

    const summary = await request(http).get('/api/dashboard/summary').expect(200);
    expect(summary.body.channels).toBe(1);
    expect(summary.body.videos).toBeNull();

    await request(http).delete(`/api/channels/${id}`).expect(204);
    await request(http).get(`/api/channels/${id}`).expect(404);
    await request(http).delete(`/api/channels/${id}`).expect(404);
  });

  it('lista do mais novo para o mais antigo', async () => {
    for (const name of ['Primeiro', 'Segundo', 'Terceiro']) await request(http).post('/api/channels').send({ ...valid, name }).expect(201);
    expect((await request(http).get('/api/channels')).body.map((c: { name: string }) => c.name)).toEqual(['Terceiro', 'Segundo', 'Primeiro']);
  });

  it('rejeita dados inválidos com detalhes', async () => {
    const res = await request(http).post('/api/channels').send({ ...valid, name: '', language: 'xx' }).expect(400);
    expect(res.body.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(['name', 'language']));
  });

  it('retorna 404 ao editar canal inexistente', async () => {
    await request(http).put('/api/channels/nao-existe').send(valid).expect(404);
  });

  it('health e provedores refletem que nada está integrado', async () => {
    expect((await request(http).get('/api/health').expect(200)).body).toMatchObject({ status: 'ok', database: 'ok' });
    const providers = (await request(http).get('/api/providers').expect(200)).body;
    expect(providers).toHaveLength(3);
    expect(providers.every((p: { configured: boolean }) => !p.configured)).toBe(true);
  });
});

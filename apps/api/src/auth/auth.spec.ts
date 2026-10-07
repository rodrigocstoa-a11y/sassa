import 'reflect-metadata';
import request from 'supertest';
import { fakeMp3, createTestApp, uploadAudio } from '../test/test-utils';
import { Db } from '../database/db';
import { AuthService } from './auth.service';

const ADMIN = { adminEmail: 'dono@example.com', adminPassword: 'senha-super-segura-123' };
let ctx: Awaited<ReturnType<typeof createTestApp>>;
let http: typeof ctx.http;
const channel = (name: string) => ({
  name, language: 'pt-BR', niche: 'Nicho', description: '', youtubeHandle: '', brandPrimaryColor: '#000000', brandAccentColor: '#ffffff', brandStyle: '',
});
const login = (agent: ReturnType<typeof request.agent>, email = ADMIN.adminEmail, password = ADMIN.adminPassword) =>
  agent.post('/api/auth/login').send({ email, password });

beforeAll(async () => {
  ctx = await createTestApp({ auth: ADMIN });
  http = ctx.http;
});
afterAll(() => ctx.close());

describe('Autenticação', () => {
  it('rotas protegidas exigem login; saúde e estado da sessão são públicos', async () => {
    await request(http).get('/api/health').expect(200);
    expect((await request(http).get('/api/auth/me').expect(200)).body).toEqual({ authRequired: true, user: null });
    for (const path of ['/api/channels', '/api/scripts', '/api/audios', '/api/jobs', '/api/budget', '/api/dashboard/summary']) {
      await request(http).get(path).expect(401);
    }
    await request(http).post('/api/channels').send(channel('X')).expect(401);
  });

  it('login recusa credenciais erradas sem revelar se o e-mail existe', async () => {
    const wrong = await login(request.agent(http), ADMIN.adminEmail, 'senha-errada-12345').expect(401);
    const unknown = await login(request.agent(http), 'ninguem@example.com', 'qualquer-senha-123').expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });

  it('login cria sessão em cookie httpOnly; /me, dados e logout funcionam', async () => {
    const a = request.agent(http);
    const res = await login(a).expect(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/rrn_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(res.body).toEqual({ user: { email: ADMIN.adminEmail, role: 'admin' } });
    expect(JSON.stringify(res.body)).not.toMatch(/hash|password/i);

    expect((await a.get('/api/auth/me')).body).toMatchObject({ authRequired: true, user: { email: ADMIN.adminEmail } });
    const created = await a.post('/api/channels').send(channel('Meu canal')).expect(201);
    expect(created.body.ownerId).not.toBe('local');
    expect((await a.get('/api/channels').expect(200)).body).toHaveLength(1);

    await a.post('/api/auth/logout').expect(204);
    await a.get('/api/channels').expect(401); // sessão revogada no servidor
    expect((await a.get('/api/auth/me')).body.user).toBeNull();
  });

  it('o token da sessão não fica salvo em texto puro', async () => {
    const a = request.agent(http);
    const res = await login(a);
    const token = decodeURIComponent(/rrn_session=([^;]+)/.exec(String(res.headers['set-cookie']))![1]);
    const rows = (await ctx.app.get(Db).execute<{ token_hash: string }>('SELECT token_hash FROM sessions')).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.token_hash === token)).toBe(false);
  });

  it('isola os dados entre usuários', async () => {
    const a = request.agent(http);
    await login(a).expect(200);
    const mine = (await a.post('/api/channels').send(channel('Só do dono')).expect(201)).body;
    const script = (await a.post('/api/scripts').send({ channelId: mine.id, title: 'Segredo', language: 'pt-BR', topic: '', content: 'texto', status: 'draft' }).expect(201)).body;

    await ctx.app.get(AuthService).createUser('visitante@example.com', 'outra-senha-forte-1');
    const b = request.agent(http);
    await login(b, 'visitante@example.com', 'outra-senha-forte-1').expect(200);
    expect((await b.get('/api/channels')).body).toEqual([]);
    expect((await b.get('/api/scripts')).body.total).toBe(0);
    await b.get(`/api/channels/${mine.id}`).expect(404);
    await b.put(`/api/channels/${mine.id}`).send(channel('Invasor')).expect(404);
    await b.delete(`/api/channels/${mine.id}`).expect(404);
    await b.get(`/api/scripts/${script.id}`).expect(404);
    await b.post('/api/scripts').send({ channelId: mine.id, title: 'Invasor', language: 'pt-BR', topic: '', content: '', status: 'draft' }).expect(400);
    expect((await b.get('/api/dashboard/summary')).body.channels).toBe(0);

    // o ticket de envio do usuário A não vale para o B
    const init = (await a.post('/api/audios/uploads').send({ scriptId: script.id, title: 'Áudio A', contentType: 'audio/mpeg', size: 100 }).expect(201)).body;
    await b.post('/api/audios/uploads/complete').send({ uploadToken: init.uploadToken }).expect(400);
  });

  it('o envio por URL assinada funciona sem cookie (a autorização é o token)', async () => {
    const a = request.agent(http);
    await login(a).expect(200);
    const ch = (await a.post('/api/channels').send(channel('Canal envio')).expect(201)).body;
    const sc = (await a.post('/api/scripts').send({ channelId: ch.id, title: 'Roteiro envio', language: 'pt-BR', topic: '', content: 'x', status: 'draft' }).expect(201)).body;
    const init = (await a.post('/api/audios/uploads').send({ scriptId: sc.id, title: 'Com token', contentType: 'audio/mpeg', size: fakeMp3().length }).expect(201)).body;
    const url = new URL(init.uploadUrl);
    await request(http).put(url.pathname + url.search).set(init.headers).send(fakeMp3()).expect(200); // sem cookie
    await a.post('/api/audios/uploads/complete').send({ uploadToken: init.uploadToken }).expect(201);
    await request(http).put('/api/storage/upload?token=invalido').send(fakeMp3()).expect(403);
    void uploadAudio;
  });

  it('bloqueia após 5 senhas erradas seguidas (mesmo IP e e-mail)', async () => {
    const email = 'alvo@example.com';
    for (let i = 0; i < 5; i++) await login(request.agent(http), email, `errada-${i}-xxxxxxx`).expect(401);
    await login(request.agent(http), email, 'errada-final-xxxx').expect(429);
    // outro e-mail não é afetado
    await login(request.agent(http), ADMIN.adminEmail, ADMIN.adminPassword).expect(200);
  });

  it('recusa alterações vindas de outra origem, mesmo com sessão válida (CSRF)', async () => {
    const a = request.agent(http);
    await login(a).expect(200);
    await a.post('/api/channels').set('Origin', 'https://site-malicioso.example').send(channel('CSRF')).expect(403);
    await a.post('/api/channels').set('Origin', 'http://localhost:3000').send(channel('Legítimo')).expect(201);
  });

  it('a senha do administrador é a da variável de ambiente: trocá-la encerra as sessões antigas', async () => {
    const a = request.agent(http);
    await login(a).expect(200);
    const old = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD = 'nova-senha-super-segura-9';
    await ctx.app.get(AuthService).bootstrapAdmin();
    await a.get('/api/channels').expect(401);
    await login(request.agent(http), ADMIN.adminEmail, old).expect(401);
    await login(request.agent(http), ADMIN.adminEmail, 'nova-senha-super-segura-9').expect(200);
    process.env.ADMIN_PASSWORD = old;
    await ctx.app.get(AuthService).bootstrapAdmin();
  });

  it('o primeiro administrador herda os dados criados antes de existir login', async () => {
    const db = ctx.app.get(Db);
    await db.execute('DELETE FROM users'); // simula banco sem usuários
    await db.execute(`INSERT INTO channels (id, owner_id, name, language, niche, brand_primary_color, brand_accent_color, created_at, updated_at)
      VALUES ('legado', 'local', 'Canal antigo', 'pt-BR', 'N', '#000000', '#ffffff', now(), now())`);
    await ctx.app.get(AuthService).bootstrapAdmin();
    const adminId = (await db.execute<{ id: string }>('SELECT id FROM users')).rows[0].id;
    expect((await db.execute<{ owner_id: string }>(`SELECT owner_id FROM channels WHERE id = 'legado'`)).rows[0].owner_id).toBe(adminId);
  });
});

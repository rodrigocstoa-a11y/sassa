import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import request from 'supertest';
import type { TtsProvider } from '@rrn/shared';

export function makeWav(ms: number, rate = 8000): Buffer {
  const samples = Math.round((rate * ms) / 1000);
  const data = Buffer.alloc(samples * 2, 1);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8, 'latin1');
  h.write('fmt ', 12, 'latin1'); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36, 'latin1'); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

export const fakeMp3 = (size = 2048) => Buffer.concat([Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00', 'latin1'), Buffer.alloc(size, 7)]);

export interface TestAppOptions {
  ttsProvider?: TtsProvider;
  /** true = login obrigatório (padrão dos testes é desligado, como em desenvolvimento). */
  auth?: { adminEmail: string; adminPassword: string };
  /** Endpoint de um S3 falso; ausente = armazenamento local em pasta temporária. */
  s3Endpoint?: string;
  /** false = não inicia o worker de jobs (os testes controlam a fila manualmente). */
  runner?: boolean;
}

/**
 * Banco: memória (PGlite) por padrão. Com TEST_DATABASE_URL (URL de um Postgres real, ex.:
 * postgres://postgres@127.0.0.1:5432/postgres) cada app recebe um banco novo e isolado, no servidor real.
 */
async function provisionDatabase(): Promise<{ url?: string; drop: () => Promise<void> }> {
  const admin = process.env.TEST_DATABASE_URL;
  if (!admin) {
    delete process.env.DATABASE_URL;
    process.env.DATABASE_PATH = ':memory:';
    return { drop: async () => {} };
  }
  const name = `rrn_t_${randomBytes(5).toString('hex')}`;
  const c = new Client({ connectionString: admin });
  await c.connect();
  await c.query(`CREATE DATABASE ${name}`);
  await c.end();
  const url = new URL(admin);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  return {
    url: url.toString(),
    drop: async () => {
      const d = new Client({ connectionString: admin });
      await d.connect();
      await d.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await d.end();
    },
  };
}

export async function createTestApp(opts: TestAppOptions = {}) {
  const db = await provisionDatabase();
  const storageRoot = mkdtempSync(join(tmpdir(), 'rrn-storage-'));
  Object.assign(process.env, {
    STORAGE_PATH: storageRoot,
    AUDIO_MAX_MB: '1',
    JOB_POLL_MS: '20',
    JOB_BACKOFF_SEC: '0',
    JOB_LEASE_SEC: '5',
    APP_SECRET: 'x'.repeat(40),
    AUTH_MODE: opts.auth ? 'on' : 'off',
    JOBS_DISABLED: opts.runner === false ? 'true' : 'false',
    STORAGE_DRIVER: opts.s3Endpoint ? 's3' : 'local',
  });
  if (opts.auth) Object.assign(process.env, { ADMIN_EMAIL: opts.auth.adminEmail, ADMIN_PASSWORD: opts.auth.adminPassword });
  else { delete process.env.ADMIN_EMAIL; delete process.env.ADMIN_PASSWORD; }
  if (opts.s3Endpoint) {
    Object.assign(process.env, {
      S3_ENDPOINT: opts.s3Endpoint, S3_BUCKET: 'test-bucket', S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'test-secret', S3_FORCE_PATH_STYLE: 'true',
    });
  }

  const { AppModule } = await import('../app.module');
  const { configureApp } = await import('../configure-app');
  const { TTS_PROVIDER } = await import('../audios/audio-generation.service');
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (opts.ttsProvider) builder = builder.overrideProvider(TTS_PROVIDER).useValue(opts.ttsProvider);
  const mod = await builder.compile();
  const app = mod.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return {
    app,
    http: app.getHttpServer(),
    storageRoot,
    close: async () => {
      await app.close();
      await db.drop();
    },
  };
}

type Http = ReturnType<NestExpressApplication['getHttpServer']>;

/** Fluxo de envio em 2 etapas, como o navegador faz: pede URL, envia o arquivo, conclui. */
export async function uploadAudio(
  http: Http,
  body: Buffer,
  meta: { scriptId: string; title: string; filename?: string; durationMs?: number; contentType?: string; declaredSize?: number },
  agent?: { set(name: string, value: string): unknown },
) {
  const initReq = request(http).post('/api/audios/uploads');
  const init = await initReq.send({
    scriptId: meta.scriptId, title: meta.title, filename: meta.filename, durationMs: meta.durationMs,
    contentType: meta.contentType ?? 'audio/mpeg', size: meta.declaredSize ?? body.length,
  });
  if (init.status !== 201) return { init, put: undefined, complete: undefined };
  const target = init.body as { uploadUrl: string; headers: Record<string, string>; uploadToken: string };
  const url = new URL(target.uploadUrl);
  const isLocal = url.pathname.startsWith('/api/storage/upload');
  const put = isLocal
    ? await request(http).put(url.pathname + url.search).set(target.headers).send(body)
    : await fetch(target.uploadUrl, { method: 'PUT', headers: target.headers, body: new Uint8Array(body) });
  const complete = await request(http).post('/api/audios/uploads/complete').send({ uploadToken: target.uploadToken });
  return { init, put, complete };
}

export async function waitFor<T>(fn: () => Promise<T>, done: (v: T) => boolean, timeoutMs = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (done(v)) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor expirou: ${JSON.stringify(v)}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

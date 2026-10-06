import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

export async function createTestApp(override?: { ttsProvider?: TtsProvider }) {
  process.env.DATABASE_PATH = ':memory:';
  process.env.STORAGE_PATH = mkdtempSync(join(tmpdir(), 'rrn-audio-'));
  process.env.AUDIO_MAX_MB = '1';
  const { AppModule } = await import('../app.module');
  const { configureApp } = await import('../configure-app');
  const { TTS_PROVIDER } = await import('./audio-generation.service');
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (override?.ttsProvider) builder = builder.overrideProvider(TTS_PROVIDER).useValue(override.ttsProvider);
  const mod = await builder.compile();
  const app = mod.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return { app, storageRoot: process.env.STORAGE_PATH };
}

export async function waitFor<T>(fn: () => Promise<T>, done: (v: T) => boolean, timeoutMs = 5000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (done(v)) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor expirou: ${JSON.stringify(v)}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

import { isAbsolute, resolve } from 'node:path';

/** Raiz do repositório (apps/api/{src,dist} -> ../../..). */
export const REPO_ROOT = resolve(__dirname, '../../..');

/** URL do PostgreSQL (produção). Sem ela, usa PGlite local (desenvolvimento e testes). */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || undefined;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Pasta de dados do PGlite (desenvolvimento) ou ':memory:'. */
export function databasePath(): string {
  const configured = process.env.DATABASE_PATH ?? 'data/pglite';
  if (configured === ':memory:' || isAbsolute(configured)) return configured;
  return resolve(REPO_ROOT, configured);
}

export function port(): number {
  return Number(process.env.PORT ?? 3001);
}

/** Pasta dos arquivos gerados/importados (fora do git). */
export function storagePath(): string {
  const configured = process.env.STORAGE_PATH ?? 'storage';
  return isAbsolute(configured) ? configured : resolve(REPO_ROOT, configured);
}

/** Tamanho máximo de um arquivo de áudio importado (padrão 1 GB). */
export function audioMaxBytes(): number {
  return Number(process.env.AUDIO_MAX_MB ?? 1024) * 1024 * 1024;
}

export type StorageDriver = 'local' | 's3';
export function storageDriver(): StorageDriver {
  return process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local';
}

export function s3Config() {
  const need = (name: string) => {
    const v = process.env[name];
    if (!v) throw new Error(`Variável de ambiente ${name} é obrigatória com STORAGE_DRIVER=s3`);
    return v;
  };
  return {
    endpoint: need('S3_ENDPOINT'),
    bucket: need('S3_BUCKET'),
    accessKeyId: need('S3_ACCESS_KEY_ID'),
    secretAccessKey: need('S3_SECRET_ACCESS_KEY'),
    region: process.env.S3_REGION ?? 'auto',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  };
}

/** URL pública da API, usada nas URLs de envio do driver local. */
export function publicApiUrl(): string {
  return (process.env.API_PUBLIC_URL ?? `http://127.0.0.1:${port()}`).replace(/\/$/, '');
}

let devSecret: string | undefined;
/** Segredo para assinar tokens de envio. Em produção é obrigatório (mínimo 32 caracteres). */
export function appSecret(): string {
  const s = process.env.APP_SECRET;
  if (s && s.length >= 32) return s;
  if (isProduction()) throw new Error('APP_SECRET (mínimo 32 caracteres) é obrigatório em produção');
  return (devSecret ??= require('node:crypto').randomBytes(32).toString('hex'));
}

/** ROLE=api (só HTTP), worker (só fila) ou all (padrão). */
export function role(): 'api' | 'worker' | 'all' {
  const r = process.env.ROLE;
  return r === 'api' || r === 'worker' ? r : 'all';
}

/** Autenticação: obrigatória em produção. Em desenvolvimento o padrão é desligada (usuário local único). */
export function authEnabled(): boolean {
  const mode = process.env.AUTH_MODE;
  if (isProduction()) {
    if (mode === 'off') throw new Error('AUTH_MODE=off é proibido em produção');
    return true;
  }
  return mode === 'on';
}

export function sessionTtlSec(): number {
  return Number(process.env.SESSION_TTL_DAYS ?? 30) * 86400;
}

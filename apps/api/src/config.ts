import { isAbsolute, resolve } from 'node:path';

/** Raiz do repositório (apps/api/{src,dist} -> ../../..). */
export const REPO_ROOT = resolve(__dirname, '../../..');

export function databasePath(): string {
  const configured = process.env.DATABASE_PATH ?? 'data/rrn-studio.db';
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

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

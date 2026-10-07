import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;

const derive = (password: string, salt: Buffer, n: number, r: number, p: number) =>
  new Promise<Buffer>((resolve, reject) => {
    const opts: ScryptOptions = { N: n, r, p, maxmem: 128 * n * r * 2 };
    scrypt(password, salt, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });

/** Formato: scrypt$N$r$p$salt$hash (base64). Os parâmetros ficam no hash, permitindo aumentá-los depois. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

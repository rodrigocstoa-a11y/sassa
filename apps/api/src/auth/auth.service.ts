import { ConflictException, Injectable, Logger, OnApplicationBootstrap, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { authEnabled, isProduction, sessionTtlSec } from '../config';
import { Db, iso } from '../database/db';
import { hashPassword, verifyPassword } from './password';

export interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'member';
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const MIN_PASSWORD = 12;
// Hash fixo para gastar o mesmo tempo quando o e-mail não existe (evita descobrir contas pelo tempo de resposta).
let dummyHash: Promise<string> | undefined;

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly log = new Logger(AuthService.name);
  /** Tentativas de login com falha por IP+e-mail (em memória: suficiente para uma instância da API). */
  private readonly failures = new Map<string, { count: number; until: number }>();

  constructor(private readonly db: Db) {}

  async onApplicationBootstrap() {
    if (authEnabled()) await this.bootstrapAdmin();
  }

  /** Cria/atualiza o administrador a partir de ADMIN_EMAIL e ADMIN_PASSWORD (a variável é a fonte da verdade). */
  async bootstrapAdmin() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    const { rows: existing } = await this.db.execute<{ n: string }>('SELECT COUNT(*) AS n FROM users');
    if (!email || !password) {
      if (Number(existing[0].n) === 0 && isProduction()) {
        throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD para criar o primeiro usuário (não há nenhum cadastrado).');
      }
      return;
    }
    if (password.length < MIN_PASSWORD) throw new Error(`ADMIN_PASSWORD deve ter pelo menos ${MIN_PASSWORD} caracteres`);

    const user = (await this.db.execute<{ id: string; password_hash: string }>('SELECT id, password_hash FROM users WHERE lower(email) = $1', [email])).rows[0];
    if (user) {
      if (!(await verifyPassword(password, user.password_hash))) {
        await this.db.execute('UPDATE users SET password_hash = $2 WHERE id = $1', [user.id, await hashPassword(password)]);
        await this.db.execute('DELETE FROM sessions WHERE user_id = $1', [user.id]); // senha trocada: encerra sessões
        this.log.warn('Senha do administrador atualizada a partir da variável de ambiente; sessões antigas encerradas.');
      }
      return;
    }
    const id = randomUUID();
    await this.db.execute(`INSERT INTO users (id, email, password_hash, role, created_at) VALUES ($1, $2, $3, 'admin', now())`, [id, email, await hashPassword(password)]);
    this.log.log(`Administrador ${email} criado`);
    // Primeiro usuário: herda os dados criados antes de existir login (modo local).
    if (Number(existing[0].n) === 0) {
      for (const t of ['channels', 'scripts', 'audios']) await this.db.execute(`UPDATE ${t} SET owner_id = $1 WHERE owner_id = 'local'`, [id]);
    }
  }

  async createUser(email: string, password: string, role: 'admin' | 'member' = 'member'): Promise<AuthUser> {
    const normalized = email.trim().toLowerCase();
    if (password.length < MIN_PASSWORD) throw new ConflictException(`A senha deve ter pelo menos ${MIN_PASSWORD} caracteres`);
    const id = randomUUID();
    try {
      await this.db.execute('INSERT INTO users (id, email, password_hash, role, created_at) VALUES ($1, $2, $3, $4, now())', [id, normalized, await hashPassword(password), role]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new ConflictException('Já existe um usuário com este e-mail');
      throw err;
    }
    return { id, email: normalized, role };
  }

  private failureKey(ip: string, email: string) {
    return `${ip}|${email.trim().toLowerCase()}`;
  }

  /** Retorna o token da sessão. Bloqueia por 15 min após 5 falhas seguidas. */
  async login(email: string, password: string, ip: string): Promise<{ token: string; user: AuthUser; maxAgeSec: number }> {
    const key = this.failureKey(ip, email);
    const f = this.failures.get(key);
    if (f && f.count >= 5 && f.until > Date.now()) {
      throw Object.assign(new UnauthorizedException('Muitas tentativas. Aguarde alguns minutos.'), { status: 429 });
    }
    const row = (await this.db.execute<{ id: string; email: string; role: 'admin' | 'member'; password_hash: string }>(
      'SELECT id, email, role, password_hash FROM users WHERE lower(email) = $1',
      [email.trim().toLowerCase()],
    )).rows[0];
    dummyHash ??= hashPassword('dummy-password-for-timing');
    const ok = await verifyPassword(password, row?.password_hash ?? (await dummyHash));
    if (!row || !ok) {
      this.failures.set(key, { count: (f && f.until > Date.now() ? f.count : 0) + 1, until: Date.now() + 15 * 60_000 });
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }
    this.failures.delete(key);

    const token = randomBytes(32).toString('base64url');
    const maxAgeSec = sessionTtlSec();
    await this.db.execute(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_used_at) VALUES ($1, $2, now(), now() + make_interval(secs => $3), now())`,
      [sha256(token), row.id, maxAgeSec],
    );
    await this.db.execute('UPDATE users SET last_login_at = now() WHERE id = $1', [row.id]);
    // Limpeza oportunista de sessões vencidas.
    await this.db.execute('DELETE FROM sessions WHERE expires_at < now()');
    return { token, user: { id: row.id, email: row.email, role: row.role }, maxAgeSec };
  }

  async validate(token: string): Promise<AuthUser | null> {
    const { rows } = await this.db.execute<{ id: string; email: string; role: 'admin' | 'member' }>(
      `SELECT u.id, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [sha256(token)],
    );
    return rows[0] ?? null;
  }

  async logout(token: string) {
    await this.db.execute('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  }
}

export { iso };

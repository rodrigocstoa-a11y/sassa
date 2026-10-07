import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { BudgetStatus, BudgetUpdate, CostEvent } from '@rrn/shared';
import { OwnerContext } from '../auth/owner-context';
import { Db, iso } from '../database/db';

export class BudgetExceededError extends HttpException {
  constructor(public readonly requestedUsd: number, public readonly status_: BudgetStatus) {
    super(
      {
        message:
          status_.monthlyLimitUsd === null
            ? 'Nenhum orçamento mensal foi definido, então ações pagas estão bloqueadas. Defina um limite em Configurações.'
            : `Orçamento mensal insuficiente: restam US$ ${status_.remainingUsd.toFixed(2)} e a ação custaria cerca de US$ ${requestedUsd.toFixed(2)}.`,
        code: 'BUDGET_EXCEEDED',
        requestedUsd,
        budget: status_,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

/**
 * Orçamento mensal por usuário. Padrão seguro: SEM limite definido = US$ 0 disponíveis,
 * ou seja, nenhuma ação paga acontece até o usuário definir um limite.
 */
@Injectable()
export class BudgetService {
  constructor(
    private readonly db: Db,
    private readonly owner: OwnerContext,
  ) {}

  async status(): Promise<BudgetStatus> {
    const ownerId = this.owner.current();
    const start = monthStart();
    const limit = (await this.db.execute<{ l: string | null }>('SELECT monthly_limit_usd AS l FROM budget_settings WHERE owner_id = $1', [ownerId])).rows[0]?.l;
    const spent = (await this.db.execute<{ s: string }>('SELECT COALESCE(SUM(amount_usd), 0) AS s FROM cost_events WHERE owner_id = $1 AND created_at >= $2', [ownerId, start])).rows[0].s;
    const monthlyLimitUsd = limit == null ? null : Number(limit);
    const spentUsd = Number(spent);
    return { monthlyLimitUsd, spentUsd, remainingUsd: Math.max(0, (monthlyLimitUsd ?? 0) - spentUsd), periodStart: start.toISOString() };
  }

  async setLimit(update: BudgetUpdate): Promise<BudgetStatus> {
    await this.db.execute(
      `INSERT INTO budget_settings (owner_id, monthly_limit_usd, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (owner_id) DO UPDATE SET monthly_limit_usd = EXCLUDED.monthly_limit_usd, updated_at = now()`,
      [this.owner.current(), update.monthlyLimitUsd],
    );
    return this.status();
  }

  /** Lança BudgetExceededError (HTTP 402) se `amountUsd` não cabe no orçamento do mês. */
  async assertCanSpend(amountUsd: number): Promise<void> {
    const s = await this.status();
    if (amountUsd > 0 && (s.monthlyLimitUsd === null || amountUsd > s.remainingUsd + 1e-9)) throw new BudgetExceededError(amountUsd, s);
  }

  async record(e: { providerKind: CostEvent['providerKind']; providerId: string; description: string; amountUsd: number; jobId?: string }) {
    await this.db.execute(
      'INSERT INTO cost_events (id, owner_id, provider_kind, provider_id, description, amount_usd, job_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [randomUUID(), this.owner.current(), e.providerKind, e.providerId, e.description, e.amountUsd, e.jobId ?? null],
    );
  }

  async events(limit = 50): Promise<CostEvent[]> {
    const { rows } = await this.db.execute<any>('SELECT * FROM cost_events WHERE owner_id = $1 ORDER BY created_at DESC LIMIT $2', [this.owner.current(), limit]);
    return rows.map((r) => ({
      id: r.id, providerKind: r.provider_kind, providerId: r.provider_id, description: r.description,
      amountUsd: Number(r.amount_usd), jobId: r.job_id, createdAt: iso(r.created_at),
    }));
  }
}

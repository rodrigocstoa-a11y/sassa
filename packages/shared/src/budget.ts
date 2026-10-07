import { z } from 'zod';

export const budgetUpdateSchema = z.object({
  /** null = sem orçamento definido: nenhuma ação paga é permitida. */
  monthlyLimitUsd: z.number().min(0).max(1_000_000).nullable(),
});
export type BudgetUpdate = z.infer<typeof budgetUpdateSchema>;

export interface BudgetStatus {
  /** Limite mensal em US$. null = não definido (gastos pagos bloqueados). */
  monthlyLimitUsd: number | null;
  spentUsd: number;
  remainingUsd: number;
  /** Primeiro dia do mês corrente (UTC). */
  periodStart: string;
}

export interface CostEvent {
  id: string;
  providerKind: string;
  providerId: string;
  description: string;
  amountUsd: number;
  jobId: string | null;
  createdAt: string;
}

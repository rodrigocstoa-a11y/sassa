'use client';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, ErrorBanner, Field, Input, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/use-async';

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function BudgetCard() {
  const { data, error, reload } = useAsync(api.budget);
  const events = useAsync(api.budgetEvents);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => { if (data) setValue(data.monthlyLimitUsd === null ? '' : String(data.monthlyLimitUsd)); }, [data]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const n = value.trim() === '' ? null : Number(value);
      if (n !== null && (!Number.isFinite(n) || n < 0)) throw new Error('Informe um valor igual ou maior que zero');
      await api.setBudget(n);
      await reload();
      await events.reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-medium">Orçamento mensal</h2>
      <p className="mb-4 text-sm text-muted">
        Teto de gastos com provedores pagos (narração, imagens, texto). <strong className="text-fg">Sem limite definido, nenhuma ação paga é executada.</strong>{' '}
        Cada ação mostra a estimativa antes e pede a sua confirmação.
      </p>
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {data && (
        <>
          <dl className="mb-4 grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-muted">Limite do mês</dt><dd className="text-lg font-semibold">{data.monthlyLimitUsd === null ? <Badge tone="warn">Não definido</Badge> : usd(data.monthlyLimitUsd)}</dd></div>
            <div><dt className="text-muted">Gasto até agora</dt><dd className="text-lg font-semibold">{usd(data.spentUsd)}</dd></div>
            <div><dt className="text-muted">Disponível</dt><dd className="text-lg font-semibold">{usd(data.remainingUsd)}</dd></div>
          </dl>
          <div className="flex items-end gap-3">
            <div className="w-56">
              <Field label="Limite mensal (US$)" htmlFor="budget-limit">
                <Input id="budget-limit" type="number" min={0} step="0.01" placeholder="Sem limite = bloqueado" value={value} onChange={(e) => setValue(e.target.value)} />
              </Field>
            </div>
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar limite'}</Button>
          </div>
          {saveError && <div className="mt-3"><ErrorBanner message={saveError} /></div>}
        </>
      )}
      {events.data && events.data.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Últimos gastos</h3>
          <ul className="divide-y divide-border text-sm">
            {events.data.slice(0, 8).map((e) => (
              <li key={e.id} className="flex justify-between gap-4 py-2"><span className="truncate">{e.description}</span><span className="tabular-nums text-muted">{usd(e.amountUsd)} · {formatDateTime(e.createdAt)}</span></li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function Settings() {
  const health = useAsync(api.health);
  const providers = useAsync(api.providers);
  const h = health.data;
  return (
    <>
      <PageHeader title="Configurações" description="Estado do sistema, orçamento e provedores de IA." />
      <div className="space-y-6">
        <Card>
          <h2 className="mb-3 font-medium">Sistema</h2>
          {health.error ? (
            <ErrorBanner message={health.error} onRetry={health.reload} />
          ) : (
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted">API</dt><dd>{h ? <Badge tone="ok">Online · v{h.version}</Badge> : '…'}</dd>
              <dt className="text-muted">Banco de dados</dt><dd>{h ? <Badge tone="ok">{h.engine === 'postgres' ? 'PostgreSQL' : 'PGlite (local)'}</Badge> : '…'}</dd>
              <dt className="text-muted">Armazenamento de arquivos</dt><dd>{h ? <Badge tone={h.storage === 's3' ? 'ok' : 'warn'}>{h.storage === 's3' ? 'S3/R2 (nuvem)' : 'Disco local'}</Badge> : '…'}</dd>
              <dt className="text-muted">Login</dt><dd>{h ? <Badge tone={h.authRequired ? 'ok' : 'warn'}>{h.authRequired ? 'Obrigatório' : 'Desligado (só desenvolvimento)'}</Badge> : '…'}</dd>
            </dl>
          )}
        </Card>
        <BudgetCard />
        <Card>
          <h2 className="mb-1 font-medium">Provedores de IA</h2>
          <p className="mb-4 text-sm text-muted">Nenhum provedor está conectado. Chaves de API ficam apenas no servidor, nunca no navegador.</p>
          {providers.error && <ErrorBanner message={providers.error} onRetry={providers.reload} />}
          <ul className="divide-y divide-border">
            {providers.data?.map((p) => (
              <li key={p.kind} className="flex items-center justify-between gap-4 py-3">
                <div><div className="text-sm font-medium">{p.label}</div><div className="text-xs text-muted">{p.note}</div></div>
                <Badge tone={p.configured ? 'ok' : 'muted'}>{p.configured ? 'Configurado' : 'Não configurado'}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

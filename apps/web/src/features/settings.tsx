'use client';
import { Badge, Card, ErrorBanner, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function Settings() {
  const health = useAsync(api.health);
  const providers = useAsync(api.providers);
  return (
    <>
      <PageHeader title="Configurações" description="Estado do sistema e provedores de IA." />
      <div className="space-y-6">
        <Card>
          <h2 className="mb-3 font-medium">Sistema</h2>
          {health.error ? (
            <ErrorBanner message={health.error} onRetry={health.reload} />
          ) : (
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted">API</dt><dd>{health.data ? <Badge tone="ok">Online · v{health.data.version}</Badge> : '…'}</dd>
              <dt className="text-muted">Banco de dados (SQLite local)</dt><dd>{health.data ? <Badge tone="ok">{health.data.database}</Badge> : '…'}</dd>
            </dl>
          )}
        </Card>
        <Card>
          <h2 className="mb-1 font-medium">Provedores de IA</h2>
          <p className="mb-4 text-sm text-muted">Nenhum provedor está conectado. Chaves de API ficarão apenas no servidor, nunca no navegador.</p>
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

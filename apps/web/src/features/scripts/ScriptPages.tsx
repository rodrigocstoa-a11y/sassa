'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ErrorBanner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { ScriptEditor } from './ScriptEditor';

export function NewScriptPage() {
  const params = useSearchParams();
  const channels = useAsync(api.listChannels);
  if (channels.error) return <ErrorBanner message={channels.error} onRetry={channels.reload} />;
  if (!channels.data) return <p className="text-sm text-muted">Carregando…</p>;
  if (channels.data.length === 0) {
    return (
      <p className="text-sm text-muted">
        Cadastre um canal antes de criar roteiros. <Link href="/canais" className="text-brand-2 underline">Ir para Canais</Link>
      </p>
    );
  }
  return <ScriptEditor channels={channels.data} defaultChannelId={params.get('canal') ?? undefined} />;
}

/** Carrega o roteiro e os canais. Use com `key={id}` para recarregar ao trocar de roteiro. */
export function EditScriptPage({ id }: { id: string }) {
  const channels = useAsync(api.listChannels);
  const script = useAsync(() => api.getScript(id));
  const error = channels.error ?? script.error;
  if (error) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error} onRetry={() => { void channels.reload(); void script.reload(); }} />
        <Link href="/roteiros" className="text-sm text-brand-2 underline">Voltar para Roteiros</Link>
      </div>
    );
  }
  if (!channels.data || !script.data) return <p className="text-sm text-muted">Carregando…</p>;
  // key: recria o editor com o estado novo após recarregar
  return <ScriptEditor key={script.data.id} channels={channels.data} script={script.data} />;
}

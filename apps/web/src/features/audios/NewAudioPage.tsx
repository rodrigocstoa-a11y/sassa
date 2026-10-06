'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ScriptDetail } from '@rrn/shared';
import { Card, ErrorBanner, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { GenerationNotice } from './GenerationNotice';
import { ImportPanel } from './ImportPanel';
import { NarrationPanel } from './NarrationPanel';
import { ScriptPicker } from './ScriptPicker';

type Tab = 'generate' | 'import';

export function NewAudioPage() {
  const params = useSearchParams();
  const channels = useAsync(api.listChannels);
  const [channelId, setChannelId] = useState('');
  const [scriptId, setScriptId] = useState(params.get('roteiro') ?? '');
  const [script, setScript] = useState<ScriptDetail | null>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('import');

  useEffect(() => {
    let live = true;
    setScript(null);
    setScriptError(null);
    if (!scriptId) return;
    api.getScript(scriptId)
      .then((s) => { if (live) { setScript(s); setChannelId(s.channelId); } })
      .catch((e) => live && setScriptError(e instanceof Error ? e.message : 'Erro ao carregar o roteiro'));
    return () => { live = false; };
  }, [scriptId]);

  if (channels.error) return <ErrorBanner message={channels.error} onRetry={channels.reload} />;
  if (!channels.data) return <p className="text-sm text-muted">Carregando…</p>;
  if (channels.data.length === 0) {
    return <p className="text-sm text-muted">Cadastre um canal e um roteiro antes de criar áudios. <Link href="/canais" className="text-brand-2 underline">Ir para Canais</Link></p>;
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      role="tab"
      aria-selected={tab === t}
      onClick={() => setTab(t)}
      className={`cursor-pointer rounded-lg px-4 py-2 text-sm ${tab === t ? 'bg-brand/15 text-fg' : 'text-muted hover:text-fg'}`}
    >
      {label}
    </button>
  );

  return (
    <>
      <Link href="/audios" className="mb-4 inline-block text-sm text-muted hover:text-fg">← Áudios</Link>
      <PageHeader title="Novo áudio" description="Todo áudio é vinculado a um roteiro (e, por ele, ao canal e ao idioma)." />
      <Card className="mb-6">
        <ScriptPicker channels={channels.data} channelId={channelId} scriptId={scriptId} onChange={(c, s) => { setChannelId(c); setScriptId(s); }} />
        {scriptError && <div className="mt-4"><ErrorBanner message={scriptError} /></div>}
      </Card>

      {script ? (
        <>
          <div role="tablist" className="mb-4 flex gap-2">
            {tabBtn('import', 'Importar áudio')}
            {tabBtn('generate', 'Gerar narração')}
          </div>
          {tab === 'import' ? (
            <ImportPanel script={script} channel={channels.data.find((c) => c.id === script.channelId)} />
          ) : (
            <NarrationPanel script={script} />
          )}
        </>
      ) : (
        <>
          <GenerationNotice />
          <p className="text-sm text-muted">Escolha o canal e o roteiro para continuar.</p>
        </>
      )}
    </>
  );
}

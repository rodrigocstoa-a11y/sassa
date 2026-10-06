'use client';
import { AlertTriangle, Film, FileText, Headphones, Loader, Tv, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Badge, Card, ErrorBanner, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

function Stat({ icon: Icon, label, value, pending }: { icon: LucideIcon; label: string; value: number | null; pending?: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between text-muted"><span className="text-sm">{label}</span><Icon size={18} /></div>
      <div className="mt-3 text-3xl font-semibold">{value ?? '—'}</div>
      {value === null && <p className="mt-1 text-xs text-muted">{pending}</p>}
    </Card>
  );
}

export function Dashboard() {
  const { data, error, reload } = useAsync(api.summary);
  return (
    <>
      <PageHeader title="Dashboard" description="Visão geral da produção." />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat icon={Tv} label="Canais" value={data?.channels ?? null} pending={data ? undefined : 'Carregando…'} />
        <Stat icon={FileText} label="Roteiros" value={data?.scripts ?? null} pending={data ? undefined : 'Carregando…'} />
        <Stat icon={Headphones} label="Áudios" value={data?.audios ?? null} pending={data ? undefined : 'Carregando…'} />
        <Stat icon={Film} label="Vídeos produzidos" value={data?.videos ?? null} pending="Disponível com o módulo de Editor (Fase 7)" />
        <Stat icon={Loader} label="Tarefas em andamento" value={data?.tasksInProgress ?? null} pending="Disponível com a Fila de Produção (Fase 5)" />
        <Stat icon={AlertTriangle} label="Erros" value={data?.errors ?? null} pending="Disponível com a Fila de Produção (Fase 5)" />
      </div>
      {data?.channels === 0 && (
        <Card className="mt-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-medium">Comece cadastrando um canal</h2>
            <p className="text-sm text-muted">Os canais organizam roteiros, áudios, imagens e vídeos.</p>
          </div>
          <Link href="/canais" className="rounded-lg bg-gradient-to-r from-brand to-brand-2 px-4 py-2 text-sm font-semibold text-[#06070a]">Ir para Canais</Link>
        </Card>
      )}
      <Card className="mt-6">
        <div className="mb-1 flex items-center gap-2"><h2 className="font-medium">Projetos recentes</h2><Badge tone="warn">Fase 2+</Badge></div>
        <p className="text-sm text-muted">Projetos de vídeo aparecerão aqui quando os módulos de roteiro e produção estiverem implementados.</p>
      </Card>
    </>
  );
}

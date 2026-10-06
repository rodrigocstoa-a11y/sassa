'use client';
import { SCRIPT_STATUSES, LANGUAGES, languageLabel, type LanguageCode, type ScriptStatus, type ScriptSummary } from '@rrn/shared';
import { FileText, Languages, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, EmptyState, ErrorBanner, Input, PageHeader, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useAsync } from '@/lib/use-async';
import { GenerationNotice } from './GenerationNotice';
import { StatusBadge } from './StatusBadge';

const PAGE = 50;

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ScriptsView() {
  const channels = useAsync(api.listChannels);
  const [search, setSearch] = useState('');
  const [channelId, setChannelId] = useState('');
  const [status, setStatus] = useState<ScriptStatus | ''>('');
  const [language, setLanguage] = useState('');
  const q = useDebounced(search, 300);

  const [items, setItems] = useState<ScriptSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const id = ++requestId.current;
      setLoading(true);
      try {
        const res = await api.listScripts({
          q,
          channelId,
          status: status || undefined,
          language: (language || undefined) as LanguageCode | undefined,
          limit: PAGE,
          offset,
        });
        if (id !== requestId.current) return; // resposta de uma consulta antiga
        setItems((prev) => (offset === 0 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setError(null);
      } catch (e) {
        if (id === requestId.current) setError(e instanceof Error ? e.message : 'Erro ao carregar roteiros');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [q, channelId, status, language],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const channelName = (id: string) => channels.data?.find((c) => c.id === id)?.name ?? '—';
  const noChannels = channels.data?.length === 0;
  const filtered = Boolean(q || channelId || status || language);

  return (
    <>
      <PageHeader
        title="Roteiros"
        description="Escreva, cole, revise e aprove os roteiros de cada canal."
        action={
          noChannels ? undefined : (
            <Link
              href="/roteiros/novo"
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand to-brand-2 px-4 py-2 text-sm font-semibold text-[#06070a] hover:brightness-110"
            >
              <Plus size={16} /> Novo roteiro
            </Link>
          )
        }
      />
      <GenerationNotice />

      {noChannels ? (
        <EmptyState
          icon={<FileText size={32} />}
          title="Cadastre um canal primeiro"
          description="Cada roteiro pertence a um canal."
          action={<Link href="/canais" className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm hover:border-brand">Ir para Canais</Link>}
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_160px_180px]">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input aria-label="Pesquisar roteiros" placeholder="Pesquisar em título, tema e conteúdo…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select aria-label="Filtrar por canal" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">Todos os canais</option>
              {channels.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select aria-label="Filtrar por status" value={status} onChange={(e) => setStatus(e.target.value as ScriptStatus | '')}>
              <option value="">Todos os status</option>
              {SCRIPT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
            <Select aria-label="Filtrar por idioma" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="">Todos os idiomas</option>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </Select>
          </div>

          {error && <ErrorBanner message={error} onRetry={() => load(0)} />}

          {!error && !loading && items.length === 0 && (
            <EmptyState
              icon={<FileText size={32} />}
              title={filtered ? 'Nenhum roteiro encontrado' : 'Nenhum roteiro ainda'}
              description={filtered ? 'Ajuste a pesquisa ou os filtros.' : 'Crie um roteiro novo ou cole um texto escrito em outro lugar.'}
              action={!filtered ? <Link href="/roteiros/novo" className="rounded-lg bg-gradient-to-r from-brand to-brand-2 px-4 py-2 text-sm font-semibold text-[#06070a]">Novo roteiro</Link> : undefined}
            />
          )}

          {items.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Título</th>
                    <th className="px-4 py-3 font-medium">Canal</th>
                    <th className="px-4 py-3 font-medium">Idioma</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Palavras</th>
                    <th className="px-4 py-3 font-medium">Atualizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((s) => (
                    <tr key={s.id} className="hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <Link href={`/roteiros/${s.id}`} className="font-medium hover:text-brand-2">{s.title}</Link>
                        <div className="flex items-center gap-2 text-xs text-muted">
                          {s.sourceScriptId && <span className="inline-flex items-center gap-1"><Languages size={12} /> Tradução</span>}
                          {s.topic && <span className="truncate">{s.topic}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">{channelName(s.channelId)}</td>
                      <td className="px-4 py-3 text-muted">{languageLabel(s.language)}</td>
                      <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">{formatNumber(s.wordCount)}</td>
                      <td className="px-4 py-3 text-muted">{formatDateTime(s.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {loading && <p className="mt-4 text-sm text-muted">Carregando…</p>}
          {items.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted">
              <span>Mostrando {items.length} de {total}</span>
              {items.length < total && !loading && <Button variant="ghost" onClick={() => load(items.length)}>Carregar mais</Button>}
            </div>
          )}
        </>
      )}
    </>
  );
}

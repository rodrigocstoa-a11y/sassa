'use client';
import { AUDIO_STATUSES, LANGUAGES, languageLabel, type AudioStatus, type AudioSummary, type LanguageCode } from '@rrn/shared';
import { Download, Headphones, Pause, Play, Plus, Search, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, EmptyState, ErrorBanner, Input, PageHeader, Select } from '@/components/ui';
import { api, audioFileUrl } from '@/lib/api';
import { formatBytes, formatDateTime, formatDuration } from '@/lib/format';
import { useAsync } from '@/lib/use-async';
import { GenerationNotice } from './GenerationNotice';
import { AudioStatusBadge } from './StatusBadges';
import { useSinglePlayer } from './useSinglePlayer';

const PAGE = 50;

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function AudiosView() {
  const channels = useAsync(api.listChannels);
  const [search, setSearch] = useState('');
  const [channelId, setChannelId] = useState('');
  const [scriptId, setScriptId] = useState('');
  const [language, setLanguage] = useState('');
  const [status, setStatus] = useState<AudioStatus | ''>('');
  const [approval, setApproval] = useState('');
  const q = useDebounced(search, 300);

  const [scripts, setScripts] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    let live = true;
    api.listScripts({ channelId: channelId || undefined, limit: 200 }).then((r) => live && setScripts(r.items)).catch(() => live && setScripts([]));
    return () => { live = false; };
  }, [channelId]);

  const [items, setItems] = useState<AudioSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const player = useSinglePlayer();

  const load = useCallback(
    async (offset: number) => {
      const id = ++requestId.current;
      setLoading(true);
      try {
        const res = await api.listAudios({
          q, channelId, scriptId, status: status || undefined, limit: PAGE, offset,
          language: (language || undefined) as LanguageCode | undefined,
          approval: (approval || undefined) as 'approved' | 'pending' | undefined,
        });
        if (id !== requestId.current) return;
        setItems((prev) => (offset === 0 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setError(null);
      } catch (e) {
        if (id === requestId.current) setError(e instanceof Error ? e.message : 'Erro ao carregar áudios');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [q, channelId, scriptId, status, language, approval],
  );

  useEffect(() => { void load(0); }, [load]);

  // Enquanto houver áudio realmente em processamento, atualiza a lista.
  const anyProcessing = items.some((a) => a.status === 'processing');
  useEffect(() => {
    if (!anyProcessing) return;
    const t = setInterval(() => void load(0), 3000);
    return () => clearInterval(t);
  }, [anyProcessing, load]);

  const filtered = Boolean(q || channelId || scriptId || language || status || approval);

  return (
    <>
      <PageHeader
        title="Áudios"
        description="Biblioteca de narrações vinculadas aos roteiros e canais."
        action={
          <Link href="/audios/novo" className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand to-brand-2 px-4 py-2 text-sm font-semibold text-[#06070a] hover:brightness-110">
            <Plus size={16} /> Novo áudio
          </Link>
        }
      />
      <GenerationNotice />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[1fr_170px_200px_170px_160px_150px]">
        <div className="relative sm:col-span-2 lg:col-span-3 2xl:col-span-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input aria-label="Pesquisar áudios" placeholder="Título, roteiro, canal ou arquivo…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select aria-label="Filtrar por canal" value={channelId} onChange={(e) => { setChannelId(e.target.value); setScriptId(''); }}>
          <option value="">Todos os canais</option>
          {channels.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="Filtrar por roteiro" value={scriptId} onChange={(e) => setScriptId(e.target.value)}>
          <option value="">Todos os roteiros</option>
          {scripts.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </Select>
        <Select aria-label="Filtrar por idioma" value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="">Todos os idiomas</option>
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </Select>
        <Select aria-label="Filtrar por status" value={status} onChange={(e) => setStatus(e.target.value as AudioStatus | '')}>
          <option value="">Todos os status</option>
          {AUDIO_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <Select aria-label="Filtrar por aprovação" value={approval} onChange={(e) => setApproval(e.target.value)}>
          <option value="">Aprovação</option>
          <option value="approved">Aprovados</option>
          <option value="pending">Não aprovados</option>
        </Select>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => load(0)} />}
      {player.error && <div className="mb-3"><ErrorBanner message={player.error} /></div>}

      {!error && !loading && items.length === 0 && (
        <EmptyState
          icon={<Headphones size={32} />}
          title={filtered ? 'Nenhum áudio encontrado' : 'Nenhum áudio ainda'}
          description={filtered ? 'Ajuste a pesquisa ou os filtros.' : 'Importe uma narração gravada ou gerada fora da plataforma e vincule-a a um roteiro.'}
          action={!filtered ? <Link href="/audios/novo" className="rounded-lg bg-gradient-to-r from-brand to-brand-2 px-4 py-2 text-sm font-semibold text-[#06070a]">Novo áudio</Link> : undefined}
        />
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-12 px-4 py-3" aria-label="Reproduzir" />
                <th className="px-4 py-3 font-medium">Áudio</th>
                <th className="px-4 py-3 font-medium">Canal</th>
                <th className="px-4 py-3 font-medium">Idioma</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Duração</th>
                <th className="px-4 py-3 text-right font-medium">Tamanho</th>
                <th className="px-4 py-3 font-medium">Atualizado</th>
                <th className="w-10 px-4 py-3" aria-label="Download" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((a) => {
                const playing = player.playingId === a.id;
                return (
                  <tr key={a.id} className="hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <button
                        disabled={!a.hasFile}
                        onClick={() => player.toggle(a.id, audioFileUrl(a.id))}
                        aria-label={`${playing ? 'Pausar' : 'Reproduzir'} ${a.title}`}
                        className="flex size-8 items-center justify-center rounded-full bg-brand/20 text-brand-2 hover:bg-brand/30 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                      >
                        {playing ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/audios/${a.id}`} className="font-medium hover:text-brand-2">{a.title}</Link>
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <Link href={`/roteiros/${a.scriptId}`} className="truncate hover:text-fg">{a.scriptTitle}</Link>
                        {a.scriptOutdated && (
                          <span className="inline-flex items-center gap-1 text-warn" title="O roteiro foi alterado depois deste áudio">
                            <TriangleAlert size={12} /> roteiro alterado
                          </span>
                        )}
                      </div>
                      {a.status === 'error' && a.errorMessage && <div className="mt-1 text-xs text-danger">{a.errorMessage}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted">{a.channelName}</td>
                    <td className="px-4 py-3 text-muted">{languageLabel(a.language)}</td>
                    <td className="px-4 py-3">
                      <AudioStatusBadge status={a.status} approved={!!a.approvedAt} />
                      {a.status === 'processing' && <div className="mt-1 text-xs text-muted">{a.partsDone}/{a.partsTotal} partes</div>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{a.durationMs != null ? formatDuration(a.durationMs) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{a.sizeBytes != null ? formatBytes(a.sizeBytes) : '—'}</td>
                    <td className="px-4 py-3 text-muted">{formatDateTime(a.updatedAt)}</td>
                    <td className="px-4 py-3">
                      {a.hasFile && (
                        <a href={audioFileUrl(a.id, true)} aria-label={`Baixar ${a.title}`} className="text-muted hover:text-fg"><Download size={16} /></a>
                      )}
                    </td>
                  </tr>
                );
              })}
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
  );
}

'use client';
import { audioStatusLabel, languageLabel, type AudioSummary } from '@rrn/shared';
import { ArrowLeft, Check, Download, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Card, ErrorBanner, Field, Input, Modal } from '@/components/ui';
import { api, audioFileUrl } from '@/lib/api';
import { formatBytes, formatDateTime, formatDuration } from '@/lib/format';
import { useAsync } from '@/lib/use-async';
import { AudioStatusBadge } from './StatusBadges';

export function AudioDetail({ id }: { id: string }) {
  const { data, error, reload } = useAsync(() => api.getAudio(id));
  const [audio, setAudio] = useState<AudioSummary | null>(null);
  useEffect(() => { if (data) setAudio(data); }, [data]);

  // Atualiza enquanto estiver realmente processando.
  const processing = audio?.status === 'processing';
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => api.getAudio(id).then(setAudio).catch(() => {}), 2000);
    return () => clearInterval(t);
  }, [processing, id]);

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error} onRetry={reload} />
        <Link href="/audios" className="text-sm text-brand-2 underline">Voltar para Áudios</Link>
      </div>
    );
  }
  if (!audio) return <p className="text-sm text-muted">Carregando…</p>;
  return <Body audio={audio} onChange={setAudio} />;
}

function Body({ audio, onChange }: { audio: AudioSummary; onChange: (a: AudioSummary) => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(audio.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(approved: boolean) {
    setBusy(true);
    setError(null);
    try {
      onChange(await api.updateAudio(audio.id, { title: title.trim(), approved }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      onChange(await api.retryAudio(audio.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao tentar novamente');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await api.deleteAudio(audio.id);
      router.replace('/audios');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir');
      setConfirmDelete(false);
    }
  }

  const approved = !!audio.approvedAt;
  const dirty = title.trim() !== audio.title;
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm"><dt className="text-muted">{label}</dt><dd className="text-right">{value}</dd></div>
  );

  return (
    <>
      <Link href="/audios" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={16} /> Áudios</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{audio.title}</h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-muted">
            <AudioStatusBadge status={audio.status} approved={approved} />
            <Link href={`/roteiros/${audio.scriptId}`} className="hover:text-fg">Roteiro: {audio.scriptTitle}</Link>
            <span>Canal: {audio.channelName}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {audio.hasFile && (
            <a href={audioFileUrl(audio.id, true)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm hover:border-brand"><Download size={16} /> Baixar</a>
          )}
          <Button variant="ghost" disabled={audio.status === 'processing'} onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Excluir</Button>
        </div>
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}
      {audio.scriptOutdated && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-lg bg-warn/10 p-3 text-sm text-warn">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" /> O roteiro foi alterado depois da criação deste áudio. Confira se a narração ainda corresponde ao texto.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            {audio.hasFile ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio controls preload="metadata" src={audioFileUrl(audio.id)} className="w-full" aria-label={`Player: ${audio.title}`} />
            ) : audio.status === 'processing' ? (
              <div>
                <p className="mb-2 text-sm">Processando narração: {audio.partsDone} de {audio.partsTotal} partes concluídas.</p>
                <div role="progressbar" aria-valuenow={audio.partsDone} aria-valuemin={0} aria-valuemax={audio.partsTotal} className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-gradient-to-r from-brand to-brand-2" style={{ width: `${audio.partsTotal ? (audio.partsDone / audio.partsTotal) * 100 : 0}%` }} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-danger">{audio.errorMessage ?? 'Este áudio não possui arquivo.'}</p>
                {audio.status === 'error' && audio.source === 'provider' && (
                  <>
                    <p className="text-xs text-muted">{audio.partsDone} de {audio.partsTotal} partes já foram geradas e serão reaproveitadas.</p>
                    <Button variant="ghost" onClick={retry} disabled={busy}><RotateCcw size={16} /> Tentar novamente</Button>
                  </>
                )}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 font-medium">Revisão</h2>
            <div className="space-y-4">
              <Field label="Título" htmlFor="a-title"><Input id="a-title" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
              <div className="flex flex-wrap gap-3">
                <Button variant="ghost" disabled={busy || !dirty} onClick={() => save(approved)}>Salvar título</Button>
                {approved ? (
                  <Button variant="ghost" disabled={busy} onClick={() => save(false)}>Remover aprovação</Button>
                ) : (
                  <Button disabled={busy || audio.status !== 'completed'} onClick={() => save(true)} title={audio.status !== 'completed' ? 'Só áudios concluídos podem ser aprovados' : 'Ouça o áudio antes de aprovar'}>
                    <Check size={16} /> Aprovar áudio
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted">Ouça o áudio antes de aprovar. Só áudios concluídos podem ser aprovados.</p>
            </div>
          </Card>
        </div>

        <Card>
          <h2 className="mb-2 font-medium">Detalhes</h2>
          <dl className="divide-y divide-border">
            {row('Status', audioStatusLabel(audio.status))}
            {row('Origem', audio.source === 'upload' ? 'Importado' : `Gerado (${audio.providerId})`)}
            {row('Idioma', languageLabel(audio.language))}
            {audio.voiceName && row('Voz', audio.voiceName)}
            {typeof audio.settings.speed === 'number' && row('Velocidade', `${audio.settings.speed}×`)}
            {row('Duração', audio.durationMs != null ? formatDuration(audio.durationMs) : '—')}
            {row('Tamanho', audio.sizeBytes != null ? formatBytes(audio.sizeBytes) : '—')}
            {row('Formato', audio.mimeType ?? '—')}
            {audio.originalFilename && row('Arquivo original', audio.originalFilename)}
            {row('Criado', formatDateTime(audio.createdAt))}
            {audio.approvedAt && row('Aprovado', formatDateTime(audio.approvedAt))}
          </dl>
        </Card>
      </div>

      <Modal open={confirmDelete} title="Excluir áudio" onClose={() => setConfirmDelete(false)}>
        <div className="space-y-4">
          <p className="text-sm text-muted">Excluir <strong className="text-fg">{audio.title}</strong> e o arquivo do armazenamento? Esta ação não pode ser desfeita.</p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            <Button variant="danger" onClick={remove}>Excluir</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

'use client';
import { AUDIO_FORMATS, languageLabel, type Channel, type ScriptDetail } from '@rrn/shared';
import { Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, ErrorBanner, Field, Input } from '@/components/ui';
import { ApiError, uploadAudio } from '@/lib/api';
import { formatBytes, formatDuration } from '@/lib/format';

const ACCEPT = ['audio/*', ...AUDIO_FORMATS.map((f) => `.${f.ext}`)].join(',');

/** Lê a duração do arquivo no navegador (best effort; o servidor não depende disso). */
function readDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    const done = (v?: number) => { URL.revokeObjectURL(url); resolve(v); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration * 1000 : undefined);
    a.onerror = () => done(undefined);
    a.src = url;
  });
}

export function ImportPanel({ script, channel }: { script: ScriptDetail; channel?: Channel }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | undefined>();
  const [title, setTitle] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | undefined>();

  async function pick(f: File | null) {
    setFile(f);
    setError(null);
    setDuration(undefined);
    if (!f) return;
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
    setDuration(await readDuration(f));
  }

  async function submit() {
    if (!file) return;
    if (title.trim().length < 2) { setTitleError('Informe ao menos 2 caracteres'); return; }
    setTitleError(undefined);
    setError(null);
    setProgress(0);
    try {
      const audio = await uploadAudio(file, { scriptId: script.id, title: title.trim(), durationMs: duration }, setProgress);
      router.push(`/audios/${audio.id}`);
    } catch (e) {
      setProgress(null);
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Erro no envio');
    }
  }

  const uploading = progress !== null;
  return (
    <Card>
      <h3 className="mb-1 font-medium">Importar áudio existente</h3>
      <p className="mb-4 text-sm text-muted">
        Envie uma narração produzida fora da plataforma. Formatos: {AUDIO_FORMATS.map((f) => f.label).join(', ')}. O formato é verificado pelo conteúdo do arquivo.
      </p>
      <div className="mb-4 rounded-lg bg-surface-2 p-3 text-sm text-muted">
        Será vinculado ao roteiro <strong className="text-fg">{script.title}</strong>
        {channel && <> do canal <strong className="text-fg">{channel.name}</strong></>} · idioma <strong className="text-fg">{languageLabel(script.language)}</strong> (herdado do roteiro).
      </div>
      <div className="space-y-4">
        <Field label="Arquivo de áudio" htmlFor="imp-file">
          <input id="imp-file" type="file" accept={ACCEPT} disabled={uploading} onChange={(e) => void pick(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-surface-2 file:px-4 file:py-2 file:text-fg" />
        </Field>
        {file && <p className="text-xs text-muted">{file.name} · {formatBytes(file.size)}{duration !== undefined && ` · ${formatDuration(duration)}`}</p>}
        <Field label="Título" htmlFor="imp-title" error={titleError}>
          <Input id="imp-title" value={title} disabled={uploading} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Narração completa" />
        </Field>
        {uploading && (
          <div role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-gradient-to-r from-brand to-brand-2 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        {error && <ErrorBanner message={error} />}
        <div className="flex justify-end">
          <Button onClick={submit} disabled={!file || uploading}><Upload size={16} /> {uploading ? `Enviando… ${Math.round(progress * 100)}%` : 'Importar áudio'}</Button>
        </div>
      </div>
    </Card>
  );
}

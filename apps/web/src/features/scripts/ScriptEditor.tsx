'use client';
import {
  LANGUAGES,
  SCRIPT_STATUSES,
  countWords,
  estimateNarrationMinutes,
  scriptInputSchema,
  type Channel,
  type LanguageCode,
  type ScriptDetail,
  type ScriptInput,
  type ScriptStatus,
} from '@rrn/shared';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, ErrorBanner, Field, Input, Modal, Select } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatDateTime, formatMinutes, formatNumber } from '@/lib/format';
import { StatusBadge } from './StatusBadge';
import { TranslationsPanel } from './TranslationsPanel';

interface Props {
  channels: Channel[];
  /** Roteiro existente; ausente ao criar. */
  script?: ScriptDetail;
  defaultChannelId?: string;
}

const emptyInput = (channelId: string, language: LanguageCode): ScriptInput => ({
  channelId, title: '', language, topic: '', content: '', status: 'draft',
});

const toInput = (s: ScriptDetail): ScriptInput => ({
  channelId: s.channelId, title: s.title, language: s.language, topic: s.topic, content: s.content, status: s.status,
});

export function ScriptEditor({ channels, script, defaultChannelId }: Props) {
  const router = useRouter();
  const initialChannel = channels.find((c) => c.id === defaultChannelId) ?? channels[0];
  const [saved, setSaved] = useState<ScriptInput>(() =>
    script ? toInput(script) : emptyInput(initialChannel?.id ?? '', initialChannel?.language ?? 'pt-BR'),
  );
  const [values, setValues] = useState<ScriptInput>(saved);
  const [detail, setDetail] = useState<ScriptDetail | undefined>(script);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(saved), [values, saved]);
  const words = useMemo(() => countWords(values.content), [values.content]);
  const isTranslation = !!detail?.source;
  const hasTranslations = (detail?.translations.length ?? 0) > 0;
  const lockedStructure = isTranslation || hasTranslations;

  const set = <K extends keyof ScriptInput>(key: K, value: ScriptInput[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setJustSaved(false);
  };

  const save = useCallback(async () => {
    const parsed = scriptInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      if (detail) {
        const res = await api.updateScript(detail.id, parsed.data);
        setDetail(res);
        setSaved(toInput(res));
        setValues(toInput(res));
        setJustSaved(true);
      } else {
        const res = await api.createScript(parsed.data);
        setSaved(toInput(res)); // evita o aviso de "não salvo" ao navegar
        router.replace(`/roteiros/${res.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.issues.length) setErrors(Object.fromEntries(err.issues.map((i) => [i.path, i.message])));
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }, [values, detail, router]);

  // Ctrl/Cmd+S salva; aviso do navegador ao fechar com alterações não salvas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [save, dirty]);

  async function remove() {
    if (!detail) return;
    try {
      await api.deleteScript(detail.id);
      setSaved(values);
      router.replace('/roteiros');
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Erro ao excluir');
    }
  }

  const goBack = (e: React.MouseEvent) => {
    if (dirty && !window.confirm('Há alterações não salvas. Sair mesmo assim?')) e.preventDefault();
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={detail?.source ? `/roteiros/${detail.source.id}` : '/roteiros'}
            onClick={goBack}
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
          >
            <ArrowLeft size={16} /> {detail?.source ? 'Original' : 'Roteiros'}
          </Link>
          {detail && <StatusBadge status={detail.status} />}
          {dirty && <span className="text-xs text-warn">● Alterações não salvas</span>}
          {justSaved && !dirty && <span role="status" className="text-xs text-ok">Salvo</span>}
        </div>
        <div className="flex gap-2">
          {detail && (
            <Button variant="ghost" onClick={() => { setDeleteError(null); setConfirmDelete(true); }}>
              <Trash2 size={16} /> Excluir
            </Button>
          )}
          <Button onClick={save} disabled={saving || (!!detail && !dirty)}>
            <Save size={16} /> {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </div>

      {formError && <div className="mb-4"><ErrorBanner message={formError} /></div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <label htmlFor="title" className="sr-only">Título</label>
          <input
            id="title"
            value={values.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Título do roteiro"
            aria-invalid={!!errors.title}
            className="mb-1 w-full border-0 border-b border-border bg-transparent pb-3 text-2xl font-semibold outline-none placeholder:text-muted focus:border-brand"
          />
          {errors.title && <p className="mb-2 text-xs text-danger">{errors.title}</p>}

          <label htmlFor="content" className="sr-only">Conteúdo do roteiro</label>
          <textarea
            id="content"
            lang={values.language}
            spellCheck
            value={values.content}
            onChange={(e) => set('content', e.target.value)}
            placeholder="Escreva aqui ou cole um roteiro escrito em outro lugar…"
            aria-invalid={!!errors.content}
            className="mt-4 min-h-[65vh] w-full resize-y rounded-xl border border-border bg-surface px-6 py-5 font-serif text-[17px] leading-8 outline-none placeholder:text-muted focus:border-brand"
          />
          {errors.content && <p className="mt-1 text-xs text-danger">{errors.content}</p>}
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            <span>{formatNumber(words)} palavras</span>
            <span>{formatNumber(values.content.length)} caracteres</span>
            <span title="Estimativa com 150 palavras por minuto">Narração {formatMinutes(estimateNarrationMinutes(words))} (estimativa)</span>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="space-y-4 rounded-xl border border-border bg-surface p-4">
            <Field label="Canal" htmlFor="channelId" error={errors.channelId}>
              <Select id="channelId" value={values.channelId} disabled={lockedStructure} onChange={(e) => set('channelId', e.target.value)}>
                {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Idioma" htmlFor="language" error={errors.language}>
              <Select id="language" value={values.language} disabled={lockedStructure} onChange={(e) => set('language', e.target.value as LanguageCode)}>
                {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </Select>
            </Field>
            {lockedStructure && (
              <p className="-mt-2 text-xs text-muted">
                {isTranslation ? 'Traduções mantêm o canal e o idioma com que foram criadas.' : 'Canal e idioma ficam bloqueados enquanto existirem traduções.'}
              </p>
            )}
            <Field label="Tema" htmlFor="topic" error={errors.topic}>
              <Input id="topic" value={values.topic} onChange={(e) => set('topic', e.target.value)} placeholder="Ex.: Queda do Império Romano" />
            </Field>
            <Field label="Status" htmlFor="status" error={errors.status}>
              <Select id="status" value={values.status} onChange={(e) => set('status', e.target.value as ScriptStatus)}>
                {SCRIPT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>
            {detail && (
              <dl className="space-y-1 border-t border-border pt-3 text-xs text-muted">
                <div className="flex justify-between"><dt>Criado</dt><dd>{formatDateTime(detail.createdAt)}</dd></div>
                <div className="flex justify-between"><dt>Atualizado</dt><dd>{formatDateTime(detail.updatedAt)}</dd></div>
                {detail.approvedAt && <div className="flex justify-between"><dt>Aprovado</dt><dd>{formatDateTime(detail.approvedAt)}</dd></div>}
              </dl>
            )}
          </section>

          {detail ? (
            <TranslationsPanel script={detail} dirty={dirty} onCreated={(id) => router.push(`/roteiros/${id}`)} />
          ) : (
            <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted">
              Salve o roteiro para poder criar traduções vinculadas a ele.
            </p>
          )}
        </aside>
      </div>

      <Modal open={confirmDelete} title="Excluir roteiro" onClose={() => setConfirmDelete(false)}>
        <div className="space-y-4">
          {deleteError && <ErrorBanner message={deleteError} />}
          <p className="text-sm text-muted">
            Excluir <strong className="text-fg">{detail?.title}</strong>? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            <Button variant="danger" onClick={remove}>Excluir</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

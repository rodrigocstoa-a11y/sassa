'use client';
import { LANGUAGES, PRIORITY_TRANSLATION_LANGUAGES, languageLabel, type LanguageCode, type ScriptDetail } from '@rrn/shared';
import { Languages, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, ErrorBanner, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { StatusBadge } from './StatusBadge';

interface Props {
  script: ScriptDetail;
  dirty: boolean;
  onCreated: (id: string) => void;
}

/** Relação original ↔ traduções. Não há tradução automática: o texto traduzido é colado/escrito no editor. */
export function TranslationsPanel({ script, dirty, onCreated }: Props) {
  const [language, setLanguage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (script.source) {
    return (
      <section className="rounded-xl border border-border bg-surface p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-medium"><Languages size={16} /> Tradução</h3>
        <p className="text-sm text-muted">
          Original ({languageLabel(script.source.language)}):{' '}
          <Link href={`/roteiros/${script.source.id}`} className="text-brand-2 hover:underline">{script.source.title}</Link>
        </p>
        {script.outdated && (
          <p role="status" className="mt-3 flex items-start gap-2 rounded-lg bg-warn/10 p-3 text-xs text-warn">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            O original foi alterado depois da última edição desta tradução. Revise se for necessário.
          </p>
        )}
      </section>
    );
  }

  const used = new Set<string>([script.language, ...script.translations.map((t) => t.language)]);
  const available = LANGUAGES.filter((l) => !used.has(l.code));
  const priority = available.filter((l) => (PRIORITY_TRANSLATION_LANGUAGES as readonly string[]).includes(l.code));
  const others = available.filter((l) => !priority.includes(l));

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const t = await api.createTranslation(script.id, { language: language as LanguageCode });
      onCreated(t.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar tradução');
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-medium"><Languages size={16} /> Traduções</h3>
      <p className="mb-3 text-xs text-muted">
        A tradução automática ainda não está configurada. Crie a tradução e cole o texto traduzido no editor.
      </p>
      {script.translations.length > 0 && (
        <ul className="mb-3 space-y-2">
          {script.translations.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
              <Link href={`/roteiros/${t.id}`} className="text-brand-2 hover:underline">{languageLabel(t.language)}</Link>
              <span className="flex items-center gap-2">
                {t.updatedAt < script.updatedAt && <Badge tone="warn">Desatualizada</Badge>}
                <StatusBadge status={t.status} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="mb-3"><ErrorBanner message={error} /></div>}
      {available.length > 0 ? (
        <div className="flex gap-2">
          <Select aria-label="Idioma da nova tradução" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">Idioma…</option>
            <optgroup label="Principais">
              {priority.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </optgroup>
            {others.length > 0 && (
              <optgroup label="Outros">
                {others.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </optgroup>
            )}
          </Select>
          <Button variant="ghost" disabled={!language || busy || dirty} onClick={create} title={dirty ? 'Salve as alterações antes' : undefined}>
            Criar
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted">Todos os idiomas disponíveis já têm tradução.</p>
      )}
      {dirty && <p className="mt-2 text-xs text-muted">Salve as alterações para criar uma tradução.</p>}
    </section>
  );
}

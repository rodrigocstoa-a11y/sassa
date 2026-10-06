'use client';
import {
  countWords,
  estimateNarrationMinutes,
  languageLabel,
  splitTextIntoChunks,
  type ScriptDetail,
} from '@rrn/shared';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, ErrorBanner, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { formatMinutes, formatNumber } from '@/lib/format';
import { useAsync } from '@/lib/use-async';

const HYPOTHETICAL_LIMIT = 4000;

/** Configurações de narração. Só gera quando existe provedor TTS; a divisão em partes é uma pré-visualização real. */
export function NarrationPanel({ script }: { script: ScriptDetail }) {
  const router = useRouter();
  const status = useAsync(api.audioGenerationStatus);
  const voices = useAsync(() => api.audioVoices(script.language));
  const available = status.data?.available === true;

  const [voiceId, setVoiceId] = useState('');
  const [speed, setSpeed] = useState(1);
  const [limitInput, setLimitInput] = useState(String(HYPOTHETICAL_LIMIT));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerLimit = status.data?.provider?.maxCharsPerRequest;
  const limit = providerLimit ?? Math.max(1, Math.floor(Number(limitInput)) || HYPOTHETICAL_LIMIT);

  const plan = useMemo(() => {
    const chunks = splitTextIntoChunks(script.content, limit);
    const sizes = chunks.map((c) => c.length);
    return { count: chunks.length, min: sizes.length ? Math.min(...sizes) : 0, max: sizes.length ? Math.max(...sizes) : 0 };
  }, [script.content, limit]);
  const words = countWords(script.content);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const a = await api.generateAudio({ scriptId: script.id, voiceId, settings: { speed } });
      router.push(`/audios/${a.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao iniciar a narração');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {!available && status.data && (
        <Card className="border-warn/30">
          <div className="mb-2 flex items-center gap-2 font-medium">Narração automática indisponível <Badge tone="warn">Não configurada</Badge></div>
          <p className="mb-3 text-sm text-muted">{status.data.reason}</p>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">O que falta para habilitar</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            {status.data.requirements.map((r) => <li key={r}>{r}</li>)}
          </ol>
        </Card>
      )}
      {status.error && <ErrorBanner message={status.error} onRetry={status.reload} />}

      <Card>
        <h3 className="mb-4 font-medium">Configurações de narração</h3>
        <fieldset disabled={!available} className="grid gap-4 md:grid-cols-2 disabled:opacity-60">
          <Field label="Idioma" htmlFor="n-lang">
            <Input id="n-lang" readOnly value={languageLabel(script.language)} />
          </Field>
          <Field label="Voz" htmlFor="n-voice">
            <Select id="n-voice" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
              <option value="">{available ? 'Escolha uma voz…' : 'Nenhuma voz disponível'}</option>
              {voices.data?.voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </Field>
          <Field label={`Velocidade (${speed.toFixed(2)}×)`} htmlFor="n-speed">
            <input id="n-speed" type="range" min={0.5} max={2} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full accent-brand" />
          </Field>
        </fieldset>
        <p className="mt-3 text-xs text-muted">O idioma da narração é o do roteiro. As demais opções dependerão do que o provedor oferecer.</p>
      </Card>

      <Card>
        <div className="mb-1 flex items-center gap-2"><h3 className="font-medium">Divisão em partes</h3>{!providerLimit && <Badge tone="warn">Pré-visualização</Badge>}</div>
        <p className="mb-4 text-sm text-muted">
          Roteiros longos são enviados ao provedor em partes, sem cortar frases. {providerLimit
            ? `Limite do provedor: ${formatNumber(providerLimit)} caracteres por parte.`
            : 'Sem provedor, o limite real é desconhecido: informe um valor apenas para visualizar a divisão.'}
        </p>
        {!providerLimit && (
          <div className="mb-4 max-w-xs">
            <Field label="Limite de caracteres por parte" htmlFor="n-limit">
              <Input id="n-limit" type="number" min={50} value={limitInput} onChange={(e) => setLimitInput(e.target.value)} />
            </Field>
          </div>
        )}
        {words === 0 ? (
          <p className="text-sm text-warn">Este roteiro não tem conteúdo.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div><dt className="text-muted">Partes</dt><dd className="text-xl font-semibold">{formatNumber(plan.count)}</dd></div>
            <div><dt className="text-muted">Tamanho das partes</dt><dd>{formatNumber(plan.min)}–{formatNumber(plan.max)} car.</dd></div>
            <div><dt className="text-muted">Palavras</dt><dd>{formatNumber(words)}</dd></div>
            <div><dt className="text-muted">Duração estimada</dt><dd>{formatMinutes(estimateNarrationMinutes(words))}</dd></div>
          </dl>
        )}
      </Card>

      {error && <ErrorBanner message={error} />}
      <div className="flex justify-end">
        <Button onClick={generate} disabled={!available || !voiceId || words === 0 || busy} title={available ? undefined : 'Requer um provedor TTS configurado'}>
          {busy ? 'Iniciando…' : 'Gerar narração'}
        </Button>
      </div>
    </div>
  );
}

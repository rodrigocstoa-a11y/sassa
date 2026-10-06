'use client';
import { DEFAULT_CHANNEL_INPUT, LANGUAGES, channelInputSchema, type ChannelInput } from '@rrn/shared';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import { Button, ErrorBanner, Field, Input, Select, Textarea } from '@/components/ui';

interface Props {
  initial?: ChannelInput;
  submitLabel: string;
  onSubmit: (input: ChannelInput) => Promise<void>;
  onCancel: () => void;
}

export function ChannelForm({ initial = DEFAULT_CHANNEL_INPUT, submitLabel, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<ChannelInput>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ChannelInput>(key: K, value: ChannelInput[K]) => setValues((v) => ({ ...v, [key]: value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = channelInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      if (err instanceof ApiError && err.issues.length) {
        setErrors(Object.fromEntries(err.issues.map((i) => [i.path, i.message])));
      } else {
        setFormError(err instanceof Error ? err.message : 'Erro ao salvar');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {formError && <ErrorBanner message={formError} />}
      <Field label="Nome do canal" htmlFor="name" error={errors.name}>
        <Input id="name" value={values.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Histórias Antigas" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Idioma" htmlFor="language" error={errors.language}>
          <Select id="language" value={values.language} onChange={(e) => set('language', e.target.value as ChannelInput['language'])}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </Select>
        </Field>
        <Field label="Nicho" htmlFor="niche" error={errors.niche}>
          <Input id="niche" value={values.niche} onChange={(e) => set('niche', e.target.value)} placeholder="Ex.: História, Finanças" />
        </Field>
      </div>
      <Field label="@ do YouTube (opcional)" htmlFor="youtubeHandle" error={errors.youtubeHandle}>
        <Input id="youtubeHandle" value={values.youtubeHandle} onChange={(e) => set('youtubeHandle', e.target.value)} placeholder="@meucanal" />
      </Field>
      <Field label="Descrição" htmlFor="description" error={errors.description}>
        <Textarea id="description" value={values.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-2 text-xs font-medium uppercase tracking-wide text-muted">Identidade visual</legend>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cor principal" htmlFor="brandPrimaryColor" error={errors.brandPrimaryColor}>
            <input id="brandPrimaryColor" type="color" value={values.brandPrimaryColor} onChange={(e) => set('brandPrimaryColor', e.target.value)} className="h-10 w-full cursor-pointer rounded-lg border border-border bg-surface-2" />
          </Field>
          <Field label="Cor de destaque" htmlFor="brandAccentColor" error={errors.brandAccentColor}>
            <input id="brandAccentColor" type="color" value={values.brandAccentColor} onChange={(e) => set('brandAccentColor', e.target.value)} className="h-10 w-full cursor-pointer rounded-lg border border-border bg-surface-2" />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Estilo visual" htmlFor="brandStyle" error={errors.brandStyle}>
            <Textarea id="brandStyle" value={values.brandStyle} onChange={(e) => set('brandStyle', e.target.value)} placeholder="Ex.: tons sépia, cinematográfico, texto grande na thumbnail" />
          </Field>
        </div>
      </fieldset>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Salvando…' : submitLabel}</Button>
      </div>
    </form>
  );
}

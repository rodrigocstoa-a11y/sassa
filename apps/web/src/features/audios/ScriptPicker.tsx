'use client';
import { languageLabel, type Channel, type ScriptSummary } from '@rrn/shared';
import { useEffect, useState } from 'react';
import { Field, Select } from '@/components/ui';
import { api } from '@/lib/api';

interface Props {
  channels: Channel[];
  channelId: string;
  scriptId: string;
  onChange: (channelId: string, scriptId: string) => void;
}

export function ScriptPicker({ channels, channelId, scriptId, onChange }: Props) {
  const [scripts, setScripts] = useState<ScriptSummary[] | null>(null);
  useEffect(() => {
    let live = true;
    setScripts(null);
    if (!channelId) { setScripts([]); return; }
    api.listScripts({ channelId, limit: 200 }).then((r) => live && setScripts(r.items)).catch(() => live && setScripts([]));
    return () => { live = false; };
  }, [channelId]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Canal" htmlFor="pick-channel">
        <Select id="pick-channel" value={channelId} onChange={(e) => onChange(e.target.value, '')}>
          <option value="">Escolha um canal…</option>
          {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Roteiro" htmlFor="pick-script">
        <Select id="pick-script" value={scriptId} disabled={!channelId || scripts === null} onChange={(e) => onChange(channelId, e.target.value)}>
          <option value="">{scripts && channelId && scripts.length === 0 ? 'Este canal não tem roteiros' : 'Escolha um roteiro…'}</option>
          {scripts?.map((s) => <option key={s.id} value={s.id}>{s.title} · {languageLabel(s.language)}</option>)}
        </Select>
      </Field>
    </div>
  );
}

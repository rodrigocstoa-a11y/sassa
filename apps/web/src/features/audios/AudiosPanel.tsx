'use client';
import { Headphones } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { useAsync } from '@/lib/use-async';
import { AudioStatusBadge } from './StatusBadges';

/** Áudios vinculados a um roteiro (mostrado no editor de roteiros). */
export function AudiosPanel({ scriptId }: { scriptId: string }) {
  const { data, error } = useAsync(() => api.listAudios({ scriptId, limit: 20 }));
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium"><Headphones size={16} /> Áudios</h3>
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      {data && data.items.length === 0 && <p className="mb-3 text-xs text-muted">Nenhum áudio vinculado a este roteiro.</p>}
      {data && data.items.length > 0 && (
        <ul className="mb-3 space-y-2">
          {data.items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
              <Link href={`/audios/${a.id}`} className="min-w-0 truncate text-brand-2 hover:underline">
                {a.title}{a.durationMs != null && <span className="text-muted"> · {formatDuration(a.durationMs)}</span>}
              </Link>
              <AudioStatusBadge status={a.status} approved={!!a.approvedAt} />
            </li>
          ))}
        </ul>
      )}
      <Link href={`/audios/novo?roteiro=${scriptId}`} className="text-xs text-brand-2 hover:underline">+ Nova narração para este roteiro</Link>
    </section>
  );
}

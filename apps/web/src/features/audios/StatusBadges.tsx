import { audioStatusLabel, type AudioStatus } from '@rrn/shared';
import { Badge } from '@/components/ui';

const TONE = { processing: 'brand', completed: 'ok', error: 'danger' } as const;

export function AudioStatusBadge({ status, approved }: { status: AudioStatus; approved?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={TONE[status]}>{audioStatusLabel(status)}</Badge>
      {approved && <Badge tone="ok">Aprovado</Badge>}
    </span>
  );
}

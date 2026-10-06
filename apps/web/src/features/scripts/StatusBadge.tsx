import { scriptStatusLabel, type ScriptStatus } from '@rrn/shared';
import { Badge } from '@/components/ui';

const TONE = { draft: 'muted', in_review: 'warn', approved: 'ok' } as const;

export function StatusBadge({ status }: { status: ScriptStatus }) {
  return <Badge tone={TONE[status]}>{scriptStatusLabel(status)}</Badge>;
}

import { languageLabel, type Channel } from '@rrn/shared';
import { Pencil, Trash2 } from 'lucide-react';
import { Badge, Card } from '@/components/ui';

export function ChannelCard({ channel, onEdit, onDelete }: { channel: Channel; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="h-1.5 rounded-full" style={{ background: `linear-gradient(90deg, ${channel.brandPrimaryColor}, ${channel.brandAccentColor})` }} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{channel.name}</h3>
          {channel.youtubeHandle && <p className="truncate text-xs text-muted">{channel.youtubeHandle.startsWith('@') ? channel.youtubeHandle : `@${channel.youtubeHandle}`}</p>}
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} aria-label={`Editar ${channel.name}`} className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg cursor-pointer"><Pencil size={16} /></button>
          <button onClick={onDelete} aria-label={`Excluir ${channel.name}`} className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-danger cursor-pointer"><Trash2 size={16} /></button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone="brand">{languageLabel(channel.language)}</Badge>
        <Badge>{channel.niche}</Badge>
      </div>
      {channel.description && <p className="line-clamp-3 text-sm text-muted">{channel.description}</p>}
    </Card>
  );
}

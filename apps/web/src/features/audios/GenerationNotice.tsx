'use client';
import { Mic } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

/** Estado REAL da narração automática, vindo da API (hoje: sem provedor TTS). */
export function GenerationNotice() {
  const { data, error } = useAsync(api.audioGenerationStatus);
  const available = data?.available === true;
  return (
    <Card className={`mb-6 ${available ? '' : 'border-warn/30'}`}>
      <div className="flex items-start gap-3">
        <Mic size={20} className="mt-0.5 text-muted" />
        <div>
          <div className="flex items-center gap-2 font-medium">
            Narração automática (TTS)
            <Badge tone={available ? 'ok' : 'warn'}>{available ? `Disponível · ${data?.provider?.name}` : 'Não configurada'}</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted">{error ?? data?.reason ?? 'Verificando…'}</p>
        </div>
      </div>
    </Card>
  );
}

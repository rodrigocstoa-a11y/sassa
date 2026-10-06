'use client';
import { Sparkles } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

/** Mostra o estado REAL da geração automática (hoje: sem provedor LLM). O botão nunca gera texto simulado. */
export function GenerationNotice() {
  const { data, error } = useAsync(api.generationStatus);
  const available = data?.available === true;
  return (
    <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 border-warn/30">
      <div className="flex items-start gap-3">
        <Sparkles size={20} className="mt-0.5 text-muted" />
        <div>
          <div className="flex items-center gap-2 font-medium">
            Geração automática com IA
            <Badge tone={available ? 'ok' : 'warn'}>{available ? 'Disponível' : 'Não configurada'}</Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {error ?? data?.reason ?? 'Verificando…'} Você pode escrever ou colar roteiros externos normalmente.
          </p>
        </div>
      </div>
      <Button variant="ghost" disabled title="Requer um provedor LLM configurado">
        <Sparkles size={16} /> Gerar com IA
      </Button>
    </Card>
  );
}

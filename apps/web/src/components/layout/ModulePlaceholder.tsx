import { PLATFORM_MODULES } from '@rrn/shared';
import { Construction } from 'lucide-react';
import { Badge, EmptyState, PageHeader } from '../ui';

/** Página honesta para módulos ainda não implementados: sem dados nem botões simulados. */
export function ModulePlaceholder({ moduleKey }: { moduleKey: string }) {
  const m = PLATFORM_MODULES.find((x) => x.key === moduleKey)!;
  return (
    <>
      <PageHeader title={m.label} description={m.description} action={<Badge tone="warn">Fase {m.phase} · não implementado</Badge>} />
      <EmptyState
        icon={<Construction size={32} />}
        title="Este módulo ainda não foi construído"
        description={`Será implementado na Fase ${m.phase} do plano. Nenhuma funcionalidade foi simulada aqui.`}
      />
    </>
  );
}

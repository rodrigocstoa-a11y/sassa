'use client';
import type { Channel, ChannelInput } from '@rrn/shared';
import { Plus, Tv } from 'lucide-react';
import { useState } from 'react';
import { Button, EmptyState, ErrorBanner, Modal, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { ChannelCard } from './ChannelCard';
import { ChannelForm } from './ChannelForm';

type Dialog = { kind: 'create' } | { kind: 'edit'; channel: Channel } | { kind: 'delete'; channel: Channel } | null;

export function ChannelsView() {
  const { data, error, loading, reload } = useAsync(api.listChannels);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const close = () => { setDialog(null); setDeleteError(null); };

  async function save(input: ChannelInput) {
    if (dialog?.kind === 'edit') await api.updateChannel(dialog.channel.id, input);
    else await api.createChannel(input);
    close();
    await reload();
  }

  async function confirmDelete() {
    if (dialog?.kind !== 'delete') return;
    try {
      await api.deleteChannel(dialog.channel.id);
      close();
      await reload();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Erro ao excluir');
    }
  }

  const newButton = <Button onClick={() => setDialog({ kind: 'create' })}><Plus size={16} /> Novo canal</Button>;

  return (
    <>
      <PageHeader title="Canais" description="Cadastre os canais do YouTube e defina a identidade de cada um." action={data?.length ? newButton : undefined} />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <p className="text-sm text-muted">Carregando…</p>}
      {data && data.length === 0 && (
        <EmptyState icon={<Tv size={32} />} title="Nenhum canal cadastrado" description="Crie o primeiro canal para começar a organizar roteiros e vídeos." action={newButton} />
      )}
      {data && data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => (
            <ChannelCard key={c.id} channel={c} onEdit={() => setDialog({ kind: 'edit', channel: c })} onDelete={() => setDialog({ kind: 'delete', channel: c })} />
          ))}
        </div>
      )}

      <Modal open={dialog?.kind === 'create' || dialog?.kind === 'edit'} title={dialog?.kind === 'edit' ? 'Editar canal' : 'Novo canal'} onClose={close}>
        {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
          <ChannelForm
            initial={dialog.kind === 'edit' ? dialog.channel : undefined}
            submitLabel={dialog.kind === 'edit' ? 'Salvar alterações' : 'Criar canal'}
            onSubmit={save}
            onCancel={close}
          />
        )}
      </Modal>

      <Modal open={dialog?.kind === 'delete'} title="Excluir canal" onClose={close}>
        {dialog?.kind === 'delete' && (
          <div className="space-y-4">
            {deleteError && <ErrorBanner message={deleteError} />}
            <p className="text-sm text-muted">
              Excluir <strong className="text-fg">{dialog.channel.name}</strong>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={close}>Cancelar</Button>
              <Button variant="danger" onClick={confirmDelete}>Excluir</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

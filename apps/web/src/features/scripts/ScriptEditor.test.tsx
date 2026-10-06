import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Channel, ScriptDetail } from '@rrn/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock('@/lib/api', async (orig) => {
  const mod = await orig<typeof import('@/lib/api')>();
  return { ...mod, api: { createScript: vi.fn(), updateScript: vi.fn(), deleteScript: vi.fn(), createTranslation: vi.fn() } };
});

import { api } from '@/lib/api';
import { ScriptEditor } from './ScriptEditor';

const channel = { id: 'c1', name: 'Canal A', language: 'pt-BR' } as Channel;
const detail = (over: Partial<ScriptDetail> = {}): ScriptDetail => ({
  id: 's1', ownerId: 'local', channelId: 'c1', sourceScriptId: null, title: 'Roma', language: 'pt-BR', topic: '',
  content: 'um dois três', status: 'draft', wordCount: 3, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  approvedAt: null, source: null, translations: [], outdated: false, ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('ScriptEditor', () => {
  it('não salva sem título e mostra o erro', async () => {
    render(<ScriptEditor channels={[channel]} />);
    await userEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    expect(await screen.findByText('Informe ao menos 2 caracteres')).toBeInTheDocument();
    expect(api.createScript).not.toHaveBeenCalled();
  });

  it('salva um roteiro colado preservando a formatação e vai para a página dele', async () => {
    vi.mocked(api.createScript).mockResolvedValue(detail({ id: 'novo' }));
    render(<ScriptEditor channels={[channel]} />);
    await userEvent.type(screen.getByLabelText('Título'), 'Meu roteiro');
    const area = screen.getByLabelText('Conteúdo do roteiro');
    await userEvent.click(area);
    await userEvent.paste('Linha 1\n\n  Linha 2');
    expect(screen.getByText('4 palavras')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(api.createScript).toHaveBeenCalled());
    expect(vi.mocked(api.createScript).mock.calls[0][0]).toMatchObject({
      channelId: 'c1', title: 'Meu roteiro', content: 'Linha 1\n\n  Linha 2', status: 'draft',
    });
    expect(replace).toHaveBeenCalledWith('/roteiros/novo');
  });

  it('impede aprovar roteiro vazio', async () => {
    render(<ScriptEditor channels={[channel]} />);
    await userEvent.type(screen.getByLabelText('Título'), 'Vazio');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'approved');
    await userEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    expect(await screen.findByText(/Só é possível enviar para revisão ou aprovar/)).toBeInTheDocument();
    expect(api.createScript).not.toHaveBeenCalled();
  });

  it('edita um roteiro existente: botão salvar só habilita com alteração', async () => {
    vi.mocked(api.updateScript).mockResolvedValue(detail({ title: 'Roma II' }));
    render(<ScriptEditor channels={[channel]} script={detail()} />);
    const save = screen.getByRole('button', { name: /Salvar/ });
    expect(save).toBeDisabled();
    const title = screen.getByLabelText('Título');
    await userEvent.clear(title);
    await userEvent.type(title, 'Roma II');
    expect(screen.getByText(/Alterações não salvas/)).toBeInTheDocument();
    await userEvent.click(save);
    await waitFor(() => expect(api.updateScript).toHaveBeenCalledWith('s1', expect.objectContaining({ title: 'Roma II' })));
    expect(await screen.findByRole('status')).toHaveTextContent('Salvo');
  });

  it('bloqueia canal e idioma de uma tradução', () => {
    const t = detail({ id: 't1', language: 'es', sourceScriptId: 's1', source: detail() });
    render(<ScriptEditor channels={[channel]} script={t} />);
    expect(screen.getByLabelText('Idioma')).toBeDisabled();
    expect(screen.getByLabelText('Canal')).toBeDisabled();
  });
});

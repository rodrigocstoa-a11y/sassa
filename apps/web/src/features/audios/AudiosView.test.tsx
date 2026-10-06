import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AudioSummary } from '@rrn/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/api', async (orig) => {
  const mod = await orig<typeof import('@/lib/api')>();
  return {
    ...mod,
    api: {
      listChannels: vi.fn(), listScripts: vi.fn(), listAudios: vi.fn(), audioGenerationStatus: vi.fn(),
    },
  };
});

import { api } from '@/lib/api';
import { AudiosView } from './AudiosView';

const audio = (over: Partial<AudioSummary>): AudioSummary => ({
  id: 'a1', ownerId: 'local', channelId: 'c1', channelName: 'Canal A', scriptId: 's1', scriptTitle: 'Roma', title: 'Narração Roma',
  language: 'pt-BR', status: 'completed', source: 'upload', providerId: null, voiceId: null, voiceName: null, settings: {},
  mimeType: 'audio/mpeg', sizeBytes: 2_500_000, durationMs: 125_000, originalFilename: null, partsTotal: 0, partsDone: 0,
  errorMessage: null, approvedAt: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', scriptOutdated: false, hasFile: true, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listChannels).mockResolvedValue([{ id: 'c1', name: 'Canal A' }] as never);
  vi.mocked(api.listScripts).mockResolvedValue({ items: [{ id: 's1', title: 'Roma' }], total: 1 } as never);
  vi.mocked(api.audioGenerationStatus).mockResolvedValue({ available: false, provider: null, reason: 'Não configurada.', requirements: [] });
});

describe('AudiosView', () => {
  it('mostra estado vazio sem inventar dados', async () => {
    vi.mocked(api.listAudios).mockResolvedValue({ items: [], total: 0 });
    render(<AudiosView />);
    expect(await screen.findByText('Nenhum áudio ainda')).toBeInTheDocument();
    expect(screen.getByText('Não configurada.')).toBeInTheDocument();
  });

  it('lista áudios com status, duração real e ações; desabilita reprodução sem arquivo', async () => {
    vi.mocked(api.listAudios).mockResolvedValue({
      total: 3,
      items: [
        audio({}),
        audio({ id: 'a2', title: 'Em andamento', status: 'processing', hasFile: false, partsTotal: 10, partsDone: 4, durationMs: null, sizeBytes: null, source: 'provider' }),
        audio({ id: 'a3', title: 'Quebrou', status: 'error', hasFile: false, errorMessage: 'Falha do provedor', scriptOutdated: true }),
      ],
    });
    render(<AudiosView />);
    const row = (await screen.findByText('Narração Roma')).closest('tr')!;
    expect(within(row).getByText('Concluído')).toBeInTheDocument();
    expect(within(row).getByText('2:05')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Baixar Narração Roma' })).toHaveAttribute('href', '/api/audios/a1/file?download=1');
    expect(within(row).getByRole('button', { name: 'Reproduzir Narração Roma' })).toBeEnabled();

    const proc = screen.getByText('Em andamento').closest('tr')!;
    expect(within(proc).getByText('4/10 partes')).toBeInTheDocument();
    expect(within(proc).getByRole('button', { name: /Reproduzir/ })).toBeDisabled();
    expect(within(proc).queryByRole('link', { name: /Baixar/ })).not.toBeInTheDocument();

    const err = screen.getByText('Quebrou').closest('tr')!;
    expect(within(err).getByText('Erro')).toBeInTheDocument();
    expect(within(err).getByText('Falha do provedor')).toBeInTheDocument();
    expect(within(err).getByText(/roteiro alterado/)).toBeInTheDocument();
  });

  it('envia pesquisa e filtros à API', async () => {
    vi.mocked(api.listAudios).mockResolvedValue({ items: [], total: 0 });
    render(<AudiosView />);
    await screen.findByText('Nenhum áudio ainda');
    await userEvent.type(screen.getByLabelText('Pesquisar áudios'), 'roma');
    await userEvent.selectOptions(screen.getByLabelText('Filtrar por status'), 'error');
    await userEvent.selectOptions(screen.getByLabelText('Filtrar por idioma'), 'es');
    await waitFor(() =>
      expect(api.listAudios).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'roma', status: 'error', language: 'es', offset: 0 })),
    );
    expect(await screen.findByText('Nenhum áudio encontrado')).toBeInTheDocument();
  });
});

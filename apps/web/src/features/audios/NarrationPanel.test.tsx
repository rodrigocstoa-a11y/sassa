import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScriptDetail } from '@rrn/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/lib/api', () => ({ api: { audioGenerationStatus: vi.fn(), audioVoices: vi.fn(), generateAudio: vi.fn(), audioEstimate: vi.fn(), budget: vi.fn() } }));

import { api } from '@/lib/api';
import { NarrationPanel } from './NarrationPanel';

const script = {
  id: 's1', channelId: 'c1', title: 'Roma', language: 'pt-BR',
  content: Array.from({ length: 30 }, (_, i) => `Esta é a frase número ${i + 1} do roteiro.`).join(' '),
} as ScriptDetail;

const REQ = ['Documentação oficial da API do Talkify Labs', 'Chave de API só no servidor'];

beforeEach(() => vi.clearAllMocks());

describe('NarrationPanel sem provedor TTS', () => {
  beforeEach(() => {
    vi.mocked(api.audioGenerationStatus).mockResolvedValue({ available: false, provider: null, reason: 'A narração automática não está configurada.', requirements: REQ });
    vi.mocked(api.audioVoices).mockResolvedValue({ available: false, voices: [], reason: 'não configurada' });
  });

  it('explica o que falta e bloqueia a geração', async () => {
    render(<NarrationPanel script={script} />);
    expect(await screen.findByText('Narração automática indisponível')).toBeInTheDocument();
    expect(screen.getByText('A narração automática não está configurada.')).toBeInTheDocument();
    for (const r of REQ) expect(screen.getByText(r)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerar narração' })).toBeDisabled();
    expect(screen.getByLabelText('Voz')).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Nenhuma voz disponível' })).toBeInTheDocument();
    expect(api.generateAudio).not.toHaveBeenCalled();
  });

  it('a pré-visualização da divisão usa o divisor real e reage ao limite', async () => {
    render(<NarrationPanel script={script} />);
    await screen.findByText('Pré-visualização');
    const parts = () => Number(screen.getByText('Partes').nextElementSibling!.textContent);
    expect(parts()).toBe(1); // ~1100 caracteres cabem em 4000
    const limit = screen.getByLabelText('Limite de caracteres por parte');
    await userEvent.clear(limit);
    await userEvent.type(limit, '300');
    await waitFor(() => expect(parts()).toBeGreaterThan(3));
  });
});

describe('NarrationPanel com provedor', () => {
  const provider = { available: true, provider: { id: 'p', name: 'Provedor X', maxCharsPerRequest: 500 }, reason: null, requirements: [] };

  beforeEach(() => {
    vi.mocked(api.audioGenerationStatus).mockResolvedValue(provider);
    vi.mocked(api.audioVoices).mockResolvedValue({ available: true, voices: [{ id: 'v1', name: 'Ana', language: 'pt-BR' }], reason: null });
    vi.mocked(api.audioEstimate).mockResolvedValue({ estimateUsd: 1.234, parts: 3, characters: 1200 });
    vi.mocked(api.generateAudio).mockResolvedValue({ id: 'a1' } as never);
  });

  it('usa o limite do provedor e só gera depois de escolher a voz e confirmar o custo', async () => {
    vi.mocked(api.budget).mockResolvedValue({ monthlyLimitUsd: 50, spentUsd: 5, remainingUsd: 45, periodStart: '' });
    render(<NarrationPanel script={script} />);
    expect(await screen.findByText(/Limite do provedor: 500 caracteres/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Limite de caracteres por parte')).not.toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Gerar narração' });
    await waitFor(() => expect(screen.getByLabelText('Voz')).toBeEnabled());
    expect(btn).toBeDisabled(); // falta a voz

    await userEvent.selectOptions(screen.getByLabelText('Voz'), 'v1');
    expect(await screen.findByText('US$ 1.23')).toBeInTheDocument();
    expect(screen.getByText('US$ 45.00')).toBeInTheDocument();
    expect(btn).toBeDisabled(); // falta confirmar o custo

    await userEvent.click(screen.getByRole('checkbox'));
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    expect(api.generateAudio).toHaveBeenCalledWith({ scriptId: 's1', voiceId: 'v1', settings: { speed: 1 }, approvedMaxCostUsd: 1.234 });
  });

  it('avisa quando não há orçamento definido ou quando a estimativa não cabe', async () => {
    vi.mocked(api.budget).mockResolvedValue({ monthlyLimitUsd: null, spentUsd: 0, remainingUsd: 0, periodStart: '' });
    render(<NarrationPanel script={script} />);
    await waitFor(() => expect(screen.getByLabelText('Voz')).toBeEnabled());
    await userEvent.selectOptions(screen.getByLabelText('Voz'), 'v1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Nenhum orçamento mensal definido');
    expect(screen.getByRole('link', { name: 'Ajustar em Configurações' })).toHaveAttribute('href', '/configuracoes');
  });
});

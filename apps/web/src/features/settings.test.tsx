import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  api: { health: vi.fn(), providers: vi.fn(), budget: vi.fn(), setBudget: vi.fn(), budgetEvents: vi.fn() },
}));

import { api } from '@/lib/api';
import { Settings } from './settings';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.health).mockResolvedValue({ status: 'ok', database: 'ok', version: '0.2.0', engine: 'postgres', storage: 's3', authRequired: true, role: 'all' });
  vi.mocked(api.providers).mockResolvedValue([{ kind: 'tts', label: 'Narração (TTS)', configured: false, note: 'Aguardando' }]);
  vi.mocked(api.budgetEvents).mockResolvedValue([]);
});

describe('Configurações', () => {
  it('mostra o ambiente real (banco, armazenamento, login) e que nenhum provedor está conectado', async () => {
    vi.mocked(api.budget).mockResolvedValue({ monthlyLimitUsd: null, spentUsd: 0, remainingUsd: 0, periodStart: '' });
    render(<Settings />);
    expect(await screen.findByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByText('S3/R2 (nuvem)')).toBeInTheDocument();
    expect(screen.getByText('Obrigatório')).toBeInTheDocument();
    expect(screen.getByText('Não configurado')).toBeInTheDocument();
  });

  it('sem orçamento definido avisa que gastos pagos estão bloqueados e permite definir o limite', async () => {
    vi.mocked(api.budget).mockResolvedValueOnce({ monthlyLimitUsd: null, spentUsd: 0, remainingUsd: 0, periodStart: '' });
    vi.mocked(api.setBudget).mockResolvedValue({ monthlyLimitUsd: 25, spentUsd: 0, remainingUsd: 25, periodStart: '' });
    vi.mocked(api.budget).mockResolvedValue({ monthlyLimitUsd: 25, spentUsd: 0, remainingUsd: 25, periodStart: '' });
    render(<Settings />);
    expect(await screen.findByText('Não definido')).toBeInTheDocument();
    expect(screen.getByText(/nenhuma ação paga é executada/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Limite mensal (US$)'), '25');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar limite' }));
    expect(api.setBudget).toHaveBeenCalledWith(25);
    await waitFor(() => expect(screen.getAllByText('$25.00').length).toBeGreaterThan(0));
  });

  it('rejeita valor negativo sem chamar a API', async () => {
    vi.mocked(api.budget).mockResolvedValue({ monthlyLimitUsd: 10, spentUsd: 2, remainingUsd: 8, periodStart: '' });
    render(<Settings />);
    const input = await screen.findByLabelText('Limite mensal (US$)');
    await userEvent.clear(input);
    await userEvent.type(input, '-5');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar limite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('igual ou maior que zero');
    expect(api.setBudget).not.toHaveBeenCalled();
  });
});

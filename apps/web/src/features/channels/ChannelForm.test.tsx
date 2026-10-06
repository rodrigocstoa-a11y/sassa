import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChannelForm } from './ChannelForm';

describe('ChannelForm', () => {
  it('mostra erros de validação e não envia dados inválidos', async () => {
    const onSubmit = vi.fn();
    render(<ChannelForm submitLabel="Criar canal" onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Criar canal' }));
    expect(await screen.findByText('Informe ao menos 2 caracteres')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envia os dados quando válidos', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ChannelForm submitLabel="Criar canal" onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.type(screen.getByLabelText('Nome do canal'), 'Meu Canal');
    await userEvent.type(screen.getByLabelText('Nicho'), 'Tecnologia');
    await userEvent.click(screen.getByRole('button', { name: 'Criar canal' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Meu Canal', niche: 'Tecnologia', language: 'pt-BR' }));
  });
});

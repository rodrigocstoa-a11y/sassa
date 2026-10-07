import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
let search = '';
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }), useSearchParams: () => new URLSearchParams(search) }));
vi.mock('@/lib/api', async (orig) => {
  const mod = await orig<typeof import('@/lib/api')>();
  return { ...mod, api: { login: vi.fn() } };
});

import { api, ApiError } from '@/lib/api';
import { LoginForm, safeNext } from './LoginForm';

beforeEach(() => { vi.clearAllMocks(); search = ''; });

describe('safeNext', () => {
  it('aceita só caminhos internos', () => {
    expect(safeNext('/roteiros/abc')).toBe('/roteiros/abc');
    expect(safeNext(null)).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/login?next=/')).toBe('/');
  });
});

describe('LoginForm', () => {
  it('entra e volta para a página que o usuário queria', async () => {
    search = 'next=%2Faudios';
    vi.mocked(api.login).mockResolvedValue({ user: { email: 'a@b.c', role: 'admin' } });
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText('E-mail'), 'dono@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-segura');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(api.login).toHaveBeenCalledWith('dono@example.com', 'senha-segura');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/audios'));
  });

  it('mostra o erro do servidor e não navega', async () => {
    vi.mocked(api.login).mockRejectedValue(new ApiError('E-mail ou senha incorretos', 401));
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText('E-mail'), 'dono@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos');
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
let pathname = '/roteiros';
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }), usePathname: () => pathname }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock('@/lib/api', () => ({ api: { me: vi.fn(), logout: vi.fn() } }));

import { api } from '@/lib/api';
import { AppShell } from './AppShell';

beforeEach(() => { vi.clearAllMocks(); pathname = '/roteiros'; });

describe('AppShell', () => {
  it('com login obrigatório e sem sessão, leva ao login guardando a página de destino e não mostra o painel', async () => {
    vi.mocked(api.me).mockResolvedValue({ authRequired: true, user: null });
    render(<AppShell><p>conteúdo secreto</p></AppShell>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?next=%2Froteiros'));
    expect(screen.queryByText('conteúdo secreto')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('com sessão, mostra menu, conteúdo e o usuário com a opção Sair', async () => {
    vi.mocked(api.me).mockResolvedValue({ authRequired: true, user: { email: 'dono@example.com', role: 'admin' } });
    render(<AppShell><p>conteúdo</p></AppShell>);
    expect(await screen.findByText('conteúdo')).toBeInTheDocument();
    expect(screen.getByText('dono@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Módulos' })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('com login desligado (desenvolvimento), mostra o painel sem usuário', async () => {
    vi.mocked(api.me).mockResolvedValue({ authRequired: false, user: null });
    render(<AppShell><p>conteúdo</p></AppShell>);
    expect(await screen.findByText('conteúdo')).toBeInTheDocument();
    expect(screen.getByText(/modo local/)).toBeInTheDocument();
  });

  it('mostra erro quando a API não responde', async () => {
    vi.mocked(api.me).mockRejectedValue(new Error('Não foi possível conectar à API.'));
    render(<AppShell><p>conteúdo</p></AppShell>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conectar');
    expect(screen.queryByText('conteúdo')).not.toBeInTheDocument();
  });

  it('a tela de login não depende do painel', async () => {
    pathname = '/login';
    vi.mocked(api.me).mockResolvedValue({ authRequired: true, user: null });
    render(<AppShell><p>formulário</p></AppShell>);
    expect(screen.getByText('formulário')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});

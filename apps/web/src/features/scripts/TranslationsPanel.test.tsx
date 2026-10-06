import { render, screen } from '@testing-library/react';
import type { ScriptDetail } from '@rrn/shared';
import { describe, expect, it, vi } from 'vitest';
import { TranslationsPanel } from './TranslationsPanel';

const base = {
  id: 's1', ownerId: 'local', channelId: 'c1', sourceScriptId: null, title: 'Roma', language: 'pt-BR', topic: '', content: 'x',
  status: 'draft', wordCount: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', approvedAt: null,
  source: null, translations: [], outdated: false,
} as ScriptDetail;

describe('TranslationsPanel', () => {
  it('oferece espanhol e italiano (não o idioma do original nem os já traduzidos)', () => {
    const withEs = { ...base, translations: [{ ...base, id: 't1', language: 'es', sourceScriptId: 's1' }] } as ScriptDetail;
    render(<TranslationsPanel script={withEs} dirty={false} onCreated={vi.fn()} />);
    const select = screen.getByLabelText('Idioma da nova tradução');
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(options).toContain('it');
    expect(options).not.toContain('es');
    expect(options).not.toContain('pt-BR');
    expect(screen.getByText(/tradução automática ainda não está configurada/)).toBeInTheDocument();
  });

  it('desabilita a criação com alterações não salvas', () => {
    render(<TranslationsPanel script={base} dirty onCreated={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Criar' })).toBeDisabled();
  });

  it('em uma tradução, mostra o original e o aviso de desatualizada', () => {
    const t = { ...base, id: 't1', language: 'es', sourceScriptId: 's1', source: base, outdated: true } as ScriptDetail;
    render(<TranslationsPanel script={t} dirty={false} onCreated={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Roma' })).toHaveAttribute('href', '/roteiros/s1');
    expect(screen.getByRole('status')).toHaveTextContent('O original foi alterado');
  });
});

import { describe, expect, it } from 'vitest';
import { isActive } from './Sidebar';

describe('isActive', () => {
  it('raiz só ativa na raiz', () => {
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/canais', '/')).toBe(false);
  });
  it('rotas aninhadas ativam o módulo', () => {
    expect(isActive('/canais/abc', '/canais')).toBe(true);
    expect(isActive('/canaisx', '/canais')).toBe(false);
  });
});

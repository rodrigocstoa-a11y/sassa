import { listenWithFallback } from './listen';

const quiet = { warn: () => {} } as never;
const eafnosupport = () => Object.assign(new Error('listen EAFNOSUPPORT'), { code: 'EAFNOSUPPORT' });

describe('listenWithFallback', () => {
  it('usa o host pedido quando funciona', async () => {
    const calls: string[] = [];
    expect(await listenWithFallback({ listen: async (_p, h) => void calls.push(h) }, 1, '::', quiet)).toBe('::');
    expect(calls).toEqual(['::']);
  });

  it('sem IPv6, cai para 0.0.0.0 em vez de derrubar o serviço', async () => {
    const calls: string[] = [];
    const app = { listen: async (_p: number, h: string) => { calls.push(h); if (h === '::') throw eafnosupport(); } };
    expect(await listenWithFallback(app, 1, '::', quiet)).toBe('0.0.0.0');
    expect(calls).toEqual(['::', '0.0.0.0']);
  });

  it('outros erros (porta ocupada, por exemplo) continuam sendo propagados', async () => {
    const busy = Object.assign(new Error('EADDRINUSE'), { code: 'EADDRINUSE' });
    await expect(listenWithFallback({ listen: async () => { throw busy; } }, 1, '::', quiet)).rejects.toBe(busy);
    await expect(listenWithFallback({ listen: async () => { throw eafnosupport(); } }, 1, '127.0.0.1', quiet)).rejects.toThrow(/EAFNOSUPPORT/);
  });
});

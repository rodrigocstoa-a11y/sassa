import { Logger } from '@nestjs/common';

interface Listenable {
  listen(port: number, host: string): Promise<unknown>;
}

/**
 * Sobe o servidor HTTP. Com HOST=:: (necessário para a rede privada IPv6 de algumas plataformas) e um ambiente
 * sem IPv6, o Node falha com EAFNOSUPPORT; nesse caso cai para 0.0.0.0 em vez de derrubar o serviço.
 */
export async function listenWithFallback(app: Listenable, port: number, host: string, log = new Logger('API')): Promise<string> {
  try {
    await app.listen(port, host);
    return host;
  } catch (err) {
    if (host === '::' && (err as { code?: string })?.code === 'EAFNOSUPPORT') {
      log.warn('IPv6 indisponível neste ambiente; usando 0.0.0.0');
      await app.listen(port, '0.0.0.0');
      return '0.0.0.0';
    }
    throw err;
  }
}

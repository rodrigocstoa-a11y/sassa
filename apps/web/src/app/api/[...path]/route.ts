import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Repassa /api/* do navegador para a API, em tempo de execução (API_URL é lida a cada requisição, então a mesma
 * imagem do site serve qualquer ambiente). O navegador só fala com o site: cookie de sessão no mesmo domínio,
 * sem CORS e sem expor a API. Arquivos grandes NÃO passam por aqui: vão direto ao armazenamento por URL assinada.
 */
const HOP_BY_HOP = ['connection', 'keep-alive', 'transfer-encoding', 'te', 'upgrade', 'proxy-authenticate', 'proxy-authorization', 'trailer'];

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const base = (process.env.API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
  const target = `${base}/api/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  for (const h of [...HOP_BY_HOP, 'host', 'content-length']) headers.delete(h);

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // @ts-expect-error `duplex` é exigido pelo Node para corpo em stream e ainda não está nos tipos do DOM
      duplex: 'half',
      redirect: 'manual', // o redirecionamento assinado do arquivo de áudio é entregue ao navegador
      cache: 'no-store',
    });
  } catch {
    return Response.json({ message: 'A API está indisponível no momento.' }, { status: 502 });
  }

  const out = new Headers(upstream.headers);
  // fetch já descomprimiu o corpo: estes cabeçalhos não valem mais
  for (const h of [...HOP_BY_HOP, 'content-encoding', 'content-length']) out.delete(h);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as OPTIONS, proxy as HEAD };

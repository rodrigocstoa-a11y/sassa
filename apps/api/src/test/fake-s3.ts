import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Servidor S3 MÍNIMO e FALSO, só para testes: aceita PUT/GET(Range)/HEAD/DELETE/listagem/DeleteObjects
 * e RECUSA (403) qualquer requisição sem assinatura, o que garante que o código sempre assina os acessos.
 * Não valida a assinatura em si: isso só é possível contra um bucket real.
 */
export class FakeS3 {
  readonly objects = new Map<string, { data: Buffer; contentType?: string }>();
  readonly log: string[] = [];
  private server!: Server;
  endpoint = '';

  async start() {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const url = new URL(req.url!, 'http://x');
        const signed = !!req.headers.authorization || url.searchParams.has('X-Amz-Signature');
        this.log.push(`${req.method} ${url.pathname}${url.search ? '?' + [...url.searchParams.keys()].join('&') : ''} signed=${signed}`);
        if (!signed) { res.writeHead(403).end('<Error><Code>AccessDenied</Code></Error>'); return; }
        const [, bucket, ...rest] = url.pathname.split('/');
        const key = decodeURIComponent(rest.join('/'));
        const body = Buffer.concat(chunks);
        const k = `${bucket}/${key}`;

        if (req.method === 'GET' && url.searchParams.get('list-type') === '2') {
          const prefix = `${bucket}/${url.searchParams.get('prefix') ?? ''}`;
          const keys = [...this.objects.keys()].filter((o) => o.startsWith(prefix)).map((o) => o.slice(bucket.length + 1));
          res.writeHead(200, { 'Content-Type': 'application/xml' });
          res.end(`<ListBucketResult><IsTruncated>false</IsTruncated>${keys.map((x) => `<Contents><Key>${x}</Key></Contents>`).join('')}</ListBucketResult>`);
        } else if (req.method === 'POST' && url.searchParams.has('delete')) {
          for (const m of body.toString().matchAll(/<Key>([^<]+)<\/Key>/g)) this.objects.delete(`${bucket}/${m[1]}`);
          res.writeHead(200, { 'Content-Type': 'application/xml' }).end('<DeleteResult></DeleteResult>');
        } else if (req.method === 'PUT') {
          this.objects.set(k, { data: body, contentType: req.headers['content-type'] });
          res.writeHead(200, { ETag: '"fake"' }).end();
        } else if (req.method === 'DELETE') {
          this.objects.delete(k);
          res.writeHead(204).end();
        } else if (req.method === 'GET' || req.method === 'HEAD') {
          const o = this.objects.get(k);
          if (!o) { res.writeHead(404, { 'Content-Type': 'application/xml' }).end('<Error><Code>NoSuchKey</Code></Error>'); return; }
          const range = /bytes=(\d+)-(\d+)?/.exec(String(req.headers.range ?? url.searchParams.get('range') ?? ''));
          const headers: Record<string, string | number> = { 'Content-Type': o.contentType ?? 'application/octet-stream', 'Accept-Ranges': 'bytes' };
          if (range && req.method === 'GET') {
            const start = Number(range[1]);
            const end = Math.min(range[2] ? Number(range[2]) : o.data.length - 1, o.data.length - 1);
            const slice = o.data.subarray(start, end + 1);
            res.writeHead(206, { ...headers, 'Content-Length': slice.length, 'Content-Range': `bytes ${start}-${end}/${o.data.length}` }).end(slice);
          } else {
            res.writeHead(200, { ...headers, 'Content-Length': o.data.length }).end(req.method === 'GET' ? o.data : undefined);
          }
        } else {
          res.writeHead(400).end();
        }
      });
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.endpoint = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  keys() {
    return [...this.objects.keys()].map((k) => k.replace(/^test-bucket\//, ''));
  }

  stop() {
    return new Promise<void>((r) => this.server.close(() => r()));
  }
}

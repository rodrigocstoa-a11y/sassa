import type { NextConfig } from 'next';

// A API fica em loopback; o navegador só fala com o Next (sem CORS e sem expor a porta da API).
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3001';

const config: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default config;

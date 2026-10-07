import { join } from 'node:path';
import type { NextConfig } from 'next';

// A ponte /api/* → API fica em src/app/api/[...path]/route.ts e lê API_URL em tempo de execução.
const config: NextConfig = {
  // Docker: gera uma pasta autocontida (.next/standalone) para uma imagem pequena.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: join(__dirname, '../../'),
  poweredByHeader: false,
};

export default config;

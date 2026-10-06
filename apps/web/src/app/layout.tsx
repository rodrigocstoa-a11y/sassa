import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import './globals.css';

export const metadata: Metadata = {
  title: 'RRN Studio AI',
  description: 'Plataforma de produção automatizada de vídeos para YouTube',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="min-w-0 flex-1 px-10 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}

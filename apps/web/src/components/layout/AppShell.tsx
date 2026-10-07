'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ErrorBanner } from '@/components/ui';
import { api } from '@/lib/api';
import { Sidebar } from './Sidebar';

type Session =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'redirecting' }
  /** user = null significa login desligado (desenvolvimento local). */
  | { state: 'ready'; user: { email: string } | null };

/** Descobre se há sessão. Com login obrigatório e sem sessão, leva para /login; senão mostra o painel. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session>({ state: 'loading' });
  const onLogin = pathname === '/login';

  useEffect(() => {
    let live = true;
    api.me()
      .then((me) => {
        if (!live) return;
        if (me.authRequired && !me.user) {
          setSession({ state: 'redirecting' });
          if (!onLogin) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        setSession({ state: 'ready', user: me.user });
        if (onLogin) router.replace('/'); // já está logado
      })
      .catch((e) => live && setSession({ state: 'error', message: e instanceof Error ? e.message : 'Erro ao conectar' }));
    return () => { live = false; };
  }, [pathname, onLogin, router]);

  async function logout() {
    await api.logout().catch(() => {});
    setSession({ state: 'redirecting' });
    router.replace('/login');
  }

  if (onLogin) {
    // A tela de login não precisa do estado da sessão para renderizar.
    return <main className="flex min-h-screen items-center justify-center px-4">{children}</main>;
  }
  if (session.state === 'error') {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <ErrorBanner message={session.message} />
      </main>
    );
  }
  if (session.state !== 'ready') {
    return <main className="flex min-h-screen items-center justify-center text-sm text-muted">Carregando…</main>;
  }
  return (
    <div className="flex min-h-screen">
      <Sidebar user={session.user} onLogout={logout} />
      <main className="min-w-0 flex-1 px-10 py-8">{children}</main>
    </div>
  );
}

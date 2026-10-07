'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { LogoMark } from '@/components/layout/Logo';
import { Button, ErrorBanner, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';

/** Só aceita caminhos internos (evita redirecionamento para outro site depois do login). */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/';
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.login(email, password);
      router.replace(safeNext(params.get('next')));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-surface p-8">
      <div className="flex items-center gap-3">
        <LogoMark size={40} />
        <div>
          <h1 className="text-lg font-semibold leading-tight">RRN Studio AI</h1>
          <p className="text-xs text-muted">Entre para acessar o painel</p>
        </div>
      </div>
      {error && <ErrorBanner message={error} />}
      <Field label="E-mail" htmlFor="login-email">
        <Input id="login-email" type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Senha" htmlFor="login-password">
        <Input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Entrando…' : 'Entrar'}</Button>
    </form>
  );
}

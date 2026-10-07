'use client';
import { PLATFORM_MODULES } from '@rrn/shared';
import { Clapperboard, FileText, Headphones, Image as ImageIcon, LayoutDashboard, ListChecks, Settings, Tv, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  channels: Tv,
  scripts: FileText,
  audio: Headphones,
  images: ImageIcon,
  editor: Clapperboard,
  queue: ListChecks,
  settings: Settings,
};

export function isActive(pathname: string, path: string) {
  return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
}

export function Sidebar({ user, onLogout }: { user?: { email: string } | null; onLogout?: () => void }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface px-4 py-6">
      <div className="mb-8 px-2"><Logo /></div>
      <nav aria-label="Módulos" className="flex flex-1 flex-col gap-1">
        {PLATFORM_MODULES.map((m) => {
          const Icon = ICONS[m.key];
          const active = isActive(pathname, m.path);
          return (
            <Link
              key={m.key}
              href={m.path}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                active ? 'bg-brand/15 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'
              }`}
            >
              <Icon size={18} className={active ? 'text-brand-2' : ''} />
              <span className="flex-1">{m.label}</span>
              {m.status === 'planned' && (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted" title={`Planejado para a Fase ${m.phase}`}>
                  F{m.phase}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {user ? (
        <div className="border-t border-border px-2 pt-3">
          <p className="truncate text-xs text-muted" title={user.email}>{user.email}</p>
          <button onClick={onLogout} className="mt-1 cursor-pointer text-xs text-brand-2 hover:underline">Sair</button>
        </div>
      ) : (
        <p className="px-2 text-[11px] text-muted">v0.2.0 · modo local</p>
      )}
    </aside>
  );
}

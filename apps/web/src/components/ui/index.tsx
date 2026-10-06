'use client';
import { X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-gradient-to-r from-brand to-brand-2 text-[#06070a] font-semibold hover:brightness-110',
    ghost: 'border border-border bg-surface-2 text-fg hover:border-brand',
    danger: 'bg-danger text-white font-semibold hover:brightness-110',
  }[variant];
  return (
    <button
      {...props}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition disabled:opacity-50 disabled:pointer-events-none cursor-pointer', styles, className)}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-xl border border-border bg-surface p-5', className)}>{children}</div>;
}

export function Badge({ tone = 'muted', children }: { tone?: 'muted' | 'ok' | 'warn' | 'danger' | 'brand'; children: ReactNode }) {
  const t = {
    muted: 'bg-surface-2 text-muted',
    ok: 'bg-ok/15 text-ok',
    warn: 'bg-warn/15 text-warn',
    danger: 'bg-danger/15 text-danger',
    brand: 'bg-brand/20 text-brand-2',
  }[tone];
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', t)}>{children}</span>;
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-14 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <h3 className="font-medium">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      <span>{message}</span>
      {onRetry && <button onClick={onRetry} className="underline cursor-pointer">Tentar novamente</button>}
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-brand outline-none';

export function Field({ label, error, children, htmlFor }: { label: string; error?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(inputCls, 'min-h-20', p.className)} />;

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-full max-w-xl rounded-2xl border border-border bg-surface p-0 text-fg backdrop:bg-black/70"
    >
      {open && (
        <div className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} aria-label="Fechar" className="text-muted hover:text-fg cursor-pointer"><X size={18} /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

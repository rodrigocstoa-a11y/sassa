export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="rrn-g" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#7c5cff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#rrn-g)" />
      <path d="M11 22V10h5.2a3.8 3.8 0 0 1 .9 7.5L21 22h-3.2l-3.4-4.2H13.6V22H11Zm2.6-6.5h2.4a1.5 1.5 0 0 0 0-3h-2.4v3Z" fill="#07080c" />
      <path d="M20.5 10.5l3 2.5-3 2.5v-5Z" fill="#07080c" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <LogoMark />
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight">RRN Studio</div>
        <div className="bg-gradient-to-r from-brand to-brand-2 bg-clip-text text-[11px] font-semibold uppercase tracking-[0.2em] text-transparent">AI</div>
      </div>
    </div>
  );
}

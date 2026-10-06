export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export const formatNumber = (n: number) => n.toLocaleString('pt-BR');

/** Duração estimada de narração, ex.: "≈ 12 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  const total = Math.round(minutes);
  return total < 60 ? `≈ ${total} min` : `≈ ${Math.floor(total / 60)} h ${total % 60} min`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${units[i]}`;
}

/** Duração real (mm:ss ou h:mm:ss). */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

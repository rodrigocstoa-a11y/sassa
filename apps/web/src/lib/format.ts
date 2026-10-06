export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export const formatNumber = (n: number) => n.toLocaleString('pt-BR');

/** Duração estimada de narração, ex.: "≈ 12 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  const total = Math.round(minutes);
  return total < 60 ? `≈ ${total} min` : `≈ ${Math.floor(total / 60)} h ${total % 60} min`;
}

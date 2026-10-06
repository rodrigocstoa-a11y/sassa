import type { Channel, ChannelInput, ProviderSlot } from '@rrn/shared';

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly issues: { path: string; message: string }[] = []) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Não foi possível conectar à API. Ela está em execução?', 0);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.message ?? `Erro ${res.status}`, res.status, data.issues ?? []);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export interface DashboardSummary {
  channels: number;
  videos: number | null;
  tasksInProgress: number | null;
  errors: number | null;
}

export const api = {
  listChannels: () => request<Channel[]>('/channels'),
  createChannel: (input: ChannelInput) => request<Channel>('/channels', { method: 'POST', body: JSON.stringify(input) }),
  updateChannel: (id: string, input: ChannelInput) =>
    request<Channel>(`/channels/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteChannel: (id: string) => request<void>(`/channels/${id}`, { method: 'DELETE' }),
  summary: () => request<DashboardSummary>('/dashboard/summary'),
  health: () => request<{ status: string; database: string; version: string }>('/health'),
  providers: () => request<ProviderSlot[]>('/providers'),
};

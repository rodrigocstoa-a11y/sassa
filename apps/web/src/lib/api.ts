import type {
  AudioGenerationRequest,
  AudioGenerationStatus,
  AudioList,
  AudioListQuery,
  AudioSummary,
  AudioUpdateInput,
  AudioVoicesResponse,
  Channel,
  ChannelInput,
  ProviderSlot,
  ScriptDetail,
  ScriptGenerationStatus,
  ScriptInput,
  ScriptList,
  ScriptListQuery,
  ScriptTranslationInput,
} from '@rrn/shared';

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
  scripts: number;
  audios: number;
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
  listScripts: (query: Partial<ScriptListQuery> = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v));
    return request<ScriptList>(`/scripts?${params}`);
  },
  getScript: (id: string) => request<ScriptDetail>(`/scripts/${encodeURIComponent(id)}`),
  createScript: (input: ScriptInput) => request<ScriptDetail>('/scripts', { method: 'POST', body: JSON.stringify(input) }),
  updateScript: (id: string, input: ScriptInput) =>
    request<ScriptDetail>(`/scripts/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteScript: (id: string) => request<void>(`/scripts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createTranslation: (id: string, input: ScriptTranslationInput) =>
    request<ScriptDetail>(`/scripts/${encodeURIComponent(id)}/translations`, { method: 'POST', body: JSON.stringify(input) }),
  generationStatus: () => request<ScriptGenerationStatus>('/scripts/generation/status'),
  listAudios: (query: Partial<AudioListQuery> = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v));
    return request<AudioList>(`/audios?${params}`);
  },
  getAudio: (id: string) => request<AudioSummary>(`/audios/${encodeURIComponent(id)}`),
  updateAudio: (id: string, input: AudioUpdateInput) =>
    request<AudioSummary>(`/audios/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteAudio: (id: string) => request<void>(`/audios/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  retryAudio: (id: string) => request<AudioSummary>(`/audios/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
  generateAudio: (input: AudioGenerationRequest) =>
    request<AudioSummary>('/audios/generate', { method: 'POST', body: JSON.stringify(input) }),
  audioGenerationStatus: () => request<AudioGenerationStatus>('/audios/generation/status'),
  audioVoices: (language?: string) => request<AudioVoicesResponse>(`/audios/voices${language ? `?language=${encodeURIComponent(language)}` : ''}`),
  summary: () => request<DashboardSummary>('/dashboard/summary'),
  health: () => request<{ status: string; database: string; version: string }>('/health'),
  providers: () => request<ProviderSlot[]>('/providers'),
};

export const audioFileUrl = (id: string, download = false) =>
  `/api/audios/${encodeURIComponent(id)}/file${download ? '?download=1' : ''}`;

/**
 * O proxy do Next (rewrites) trunca corpos acima de 10 MB, então o envio de arquivos grandes
 * vai direto à API. URL pública e não secreta; a API só aceita a origem do painel (CORS).
 */
const DIRECT_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001';

/** Envia o arquivo como corpo bruto (sem multipart), com progresso. XHR porque fetch não reporta progresso de envio. */
export function uploadAudio(
  file: File,
  meta: { scriptId: string; title: string; durationMs?: number },
  onProgress: (fraction: number) => void,
): Promise<AudioSummary> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ scriptId: meta.scriptId, title: meta.title, filename: file.name });
    if (meta.durationMs !== undefined) params.set('durationMs', String(Math.round(meta.durationMs)));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${DIRECT_API_URL}/api/audios/upload?${params}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onerror = () => reject(new ApiError('Não foi possível conectar à API. Ela está em execução?', 0));
    xhr.onabort = () => reject(new ApiError('Envio cancelado', 0));
    xhr.onload = () => {
      let data: { message?: string; issues?: { path: string; message: string }[] } & Partial<AudioSummary> = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* resposta não-JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as AudioSummary);
      else reject(new ApiError(data.message ?? `Erro ${xhr.status}`, xhr.status, data.issues ?? []));
    };
    xhr.send(file);
  });
}

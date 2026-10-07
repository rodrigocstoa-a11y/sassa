import type {
  AudioCostEstimate,
  AudioGenerationRequest,
  AudioUploadTarget,
  BudgetStatus,
  CostEvent,
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
  if (res.status === 401 && !path.startsWith('/auth/') && typeof window !== 'undefined') {
    // Sessão ausente ou expirada: volta para o login e depois para a página atual.
    if (window.location.pathname !== '/login') window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    throw new ApiError('Sessão expirada. Faça login novamente.', 401);
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
  retryAudio: (id: string) => request<AudioSummary>(`/audios/${encodeURIComponent(id)}/retry`, { method: 'POST', body: '{}' }),
  audioEstimate: (scriptId: string, voiceId: string) =>
    request<AudioCostEstimate>('/audios/generation/estimate', { method: 'POST', body: JSON.stringify({ scriptId, voiceId }) }),
  generateAudio: (input: AudioGenerationRequest) =>
    request<AudioSummary>('/audios/generate', { method: 'POST', body: JSON.stringify(input) }),
  audioGenerationStatus: () => request<AudioGenerationStatus>('/audios/generation/status'),
  audioVoices: (language?: string) => request<AudioVoicesResponse>(`/audios/voices${language ? `?language=${encodeURIComponent(language)}` : ''}`),
  summary: () => request<DashboardSummary>('/dashboard/summary'),
  health: () =>
    request<{ status: string; database: string; version: string; engine: string; storage: string; authRequired: boolean; role: string }>('/health'),
  me: () => request<{ authRequired: boolean; user: { email: string; role: string } | null }>('/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: { email: string; role: string } }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST', body: '{}' }),
  budget: () => request<BudgetStatus>('/budget'),
  setBudget: (monthlyLimitUsd: number | null) => request<BudgetStatus>('/budget', { method: 'PUT', body: JSON.stringify({ monthlyLimitUsd }) }),
  budgetEvents: () => request<CostEvent[]>('/budget/events'),
  providers: () => request<ProviderSlot[]>('/providers'),
};

export const audioFileUrl = (id: string, download = false) =>
  `/api/audios/${encodeURIComponent(id)}/file${download ? '?download=1' : ''}`;

/** Envia o arquivo por XHR direto para a URL assinada (S3/R2 na nuvem), com progresso. */
function putFile(target: AudioUploadTarget, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.uploadUrl);
    for (const [k, v] of Object.entries(target.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onerror = () => reject(new ApiError('Falha de rede no envio do arquivo.', 0));
    xhr.onabort = () => reject(new ApiError('Envio cancelado', 0));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `O armazenamento recusou o arquivo (HTTP ${xhr.status}).`;
      try { message = JSON.parse(xhr.responseText).message ?? message; } catch { /* resposta não-JSON (XML do S3) */ }
      reject(new ApiError(message, xhr.status));
    };
    xhr.send(file);
  });
}

/**
 * Envio em 2 etapas: (1) a API valida e devolve uma URL assinada, (2) o arquivo vai DIRETO ao armazenamento
 * (sem passar pela API nem pelo proxy do Next), (3) a API confere o arquivo e cadastra o áudio.
 */
export async function uploadAudio(
  file: File,
  meta: { scriptId: string; title: string; durationMs?: number },
  onProgress: (fraction: number) => void,
): Promise<AudioSummary> {
  const target = await request<AudioUploadTarget>('/audios/uploads', {
    method: 'POST',
    body: JSON.stringify({
      scriptId: meta.scriptId,
      title: meta.title,
      filename: file.name,
      durationMs: meta.durationMs !== undefined ? Math.round(meta.durationMs) : undefined,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
    }),
  });
  await putFile(target, file, onProgress);
  return request<AudioSummary>('/audios/uploads/complete', { method: 'POST', body: JSON.stringify({ uploadToken: target.uploadToken }) });
}

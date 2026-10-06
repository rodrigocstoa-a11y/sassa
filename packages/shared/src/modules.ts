export type ModuleStatus = 'available' | 'planned';

export interface PlatformModule {
  key: string;
  label: string;
  path: string;
  status: ModuleStatus;
  /** Fase do plano de desenvolvimento em que o módulo é entregue. */
  phase: number;
  description: string;
}

export const PLATFORM_MODULES: readonly PlatformModule[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/', status: 'available', phase: 1, description: 'Visão geral da produção.' },
  { key: 'channels', label: 'Canais', path: '/canais', status: 'available', phase: 1, description: 'Cadastro e identidade visual dos canais do YouTube.' },
  { key: 'scripts', label: 'Roteiros', path: '/roteiros', status: 'planned', phase: 2, description: 'Geração, edição, aprovação e tradução de roteiros longos.' },
  { key: 'audio', label: 'Áudios', path: '/audios', status: 'planned', phase: 3, description: 'Narração com escolha de voz, pré-escuta e aprovação.' },
  { key: 'images', label: 'Imagens', path: '/imagens', status: 'planned', phase: 4, description: 'Cenas, thumbnails e galeria de aprovação.' },
  { key: 'editor', label: 'Editor de Vídeos', path: '/editor', status: 'planned', phase: 7, description: 'Montagem automática, legendas, trilha e renderização FFmpeg.' },
  { key: 'queue', label: 'Fila de Produção', path: '/fila', status: 'planned', phase: 5, description: 'Etapas, progresso, erros e novas tentativas de cada vídeo.' },
  { key: 'settings', label: 'Configurações', path: '/configuracoes', status: 'available', phase: 1, description: 'Estado do sistema e provedores de IA.' },
] as const;

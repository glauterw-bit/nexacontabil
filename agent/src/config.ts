// Configuração padrão do agente. Pode ser sobrescrita via electron-store.
export const DEFAULT_API_URL = 'https://backend-production-9eeec.up.railway.app';

export const ACCEPTED_EXTENSIONS = ['.pdf', '.xml', '.png', '.jpg', '.jpeg', '.webp'];

export const SYNC_CONCURRENCY = 3;       // chamadas Anthropic simultâneas
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
export const POLL_INTERVAL_MS = 30_000;  // sync de status a cada 30s

export type AppSettings = {
  apiUrl: string;
  jwt?: string;
  userId?: string;
  userEmail?: string;
  companyId?: string;
  watchFolders: string[];
  autoStart: boolean;
  lastSyncAt?: string;
};

export const INITIAL_SETTINGS: AppSettings = {
  apiUrl: DEFAULT_API_URL,
  watchFolders: [],
  autoStart: true,
};

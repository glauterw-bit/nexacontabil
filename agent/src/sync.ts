import { ApiClient } from './api-client';
import { pendingFiles, markUploaded, markError } from './database';
import { SYNC_CONCURRENCY } from './config';

let running = false;
let stopRequested = false;

export interface SyncProgress {
  total: number;
  done: number;
  errors: number;
  inFlight: number;
  currentFile?: string;
}

export async function syncOnce(
  api: ApiClient,
  companyId: string,
  onProgress: (p: SyncProgress) => void,
) {
  if (running) return;
  running = true;
  stopRequested = false;
  try {
    const queue = pendingFiles(500);
    if (queue.length === 0) return;
    const state: SyncProgress = { total: queue.length, done: 0, errors: 0, inFlight: 0 };

    let cursor = 0;
    const worker = async () => {
      while (!stopRequested && cursor < queue.length) {
        const idx = cursor++;
        const f = queue[idx];
        state.inFlight++;
        state.currentFile = f.filename;
        onProgress({ ...state });
        try {
          const result = await api.analyzeFile(companyId, f.abs_path, f.filename);
          const doc = result?.document ?? {};
          markUploaded(f.abs_path, {
            remote_doc_id: doc.id,
            type: doc.type,
            issuer_name: doc.issuerName,
            issuer_cnpj: doc.issuerCnpj,
            total_value: doc.totalValue,
            issue_date: doc.issueDate,
            due_date: doc.dueDate,
            extracted_text: typeof doc.extractedData === 'string'
              ? doc.extractedData
              : JSON.stringify(doc.extractedData ?? {}),
          });
          state.done++;
        } catch (err: any) {
          markError(f.abs_path, err?.message ?? 'erro');
          state.errors++;
        } finally {
          state.inFlight--;
          onProgress({ ...state });
        }
      }
    };
    await Promise.all(Array.from({ length: SYNC_CONCURRENCY }, worker));
  } finally {
    running = false;
  }
}

export function requestStop() {
  stopRequested = true;
}

export function isRunning() {
  return running;
}

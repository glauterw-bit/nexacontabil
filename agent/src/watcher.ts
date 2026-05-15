import chokidar, { FSWatcher } from 'chokidar';
import * as path from 'path';
import * as fs from 'fs';
import { ACCEPTED_EXTENSIONS, MAX_FILE_SIZE_BYTES } from './config';
import { upsertFile } from './database';

export interface WatcherEvents {
  onFileSeen: () => void;
  onError: (err: Error) => void;
}

let watcher: FSWatcher | null = null;
let listeners: WatcherEvents | null = null;

function isAccepted(p: string) {
  const ext = path.extname(p).toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
}

async function indexPath(absPath: string) {
  try {
    const st = await fs.promises.stat(absPath);
    if (!st.isFile()) return;
    if (st.size > MAX_FILE_SIZE_BYTES) return;
    upsertFile({
      abs_path: absPath,
      filename: path.basename(absPath),
      mtime: Math.floor(st.mtimeMs / 1000),
      size: st.size,
      mime: undefined,
      status: 'pending',
    });
    listeners?.onFileSeen();
  } catch (err: any) {
    listeners?.onError(err);
  }
}

export function startWatchers(folders: string[], ev: WatcherEvents) {
  listeners = ev;
  stopWatchers();
  if (folders.length === 0) return;

  watcher = chokidar.watch(folders, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 500 },
    ignored: (p) => {
      // ignora arquivos ocultos e temporários
      const base = path.basename(p);
      if (base.startsWith('.') || base.startsWith('~$')) return true;
      // se for arquivo, só aceita extensões válidas
      try {
        const st = fs.statSync(p);
        if (st.isFile()) return !isAccepted(p);
      } catch {}
      return false;
    },
    depth: 99,
    usePolling: false,
  });

  watcher
    .on('add', (p) => indexPath(p))
    .on('change', (p) => indexPath(p))
    .on('error', (err) => listeners?.onError(err as Error));
}

export function stopWatchers() {
  if (watcher) {
    watcher.close().catch(() => undefined);
    watcher = null;
  }
}

export function watchedFolders(): string[] {
  if (!watcher) return [];
  const w = watcher.getWatched();
  return Object.keys(w);
}

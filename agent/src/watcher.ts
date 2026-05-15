import chokidar, { FSWatcher } from 'chokidar';
import * as path from 'path';
import * as fs from 'fs';
import { ACCEPTED_EXTENSIONS, MAX_FILE_SIZE_BYTES } from './config';
import { upsertFile } from './database';

/**
 * Pastas excluídas automaticamente — Windows system folders, app data,
 * caches e diretórios de desenvolvimento. Tudo case-insensitive.
 *
 * Mesmo que o usuário aponte para C:\, esses caminhos são ignorados.
 */
const EXCLUDED_FOLDER_NAMES = new Set([
  // Windows
  'windows', 'program files', 'program files (x86)', 'programdata',
  '$recycle.bin', '$windows.~bt', '$windows.~ws', 'system volume information',
  'recovery', 'msocache', 'perflogs', 'inetpub',
  // User cache / app data
  'appdata', 'application data', 'local settings', 'temporary internet files',
  '.cache', '.local', 'temp', 'tmp',
  // Dev
  'node_modules', '.git', '.svn', '.hg', '.vscode', '.idea',
  '__pycache__', '.venv', 'venv', 'env',
  // macOS / Linux system
  '.trash', '.trashes', '.fseventsd', '.spotlight-v100', 'lost+found',
  'system', 'library',
  // Browser / app caches
  'cache', 'caches', 'cachestorage', 'gpucache',
]);

function isExcludedPath(absPath: string): boolean {
  const segments = absPath.split(path.sep).map((s) => s.toLowerCase());
  for (const seg of segments) {
    if (EXCLUDED_FOLDER_NAMES.has(seg)) return true;
    // arquivos/pastas ocultos por convenção (.something) — exceto raízes de drives
    if (seg.startsWith('.') && seg.length > 1 && !seg.match(/^\.[a-z]:$/)) return true;
  }
  return false;
}

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
      const base = path.basename(p);
      // arquivos temporários de Office (~$file.xlsx)
      if (base.startsWith('~$')) return true;
      // pastas/arquivos do sistema operacional e dev
      if (isExcludedPath(p)) return true;
      // se for arquivo, só aceita extensões válidas
      try {
        const st = fs.statSync(p);
        if (st.isFile()) return !isAccepted(p);
      } catch {}
      return false;
    },
    depth: 12, // varredura recursiva mas com limite — cobre Z:\NF-e\<empresa>\<ano>\<mes>\
    usePolling: false,
    followSymlinks: false,
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

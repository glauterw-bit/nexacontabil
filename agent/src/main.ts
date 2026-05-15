import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, shell, globalShortcut, Notification } from 'electron';
import * as path from 'path';
import Store from 'electron-store';
import { autoUpdater } from 'electron-updater';
import { AppSettings, INITIAL_SETTINGS, POLL_INTERVAL_MS } from './config';
import { initDatabase, counts, searchLocal, pendingFiles } from './database';
import { startWatchers, stopWatchers } from './watcher';
import { ApiClient } from './api-client';
import { syncOnce, isRunning, requestStop } from './sync';

const store: any = new Store<AppSettings>({ defaults: INITIAL_SETTINGS });
const api = new ApiClient(store.get('apiUrl') ?? INITIAL_SETTINGS.apiUrl, store.get('jwt'));

let tray: Tray | null = null;
let configWindow: BrowserWindow | null = null;
let searchWindow: BrowserWindow | null = null;

function getSettings(): AppSettings {
  return {
    apiUrl: store.get('apiUrl') ?? INITIAL_SETTINGS.apiUrl,
    jwt: store.get('jwt'),
    userId: store.get('userId'),
    userEmail: store.get('userEmail'),
    companyId: store.get('companyId'),
    watchFolders: store.get('watchFolders') ?? [],
    autoStart: store.get('autoStart') ?? true,
    lastSyncAt: store.get('lastSyncAt'),
  };
}

function saveSettings(patch: Partial<AppSettings>) {
  for (const [k, v] of Object.entries(patch)) {
    (store as any).set(k, v);
  }
  api.setJwt(getSettings().jwt);
}

function trayImage() {
  // ícone placeholder em base64 (16x16). Substituir por icone real em src/assets/.
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOklEQVR4AWNgGAUjASZGRkb+f///A//+/QMyMjICmRgYGRn////g4+P/n5+f//8/AwAVuQR/QzVcVQAAAABJRU5ErkJggg=='
  );
}

function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip('NexaContabil Agent');
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) return;
  const c = counts();
  const s = getSettings();
  const loggedIn = !!s.jwt && !!s.userEmail;
  const menu = Menu.buildFromTemplate([
    {
      label: loggedIn ? `Logado: ${s.userEmail}` : 'Não autenticado — clique em Configurações',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: `Total indexado: ${c.total}`,
      enabled: false,
    },
    {
      label: `Pendentes: ${c.pending}    Processados: ${c.processed}    Erros: ${c.errored}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Buscar arquivos…  (Ctrl+Shift+F)',
      click: () => openSearchWindow(),
    },
    {
      label: 'Sincronizar agora',
      enabled: loggedIn && !!s.companyId && !isRunning(),
      click: () => triggerSync(),
    },
    {
      label: isRunning() ? 'Parar sincronização' : 'Sincronização pausada',
      enabled: isRunning(),
      click: () => requestStop(),
    },
    { type: 'separator' },
    { label: 'Configurações…', click: () => openConfigWindow() },
    {
      label: 'Abrir painel web',
      click: () => shell.openExternal(s.apiUrl.replace('backend-production', 'frontend-production')),
    },
    { type: 'separator' },
    { label: `Versão ${app.getVersion()}`, enabled: false },
    {
      label: 'Verificar atualizações',
      click: () => autoUpdater.checkForUpdatesAndNotify().catch(() => undefined),
    },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function openConfigWindow() {
  if (configWindow) {
    configWindow.focus();
    return;
  }
  configWindow = new BrowserWindow({
    width: 720,
    height: 640,
    title: 'NexaContabil Agent — Configurações',
    autoHideMenuBar: true,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  configWindow.loadFile(path.join(__dirname, 'renderer', 'config.html'));
  configWindow.on('closed', () => { configWindow = null; });
}

function openSearchWindow() {
  if (searchWindow) {
    searchWindow.focus();
    return;
  }
  searchWindow = new BrowserWindow({
    width: 700,
    height: 560,
    title: 'NexaContabil — Buscar arquivos',
    autoHideMenuBar: true,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  searchWindow.loadFile(path.join(__dirname, 'renderer', 'search.html'));
  searchWindow.on('closed', () => { searchWindow = null; });
}

async function triggerSync() {
  const s = getSettings();
  if (!s.jwt || !s.companyId) return;
  api.setJwt(s.jwt);
  new Notification({ title: 'Sincronizando…', body: 'NexaContabil está enviando documentos pendentes para análise.' }).show();
  await syncOnce(api, s.companyId, () => refreshTrayMenu());
  saveSettings({ lastSyncAt: new Date().toISOString() });
  refreshTrayMenu();
}

// ─── IPC: a renderer chama essas funções ─────────────────────────────────────

ipcMain.handle('settings:get', () => getSettings());
ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>) => {
  saveSettings(patch);
  // re-start watchers se mudou folders
  if (patch.watchFolders) startWatchers(patch.watchFolders, {
    onFileSeen: refreshTrayMenu,
    onError: (err) => console.error('Watcher error:', err.message),
  });
  return getSettings();
});

ipcMain.handle('auth:login', async (_e, { email, password }: { email: string; password: string }) => {
  const result = await api.login(email, password);
  saveSettings({ jwt: result.access_token, userId: result.user.id, userEmail: result.user.email });
  return result.user;
});

ipcMain.handle('auth:logout', () => {
  saveSettings({ jwt: undefined, userId: undefined, userEmail: undefined, companyId: undefined });
  return true;
});

ipcMain.handle('companies:list', async () => {
  return api.listCompanies();
});

ipcMain.handle('companies:select', (_e, companyId: string) => {
  saveSettings({ companyId });
  return companyId;
});

function isRootLikePath(p: string): boolean {
  // Windows: C:\ ou C:\Users (mas C:\Users\<name> ok)
  if (/^[A-Z]:[\\\/]?$/i.test(p)) return true;
  if (/^[A-Z]:[\\\/]Users[\\\/]?$/i.test(p)) return true;
  if (/^[A-Z]:[\\\/]ProgramData[\\\/]?$/i.test(p)) return true;
  // Unix
  if (p === '/' || p === '/home' || p === '/Users') return true;
  return false;
}

ipcMain.handle('folders:add', async () => {
  const r = await dialog.showOpenDialog({
    properties: ['openDirectory', 'multiSelections'],
    title: 'Selecione pastas para monitorar',
    buttonLabel: 'Monitorar esta pasta',
  });
  if (r.canceled) return getSettings().watchFolders;

  // Aviso se selecionou pasta raiz — performance pode degradar
  const roots = r.filePaths.filter(isRootLikePath);
  if (roots.length > 0) {
    const choice = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Cancelar', 'Monitorar mesmo assim'],
      defaultId: 0,
      cancelId: 0,
      title: 'Pasta raiz selecionada',
      message: 'Você escolheu uma pasta raiz do sistema.',
      detail:
        'Selecionar pastas raízes (ex: C:\\) pode demorar 30-90 min na primeira indexação e ' +
        'consumir muita memória. O agente já ignora Windows, Program Files, AppData, $Recycle.Bin, ' +
        'node_modules e diretórios de cache automaticamente.\n\n' +
        'Recomendação: aponte para pastas específicas — Z:\\NF-e\\, C:\\Users\\<seu>\\Documentos\\Contábil\\, etc.\n\n' +
        'Deseja continuar mesmo assim?',
    });
    if (choice.response === 0) return getSettings().watchFolders;
  }

  const set = new Set([...getSettings().watchFolders, ...r.filePaths]);
  const list = Array.from(set);
  saveSettings({ watchFolders: list });
  startWatchers(list, {
    onFileSeen: refreshTrayMenu,
    onError: (err) => console.error('Watcher:', err.message),
  });
  return list;
});

ipcMain.handle('folders:addCommon', async (_e, kind: 'documents' | 'downloads' | 'desktop') => {
  let target: string;
  switch (kind) {
    case 'documents': target = app.getPath('documents'); break;
    case 'downloads': target = app.getPath('downloads'); break;
    case 'desktop':   target = app.getPath('desktop'); break;
  }
  const set = new Set([...getSettings().watchFolders, target]);
  const list = Array.from(set);
  saveSettings({ watchFolders: list });
  startWatchers(list, {
    onFileSeen: refreshTrayMenu,
    onError: (err) => console.error('Watcher:', err.message),
  });
  return list;
});

ipcMain.handle('folders:remove', (_e, folder: string) => {
  const list = getSettings().watchFolders.filter((f) => f !== folder);
  saveSettings({ watchFolders: list });
  startWatchers(list, {
    onFileSeen: refreshTrayMenu,
    onError: (err) => console.error('Watcher:', err.message),
  });
  return list;
});

ipcMain.handle('stats', () => counts());

ipcMain.handle('search:local', (_e, q: string) => searchLocal(q, 100));

ipcMain.handle('search:remote', async (_e, q: string) => {
  const s = getSettings();
  if (!s.companyId) return { results: [], filters: null };
  return api.searchNatural(s.companyId, q);
});

ipcMain.handle('sync:now', () => triggerSync());

ipcMain.handle('file:open', (_e, p: string) => shell.openPath(p));
ipcMain.handle('file:showInFolder', (_e, p: string) => shell.showItemInFolder(p));

// ─── App lifecycle ──────────────────────────────────────────────────────────

app.on('window-all-closed', () => {
  // não sai quando todas as janelas fecham — fica no tray
});

app.whenReady().then(() => {
  initDatabase();
  createTray();

  const s = getSettings();
  if (s.watchFolders.length > 0) {
    startWatchers(s.watchFolders, {
      onFileSeen: refreshTrayMenu,
      onError: (err) => console.error('Watcher error:', err.message),
    });
  }
  // Sempre abre a janela de configurações na inicialização — usuário pode fechá-la
  // que o agent continua no tray.
  openConfigWindow();

  // auto-start no boot do sistema
  app.setLoginItemSettings({ openAtLogin: getSettings().autoStart });

  // poll periodico de sync
  setInterval(() => {
    if (!isRunning()) {
      triggerSync().catch(() => undefined);
    }
    refreshTrayMenu();
  }, POLL_INTERVAL_MS);

  // atalho global pra abrir busca
  globalShortcut.register('CommandOrControl+Shift+F', () => openSearchWindow());

  // auto-update
  autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopWatchers();
});

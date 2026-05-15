import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('agent', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch: any) => ipcRenderer.invoke('settings:set', patch),
  },
  auth: {
    login: (email: string, password: string) => ipcRenderer.invoke('auth:login', { email, password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  companies: {
    list: () => ipcRenderer.invoke('companies:list'),
    select: (id: string) => ipcRenderer.invoke('companies:select', id),
  },
  folders: {
    add: () => ipcRenderer.invoke('folders:add'),
    remove: (folder: string) => ipcRenderer.invoke('folders:remove', folder),
  },
  stats: () => ipcRenderer.invoke('stats'),
  search: {
    local: (q: string) => ipcRenderer.invoke('search:local', q),
    remote: (q: string) => ipcRenderer.invoke('search:remote', q),
  },
  sync: {
    now: () => ipcRenderer.invoke('sync:now'),
  },
  file: {
    open: (p: string) => ipcRenderer.invoke('file:open', p),
    showInFolder: (p: string) => ipcRenderer.invoke('file:showInFolder', p),
  },
});

declare global {
  interface Window {
    agent: {
      settings: { get: () => Promise<any>; set: (p: any) => Promise<any> };
      auth: { login: (e: string, p: string) => Promise<any>; logout: () => Promise<boolean> };
      companies: { list: () => Promise<any[]>; select: (id: string) => Promise<string> };
      folders: { add: () => Promise<string[]>; remove: (f: string) => Promise<string[]> };
      stats: () => Promise<any>;
      search: { local: (q: string) => Promise<any[]>; remote: (q: string) => Promise<any> };
      sync: { now: () => Promise<void> };
      file: { open: (p: string) => Promise<string>; showInFolder: (p: string) => Promise<void> };
    };
  }
}

import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('poDesktop', { platform: process.platform, desktop: true, close: () => ipcRenderer.send('close-window') });

import {app,BrowserWindow} from 'electron';
const phase=name=>console.error(`PHASE: ${name}`);
phase('probe-start');phase('electron-imported');phase('before-app-ready');
await app.whenReady();phase('after-app-ready');phase('before-window-create');
const window=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false}});phase('after-window-create');phase('before-load-url');
await window.loadURL('data:text/html,<main>electron-ready</main>');phase('after-load-url');phase('before-window-close');
await window.close();phase('after-window-close');app.quit();phase('completed');

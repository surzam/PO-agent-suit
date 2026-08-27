import { app, BrowserWindow, Menu, shell, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
let serverProcess;

// Electron installed inside the project cannot use its root-owned SUID helper.
// The app is already isolated from the user's regular browser/runtime and owns
// a dedicated localhost server, so use the portable Linux fallback.
if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox');
Menu.setApplicationMenu(null);
ipcMain.on('close-window', event => BrowserWindow.fromWebContents(event.sender)?.close());

function startServer() {
  return new Promise((resolve, reject) => {
    serverProcess = spawn(process.execPath, [path.join(root, 'server.mjs')], {
      cwd: root,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const onData = chunk => {
      output += chunk.toString();
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) resolve(Number(match[1]));
    };
    serverProcess.stdout.on('data', onData);
    serverProcess.stderr.on('data', chunk => { output += chunk.toString(); });
    serverProcess.once('error', reject);
    serverProcess.once('exit', code => { if (code && !output.match(/localhost:\d+/)) reject(new Error(`Server exited: ${code}`)); });
  });
}

async function createWindow() {
  const port = await startServer();
  const win = new BrowserWindow({
    width: 1440, height: 960, minWidth: 980, minHeight: 700,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#071321',
    title: 'PO Agent Suite · Workstation Computer',
    icon: path.join(root, 'assets', 'icons', '256x256.png'),
    webPreferences: { preload: path.join(here, 'preload.mjs'), contextIsolation: true, nodeIntegration: false }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith(`http://localhost:${port}/api/artifact/`)) { shell.openExternal(url); return { action: 'deny' }; } shell.openExternal(url); return { action: 'deny' }; });
  await win.loadURL(`http://localhost:${port}/`);
}

app.whenReady().then(createWindow).catch(error => { console.error(error); app.quit(); });
app.on('window-all-closed', () => { if (serverProcess) serverProcess.kill(); if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (serverProcess) serverProcess.kill(); });

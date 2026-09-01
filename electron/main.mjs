import { app, BrowserWindow, Menu, shell, ipcMain, nativeImage } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
let serverProcess;
const gotInstanceLock=app.requestSingleInstanceLock();
if(!gotInstanceLock)app.quit();

// Electron installed inside the project cannot use its root-owned SUID helper.
// The app is already isolated from the user's regular browser/runtime and owns
// a dedicated localhost server, so use the portable Linux fallback.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('class', 'po-agent-suite');
  app.setName('po-agent-suite');
}
app.setAppUserModelId('local.poagent.suite');
Menu.setApplicationMenu(null);
ipcMain.on('close-window', event => BrowserWindow.fromWebContents(event.sender)?.close());

function startServer() {
  return new Promise((resolve, reject) => {
    const runtimeRoot = path.join(app.getPath('userData'), 'workspace');
    serverProcess = spawn(process.execPath, [path.join(root, 'cli', 'suite.mjs'), 'serve', '--host', '127.0.0.1', '--port', '0'], {
      cwd: app.isPackaged ? process.resourcesPath : root,
      env: { ...process.env, ELECTRON_RUN_AS_NODE:'1', PORT:'0', PO_RUNTIME_ROOT:runtimeRoot, PO_WORKSPACE_DIR:runtimeRoot, PO_EXPORT_DIR:path.join(runtimeRoot,'exports') },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const logFile=path.join(app.getPath('userData'),'service.log');
    const safeLog=chunk=>{try{if(fs.existsSync(logFile)&&fs.statSync(logFile).size>5*1024*1024){try{fs.rmSync(`${logFile}.1`,{force:true})}catch{};fs.renameSync(logFile,`${logFile}.1`)}fs.appendFileSync(logFile,String(chunk).replace(/([?&](?:token|key|secret|password)=)[^&\s]+/gi,'$1[redacted]').slice(0,8192))}catch{}};
    const onData = chunk => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) resolve(Number(match[1]));
    };
    serverProcess.stdout.on('data', onData);
    serverProcess.stdout.on('data',safeLog);
    serverProcess.stderr.on('data', chunk => { output += chunk.toString();safeLog(chunk) });
    serverProcess.once('error', reject);
    serverProcess.once('exit', code => { if (code && !output.match(/127\.0\.0\.1:\d+/)) reject(new Error(`Server exited: ${code}`)); });
  });
}

async function createWindow() {
  const port = await startServer();
  const iconPath = path.join(root, 'assets', 'icons', 'rnd-icon.png');
  const appIcon = nativeImage.createFromPath(iconPath);
  const win = new BrowserWindow({
    width: 1440, height: 960, minWidth: 980, minHeight: 700,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#071321',
    title: 'PO Agent Suite',
    icon: appIcon,
    webPreferences: { preload: path.join(here, 'preload.mjs'), contextIsolation: true, nodeIntegration: false }
  });
  win.setIcon(appIcon);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  await win.loadURL(`http://127.0.0.1:${port}/`);
}

if(gotInstanceLock){app.on('second-instance',()=>{});app.whenReady().then(createWindow).catch(error => { console.error(error); app.quit(); });}
app.on('window-all-closed', () => { if (serverProcess) serverProcess.kill(); if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (serverProcess) serverProcess.kill(); });

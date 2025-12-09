console.log('=== Electron Application Starting ===');
console.log('Current working directory:', process.cwd());
console.log('Current file path:', __filename);

const { app, BrowserWindow, Menu, screen, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// --- Main Process Logger ---
if (app.isPackaged) {
  const userDataDir = app.getPath('userData');
  const logsDir = path.join(userDataDir, 'logs');
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (e) {
    /* ignore */
  }
  const logFile = path.join(logsDir, 'electron-main.log');
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  const util = require('util');

  const mainLogger = (stream, ...args) => {
    const timestamp = new Date().toISOString();
    const message = args.map((arg) => (typeof arg === 'object' ? util.inspect(arg) : arg)).join(' ');
    stream.write(`[${timestamp}] ${message}\n`);
  };

  console.log = (...args) => mainLogger(logStream, ...args);
  console.error = (...args) => mainLogger(logStream, 'ERROR:', ...args);
  console.warn = (...args) => mainLogger(logStream, 'WARN:', ...args);
  console.info = (...args) => mainLogger(logStream, 'INFO:', ...args);

  process.on('uncaughtException', (error) => {
    console.error('UNCAUGHT EXCEPTION:', error.stack || error.message || error);
    app.quit();
  });
}
// --- End Main Process Logger ---

const isProd = app.isPackaged;
const isDev = !isProd;

console.log('isDev:', isDev);
console.log('Platform:', process.platform);

let mainWindow;
let serverProcess;

/**
 * Start NestJS backend subprocess in production
 */
function startBackendProcess() {
  if (!isProd) {
    console.log('Dev mode, skipping backend process start.');
    return Promise.resolve(null);
  }

  const userDataDir = app.getPath('userData');
  const resourcesPath = process.resourcesPath;

  const childEnv = { ...process.env, NODE_ENV: 'production' };

  // 1. Set paths relative to userData
  childEnv.ELECTRON_USER_DATA_DIR = userDataDir;
  childEnv.STORAGE_DIR = path.join(userDataDir, 'storage');
  childEnv.DATABASE_URL = `file:./local-resume.db`; 
  childEnv.SESSION_SECRET = childEnv.SESSION_SECRET || 'reactive-resume-offline-secret';
  
  // Module resolution paths
  const userNodeModules = path.join(userDataDir, 'node_modules');
  const asarNodeModules = path.join(resourcesPath, 'app.asar', 'node_modules');
  const unpackedNodeModules = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules');
  const unpackedPrismaClient = path.join(unpackedNodeModules, '.prisma', 'client');
  
  childEnv.NODE_PATH = [
    process.env.NODE_PATH,
    userNodeModules,
    unpackedNodeModules,
    asarNodeModules,
    unpackedPrismaClient,
  ].filter(Boolean).join(path.delimiter);

  // 2. Configure Puppeteer
  try {
    const puppeteerRoot = path.join(resourcesPath, 'puppeteer');
    const walk = (dir, depth = 2, candidates = []) => {
      if (depth < 0) return candidates;
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const it of items) {
          const p = path.join(dir, it.name);
          if (it.isDirectory()) {
            walk(p, depth - 1, candidates);
          } else if (it.isFile()) {
            let isChrome = false;
            if (process.platform === 'win32') {
              isChrome = /chrome\.exe$/i.test(it.name);
            } else if (process.platform === 'darwin') {
              isChrome = it.name === 'Google Chrome for Testing' || it.name === 'Chromium';
            } else {
              isChrome = it.name === 'chrome' || it.name === 'chrome-linux';
            }
            if (isChrome) candidates.push(p);
          }
        }
      } catch {}
      return candidates;
    };
    const chromeExec = walk(puppeteerRoot, 4)[0];
    if (chromeExec) {
      childEnv.PUPPETEER_EXECUTABLE_PATH = chromeExec;
      childEnv.PUPPETEER_CACHE_DIR = puppeteerRoot;
      console.log('Found bundled Chrome:', chromeExec);
    }
  } catch (e) {
    console.warn('Failed to locate bundled Chrome:', e);
  }

  // 3. Configure Prisma Engines
  try {
    const enginesDir = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', '@prisma', 'engines');
    if (fs.existsSync(enginesDir)) {
      childEnv.PRISMA_ENGINES_OVERRIDE = enginesDir;
      childEnv.PRISMA_CLIENT_ENGINE_TYPE = 'library';
      if (process.platform === 'win32') {
        childEnv.PRISMA_QUERY_ENGINE_BINARY = path.join(enginesDir, 'query_engine-windows.exe');
        childEnv.PRISMA_QUERY_ENGINE_LIBRARY = path.join(enginesDir, 'query_engine-windows.dll.node');
        childEnv.PRISMA_SCHEMA_ENGINE_BINARY = path.join(enginesDir, 'schema-engine-windows.exe');
      } else if (process.platform === 'darwin') {
        const arch = process.arch === 'arm64' ? 'darwin-arm64' : 'darwin';
        childEnv.PRISMA_QUERY_ENGINE_BINARY = path.join(enginesDir, `query-engine-${arch}`);
        childEnv.PRISMA_QUERY_ENGINE_LIBRARY = path.join(enginesDir, `libquery_engine-${arch}.dylib.node`);
        childEnv.PRISMA_SCHEMA_ENGINE_BINARY = path.join(enginesDir, `schema-engine-${arch}`);
      } else {
        childEnv.PRISMA_QUERY_ENGINE_BINARY = path.join(enginesDir, 'query-engine-linux-musl');
        childEnv.PRISMA_QUERY_ENGINE_LIBRARY = path.join(enginesDir, 'libquery_engine-linux-musl.so.node');
        childEnv.PRISMA_SCHEMA_ENGINE_BINARY = path.join(enginesDir, 'schema-engine-linux-musl');
      }
      console.log('Configured Prisma engines');
    }
  } catch (e) {
    console.warn('Failed to configure Prisma engines:', e);
  }

  // 4. Set PORT
  childEnv.PORT = process.env.PORT;
  childEnv.PUBLIC_URL = `http://localhost:${childEnv.PORT}`;
  childEnv.STORAGE_URL = childEnv.PUBLIC_URL;
  childEnv.ELECTRON_RESOURCES_PATH = resourcesPath;
  childEnv.ELECTRON_RUN_AS_NODE = '1';

  // Logs
  const logsDir = path.join(userDataDir, 'logs');
  const logFile = path.join(logsDir, 'backend.log');
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  // Entry point
  const serverEntry = path.join(resourcesPath, 'app.asar.unpacked', 'dist', 'apps', 'server', 'main.js');
  console.log(`Starting backend from: ${serverEntry}`);

  const child = spawn(process.execPath, [serverEntry], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv,
    cwd: userDataDir,
  });

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  child.on('error', (err) => {
    console.error('Failed to start backend:', err);
    logStream.write(`Failed to start backend: ${err.stack}\n`);
  });

  child.on('exit', (code, signal) => {
    console.log(`Backend exited: code ${code}, signal ${signal}`);
    logStream.write(`Backend exited: code ${code}, signal ${signal}\n`);
  });

  serverProcess = child;
  return Promise.resolve(child);
}

async function findFreePort(startPort = 3000, maxAttempts = 50) {
  const net = require('net');
  const check = (port) =>
    new Promise((resolve) => {
      const server = net
        .createServer()
        .once('error', () => resolve(false))
        .once('listening', () => server.close(() => resolve(true)))
        .listen(port, '127.0.0.1');
    });
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await check(port)) return port;
  }
  return startPort;
}

function checkServerConnection(host = 'localhost', port = 5173) {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.request(
      { hostname: host, port, path: '/', method: 'GET', timeout: 2000 },
      () => resolve(true),
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

function updateLoadingStatus(status, details = '') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const safeStatus = String(status).replace(/"/g, '\\"');
    const safeDetails = String(details).replace(/"/g, '\\"');
    mainWindow.webContents.executeJavaScript(`
      try {
        if (window.updateStatus) window.updateStatus("${safeStatus}");
        if (window.updateDetails) window.updateDetails("${safeDetails}");
      } catch(e) {}
    `).catch(() => {});
  }
}

async function createWindow() {
  console.log('Creating Electron window...');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  mainWindow = new BrowserWindow({
    width: Math.min(1400, width - 100),
    height: Math.min(900, height - 100),
    minWidth: 1024,
    minHeight: 768,
    x: 50, y: 50,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, 'apps/client/public/icon/icon.png'),
    title: 'Reactive Resume',
    show: true,
  });

  const devUrl = 'http://localhost:5173';
  
  if (isDev) {
    console.log('Checking dev server...');
    if (await checkServerConnection('localhost', 5173)) {
      mainWindow.loadURL(devUrl);
    } else {
      // Dev mode waiting page
      const waitingPage = `
        <!DOCTYPE html><html><body><h1>Waiting for Dev Server (5173)...</h1>
        <script>setTimeout(() => window.location.reload(), 2000);</script></body></html>`;
      mainWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(waitingPage));
    }
  } else {
    // Production
    try {
      mainWindow.loadFile(path.join(__dirname, 'loading.html'));
    } catch (e) {
      console.error('Failed to load loading.html:', e);
    }

    const backendPort = Number(process.env.PORT) || 3000;
    const prodUrl = `http://localhost:${backendPort}`;
    
    let attempts = 0;
    const maxAttempts = 120;
    const http = require('http');

    const tryLoad = () => {
      attempts++;
      updateLoadingStatus('Initializing services...', `Waiting for backend (Attempt ${attempts})`);
      
      const req = http.request({ hostname: 'localhost', port: backendPort, path: '/api/health', method: 'GET', timeout: 1000 }, (res) => {
        if (res.statusCode === 200) {
          updateLoadingStatus('Ready!', 'Launching application...');
          setTimeout(() => mainWindow.loadURL(prodUrl), 500);
        } else {
          setTimeout(tryLoad, 1000);
        }
      });
      req.on('error', () => {
        if (attempts < maxAttempts) setTimeout(tryLoad, 1000);
        else updateLoadingStatus('Startup Failed', 'Could not connect to backend.');
      });
      req.on('timeout', () => { req.destroy(); setTimeout(tryLoad, 1000); });
      req.end();
    };
    setTimeout(tryLoad, 2000);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools();
  });
  
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Exit', click: () => app.quit() }
      ]
    },
    { label: 'View', submenu: [ { role: 'reload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' } ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  if (isProd) {
    process.env.PORT = String(await findFreePort(3000));
  }
  
  createWindow();
  createMenu();

  if (isProd) {
    setTimeout(() => {
      updateLoadingStatus('Starting backend service...');
      startBackendProcess().catch(e => {
        console.error('Failed to start backend:', e);
        updateLoadingStatus('Startup Error', e.message);
      });
    }, 500);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill('SIGTERM');
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// IPC Handlers
ipcMain.handle('download-and-save', async (event, url, filename) => {
  try {
    const ext = path.extname(filename).slice(1);
    const { filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
      defaultPath: filename,
      filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [],
    });

    if (!filePath) return { canceled: true };

    return new Promise((resolve, reject) => {
      const http = require('http');
      const file = fs.createWriteStream(filePath);
      const request = http.get(url, (response) => {
        if (response.statusCode !== 200) return reject(new Error('Download failed: ' + response.statusCode));
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve({ canceled: false, filePath }));
        });
      });
      request.on('error', (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
    });
  } catch (e) {
    console.error('IPC download-and-save error:', e);
    throw e;
  }
});

ipcMain.handle('open-json', async (event) => {
  try {
    const { filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      filters: [{ name: 'JSON Resume', extensions: ['json'] }],
      properties: ['openFile'],
    });

    if (filePaths && filePaths.length > 0) {
      const content = fs.readFileSync(filePaths[0], 'utf8');
      try {
        return { canceled: false, content: JSON.parse(content) };
      } catch (err) {
        throw new Error('Invalid JSON file');
      }
    }
    return { canceled: true };
  } catch (e) {
    console.error('IPC open-json error:', e);
    throw e;
  }
});

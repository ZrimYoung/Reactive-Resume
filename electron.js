console.log('=== Electron Application Starting ===');
console.log('Current working directory:', process.cwd());
console.log('Current file path:', __filename);

const { app, BrowserWindow, Menu, screen } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
// Avoid bundling dev-only deps; rely on Electron API
const isProd = app.isPackaged;
const isDev = !isProd;

console.log('isDev:', isDev);
console.log('Platform:', process.platform);

let mainWindow;
let serverProcess;

function checkServerConnection(host = 'localhost', port = 5173) {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.request(
      { hostname: host, port, path: '/', method: 'GET', timeout: 2000 },
      () => resolve(true),
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function startEmbeddedServer() {
  if (!isProd) return;
  try {
    process.env.NODE_ENV = 'production';
    process.env.PORT = process.env.PORT || '3000';
    process.env.PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
    process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'reactive-resume-offline-secret';
    const baseDir = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked')
      : __dirname;
    const serverEntry = path.join(baseDir, 'dist', 'apps', 'server', 'main.js');
    console.log('Starting embedded server from:', serverEntry);
    // Requiring the compiled server bundle bootstraps NestJS
    require(serverEntry);
  } catch (error) {
    console.error('Failed to start embedded server:', error);
  }
}

function checkServerConnection() {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.request({
      hostname: 'localhost',
      port: 5173,
      path: '/',
      method: 'GET',
      timeout: 2000
    }, (res) => {
      resolve(true);
    });
    
    req.on('error', () => {
      resolve(false);
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

async function createWindow() {
  console.log('Creating Electron window...');
  
  // Get primary display dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  console.log(`Screen size: ${width}x${height}`);
  
  // Create browser window
  mainWindow = new BrowserWindow({
    width: Math.min(1400, width - 100),
    height: Math.min(900, height - 100),
    minWidth: 1024,
    minHeight: 768,
    x: 50,
    y: 50,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
    },
    icon: path.join(__dirname, 'apps/client/public/icon/icon.png'),
    titleBarStyle: 'default',
    show: true,
    title: 'Reactive Resume',
    alwaysOnTop: false,
    frame: true,
    resizable: true,
    maximizable: true,
    minimizable: true,
    closable: true,
  });

  console.log('Window object created');

  const devUrl = 'http://localhost:5173';
  const prodUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
  
  // Check server connection
  if (isDev) {
    console.log('Checking dev server connection...');
    const isServerRunning = await checkServerConnection('localhost', 5173);
    if (isServerRunning) {
      console.log('Dev server connected, loading app directly');
      mainWindow.loadURL(devUrl);
    } else {
      console.log('Dev server not responding, showing waiting page');
    
    // Show waiting page with correct encoding
    const waitingPage = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reactive Resume - Starting</title>
        <style>
          body {
            font-family: 'Microsoft YaHei', 'SimHei', Arial, sans-serif;
            text-align: center;
            margin-top: 150px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            height: 100vh;
            margin: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
          }
          h1 { font-size: 2.5em; margin-bottom: 20px; }
          p { font-size: 1.2em; margin: 10px 0; }
          .spinner { 
            border: 4px solid rgba(255,255,255,0.3);
            border-top: 4px solid white;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .status { font-size: 1em; margin-top: 20px; opacity: 0.8; }
          button {
            background: white;
            color: #667eea;
            border: none;
            padding: 12px 24px;
            font-size: 16px;
            border-radius: 6px;
            cursor: pointer;
            margin-top: 20px;
            font-weight: bold;
          }
          button:hover { opacity: 0.9; }
        </style>
      </head>
      <body>
        <h1>🚀 Reactive Resume</h1>
        <div class="spinner"></div>
        <p>Starting application...</p>
        <p class="status">Waiting for dev server to start...</p>
        <button onclick="window.location.reload()">Retry</button>
        
        <script>
          let attempts = 0;
          const maxAttempts = 30; // Max 30 attempts (30 seconds)
          
          function checkServer() {
            attempts++;
            console.log('Checking server, attempt:', attempts);
            
            fetch('http://localhost:5173')
              .then(() => {
                console.log('Server ready');
                window.location.href = 'http://localhost:5173';
              })
              .catch(() => {
                if (attempts < maxAttempts) {
                  document.querySelector('.status').textContent = 
                    'Waiting for dev server to start... (attempt ' + attempts + '/' + maxAttempts + ')';
                  setTimeout(checkServer, 1000);
                } else {
                  document.querySelector('.status').innerHTML = 
                    '⚠️ Cannot connect to dev server<br>Please ensure dev server is running on port 5173';
                }
              });
          }
          
          // Start checking after 3 seconds
          setTimeout(checkServer, 3000);
        </script>
      </body>
      </html>
    `;
    
    mainWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(waitingPage));
    }
  } else {
    // Production: wait for embedded server and then load the app
    // Pass resources path to backend so it can resolve unpacked static assets
    process.env.ELECTRON_RESOURCES_PATH = process.resourcesPath;
    startEmbeddedServer();
    let attempts = 0;
    const maxAttempts = 60;
    const http = require('http');
    const tryLoad = () => {
      attempts++;
      const req = http.request({ hostname: 'localhost', port: 3000, path: '/', method: 'GET', timeout: 1000 }, () => {
        console.log('Embedded server is ready, loading app');
        mainWindow.loadURL(prodUrl);
      });
      req.on('error', () => {
        if (attempts < maxAttempts) setTimeout(tryLoad, 1000);
        else mainWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent('<h2>Failed to start embedded server on port 3000</h2>'));
      });
      req.on('timeout', () => { req.destroy(); if (attempts < maxAttempts) setTimeout(tryLoad, 1000); });
      req.end();
    };
    tryLoad();
  }

  // Page load complete event
  mainWindow.webContents.once('did-finish-load', () => {
    console.log('Page load completed');
    mainWindow.show();
    mainWindow.focus();
  });

  // Page load failed event
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.log(`Page load failed: ${errorCode} - ${errorDescription}`);
    console.log(`Failed URL: ${validatedURL}`);
    
    // Only show error page when trying to load dev server fails
    if (validatedURL.includes('localhost:5173')) {
      const errorPage = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Connection Failed</title>
          <style>
            body {
              font-family: 'Microsoft YaHei', 'SimHei', Arial, sans-serif;
              text-align: center;
              margin-top: 100px;
              background: #f5f5f5;
              color: #333;
            }
            .error-container {
              background: white;
              padding: 40px;
              border-radius: 10px;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
              max-width: 500px;
              margin: 0 auto;
            }
            h1 { color: #e74c3c; margin-bottom: 20px; }
            p { margin: 15px 0; line-height: 1.6; }
            button {
              background: #3498db;
              color: white;
              border: none;
              padding: 12px 24px;
              font-size: 16px;
              border-radius: 6px;
              cursor: pointer;
              margin: 10px;
            }
            button:hover { background: #2980b9; }
            .error-code { color: #7f8c8d; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1>⚠️ Cannot connect to dev server</h1>
            <p>Please ensure dev server is running on port <strong>5173</strong></p>
            <p class="error-code">Error code: ${errorCode}</p>
            <p>You can:</p>
            <button onclick="window.location.href='http://localhost:5173'">Reconnect</button>
            <button onclick="window.location.reload()">Refresh</button>
            
            <script>
              // Auto retry every 5 seconds
              setTimeout(() => {
                window.location.href = 'http://localhost:5173';
              }, 5000);
            </script>
          </div>
        </body>
        </html>
      `;
      
      mainWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(errorPage));
    }
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready');
    mainWindow.show();
    mainWindow.focus();
    
    // Open DevTools in development mode
    if (isDev) {
      console.log('Opening developer tools...');
      mainWindow.webContents.openDevTools();
    }
  });

  // Window event listeners
  mainWindow.on('show', () => {
    console.log('Window show event');
  });

  mainWindow.on('hide', () => {
    console.log('Window hide event');
  });

  mainWindow.on('focus', () => {
    console.log('Window focus event');
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    console.log('Window close event');
    mainWindow = null;
  });
  
  console.log('Window created');
}

function startServer() {
  // In development mode, don't start server, assume dev server is already running
  console.log('Development mode: Assuming dev server is already running');
  console.log('Frontend server should be at: http://localhost:5173');
  console.log('Backend server should be at: http://localhost:3000');
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Resume',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new-resume');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { label: 'Developer Tools', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Fullscreen', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Reactive Resume',
          click: () => {
            mainWindow.webContents.send('menu-about');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Create window when app is ready
app.whenReady().then(() => {
  console.log('Electron application ready');
  console.log('Platform:', process.platform);
  console.log('Electron version:', process.versions.electron);
  console.log('Node version:', process.versions.node);
  
  startServer();
  
  // Wait a bit before creating window
  setTimeout(() => {
    createWindow();
    createMenu();
  }, 500);

  app.on('activate', () => {
    console.log('Application activate event');
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS, keep app active until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up server process when app quits
app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

// Prevent multiple app instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus main window when second instance is launched
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
} 
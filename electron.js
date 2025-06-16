console.log('=== Electron Application Starting ===');
console.log('Current working directory:', process.cwd());
console.log('Current file path:', __filename);

const { app, BrowserWindow, Menu, screen } = require('electron');
const { spawn, fork } = require('child_process');
const path = require('path');

let mainWindow;
let serverProcess;

// 获取正确的资源路径
function getResourcePath(isDev) {
  if (isDev) {
    return process.cwd();
  }
  // 在打包环境中，资源在 resources/app.asar.unpacked 或 resources 目录
  return process.resourcesPath;
}

// 获取服务器可执行文件路径
function getServerPath(isDev) {
  const resourcePath = getResourcePath(isDev);
  if (isDev) {
    return path.join(resourcePath, 'dist/apps/server/main.js');
  }
  // 打包后使用专门的启动脚本
  return path.join(resourcePath, 'app.asar.unpacked', 'server-start.js');
}

function checkServerConnection(port = 3000) {
  return new Promise((resolve) => {
    const http = require('http');
    
    // 尝试连接到多个地址
    const hosts = ['127.0.0.1', 'localhost'];
    let attempted = 0;
    
    const tryHost = (hostname) => {
      const req = http.request({
        hostname: hostname,
        port: port,
        path: '/api/health',
        method: 'GET',
        timeout: 5000
      }, (res) => {
        console.log(`Health check ${hostname}:${port} returned status: ${res.statusCode}`);
        resolve(res.statusCode === 200);
      });
      
      req.on('error', (err) => {
        console.log(`Health check failed for ${hostname}:${port} - ${err.message}`);
        attempted++;
        if (attempted < hosts.length) {
          tryHost(hosts[attempted]);
        } else {
          resolve(false);
        }
      });
      
      req.on('timeout', () => {
        console.log(`Health check timeout for ${hostname}:${port}`);
        req.destroy();
        attempted++;
        if (attempted < hosts.length) {
          tryHost(hosts[attempted]);
        } else {
          resolve(false);
        }
      });
      
      req.end();
    };
    
    tryHost(hosts[0]);
  });
}

async function createWindow(isDev) {
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
    show: false, // 不立即显示，等待服务器启动
    title: 'Reactive Resume',
    alwaysOnTop: false,
    frame: true,
    resizable: true,
    maximizable: true,
    minimizable: true,
    closable: true,
  });

  console.log('Window object created');

  // 根据环境选择不同的 URL
  let startUrl;
  if (isDev) {
    startUrl = 'http://localhost:5173';
    
    // 开发环境：检查开发服务器连接
    console.log('Checking dev server connection...');
    const isDevServerRunning = await checkServerConnection(5173);
    
    if (isDevServerRunning) {
      console.log('Dev server connected, loading app directly');
      mainWindow.loadURL(startUrl);
    } else {
      console.log('Dev server not responding, showing waiting page');
      showWaitingPage();
    }
  } else {
    // 生产环境：等待内置服务器启动
    startUrl = 'http://localhost:3000';
    console.log('Production mode: waiting for server to start...');
    
    // 显示启动页面
    showStartingPage();
    
    // 等待服务器启动 - 增加超时时间因为服务器需要较长时间启动
    const maxAttempts = 60; // 60次尝试，总共约60秒
    let attempts = 0;
    
    const waitForServer = async () => {
      attempts++;
      console.log(`Checking server connection, attempt ${attempts}/${maxAttempts}`);
      
      const isServerRunning = await checkServerConnection(3000);
      
      if (isServerRunning) {
        console.log('Server is ready, loading application');
        mainWindow.loadURL(startUrl);
      } else if (attempts < maxAttempts) {
        // 前10次每1秒检查一次，之后每2秒检查一次
        const delay = attempts <= 10 ? 1000 : 2000;
        setTimeout(waitForServer, delay);
      } else {
        console.error('Server failed to start within timeout');
        showServerError();
      }
    };
    
    // 延迟5秒开始检查，给服务器更多启动时间
    setTimeout(waitForServer, 5000);
  }

  function showStartingPage() {
    const startingPage = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reactive Resume - Starting</title>
        <style>
          body {
            font-family: 'Microsoft YaHei', 'SimHei', Arial, sans-serif;
            text-align: center;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            height: 100vh;
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
        </style>
      </head>
      <body>
        <h1>🚀 Reactive Resume</h1>
        <div class="spinner"></div>
        <p>正在启动应用程序...</p>
        <p class="status">正在初始化服务器，请稍候...</p>
      </body>
      </html>
    `;
    
    mainWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(startingPage));
  }

  function showWaitingPage() {
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

  function showServerError() {
    const errorPage = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Server Error</title>
        <style>
          body {
            font-family: 'Microsoft YaHei', 'SimHei', Arial, sans-serif;
            text-align: center;
            margin: 0;
            background: #f5f5f5;
            color: #333;
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
          }
          .error-container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            max-width: 500px;
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
        </style>
      </head>
      <body>
        <div class="error-container">
          <h1>⚠️ 服务器启动失败</h1>
          <p>应用程序无法启动内置服务器。</p>
          <p>请检查以下问题：</p>
          <ul style="text-align: left;">
            <li>端口 3000 是否被占用</li>
            <li>应用程序是否有足够的权限</li>
            <li>系统防火墙设置</li>
          </ul>
          <button onclick="location.reload()">重试</button>
          <button onclick="require('electron').remote.app.quit()">退出</button>
        </div>
      </body>
      </html>
    `;
    
    mainWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(errorPage));
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
    
    // Only show error page when trying to load server fails
    if (validatedURL.includes('localhost')) {
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
            <h1>⚠️ 无法连接到服务器</h1>
            <p>请确保服务器正在运行</p>
            <p class="error-code">错误代码: ${errorCode}</p>
            <p>可以尝试：</p>
            <button onclick="window.location.reload()">重新连接</button>
            <button onclick="window.location.reload()">刷新</button>
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

function startServer(isDev) {
  if (isDev) {
    // In development mode, don't start server, assume dev server is already running
    console.log('Development mode: Assuming dev server is already running');
    console.log('Frontend server should be at: http://localhost:5173');
    console.log('Backend server should be at: http://localhost:3000');
    return;
  }

  // 生产环境：启动内置服务器
  console.log('Production mode: Starting built-in server...');

  const serverStartPath = getServerPath(isDev);
  console.log('Server start script path:', serverStartPath);

  const fs = require('fs');
  if (!fs.existsSync(serverStartPath)) {
    console.error('Server start script not found:', serverStartPath);
    return false;
  }

  // --- All path logic is now in electron.js ---
  const userDataPath = app.getPath('userData');
  const appPath = app.getAppPath();
  const unpackedAppPath = path.dirname(appPath); // The 'resources' dir

  const serverMainPath = path.join(unpackedAppPath, 'app.asar.unpacked', 'dist', 'apps', 'server', 'main.js');
  const storagePath = path.join(userDataPath, 'storage');
  const databasePath = path.join(userDataPath, 'database.db');
  const queryEnginePath = path.join(unpackedAppPath, 'app.asar.unpacked', 'node_modules', '.prisma', 'client', 'query-engine-windows.exe');

  // Ensure storage directory exists before starting server
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }

  try {
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '3000',
      // Pass all calculated paths to the server process
      SERVER_MAIN_PATH: serverMainPath,
      USER_DATA_PATH: userDataPath,
      STORAGE_LOCAL_PATH: storagePath,
      DATABASE_URL: `file:${databasePath}`,
      PUBLIC_URL: `http://localhost:3000`,
      SESSION_SECRET: 'reactive-resume-session-secret-' + Date.now(),
      PRISMA_QUERY_ENGINE_BINARY: fs.existsSync(queryEnginePath) ? queryEnginePath : undefined,
      DISABLE_EMAIL_AUTH: 'true',
      VITE_DISABLE_EMAIL_AUTH: 'true'
    };

    console.log('Starting server with environment:', {
      NODE_ENV: env.NODE_ENV,
      PORT: env.PORT,
      DATABASE_URL: env.DATABASE_URL,
      STORAGE_LOCAL_PATH: env.STORAGE_LOCAL_PATH,
      PRISMA_QUERY_ENGINE_BINARY: env.PRISMA_QUERY_ENGINE_BINARY,
      SERVER_MAIN_PATH: env.SERVER_MAIN_PATH
    });

    serverProcess = fork(serverStartPath, [], {
      env,
      silent: false,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      execArgv: ['--no-warnings']
    });

    serverProcess.on('message', (message) => {
      console.log('Server message:', message);
    });

    serverProcess.on('error', (error) => {
      console.error('Server process error:', error);
    });

    serverProcess.on('exit', (code, signal) => {
      console.log(`Server process exited with code ${code} and signal ${signal}`);
      if (code !== 0 && signal !== 'SIGTERM') {
        console.error('Server process crashed or failed to start.');
        // Optionally, show an error message to the user
        // showServerError();
      }
      serverProcess = null;
    });

    serverProcess.stdout.on('data', (data) => {
      console.log('Server stdout:', data.toString());
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('Server stderr:', data.toString());
    });

    console.log('Server process started with PID:', serverProcess.pid);
    return true;

  } catch (error) {
    console.error('Failed to start server:', error);
    return false;
  }
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

async function startApp() {
  const { default: isDev } = await import('electron-is-dev');

  console.log('isDev:', isDev);
  console.log('Platform:', process.platform);

  // Create window when app is ready
  app.whenReady().then(() => {
    console.log('Electron application ready');
    console.log('Platform:', process.platform);
    console.log('Electron version:', process.versions.electron);
    console.log('Node version:', process.versions.node);
    
    startServer(isDev);
    
    // Wait a bit before creating window
    setTimeout(() => {
      createWindow(isDev);
      createMenu();
    }, 500);

    app.on('activate', () => {
      console.log('Application activate event');
      // On macOS, re-create window when dock icon is clicked
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(isDev);
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
      console.log(`Attempting to kill server process with PID: ${serverProcess.pid}`);
      if (process.platform === 'win32') {
        // Use taskkill on Windows to ensure the process and its children are terminated
        spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t']);
      } else {
        // On non-Windows platforms, SIGKILL is more forceful than the default SIGTERM
        serverProcess.kill('SIGKILL');
      }
      serverProcess = null; // Prevent multiple kill attempts
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
}

startApp().catch((error) => {
  console.error('An error occurred during app startup:', error);
  app.quit();
});

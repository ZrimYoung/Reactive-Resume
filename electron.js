console.log('=== Electron 应用开始启动 ===');
console.log('当前工作目录:', process.cwd());
console.log('当前文件路径:', __filename);

const { app, BrowserWindow, Menu, screen } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const isDev = require('electron-is-dev');

console.log('isDev:', isDev);
console.log('平台:', process.platform);

let mainWindow;
let serverProcess;

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
  console.log('正在创建 Electron 窗口...');
  
  // Get primary display dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  console.log(`屏幕尺寸: ${width}x${height}`);
  
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

  console.log('窗口对象已创建');

  const startUrl = 'http://localhost:5173';
  
  // 检查服务器连接
  console.log('检查开发服务器连接...');
  const isServerRunning = await checkServerConnection();
  
  if (isServerRunning) {
    console.log('开发服务器已连接，直接加载应用');
    mainWindow.loadURL(startUrl);
  } else {
    console.log('开发服务器未响应，显示等待页面');
    
    // 显示等待页面，使用正确的编码
    const waitingPage = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reactive Resume - 启动中</title>
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
        <p>正在启动应用...</p>
        <p class="status">正在等待开发服务器启动...</p>
        <button onclick="window.location.reload()">重新检查</button>
        
        <script>
          let attempts = 0;
          const maxAttempts = 30; // 最多尝试30次（30秒）
          
          function checkServer() {
            attempts++;
            console.log('检查服务器，尝试次数:', attempts);
            
            fetch('http://localhost:5173')
              .then(() => {
                console.log('服务器已就绪');
                window.location.href = 'http://localhost:5173';
              })
              .catch(() => {
                if (attempts < maxAttempts) {
                  document.querySelector('.status').textContent = 
                    '正在等待开发服务器启动... (尝试 ' + attempts + '/' + maxAttempts + ')';
                  setTimeout(checkServer, 1000);
                } else {
                  document.querySelector('.status').innerHTML = 
                    '⚠️ 无法连接到开发服务器<br>请确保开发服务器正在运行在端口 5173';
                }
              });
          }
          
          // 3秒后开始检查
          setTimeout(checkServer, 3000);
        </script>
      </body>
      </html>
    `;
    
    mainWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(waitingPage));
  }

  // 页面加载完成事件
  mainWindow.webContents.once('did-finish-load', () => {
    console.log('页面加载完成');
    mainWindow.show();
    mainWindow.focus();
  });

  // 页面加载失败事件
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.log(`页面加载失败: ${errorCode} - ${errorDescription}`);
    console.log(`失败的URL: ${validatedURL}`);
    
    // 只有当尝试加载开发服务器失败时才显示错误页面
    if (validatedURL.includes('localhost:5173')) {
      const errorPage = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>连接失败</title>
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
            <h1>⚠️ 无法连接到开发服务器</h1>
            <p>请确保开发服务器正在运行在端口 <strong>5173</strong></p>
            <p class="error-code">错误代码: ${errorCode}</p>
            <p>您可以：</p>
            <button onclick="window.location.href='http://localhost:5173'">重新连接</button>
            <button onclick="window.location.reload()">刷新页面</button>
            
            <script>
              // 每5秒自动重试一次
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
    console.log('窗口准备就绪');
    mainWindow.show();
    mainWindow.focus();
    
    // Open DevTools in development mode
    if (isDev) {
      console.log('正在打开开发者工具...');
      mainWindow.webContents.openDevTools();
    }
  });

  // 窗口事件监听
  mainWindow.on('show', () => {
    console.log('窗口显示事件');
  });

  mainWindow.on('hide', () => {
    console.log('窗口隐藏事件');
  });

  mainWindow.on('focus', () => {
    console.log('窗口获得焦点');
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    console.log('窗口关闭事件');
    mainWindow = null;
  });
  
  console.log('窗口创建完成');
}

function startServer() {
  // 在开发模式下不启动服务器，假设开发服务器已经运行
  console.log('开发模式：假设开发服务器已经在运行');
  console.log('前端服务器应该在: http://localhost:5173');
  console.log('后端服务器应该在: http://localhost:3000');
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
  console.log('Electron 应用准备就绪');
  console.log('平台:', process.platform);
  console.log('Electron 版本:', process.versions.electron);
  console.log('Node 版本:', process.versions.node);
  
  startServer();
  
  // 稍微延迟一下再创建窗口
  setTimeout(() => {
    createWindow();
    createMenu();
  }, 500);

  app.on('activate', () => {
    console.log('应用激活事件');
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
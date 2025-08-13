console.log('=== Electron Application Starting ===');
console.log('Current working directory:', process.cwd());
console.log('Current file path:', __filename);

const { app, BrowserWindow, Menu, screen } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// --- Main Process Logger ---
// In production, console.* calls can throw EPIPE errors if the parent process closes stdout.
// We'll redirect console output to a file to avoid this and to capture logs.
// This must be done at the very top of the file, before any other console.* calls.
if (app.isPackaged) {
  const userDataDir = app.getPath('userData');
  const logsDir = path.join(userDataDir, 'logs');
  let backendBootstrapFile = null;
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

  // Override console methods to write to the log file
  console.log = (...args) => mainLogger(logStream, ...args);
  console.error = (...args) => mainLogger(logStream, 'ERROR:', ...args);
  console.warn = (...args) => mainLogger(logStream, 'WARN:', ...args);
  console.info = (...args) => mainLogger(logStream, 'INFO:', ...args);

  process.on('uncaughtException', (error) => {
    console.error('UNCAUGHT EXCEPTION:', error.stack || error.message || error);
    // It's crucial to exit the app after an uncaught exception.
    app.quit();
  });
}
// --- End Main Process Logger ---

// Avoid bundling dev-only deps; rely on Electron API
const isProd = app.isPackaged;
const isDev = !isProd;

console.log('isDev:', isDev);
console.log('Platform:', process.platform);

let mainWindow;
let serverProcess;

/**
 * 在生产模式下，以后端子进程方式启动 NestJS 服务。
 * @returns {Promise<ChildProcess>} 返回启动的子进程实例。
 */
function startBackendProcess() {
  // 该函数仅在打包后的生产环境中执行
  if (!isProd) {
    console.log('Dev mode, skipping backend process start.');
    return Promise.resolve(null);
  }

  const userDataDir = app.getPath('userData');
  const resourcesPath = process.resourcesPath;

  // NOTE: 运行时不再尝试通过 pnpm 生成 Prisma Client。
  // 依赖构建期已生成的 @prisma/client 与解包的 engines（见 electron-builder 配置）。

  // --- Start: Environment Preparation for Backend Subprocess ---
  const childEnv = { ...process.env, NODE_ENV: 'production' };

  // 1. Set paths relative to userData, which is writable
  childEnv.ELECTRON_USER_DATA_DIR = userDataDir;
  childEnv.STORAGE_DIR = path.join(userDataDir, 'storage');
  childEnv.DATABASE_URL = `file:./local-resume.db`; // Path is now relative to the CWD of the child process
  childEnv.SESSION_SECRET = childEnv.SESSION_SECRET || 'reactive-resume-offline-secret';
  console.log('Backend database path (relative to CWD):', childEnv.DATABASE_URL);
  console.log('Backend storage path:', childEnv.STORAGE_DIR);
  
  // Add module resolution paths so the backend can resolve deps from packaged app
  const userNodeModules = path.join(userDataDir, 'node_modules');
  const asarNodeModules = path.join(resourcesPath, 'app.asar', 'node_modules');
  const unpackedNodeModules = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules');
  const prismaClientDir = path.join(unpackedNodeModules, '.prisma', 'client');
  childEnv.NODE_PATH = [
    process.env.NODE_PATH,
    userNodeModules,
    asarNodeModules,
    unpackedNodeModules,
    prismaClientDir,
  ].filter(Boolean).join(path.delimiter);

  // 2. Configure paths for bundled Puppeteer
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
          } else if (it.isFile() && /chrome\.exe$/i.test(it.name)) {
            candidates.push(p);
          }
        }
      } catch {}
      return candidates;
    };
    const chromeExec = walk(puppeteerRoot, 4)[0];
    if (chromeExec) {
      childEnv.PUPPETEER_EXECUTABLE_PATH = chromeExec;
      childEnv.PUPPETEER_CACHE_DIR = puppeteerRoot;
      console.log('Found bundled Chrome for backend at:', chromeExec);
    }
  } catch (e) {
    console.warn('Failed to locate bundled Chrome executable for backend:', e);
  }

  // 3. Configure paths for Prisma Engines
  try {
    const enginesDir = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', '@prisma', 'engines');
    if (fs.existsSync(enginesDir)) {
      childEnv.PRISMA_ENGINES_OVERRIDE = enginesDir;
      // Prefer binary engine to avoid native .node loading issues in packaged Electron
      // 强制使用 Node-API (library) 引擎以匹配打包的 Prisma Client runtime/library.js
      childEnv.PRISMA_CLIENT_ENGINE_TYPE = 'library';
      if (process.platform === 'win32') {
        childEnv.PRISMA_QUERY_ENGINE_BINARY = path.join(enginesDir, 'query_engine-windows.exe');
        // Windows 下 Prisma Node-API 库文件实际为 query_engine-windows.dll.node（非 libquery_engine-...）
        childEnv.PRISMA_QUERY_ENGINE_LIBRARY = path.join(enginesDir, 'query_engine-windows.dll.node');
        childEnv.PRISMA_SCHEMA_ENGINE_BINARY = path.join(enginesDir, 'schema-engine-windows.exe');
      } else if (process.platform === 'darwin') {
        const arch = process.arch === 'arm64' ? 'darwin-arm64' : 'darwin';
        childEnv.PRISMA_QUERY_ENGINE_BINARY = path.join(enginesDir, `query-engine-${arch}`);
        childEnv.PRISMA_QUERY_ENGINE_LIBRARY = path.join(enginesDir, `libquery_engine-${arch}.dylib.node`);
        childEnv.PRISMA_SCHEMA_ENGINE_BINARY = path.join(enginesDir, `schema-engine-${arch}`);
      } else {
        // Default to linux-musl variants for better portability in packaged apps
        childEnv.PRISMA_QUERY_ENGINE_BINARY = path.join(enginesDir, 'query-engine-linux-musl');
        childEnv.PRISMA_QUERY_ENGINE_LIBRARY = path.join(enginesDir, 'libquery_engine-linux-musl.so.node');
        childEnv.PRISMA_SCHEMA_ENGINE_BINARY = path.join(enginesDir, 'schema-engine-linux-musl');
      }
      console.log('Configured Prisma engines for backend:', {
        type: childEnv.PRISMA_CLIENT_ENGINE_TYPE,
        binary: childEnv.PRISMA_QUERY_ENGINE_BINARY,
        library: childEnv.PRISMA_QUERY_ENGINE_LIBRARY,
      });
    } else {
      console.warn('Prisma engines directory not found at:', enginesDir);
    }
  } catch (e) {
    console.warn('Failed to configure Prisma engine env vars for backend:', e);
  }

  // 4. Set PORT and PUBLIC_URL for the server to listen on
  childEnv.PORT = process.env.PORT; // This is set in app.whenReady
  childEnv.PUBLIC_URL = `http://localhost:${childEnv.PORT}`;
  childEnv.STORAGE_URL = childEnv.PUBLIC_URL;
  // 5. Provide resources path and ensure Node mode under Electron
  childEnv.ELECTRON_RESOURCES_PATH = resourcesPath;
  childEnv.ELECTRON_RUN_AS_NODE = '1';
  // --- End: Environment Preparation ---

  const logsDir = path.join(userDataDir, 'logs');
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (e) {
    console.error('Failed to create logs directory:', e);
  }

  // 后端服务的日志文件路径
  const logFile = path.join(logsDir, 'backend.log');
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  // 确定后端服务的入口点
  const serverEntry = path.join(resourcesPath, 'app.asar.unpacked', 'dist', 'apps', 'server', 'main.js');
  console.log(`Attempting to start backend service from: ${serverEntry}`);

  // 为子进程注入 Prisma 客户端解析引导脚本，确保 @prisma/client 与 .prisma/* 在打包环境可解析
  try {
    const bootstrapDir = path.join(userDataDir, 'bootstrap');
    fs.mkdirSync(bootstrapDir, { recursive: true });
    const bootstrapFile = path.join(bootstrapDir, 'prisma-resolver.js');
    const bootstrapCode = `(() => {\n`
      + `  try { console.log('[bootstrap] prisma resolver loaded'); } catch {}\n`
      + `  const path = require('path');\n`
      + `  const fs = require('fs');\n`
      + `  const Module = require('module');\n`
      + `  const resourcesPath = process.env.ELECTRON_RESOURCES_PATH || (process.resourcesPath || '');\n`
      + `  const userDataDir = process.env.ELECTRON_USER_DATA_DIR || process.cwd();\n`
      + `  const unpackedNodeModules = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules');\n`
      + `  const asarNodeModules = path.join(resourcesPath, 'app.asar', 'node_modules');\n`
      + `  const userNodeModules = path.join(userDataDir, 'node_modules');\n`
      + `  const unpackedPrismaClientDir = path.join(unpackedNodeModules, '.prisma', 'client');\n`
      + `  const unpackedPrismaIndex = path.join(unpackedPrismaClientDir, 'index.js');\n`
      + `  const unpackedPrismaDefault = path.join(unpackedPrismaClientDir, 'default.js');\n`
      + `  const resourcesPrismaClientDir = path.join(resourcesPath, '.prisma', 'client');\n`
      + `  const resourcesPrismaIndex = path.join(resourcesPrismaClientDir, 'index.js');\n`
      + `  const resourcesPrismaDefault = path.join(resourcesPrismaClientDir, 'default.js');\n`
      + `  // Extend NODE_PATH\n`
      + `  const parts = [process.env.NODE_PATH, userNodeModules, unpackedNodeModules, asarNodeModules, resourcesPrismaClientDir, unpackedPrismaClientDir].filter(Boolean);\n`
      + `  process.env.NODE_PATH = parts.join(path.delimiter);\n`
      + `  try { Module._initPaths(); } catch {}\n`
      + `  const originalResolve = Module._resolveFilename;\n`
      + `  Module._resolveFilename = function(request, parent, isMain, options) {\n`
      + `    try {\n`
      + `      // Map @prisma/client to generated client in unpacked dir\n`
      + `      if (request === '@prisma/client' || (typeof request === 'string' && request.startsWith('@prisma/client/'))) {\n`
      + `        if (fs.existsSync(resourcesPrismaIndex)) return resourcesPrismaIndex;\n`
      + `        if (fs.existsSync(resourcesPrismaDefault)) return resourcesPrismaDefault;\n`
      + `        if (fs.existsSync(unpackedPrismaIndex)) return unpackedPrismaIndex;\n`
      + `        if (fs.existsSync(unpackedPrismaDefault)) return unpackedPrismaDefault;\n`
      + `      }\n`
      + `      // Map .prisma/client/* module ids to generated client\n`
      + `      if (request === '.prisma/client' || request === '.prisma/client/index' || request === '.prisma/client/default' || (/^\\.prisma[\\/]+client[\\/]/.test(request))) {\n`
      + `        if (request.endsWith('default') && fs.existsSync(resourcesPrismaDefault)) return resourcesPrismaDefault;\n`
      + `        if (fs.existsSync(resourcesPrismaIndex)) return resourcesPrismaIndex;\n`
      + `        if (request.endsWith('default') && fs.existsSync(unpackedPrismaDefault)) return unpackedPrismaDefault;\n`
      + `        if (fs.existsSync(unpackedPrismaIndex)) return unpackedPrismaIndex;\n`
      + `      }\n`
      + `    } catch {}\n`
      + `    return originalResolve.call(this, request, parent, isMain, options);\n`
      + `  };\n`
      + `  // Patch default.js stub to forward to index.js if necessary\n`
      + `  try {\n`
      + `    if (fs.existsSync(resourcesPrismaDefault)) {\n`
      + `      const content = fs.readFileSync(resourcesPrismaDefault, 'utf8');\n`
      + `      if (/did not initialize yet|Prisma Client could not/.test(content)) {\n`
      + `        fs.writeFileSync(resourcesPrismaDefault, "module.exports = require('./index')\\n", 'utf8');\n`
      + `      }\n`
      + `    }\n`
      + `    if (fs.existsSync(unpackedPrismaDefault)) {\n`
      + `      const content2 = fs.readFileSync(unpackedPrismaDefault, 'utf8');\n`
      + `      if (/did not initialize yet|Prisma Client could not/.test(content2)) {\n`
      + `        fs.writeFileSync(unpackedPrismaDefault, "module.exports = require('./index')\\n", 'utf8');\n`
      + `      }\n`
      + `    }\n`
      + `  } catch {}\n`
      + `})();\n`;
    fs.writeFileSync(bootstrapFile, bootstrapCode, 'utf8');
    console.log('Wrote backend bootstrap to:', bootstrapFile);
    childEnv.ELECTRON_BACKEND_BOOTSTRAP = bootstrapFile;
    backendBootstrapFile = bootstrapFile;
  } catch (e) {
    console.warn('Failed to prepare backend bootstrap:', e);
  }

  // 使用 spawn 启动一个独立的 Node.js 进程来运行后端服务
  // 优先使用包装脚本，显式 require 引导与服务入口，避免 -r 在某些环境下未生效
  let childArgs;
  try {
    const wrapperFile = path.join(userDataDir, 'bootstrap', 'server-runner.js');
    const wrapperCode = `(() => {\n`+
      `  const fs = require('fs');\n`+
      `  const path = require('path');\n`+
      `  const logsDir = path.join(process.env.ELECTRON_USER_DATA_DIR || process.cwd(), 'logs');\n`+
      `  try { fs.mkdirSync(logsDir, { recursive: true }); } catch {}\n`+
      `  const logf = path.join(logsDir, 'wrapper.log');\n`+
      `  function wlog(msg) { try { fs.appendFileSync(logf, '['+new Date().toISOString()+'] '+msg+'\\n'); } catch {} }\n`+
      `  try {\n`+
      `    if (process.env.ELECTRON_BACKEND_BOOTSTRAP) {\n`+
      `      wlog('requiring bootstrap: ' + process.env.ELECTRON_BACKEND_BOOTSTRAP);\n`+
      `      require(process.env.ELECTRON_BACKEND_BOOTSTRAP);\n`+
      `      wlog('bootstrap ok');\n`+
      `    } else { wlog('no bootstrap env'); }\n`+
      `  } catch (e) { wlog('bootstrap failed: ' + (e && (e.stack || e.message || e))); }\n`+
      `  try {\n`+
      `    wlog('requiring server entry: ' + ${JSON.stringify(serverEntry)});\n`+
      `    require(${JSON.stringify(serverEntry)});\n`+
      `    wlog('server entry ok');\n`+
      `  } catch (e) {\n`+
      `    wlog('server entry failed: ' + (e && (e.stack || e.message || e)));\n`+
      `    process.exit(1);\n`+
      `  }\n`+
      `})();\n`;
    fs.writeFileSync(wrapperFile, wrapperCode, 'utf8');
    childArgs = [wrapperFile];
  } catch (e) {
    console.warn('Failed to prepare backend runner wrapper, falling back to direct run:', e);
    childArgs = backendBootstrapFile ? ['-r', backendBootstrapFile, serverEntry] : [serverEntry];
  }
  const child = spawn(process.execPath, childArgs, {
    detached: true, // 在父进程退出后，如果需要，子进程可以继续运行
    stdio: ['ignore', 'pipe', 'pipe'], // 忽略 stdin, 管道化 stdout 和 stderr
    env: childEnv, // Pass the fully prepared environment
    cwd: userDataDir, // CRITICAL: Set the correct working directory for the child process
  });

  // 将子进程的输出重定向到日志文件
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  child.on('error', (err) => {
    console.error('Failed to start backend process:', err);
    logStream.write(`Failed to start backend process: ${err.stack || err.message}\n`);
  });

  child.on('exit', (code, signal) => {
    console.log(`Backend process exited with code ${code} and signal ${signal}`);
    logStream.write(`Backend process exited with code ${code} and signal ${signal}\n`);
  });

  console.log(`Backend process started with PID: ${child.pid}. Logs at: ${logFile}`);
  serverProcess = child; // 保存子进程引用
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
    // eslint-disable-next-line no-await-in-loop
    const port = startPort + i;
    // eslint-disable-next-line no-await-in-loop
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
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// 该函数现在被废弃，因为后端服务已在独立的子进程中启动。
// 保留函数体和其中的复杂环境设置逻辑，以备将来参考或在子进程内部需要时复用。
async function startEmbeddedServer_DEPRECATED() {
  if (!isProd) return;
  try {
    process.env.NODE_ENV = 'production';
    // Prefer local cached Chrome bundled into resources (downloaded at build time)
    try {
      const resourcesRoot = process.resourcesPath;
      const puppeteerRoot = path.join(resourcesRoot, 'puppeteer');
      // Typical Chrome for Testing layout: .../chrome/<platform>-<arch>/<revision>/chrome-win/chrome.exe
      // We scan a few likely locations to find chrome executable
      const candidates = [];
      const walk = (dir, depth = 2) => {
        try {
          if (depth < 0) return;
          const items = fs.readdirSync(dir, { withFileTypes: true });
          for (const it of items) {
            const p = path.join(dir, it.name);
            if (it.isDirectory()) walk(p, depth - 1);
            else if (it.isFile() && /chrome\.exe$/i.test(it.name)) candidates.push(p);
          }
        } catch {}
      };
      walk(puppeteerRoot, 4);
      const chromeExec = candidates.find(Boolean);
      if (chromeExec && !process.env.PUPPETEER_EXECUTABLE_PATH) {
        process.env.PUPPETEER_EXECUTABLE_PATH = chromeExec;
        process.env.CHROME_PATH = chromeExec;
        // Point cache dir to resources puppeteer folder to avoid writing to read-only asar
        process.env.PUPPETEER_CACHE_DIR = puppeteerRoot;
        console.log('Detected bundled Chrome executable:', chromeExec);
      }
    } catch (e) {
      console.warn('Failed to locate bundled Chrome executable:', e);
    }
    const userDataDir = app.getPath('userData');
    const chosenPort = Number(process.env.PORT) || (await findFreePort(3000));
    process.env.PORT = String(chosenPort);
    process.env.PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${chosenPort}`;
    process.env.STORAGE_URL = process.env.STORAGE_URL || process.env.PUBLIC_URL;
    process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'reactive-resume-offline-secret';
    // Ensure database and storage are placed under a writable user data directory
    process.env.ELECTRON_USER_DATA_DIR = userDataDir;
    // Set working directory to userData so relative paths resolve to a writable location
    try {
      process.chdir(userDataDir);
      console.log('Working directory changed to userData:', userDataDir);
    } catch (e) {
      console.warn('Failed to change working directory to userData:', e);
    }
    try {
      fs.mkdirSync(path.join(userDataDir, 'logs'), { recursive: true });
      // 先记录预期端口，后续若失败会在日志中体现
      fs.writeFileSync(path.join(userDataDir, 'backend-port.txt'), String(chosenPort));
    } catch {}
    // Prefer existing values if user provided; otherwise set sensible defaults relative to userData
    if (!process.env.DATABASE_URL) {
      // Prisma sqlite URL supports relative paths like file:./local-resume.db
      process.env.DATABASE_URL = 'file:./local-resume.db';
    }
    if (!process.env.STORAGE_DIR) {
      process.env.STORAGE_DIR = path.join(userDataDir, 'storage');
    }
    const baseDir = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked')
      : __dirname;
    const serverEntry = path.join(baseDir, 'dist', 'apps', 'server', 'main.js');
    console.log('Starting embedded server from:', serverEntry);
    // Ensure Node can resolve modules installed under app.asar/node_modules when executing
    // code from app.asar.unpacked (server bundle lives there)
    try {
      const Module = require('module');
      const asarNodeModules = path.join(process.resourcesPath, 'app.asar', 'node_modules');
      const unpackedNodeModules = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules');
      const prismaClientDirUnpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '.prisma', 'client');
      const prismaRootAsar = path.join(process.resourcesPath, 'app.asar', 'node_modules', '.prisma');
      const prismaRootUnpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '.prisma');
      const userNodeModules = path.join(userDataDir, 'node_modules');
      const userPrismaClientDir = path.join(userNodeModules, '.prisma', 'client');
      try { fs.mkdirSync(userNodeModules, { recursive: true }); } catch {}
      const currentNodePath = process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : [];
      const pathsToAdd = [asarNodeModules, unpackedNodeModules, prismaClientDirUnpacked, prismaRootAsar, prismaRootUnpacked, userNodeModules].filter((p) => !!p);
      const newNodePath = [...pathsToAdd, ...currentNodePath].join(path.delimiter);
      process.env.NODE_PATH = newNodePath;
      Module._initPaths();
      console.log('Extended NODE_PATH for module resolution:', process.env.NODE_PATH);

      // Provide Prisma engine locations explicitly to avoid asar path issues
      try {
        const enginesDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@prisma', 'engines');
        process.env.PRISMA_ENGINES_OVERRIDE = enginesDir;
        if (process.platform === 'win32') {
          process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(enginesDir, 'libquery_engine-windows.dll.node');
          process.env.PRISMA_SCHEMA_ENGINE_BINARY = path.join(enginesDir, 'schema-engine-windows.exe');
        } else if (process.platform === 'darwin') {
          const arch = process.arch === 'arm64' ? 'darwin-arm64' : 'darwin';
          process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(enginesDir, `libquery_engine-${arch}.dylib.node`);
          process.env.PRISMA_SCHEMA_ENGINE_BINARY = path.join(enginesDir, `schema-engine-${arch}`);
        } else {
          process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(enginesDir, 'libquery_engine-linux-musl.so.node');
          process.env.PRISMA_SCHEMA_ENGINE_BINARY = path.join(enginesDir, 'schema-engine-linux-musl');
        }
        console.log('Configured Prisma engines at', enginesDir);
      } catch (e) {
        console.warn('Failed to configure Prisma engine env vars:', e);
      }

      // Monkey-patch resolver to map @prisma/client to generated client and map relative '.prisma/...'
      const originalResolve = Module._resolveFilename;
      const originalLoad = Module._load;
      const generatedIndexUser = path.join(userPrismaClientDir, 'index.js');
      const generatedIndexUnpacked = path.join(unpackedNodeModules, '.prisma', 'client', 'index.js');
      // Hard override loader for '@prisma/client'
      Module._load = function(request, parent, isMain) {
        if (
          request === '@prisma/client' ||
          request.startsWith('@prisma/client/') ||
          (typeof request === 'string' && /@prisma[\\\/]client[\\\/]default\.js$/.test(request))
        ) {
          if (fs.existsSync(generatedIndexUser)) {
            console.log('Redirecting require(@prisma/client) to generated client in userData');
            return originalLoad.call(this, generatedIndexUser, parent, isMain);
          }
          if (fs.existsSync(generatedIndexUnpacked)) {
            console.log('Redirecting require(@prisma/client) to generated client in unpacked');
            return originalLoad.call(this, generatedIndexUnpacked, parent, isMain);
          }
        }
        return originalLoad.apply(this, arguments);
      };
      Module._resolveFilename = function(request, parent, isMain, options) {
        // Redirect @prisma/client to generated client inside unpacked node_modules
        if (
          request === '@prisma/client' ||
          (typeof request === 'string' && request.startsWith('@prisma/client/')) ||
          (typeof request === 'string' && /@prisma[\\\/]client[\\\/]default\.js$/.test(request))
        ) {
          if (fs.existsSync(generatedIndexUser)) return generatedIndexUser;
          if (fs.existsSync(generatedIndexUnpacked)) return generatedIndexUnpacked;
        }
        if (typeof request === 'string' && request.startsWith('.prisma/')) {
          // Normalize to index when default is requested to avoid stub thrower
          if (request.endsWith('/default')) {
            request = request.replace(/\/default$/, '/index');
          }
          const candidates = [
            path.join(userNodeModules, request),
            path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', request),
            path.join(process.resourcesPath, 'app.asar', 'node_modules', request),
          ];
          for (const base of candidates) {
            try {
              if (require('fs').existsSync(base + '.js')) return base + '.js';
              if (require('fs').existsSync(base)) return base;
            } catch {}
          }
        }
        return originalResolve.call(this, request, parent, isMain, options);
      };
    } catch (e) {
      console.warn('Failed to extend module resolution paths:', e);
    }

    // Generate Prisma client at runtime into app.asar.unpacked/node_modules/.prisma
    try {
      const bundledSchema = path.join(process.resourcesPath, 'prisma', 'schema.prisma');
      const prismaCli = path.join(process.resourcesPath, 'app.asar', 'node_modules', 'prisma', 'build', 'index.js');
      const userNodeModules = path.join(userDataDir, 'node_modules');
      if (fs.existsSync(prismaCli) && fs.existsSync(bundledSchema)) {
        console.log('Preparing Prisma schema for runtime generation...');
        const runtimeDir = path.join(userDataDir, '.reactive-prisma');
        const runtimeSchemaDir = path.join(runtimeDir, 'prisma');
        const userSchemaPath = path.join(runtimeSchemaDir, 'schema.prisma');
        const clientOutputDir = path.join(userNodeModules, '.prisma', 'client');
        fs.mkdirSync(path.dirname(clientOutputDir), { recursive: true });
        fs.mkdirSync(runtimeSchemaDir, { recursive: true });
        // Read original schema and force generator output to our controlled path
        const original = fs.readFileSync(bundledSchema, 'utf8');
        const patched = original.replace(
          /generator\s+client\s*\{[\s\S]*?\}/m,
          (block) => {
            const hasOutput = /\n\s*output\s*=/.test(block);
            const normalized = clientOutputDir.replace(/\\/g, '/');
            if (hasOutput) {
              return block.replace(/\n\s*output\s*=.*\n?/, `\n  output = \"${normalized}\"\n`);
            }
            return block.replace(/\}\s*$/, `  output = \"${normalized}\"\n}`);
          }
        );
        fs.writeFileSync(userSchemaPath, patched, 'utf8');
        console.log('Generating Prisma client at runtime to:', clientOutputDir);
        const { spawnSync } = require('child_process');
        const enginesDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@prisma', 'engines');
        const childEnv = {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          PRISMA_ENGINES_OVERRIDE: enginesDir,
        };
        const result = spawnSync(process.execPath, [prismaCli, 'generate', '--schema', userSchemaPath], {
          cwd: runtimeDir,
          env: childEnv,
          stdio: 'inherit',
        });
        console.log('Prisma generate exit code:', result.status);
        if (fs.existsSync(path.join(clientOutputDir, 'default.js')) || fs.existsSync(path.join(clientOutputDir, 'index.js'))) {
          console.log('Prisma client generated successfully at', clientOutputDir);
        } else {
          console.warn('Prisma client not found after generate at', clientOutputDir);
        }
      } else {
        console.warn('Prisma CLI or schema not found for runtime generate:', { prismaCli, bundledSchema });
      }
      // Ensure default.js does not contain the stub that throws. Replace with index wrapper if necessary.
      try {
        const defaultClientPath = path.join(userNodeModules, '.prisma', 'client', 'default.js');
        if (fs.existsSync(defaultClientPath)) {
          const content = fs.readFileSync(defaultClientPath, 'utf8');
          if (content.includes('did not initialize yet')) {
            fs.writeFileSync(defaultClientPath, "module.exports = require('./index')\n", 'utf8');
            console.log('Patched .prisma/client/default.js to forward to index.js');
          }
        }
      } catch (e) {
        console.warn('Failed to patch .prisma/client/default.js:', e);
      }
    } catch (e) {
      console.warn('Runtime Prisma generate failed:', e);
    }
    // Requiring the compiled server bundle bootstraps NestJS
    try {
      require(serverEntry);
    } catch (err) {
      try {
        const errLogPath = path.join(userDataDir, 'logs', 'embedded-server.log');
        const details = {
          when: new Date().toISOString(),
          serverEntry,
          node: process.versions.node,
          electron: process.versions.electron,
          resourcesPath: process.resourcesPath,
          cwd: process.cwd(),
          message: err && (err.stack || err.message || String(err)),
        };
        fs.appendFileSync(errLogPath, JSON.stringify(details, null, 2) + '\n', 'utf8');
      } catch {}
      throw err;
    }
    return { port: Number(process.env.PORT), publicUrl: process.env.PUBLIC_URL };
  } catch (error) {
    console.error('Failed to start embedded server:', error);
    try {
      const userDataDir = app.getPath('userData');
      const errLogPath = path.join(userDataDir, 'logs', 'embedded-server.log');
      const details = {
        when: new Date().toISOString(),
        phase: 'bootstrap',
        node: process.versions.node,
        electron: process.versions.electron,
        resourcesPath: process.resourcesPath,
        cwd: process.cwd(),
        message: error && (error.stack || error.message || String(error)),
      };
      fs.appendFileSync(errLogPath, JSON.stringify(details, null, 2) + '\n', 'utf8');
    } catch {}
  }
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
    // Production: 后端服务已在 app.whenReady 中启动。
    // 这里我们只需要轮询等待服务就绪，然后加载正确的 URL。
    const backendPort = Number(process.env.PORT) || 3000; // 端口应与后端启动时一致
    const prodUrl = `http://localhost:${backendPort}`;
    console.log(`Waiting for backend server to be ready at ${prodUrl}`);

    let attempts = 0;
    const maxAttempts = 60; // 等待最多 60 秒
    const http = require('http');

    const tryLoad = () => {
      attempts++;
      const req = http.request({ hostname: 'localhost', port: backendPort, path: '/', method: 'GET', timeout: 1000 }, () => {
        console.log('Backend server is ready, loading app URL.');
        mainWindow.loadURL(prodUrl);
      });

      req.on('error', (e) => {
        console.log(`Waiting for backend... attempt ${attempts}/${maxAttempts}. Error: ${e.message}`);
        if (attempts < maxAttempts) {
          setTimeout(tryLoad, 1000);
        } else {
          console.error(`Failed to connect to backend server at ${prodUrl} after ${maxAttempts} attempts.`);
          const logsPath = path.join(app.getPath('userData'), 'logs');
          const errorHtml = `<h2>Failed to start embedded server on port ${backendPort}</h2><p>Please check the logs at ${logsPath}</p><p>You can find backend.log and electron-main.log there.</p>`;
          mainWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(errorHtml));
        }
      });
      req.on('timeout', () => {
        req.destroy();
        if (attempts < maxAttempts) setTimeout(tryLoad, 1000);
      });
      req.end();
    };

    // 延迟一小段时间再开始探测，给子进程启动留出时间
    setTimeout(tryLoad, 1500);
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
app.whenReady().then(async () => {
  console.log('Electron application ready');
  console.log('Platform:', process.platform);
  console.log('Electron version:', process.versions.electron);
  console.log('Node version:', process.versions.node);

  if (isProd) {
    // 在生产环境下，首先设置必要的环境变量，然后启动后端子进程
    process.env.PORT = String(await findFreePort(3000));
    await startBackendProcess();
  }
  
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
  console.log('Application is quitting. Cleaning up backend process...');
  if (serverProcess) {
    console.log(`Killing backend process with PID: ${serverProcess.pid}`);
    serverProcess.kill('SIGTERM'); // 发送终止信号
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
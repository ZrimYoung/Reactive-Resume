const { app, BrowserWindow, Menu, screen, ipcMain, dialog, shell } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  findFreePort,
  backendEnvironment,
  waitForBackend,
  saveDownload,
} = require("./desktop-runtime");
const { createDraftStorage } = require("./electron/draft-storage.cjs");
const { attachCloseGuard } = require("./electron/close-guard.cjs");
if (process.env.REACTIVE_RESUME_DATA_DIR)
  app.setPath("userData", path.resolve(process.env.REACTIVE_RESUME_DATA_DIR));
const dataDir = app.getPath("userData");
const logsDir = path.join(dataDir, "logs");
fs.mkdirSync(logsDir, { recursive: true });
if (app.isPackaged) {
  const util = require("node:util");
  for (const level of ["log", "info", "warn", "error"]) {
    console[level] = (...args) => {
      try {
        fs.appendFileSync(
          path.join(logsDir, "electron-main.log"),
          `${new Date().toISOString()} ${level}: ${util.format(...args)}\n`,
        );
      } catch {}
    };
  }
}
let mainWindow;
let serverProcess;
let abortStartup;
let starting;
let closeGuard;
let stopping = false;
const resumeDrafts = createDraftStorage(path.join(dataDir, "resume-drafts"));
let startupState = { status: "正在启动", details: "", failed: false };
function updateStatus(status, details = "", failed = false) {
  startupState = { status, details, failed };
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send("startup-status", startupState);
}
function stopBackend() {
  abortStartup?.abort();
  const child = serverProcess;
  serverProcess = undefined;
  if (child && child.exitCode === null && child.pid) {
    if (process.platform === "win32")
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
        timeout: 5000,
      });
    else child.kill("SIGTERM");
  }
}
async function startApplication() {
  if (starting) return starting;
  starting = (async () => {
    stopBackend();
    abortStartup = new AbortController();
    await mainWindow.loadFile(path.join(__dirname, "loading.html"));
    updateStatus("正在准备本地数据");
    const port = await findFreePort();
    const instanceToken = randomUUID();
    const resources = process.resourcesPath;
    const entry = path.join(resources, "app.asar.unpacked", "dist", "apps", "server", "main.js");
    if (!fs.existsSync(entry)) throw new Error("程序文件不完整，请将整个程序目录重新解压后运行。");
    const env = backendEnvironment(resources, dataDir, port, instanceToken);
    const logStream = fs.createWriteStream(path.join(logsDir, "backend.log"), { flags: "a" });
    const child = spawn(process.execPath, [entry], {
      env,
      cwd: dataDir,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverProcess = child;
    child.stdout.pipe(logStream, { end: false });
    child.stderr.pipe(logStream, { end: false });
    child.once("error", (error) => {
      console.error("Backend process:", error);
      updateStatus("启动失败", error.message, true);
    });
    child.once("exit", (code) => {
      logStream.end();
      console.log("Backend exited:", code);
      if (!stopping && serverProcess === child && mainWindow && !mainWindow.isDestroyed()) {
        updateStatus("本地服务已停止", "请点击重试重新打开。", true);
        void mainWindow.loadFile(path.join(__dirname, "loading.html"));
      }
    });
    updateStatus("正在打开简历库");
    await waitForBackend({ port, instanceToken, child, signal: abortStartup.signal });
    await mainWindow.loadURL(`http://127.0.0.1:${port}`);
  })()
    .catch((error) => {
      console.error("Startup:", error);
      if (!stopping) updateStatus("启动失败", error.message, true);
    })
    .finally(() => {
      starting = undefined;
    });
  return starting;
}
async function createWindow() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1400, area.width),
    height: Math.min(900, area.height),
    minWidth: Math.min(800, area.width),
    minHeight: Math.min(600, area.height),
    title: "Reactive Resume",
    show: process.env.REACTIVE_RESUME_TEST_MODE !== "1",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  closeGuard = attachCloseGuard({
    window: mainWindow,
    ipcMain,
    dialog,
    commitClose: () => {
      stopping = true;
      stopBackend();
      mainWindow?.destroy();
      app.quit();
    },
  });
  mainWindow.webContents.on("will-prevent-unload", (event) => {
    if (closeGuard?.approved) event.preventDefault();
  });
  mainWindow.on("closed", () => {
    mainWindow = undefined;
    closeGuard = undefined;
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) =>
    console.error("Renderer exited:", details.reason),
  );
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "文件",
        submenu: [
          {
            label: "打开日志文件夹",
            click: () => {
              void shell.openPath(logsDir);
            },
          },
          { role: "quit", label: "退出" },
        ],
      },
      {
        label: "视图",
        submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { role: "togglefullscreen" }],
      },
    ]),
  );
  if (app.isPackaged) await startApplication();
  else
    await mainWindow.loadURL("http://localhost:5173").catch(async () => {
      await mainWindow.loadFile(path.join(__dirname, "loading.html"));
      updateStatus("开发服务未启动", "请先运行 pnpm dev。", true);
    });
}
const isMainRenderer = (event) => event.sender === mainWindow?.webContents;
ipcMain.on("resume-draft:write", (event, draft) => {
  event.returnValue = isMainRenderer(event)
    ? resumeDrafts.write(draft)
    : { ok: false, error: "Unknown application window" };
});
ipcMain.handle("resume-draft:read", (event, id) => {
  if (!isMainRenderer(event)) throw new Error("Unknown application window");
  return resumeDrafts.read(id);
});
ipcMain.handle("resume-draft:list", (event, id) => {
  if (!isMainRenderer(event)) throw new Error("Unknown application window");
  return resumeDrafts.list(id);
});
ipcMain.handle("resume-draft:remove", (event, id, token) => {
  if (!isMainRenderer(event)) throw new Error("Unknown application window");
  resumeDrafts.remove(id, token);
});
ipcMain.handle("startup-state", () => startupState);
ipcMain.handle("startup-retry", () => app.isPackaged && startApplication());
ipcMain.handle("open-logs", () => shell.openPath(logsDir));
ipcMain.handle("download-and-save", async (event, url, filename) => {
  const name = path.basename(filename);
  const extension = path.extname(name).slice(1);
  const { filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
    defaultPath: name,
    filters: extension ? [{ name: extension.toUpperCase(), extensions: [extension] }] : [],
  });
  if (!filePath) return { canceled: true };
  await saveDownload(url, filePath);
  return { canceled: false, filePath };
});
ipcMain.handle("open-json", async (event) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(
    BrowserWindow.fromWebContents(event.sender),
    { filters: [{ name: "JSON Resume", extensions: ["json"] }], properties: ["openFile"] },
  );
  if (canceled || !filePaths[0]) return { canceled: true };
  return { canceled: false, content: JSON.parse(await fs.promises.readFile(filePaths[0], "utf8")) };
});
ipcMain.handle("open-pdf", async (event) => {
  if (!isMainRenderer(event)) throw new Error("Unknown application window");
  const { canceled, filePaths } = await dialog.showOpenDialog(
    BrowserWindow.fromWebContents(event.sender),
    { filters: [{ name: "PDF Resume", extensions: ["pdf"] }], properties: ["openFile"] },
  );
  if (canceled || !filePaths[0]) return { canceled: true };
  const file = await fs.promises.open(filePaths[0], "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw new Error("PDF 文件不能超过 20 MB。");
    const bytes = await file.readFile();
    if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-")))
      throw new Error("所选文件不是有效的 PDF。");
    return { canceled: false, name: path.basename(filePaths[0]), bytes: Array.from(bytes) };
  } finally {
    await file.close();
  }
});
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app
    .whenReady()
    .then(createWindow)
    .catch((error) => {
      console.error(error);
      dialog.showErrorBox("Reactive Resume 启动失败", `${error.message}\n日志目录：${logsDir}`);
      app.quit();
    });
  app.on("activate", () => {
    if (!mainWindow) void createWindow();
  });
}
app.on("before-quit", (event) => {
  if (closeGuard?.ready && !closeGuard.approved) {
    event.preventDefault();
    void closeGuard.requestClose();
    return;
  }
  stopping = true;
  stopBackend();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

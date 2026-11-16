const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  // 下载 URL 内容并保存为文件
  downloadAndSave: (url, filename) => ipcRenderer.invoke("download-and-save", url, filename),
  // 打开 JSON 文件并返回内容
  openJson: () => ipcRenderer.invoke("open-json"),
  // 检查是否是 Electron 环境
  isElectron: true,
  startupState: () => ipcRenderer.invoke("startup-state"),
  retryStartup: () => ipcRenderer.invoke("startup-retry"),
  openLogs: () => ipcRenderer.invoke("open-logs"),
  onStartupStatus: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on("startup-status", handler);
    return () => ipcRenderer.removeListener("startup-status", handler);
  },
  writeResumeDraft: (draft) => ipcRenderer.sendSync("resume-draft:write", draft),
  readResumeDraft: (id) => ipcRenderer.invoke("resume-draft:read", id),
  listResumeDrafts: (id) => ipcRenderer.invoke("resume-draft:list", id),
  removeResumeDraft: (id, token) => ipcRenderer.invoke("resume-draft:remove", id, token),
  onBeforeClose: (handler) => {
    const listener = async (_event, requestId) => {
      let result = { saved: false, durable: false };
      try {
        result = await handler();
      } catch {}
      ipcRenderer.send("resume-save:close-result", requestId, result);
    };
    ipcRenderer.on("resume-save:before-close", listener);
    ipcRenderer.send("resume-save:ready");
    return () => ipcRenderer.removeListener("resume-save:before-close", listener);
  },
});

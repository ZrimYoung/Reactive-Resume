const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // 下载 URL 内容并保存为文件
  downloadAndSave: (url, filename) => ipcRenderer.invoke('download-and-save', url, filename),
  // 打开 JSON 文件并返回内容
  openJson: () => ipcRenderer.invoke('open-json'),
  // 检查是否是 Electron 环境
  isElectron: true,
});


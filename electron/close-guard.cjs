const { randomUUID } = require('node:crypto');

function attachCloseGuard({ window, ipcMain, dialog, commitClose, timeoutMs = 30_000 }) {
  const contents = window.webContents;
  let ready = false;
  let approved = false;
  let closing = null;
  let waiter;
  let promptInvalidated;
  let rendererGeneration = 0;
  const fromWindow = (event) => event.sender === contents;
  const onReady = (event) => { if (fromWindow(event)) ready = true; };
  const onResult = (event, requestId, result) => {
    if (!fromWindow(event) || !waiter || waiter.id !== requestId) return;
    waiter.resolve({ saved: result?.saved === true, durable: result?.durable === true });
  };
  ipcMain.on('resume-save:ready', onReady);
  ipcMain.on('resume-save:close-result', onResult);

  const invalidateRenderer = () => {
    ready = false;
    rendererGeneration++;
    waiter?.resolve({ invalidated: true });
    promptInvalidated?.();
  };
  // did-navigate only fires after a main-frame document commits. A navigation start
  // can still be cancelled by beforeunload, and must not disable the old editor's guard.
  contents.on('did-navigate', invalidateRenderer);
  contents.on('render-process-gone', invalidateRenderer);

  const check = () => new Promise((resolve) => {
    const id = randomUUID();
    let settled = false;
    const timer = setTimeout(() => finish({ saved: false, durable: false }), timeoutMs);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (waiter?.id === id) waiter = undefined;
      resolve(result);
    };
    waiter = { id, resolve: finish };
    try {
      contents.send('resume-save:before-close', id);
    } catch {
      // A renderer that disappears before send cannot acknowledge this request.
      invalidateRenderer();
    }
  });
  const confirmUnsaved = async (options) => {
    let invalidate;
    const invalidated = new Promise((resolve) => {
      invalidate = () => resolve({ invalidated: true });
    });
    promptInvalidated = invalidate;
    try {
      return await Promise.race([dialog.showMessageBox(window, options), invalidated]);
    } finally {
      if (promptInvalidated === invalidate) promptInvalidated = undefined;
    }
  };
  const requestClose = () => {
    if (closing) return closing;
    if (approved) return Promise.resolve(true);
    closing = (async () => {
      while (!window.isDestroyed()) {
        if (!ready) break;
        const generation = rendererGeneration;
        const state = await check();
        if (state.invalidated || generation !== rendererGeneration) continue;
        if (state.saved) break;
        const options = state.durable
          ? ['重试保存', '保留草稿并退出', '取消']
          : ['重试保存', '取消'];
        const choice = await confirmUnsaved({
          type: 'warning', title: '简历尚未保存', message: '尚未确认所有编辑已保存到数据库。',
          detail: state.durable
            ? '最新编辑已写入本机草稿。选择保留草稿并退出，可在下次打开简历时恢复。'
            : '尚未确认本机草稿已保存。请重试，或取消退出后导出 JSON 备份。',
          buttons: options, defaultId: 0, cancelId: options.length - 1, noLink: true,
        });
        if (choice.invalidated || generation !== rendererGeneration) continue;
        const { response } = choice;
        if (state.durable && response === 1) break;
        if (response !== 0) return false;
      }
      if (window.isDestroyed()) return true;
      approved = true;
      commitClose();
      return true;
    })().finally(() => { closing = null; });
    return closing;
  };
  window.on('close', (event) => {
    if (!ready || approved) return;
    event.preventDefault();
    void requestClose().catch(() => {});
  });
  window.once('closed', () => {
    ipcMain.removeListener('resume-save:ready', onReady);
    ipcMain.removeListener('resume-save:close-result', onResult);
    contents.removeListener('did-navigate', invalidateRenderer);
    contents.removeListener('render-process-gone', invalidateRenderer);
    invalidateRenderer();
  });
  return { requestClose, get ready() { return ready; }, get approved() { return approved; } };
}

module.exports = { attachCloseGuard };

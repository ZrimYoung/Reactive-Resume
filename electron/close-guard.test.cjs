const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { attachCloseGuard } = require('./close-guard.cjs');

function setup(states, choices = [], timeoutMs = 1000) {
  const ipcMain = new EventEmitter(), window = new EventEmitter();
  let closed = 0;
  let destroyed = false;
  const prompts = [];
  const requests = [];
  window.isDestroyed = () => destroyed;
  window.once('closed', () => { destroyed = true; });
  window.webContents = new EventEmitter();
  window.webContents.send = (_channel, id) => {
    requests.push(id);
    const state = states.shift();
    if (state) queueMicrotask(() => ipcMain.emit('resume-save:close-result', {sender:window.webContents}, id, state));
  };
  const guard = attachCloseGuard({window,ipcMain,timeoutMs,
    dialog:{showMessageBox: async (_window, options) => {prompts.push(options);return {response: choices.shift() ?? options.cancelId};}},
    commitClose: () => {closed++;},
  });
  ipcMain.emit('resume-save:ready', {sender:window.webContents});
  return {guard,prompts,window,ipcMain,requests,closed:()=>closed};
}
test('waits for the save acknowledgement and coalesces repeated close requests', async () => {
  const fixture = setup([{saved:true,durable:true}]);
  const first = fixture.guard.requestClose();
  assert.equal(first,fixture.guard.requestClose());
  assert.equal(await first,true);
  assert.equal(fixture.closed(),1);
  assert.equal(fixture.prompts.length,0);
});
test('permits keeping a durable recovery draft after saving fails', async () => {
  const fixture = setup([{saved:false,durable:true}],[1]);
  assert.equal(await fixture.guard.requestClose(),true);
  assert.equal(fixture.prompts[0].buttons[1],'保留草稿并退出');
  assert.equal(fixture.closed(),1);
});
test('never offers exit without a confirmed durable draft', async () => {
  const fixture = setup([{saved:false,durable:false}],[1]);
  assert.equal(await fixture.guard.requestClose(),false);
  assert.deepEqual(fixture.prompts[0].buttons,['重试保存','取消']);
  assert.equal(fixture.closed(),0);
});
test('retry rechecks saving and a missing renderer reply cancels safely', async () => {
  const retry = setup([{saved:false,durable:false},{saved:true,durable:true}],[0]);
  assert.equal(await retry.guard.requestClose(),true);
  const missing = setup([],[],5);
  assert.equal(await missing.guard.requestClose(),false);
  assert.equal(missing.closed(),0);
});

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
const beforeDeadline = (promise) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Close request remained stuck on the old renderer')), 100); }),
  ]).finally(() => clearTimeout(timer));
};

test('an editor replaced by the loading document no longer blocks the native window close', async (t) => {
  const fixture = setup([], [], 30_000);
  t.after(() => fixture.window.emit('closed'));
  fixture.window.webContents.emit('did-navigate', {}, 'file:///loading.html', 200, 'OK');
  assert.equal(fixture.guard.ready, false);
  let prevented = false;
  fixture.window.emit('close', { preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(await beforeDeadline(fixture.guard.requestClose()), true);
  assert.equal(fixture.requests.length, 0);
  assert.equal(fixture.prompts.length, 0);
  assert.equal(fixture.closed(), 1);
});

test('navigation starts, SPA changes and iframe navigation retain the current editor protection', async (t) => {
  const fixture = setup([{saved:false,durable:false}], [1]);
  t.after(() => fixture.window.emit('closed'));
  const contents = fixture.window.webContents;
  contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
  contents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', 'file:///loading.html', true);
  contents.emit('did-navigate-in-page', {}, 'http://localhost/builder/second', true);
  contents.emit('did-frame-navigate', {}, 'http://localhost/artboard/builder', 200, 'OK', false);
  assert.equal(fixture.guard.ready, true);
  assert.equal(await fixture.guard.requestClose(), false);
  assert.deepEqual(fixture.prompts[0].buttons, ['重试保存','取消']);
  assert.equal(fixture.closed(), 0);
});

test('a new editor announces readiness again and restores the durable-draft close protection', async (t) => {
  const fixture = setup([{saved:false,durable:false}], [1]);
  t.after(() => fixture.window.emit('closed'));
  fixture.window.webContents.emit('did-navigate', {}, 'file:///loading.html');
  fixture.ipcMain.emit('resume-save:ready', {sender:fixture.window.webContents});
  assert.equal(fixture.guard.ready, true);
  assert.equal(await fixture.guard.requestClose(), false);
  assert.equal(fixture.closed(), 0);
  assert.deepEqual(fixture.prompts[0].buttons, ['重试保存','取消']);
});

for (const event of ['did-navigate', 'render-process-gone']) {
  test(`${event} immediately releases an in-flight old renderer acknowledgement`, async (t) => {
    const fixture = setup([], [], 30_000);
    t.after(() => fixture.window.emit('closed'));
    const closing = fixture.guard.requestClose();
    assert.equal(fixture.requests.length, 1);
    fixture.window.webContents.emit(event, {});
    assert.equal(await beforeDeadline(closing), true);
    assert.equal(fixture.guard.ready, false);
    assert.equal(fixture.prompts.length, 0);
    assert.equal(fixture.closed(), 1);
  });
}

test('a crashed renderer does not leave the close guard ready', async (t) => {
  const fixture = setup([], [], 30_000);
  t.after(() => fixture.window.emit('closed'));
  fixture.window.webContents.emit('render-process-gone', {}, {reason:'crashed'});
  assert.equal(fixture.guard.ready, false);
  assert.equal(await beforeDeadline(fixture.guard.requestClose()), true);
  assert.equal(fixture.requests.length, 0);
});

test('an old reply cannot bypass protection if the replacement editor becomes ready while closing', async (t) => {
  const fixture = setup([], [], 30_000);
  t.after(() => fixture.window.emit('closed'));
  const closing = fixture.guard.requestClose();
  const oldId = fixture.requests[0];
  fixture.window.webContents.emit('did-navigate', {}, 'http://localhost/builder/second');
  fixture.ipcMain.emit('resume-save:ready', {sender:fixture.window.webContents});
  await nextTurn();
  assert.equal(fixture.requests.length, 2);
  const newId = fixture.requests[1];
  assert.notEqual(newId, oldId);
  fixture.ipcMain.emit('resume-save:close-result', {sender:fixture.window.webContents}, oldId, {saved:true,durable:true});
  assert.equal(fixture.closed(), 0);
  fixture.ipcMain.emit('resume-save:close-result', {sender:fixture.window.webContents}, newId, {saved:false,durable:false});
  assert.equal(await beforeDeadline(closing), false);
  assert.equal(fixture.closed(), 0);
  assert.deepEqual(fixture.prompts[0].buttons, ['重试保存','取消']);
});

test('navigation also releases an obsolete confirmation dialog and detaches lifecycle listeners on close', async (t) => {
  // Keep the native dialog pending while its associated renderer is replaced.
  const ipcMain = new EventEmitter(), window = new EventEmitter(), contents = new EventEmitter();
  let closed = 0;
  window.webContents = contents;
  window.isDestroyed = () => false;
  contents.send = (_channel, id) => queueMicrotask(() => ipcMain.emit(
    'resume-save:close-result', {sender:contents}, id, {saved:false,durable:false},
  ));
  const guard = attachCloseGuard({window,ipcMain,timeoutMs:30_000,
    dialog:{showMessageBox: () => new Promise(() => {})},commitClose:()=>{closed++;}});
  t.after(() => window.emit('closed'));
  ipcMain.emit('resume-save:ready', {sender:contents});
  const closing = guard.requestClose();
  await nextTurn();
  contents.emit('did-navigate', {}, 'file:///loading.html');
  assert.equal(await beforeDeadline(closing), true);
  assert.equal(closed, 1);
  window.emit('closed');
  assert.equal(contents.listenerCount('did-navigate'), 0);
  assert.equal(contents.listenerCount('render-process-gone'), 0);
  assert.equal(ipcMain.listenerCount('resume-save:ready'), 0);
  assert.equal(ipcMain.listenerCount('resume-save:close-result'), 0);
});

test('listener cleanup does not access a destroyed BrowserWindow webContents getter', () => {
  const fixture = setup([]);
  const contents = fixture.window.webContents;
  Object.defineProperty(fixture.window, 'webContents', {
    get() { throw new Error('Object has been destroyed'); },
  });
  assert.doesNotThrow(() => fixture.window.emit('closed'));
  assert.equal(contents.listenerCount('did-navigate'), 0);
  assert.equal(contents.listenerCount('render-process-gone'), 0);
  assert.equal(fixture.ipcMain.listenerCount('resume-save:ready'), 0);
});

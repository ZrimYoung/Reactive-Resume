const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function cp(src, dest) {
  if (fs.cp) {
    fs.cpSync(src, dest, { recursive: true });
  } else {
    // Node <16 fallback
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      ensureDir(dest);
      for (const name of fs.readdirSync(src)) cp(path.join(src, name), path.join(dest, name));
    } else {
      ensureDir(path.dirname(dest));
      fs.copyFileSync(src, dest);
    }
  }
}

function findChromeExecutable(candidates) {
  const match = process.platform === 'win32' ? /chrome\.exe$/i : /chrome(?:-?headless)?$/;
  for (const root of candidates) {
    if (!root || !exists(root)) continue;
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const it of items) {
        const p = path.join(dir, it.name);
        if (it.isDirectory()) stack.push(p);
        else if (it.isFile() && match.test(it.name)) return p;
      }
    }
  }
  return undefined;
}

function tryInstallTo(targetCache) {
  const env = { ...process.env, PUPPETEER_CACHE_DIR: targetCache };
  const commands = [
    { cmd: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: ['exec', 'puppeteer', 'install', 'chrome'] },
    { cmd: process.platform === 'win32' ? 'npx.cmd' : 'npx', args: ['-y', 'puppeteer', 'install', 'chrome'] },
  ];
  for (const { cmd, args } of commands) {
    const r = spawnSync(cmd, args, { stdio: 'inherit', env });
    if (r.status === 0) return true;
  }
  return false;
}

function main() {
  const repoCache = path.resolve(__dirname, 'cache');
  ensureDir(repoCache);

  // 1) 已经准备好则跳过
  const ready = findChromeExecutable([repoCache]);
  if (ready) {
    console.log('[puppeteer:prepare] 已存在缓存：', ready);
    return;
  }

  // 2) 从用户缓存复制到仓库
  const userCacheCandidates = [
    process.env.PUPPETEER_CACHE_DIR,
    path.join(os.homedir(), '.cache', 'puppeteer'),
    process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || '', 'puppeteer') : undefined,
  ].filter(Boolean);

  const chromeExec = findChromeExecutable(userCacheCandidates);
  if (chromeExec) {
    console.log('[puppeteer:prepare] 发现本机 Chrome：', chromeExec);
    // 复制 "chrome" 目录（包含各平台子目录）
    // 寻找直到目录名为 'chrome' 的上层目录
    let dir = path.dirname(chromeExec);
    while (dir && path.basename(dir).toLowerCase() !== 'chrome') dir = path.dirname(dir);
    const chromeRoot = dir && path.basename(dir).toLowerCase() === 'chrome' ? dir : path.join(path.dirname(path.dirname(chromeExec)), 'chrome');
    if (exists(chromeRoot)) {
      const dest = path.join(repoCache, 'chrome');
      console.log('[puppeteer:prepare] 正在复制到：', dest);
      cp(chromeRoot, dest);
      console.log('[puppeteer:prepare] 复制完成');
      return;
    }
  }

  // 3) 本机未找到，则尝试直接安装到仓库缓存
  console.log('[puppeteer:prepare] 未找到本机 Chrome，尝试在线安装...');
  const ok = tryInstallTo(repoCache);
  if (!ok) {
    console.error('[puppeteer:prepare] 安装失败');
    process.exit(1);
  }
}

main();



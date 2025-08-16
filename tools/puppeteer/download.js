// 确保以绝对路径下载并缓存 Chrome for Testing，避免相对路径导致的解压错误
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

function run() {
  const cacheDir = path.resolve(__dirname, 'cache');
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
  } catch {}

  const env = { ...process.env, PUPPETEER_CACHE_DIR: cacheDir };

  // 优先使用 pnpm exec，其次回退到 npx
  const tryCommands = [
    { cmd: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: ['exec', 'puppeteer', 'browsers', 'install', 'chrome'] },
    { cmd: process.platform === 'win32' ? 'npx.cmd' : 'npx', args: ['-y', 'puppeteer', 'browsers', 'install', 'chrome'] },
  ];

  for (const { cmd, args } of tryCommands) {
    const res = spawnSync(cmd, args, { stdio: 'inherit', env });
    if (res.status === 0) {
      console.log('[puppeteer:download] 完成，缓存目录：', cacheDir);
      return;
    }
  }

  console.error('[puppeteer:download] 失败：无法安装 Chrome');
  process.exit(1);
}

run();



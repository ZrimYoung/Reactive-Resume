const { spawnSync } = require('child_process');
const path = require('path');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    process.exit(r.status || 1);
  }
}

function main() {
  const action = process.argv[2] || 'build';
  // 1) 准备 Puppeteer 浏览器缓存（复制或在线安装到 repo）
  run(process.execPath, [path.join('tools', 'puppeteer', 'prepare.js')]);
  // 2) 执行 Nx build
  if (action === 'build') {
    const pnpmCmd = process.platform === 'win32' ? 'cmd' : (process.env.SHELL || 'sh');
    const pnpmArgs = process.platform === 'win32'
      ? ['/d', '/s', '/c', 'pnpm build']
      : ['-lc', 'pnpm build'];
    run(pnpmCmd, pnpmArgs);
    // 3) 复制 Prisma 生成客户端到 @prisma/client/.prisma 以避免 asar 丢失符号链接
    try {
      const src = path.join('node_modules', '.prisma', 'client');
      const dest = path.join('node_modules', '@prisma', 'client', '.prisma', 'client');
      const fs = require('fs');
      const fsp = fs.promises;
      function copyRecursiveSync(srcPath, destPath) {
        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
          fs.mkdirSync(destPath, { recursive: true });
          for (const name of fs.readdirSync(srcPath)) {
            copyRecursiveSync(path.join(srcPath, name), path.join(destPath, name));
          }
        } else {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(srcPath, destPath);
        }
      }
      if (fs.existsSync(src)) {
        copyRecursiveSync(src, dest);
        console.log('[prepack] Copied Prisma client to', dest);
      } else {
        console.warn('[prepack] Prisma client not found at', src);
      }
    } catch (e) {
      console.warn('[prepack] Failed to copy Prisma client into @prisma/client/.prisma:', e);
    }
  }
}

main();



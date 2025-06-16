#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 递归复制目录的辅助函数
function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    return;
  }
  
  // 创建目标目录
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const items = fs.readdirSync(src);
  
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const stat = fs.statSync(srcPath);
    
    if (stat.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 生成时间戳
const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
const outputDir = `dist-electron-${timestamp}`;

console.log(`Building Electron app to: ${outputDir}`);

// 读取package.json
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// 更新输出目录
packageJson.build.directories.output = outputDir;

// 写回package.json
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

try {
  // 运行构建
  console.log('Running prebuild...');
  execSync('pnpm prebuild', { stdio: 'inherit' });
  
  console.log('Running build...');
  execSync('pnpm build', { stdio: 'inherit' });
  
  console.log('Running electron-builder...');
  execSync('pnpm exec electron-builder --dir --publish=never', { stdio: 'inherit' });
  
  // 处理客户端文件 - 复制到构建包中
  console.log('Copying client files...');
  const clientSourcePath = path.join(__dirname, 'dist', 'apps', 'client');
  const clientTargetPath = path.join(__dirname, outputDir, 'win-unpacked', 'resources', 'app.asar.unpacked', 'dist', 'apps', 'client');
  
  if (fs.existsSync(clientSourcePath)) {
    copyRecursive(clientSourcePath, clientTargetPath);
    console.log('Client files copied successfully');
  } else {
    console.warn('Client files not found at expected location');
  }
  
  // 处理 .prisma 目录 - 手动复制到构建包中
  console.log('Copying .prisma directory...');
  const prismaSourcePath = path.join(__dirname, 'node_modules', '.pnpm', '@prisma+client@5.22.0_prisma@5.22.0', 'node_modules', '.prisma');
  const prismaTargetPath = path.join(__dirname, outputDir, 'win-unpacked', 'resources', 'app.asar.unpacked', 'node_modules', '.prisma');
  
  if (fs.existsSync(prismaSourcePath)) {
    // 递归复制 .prisma 目录
    copyRecursive(prismaSourcePath, prismaTargetPath);
    console.log('.prisma directory copied successfully');
  } else {
    console.warn('.prisma directory not found at expected location');
  }
  
  console.log(`Build completed successfully in: ${outputDir}`);
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
} 
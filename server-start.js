#!/usr/bin/env node

// 专门用于 Electron 生产环境的服务器启动脚本
// 解决 ESM 模块加载和路径问题

const path = require('path');
const fs = require('fs');

console.log('=== Server Startup Script (v2) ===');

// 所有路径和配置都通过 process.env 从 electron.js 传入
const serverMainPath = process.env.SERVER_MAIN_PATH;
const userDataPath = process.env.USER_DATA_PATH;
const storagePath = process.env.STORAGE_LOCAL_PATH;

console.log('Server main path:', serverMainPath);
console.log('User data path:', userDataPath);
console.log('Storage path:', storagePath);

if (!serverMainPath || !fs.existsSync(serverMainPath)) {
  console.error('FATAL: Server main file path not provided or not found.');
  process.exit(1);
}

// 确保存储目录存在
if (storagePath && !fs.existsSync(storagePath)) {
  try {
    fs.mkdirSync(storagePath, { recursive: true });
    console.log('Created storage directory.');
  } catch (error) {
    console.error('Failed to create storage directory:', error);
  }
}

// 启动服务器
try {
  console.log('Attempting to start server...');
  require(serverMainPath);
  console.log('Server required successfully. Waiting for it to initialize...');
} catch (error) {
  console.error('FATAL: Failed to require server main file:', error);
  if (userDataPath) {
    try {
      const logContent = JSON.stringify(error, Object.getOwnPropertyNames(error));
      fs.writeFileSync(path.join(userDataPath, 'server-start-error.log'), logContent);
    } catch (logError) {
      console.error('Failed to write error log:', logError);
    }
  }
  process.exit(1);
} 
@echo off
chcp 65001 >nul
echo ========================================
echo      Reactive Resume 桌面应用启动器
echo ========================================
echo.

echo 检查运行环境...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误: 未找到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误: 未找到 pnpm，请先安装 pnpm
    pause
    exit /b 1
)

echo ✓ Node.js 和 pnpm 已就绪
echo.

echo 检查端口占用情况...
netstat -aon | findstr :5173 >nul
if %errorlevel% equ 0 (
    echo ✓ 前端服务器已在端口 5173 运行
) else (
    echo ! 前端服务器未运行，将启动开发服务器...
)

netstat -aon | findstr :3000 >nul
if %errorlevel% equ 0 (
    echo ✓ 后端服务器已在端口 3000 运行
) else (
    echo ! 后端服务器未运行，将启动开发服务器...
)

echo.
echo 启动选项:
echo 1. 自动启动所有服务 (推荐)
echo 2. 仅启动 Electron (假设服务器已运行)
echo 3. 仅启动开发服务器
echo.
set /p choice="请选择 (1-3): "

if "%choice%"=="1" goto auto_start
if "%choice%"=="2" goto electron_only
if "%choice%"=="3" goto dev_only
goto auto_start

:auto_start
echo.
echo 正在启动完整应用...
echo 这将启动前端、后端服务器和 Electron 窗口
echo 请稍等...
pnpm run electron:dev
goto end

:electron_only
echo.
echo 正在启动 Electron 窗口...
pnpm run electron:simple
goto end

:dev_only
echo.
echo 正在启动开发服务器...
pnpm run dev
goto end

:end
echo.
echo 应用已关闭
pause 
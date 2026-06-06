@echo off
chcp 65001 >nul
echo ============================================
echo   AI 智能修图 - 安装依赖
echo ============================================
echo.

REM 检查 Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未检测到 Node.js，请先安装：https://nodejs.org
    pause
    exit /b 1
)

echo [1/3] Node.js 版本：
node --version
echo.

echo [2/3] 正在安装依赖（使用国内镜像加速）...
npm install --registry=https://registry.npmmirror.com

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [重试] 使用默认源安装...
    npm install
)

echo.
echo [3/3] 安装完成！
echo.
echo ============================================
echo   启动方式：npm start
echo   或运行：node server.js
echo   访问地址：http://localhost:3000
echo ============================================
echo.
echo   首次使用请先注册账号，赠送 8 次免费额度
echo.
pause

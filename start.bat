@echo off
chcp 65001 >nul 2>&1
title QS美图 - AI 智能修图

echo ====================================
echo   QS美图 - AI 智能修图
echo ====================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未检测到 Node.js
    echo 请先安装: https://nodejs.org
    pause
    exit /b 1
)

echo [1/2] 检查前端编译...
if not exist "frontend\dist\index.html" (
    echo   -> 未检测到编译产物，正在编译...
    call npm run build
    if %ERRORLEVEL% NEQ 0 (
        echo [错误] 编译失败
        pause
        exit /b 1
    )
    echo   -> 编译完成
) else (
    echo   -> 已就绪
)

echo [2/2] 启动服务...
echo.
echo 正在启动...
echo.
start "" "http://localhost:3000"
node server.js

pause
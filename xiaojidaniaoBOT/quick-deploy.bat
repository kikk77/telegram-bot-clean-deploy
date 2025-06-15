@echo off
chcp 65001 >nul
cls

echo 🤖 Telegram营销机器人 - 一键部署脚本
echo ==================================

REM 检查Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js 未安装，请先安装 Node.js
    pause
    exit /b 1
)

REM 检查npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ npm 未安装，请先安装 npm
    pause
    exit /b 1
)

REM 获取Bot Token
set /p BOT_TOKEN="📱 请输入你的Telegram Bot Token: "

if "%BOT_TOKEN%"=="" (
    echo ❌ Bot Token 不能为空
    pause
    exit /b 1
)

echo 📦 安装依赖...
call npm install

echo ⚙️ 设置环境变量...
set BOT_TOKEN=%BOT_TOKEN%

echo 🚀 启动机器人...
echo 管理后台地址: http://localhost:3000
echo 按 Ctrl+C 停止服务
echo.

call npm start

pause 
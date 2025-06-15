#!/bin/bash

# Telegram营销机器人启动脚本 (根目录版本)

# 检查Bot Token
if [ -z "$BOT_TOKEN" ]; then
    echo "❌ 错误: 请设置 BOT_TOKEN 环境变量"
    echo "使用方法: BOT_TOKEN=你的令牌 ./start-bot.sh"
    exit 1
fi

# 进入应用目录
cd xiaojidaniaoBOT

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 停止已运行的实例
echo "🔄 停止已运行的实例..."
pkill -f "node app.js" 2>/dev/null || true

# 等待进程完全停止
sleep 2

# 启动应用
echo "🚀 启动Telegram营销机器人..."
echo "📱 管理后台: http://localhost:3000/admin"
echo "🔧 Bot Token: ${BOT_TOKEN:0:10}..."
echo ""

# 启动应用
node app.js 
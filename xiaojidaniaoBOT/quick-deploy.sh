#!/bin/bash

echo "🤖 Telegram营销机器人 - 一键部署脚本"
echo "=================================="

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js"
    exit 1
fi

# 检查npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装，请先安装 npm"
    exit 1
fi

# 获取Bot Token
read -p "📱 请输入你的Telegram Bot Token: " BOT_TOKEN

if [ -z "$BOT_TOKEN" ]; then
    echo "❌ Bot Token 不能为空"
    exit 1
fi

echo "📦 安装依赖..."
npm install

echo "⚙️ 设置环境变量..."
export BOT_TOKEN="$BOT_TOKEN"

echo "🚀 启动机器人..."
echo "管理后台地址: http://localhost:3000"
echo "按 Ctrl+C 停止服务"
echo ""

npm start 
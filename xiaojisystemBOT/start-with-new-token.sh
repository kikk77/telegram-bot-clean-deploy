#!/bin/bash

# Telegram营销机器人 - 使用新Token启动脚本

echo "🤖 启动Telegram营销机器人 (新Token版本)"
echo "============================================"

# 设置新的Bot Token
export BOT_TOKEN="7638508464:AAH2iK0FBnjUk5HYB5F7qivyfkVc5tLd_zs"
export PORT=3000

# 进入项目目录
cd "$(dirname "$0")"

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
pkill -f "node.*app.js" 2>/dev/null || true
pkill -f "node.*efficientApp.js" 2>/dev/null || true

# 等待进程完全停止
sleep 2

echo "🚀 启动机器人..."
echo "📱 Bot Token: 7638508464:AAH..."
echo "🌐 管理后台: http://localhost:3000"
echo "📝 管理页面: http://localhost:3000/admin/admin-legacy.html"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""

# 启动应用 (使用高效版本)
node efficientApp.js 
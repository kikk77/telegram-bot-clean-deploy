#!/bin/bash

# Telegram Bot启动脚本
echo "🤖 启动Telegram营销机器人..."

# 设置环境变量
export NODE_ENV=development
export PORT=3001

# 检查BOT_TOKEN是否已设置
if [ -z "$BOT_TOKEN" ]; then
    echo "❌ 错误: BOT_TOKEN未设置"
    echo "使用方法: BOT_TOKEN=your_token ./start-bot.sh"
    exit 1
fi

# 从BOT_TOKEN中提取Bot用户名（需要通过API获取）
echo "🔍 检测Bot信息..."

# 设置Bot用户名（如果没有设置的话）
if [ -z "$BOT_USERNAME" ]; then
    echo "⚠️  BOT_USERNAME未设置，Bot部分功能可能受限"
    echo "💡 建议设置: export BOT_USERNAME=your_bot_username"
fi

# 显示配置信息
echo "📋 配置信息:"
echo "   环境: $NODE_ENV"
echo "   端口: $PORT"
echo "   Bot Token: ${BOT_TOKEN:0:10}..."
echo "   Bot 用户名: ${BOT_USERNAME:-'未设置'}"

# 启动应用
echo ""
echo "🚀 启动开发服务器..."
echo "📱 管理后台: http://localhost:$PORT/admin"
echo "🩺 健康检查: http://localhost:$PORT/health"
echo ""

# 启动Node.js应用
node app.js 
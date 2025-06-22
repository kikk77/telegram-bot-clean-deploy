#!/bin/bash

# 本地开发环境变量配置
# 注意：Railway部署时这些变量需要在Railway Variables中设置

# Telegram配置（本地测试用）
export BOT_TOKEN="8143755629:AAG38Qv-yuIw-hTsU6cAsfDw2w9QJeIRcr8"
export BOT_USERNAME="xiaoji_daniao_bot"
export GROUP_CHAT_ID=-1002793326688

# 基础配置
export NODE_ENV=development
export PORT=3000

echo "🚀 启动本地开发环境"
echo "📡 端口: $PORT"
echo "👥 群组ID: $GROUP_CHAT_ID"
echo "🤖 Bot用户名: $BOT_USERNAME"
echo "⚠️  如需真实Telegram功能，请修改BOT_TOKEN"
echo ""

# 启动应用
node app.js 
#!/bin/bash

# 本地开发环境变量配置
# 注意：Railway部署时这些变量需要在Railway Variables中设置

# ===========================================
# 🚀 Railway部署配置说明
# ===========================================
# 部署到Railway时，需要在Railway Variables中设置：
# BOT_TOKEN=your_production_bot_token
# BOT_USERNAME=xiaojisystembot  (生产Bot用户名)
# GROUP_CHAT_ID=your_production_group_id
# NODE_ENV=production
# PORT=3000
# ===========================================

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
echo ""
echo "💡 Railway部署提醒:"
echo "   1. 生产Bot: @xiaojisystembot"
echo "   2. 测试Bot: @xiaoji_daniao_bot (当前)"
echo "   3. 切换到生产环境时记得更新Railway Variables"
echo ""

# 启动应用
node app.js 
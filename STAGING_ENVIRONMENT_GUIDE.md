# Staging环境配置指南

## 🧪 Staging环境概览

Staging环境是用于测试的独立环境，完全隔离于生产环境，确保测试不会影响生产数据和服务。

## 📋 环境变量配置清单

### ✅ 必需配置的变量

在Railway Staging环境的Variables页面设置以下变量：

```bash
# 环境标识
NODE_ENV=staging

# Telegram Bot配置
BOT_TOKEN=你的测试Bot Token
BOT_USERNAME=xiaoji_daniao_bot
GROUP_CHAT_ID=-1002793326688

# 管理员密码
ADMIN_PASSWORD=你的管理员密码

# 端口配置（Railway自动设置）
PORT=3000
PORT_HEALTH=3001
```

### 🔧 配置检查清单

- [ ] NODE_ENV 设置为 "staging"
- [ ] BOT_TOKEN 使用测试Bot的Token（不是生产Bot）
- [ ] BOT_USERNAME 设置为测试Bot的用户名
- [ ] GROUP_CHAT_ID 设置为测试群组ID
- [ ] ADMIN_PASSWORD 设置独立的管理员密码
- [ ] 确保测试Bot已添加到测试群组
- [ ] 确保测试Bot拥有群组管理员权限

## 🗄️ 数据库隔离

### 数据库文件分离
- 生产环境：`marketing_bot.db`
- Staging环境：`marketing_bot_staging.db`
- 开发环境：`marketing_bot_dev.db`

### Volume配置
- 生产环境Volume：`telegram-bot-data`
- Staging环境Volume：`telegram-bot-staging-data`（推荐独立）

## 🌿 分支策略建议

### 选项1：独立分支（推荐）
```bash
# 创建staging专用分支
git checkout -b staging-branch
git push origin staging-branch
```

### 选项2：共享分支
- 可以使用同一个分支，但需要确保Volume独立
- 通过环境变量实现配置隔离

## 🚀 部署步骤

1. **创建Staging服务**
   - 在Railway中创建新的Service
   - 连接到staging分支（如果使用独立分支）

2. **配置环境变量**
   - 按照上述清单设置所有必需变量
   - 确保NODE_ENV=staging

3. **配置Volume**
   - 创建独立的Volume：`telegram-bot-staging-data`
   - 挂载路径：`/app/data`

4. **部署验证**
   - 检查健康检查：`/health`
   - 验证数据库文件：`marketing_bot_staging.db`
   - 测试Bot功能

## 🔍 环境差异

| 配置项 | Production | Staging | Development |
|--------|------------|---------|-------------|
| NODE_ENV | production | staging | development |
| 数据库文件 | marketing_bot.db | marketing_bot_staging.db | marketing_bot_dev.db |
| 测试模式 | 禁用 | 启用 | 启用 |
| 调试日志 | 禁用 | 启用 | 启用 |
| Bot Token | 生产Bot | 测试Bot | 测试Bot |
| Volume | telegram-bot-data | telegram-bot-staging-data | 本地目录 |

## ⚠️ 注意事项

1. **Bot隔离**：确保staging和production使用不同的Bot
2. **群组隔离**：建议使用不同的测试群组
3. **数据隔离**：staging和production数据完全独立
4. **权限隔离**：使用不同的管理员密码

## 🧩 测试流程

1. 在staging环境测试新功能
2. 验证数据库迁移
3. 确认Bot交互正常
4. 测试管理后台功能
5. 通过后部署到production

## 🛠️ 故障排查

### 常见问题
- Bot无响应：检查TOKEN和权限
- 数据库错误：检查Volume挂载
- 环境变量：确认NODE_ENV=staging
- 健康检查失败：检查端口配置

### 日志查看
```bash
# Railway CLI查看日志
railway logs --environment staging
``` 
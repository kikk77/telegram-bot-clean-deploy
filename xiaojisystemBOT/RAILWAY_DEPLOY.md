# Railway部署指南

## 部署步骤

### 1. 准备工作
确保你有以下信息：
- Telegram Bot Token（从 @BotFather 获取）
- 群组Chat ID（用于播报功能）

### 2. 在Railway上部署

1. 登录 [Railway.app](https://railway.app)
2. 点击 "New Project"
3. 选择 "Deploy from GitHub repo"
4. 选择你的项目仓库
5. Railway会自动检测到Dockerfile并开始构建

### 3. 设置环境变量

在Railway项目设置中添加以下环境变量：

```
BOT_TOKEN=你的机器人令牌
PORT=3000
GROUP_CHAT_ID=你的群组Chat_ID
NODE_ENV=production
```

### 4. 验证部署

部署完成后：
1. 检查日志确保应用正常启动
2. 访问 `https://你的域名.railway.app/health` 检查健康状态
3. 访问 `https://你的域名.railway.app/admin` 进入管理后台

### 5. 数据库说明

- 项目使用SQLite数据库
- 数据库文件存储在 `/app/data/marketing_bot.db`
- Railway会自动持久化存储
- 首次启动会自动创建所有必要的表

### 6. 监控

- Railway提供内置的日志监控
- 健康检查端点：`/health`
- 应用会自动重启（最多10次重试）

### 7. 故障排除

如果部署失败：
1. 检查环境变量是否正确设置
2. 查看Railway构建日志
3. 确保Bot Token有效
4. 检查群组Chat ID格式（应为负数）

## 文件说明

- `Dockerfile` - Docker容器配置
- `railway.toml` - Railway部署配置
- `.dockerignore` - Docker构建忽略文件
- `package.json` - 项目依赖和脚本 
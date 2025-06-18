# 极简Telegram营销机器人

严格按照 cursor_rules.cursorrules 设计的极简架构Telegram营销机器人。

## 特性

- ✅ **极简架构**: 5个核心文件，开箱即用
- ✅ **高并发**: 内存缓存 + 同步数据库操作
- ✅ **零配置**: Railway一键部署
- ✅ **定时发送**: 支持cron、时间点、间隔发送
- ✅ **关键词触发**: 自动回复带按钮消息
- ✅ **商家绑定**: `/bind <code>` 命令绑定
- ✅ **数据统计**: 完整交互日志记录

## 快速开始

1. **克隆项目**
```bash
git clone <repository>
cd simple-bot
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境变量**
```bash
cp env.example .env
# 编辑 .env 文件，填入你的 BOT_TOKEN
```

4. **启动服务**
```bash
npm start
```

5. **访问管理后台**
```
http://localhost:3000
```

## 项目结构

```
src/
├── app.js              # 主入口
├── bot.js              # Bot逻辑 + 定时任务  
├── admin.js            # 管理API
├── scheduler.js        # 定时和触发词
└── database.js         # SQLite操作
public/admin.html       # 管理后台
```

## 数据库设计

4张核心表：
- `merchants`: 商家信息
- `buttons`: 按钮配置  
- `auto_tasks`: 自动发送任务
- `interactions`: 用户交互日志

## 部署

### Railway部署
1. 连接GitHub仓库
2. 设置环境变量 `BOT_TOKEN`
3. 自动部署完成

### 其他平台
```bash
node src/app.js
```

## 使用说明

### 1. 创建商家
在管理后台创建商家，获得绑定码

### 2. 绑定账号
用户发送 `/bind <绑定码>` 绑定商家账号

### 3. 配置按钮
为商家添加按钮，设置点击后发送的私聊消息

### 4. 创建任务
- **定时发送**: 设置执行时间（09:00 或 每30分钟）
- **关键词触发**: 设置触发词（关键词1,关键词2）

## 环境变量

```
BOT_TOKEN=your_bot_token_here    # 必需
PORT=3000                        # 可选
ADMIN_PASSWORD=admin123          # 可选
```

## 技术栈

- Node.js + Express
- SQLite + better-sqlite3
- node-telegram-bot-api
- 纯JavaScript（无TypeScript）

## 性能特点

- 同步数据库操作
- 内存缓存所有数据
- setImmediate() 处理并发
- prepared statements
- 支持100+用户同时操作

## License

MIT 
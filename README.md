# Telegram群组营销机器人

极简的Telegram机器人，实现群友点击按钮联系商家功能。

## 核心功能

- 🤖 **自动响应**: 用户点击按钮自动跳转私聊并发送预设消息
- 🏪 **商家绑定**: 商家通过绑定码与机器人关联
- 🔘 **按钮管理**: 创建多个按钮，每个按钮关联不同商家
- 📊 **数据统计**: 记录按钮点击次数和用户交互数据
- 🌐 **管理后台**: Web界面管理所有功能

## 技术栈

- **运行时**: Node.js 
- **Bot库**: node-telegram-bot-api
- **数据库**: SQLite + better-sqlite3
- **前端**: 原生HTML/CSS/JavaScript
- **部署**: Railway一键部署

## 快速开始

### 1. 创建Telegram机器人

1. 找到 [@BotFather](https://t.me/BotFather)
2. 发送 `/newbot` 创建新机器人
3. 获取机器人Token (格式: `123456:ABC-DEF1234ghIkl...`)

### 2. 本地运行

```bash
# 克隆项目
git clone <项目地址>
cd telegram-marketing-bot

# 安装依赖
npm install

# 设置环境变量
export BOT_TOKEN="你的机器人Token"

# 启动服务
npm start
```

### 3. Railway部署 (推荐)

1. Fork此项目到你的GitHub
2. 登录 [Railway](https://railway.app)
3. 点击 "Deploy from GitHub repo"
4. 选择你的仓库
5. 设置环境变量:
   - `BOT_TOKEN`: 你的Telegram机器人Token
6. 点击Deploy

### 4. 使用说明

1. **访问管理后台**: `http://你的域名` 或 `http://localhost:3000`
2. **创建商家**: 在"商家管理"页面添加商家，获得绑定码
3. **商家绑定**: 商家私聊机器人发送 `/bind 绑定码`
4. **创建按钮**: 在"按钮管理"页面创建按钮并关联商家
5. **测试发送**: 在"测试发送"页面发送带按钮的消息到群组
6. **查看统计**: 在"数据统计"页面查看点击数据

## 使用流程

```
管理员创建商家 → 生成绑定码 → 商家使用/bind绑定
     ↓
管理员创建按钮 → 关联到已绑定商家 → 设置回复消息
     ↓  
发送带按钮消息到群组 → 用户点击按钮 → 自动跳转私聊
     ↓
机器人发送预设消息给用户 → 记录点击统计
```

## 项目结构

```
telegram-marketing-bot/
├── app.js           # 主程序 (Bot逻辑 + HTTP服务器 + 数据库)
├── admin.html       # 管理后台界面
├── package.json     # 项目配置
├── env.example      # 环境变量示例
└── README.md        # 说明文档
```

## 环境变量

- `BOT_TOKEN`: Telegram机器人Token (必需)
- `PORT`: Web服务端口 (默认: 3000)

## 常见问题

**Q: 如何获取群组ID?**
A: 将机器人添加到群组，发送消息时在日志中可以看到chat_id

**Q: 按钮点击没反应?**
A: 确保机器人已启动，检查callback_query处理逻辑

**Q: 如何添加更多功能?**
A: 这是MVP版本，专注核心功能。可基于此架构扩展

## 许可证

MIT License 
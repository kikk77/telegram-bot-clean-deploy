# 小鸡蛋鸟Telegram营销机器人

## 项目结构

```
kitelegrambot/
├── xiaojidaniaoBOT/          # 主要软件目录
│   ├── app.js               # 主应用文件
│   ├── package.json         # 依赖配置
│   ├── admin.html           # 管理后台
│   ├── marketing_bot.db     # 数据库文件
│   ├── config/              # 配置文件
│   ├── models/              # 数据模型
│   ├── services/            # 业务服务
│   ├── utils/               # 工具函数
│   ├── logs/                # 日志文件
│   ├── start.sh             # 启动脚本
│   ├── quick-deploy.sh      # 快速部署脚本
│   └── ecosystem.config.js  # PM2配置
├── docs/                    # 文档目录
│   ├── README.md            # 详细说明文档
│   ├── 商家绑定.md           # 商家绑定功能文档
│   ├── 开发prompt.md        # 开发提示文档
│   ├── deploy.md            # 部署说明文档
│   └── cursor_prompt.md     # Cursor提示文档
└── start-bot.sh             # 根目录启动脚本
```

## 快速启动

```bash
# 设置Bot Token并启动
BOT_TOKEN=你的机器人令牌 ./start-bot.sh
```

## 管理后台

启动后访问: http://localhost:3000/admin

## 详细文档

查看 `docs/` 目录中的详细文档。 
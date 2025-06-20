# 小鸡蛋鸟Telegram营销机器人

## 项目结构

```
kitelegrambot/
├── xiaojisystemBOT/          # 主要软件目录
│   ├── app.js               # 主应用文件
│   ├── package.json         # 依赖配置
│   ├── data/                # 数据库文件目录
│   ├── admin/               # 管理后台
│   │   ├── orders.html      # 订单管理页面
│   │   ├── admin-legacy.html # 传统管理界面
│   │   ├── scripts/         # 前端脚本
│   │   └── styles/          # 样式文件
│   ├── config/              # 配置文件
│   ├── models/              # 数据模型
│   ├── services/            # 业务服务
│   ├── utils/               # 工具函数
│   ├── deployment/          # 部署相关文件
│   ├── Dockerfile           # Docker容器配置
│   ├── railway.toml         # Railway部署配置
│   └── env.example          # 环境变量示例
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

## Railway部署

使用Dockerfile方式部署到Railway：

1. 在Railway中连接GitHub仓库
2. 设置环境变量：BOT_TOKEN、PORT、GROUP_CHAT_ID
3. Railway自动检测Dockerfile并构建部署

详细部署说明请查看 `xiaojisystemBOT/RAILWAY_DEPLOY.md`

## 管理后台

启动后访问: http://localhost:3000/admin

## 详细文档

查看 `docs/` 目录中的详细文档。 
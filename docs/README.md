# Telegram营销机器人系统

一个功能完整的Telegram群组营销机器人，支持商家绑定、触发词自动回复、定时发送、消息模板管理等功能。

## 项目结构

```
kitelegrambot/
├── app.js                    # 主应用入口文件
├── package.json              # 项目配置和依赖
├── admin.html               # 管理后台界面
├── config/
│   └── database.js          # 数据库配置和初始化
├── models/
│   └── dbOperations.js      # 数据库操作模块
├── services/
│   ├── botService.js        # Telegram Bot服务
│   ├── schedulerService.js  # 定时任务调度服务
│   └── httpService.js       # HTTP服务和API路由
└── utils/
    └── initData.js          # 初始化测试数据
```

## 功能模块

### 1. 数据库模块 (`config/database.js`)
- 数据库连接和表结构初始化
- 支持8张数据表：绑定码、地区、商家、按钮、消息模板、触发词、定时任务、交互日志

### 2. 数据操作模块 (`models/dbOperations.js`)
- 完整的CRUD操作
- 绑定码管理、地区管理、商家管理
- 按钮管理、消息模板管理
- 触发词管理、定时任务管理
- 交互日志和统计

### 3. Bot服务模块 (`services/botService.js`)
- Telegram Bot初始化和事件处理
- 5步商家绑定流程
- 触发词检测和自动回复
- 消息模板发送
- 按钮点击处理

### 4. 定时任务模块 (`services/schedulerService.js`)
- 基于node-cron的任务调度
- 支持每日、每周、自定义cron表达式
- 自动发送消息模板到指定群组

### 5. HTTP服务模块 (`services/httpService.js`)
- 管理后台静态文件服务
- 完整的REST API接口
- 支持所有功能的增删改查操作

### 6. 工具模块 (`utils/initData.js`)
- 初始化默认地区数据
- 创建测试绑定码
- 数据库初始化后的数据填充

## 核心功能

### 🔑 商家绑定系统
- 5步绑定流程：验证绑定码 → 输入姓名 → 选择地区 → 输入联系方式 → 完成绑定
- 支持绑定码管理和地区配置
- 完整的绑定状态跟踪

### 🎯 触发词系统
- 支持精确匹配和模糊匹配
- 5分钟防刷屏机制
- 自动回复消息模板

### ⏰ 定时发送
- 每日、每周、自定义cron调度
- 消息模板批量发送
- 执行状态跟踪

### 📝 消息模板
- 富文本内容支持
- 图片和按钮配置
- 实时预览功能

### 📊 管理后台
- 9个功能页面：仪表盘、绑定码、地区、商家、模板、触发词、定时任务、按钮、测试
- 响应式设计
- 实时数据统计

## 安装和运行

### 快速启动

1. **安装依赖**：
```bash
npm install
```

2. **配置环境变量**：
```bash
# 复制环境变量模板
cp env.example .env

# 编辑.env文件，设置你的Bot Token
# BOT_TOKEN=你的Telegram_Bot_Token
```

3. **启动应用**：

**方式一：直接启动**
```bash
BOT_TOKEN=你的Bot令牌 node app.js
```

**方式二：使用启动脚本**
```bash
BOT_TOKEN=你的Bot令牌 ./start.sh
```

**方式三：使用npm脚本**
```bash
export BOT_TOKEN=你的Bot令牌
npm start
```

4. **访问管理后台**：
```
http://localhost:3000/admin
```

### 生产环境部署

**使用PM2管理（推荐）**：
```bash
# 安装PM2
npm install -g pm2

# 设置环境变量
export BOT_TOKEN=你的Bot令牌

# 启动
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs telegram-marketing-bot

# 停止
pm2 stop telegram-marketing-bot

# 重启
pm2 restart telegram-marketing-bot

# 开机自启
pm2 startup
pm2 save
```

**后台运行**：
```bash
nohup BOT_TOKEN=你的Bot令牌 node app.js > bot.log 2>&1 &
```

### 常用命令

```bash
# 查看运行状态
npm run status

# 停止应用
npm run stop

# 重启应用
npm run restart

# 查看日志
npm run logs

# 或查看PM2日志
pm2 logs
```

## 技术栈

- **后端**: Node.js + Express风格HTTP服务
- **数据库**: SQLite + better-sqlite3
- **定时任务**: node-cron
- **Bot API**: node-telegram-bot-api
- **前端**: 原生HTML/CSS/JavaScript

## API接口

### 绑定码管理
- `GET /api/bind-codes` - 获取所有绑定码
- `POST /api/bind-codes` - 创建新绑定码
- `DELETE /api/bind-codes` - 删除绑定码

### 地区管理
- `GET /api/regions` - 获取所有地区
- `POST /api/regions` - 创建新地区
- `PUT /api/regions` - 更新地区
- `DELETE /api/regions` - 删除地区

### 商家管理
- `GET /api/merchants` - 获取所有商家
- `DELETE /api/merchants/:id` - 删除商家
- `POST /api/merchants/:id/reset` - 重置绑定状态

### 消息模板
- `GET /api/templates` - 获取所有模板
- `POST /api/templates` - 创建新模板
- `PUT /api/templates` - 更新模板
- `DELETE /api/templates` - 删除模板

### 触发词
- `GET /api/triggers` - 获取所有触发词
- `POST /api/triggers` - 创建新触发词
- `DELETE /api/triggers` - 删除触发词

### 定时任务
- `GET /api/tasks` - 获取所有任务
- `POST /api/tasks` - 创建新任务
- `DELETE /api/tasks` - 删除任务

### 统计数据
- `GET /api/stats` - 获取系统统计

## 数据库结构

### bind_codes (绑定码表)
- id, code, description, used, used_by, created_at, used_at

### regions (地区表)
- id, name, sort_order, active

### merchants (商家表)
- id, user_id, username, teacher_name, region_id, contact, bind_code, bind_step, bind_data, status, created_at

### buttons (按钮表)
- id, title, message, merchant_id, active, click_count, created_at

### message_templates (消息模板表)
- id, name, content, image_url, buttons_config, created_at

### trigger_words (触发词表)
- id, word, template_id, match_type, chat_id, active, trigger_count, last_triggered, created_at

### scheduled_tasks (定时任务表)
- id, name, template_id, chat_id, schedule_type, schedule_time, sequence_order, sequence_delay, active, next_run, last_run, created_at

### interactions (交互日志表)
- id, user_id, username, button_id, template_id, action_type, chat_id, timestamp

## 许可证

MIT License 
# 开发Telegram群组营销机器人 - 超轻量化方案

## 项目概述
创建一个极简的Telegram机器人，实现群友点击按钮联系商家的功能。

## 技术栈（已确定）
- **语言**: 纯JavaScript (不使用TypeScript)
- **运行时**: Node.js + Express
- **数据库**: SQLite + better-sqlite3 (同步操作，零配置)
- **Bot库**: node-telegram-bot-api
- **部署**: Railway (一键部署)

## 项目结构（超简化）
```
telegram-marketing-bot/
├── src/
│   ├── app.js              # 主入口文件
│   ├── bot.js              # 所有Telegram Bot逻辑 + 定时任务
│   ├── admin.js            # 管理后台API路由
│   ├── scheduler.js        # 定时发送和触发词处理
│   └── database.js         # SQLite数据库操作
├── public/
│   └── admin.html          # 单页面管理后台
├── package.json
├── railway.json            # Railway部署配置
└── .env.example
```

## 核心功能需求
1. **自动发送系统**: 
   - 机器人根据管理员设定的时间自动发送带按钮的消息到群组
   - 支持触发词响应：用户发送特定关键词时自动回复带按钮的消息
   - 机器人需要是群组管理员权限
2. **用户点击处理**: 用户点击按钮后自动跳转到机器人私聊，机器人发送管理员预设的内容给用户
3. **商家绑定**: 商家通过唯一code绑定到系统
4. **数据记录**: 记录所有用户交互（用户ID、用户名、点击时间、按钮ID、每个按钮的总点击次数）
5. **管理后台**: 网页界面管理定时发送、触发词、商家、按钮、查看统计数据

## 数据库设计（4张表）
```sql
-- 商家表
CREATE TABLE merchants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT,
    contact TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 按钮表
CREATE TABLE buttons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT,
    image_url TEXT,
    merchant_id INTEGER,
    active INTEGER DEFAULT 1,
    click_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (merchant_id) REFERENCES merchants (id)
);

-- 自动发送任务表
CREATE TABLE auto_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_type TEXT NOT NULL, -- 'schedule' 或 'trigger'
    chat_id INTEGER NOT NULL,
    content TEXT,
    buttons_config TEXT, -- JSON格式的按钮配置
    schedule_time TEXT, -- cron表达式或时间
    trigger_words TEXT, -- 触发词，多个用逗号分隔
    active INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 用户交互日志表
CREATE TABLE interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT,
    button_id INTEGER,
    action_type TEXT DEFAULT 'click',
    timestamp INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (button_id) REFERENCES buttons (id)
);
```

## 代码架构要求
1. **同步数据库操作**: 使用better-sqlite3的同步API，避免async/await复杂性
2. **内存缓存**: 商家和按钮数据启动时加载到内存，提高响应速度
3. **并发处理**: 使用setImmediate()处理并发点击，支持100人同时操作
4. **错误容错**: 简单的try-catch，继续运行不崩溃
5. **无隐私保护**: 直接记录和使用用户信息，无加密处理

## 核心业务流程
1. **初始化**: 启动时创建数据库表，加载商家、按钮和自动任务到内存
2. **商家绑定流程**: 
   - 管理员在后台生成绑定码
   - 商家发送 `/bind <code>` 给bot完成绑定
3. **自动发送流程**:
   - 定时任务：根据设定时间自动发送带按钮消息到群组
   - 触发词响应：监听群组消息，匹配关键词后自动回复
4. **按钮点击流程**:
   - 用户点击群组内按钮
   - bot异步处理：记录日志 + 跳转私聊 + 发送预设内容 + 更新点击计数
5. **管理后台**: 配置自动发送、管理商家按钮、查看统计数据

## 性能优化要求
- 商家、按钮数据全部缓存在内存中
- 使用SQLite的prepared statements
- 异步处理用户交互，不阻塞主线程
- 批量处理数据库写入操作

## 部署配置
- **环境变量**: 只需要 `BOT_TOKEN` 和 `ADMIN_PASSWORD`
- **Railway配置**: 自动检测Node.js项目，zero-config部署
- **数据库**: SQLite文件直接存储在应用目录

## 管理后台功能
- **自动发送管理**：设置定时发送任务和触发词响应
- **商家管理**：添加/编辑商家信息，生成绑定码
- **按钮管理**：创建/编辑按钮文案和关联商家
- **数据统计**：查看每个按钮点击次数、用户互动数据、时间趋势
- **群组管理**：手动测试发送带按钮的消息到指定群组

## 代码风格要求
- 使用ES6+语法但避免过度复杂
- 函数式编程，避免大量面向对象
- 直接、简洁的逻辑，不使用设计模式
- 最少的依赖包，核心功能自己实现

## 请立即开始创建
创建完整的项目代码，包括：
- 所有核心功能的JavaScript文件
- 定时任务和触发词响应系统
- SQLite数据库初始化
- HTML管理后台界面（支持配置自动发送）
- package.json和Railway部署配置
- 简单的README部署说明

要求代码可以直接运行，功能完整，支持定时发送和关键词触发，高效处理并发请求。
# Telegram营销机器人 - 完整功能开发

## 立即实现的功能模块

### 1. 触发词监听系统
- 在bot.js中添加群组消息监听，检测触发词并自动回复
- 支持精确匹配和模糊匹配两种模式
- 添加防刷屏机制（同一触发词5分钟内只响应一次）
- 数据库添加trigger_words表存储触发词配置

### 2. 消息模板管理系统
- 创建message_templates表存储消息模板（文字、图片、按钮配置）
- 实现消息模板的CRUD操作
- 支持富文本消息：纯文字、带图片、带按钮的组合消息
- 每个模板可配置多个触发词和多个按钮

### 3. 定时发送调度系统
- 创建scheduled_tasks表存储定时任务
- 实现cron风格的时间调度：每日、每周、自定义时间
- 支持顺序发送：多条消息按预设顺序和间隔时间依次发送
- 添加任务状态管理：启用/暂停/删除

### 4. 完整管理后台界面
在admin.html中添加以下页面：
- **消息模板管理页**: 创建/编辑消息模板，可视化按钮配置
- **触发词配置页**: 设置触发词与消息模板的关联关系
- **定时任务页**: 设置定时发送和顺序发送任务
- **数据统计页**: 显示触发次数、点击统计、时间趋势图
- **群组管理页**: 管理多个群组的不同营销策略

### 5. 数据库结构扩展
```sql
-- 消息模板表
CREATE TABLE message_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    buttons_config TEXT, -- JSON格式按钮配置
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 触发词表
CREATE TABLE trigger_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    template_id INTEGER,
    match_type TEXT DEFAULT 'exact', -- exact/contains
    chat_id INTEGER NOT NULL,
    active INTEGER DEFAULT 1,
    trigger_count INTEGER DEFAULT 0,
    last_triggered INTEGER DEFAULT 0,
    FOREIGN KEY (template_id) REFERENCES message_templates (id)
);

-- 定时任务表
CREATE TABLE scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    template_id INTEGER,
    chat_id INTEGER NOT NULL,
    schedule_type TEXT NOT NULL, -- once/daily/weekly/sequence
    schedule_time TEXT NOT NULL, -- cron表达式或时间
    sequence_order INTEGER DEFAULT 0,
    sequence_delay INTEGER DEFAULT 0, -- 顺序发送的间隔分钟
    active INTEGER DEFAULT 1,
    next_run INTEGER,
    last_run INTEGER,
    FOREIGN KEY (template_id) REFERENCES message_templates (id)
);
const Database = require('better-sqlite3');
const path = require('path');

// 初始化数据库
const dbPath = path.join(__dirname, '..', 'data', 'marketing_bot.db');
const db = new Database(dbPath);

// 创建数据库表
function initDatabase() {
    // 绑定码表
    db.exec(`
        CREATE TABLE IF NOT EXISTS bind_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            description TEXT,
            used INTEGER DEFAULT 0,
            used_by INTEGER,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            used_at INTEGER
        )
    `);

    // 地区配置表
    db.exec(`
        CREATE TABLE IF NOT EXISTS regions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1
        )
    `);

    // 商家表（扩展版本）
    db.exec(`
        CREATE TABLE IF NOT EXISTS merchants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE,
            username TEXT,
            teacher_name TEXT,
            region_id INTEGER,
            contact TEXT,
            bind_code TEXT,
            bind_step INTEGER DEFAULT 0,
            bind_data TEXT,
            status TEXT DEFAULT 'active',
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (region_id) REFERENCES regions (id)
        )
    `);

    // 检查并添加缺失的列
    try {
        db.exec(`ALTER TABLE merchants ADD COLUMN teacher_name TEXT`);
    } catch (e) { /* 列已存在 */ }
    
    try {
        db.exec(`ALTER TABLE merchants ADD COLUMN region_id INTEGER`);
    } catch (e) { /* 列已存在 */ }
    
    try {
        db.exec(`ALTER TABLE merchants ADD COLUMN bind_step INTEGER DEFAULT 0`);
    } catch (e) { /* 列已存在 */ }
    
    try {
        db.exec(`ALTER TABLE merchants ADD COLUMN bind_data TEXT`);
    } catch (e) { /* 列已存在 */ }
    
    try {
        db.exec(`ALTER TABLE merchants ADD COLUMN status TEXT DEFAULT 'active'`);
    } catch (e) { /* 列已存在 */ }

    // 添加信息模板相关字段
    try {
        db.exec(`ALTER TABLE merchants ADD COLUMN advantages TEXT`);
    } catch (e) { /* 列已存在 */ }
    
    try {
        db.exec(`ALTER TABLE merchants ADD COLUMN disadvantages TEXT`);
    } catch (e) { /* 列已存在 */ }
    
    try {
        db.exec(`ALTER TABLE merchants ADD COLUMN price1 INTEGER`);
    } catch (e) { /* 列已存在 */ }
    
    try {
        db.exec(`ALTER TABLE merchants ADD COLUMN price2 INTEGER`);
    } catch (e) { /* 列已存在 */ }
    
    try {
        db.exec(`ALTER TABLE merchants ADD COLUMN skill_wash TEXT`);
    } catch (e) { /* 列已存在 */ }
    
    try {
        db.exec(`ALTER TABLE merchants ADD COLUMN skill_blow TEXT`);
    } catch (e) { /* 列已存在 */ }
    
    try {
        db.exec(`ALTER TABLE merchants ADD COLUMN skill_do TEXT`);
    } catch (e) { /* 列已存在 */ }
    
    try {
        db.exec(`ALTER TABLE merchants ADD COLUMN skill_kiss TEXT`);
    } catch (e) { /* 列已存在 */ }

    // 按钮表
    db.exec(`
        CREATE TABLE IF NOT EXISTS buttons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            message TEXT,
            merchant_id INTEGER,
            active INTEGER DEFAULT 1,
            click_count INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (merchant_id) REFERENCES merchants (id)
        )
    `);

    // 消息模板表
    db.exec(`
        CREATE TABLE IF NOT EXISTS message_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            content TEXT NOT NULL,
            image_url TEXT,
            buttons_config TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    `);

    // 触发词表
    db.exec(`
        CREATE TABLE IF NOT EXISTS trigger_words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT NOT NULL,
            template_id INTEGER,
            match_type TEXT DEFAULT 'exact',
            chat_id INTEGER NOT NULL,
            active INTEGER DEFAULT 1,
            trigger_count INTEGER DEFAULT 0,
            last_triggered INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (template_id) REFERENCES message_templates (id)
        )
    `);

    // 定时任务表
    db.exec(`
        CREATE TABLE IF NOT EXISTS scheduled_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            template_id INTEGER,
            chat_id INTEGER NOT NULL,
            schedule_type TEXT NOT NULL,
            schedule_time TEXT NOT NULL,
            sequence_order INTEGER DEFAULT 0,
            sequence_delay INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            next_run INTEGER,
            last_run INTEGER,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (template_id) REFERENCES message_templates (id)
        )
    `);

    // 用户交互日志表
    db.exec(`
        CREATE TABLE IF NOT EXISTS interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            button_id INTEGER,
            template_id INTEGER,
            action_type TEXT DEFAULT 'click',
            chat_id INTEGER,
            timestamp INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (button_id) REFERENCES buttons (id),
            FOREIGN KEY (template_id) REFERENCES message_templates (id)
        )
    `);

    // 添加新字段到现有的interactions表
    try {
        db.exec(`ALTER TABLE interactions ADD COLUMN first_name TEXT`);
    } catch (e) { /* 列已存在 */ }
    
    try {
        db.exec(`ALTER TABLE interactions ADD COLUMN last_name TEXT`);
    } catch (e) { /* 列已存在 */ }

    // 预约状态跟踪表
    db.exec(`
        CREATE TABLE IF NOT EXISTS booking_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            merchant_id INTEGER NOT NULL,
            course_type TEXT NOT NULL,
            status TEXT DEFAULT 'notified',
            user_course_status TEXT DEFAULT 'pending',
            merchant_course_status TEXT DEFAULT 'pending',
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    `);

    // 添加新字段到现有的booking_sessions表
    try {
        db.exec(`ALTER TABLE booking_sessions ADD COLUMN user_course_status TEXT DEFAULT 'pending'`);
    } catch (e) { /* 列已存在 */ }
    
    try {
        db.exec(`ALTER TABLE booking_sessions ADD COLUMN merchant_course_status TEXT DEFAULT 'pending'`);
    } catch (e) { /* 列已存在 */ }

    // 评价表
    db.exec(`
        CREATE TABLE IF NOT EXISTS evaluations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            booking_session_id INTEGER NOT NULL,
            evaluator_type TEXT NOT NULL,
            evaluator_id INTEGER NOT NULL,
            target_id INTEGER NOT NULL,
            overall_score INTEGER,
            detailed_scores TEXT,
            comments TEXT,
            status TEXT DEFAULT 'pending',
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (booking_session_id) REFERENCES booking_sessions (id)
        )
    `);

    // 用户评价状态跟踪表
    db.exec(`
        CREATE TABLE IF NOT EXISTS evaluation_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            evaluation_id INTEGER NOT NULL,
            current_step TEXT DEFAULT 'start',
            temp_data TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (evaluation_id) REFERENCES evaluations (id)
        )
    `);

    // 订单管理表
    db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            booking_session_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            user_name TEXT NOT NULL,
            user_username TEXT,
            merchant_id INTEGER NOT NULL,
            teacher_name TEXT NOT NULL,
            teacher_contact TEXT,
            course_content TEXT NOT NULL,
            price TEXT,
            booking_time TEXT NOT NULL,
            status TEXT DEFAULT 'confirmed',
            user_evaluation TEXT,
            merchant_evaluation TEXT,
            report_content TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (booking_session_id) REFERENCES booking_sessions (id),
            FOREIGN KEY (user_id) REFERENCES merchants (user_id),
            FOREIGN KEY (merchant_id) REFERENCES merchants (id)
        )
    `);

    console.log('✅ 数据库初始化完成');
}

module.exports = {
    db,
    initDatabase
}; 
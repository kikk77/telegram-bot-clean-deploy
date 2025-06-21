const Database = require('better-sqlite3');
const path = require('path');

// 数据库路径配置 - 支持多环境和Railway Volume
const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const isStaging = nodeEnv === 'staging';
const isDeployment = isProduction || isStaging;

// 数据库文件名根据环境区分
const dbFileName = isStaging ? 'marketing_bot_staging.db' : 'marketing_bot.db';
const dataDir = isDeployment ? '/app/data' : path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, dbFileName);

console.log(`📊 数据库环境: ${nodeEnv}`);
console.log(`🏷️ 数据库文件: ${dbFileName}`);
console.log(`📂 数据库路径: ${dbPath}`);

// 确保data目录存在
const fs = require('fs');
if (!fs.existsSync(dataDir)) {
    console.log(`📁 创建数据目录: ${dataDir}`);
    fs.mkdirSync(dataDir, { recursive: true });
}

// 检查数据库是否已存在
const dbExists = fs.existsSync(dbPath);
console.log(`💾 数据库状态: ${dbExists ? '已存在' : '将创建新数据库'}`);

// 数据库性能优化配置
const db = new Database(dbPath, {
    fileMustExist: false
});

// 性能优化设置 - 添加错误处理
try {
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 1000');
db.pragma('temp_store = memory');
db.pragma('mmap_size = 268435456'); // 256MB
    console.log('✅ 数据库性能优化设置完成');
} catch (error) {
    console.warn('⚠️ 数据库性能优化设置失败，使用默认设置:', error.message);
}

// 内存缓存层
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存
const CACHE_CHECK_INTERVAL = 60 * 1000; // 每分钟清理一次过期缓存

// 缓存管理函数
function setCache(key, value, ttl = CACHE_TTL) {
    cache.set(key, {
        value,
        expires: Date.now() + ttl
    });
}

function getCache(key) {
    const item = cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expires) {
        cache.delete(key);
        return null;
    }
    
    return item.value;
}

function clearExpiredCache() {
    const now = Date.now();
    for (const [key, item] of cache.entries()) {
        if (now > item.expires) {
            cache.delete(key);
        }
    }
}

// 定期清理过期缓存
setInterval(clearExpiredCache, CACHE_CHECK_INTERVAL);

// 预编译语句缓存
const preparedStatements = new Map();

function getPreparedStatement(sql) {
    if (!preparedStatements.has(sql)) {
        preparedStatements.set(sql, db.prepare(sql));
    }
    return preparedStatements.get(sql);
}

// 创建数据库表
function initDatabase() {
    console.log('🔧 开始初始化数据库表结构...');
    
    // 检查数据库版本（用于数据迁移）
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS db_meta (
                key TEXT PRIMARY KEY,
                value TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);
        
        const currentVersion = db.prepare('SELECT value FROM db_meta WHERE key = ?').get('db_version')?.value || '1.0.0';
        console.log(`📋 当前数据库版本: ${currentVersion}`);
        
        // 记录数据库初始化信息
        const now = Math.floor(Date.now() / 1000);
        db.prepare('INSERT OR REPLACE INTO db_meta (key, value, updated_at) VALUES (?, ?, ?)').run('last_init', now.toString(), now);
        db.prepare('INSERT OR REPLACE INTO db_meta (key, value, updated_at) VALUES (?, ?, ?)').run('environment', nodeEnv, now);
        
        // 设置或更新数据库版本（不在这里强制更新，由迁移系统管理）
        const versionExists = db.prepare('SELECT COUNT(*) as count FROM db_meta WHERE key = ?').get('db_version').count > 0;
        if (!versionExists) {
            db.prepare('INSERT INTO db_meta (key, value) VALUES (?, ?)').run('db_version', '1.0.0');
            console.log('📋 初始化数据库版本为: 1.0.0');
        }
    } catch (error) {
        console.warn('⚠️ 数据库版本检查失败:', error.message);
    }
    
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
            FOREIGN KEY (merchant_id) REFERENCES merchants (id)
        )
    `);

    console.log('✅ 数据库表初始化完成');
    
    // 显示数据库统计信息
    try {
        const tableCount = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get().count;
        const dbSize = fs.statSync(dbPath).size;
        console.log(`📊 数据库统计: ${tableCount}个表, 文件大小: ${(dbSize / 1024).toFixed(1)}KB`);
    } catch (error) {
        console.warn('⚠️ 获取数据库统计信息失败:', error.message);
    }
}

// 调用初始化函数
initDatabase();

module.exports = {
    db,
    initDatabase,
    cache: {
        set: setCache,
        get: getCache,
        clear: () => cache.clear(),
        size: () => cache.size
    },
    getPreparedStatement
}; 
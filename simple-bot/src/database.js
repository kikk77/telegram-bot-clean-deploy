const Database = require('better-sqlite3');
const path = require('path');

class DatabaseManager {
    constructor() {
        this.db = new Database(path.join(__dirname, '../data.db'));
        this.cache = {
            merchants: new Map(),
            buttons: new Map(),
            autoTasks: new Map(),
            interactions: []
        };
        this.initTables();
        this.loadCache();
        this.prepareStatements();
    }

    initTables() {
        // 商家信息表
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS merchants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                bind_code TEXT UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 按钮配置表
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS buttons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                merchant_id INTEGER NOT NULL,
                text TEXT NOT NULL,
                url TEXT,
                private_msg TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (merchant_id) REFERENCES merchants (id)
            )
        `);

        // 自动发送任务表（定时+触发词）
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS auto_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                merchant_id INTEGER NOT NULL,
                type TEXT NOT NULL, -- 'schedule' 或 'trigger'
                content TEXT NOT NULL,
                schedule_time TEXT, -- cron表达式或时间
                trigger_words TEXT, -- 触发关键词，JSON数组
                target_chat TEXT, -- 目标群组
                buttons TEXT, -- 按钮配置，JSON
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (merchant_id) REFERENCES merchants (id)
            )
        `);

        // 用户交互日志表
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                username TEXT,
                action_type TEXT NOT NULL, -- 'button_click', 'private_msg', 'bind'
                data TEXT, -- JSON数据
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    prepareStatements() {
        this.statements = {
            insertMerchant: this.db.prepare(`
                INSERT INTO merchants (telegram_id, name, bind_code) 
                VALUES (?, ?, ?)
            `),
            insertButton: this.db.prepare(`
                INSERT INTO buttons (merchant_id, text, url, private_msg) 
                VALUES (?, ?, ?, ?)
            `),
            insertAutoTask: this.db.prepare(`
                INSERT INTO auto_tasks (merchant_id, type, content, schedule_time, trigger_words, target_chat, buttons, is_active) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `),
            insertInteraction: this.db.prepare(`
                INSERT INTO interactions (user_id, username, action_type, data) 
                VALUES (?, ?, ?, ?)
            `)
        };
    }

    loadCache() {
        // 加载商家数据
        const merchants = this.db.prepare('SELECT * FROM merchants').all();
        merchants.forEach(merchant => {
            this.cache.merchants.set(merchant.telegram_id, merchant);
        });

        // 加载按钮数据
        const buttons = this.db.prepare('SELECT * FROM buttons').all();
        buttons.forEach(button => {
            if (!this.cache.buttons.has(button.merchant_id)) {
                this.cache.buttons.set(button.merchant_id, []);
            }
            this.cache.buttons.get(button.merchant_id).push(button);
        });

        // 加载自动任务
        const tasks = this.db.prepare('SELECT * FROM auto_tasks WHERE is_active = 1').all();
        tasks.forEach(task => {
            this.cache.autoTasks.set(task.id, task);
        });

        console.log('缓存加载完成:', {
            merchants: this.cache.merchants.size,
            buttons: this.cache.buttons.size,
            autoTasks: this.cache.autoTasks.size
        });
    }

    // 商家操作
    addMerchant(telegramId, name, bindCode) {
        try {
            const result = this.statements.insertMerchant.run(telegramId, name, bindCode);
            const merchant = { id: result.lastInsertRowid, telegram_id: telegramId, name, bind_code: bindCode };
            this.cache.merchants.set(telegramId, merchant);
            return merchant;
        } catch (error) {
            console.error('添加商家失败:', error);
            return null;
        }
    }

    getMerchantByTelegramId(telegramId) {
        return this.cache.merchants.get(telegramId);
    }

    getMerchantByBindCode(bindCode) {
        for (const merchant of this.cache.merchants.values()) {
            if (merchant.bind_code === bindCode) {
                return merchant;
            }
        }
        return null;
    }

    // 按钮操作
    addButton(merchantId, text, url, privateMsg) {
        try {
            const result = this.statements.insertButton.run(merchantId, text, url, privateMsg);
            const button = { id: result.lastInsertRowid, merchant_id: merchantId, text, url, private_msg: privateMsg };
            
            if (!this.cache.buttons.has(merchantId)) {
                this.cache.buttons.set(merchantId, []);
            }
            this.cache.buttons.get(merchantId).push(button);
            return button;
        } catch (error) {
            console.error('添加按钮失败:', error);
            return null;
        }
    }

    getButtonsByMerchantId(merchantId) {
        return this.cache.buttons.get(merchantId) || [];
    }

    // 自动任务操作
    addAutoTask(merchantId, type, content, scheduleTime, triggerWords, targetChat, buttons) {
        try {
            const result = this.statements.insertAutoTask.run(
                merchantId, type, content, scheduleTime, 
                JSON.stringify(triggerWords), targetChat, JSON.stringify(buttons), 1
            );
            const task = {
                id: result.lastInsertRowid,
                merchant_id: merchantId,
                type, content, schedule_time: scheduleTime,
                trigger_words: triggerWords,
                target_chat: targetChat,
                buttons,
                is_active: 1
            };
            this.cache.autoTasks.set(task.id, task);
            return task;
        } catch (error) {
            console.error('添加自动任务失败:', error);
            return null;
        }
    }

    getAllActiveTasks() {
        return Array.from(this.cache.autoTasks.values());
    }

    getTasksByType(type) {
        return Array.from(this.cache.autoTasks.values()).filter(task => task.type === type);
    }

    // 交互日志
    logInteraction(userId, username, actionType, data) {
        setImmediate(() => {
            try {
                this.statements.insertInteraction.run(userId, username, actionType, JSON.stringify(data));
                this.cache.interactions.push({
                    user_id: userId,
                    username,
                    action_type: actionType,
                    data,
                    created_at: new Date().toISOString()
                });
                
                // 保持缓存大小，只保留最近1000条
                if (this.cache.interactions.length > 1000) {
                    this.cache.interactions = this.cache.interactions.slice(-1000);
                }
            } catch (error) {
                console.error('记录交互失败:', error);
            }
        });
    }

    getInteractionStats() {
        const stats = this.db.prepare(`
            SELECT action_type, COUNT(*) as count 
            FROM interactions 
            WHERE created_at > datetime('now', '-7 days') 
            GROUP BY action_type
        `).all();
        
        return stats.reduce((acc, stat) => {
            acc[stat.action_type] = stat.count;
            return acc;
        }, {});
    }
}

module.exports = new DatabaseManager(); 
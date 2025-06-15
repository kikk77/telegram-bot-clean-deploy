const TelegramBot = require('node-telegram-bot-api');
const Database = require('better-sqlite3');
const http = require('http');
const fs = require('fs');
const url = require('url');
const querystring = require('querystring');

// 环境变量
const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
    console.error('错误: 请设置 BOT_TOKEN 环境变量');
    process.exit(1);
}

// 初始化Telegram Bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 初始化数据库
const db = new Database('marketing_bot.db');

// 创建数据库表
function initDatabase() {
    // 商家表
    db.exec(`
        CREATE TABLE IF NOT EXISTS merchants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name TEXT,
            contact TEXT,
            user_id INTEGER,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    `);

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

    console.log('✅ 数据库初始化完成');
}

// 数据库操作函数
const dbOperations = {
    // 生成绑定码
    generateBindCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    },

    // 创建商家绑定码
    createMerchant(name, contact) {
        const code = this.generateBindCode();
        const stmt = db.prepare('INSERT INTO merchants (code, name, contact) VALUES (?, ?, ?)');
        const result = stmt.run(code, name, contact);
        return { id: result.lastInsertRowid, code };
    },

    // 绑定商家到用户
    bindMerchant(code, userId) {
        const stmt = db.prepare('UPDATE merchants SET user_id = ? WHERE code = ?');
        const result = stmt.run(userId, code);
        return result.changes > 0;
    },

    // 获取商家信息
    getMerchantByUserId(userId) {
        const stmt = db.prepare('SELECT * FROM merchants WHERE user_id = ?');
        return stmt.get(userId);
    },

    getMerchantByCode(code) {
        const stmt = db.prepare('SELECT * FROM merchants WHERE code = ?');
        return stmt.get(code);
    },

    getAllMerchants() {
        const stmt = db.prepare('SELECT * FROM merchants ORDER BY created_at DESC');
        return stmt.all();
    },

    // 按钮操作
    createButton(title, message, merchantId) {
        const stmt = db.prepare('INSERT INTO buttons (title, message, merchant_id) VALUES (?, ?, ?)');
        const result = stmt.run(title, message, merchantId);
        return result.lastInsertRowid;
    },

    getButtons() {
        const stmt = db.prepare(`
            SELECT b.*, m.name as merchant_name, m.contact as merchant_contact 
            FROM buttons b 
            LEFT JOIN merchants m ON b.merchant_id = m.id 
            WHERE b.active = 1 
            ORDER BY b.created_at DESC
        `);
        return stmt.all();
    },

    getButton(id) {
        const stmt = db.prepare('SELECT * FROM buttons WHERE id = ?');
        return stmt.get(id);
    },

    incrementButtonClick(buttonId) {
        const stmt = db.prepare('UPDATE buttons SET click_count = click_count + 1 WHERE id = ?');
        return stmt.run(buttonId);
    },

    deleteButton(id) {
        const stmt = db.prepare('DELETE FROM buttons WHERE id = ?');
        return stmt.run(id);
    }
};

// Bot消息处理
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    // 处理 /start 命令
    if (text === '/start') {
        bot.sendMessage(chatId, '🤖 欢迎使用营销机器人！\n\n如果您是商家，请使用 /bind <绑定码> 来绑定您的账户');
        return;
    }

    // 处理 /bind 命令
    if (text && text.startsWith('/bind ')) {
        const code = text.replace('/bind ', '').trim();
        
        if (dbOperations.bindMerchant(code, userId)) {
            bot.sendMessage(chatId, '✅ 绑定成功！您现在可以接收用户咨询了');
        } else {
            bot.sendMessage(chatId, '❌ 绑定失败，请检查绑定码是否正确');
        }
        return;
    }

    // 处理 /help 命令
    if (text === '/help') {
        bot.sendMessage(chatId, '📖 使用说明：\n\n/start - 开始使用\n/bind <绑定码> - 商家绑定账户\n/help - 查看帮助');
        return;
    }
});

// 处理按钮点击
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;
    const queryId = query.id;

    // 立即关闭查询（必须要做，否则用户界面会一直显示加载状态）
    bot.answerCallbackQuery(queryId);

    // 处理按钮点击
    if (data.startsWith('contact_')) {
        const buttonId = data.replace('contact_', '');
        
        // 异步处理点击逻辑，不阻塞响应
        setImmediate(() => {
            try {
                // 增加点击计数
                dbOperations.incrementButtonClick(buttonId);
                
                // 获取按钮信息
                const button = dbOperations.getButton(buttonId);
                if (!button) {
                    bot.sendMessage(userId, '❌ 按钮信息不存在');
                    return;
                }

                // 发送预设消息给用户
                const message = button.message || '您好！感谢您的咨询，我们会尽快回复您！';
                bot.sendMessage(userId, `📞 ${message}`).catch(error => {
                    console.log(`无法发送消息给用户 ${userId}: ${error.message}`);
                    // 如果无法发私信，给用户在群组里发提示
                    bot.answerCallbackQuery(queryId, {
                        text: '请先私聊机器人发送 /start 开启对话！',
                        show_alert: true
                    });
                });
                
                console.log(`用户 ${userId} 点击了按钮 ${buttonId}`);
            } catch (error) {
                console.error('处理按钮点击错误:', error);
            }
        });
    }
});

// HTTP服务器 - 管理后台
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
        res.end();
        return;
    }

    // 主页 - 管理界面
    if (pathname === '/' && method === 'GET') {
        fs.readFile('admin.html', 'utf8', (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('管理界面文件不存在');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
        return;
    }

    // API: 获取所有商家
    if (pathname === '/api/merchants' && method === 'GET') {
        const merchants = dbOperations.getAllMerchants();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(merchants));
        return;
    }

    // API: 创建商家
    if (pathname === '/api/merchants' && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const { name, contact } = JSON.parse(body);
                const result = dbOperations.createMerchant(name, contact);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(result));
            } catch (error) {
                res.writeHead(400);
                res.end('请求格式错误');
            }
        });
        return;
    }

    // API: 获取所有按钮
    if (pathname === '/api/buttons' && method === 'GET') {
        const buttons = dbOperations.getButtons();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(buttons));
        return;
    }

    // API: 创建按钮
    if (pathname === '/api/buttons' && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const { title, message, merchantId } = JSON.parse(body);
                const buttonId = dbOperations.createButton(title, message, merchantId);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ id: buttonId }));
            } catch (error) {
                res.writeHead(400);
                res.end('请求格式错误');
            }
        });
        return;
    }

    // API: 删除按钮
    if (pathname.startsWith('/api/buttons/') && method === 'DELETE') {
        const buttonId = pathname.split('/')[3];
        dbOperations.deleteButton(buttonId);
        res.writeHead(200);
        res.end('删除成功');
        return;
    }

    // API: 发送测试消息到群组
    if (pathname === '/api/test-message' && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const { chatId, message } = JSON.parse(body);
                
                // 获取所有激活的按钮
                const buttons = dbOperations.getButtons();
                
                if (buttons.length === 0) {
                    res.writeHead(400);
                    res.end('没有可用的按钮');
                    return;
                }

                // 创建内联键盘
                const keyboard = buttons.map(button => [{
                    text: button.title,
                    callback_data: `contact_${button.id}`
                }]);

                // 发送消息
                bot.sendMessage(chatId, message || '🎯 点击下方按钮联系商家', {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                }).then(() => {
                    res.writeHead(200);
                    res.end('发送成功');
                }).catch(error => {
                    res.writeHead(500);
                    res.end('发送失败: ' + error.message);
                });
            } catch (error) {
                res.writeHead(400);
                res.end('请求格式错误');
            }
        });
        return;
    }

    // 404
    res.writeHead(404);
    res.end('页面不存在');
});

// 启动服务
function start() {
    initDatabase();
    
    server.listen(PORT, () => {
        console.log(`🚀 服务器启动成功！`);
        console.log(`📱 Bot: @${bot.getMe().then(me => console.log(`   机器人用户名: @${me.username}`))}`);
        console.log(`🌐 管理后台: http://localhost:${PORT}`);
        console.log(`💾 数据库: marketing_bot.db`);
    });
}

// 错误处理
process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
});

// 启动应用
start(); 
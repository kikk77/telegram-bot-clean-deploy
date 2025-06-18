const TelegramBot = require('node-telegram-bot-api');
const db = require('./database');
const scheduler = require('./scheduler');

class TelegramBotManager {
    constructor() {
        this.bot = null;
        this.isRunning = false;
    }

    init(token) {
        try {
            this.bot = new TelegramBot(token, { polling: true });
            this.setupEventHandlers();
            this.isRunning = true;
            console.log('Bot初始化成功');
            return true;
        } catch (error) {
            console.error('Bot初始化失败:', error);
            return false;
        }
    }

    setupEventHandlers() {
        // 处理文本消息
        this.bot.on('message', (msg) => {
            setImmediate(() => this.handleMessage(msg));
        });

        // 处理按钮点击
        this.bot.on('callback_query', (query) => {
            setImmediate(() => this.handleCallbackQuery(query));
        });

        // 错误处理
        this.bot.on('error', (error) => {
            console.error('Bot错误:', error);
        });

        this.bot.on('polling_error', (error) => {
            console.error('轮询错误:', error);
        });
    }

    handleMessage(msg) {
        try {
            const chatId = msg.chat.id;
            const userId = msg.from.id.toString();
            const username = msg.from.username || msg.from.first_name;
            const text = msg.text;

            // 处理bind命令
            if (text && text.startsWith('/bind ')) {
                this.handleBindCommand(chatId, userId, username, text);
                return;
            }

            // 处理其他命令
            if (text && text.startsWith('/')) {
                this.handleCommand(chatId, userId, text);
                return;
            }

            // 检查触发词
            if (text) {
                this.checkTriggerWords(chatId, userId, username, text);
            }

        } catch (error) {
            console.error('处理消息失败:', error);
        }
    }

    handleBindCommand(chatId, userId, username, text) {
        const bindCode = text.replace('/bind ', '').trim();
        
        if (!bindCode) {
            this.bot.sendMessage(chatId, '请提供绑定码，格式：/bind <绑定码>');
            return;
        }

        const merchant = db.getMerchantByBindCode(bindCode);
        if (!merchant) {
            this.bot.sendMessage(chatId, '绑定码无效');
            return;
        }

        // 更新商家的telegram_id
        const existingMerchant = db.getMerchantByTelegramId(userId);
        if (existingMerchant) {
            this.bot.sendMessage(chatId, '您已经绑定过商家账号了');
            return;
        }

        // 简单更新，实际需要更新数据库
        db.cache.merchants.set(userId, { ...merchant, telegram_id: userId });
        
        db.logInteraction(userId, username, 'bind', { bind_code: bindCode, merchant_id: merchant.id });
        
        this.bot.sendMessage(chatId, `绑定成功！欢迎 ${merchant.name}`);
    }

    handleCommand(chatId, userId, text) {
        switch (text) {
            case '/start':
                this.bot.sendMessage(chatId, '欢迎使用营销机器人！\n\n使用 /bind <绑定码> 绑定您的商家账号');
                break;
            case '/help':
                this.bot.sendMessage(chatId, '命令列表：\n/start - 开始使用\n/bind <绑定码> - 绑定商家账号\n/help - 帮助信息');
                break;
            default:
                this.bot.sendMessage(chatId, '未知命令，使用 /help 查看可用命令');
        }
    }

    checkTriggerWords(chatId, userId, username, text) {
        const triggerTasks = db.getTasksByType('trigger');
        
        for (const task of triggerTasks) {
            try {
                const triggerWords = JSON.parse(task.trigger_words || '[]');
                
                for (const word of triggerWords) {
                    if (text.includes(word)) {
                        this.executeTriggerTask(chatId, task, userId, username, word);
                        break; // 只触发第一个匹配的
                    }
                }
            } catch (error) {
                console.error('检查触发词失败:', error);
            }
        }
    }

    executeTriggerTask(chatId, task, userId, username, triggerWord) {
        try {
            const buttons = JSON.parse(task.buttons || '[]');
            const inlineKeyboard = this.createInlineKeyboard(buttons);

            const options = inlineKeyboard.length > 0 ? {
                reply_markup: {
                    inline_keyboard: inlineKeyboard
                }
            } : {};

            this.bot.sendMessage(chatId, task.content, options);
            
            db.logInteraction(userId, username, 'trigger_response', {
                task_id: task.id,
                trigger_word: triggerWord,
                content: task.content
            });

        } catch (error) {
            console.error('执行触发任务失败:', error);
        }
    }

    handleCallbackQuery(query) {
        try {
            const userId = query.from.id.toString();
            const username = query.from.username || query.from.first_name;
            const data = JSON.parse(query.data);

            // 回应callback query
            this.bot.answerCallbackQuery(query.id);

            if (data.type === 'button_click') {
                this.handleButtonClick(userId, username, data);
            }

        } catch (error) {
            console.error('处理按钮点击失败:', error);
            this.bot.answerCallbackQuery(query.id, { text: '操作失败，请重试' });
        }
    }

    handleButtonClick(userId, username, data) {
        const { buttonId, url, privateMsg } = data;

        // 记录点击
        db.logInteraction(userId, username, 'button_click', { button_id: buttonId, url });

        // 发送私聊消息
        if (privateMsg) {
            this.bot.sendMessage(userId, privateMsg)
                .then(() => {
                    db.logInteraction(userId, username, 'private_msg', { 
                        button_id: buttonId, 
                        message: privateMsg 
                    });
                })
                .catch(error => {
                    console.error('发送私聊消息失败:', error);
                });
        }
    }

    createInlineKeyboard(buttons) {
        if (!Array.isArray(buttons) || buttons.length === 0) {
            return [];
        }

        return buttons.map(button => [{
            text: button.text,
            callback_data: JSON.stringify({
                type: 'button_click',
                buttonId: button.id,
                url: button.url,
                privateMsg: button.private_msg
            })
        }]);
    }

    // 发送定时消息
    sendScheduledMessage(chatId, content, buttons = []) {
        try {
            const inlineKeyboard = this.createInlineKeyboard(buttons);
            
            const options = inlineKeyboard.length > 0 ? {
                reply_markup: {
                    inline_keyboard: inlineKeyboard
                }
            } : {};

            return this.bot.sendMessage(chatId, content, options);
        } catch (error) {
            console.error('发送定时消息失败:', error);
            return false;
        }
    }

    // 获取Bot信息
    getBotInfo() {
        if (!this.bot) return null;
        
        return this.bot.getMe()
            .then(info => info)
            .catch(error => {
                console.error('获取Bot信息失败:', error);
                return null;
            });
    }

    // 停止Bot
    stop() {
        if (this.bot && this.isRunning) {
            this.bot.stopPolling();
            this.isRunning = false;
            console.log('Bot已停止');
        }
    }
}

module.exports = new TelegramBotManager(); 
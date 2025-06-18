require('dotenv').config();

const bot = require('./bot');
const admin = require('./admin');
const scheduler = require('./scheduler');
const db = require('./database');

class SimpleBot {
    constructor() {
        this.isRunning = false;
    }

    async start() {
        try {
            console.log('========== 极简Telegram营销机器人 ==========');
            console.log('正在启动...');

            // 检查环境变量
            const botToken = process.env.BOT_TOKEN;
            const adminPort = process.env.PORT || 3000;

            if (!botToken) {
                throw new Error('BOT_TOKEN环境变量未设置');
            }

            // 初始化数据库
            console.log('初始化数据库...');
            
            // 初始化Bot
            console.log('初始化Telegram Bot...');
            const botInitSuccess = bot.init(botToken);
            if (!botInitSuccess) {
                throw new Error('Bot初始化失败');
            }

            // 设置调度器的Bot实例
            scheduler.setBotInstance(bot);

            // 启动管理后台
            console.log('启动管理后台...');
            await admin.start(adminPort);

            this.isRunning = true;
            console.log('========== 启动完成 ==========');
            console.log(`Bot状态: ${bot.isRunning ? '运行中' : '停止'}`);
            console.log(`管理后台: http://localhost:${adminPort}`);
            console.log(`数据统计:`);
            console.log(`- 商家数量: ${db.cache.merchants.size}`);
            console.log(`- 按钮数量: ${Array.from(db.cache.buttons.values()).reduce((total, buttons) => total + buttons.length, 0)}`);
            console.log(`- 活动任务: ${db.cache.autoTasks.size}`);
            console.log('==========================================');

            // 设置优雅退出
            this.setupGracefulShutdown();

        } catch (error) {
            console.error('启动失败:', error);
            process.exit(1);
        }
    }

    setupGracefulShutdown() {
        const shutdown = (signal) => {
            console.log(`\n收到 ${signal} 信号，正在优雅退出...`);
            this.stop();
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        process.on('uncaughtException', (error) => {
            console.error('未捕获的异常:', error);
            this.stop();
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('未处理的Promise拒绝:', reason);
            console.error('Promise:', promise);
        });
    }

    stop() {
        if (!this.isRunning) return;

        console.log('正在停止服务...');
        
        // 停止定时器
        scheduler.clearAllTimers();
        
        // 停止Bot
        bot.stop();
        
        // 停止管理后台
        admin.stop();
        
        this.isRunning = false;
        console.log('服务已停止');
        process.exit(0);
    }

    // 获取系统状态
    getStatus() {
        return {
            isRunning: this.isRunning,
            bot: {
                isRunning: bot.isRunning
            },
            database: {
                merchants: db.cache.merchants.size,
                buttons: Array.from(db.cache.buttons.values()).reduce((total, buttons) => total + buttons.length, 0),
                autoTasks: db.cache.autoTasks.size,
                interactions: db.cache.interactions.length
            },
            scheduler: {
                activeTasks: scheduler.getActiveTasksStatus().length
            }
        };
    }
}

// 如果直接运行此文件，启动应用
if (require.main === module) {
    const app = new SimpleBot();
    app.start().catch(error => {
        console.error('应用启动失败:', error);
        process.exit(1);
    });
}

module.exports = SimpleBot; 
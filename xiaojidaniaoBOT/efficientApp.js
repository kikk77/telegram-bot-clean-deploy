// 加载环境变量
require('dotenv').config();

// 环境变量检查
const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
    console.error('错误: 请设置 BOT_TOKEN 环境变量');
    process.exit(1);
}

// 导入高效服务
const EfficientBotService = require('./services/efficientBotService');
const HttpService = require('./services/httpService');
const { initTestData } = require('./utils/initData');
const { initScheduler } = require('./services/schedulerService');
// statsService将在数据库初始化后延迟加载

// 全局服务实例
let botService = null;
let httpService = null;

// 设置Webhook
async function setupWebhook(bot) {
    try {
        // 开发环境使用本地webhook（需要ngrok或其他隧道工具）
        const webhookUrl = process.env.WEBHOOK_URL || `http://localhost:${PORT}/webhook`;
        
        console.log('🔗 设置Webhook:', webhookUrl);
        
        // 删除现有webhook（如果有）
        await bot.deleteWebHook();
        console.log('✅ 已删除旧webhook');
        
        // 设置新webhook
        await bot.setWebHook(webhookUrl, {
            allowed_updates: ['message', 'callback_query']
        });
        console.log('✅ Webhook设置成功');
        
    } catch (error) {
        console.error('❌ Webhook设置失败:', error);
        console.log('💡 如果在本地开发，请使用ngrok等工具暴露localhost:3000');
        console.log('💡 或者设置WEBHOOK_URL环境变量为公网可访问的URL');
    }
}

// 启动函数
async function start() {
    try {
        console.log('🚀 高效Telegram营销机器人启动中...');
        
        // 创建并初始化高效机器人服务
        botService = new EfficientBotService();
        await botService.initialize();
        
        // 数据库初始化完成后，加载统计服务
        console.log('📊 初始化统计服务...');
        const statsService = require('./services/statsService');
        
        // 创建并启动HTTP服务（包含优化的订单管理系统）
        httpService = new HttpService(PORT);
        httpService.start();
        
        // 设置全局引用供webhook使用
        global.botService = botService;
        
        // 设置webhook（替代polling）
        await setupWebhook(botService.bot);
        
        // 初始化测试数据（保持原有逻辑）- 暂时禁用以测试真实数据
        // initTestData();
        
        // 启动定时任务调度器（保持原有逻辑）
        initScheduler();
        
        console.log('✅ 高效营销机器人启动完成！');
        console.log('🎯 功能列表:');
        console.log('   - 商家绑定系统（原有逻辑）');
        console.log('   - 按钮点击跳转私聊（原有逻辑）');
        console.log('   - 触发词自动回复（原有逻辑）');
        console.log('   - 定时发送消息（原有逻辑）');
        console.log('   - 消息模板管理（原有逻辑）');
        console.log('   - 完整评价系统（原有逻辑）');
        console.log('   - 优化订单管理系统（新增）');
        console.log('   - 完整管理后台（原有逻辑）');
        console.log('🔧 架构特点:');
        console.log('   - 事件驱动，无轮询延迟');
        console.log('   - 符合官方文档标准');
        console.log('   - 模块化，易于维护');
        console.log('   - 保持所有原始业务逻辑');
        console.log('⚡ 性能优化:');
        console.log('   - 统计数据预计算和缓存');
        console.log('   - 图表懒加载和虚拟滚动');
        console.log('   - 数据库视图优化查询');
        console.log('   - 支持100并发用户');
        
    } catch (error) {
        console.error('❌ 高效机器人启动失败:', error);
        process.exit(1);
    }
}

// 优雅关闭
async function gracefulShutdown() {
    try {
        console.log('🛑 正在优雅关闭高效机器人...');
        
        if (botService) {
            await botService.stop();
        }
        
        if (httpService) {
            httpService.stop();
        }
        
        console.log('✅ 高效机器人已安全关闭');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ 关闭过程中出现错误:', error);
        process.exit(1);
    }
}

// 错误处理
process.on('uncaughtException', (error) => {
    console.error('💥 未捕获的异常:', error);
    gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 未处理的Promise拒绝:', reason);
    gracefulShutdown();
});

// 优雅关闭信号处理
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// 启动应用
start(); 
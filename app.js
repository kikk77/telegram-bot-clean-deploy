// 加载环境变量
require('dotenv').config();

// 环境变量检查
const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
    console.error('错误: 请设置 BOT_TOKEN 环境变量');
    process.exit(1);
}

// 导入模块
const { initDatabase } = require('./config/database');
const { initBasicData } = require('./utils/initData');
const { loadCacheData, initBotHandlers, bot } = require('./services/botService');
const { initScheduler } = require('./services/schedulerService');
const { createHttpServer } = require('./services/httpService');

// 启动函数
async function start() {
    console.log('🤖 Telegram营销机器人启动中...');
    
    // 初始化数据库
    initDatabase();
    
    // 初始化基础数据（仅地区配置）
    initBasicData();
    
    // 加载缓存数据
    await loadCacheData();
    
    // 初始化Bot事件监听
    initBotHandlers();
    
    // 设置全局Bot服务实例，供HTTP API使用
    global.botService = { bot };
    
    // 启动定时任务调度器
    initScheduler();
    
    // 启动HTTP服务器
    createHttpServer();
    
    console.log('✅ 所有服务启动完成！');
    console.log('🎯 功能列表:');
    console.log('   - 商家绑定系统');
    console.log('   - 按钮点击跳转私聊');
    console.log('   - 触发词自动回复');
    console.log('   - 定时发送消息');
    console.log('   - 消息模板管理');
    console.log('   - 完整管理后台');
}

// 错误处理
process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
});

// 启动应用
start().catch(error => {
    console.error('应用启动失败:', error);
    process.exit(1);
}); 
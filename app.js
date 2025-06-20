// 加载环境变量
require('dotenv').config();

// 导入环境配置
const { config, validateConfig, displayConfig } = require('./config/environment');

// 验证和显示配置
validateConfig();
displayConfig();

// 导入模块
const { initDatabase } = require('./config/database');
const { initBasicData } = require('./utils/initData');
const { loadCacheData, initBotHandlers, bot } = require('./services/botService');
const { initScheduler } = require('./services/schedulerService');
const { createHttpServer } = require('./services/httpService');

// 创建独立的健康检查服务
const http = require('http');
const PORT_HEALTH = process.env.PORT_HEALTH || 3001;

const healthServer = http.createServer((req, res) => {
    if (req.url === '/health') {
        console.log(`🩺 独立健康检查请求 - ${new Date().toISOString()}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development'
        }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// 启动函数
async function start() {
    console.log('🤖 Telegram营销机器人启动中...');
    
    // 启动健康检查服务
    healthServer.listen(PORT_HEALTH, () => {
        console.log(`🩺 健康检查服务启动在端口 ${PORT_HEALTH}`);
    });
    
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
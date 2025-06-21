#!/usr/bin/env node

// 本地开发启动脚本
console.log('🔧 启动本地开发环境...');

// 设置开发环境变量
process.env.NODE_ENV = 'development';
process.env.PORT = '3001';

// 检查是否有Bot配置
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function promptForBotConfig() {
    if (!process.env.BOT_TOKEN) {
        console.log('\n📋 请配置你的Telegram Bot信息:');
        
        const botToken = await new Promise(resolve => {
            rl.question('🤖 请输入BOT_TOKEN (从@BotFather获取): ', resolve);
        });
        
        const botUsername = await new Promise(resolve => {
            rl.question('📝 请输入BOT_USERNAME (不包含@符号): ', resolve);
        });
        
        const groupChatId = await new Promise(resolve => {
            rl.question('👥 请输入GROUP_CHAT_ID (可选，按Enter跳过): ', resolve);
        });
        
        // 设置环境变量
        process.env.BOT_TOKEN = botToken;
        process.env.BOT_USERNAME = botUsername;
        if (groupChatId) {
            process.env.GROUP_CHAT_ID = groupChatId;
        }
        
        console.log('\n✅ Bot配置完成！');
    }
    
    rl.close();
}

async function startApp() {
    try {
        await promptForBotConfig();
        
        console.log('\n🚀 启动开发服务器...');
        console.log(`📡 端口: ${process.env.PORT}`);
        console.log(`🤖 Bot: @${process.env.BOT_USERNAME}`);
        console.log(`🌐 管理后台: http://localhost:${process.env.PORT}/admin`);
        console.log('\n');
        
        // 启动主应用
        require('./app.js');
        
    } catch (error) {
        console.error('❌ 启动失败:', error);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    startApp();
} 
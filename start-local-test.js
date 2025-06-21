#!/usr/bin/env node

// 本地测试启动脚本
console.log('🧪 启动本地测试环境...');

console.log('');
console.log('📋 重要提示:');
console.log('   为了避免与Railway生产环境冲突，建议创建测试Bot');
console.log('   1. 打开 @BotFather');
console.log('   2. 发送 /newbot');
console.log('   3. 设置测试Bot名称 (如: 小鸡系统测试Bot)');
console.log('   4. 设置测试Bot用户名 (如: xiaojisystem_test_bot)');
console.log('   5. 获取测试Bot的Token');
console.log('   6. 使用测试Token启动本地环境');
console.log('');

// 检查是否设置了测试Bot Token
if (!process.env.BOT_TOKEN) {
    console.error('❌ 请设置测试Bot的BOT_TOKEN环境变量');
    console.log('💡 使用方法: export BOT_TOKEN="xiaoji_daniao_bot的token"');
    console.log('');
    console.log('🔄 或者一次性运行:');
    console.log('   BOT_TOKEN="xiaoji_daniao_bot的token" npm run test');
    console.log('');
    console.log('⚠️  如果一定要使用生产Bot测试，需要先停止Railway实例');
    process.exit(1);
}

// 设置本地测试环境变量
process.env.NODE_ENV = 'development';
process.env.BOT_USERNAME = 'xiaoji_daniao_bot';  // 使用测试Bot
process.env.PORT = '3000';

console.log('📋 本地测试配置:');
console.log(`   环境: ${process.env.NODE_ENV}`);
console.log(`   Bot用户名: ${process.env.BOT_USERNAME}`);
console.log(`   端口: ${process.env.PORT}`);
console.log(`   Bot Token: ${process.env.BOT_TOKEN ? process.env.BOT_TOKEN.substring(0, 10) + '...' : '未设置'}`);

console.log('');
console.log('✅ 测试环境优势:');
console.log('   1. Railway生产环境(xiaojisystembot)继续正常服务用户');
console.log('   2. 本地测试环境(xiaoji_daniao_bot)独立测试功能');
console.log('   3. 两个Bot完全独立，不会相互冲突');
console.log('   4. 测试完成后无需停止Railway，直接关闭本地即可');
console.log('');

console.log('🚀 启动测试环境...');

// 启动应用
require('./app.js'); 
/**
 * 多环境配置管理
 * 支持 development, staging, production 环境
 */

// 优先读取NODE_ENV，如果没有则读取Railway环境名称，最后默认为development
const nodeEnv = process.env.NODE_ENV || process.env.RAILWAY_ENVIRONMENT_NAME || 'development';

// 基础配置
const baseConfig = {
    // HTTP服务端口
    port: process.env.PORT || 3000,
    
    // Telegram配置
    botToken: process.env.BOT_TOKEN,
    botUsername: process.env.BOT_USERNAME,
    groupChatId: process.env.GROUP_CHAT_ID,
    
    // 日志级别
    logLevel: process.env.LOG_LEVEL || 'info',
    
    // 健康检查
    healthCheckPath: '/health'
};

// 环境特定配置
const environmentConfigs = {
    development: {
        ...baseConfig,
        port: 3000,
        logLevel: 'debug',
        environment: 'development',
        dbFileName: 'marketing_bot_dev.db',
        features: {
            enableDebugLogs: true,
            enableTestMode: true,
            skipValidation: false
        }
    },
    
    staging: {
        ...baseConfig,
        port: process.env.PORT || 3001,
        logLevel: 'info',
        environment: 'staging',
        dbFileName: 'marketing_bot_staging.db',
        features: {
            enableDebugLogs: true,
            enableTestMode: true,  // staging环境启用测试模式
            skipValidation: false
        }
    },
    
    production: {
        ...baseConfig,
        port: 3000,
        logLevel: 'warn',
        environment: 'production',
        dbFileName: 'marketing_bot.db',
        features: {
            enableDebugLogs: false,
            enableTestMode: false,
            skipValidation: false
        }
    }
};

// 获取当前环境配置
const config = environmentConfigs[nodeEnv] || environmentConfigs.development;

// 日志级别配置
const logLevel = nodeEnv === 'production' ? 'error' : 'debug';

// 日志输出函数
const logger = {
    debug: (...args) => {
        if (logLevel === 'debug') {
            console.log(...args);
        }
    },
    info: (...args) => {
        if (['debug', 'info'].includes(logLevel)) {
            console.log(...args);
        }
    },
    warn: (...args) => {
        if (['debug', 'info', 'warn'].includes(logLevel)) {
            console.warn(...args);
        }
    },
    error: (...args) => {
        console.error(...args);
    }
};

// 验证必需的环境变量
function validateConfig() {
    const requiredVars = ['BOT_TOKEN', 'BOT_USERNAME'];
    const missing = requiredVars.filter(varName => !process.env[varName] || process.env[varName] === 'your_local_bot_token_here' || process.env[varName] === 'your_local_bot_username_here');
    
    if (missing.length > 0) {
        if (nodeEnv === 'production') {
            console.warn(`⚠️ 生产环境缺少必需的环境变量: ${missing.join(', ')}`);
            console.warn(`🔧 请在Railway Variables中设置这些环境变量:`);
            console.warn(`   - BOT_TOKEN: 从@BotFather获取的Bot Token`);
            console.warn(`   - BOT_USERNAME: Bot的用户名（不含@符号）`);
            console.warn(`   - GROUP_CHAT_ID: 播报群组的Chat ID`);
            console.warn(`💡 应用将以最小化模式启动，仅提供健康检查和管理后台`);
            return false; // 返回false表示验证失败，但不抛出错误
        } else {
            console.warn(`⚠️ 本地开发环境中部分环境变量未配置: ${missing.join(', ')}`);
            console.warn(`💡 Telegram功能将使用测试模式`);
            console.warn(`🔧 如需真实功能，请修改 start-with-env.sh 中的配置`);
        }
    }
    return true; // 返回true表示验证通过
}

// 显示当前配置
function displayConfig() {
    logger.info('\n🔧 当前环境配置:');
    logger.info(`📊 环境: ${config.environment}`);
    logger.info(`🌐 端口: ${config.port}`);
    logger.info(`📝 日志级别: ${config.logLevel}`);
    logger.info(`💾 数据库文件: ${config.dbFileName}`);
    logger.info(`🤖 Bot用户名: ${config.botUsername || '未配置'}`);
    logger.info(`👥 群组ID: ${config.groupChatId || '未配置'}`);
    
    if (config.features.enableTestMode) {
        logger.info('🧪 测试模式已启用');
    }
    
    if (config.features.enableDebugLogs) {
        logger.info('🐛 调试日志已启用');
    }
    
    logger.info('');
}

// 获取特定功能配置
function getFeature(featureName) {
    return config.features[featureName] || false;
}

// 是否为部署环境
function isDeployment() {
    return nodeEnv === 'staging' || nodeEnv === 'production';
}

// 是否为生产环境
function isProduction() {
    return nodeEnv === 'production';
}

// 是否为测试环境
function isStaging() {
    return nodeEnv === 'staging';
}

// 是否为开发环境
function isDevelopment() {
    return nodeEnv === 'development';
}

// 启动完整应用服务
async function startApp() {
    console.log('🤖 Telegram营销机器人启动中...');
    
    try {
        // 检查环境变量但不强制要求全部配置
        const hasRequiredVars = validateConfig();
        
        displayConfig();
        
        // 导入数据库（数据库在require时自动初始化）
        const { db } = require('./database');
        const { initBasicData } = require('../utils/initData');
        
        // 数据库已在导入时自动初始化
        console.log('✅ 数据库连接已建立');
        
        // 初始化基础数据（仅地区配置）
        initBasicData();
        
        // HTTP服务器已在app.js中启动，这里不需要重复创建
        console.log('🌐 HTTP服务器使用app.js中的实例');
        
        console.log('✅ 基础服务初始化完成！');
        console.log('🎯 基础服务状态:');
        console.log('   - HTTP服务器: 运行中');
        console.log('   - 管理后台: 可用 (/admin)');
        console.log('   - API接口: 可用 (/api/*)');
        console.log('   - 健康检查: 可用 (/health)');
        console.log('   - 数据库: 已初始化');
        
        // 运行数据库迁移和数据一致性检查（生产环境必须执行）
        if (isDeployment()) {
            try {
                console.log('🔄 执行数据库迁移和一致性检查...');
                
                // 使用现有的云数据管理器
                const CloudDataManager = require('../utils/cloudDataManager');
                const cloudManager = new CloudDataManager();
                
                // 执行健康检查
                const healthCheck = await cloudManager.healthCheck();
                if (healthCheck.issues.length > 0) {
                    console.warn('⚠️ 发现数据库问题，但服务将继续运行');
                    healthCheck.issues.forEach(issue => console.warn(`  - ${issue}`));
                }
                
                // 创建数据快照（用于监控）
                await cloudManager.createDataSnapshot();
                
                console.log('✅ 数据库迁移和一致性检查完成');
            } catch (error) {
                console.error('❌ 数据库检查失败:', error);
                // 生产环境下不因检查失败而停止服务
                if (nodeEnv === 'production') {
                    console.warn('⚠️ 生产环境数据库检查失败，服务将继续运行');
                } else {
                    throw error;
                }
            }
        }
        
        // 如果环境变量配置完整，继续加载Bot相关功能
        if (hasRequiredVars && process.env.BOT_TOKEN) {
            console.log('🤖 启动Telegram Bot相关功能...');
            
            const { loadCacheData, initBotHandlers, bot, getBotUsername } = require('../services/botService');
            const { initScheduler } = require('../services/schedulerService');
            
            // 加载缓存数据
            await loadCacheData();
            
            // 初始化Bot事件监听
            initBotHandlers();
            
            // 预先获取Bot用户名并缓存
            try {
                const botUsername = await getBotUsername();
                console.log(`✅ Bot用户名预获取成功: @${botUsername}`);
            } catch (error) {
                console.warn('⚠️ Bot用户名预获取失败:', error.message);
            }
            
            // 设置全局Bot服务实例，供HTTP API使用
            global.botService = { bot, getBotUsername };
            
            // 启动定时任务调度器
            initScheduler();
            
            console.log('✅ 完整功能启动完成！');
            console.log('🎯 Bot功能列表:');
            console.log('   - 商家绑定系统');
            console.log('   - 按钮点击跳转私聊');
            console.log('   - 触发词自动回复');
            console.log('   - 定时发送消息');
            console.log('   - 消息模板管理');
        } else {
            console.log('⚠️ Bot功能未启动 - 环境变量不完整');
            console.log('💡 管理后台仍然可用，请在Railway Variables中设置以下变量:');
            console.log('   - BOT_TOKEN: Telegram Bot的访问令牌');
            console.log('   - BOT_USERNAME: Bot的用户名');
            console.log('   - GROUP_CHAT_ID: 群组聊天ID（可选）');
            
            // 设置一个空的Bot服务，避免API调用报错
            global.botService = { 
                bot: {
                    sendMessage: () => Promise.reject(new Error('Bot服务未启动，请配置BOT_TOKEN')),
                    sendPhoto: () => Promise.reject(new Error('Bot服务未启动，请配置BOT_TOKEN'))
                }
            };
        }
        
        console.log('\n🚀 应用启动完成！');
        console.log(`📱 管理后台访问地址: /admin`);
        
    } catch (error) {
        console.error('❌ 应用启动失败:', error);
        console.log('⚠️ 尝试启动最小化服务...');
        
        // 尝试至少启动HTTP服务器
        try {
            const { createHttpServer } = require('../services/httpService');
            createHttpServer();
            console.log('✅ 最小化HTTP服务器已启动');
        } catch (httpError) {
            console.error('❌ 连最小化服务器都无法启动:', httpError);
            throw error; // 重新抛出错误，让调用者处理
        }
    }
}

// 导出配置和工具函数
module.exports = {
    config,
    logger,
    nodeEnv,
    validateConfig,
    displayConfig,
    getFeature,
    isDeployment,
    isProduction,
    isStaging,
    isDevelopment,
    startApp
}; 
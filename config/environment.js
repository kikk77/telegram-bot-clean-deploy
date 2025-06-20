/**
 * 多环境配置管理
 * 支持 development, staging, production 环境
 */

const nodeEnv = process.env.NODE_ENV || 'development';

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
        port: 3001,
        logLevel: 'info',
        environment: 'staging',
        dbFileName: 'marketing_bot_staging.db',
        features: {
            enableDebugLogs: true,
            enableTestMode: false,
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

// 验证必需的环境变量
function validateConfig() {
    const requiredVars = ['BOT_TOKEN', 'BOT_USERNAME'];
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
        console.error(`❌ 缺少必需的环境变量: ${missing.join(', ')}`);
        if (nodeEnv === 'production') {
            process.exit(1);
        } else {
            console.warn(`⚠️ 在${nodeEnv}环境中缺少环境变量，继续运行...`);
        }
    }
}

// 显示当前配置
function displayConfig() {
    console.log('\n🔧 当前环境配置:');
    console.log(`📊 环境: ${config.environment}`);
    console.log(`🌐 端口: ${config.port}`);
    console.log(`📝 日志级别: ${config.logLevel}`);
    console.log(`💾 数据库文件: ${config.dbFileName}`);
    console.log(`🤖 Bot用户名: ${config.botUsername || '未配置'}`);
    console.log(`👥 群组ID: ${config.groupChatId || '未配置'}`);
    
    if (config.features.enableTestMode) {
        console.log('🧪 测试模式已启用');
    }
    
    if (config.features.enableDebugLogs) {
        console.log('🐛 调试日志已启用');
    }
    
    console.log('');
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

module.exports = {
    config,
    nodeEnv,
    validateConfig,
    displayConfig,
    getFeature,
    isDeployment,
    isProduction,
    isStaging,
    isDevelopment
}; 
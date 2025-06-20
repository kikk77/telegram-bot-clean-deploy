#!/usr/bin/env node

/**
 * Railway多环境部署管理脚本
 * 支持staging和production环境的部署管理
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 环境配置
const environments = {
    staging: {
        name: 'staging',
        branch: 'staging',
        railwayConfig: 'railway-staging.toml',
        description: '测试环境 - 用于功能测试和验证',
        port: 3001
    },
    production: {
        name: 'production', 
        branch: 'main',
        railwayConfig: 'railway.toml',
        description: '生产环境 - 面向最终用户',
        port: 3000
    }
};

// 显示帮助信息
function showHelp() {
    console.log(`
🚀 Railway多环境部署管理工具

用法: node scripts/deploy.js [命令] [环境]

命令:
  setup [env]     - 设置指定环境的配置文件
  deploy [env]    - 部署到指定环境
  status [env]    - 查看环境状态
  logs [env]      - 查看环境日志
  config [env]    - 显示环境配置
  help           - 显示此帮助信息

环境:
  staging        - 测试环境
  production     - 生产环境

示例:
  node scripts/deploy.js setup staging
  node scripts/deploy.js deploy production
  node scripts/deploy.js status staging
  node scripts/deploy.js logs production
`);
}

// 执行命令并显示输出
function runCommand(command, description) {
    console.log(`\n📋 ${description}`);
    console.log(`💻 执行: ${command}`);
    try {
        const output = execSync(command, { 
            encoding: 'utf8', 
            stdio: 'inherit',
            cwd: process.cwd()
        });
        return output;
    } catch (error) {
        console.error(`❌ 命令执行失败: ${error.message}`);
        process.exit(1);
    }
}

// 检查Railway配置文件
function checkRailwayConfig(env) {
    const config = environments[env];
    const configPath = path.join(process.cwd(), config.railwayConfig);
    
    if (!fs.existsSync(configPath)) {
        console.error(`❌ 配置文件不存在: ${config.railwayConfig}`);
        console.log(`💡 请先运行: node scripts/deploy.js setup ${env}`);
        process.exit(1);
    }
    
    console.log(`✅ 配置文件存在: ${config.railwayConfig}`);
}

// 设置环境配置
function setupEnvironment(env) {
    const config = environments[env];
    
    console.log(`\n🔧 设置${config.description}`);
    console.log(`📄 配置文件: ${config.railwayConfig}`);
    console.log(`🌐 端口: ${config.port}`);
    console.log(`🌲 分支: ${config.branch}`);
    
    // 检查配置文件是否存在
    const configPath = path.join(process.cwd(), config.railwayConfig);
    if (fs.existsSync(configPath)) {
        console.log(`✅ 配置文件已存在: ${config.railwayConfig}`);
    } else {
        console.log(`❌ 配置文件不存在: ${config.railwayConfig}`);
        console.log(`💡 请确保配置文件已创建`);
    }
    
    console.log(`\n📝 环境变量配置清单 (需要在Railway面板中设置):`);
    console.log(`   NODE_ENV=${config.name}`);
    console.log(`   PORT=${config.port}`);
    console.log(`   BOT_TOKEN=${env}_bot_token_here`);
    console.log(`   BOT_USERNAME=${env}_bot_username_here`);
    console.log(`   GROUP_CHAT_ID=${env}_group_id_here`);
    
    if (env === 'staging') {
        console.log(`\n🧪 Staging环境注意事项:`);
        console.log(`   - 使用测试Bot Token`);
        console.log(`   - 连接测试群组`);
        console.log(`   - 数据库文件: marketing_bot_staging.db`);
        console.log(`   - 启用调试日志`);
    } else {
        console.log(`\n🚀 Production环境注意事项:`);
        console.log(`   - 使用正式Bot Token`);
        console.log(`   - 连接正式群组`);
        console.log(`   - 数据库文件: marketing_bot.db`);
        console.log(`   - 最小化日志输出`);
    }
}

// 部署到指定环境
function deployEnvironment(env) {
    const config = environments[env];
    
    console.log(`\n🚀 开始部署到${config.description}`);
    
    // 检查配置文件
    checkRailwayConfig(env);
    
    // 检查当前分支
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    console.log(`📋 当前分支: ${currentBranch}`);
    console.log(`🎯 目标分支: ${config.branch}`);
    
    if (currentBranch !== config.branch) {
        console.log(`⚠️ 当前分支与目标分支不匹配`);
        console.log(`💡 建议切换到正确分支: git checkout ${config.branch}`);
    }
    
    // 检查是否有未提交的更改
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (status.trim()) {
        console.log(`⚠️ 检测到未提交的更改:`);
        console.log(status);
        console.log(`💡 建议先提交更改: git add . && git commit -m "update"`);
    }
    
    // 推送代码
    runCommand(
        `git push origin ${config.branch}`,
        `推送代码到${config.branch}分支`
    );
    
    console.log(`\n✅ 部署完成！`);
    console.log(`📊 Railway将自动检测配置文件: ${config.railwayConfig}`);
    console.log(`🌐 服务将在端口 ${config.port} 启动`);
    console.log(`💾 数据将存储在Volume: telegram-bot-${env}-data`);
}

// 查看环境状态
function showStatus(env) {
    const config = environments[env];
    
    console.log(`\n📊 ${config.description} 状态信息:`);
    console.log(`🏷️ 环境名称: ${config.name}`);
    console.log(`🌲 部署分支: ${config.branch}`);
    console.log(`🌐 服务端口: ${config.port}`);
    console.log(`📄 配置文件: ${config.railwayConfig}`);
    console.log(`💾 Volume名称: telegram-bot-${env}-data`);
    
    checkRailwayConfig(env);
    
    console.log(`\n💡 查看实时状态请访问Railway控制面板`);
}

// 查看环境日志
function showLogs(env) {
    console.log(`\n📋 查看${environments[env].description}日志`);
    console.log(`💡 请在Railway控制面板中查看实时日志`);
    console.log(`🔗 或者使用Railway CLI: railway logs`);
}

// 显示环境配置
function showConfig(env) {
    const config = environments[env];
    
    console.log(`\n⚙️ ${config.description} 配置详情:`);
    console.log(JSON.stringify(config, null, 2));
    
    console.log(`\n📄 Railway配置文件内容:`);
    const configPath = path.join(process.cwd(), config.railwayConfig);
    
    if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        console.log(content);
    } else {
        console.log(`❌ 配置文件不存在: ${config.railwayConfig}`);
    }
}

// 主函数
function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const env = args[1];
    
    if (!command || command === 'help') {
        showHelp();
        return;
    }
    
    if (!env || !environments[env]) {
        console.error(`❌ 请指定有效的环境: staging 或 production`);
        showHelp();
        process.exit(1);
    }
    
    console.log(`🎯 目标环境: ${environments[env].description}`);
    
    switch (command) {
        case 'setup':
            setupEnvironment(env);
            break;
        case 'deploy':
            deployEnvironment(env);
            break;
        case 'status':
            showStatus(env);
            break;
        case 'logs':
            showLogs(env);
            break;
        case 'config':
            showConfig(env);
            break;
        default:
            console.error(`❌ 未知命令: ${command}`);
            showHelp();
            process.exit(1);
    }
}

// 运行主函数
if (require.main === module) {
    main();
}

module.exports = {
    environments,
    setupEnvironment,
    deployEnvironment,
    showStatus,
    showLogs,
    showConfig
}; 
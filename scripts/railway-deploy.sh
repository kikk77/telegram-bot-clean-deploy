#!/bin/bash

# Railway部署脚本
# 确保数据持久化和Bot切换兼容性

set -e  # 遇到错误立即退出

echo "🚀 开始Railway部署流程..."

# 检查环境变量
check_env_vars() {
    echo "🔍 检查环境变量..."
    
    required_vars=("BOT_TOKEN" "BOT_USERNAME")
    missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done
    
    if [ ${#missing_vars[@]} -ne 0 ]; then
        echo "❌ 缺少必需的环境变量: ${missing_vars[*]}"
        echo "💡 请在Railway Variables中设置这些环境变量："
        for var in "${missing_vars[@]}"; do
            echo "   - $var"
        done
        exit 1
    fi
    
    echo "✅ 环境变量检查通过"
    echo "🤖 当前Bot: ${BOT_USERNAME}"
}

# 创建部署前备份
create_backup() {
    echo "📦 创建部署前备份..."
    
    if [ -f "/app/data/marketing_bot.db" ] || [ -f "/app/data/marketing_bot_staging.db" ]; then
        node utils/backupDatabase.js pre-deploy
        echo "✅ 部署前备份完成"
    else
        echo "ℹ️ 未发现现有数据库，跳过备份"
    fi
}

# 数据库健康检查和修复
health_check() {
    echo "🔍 执行数据库健康检查..."
    
    node -e "
    const CloudDataManager = require('./utils/cloudDataManager');
    const DataRepair = require('./utils/dataRepair');
    const manager = new CloudDataManager();
    
    manager.healthCheck().then(async result => {
        console.log('📊 健康检查结果:');
        console.log('  数据库状态:', Object.keys(result.databases).length + '个文件');
        console.log('  Bot兼容性:', result.botCompatibility.dataCompatible ? '✅ 兼容' : '⚠️ 有问题');
        console.log('  订单系统:', result.orderSystem.healthy ? '✅ 健康' : '⚠️ 有问题');
        
        if (result.issues.length > 0) {
            console.log('⚠️ 发现问题:');
            result.issues.forEach(issue => console.log('  -', issue));
        }
        
        // 检查是否需要执行数据修复
        const needsRepair = (
            result.botCompatibility.orphanMerchants > 0 || 
            result.botCompatibility.orphanBindCodes > 0 ||
            !result.orderSystem.healthy
        );
        
        if (needsRepair) {
            console.log('🔧 检测到数据问题，执行自动修复...');
            if (!result.orderSystem.healthy) {
                console.log('🛒 订单系统问题:');
                result.orderSystem.issues.forEach(issue => console.log('  -', issue));
            }
            
            try {
                const repair = new DataRepair();
                await repair.repairAll();
                console.log('✅ 数据修复完成');
            } catch (repairError) {
                console.warn('⚠️ 数据修复失败，但部署将继续:', repairError.message);
            }
        }
        
        if (result.recommendations.length > 0) {
            console.log('💡 建议:');
            result.recommendations.forEach(rec => console.log('  -', rec));
        }
        
        process.exit(0);
    }).catch(error => {
        console.error('❌ 健康检查失败:', error.message);
        console.log('⚠️ 健康检查失败，但部署将继续');
        process.exit(0);
    });
    "
}

# 确保数据目录存在
ensure_data_dirs() {
    echo "📁 确保数据目录存在..."
    
    mkdir -p /app/data
    mkdir -p /app/backups
    mkdir -p /app/exports
    
    # 设置权限
    chmod 755 /app/data
    chmod 755 /app/backups
    chmod 755 /app/exports
    
    echo "✅ 数据目录准备完成"
}

# 显示部署信息
show_deploy_info() {
    echo ""
    echo "🎯 部署信息摘要:"
    echo "   环境: ${NODE_ENV:-production}"
    echo "   Bot: ${BOT_USERNAME}"
    echo "   端口: ${PORT:-3000}"
    echo "   数据目录: /app/data"
    echo "   备份目录: /app/backups"
    echo ""
}

# 主执行流程
main() {
    echo "📋 Railway部署检查清单:"
    echo "   1. 检查环境变量"
    echo "   2. 创建部署前备份"
    echo "   3. 执行健康检查"
    echo "   4. 确保数据目录"
    echo "   5. 显示部署信息"
    echo ""
    
    check_env_vars
    ensure_data_dirs
    create_backup
    health_check
    show_deploy_info
    
    echo "✅ Railway部署检查完成"
    echo "🚀 应用即将启动..."
}

# 如果脚本被直接执行
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi 
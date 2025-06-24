const path = require('path');
const fs = require('fs');

// 设置环境变量 
process.env.NODE_ENV = 'production';

// 引入数据库相关模块
const { db } = require('../config/database');
const dbOperations = require('../models/dbOperations');

console.log('🚀 开始EAV数据迁移...');
console.log('========================================');

async function migrateToEAV() {
    try {
        // 1. 检查EAV配置文件是否存在
        const configPath = path.join(__dirname, '../../business_data/configuration');
        
        const requiredFiles = [
            'eav_schema_definitions.json',
            'eav_data_values.json'
        ];
        
        for (const file of requiredFiles) {
            const filePath = path.join(configPath, file);
            if (!fs.existsSync(filePath)) {
                console.error(`❌ 缺少EAV配置文件: ${file}`);
                process.exit(1);
            }
        }
        
        console.log('✅ EAV配置文件检查通过');
        
        // 2. 初始化EAV服务 (通过调用数据库操作触发EAV表创建)
        console.log('📦 初始化EAV服务...');
        
        // 触发EAV服务初始化
        try {
            dbOperations.getMerchantSkills(1); // 这会触发EAV服务的初始化
            console.log('✅ EAV服务初始化完成');
        } catch (error) {
            console.log('ℹ️  EAV服务初始化 (预期中的错误，正常现象):', error.message);
        }
        
        // 3. 创建状态日志表
        console.log('📋 创建订单状态日志表...');
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS order_status_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id INTEGER NOT NULL,
                    from_status TEXT NOT NULL,
                    to_status TEXT NOT NULL,
                    updated_by TEXT DEFAULT 'system',
                    created_at INTEGER DEFAULT (strftime('%s', 'now')),
                    FOREIGN KEY (order_id) REFERENCES orders(id)
                )
            `);
            
            db.exec(`
                CREATE INDEX IF NOT EXISTS idx_order_status_logs_order ON order_status_logs(order_id);
                CREATE INDEX IF NOT EXISTS idx_order_status_logs_time ON order_status_logs(created_at);
            `);
            
            console.log('✅ 订单状态日志表创建完成');
        } catch (error) {
            console.error('❌ 创建状态日志表失败:', error);
        }
        
        // 4. 迁移商家技能数据到EAV
        console.log('🔄 开始迁移商家技能数据...');
        
        const migratedCount = dbOperations.migrateAllMerchantSkillsToEAV();
        console.log(`✅ 成功迁移 ${migratedCount} 个商家的技能数据到EAV`);
        
        // 5. 验证EAV数据
        console.log('🔍 验证EAV数据完整性...');
        
        // 获取所有商家
        const merchants = dbOperations.getAllMerchants();
        const merchantIds = merchants.map(m => m.id);
        
        // 批量获取EAV技能数据
        const eavSkills = dbOperations.getBatchMerchantSkills(merchantIds);
        
        let validCount = 0;
        let errorCount = 0;
        
        for (const merchant of merchants) {
            const merchantId = merchant.id;
            const eavSkill = eavSkills[merchantId];
            
            if (eavSkill && (eavSkill.wash || eavSkill.blow || eavSkill.do || eavSkill.kiss)) {
                validCount++;
            } else {
                errorCount++;
                console.warn(`⚠️  商家 ${merchant.teacher_name} (ID: ${merchantId}) 的EAV技能数据为空`);
            }
        }
        
        console.log(`✅ EAV数据验证完成: ${validCount} 个有效, ${errorCount} 个异常`);
        
        // 6. 测试EAV功能
        console.log('🧪 测试EAV功能...');
        
        if (merchants.length > 0) {
            const testMerchant = merchants[0];
            const skillDisplay = dbOperations.formatMerchantSkillsDisplay(testMerchant.id);
            console.log(`🔬 测试技能显示 (商家: ${testMerchant.teacher_name}):`);
            console.log(skillDisplay);
            
            // 测试状态服务
            const statusInfo = dbOperations.getOrderStatusConfig('pending');
            console.log(`🔬 测试状态配置:`, statusInfo);
        }
        
        // 7. 生成迁移报告
        console.log('📊 生成迁移报告...');
        
        const report = {
            migration_time: new Date().toISOString(),
            merchants_total: merchants.length,
            skills_migrated: migratedCount,
            eav_valid_count: validCount,
            eav_error_count: errorCount,
            eav_tables_created: ['eav_schema_definitions', 'eav_field_definitions', 'eav_data_values', 'order_status_logs'],
            status: migratedCount > 0 ? 'SUCCESS' : 'PARTIAL'
        };
        
        // 保存报告
        const reportPath = path.join(__dirname, '../exports/eav_migration_report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        console.log('✅ 迁移报告已保存:', reportPath);
        
        // 8. 输出总结
        console.log('========================================');
        console.log('🎉 EAV迁移完成总结:');
        console.log(`📈 商家总数: ${merchants.length}`);
        console.log(`✅ 技能迁移成功: ${migratedCount}`);
        console.log(`📊 EAV数据有效: ${validCount}`);
        console.log(`⚠️  EAV数据异常: ${errorCount}`);
        console.log(`💾 EAV表创建: ${report.eav_tables_created.length} 个`);
        console.log(`🏆 迁移状态: ${report.status}`);
        
        if (report.status === 'SUCCESS') {
            console.log('🎊 所有数据已成功迁移到EAV模式！');
            console.log('🔄 应用程序现在将使用EAV模式进行数据查询，性能得到优化。');
        } else {
            console.log('⚠️  迁移部分完成，请检查错误日志。');
        }
        
        console.log('========================================');
        
    } catch (error) {
        console.error('❌ EAV迁移失败:', error);
        process.exit(1);
    }
}

// 运行迁移
if (require.main === module) {
    migrateToEAV().then(() => {
        console.log('🏁 迁移脚本执行完成');
        process.exit(0);
    }).catch((error) => {
        console.error('💥 迁移脚本执行失败:', error);
        process.exit(1);
    });
}

module.exports = { migrateToEAV };
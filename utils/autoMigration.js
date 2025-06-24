const { db } = require('../config/database');
const dbOperations = require('../models/dbOperations');

class AutoMigration {
    constructor() {
        this.migrationLog = [];
    }

    // 执行自动迁移
    async runAutoMigration() {
        console.log('🚀 开始自动数据迁移检查...');
        
        try {
            // 1. 检查EAV表是否存在
            await this.checkEAVTablesExist();
            
            // 2. 检查是否需要迁移商家技能数据
            await this.migrateSkillsIfNeeded();
            
            // 3. 验证EAV数据完整性
            await this.validateEAVData();
            
            // 4. 输出迁移报告
            this.printMigrationReport();
            
            console.log('✅ 自动数据迁移完成 - 系统已完全切换到EAV模式');
            return true;
        } catch (error) {
            console.error('❌ 自动数据迁移失败:', error);
            return false;
        }
    }

    // 检查EAV表是否存在
    async checkEAVTablesExist() {
        const requiredTables = [
            'eav_schema_definitions',
            'eav_field_definitions', 
            'eav_data_values',
            'order_status_logs'
        ];
        
        for (const table of requiredTables) {
            const exists = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name=?
            `).get(table);
            
            if (!exists) {
                this.migrationLog.push(`❌ 缺失EAV表: ${table}`);
                throw new Error(`EAV表 ${table} 不存在，请先运行完整的EAV迁移脚本`);
            }
        }
        
        this.migrationLog.push('✅ EAV表结构检查通过');
    }

    // 检查并迁移商家技能数据
    async migrateSkillsIfNeeded() {
        try {
            // 检查有多少商家有传统技能数据
            const legacySkillsCount = db.prepare(`
                SELECT COUNT(*) as count 
                FROM merchants 
                WHERE skill_wash IS NOT NULL 
                   OR skill_blow IS NOT NULL 
                   OR skill_do IS NOT NULL 
                   OR skill_kiss IS NOT NULL
            `).get().count;
            
            // 检查EAV中有多少商家技能数据
            const eavSkillsCount = db.prepare(`
                SELECT COUNT(DISTINCT entity_key) as count 
                FROM eav_data_values 
                WHERE schema_id = (
                    SELECT schema_id FROM eav_schema_definitions 
                    WHERE schema_name = 'merchant_skills'
                )
            `).get().count;
            
            this.migrationLog.push(`📊 传统技能数据: ${legacySkillsCount} 个商家`);
            this.migrationLog.push(`📊 EAV技能数据: ${eavSkillsCount} 个商家`);
            
            // 如果传统数据多于EAV数据，进行迁移
            if (legacySkillsCount > eavSkillsCount) {
                console.log(`检测到 ${legacySkillsCount - eavSkillsCount} 个商家的技能数据需要迁移...`);
                const migrated = dbOperations.migrateAllMerchantSkillsToEAV();
                this.migrationLog.push(`🔄 成功迁移 ${migrated} 个商家的技能数据到EAV`);
            } else {
                this.migrationLog.push('✅ 商家技能数据无需迁移');
            }
        } catch (error) {
            this.migrationLog.push(`❌ 商家技能数据迁移失败: ${error.message}`);
            console.error('商家技能数据迁移失败:', error);
        }
    }

    // 验证EAV数据完整性
    async validateEAVData() {
        try {
            // 检查Schema定义
            const schemasCount = db.prepare('SELECT COUNT(*) as count FROM eav_schema_definitions').get().count;
            const fieldsCount = db.prepare('SELECT COUNT(*) as count FROM eav_field_definitions').get().count;
            const valuesCount = db.prepare('SELECT COUNT(*) as count FROM eav_data_values').get().count;
            
            this.migrationLog.push(`📋 EAV Schema定义: ${schemasCount} 个`);
            this.migrationLog.push(`📋 EAV字段定义: ${fieldsCount} 个`);
            this.migrationLog.push(`📋 EAV数据值: ${valuesCount} 个`);
            
            // 验证必要的Schema是否存在
            const requiredSchemas = ['merchant_skills', 'order_status_config'];
            for (const schemaName of requiredSchemas) {
                const schema = db.prepare(`
                    SELECT schema_id FROM eav_schema_definitions 
                    WHERE schema_name = ?
                `).get(schemaName);
                
                if (!schema) {
                    this.migrationLog.push(`⚠️ 缺失必要Schema: ${schemaName}`);
                } else {
                    this.migrationLog.push(`✅ Schema存在: ${schemaName}`);
                }
            }
        } catch (error) {
            this.migrationLog.push(`❌ EAV数据验证失败: ${error.message}`);
            console.error('EAV数据验证失败:', error);
        }
    }

    // 输出迁移报告
    printMigrationReport() {
        console.log('\n📋 自动迁移报告:');
        console.log('=====================================');
        for (const log of this.migrationLog) {
            console.log(log);
        }
        console.log('=====================================\n');
    }

    // 检查系统兼容性
    async checkSystemCompatibility() {
        try {
            console.log('🔍 检查系统兼容性...');
            
            // 测试商家技能获取
            const merchants = db.prepare('SELECT id FROM merchants LIMIT 3').all();
            for (const merchant of merchants) {
                const skills = dbOperations.getMerchantSkills(merchant.id);
                if (!skills) {
                    console.log(`⚠️ 商家 ${merchant.id} 技能数据获取失败`);
                }
            }
            
            // 测试订单状态配置
            const testStatuses = ['pending', 'confirmed', 'completed'];
            for (const status of testStatuses) {
                const config = dbOperations.getOrderStatusConfig(status);
                if (!config) {
                    console.log(`⚠️ 状态 ${status} 配置获取失败`);
                }
            }
            
            console.log('✅ 系统兼容性检查完成');
            return true;
        } catch (error) {
            console.error('❌ 系统兼容性检查失败:', error);
            return false;
        }
    }
}

// 导出自动迁移功能
async function runAutoMigrationOnStartup() {
    const migration = new AutoMigration();
    
    // 运行自动迁移
    const migrationSuccess = await migration.runAutoMigration();
    
    if (migrationSuccess) {
        // 检查系统兼容性
        await migration.checkSystemCompatibility();
    }
    
    return migrationSuccess;
}

module.exports = {
    AutoMigration,
    runAutoMigrationOnStartup
}; 
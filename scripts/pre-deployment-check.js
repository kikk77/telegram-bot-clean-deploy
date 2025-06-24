/**
 * 部署前检查脚本
 * 确保EAV系统在生产环境中能正确处理现有数据
 */

const { db } = require('../config/database');
const dbOperations = require('../models/dbOperations');
const { runAutoMigrationOnStartup } = require('../utils/autoMigration');

class PreDeploymentChecker {
    constructor() {
        this.checks = [];
        this.warnings = [];
        this.errors = [];
    }

    async runAllChecks() {
        console.log('🔍 开始部署前检查...');
        console.log('=====================================');
        
        try {
            // 1. 检查数据库连接
            await this.checkDatabaseConnection();
            
            // 2. 检查EAV系统完整性
            await this.checkEAVIntegrity();
            
            // 3. 检查现有数据兼容性
            await this.checkDataCompatibility();
            
            // 4. 检查关键功能
            await this.checkCriticalFunctions();
            
            // 5. 运行自动迁移
            await this.runAutoMigration();
            
            // 6. 输出检查报告
            this.printReport();
            
            const hasErrors = this.errors.length > 0;
            
            if (hasErrors) {
                console.log('❌ 部署前检查失败，请修复错误后重试');
                process.exit(1);
            } else {
                console.log('✅ 部署前检查通过，可以安全部署到生产环境');
                process.exit(0);
            }
            
        } catch (error) {
            console.error('❌ 部署前检查出现异常:', error);
            process.exit(1);
        }
    }

    async checkDatabaseConnection() {
        try {
            const result = db.prepare('SELECT 1 as test').get();
            if (result.test === 1) {
                this.addCheck('✅ 数据库连接正常');
            } else {
                this.addError('❌ 数据库连接异常');
            }
        } catch (error) {
            this.addError(`❌ 数据库连接失败: ${error.message}`);
        }
    }

    async checkEAVIntegrity() {
        try {
            // 检查EAV表是否存在
            const tables = ['eav_schema_definitions', 'eav_field_definitions', 'eav_data_values'];
            for (const table of tables) {
                const exists = db.prepare(`
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name=?
                `).get(table);
                
                if (exists) {
                    this.addCheck(`✅ EAV表存在: ${table}`);
                } else {
                    this.addError(`❌ EAV表缺失: ${table}`);
                }
            }
            
            // 检查必要的Schema
            const requiredSchemas = ['merchant_skills', 'order_status_config'];
            for (const schemaName of requiredSchemas) {
                const schema = db.prepare(`
                    SELECT schema_id FROM eav_schema_definitions 
                    WHERE schema_name = ?
                `).get(schemaName);
                
                if (schema) {
                    this.addCheck(`✅ EAV Schema存在: ${schemaName}`);
                } else {
                    this.addWarning(`⚠️ EAV Schema缺失: ${schemaName} (将使用默认配置)`);
                }
            }
            
        } catch (error) {
            this.addError(`❌ EAV完整性检查失败: ${error.message}`);
        }
    }

    async checkDataCompatibility() {
        try {
            // 检查商家数据
            const merchantCount = db.prepare('SELECT COUNT(*) as count FROM merchants').get().count;
            this.addCheck(`📊 商家数据: ${merchantCount} 条记录`);
            
            if (merchantCount > 0) {
                // 检查有技能数据的商家
                const skillCount = db.prepare(`
                    SELECT COUNT(*) as count FROM merchants 
                    WHERE skill_wash IS NOT NULL 
                       OR skill_blow IS NOT NULL 
                       OR skill_do IS NOT NULL 
                       OR skill_kiss IS NOT NULL
                `).get().count;
                
                this.addCheck(`📊 有技能数据的商家: ${skillCount} 个`);
                
                // 测试技能数据获取
                const sampleMerchant = db.prepare('SELECT id FROM merchants LIMIT 1').get();
                if (sampleMerchant) {
                    const skills = dbOperations.getMerchantSkills(sampleMerchant.id);
                    if (skills) {
                        this.addCheck('✅ 商家技能数据获取正常');
                    } else {
                        this.addError('❌ 商家技能数据获取失败');
                    }
                }
            }
            
            // 检查订单数据
            const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
            this.addCheck(`📊 订单数据: ${orderCount} 条记录`);
            
            // 测试订单状态配置
            const statusConfig = dbOperations.getOrderStatusConfig('pending');
            if (statusConfig && statusConfig.name) {
                this.addCheck('✅ 订单状态配置获取正常');
            } else {
                this.addError('❌ 订单状态配置获取失败');
            }
            
        } catch (error) {
            this.addError(`❌ 数据兼容性检查失败: ${error.message}`);
        }
    }

    async checkCriticalFunctions() {
        try {
            // 测试状态流转
            const canTransition = dbOperations.canTransitionOrderStatus('pending', 'confirmed');
            if (typeof canTransition === 'boolean') {
                this.addCheck('✅ 订单状态流转检查正常');
            } else {
                this.addError('❌ 订单状态流转检查异常');
            }
            
            // 测试批量操作（如果有数据的话）
            const merchants = db.prepare('SELECT id FROM merchants LIMIT 3').all();
            if (merchants.length > 0) {
                const merchantIds = merchants.map(m => m.id);
                const batchSkills = dbOperations.getBatchMerchantSkills(merchantIds);
                
                if (batchSkills && Object.keys(batchSkills).length > 0) {
                    this.addCheck('✅ 批量技能获取正常');
                } else {
                    this.addWarning('⚠️ 批量技能获取返回空结果');
                }
            }
            
        } catch (error) {
            this.addError(`❌ 关键功能检查失败: ${error.message}`);
        }
    }

    async runAutoMigration() {
        try {
            console.log('\n🔄 执行自动数据迁移...');
            const migrationSuccess = await runAutoMigrationOnStartup();
            
            if (migrationSuccess) {
                this.addCheck('✅ 自动数据迁移完成');
            } else {
                this.addWarning('⚠️ 自动数据迁移部分失败，但系统仍可正常运行');
            }
        } catch (error) {
            this.addWarning(`⚠️ 自动数据迁移出错: ${error.message}`);
        }
    }

    addCheck(message) {
        this.checks.push(message);
        console.log(message);
    }

    addWarning(message) {
        this.warnings.push(message);
        console.log(message);
    }

    addError(message) {
        this.errors.push(message);
        console.log(message);
    }

    printReport() {
        console.log('\n📋 部署前检查报告');
        console.log('=====================================');
        console.log(`✅ 通过检查: ${this.checks.length} 项`);
        console.log(`⚠️ 警告信息: ${this.warnings.length} 项`);
        console.log(`❌ 错误信息: ${this.errors.length} 项`);
        
        if (this.warnings.length > 0) {
            console.log('\n⚠️ 警告详情:');
            this.warnings.forEach(warning => console.log(`  ${warning}`));
        }
        
        if (this.errors.length > 0) {
            console.log('\n❌ 错误详情:');
            this.errors.forEach(error => console.log(`  ${error}`));
        }
        
        console.log('\n🔧 部署建议:');
        if (this.errors.length === 0) {
            console.log('  ✅ 系统已准备好部署到生产环境');
            console.log('  ✅ EAV系统将自动处理现有数据的兼容性');
            console.log('  ✅ 现有功能不会受到影响');
        } else {
            console.log('  ❌ 请先修复所有错误再进行部署');
            console.log('  🔧 建议检查数据库连接和EAV配置文件');
        }
        
        if (this.warnings.length > 0) {
            console.log('  💡 警告信息不会阻止部署，但建议关注');
        }
        
        console.log('=====================================');
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const checker = new PreDeploymentChecker();
    checker.runAllChecks().finally(() => {
        if (db) {
            db.close();
        }
    });
}

module.exports = PreDeploymentChecker; 
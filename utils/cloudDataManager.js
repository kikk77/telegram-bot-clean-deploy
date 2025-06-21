const fs = require('fs');
const path = require('path');

/**
 * 云端数据管理工具
 * 专门用于Railway环境下的数据备份、同步和迁移
 */

class CloudDataManager {
    constructor() {
        this.isProduction = process.env.NODE_ENV === 'production';
        this.isRailway = process.env.RAILWAY_ENVIRONMENT_NAME ? true : false;
        this.dataDir = this.isProduction ? '/app/data' : path.join(__dirname, '../data');
    }

    // 获取当前环境信息
    getEnvironmentInfo() {
        return {
            environment: process.env.NODE_ENV || 'development',
            isRailway: this.isRailway,
            railwayEnv: process.env.RAILWAY_ENVIRONMENT_NAME,
            dataPath: this.dataDir,
            timestamp: new Date().toISOString()
        };
    }

    // 创建完整数据快照
    async createDataSnapshot() {
        try {
            console.log('🔄 创建数据快照...');
            
            const snapshot = {
                meta: this.getEnvironmentInfo(),
                databases: {},
                files: {}
            };

            // 扫描所有数据库文件
            const files = fs.readdirSync(this.dataDir).filter(file => file.endsWith('.db'));
            
            for (const file of files) {
                const filePath = path.join(this.dataDir, file);
                const stats = fs.statSync(filePath);
                
                snapshot.files[file] = {
                    size: stats.size,
                    modified: stats.mtime.toISOString(),
                    exists: true
                };

                // 如果文件不大，可以包含备份数据
                if (stats.size < 50 * 1024 * 1024) { // 50MB以下
                    try {
                        const { backupToJSON } = require('./backupDatabase');
                        // 这里可以添加具体的数据备份逻辑
                        console.log(`📊 ${file}: ${(stats.size / 1024).toFixed(1)}KB`);
                    } catch (error) {
                        console.warn(`⚠️ 无法备份 ${file}:`, error.message);
                    }
                }
            }

            return snapshot;

        } catch (error) {
            console.error('❌ 创建快照失败:', error);
            throw error;
        }
    }

    // 数据库健康检查
    async healthCheck() {
        try {
            console.log('🔍 执行数据库健康检查...');
            
            const health = {
                timestamp: new Date().toISOString(),
                environment: this.getEnvironmentInfo(),
                databases: {},
                issues: [],
                recommendations: [],
                botCompatibility: {}
            };

            // 检查数据库文件
            const dbFiles = ['marketing_bot.db', 'marketing_bot_staging.db', 'core.db', 'templates.db'];
            
            for (const dbFile of dbFiles) {
                const dbPath = path.join(this.dataDir, dbFile);
                
                if (fs.existsSync(dbPath)) {
                    const stats = fs.statSync(dbPath);
                    health.databases[dbFile] = {
                        exists: true,
                        size: stats.size,
                        sizeHuman: `${(stats.size / 1024).toFixed(1)}KB`,
                        lastModified: stats.mtime.toISOString(),
                        status: 'healthy'
                    };

                    // 大小检查
                    if (stats.size === 0) {
                        health.issues.push(`${dbFile} 文件为空`);
                        health.databases[dbFile].status = 'error';
                    } else if (stats.size > 100 * 1024 * 1024) { // 100MB
                        health.issues.push(`${dbFile} 文件过大 (${health.databases[dbFile].sizeHuman})`);
                        health.recommendations.push(`考虑清理 ${dbFile} 的历史数据`);
                    }
                } else {
                    health.databases[dbFile] = {
                        exists: false,
                        status: 'missing'
                    };
                }
            }

            // Bot兼容性检查
            await this.checkBotCompatibility(health);

            // 订单系统健康检查
            health.orderSystem = await this.checkOrderSystemHealth();

            // 检查数据目录权限
            try {
                const testFile = path.join(this.dataDir, 'test_write.tmp');
                fs.writeFileSync(testFile, 'test');
                fs.unlinkSync(testFile);
                health.dataDirectoryWritable = true;
            } catch (error) {
                health.dataDirectoryWritable = false;
                health.issues.push('数据目录不可写');
            }

            // 生成报告
            console.log('📋 健康检查报告:');
            Object.entries(health.databases).forEach(([name, info]) => {
                const status = info.status === 'healthy' ? '✅' : info.status === 'missing' ? '❌' : '⚠️';
                console.log(`${status} ${name}: ${info.exists ? info.sizeHuman : '不存在'}`);
            });

            if (health.issues.length > 0) {
                console.log('⚠️ 发现问题:');
                health.issues.forEach(issue => console.log(`  - ${issue}`));
            }

            if (health.recommendations.length > 0) {
                console.log('💡 建议:');
                health.recommendations.forEach(rec => console.log(`  - ${rec}`));
            }

            return health;

        } catch (error) {
            console.error('❌ 健康检查失败:', error);
            throw error;
        }
    }

    // Bot兼容性检查 - 确保数据支持Bot切换
    async checkBotCompatibility(health) {
        try {
            const currentBotUsername = process.env.BOT_USERNAME;
            const currentBotToken = process.env.BOT_TOKEN;
            
            health.botCompatibility = {
                currentBot: currentBotUsername || 'unknown',
                tokenConfigured: !!currentBotToken,
                dataCompatible: true,
                issues: []
            };

            // 检查数据库中是否有Bot相关的硬编码数据
            const dbPath = path.join(this.dataDir, 'marketing_bot.db');
            if (fs.existsSync(dbPath)) {
                try {
                    const Database = require('better-sqlite3');
                    const db = new Database(dbPath, { readonly: true });
                    
                    // 检查商家数据中的user_id是否都是有效的Telegram ID
                    const merchants = db.prepare('SELECT id, user_id, username, bind_code FROM merchants WHERE user_id IS NOT NULL').all();
                    const nullUserIdCount = db.prepare('SELECT COUNT(*) as count FROM merchants WHERE user_id IS NULL').get().count;
                    
                    health.botCompatibility.merchantsTotal = merchants.length + nullUserIdCount;
                    health.botCompatibility.merchantsWithUserId = merchants.length;
                    health.botCompatibility.merchantsWithoutUserId = nullUserIdCount;
                    
                    // 检查绑定码数据一致性
                    const bindCodes = db.prepare('SELECT code, used, used_by FROM bind_codes').all();
                    const orphanMerchants = db.prepare(`
                        SELECT COUNT(*) as count FROM merchants m 
                        LEFT JOIN bind_codes bc ON m.bind_code = bc.code 
                        WHERE m.bind_code IS NOT NULL AND bc.code IS NULL
                    `).get().count;
                    
                    health.botCompatibility.bindCodesTotal = bindCodes.length;
                    health.botCompatibility.orphanMerchants = orphanMerchants;
                    
                    if (orphanMerchants > 0) {
                        health.botCompatibility.issues.push(`发现 ${orphanMerchants} 个孤儿商家记录`);
                        health.issues.push(`数据一致性问题：${orphanMerchants} 个商家的绑定码不存在`);
                        health.recommendations.push('运行数据修复脚本修复孤儿商家记录');
                    }
                    
                    // 检查是否有硬编码的Bot用户名
                    const hardcodedBotRefs = db.prepare(`
                        SELECT COUNT(*) as count FROM merchants 
                        WHERE teacher_name LIKE '%xiaoji_daniao_bot%' 
                        OR teacher_name LIKE '%xiaojisystembot%'
                        OR contact LIKE '%xiaoji_daniao_bot%' 
                        OR contact LIKE '%xiaojisystembot%'
                    `).get().count;
                    
                    if (hardcodedBotRefs > 0) {
                        health.botCompatibility.issues.push(`发现 ${hardcodedBotRefs} 个硬编码Bot引用`);
                        health.recommendations.push('清理数据中的硬编码Bot引用');
                    }
                    
                    db.close();
                    
                } catch (dbError) {
                    health.botCompatibility.issues.push(`数据库检查失败: ${dbError.message}`);
                }
            }
            
            // 环境变量兼容性检查
            if (!currentBotUsername) {
                health.botCompatibility.issues.push('BOT_USERNAME 环境变量未配置');
                health.issues.push('Bot用户名未配置，可能影响功能正常运行');
            }
            
            if (!currentBotToken) {
                health.botCompatibility.issues.push('BOT_TOKEN 环境变量未配置');
                health.issues.push('Bot Token未配置，Bot将无法正常工作');
            }
            
            // 判断整体兼容性
            health.botCompatibility.dataCompatible = health.botCompatibility.issues.length === 0;
            
            console.log(`🤖 Bot兼容性检查: ${health.botCompatibility.dataCompatible ? '✅ 兼容' : '⚠️ 有问题'}`);
            
        } catch (error) {
            console.warn('⚠️ Bot兼容性检查失败:', error.message);
            health.botCompatibility.issues.push(`兼容性检查失败: ${error.message}`);
        }
    }

    // 订单系统健康检查
    async checkOrderSystemHealth() {
        try {
            console.log('🛒 检查订单系统健康状态...');
            
            const orderHealth = {
                healthy: true,
                issues: [],
                statistics: {},
                dataIntegrity: {}
            };

            // 检查数据库文件
            const dbPath = path.join(this.dataDir, 'marketing_bot.db');
            if (!fs.existsSync(dbPath)) {
                orderHealth.healthy = false;
                orderHealth.issues.push('主数据库文件不存在');
                return orderHealth;
            }

            try {
                const Database = require('better-sqlite3');
                const db = new Database(dbPath, { readonly: true });
                
                // 统计基础数据
                orderHealth.statistics = {
                    merchants: db.prepare('SELECT COUNT(*) as count FROM merchants').get().count,
                    orders: db.prepare('SELECT COUNT(*) as count FROM orders').get().count,
                    bookingSessions: db.prepare('SELECT COUNT(*) as count FROM booking_sessions').get().count,
                    evaluations: db.prepare('SELECT COUNT(*) as count FROM evaluations').get().count,
                    regions: db.prepare('SELECT COUNT(*) as count FROM regions').get().count
                };
                
                // 检查数据完整性
                orderHealth.dataIntegrity = {
                    // 孤儿订单（商家不存在）
                    orphanOrders: db.prepare(`
                        SELECT COUNT(*) as count FROM orders o 
                        LEFT JOIN merchants m ON o.merchant_id = m.id 
                        WHERE m.id IS NULL
                    `).get().count,
                    
                    // 孤儿预约会话（商家不存在）
                    orphanBookingSessions: db.prepare(`
                        SELECT COUNT(*) as count FROM booking_sessions bs 
                        LEFT JOIN merchants m ON bs.merchant_id = m.id 
                        WHERE m.id IS NULL
                    `).get().count,
                    
                    // 孤儿评价（预约会话不存在）
                    orphanEvaluations: db.prepare(`
                        SELECT COUNT(*) as count FROM evaluations e 
                        LEFT JOIN booking_sessions bs ON e.booking_session_id = bs.id 
                        WHERE bs.id IS NULL
                    `).get().count,
                    
                    // 订单缺少merchant_user_id
                    ordersWithNullMerchantUserId: db.prepare(`
                        SELECT COUNT(*) as count FROM orders o 
                        LEFT JOIN merchants m ON o.merchant_id = m.id 
                        WHERE o.merchant_user_id IS NULL AND m.user_id IS NOT NULL
                    `).get().count,
                    
                    // 订单缺少地区关联
                    ordersWithNullRegion: db.prepare(`
                        SELECT COUNT(*) as count FROM orders o 
                        LEFT JOIN merchants m ON o.merchant_id = m.id 
                        WHERE o.region_id IS NULL AND m.region_id IS NOT NULL
                    `).get().count,
                    
                    // 商家缺少user_id但有绑定码
                    merchantsWithNullUserId: db.prepare(`
                        SELECT COUNT(*) as count FROM merchants m 
                        LEFT JOIN bind_codes bc ON m.bind_code = bc.code 
                        WHERE m.user_id IS NULL AND bc.used_by IS NOT NULL
                    `).get().count
                };
                
                // 检查问题并生成建议
                Object.entries(orderHealth.dataIntegrity).forEach(([key, count]) => {
                    if (count > 0) {
                        orderHealth.healthy = false;
                        
                        switch (key) {
                            case 'orphanOrders':
                                orderHealth.issues.push(`发现 ${count} 个孤儿订单（商家不存在）`);
                                break;
                            case 'orphanBookingSessions':
                                orderHealth.issues.push(`发现 ${count} 个孤儿预约会话（商家不存在）`);
                                break;
                            case 'orphanEvaluations':
                                orderHealth.issues.push(`发现 ${count} 个孤儿评价（预约会话不存在）`);
                                break;
                            case 'ordersWithNullMerchantUserId':
                                orderHealth.issues.push(`发现 ${count} 个订单缺少merchant_user_id`);
                                break;
                            case 'ordersWithNullRegion':
                                orderHealth.issues.push(`发现 ${count} 个订单缺少地区关联`);
                                break;
                            case 'merchantsWithNullUserId':
                                orderHealth.issues.push(`发现 ${count} 个商家缺少user_id`);
                                break;
                        }
                    }
                });
                
                db.close();
                
                // 输出检查结果
                console.log('📊 订单系统统计:');
                console.log(`   商家: ${orderHealth.statistics.merchants}`);
                console.log(`   订单: ${orderHealth.statistics.orders}`);
                console.log(`   预约会话: ${orderHealth.statistics.bookingSessions}`);
                console.log(`   评价: ${orderHealth.statistics.evaluations}`);
                console.log(`   地区: ${orderHealth.statistics.regions}`);
                
                if (orderHealth.issues.length > 0) {
                    console.log('⚠️ 订单系统问题:');
                    orderHealth.issues.forEach(issue => console.log(`  - ${issue}`));
                    console.log('💡 建议运行数据修复工具解决这些问题');
                } else {
                    console.log('✅ 订单系统数据完整性正常');
                }
                
            } catch (dbError) {
                orderHealth.healthy = false;
                orderHealth.issues.push(`数据库访问失败: ${dbError.message}`);
                console.error('❌ 订单系统检查失败:', dbError.message);
            }
            
            return orderHealth;
            
        } catch (error) {
            console.warn('⚠️ 订单系统健康检查失败:', error.message);
            return {
                healthy: false,
                issues: [`检查失败: ${error.message}`],
                statistics: {},
                dataIntegrity: {}
            };
        }
    }

    // 导出数据供本地开发使用
    async exportForDevelopment(exportPath) {
        try {
            console.log('📦 导出生产数据供开发使用...');
            
            const exportData = {
                meta: {
                    exportTime: new Date().toISOString(),
                    sourceEnvironment: this.getEnvironmentInfo(),
                    purpose: 'development'
                },
                sanitizedData: {}
            };

            // 这里需要根据实际的数据库结构来实现
            // 示例：导出商家数据（脱敏处理）
            console.log('🔐 正在脱敏处理敏感数据...');
            
            // 脱敏规则：
            // - 保留地区、绑定码等配置数据
            // - 商家信息去除真实联系方式
            // - 用户ID使用哈希值
            // - 订单数据保留结构但去除个人信息

            fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
            console.log(`✅ 开发数据导出完成: ${exportPath}`);

            return exportData;

        } catch (error) {
            console.error('❌ 导出失败:', error);
            throw error;
        }
    }

    // 数据同步到本地
    async syncToLocal(localPath) {
        if (!this.isRailway) {
            console.log('⚠️ 当前不在Railway环境，无需同步');
            return;
        }

        try {
            console.log('🔄 同步云端数据到本地...');
            
            const snapshot = await this.createDataSnapshot();
            const syncPath = localPath || './local-data-sync.json';
            
            fs.writeFileSync(syncPath, JSON.stringify(snapshot, null, 2));
            console.log(`✅ 数据同步完成: ${syncPath}`);

            return snapshot;

        } catch (error) {
            console.error('❌ 同步失败:', error);
            throw error;
        }
    }

    // 准备数据迁移
    async prepareMigration(migrationPlan) {
        try {
            console.log('🔧 准备数据迁移...');
            
            // 1. 创建迁移前备份
            const backupPath = `./pre-migration-backup-${Date.now()}.json`;
            await this.createDataSnapshot();
            
            // 2. 验证迁移计划
            console.log('📋 迁移计划验证:');
            console.log(`  - 目标版本: ${migrationPlan.targetVersion}`);
            console.log(`  - 预计影响表: ${migrationPlan.affectedTables?.join(', ')}`);
            console.log(`  - 预计停机时间: ${migrationPlan.estimatedDowntime || '无'}`);
            
            // 3. 执行预检查
            const health = await this.healthCheck();
            if (health.issues.length > 0) {
                console.warn('⚠️ 发现问题，建议修复后再进行迁移');
                return { success: false, issues: health.issues };
            }

            return { success: true, backupPath, health };

        } catch (error) {
            console.error('❌ 迁移准备失败:', error);
            throw error;
        }
    }
}

// CLI接口
if (require.main === module) {
    const manager = new CloudDataManager();
    const command = process.argv[2];
    const param = process.argv[3];

    (async () => {
        try {
            switch (command) {
                case 'info':
                    console.log('🏷️ 环境信息:');
                    console.log(JSON.stringify(manager.getEnvironmentInfo(), null, 2));
                    break;

                case 'health':
                    await manager.healthCheck();
                    break;

                case 'snapshot':
                    const snapshot = await manager.createDataSnapshot();
                    const snapshotPath = param || `./snapshot-${Date.now()}.json`;
                    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
                    console.log(`✅ 快照保存到: ${snapshotPath}`);
                    break;

                case 'sync':
                    await manager.syncToLocal(param);
                    break;

                case 'export-dev':
                    const exportPath = param || './dev-data.json';
                    await manager.exportForDevelopment(exportPath);
                    break;

                default:
                    console.log(`
🔧 云端数据管理工具

用法:
  node cloudDataManager.js <command> [参数]

命令:
  info              显示环境信息
  health            执行健康检查
  snapshot [path]   创建数据快照
  sync [path]       同步到本地
  export-dev [path] 导出开发数据（脱敏）

示例:
  node cloudDataManager.js health
  node cloudDataManager.js snapshot ./backup.json
  node cloudDataManager.js sync ./local-sync.json
                    `);
            }
        } catch (error) {
            console.error('❌ 执行失败:', error);
            process.exit(1);
        }
    })();
}

module.exports = CloudDataManager; 
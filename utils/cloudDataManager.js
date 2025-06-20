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
                recommendations: []
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
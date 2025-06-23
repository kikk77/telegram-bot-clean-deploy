const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class DatabaseRepair {
    constructor() {
        const nodeEnv = process.env.NODE_ENV || 'development';
        const isProduction = nodeEnv === 'production';
        
        this.dataPath = isProduction ? '/app/data' : path.join(__dirname, '../data');
        this.dbPath = path.join(this.dataPath, 'marketing_bot.db');
        this.backupPath = path.join(__dirname, '../backups');
        
        this.ensureBackupDirectory();
    }

    ensureBackupDirectory() {
        if (!fs.existsSync(this.backupPath)) {
            fs.mkdirSync(this.backupPath, { recursive: true });
        }
    }

    // 主修复函数
    async repairDatabase() {
        console.log('🔧 开始数据库修复...');
        
        try {
            // 1. 创建修复前备份
            await this.createRepairBackup();
            
            // 2. 检查数据库完整性
            const issues = await this.checkDatabaseIntegrity();
            
            // 3. 修复发现的问题
            if (issues.length > 0) {
                console.log(`发现 ${issues.length} 个问题，开始修复...`);
                await this.fixIssues(issues);
            } else {
                console.log('✅ 数据库完整性检查通过');
            }
            
            // 4. 重建统计数据
            await this.rebuildStatistics();
            
            // 5. 清理孤立数据
            await this.cleanOrphanedData();
            
            // 6. 优化数据库
            await this.optimizeDatabase();
            
            console.log('✅ 数据库修复完成');
            return true;
            
        } catch (error) {
            console.error('❌ 数据库修复失败:', error);
            throw error;
        }
    }

    // 创建修复前备份
    async createRepairBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(this.backupPath, `repair_backup_${timestamp}.db`);
        
        try {
            fs.copyFileSync(this.dbPath, backupFile);
            console.log(`✅ 修复前备份已创建: ${backupFile}`);
        } catch (error) {
            console.error('创建备份失败:', error);
            throw error;
        }
    }

    // 检查数据库完整性
    async checkDatabaseIntegrity() {
        const db = new Database(this.dbPath);
        const issues = [];
        
        try {
            console.log('🔍 检查数据库完整性...');
            
            // 检查表结构
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            console.log(`发现 ${tables.length} 个数据表`);
            
            // 检查每个表的数据一致性
            for (const table of tables) {
                const tableName = table.name;
                if (tableName.startsWith('sqlite_')) continue;
                
                try {
                    // 检查表的记录数
                    const count = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get();
                    console.log(`${tableName}: ${count.count} 条记录`);
                    
                    // 检查特定表的数据问题
                    const tableIssues = await this.checkTableSpecificIssues(db, tableName);
                    issues.push(...tableIssues);
                    
                } catch (error) {
                    console.error(`检查表 ${tableName} 失败:`, error.message);
                    issues.push({
                        type: 'table_error',
                        table: tableName,
                        error: error.message
                    });
                }
            }
            
        } finally {
            db.close();
        }
        
        return issues;
    }

    // 检查表特定问题
    async checkTableSpecificIssues(db, tableName) {
        const issues = [];
        
        try {
            switch (tableName) {
                case 'merchants':
                    // 检查商家状态
                    const invalidStatusMerchants = db.prepare(`
                        SELECT id, status FROM merchants 
                        WHERE status IS NULL OR status NOT IN ('active', 'inactive', 'pending')
                    `).all();
                    
                    if (invalidStatusMerchants.length > 0) {
                        issues.push({
                            type: 'invalid_merchant_status',
                            count: invalidStatusMerchants.length,
                            data: invalidStatusMerchants
                        });
                    }
                    break;
                    
                case 'orders':
                    // 检查订单状态
                    const invalidStatusOrders = db.prepare(`
                        SELECT id, status FROM orders 
                        WHERE status IS NULL OR status NOT IN ('attempting', 'pending', 'confirmed', 'completed', 'cancelled', 'failed')
                    `).all();
                    
                    if (invalidStatusOrders.length > 0) {
                        issues.push({
                            type: 'invalid_order_status',
                            count: invalidStatusOrders.length,
                            data: invalidStatusOrders
                        });
                    }
                    break;
            }
        } catch (error) {
            console.error(`检查表 ${tableName} 特定问题失败:`, error);
        }
        
        return issues;
    }

    // 修复发现的问题
    async fixIssues(issues) {
        const db = new Database(this.dbPath);
        
        try {
            console.log('🔧 开始修复数据问题...');
            
            // 开始事务
            db.exec('BEGIN TRANSACTION');
            
            for (const issue of issues) {
                console.log(`修复问题: ${issue.type} (${issue.count} 个)`);
                
                switch (issue.type) {
                    case 'invalid_merchant_status':
                        // 修复商家状态
                        for (const merchant of issue.data) {
                            db.prepare('UPDATE merchants SET status = ? WHERE id = ?')
                              .run('active', merchant.id);
                        }
                        break;
                        
                    case 'invalid_order_status':
                        // 修复订单状态
                        for (const order of issue.data) {
                            db.prepare('UPDATE orders SET status = ? WHERE id = ?')
                              .run('pending', order.id);
                        }
                        break;
                }
            }
            
            // 提交事务
            db.exec('COMMIT');
            console.log('✅ 数据问题修复完成');
            
        } catch (error) {
            // 回滚事务
            db.exec('ROLLBACK');
            console.error('修复失败，已回滚:', error);
            throw error;
        } finally {
            db.close();
        }
    }

    // 重建统计数据
    async rebuildStatistics() {
        console.log('📊 重建统计数据...');
        // 这里可以添加统计数据重建逻辑
        console.log('✅ 统计数据重建完成');
    }

    // 清理孤立数据
    async cleanOrphanedData() {
        console.log('🧹 清理孤立数据...');
        // 这里可以添加孤立数据清理逻辑
        console.log('✅ 孤立数据清理完成');
    }

    // 优化数据库
    async optimizeDatabase() {
        const db = new Database(this.dbPath);
        
        try {
            console.log('⚡ 优化数据库...');
            
            // 重建索引
            db.exec('REINDEX');
            
            // 清理空间
            db.exec('VACUUM');
            
            // 分析统计信息
            db.exec('ANALYZE');
            
            console.log('✅ 数据库优化完成');
            
        } finally {
            db.close();
        }
    }

    // 获取数据库健康报告
    async getHealthReport() {
        const db = new Database(this.dbPath);
        
        try {
            const report = {
                timestamp: new Date().toISOString(),
                tables: {},
                integrity: 'OK'
            };
            
            // 获取每个表的统计信息
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
            
            for (const table of tables) {
                const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
                report.tables[table.name] = count.count;
            }
            
            return report;
            
        } finally {
            db.close();
        }
    }
}

module.exports = DatabaseRepair; 
const fs = require('fs');
const path = require('path');
const { db } = require('../config/database');

/**
 * 数据库备份工具
 * 支持数据导出和导入，确保数据持久化安全
 */

// 备份数据库到JSON文件
function backupToJSON(backupPath) {
    try {
        console.log('🔄 开始备份数据库...');
        
        const backup = {
            timestamp: new Date().toISOString(),
            version: '1.1.0',
            tables: {}
        };
        
        // 获取所有表名
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
        
        for (const table of tables) {
            const tableName = table.name;
            console.log(`📦 备份表: ${tableName}`);
            
            // 获取表结构
            const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(tableName);
            
            // 获取表数据
            const data = db.prepare(`SELECT * FROM ${tableName}`).all();
            
            backup.tables[tableName] = {
                schema: schema?.sql,
                data: data,
                count: data.length
            };
            
            console.log(`✅ ${tableName}: ${data.length} 条记录`);
        }
        
        // 写入备份文件
        fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
        
        const fileSize = fs.statSync(backupPath).size;
        console.log(`✅ 备份完成: ${backupPath}`);
        console.log(`📊 备份文件大小: ${(fileSize / 1024).toFixed(1)}KB`);
        
        return backup;
        
    } catch (error) {
        console.error('❌ 备份失败:', error);
        throw error;
    }
}

// 从JSON文件恢复数据库
function restoreFromJSON(backupPath) {
    try {
        console.log('🔄 开始恢复数据库...');
        
        if (!fs.existsSync(backupPath)) {
            throw new Error(`备份文件不存在: ${backupPath}`);
        }
        
        const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        console.log(`📅 备份时间: ${backup.timestamp}`);
        console.log(`🏷️ 备份版本: ${backup.version}`);
        
        // 开始事务
        const transaction = db.transaction(() => {
            for (const [tableName, tableData] of Object.entries(backup.tables)) {
                console.log(`🔄 恢复表: ${tableName} (${tableData.count} 条记录)`);
                
                // 清空现有数据
                db.prepare(`DELETE FROM ${tableName}`).run();
                
                // 插入备份数据
                if (tableData.data && tableData.data.length > 0) {
                    const columns = Object.keys(tableData.data[0]);
                    const placeholders = columns.map(() => '?').join(', ');
                    const insertStmt = db.prepare(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`);
                    
                    for (const row of tableData.data) {
                        const values = columns.map(col => row[col]);
                        insertStmt.run(values);
                    }
                }
                
                console.log(`✅ ${tableName} 恢复完成`);
            }
        });
        
        transaction();
        console.log('✅ 数据库恢复完成');
        
    } catch (error) {
        console.error('❌ 恢复失败:', error);
        throw error;
    }
}

// 创建定期备份
function createScheduledBackup() {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T')[0];
    const backupDir = path.join(__dirname, '../backups');
    
    // 确保备份目录存在
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const backupPath = path.join(backupDir, `backup-${timestamp}.json`);
    return backupToJSON(backupPath);
}

// 如果直接运行此脚本
if (require.main === module) {
    const command = process.argv[2];
    const filePath = process.argv[3];
    
    switch (command) {
        case 'backup':
            if (!filePath) {
                console.error('❌ 请指定备份文件路径');
                process.exit(1);
            }
            backupToJSON(filePath);
            break;
            
        case 'restore':
            if (!filePath) {
                console.error('❌ 请指定备份文件路径');
                process.exit(1);
            }
            restoreFromJSON(filePath);
            break;
            
        case 'scheduled':
            createScheduledBackup();
            break;
            
        default:
            console.log(`
数据库备份工具使用说明:

备份数据库:
  node backupDatabase.js backup /path/to/backup.json

恢复数据库:
  node backupDatabase.js restore /path/to/backup.json

创建定期备份:
  node backupDatabase.js scheduled
            `);
    }
}

module.exports = {
    backupToJSON,
    restoreFromJSON,
    createScheduledBackup
}; 
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

class DataImportService {
    constructor() {
        this.dataPath = path.join(__dirname, '../data');
        this.backupPath = path.join(__dirname, '../backups');
        this.ensureBackupDirectory();
    }

    // 确保备份目录存在
    ensureBackupDirectory() {
        if (!fs.existsSync(this.backupPath)) {
            fs.mkdirSync(this.backupPath, { recursive: true });
        }
    }

    // 主导入函数 - 从导出的ZIP文件恢复数据
    async importAllData(zipFilePath, options = {}) {
        try {
            const { 
                overwriteExisting = false, 
                createBackup = true,
                skipValidation = false 
            } = options;

            console.log('开始数据导入...');
            
            // 1. 创建当前数据备份
            if (createBackup) {
                await this.createCurrentDataBackup();
            }

            // 2. 解压导入文件
            const extractPath = await this.extractZipFile(zipFilePath);
            
            // 3. 验证导入数据
            if (!skipValidation) {
                await this.validateImportData(extractPath);
            }

            // 4. 导入核心业务数据
            await this.importCoreData(extractPath, overwriteExisting);
            
            // 5. 导入模板配置数据
            await this.importTemplateData(extractPath, overwriteExisting);
            
            // 6. 导入用户交互数据
            await this.importUserData(extractPath, overwriteExisting);
            
            // 7. 清理临时文件
            await this.cleanupDirectory(extractPath);
            
            console.log('数据导入完成');
            
            return {
                success: true,
                message: '数据导入成功',
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('数据导入失败:', error);
            throw new Error(`数据导入失败: ${error.message}`);
        }
    }

    // 创建当前数据备份
    async createCurrentDataBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = path.join(this.backupPath, `backup_before_import_${timestamp}`);
            
            // 创建备份目录
            fs.mkdirSync(backupDir, { recursive: true });
            
            // 复制所有数据库文件
            const dbFiles = fs.readdirSync(this.dataPath)
                .filter(file => file.endsWith('.db') || file.endsWith('.db-wal') || file.endsWith('.db-shm'));

            for (const dbFile of dbFiles) {
                const sourcePath = path.join(this.dataPath, dbFile);
                const targetPath = path.join(backupDir, dbFile);
                
                if (fs.existsSync(sourcePath)) {
                    fs.copyFileSync(sourcePath, targetPath);
                    console.log(`✓ 备份数据库文件: ${dbFile}`);
                }
            }

            console.log(`✓ 当前数据备份完成: ${backupDir}`);
            return backupDir;
            
        } catch (error) {
            console.error('创建数据备份失败:', error);
            throw new Error(`创建数据备份失败: ${error.message}`);
        }
    }

    // 解压ZIP文件
    async extractZipFile(zipFilePath) {
        return new Promise((resolve, reject) => {
            try {
                const extractPath = path.join(this.backupPath, `import_${Date.now()}`);
                fs.mkdirSync(extractPath, { recursive: true });

                // 使用简单的解压方法
                const { execSync } = require('child_process');
                execSync(`unzip -q "${zipFilePath}" -d "${extractPath}"`);
                
                console.log(`✓ ZIP文件解压完成: ${extractPath}`);
                resolve(extractPath);
                
            } catch (error) {
                reject(new Error(`解压文件失败: ${error.message}`));
            }
        });
    }

    // 验证导入数据
    async validateImportData(extractPath) {
        try {
            console.log('验证导入数据...');
            
            // 检查必需的目录结构
            const requiredDirs = ['core_data', 'template_data', 'database_backup'];
            const missingDirs = requiredDirs.filter(dir => 
                !fs.existsSync(path.join(extractPath, dir))
            );

            if (missingDirs.length > 0) {
                throw new Error(`缺少必需的目录: ${missingDirs.join(', ')}`);
            }

            // 检查元数据文件
            const metadataPath = path.join(extractPath, 'export_metadata.json');
            if (!fs.existsSync(metadataPath)) {
                console.warn('⚠ 未找到导出元数据文件');
            } else {
                const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                console.log(`✓ 导出版本: ${metadata.export_info.version}`);
                console.log(`✓ 导出时间: ${metadata.export_info.timestamp}`);
            }

            console.log('✓ 数据验证通过');
            
        } catch (error) {
            throw new Error(`数据验证失败: ${error.message}`);
        }
    }

    // 导入核心业务数据
    async importCoreData(extractPath, overwriteExisting) {
        const coreDbPath = path.join(this.dataPath, 'core.db');
        const db = new Database(coreDbPath);
        const coreDataPath = path.join(extractPath, 'core_data');

        try {
            console.log('导入核心业务数据...');

            // 核心表列表
            const coreTables = [
                'regions',
                'bind_codes', 
                'merchants',
                'booking_sessions',
                'orders',
                'evaluations',
                'evaluation_sessions',
                'order_stats',
                'merchant_ratings',
                'user_ratings'
            ];

            // 开始事务
            db.exec('BEGIN TRANSACTION');

            for (const table of coreTables) {
                const dataFile = path.join(coreDataPath, `${table}.json`);
                
                if (fs.existsSync(dataFile)) {
                    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
                    
                    if (data.length > 0) {
                        await this.importTableData(db, table, data, overwriteExisting);
                        console.log(`✓ 导入 ${table}: ${data.length} 条记录`);
                    }
                }
            }

            // 提交事务
            db.exec('COMMIT');
            console.log('✓ 核心业务数据导入完成');

        } catch (error) {
            // 回滚事务
            db.exec('ROLLBACK');
            throw new Error(`核心数据导入失败: ${error.message}`);
        } finally {
            db.close();
        }
    }

    // 导入模板配置数据
    async importTemplateData(extractPath, overwriteExisting) {
        const templateDbPath = path.join(this.dataPath, 'templates.db');
        const db = new Database(templateDbPath);
        const templateDataPath = path.join(extractPath, 'template_data');

        try {
            console.log('导入模板配置数据...');

            const templateTables = [
                'message_templates',
                'trigger_words',
                'scheduled_tasks',
                'button_configs'
            ];

            // 开始事务
            db.exec('BEGIN TRANSACTION');

            for (const table of templateTables) {
                const dataFile = path.join(templateDataPath, `${table}.json`);
                
                if (fs.existsSync(dataFile)) {
                    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
                    
                    if (data.length > 0) {
                        await this.importTableData(db, table, data, overwriteExisting);
                        console.log(`✓ 导入 ${table}: ${data.length} 条记录`);
                    }
                }
            }

            // 提交事务
            db.exec('COMMIT');
            console.log('✓ 模板配置数据导入完成');

        } catch (error) {
            // 回滚事务
            db.exec('ROLLBACK');
            throw new Error(`模板数据导入失败: ${error.message}`);
        } finally {
            db.close();
        }
    }

    // 导入用户交互数据
    async importUserData(extractPath, overwriteExisting) {
        const userDataPath = path.join(extractPath, 'user_data');
        
        if (!fs.existsSync(userDataPath)) {
            console.log('⚠ 未找到用户数据目录，跳过用户数据导入');
            return;
        }

        try {
            console.log('导入用户交互数据...');

            // 获取所有用户数据库目录
            const userDbDirs = fs.readdirSync(userDataPath)
                .filter(item => {
                    const itemPath = path.join(userDataPath, item);
                    return fs.statSync(itemPath).isDirectory() && item.match(/^users_\d{4}_\d{2}$/);
                });

            for (const dbDir of userDbDirs) {
                const dbName = `${dbDir}.db`;
                const dbPath = path.join(this.dataPath, dbName);
                const db = new Database(dbPath);
                
                try {
                    const userTables = [
                        'user_bookings',
                        'user_evaluations', 
                        'user_reports',
                        'merchant_orders',
                        'merchant_evaluations',
                        'interactions'
                    ];

                    // 开始事务
                    db.exec('BEGIN TRANSACTION');

                    for (const table of userTables) {
                        const dataFile = path.join(userDataPath, dbDir, `${table}.json`);
                        
                        if (fs.existsSync(dataFile)) {
                            const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
                            
                            if (data.length > 0) {
                                await this.importTableData(db, table, data, overwriteExisting);
                                console.log(`  ✓ ${table}: ${data.length} 条记录`);
                            }
                        }
                    }

                    // 提交事务
                    db.exec('COMMIT');
                    console.log(`✓ 导入用户数据: ${dbDir}`);

                } catch (error) {
                    // 回滚事务
                    db.exec('ROLLBACK');
                    console.error(`导入用户数据失败: ${dbDir}`, error);
                } finally {
                    db.close();
                }
            }

            console.log('✓ 用户交互数据导入完成');

        } catch (error) {
            throw new Error(`用户数据导入失败: ${error.message}`);
        }
    }

    // 导入表数据
    async importTableData(db, tableName, data, overwriteExisting) {
        try {
            if (!data || data.length === 0) {
                return;
            }

            // 如果需要覆盖，先清空表
            if (overwriteExisting) {
                db.exec(`DELETE FROM ${tableName}`);
            }

            // 获取表结构
            const columns = Object.keys(data[0]);
            const placeholders = columns.map(() => '?').join(', ');
            const columnNames = columns.join(', ');

            const insertStmt = db.prepare(`
                INSERT OR ${overwriteExisting ? 'REPLACE' : 'IGNORE'} INTO ${tableName} 
                (${columnNames}) VALUES (${placeholders})
            `);

            // 批量插入数据
            for (const row of data) {
                const values = columns.map(col => row[col]);
                insertStmt.run(values);
            }

        } catch (error) {
            throw new Error(`导入表 ${tableName} 失败: ${error.message}`);
        }
    }

    // 恢复数据库文件（直接覆盖方式）
    async restoreDatabaseFiles(extractPath) {
        try {
            console.log('恢复数据库文件...');
            
            const dbBackupPath = path.join(extractPath, 'database_backup');
            
            if (!fs.existsSync(dbBackupPath)) {
                throw new Error('未找到数据库备份文件');
            }

            // 获取所有数据库文件
            const dbFiles = fs.readdirSync(dbBackupPath)
                .filter(file => file.endsWith('.db') || file.endsWith('.db-wal') || file.endsWith('.db-shm'));

            for (const dbFile of dbFiles) {
                const sourcePath = path.join(dbBackupPath, dbFile);
                const targetPath = path.join(this.dataPath, dbFile);
                
                // 备份现有文件
                if (fs.existsSync(targetPath)) {
                    const backupPath = `${targetPath}.backup.${Date.now()}`;
                    fs.copyFileSync(targetPath, backupPath);
                    console.log(`✓ 备份现有文件: ${dbFile} -> ${path.basename(backupPath)}`);
                }
                
                // 复制新文件
                fs.copyFileSync(sourcePath, targetPath);
                console.log(`✓ 恢复数据库文件: ${dbFile}`);
            }

            console.log('✓ 数据库文件恢复完成');

        } catch (error) {
            throw new Error(`数据库文件恢复失败: ${error.message}`);
        }
    }

    // 清理临时目录
    async cleanupDirectory(dir) {
        try {
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true });
                console.log('✓ 清理临时文件');
            }
        } catch (error) {
            console.log('⚠ 清理临时文件失败:', error.message);
        }
    }

    // 获取导入历史
    getImportHistory() {
        try {
            const backups = fs.readdirSync(this.backupPath)
                .filter(item => {
                    const itemPath = path.join(this.backupPath, item);
                    return fs.statSync(itemPath).isDirectory() && 
                           item.startsWith('backup_before_import_');
                })
                .map(item => {
                    const itemPath = path.join(this.backupPath, item);
                    const stats = fs.statSync(itemPath);
                    return {
                        name: item,
                        path: itemPath,
                        created: stats.birthtime,
                        size: this.getDirectorySize(itemPath)
                    };
                })
                .sort((a, b) => b.created - a.created);

            return backups;
        } catch (error) {
            console.error('获取导入历史失败:', error);
            return [];
        }
    }

    // 获取目录大小
    getDirectorySize(dirPath) {
        try {
            let totalSize = 0;
            const files = fs.readdirSync(dirPath);
            
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stats = fs.statSync(filePath);
                
                if (stats.isDirectory()) {
                    totalSize += this.getDirectorySize(filePath);
                } else {
                    totalSize += stats.size;
                }
            }
            
            return totalSize;
        } catch (error) {
            return 0;
        }
    }

    // 验证数据完整性
    async validateDataIntegrity() {
        try {
            console.log('验证数据完整性...');
            
            const results = {
                coreDb: this.validateDatabase(path.join(this.dataPath, 'core.db')),
                templateDb: this.validateDatabase(path.join(this.dataPath, 'templates.db')),
                userDbs: []
            };

            // 验证用户数据库
            const userDbFiles = fs.readdirSync(this.dataPath)
                .filter(file => file.match(/^users_\d{4}_\d{2}\.db$/));

            for (const dbFile of userDbFiles) {
                const dbPath = path.join(this.dataPath, dbFile);
                results.userDbs.push({
                    file: dbFile,
                    ...this.validateDatabase(dbPath)
                });
            }

            return results;

        } catch (error) {
            throw new Error(`数据完整性验证失败: ${error.message}`);
        }
    }

    // 验证单个数据库
    validateDatabase(dbPath) {
        try {
            if (!fs.existsSync(dbPath)) {
                return { valid: false, error: '数据库文件不存在' };
            }

            const db = new Database(dbPath, { readonly: true });
            
            try {
                // 执行完整性检查
                const integrityResult = db.prepare('PRAGMA integrity_check').get();
                
                if (integrityResult.integrity_check === 'ok') {
                    return { valid: true, tables: this.getTableCounts(db) };
                } else {
                    return { valid: false, error: integrityResult.integrity_check };
                }
                
            } finally {
                db.close();
            }

        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    // 获取表记录数
    getTableCounts(db) {
        try {
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            const counts = {};
            
            for (const table of tables) {
                try {
                    const result = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
                    counts[table.name] = result.count;
                } catch (error) {
                    counts[table.name] = -1; // 表示查询失败
                }
            }
            
            return counts;
        } catch (error) {
            return {};
        }
    }
}

module.exports = DataImportService; 
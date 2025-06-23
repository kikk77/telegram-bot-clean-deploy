const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { promisify } = require('util');
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

class DataExportService {
    constructor() {
        // 适应实际的数据库结构
        const nodeEnv = process.env.NODE_ENV || 'development';
        const isProduction = nodeEnv === 'production';
        
        // 在生产环境使用Railway Volume路径，开发环境使用本地路径
        this.dataPath = isProduction ? '/app/data' : path.join(__dirname, '../data');
        this.exportPath = path.join(__dirname, '../exports');
        this.dbPath = path.join(this.dataPath, 'marketing_bot.db');
        
        this.ensureExportDirectory();
    }

    // 确保导出目录存在
    ensureExportDirectory() {
        if (!fs.existsSync(this.exportPath)) {
            fs.mkdirSync(this.exportPath, { recursive: true });
        }
    }

    // 主导出函数 - 导出所有数据
    async exportAllData(format = 'json') {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const exportDir = path.join(this.exportPath, `export_${timestamp}`);
            
            // 创建导出目录
            await mkdir(exportDir, { recursive: true });
            
            console.log('开始数据导出...');
            
            // 1. 导出所有业务数据（从单一数据库）
            await this.exportAllBusinessData(exportDir, format);
            
            // 2. 导出数据库文件备份
            await this.exportDatabaseFiles(exportDir);
            
            // 3. 生成导出元数据
            await this.generateExportMetadata(exportDir);
            
            // 4. 创建压缩包
            const zipPath = await this.createZipArchive(exportDir, `export_${timestamp}.zip`);
            
            // 5. 清理临时目录
            await this.cleanupDirectory(exportDir);
            
            console.log(`数据导出完成: ${zipPath}`);
            
            return {
                success: true,
                exportPath: zipPath,
                timestamp: timestamp,
                message: '数据导出成功'
            };
            
        } catch (error) {
            console.error('数据导出失败:', error);
            throw new Error(`数据导出失败: ${error.message}`);
        }
    }

    // 导出所有业务数据（从单一数据库）
    async exportAllBusinessData(exportDir, format) {
        if (!fs.existsSync(this.dbPath)) {
            console.log('主数据库不存在，跳过导出');
            return;
        }

        const db = new Database(this.dbPath, { readonly: true });
        
        try {
            // 创建数据目录
            const dataDir = path.join(exportDir, 'business_data');
            await mkdir(dataDir, { recursive: true });

            // 获取所有表名
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
            const tableNames = tables.map(t => t.name);
            
            console.log(`发现 ${tableNames.length} 个数据表:`, tableNames);
            
            // 按类别分组导出表数据
            const tableCategories = {
                core_business: ['regions', 'bind_codes', 'merchants', 'orders', 'evaluations', 'booking_sessions', 'evaluation_sessions'],
                configuration: ['message_templates', 'trigger_words', 'scheduled_tasks', 'buttons', 'db_meta'],
                statistics: ['order_stats', 'merchant_ratings', 'user_ratings'],
                interactions: ['user_bookings', 'user_evaluations', 'user_reports', 'merchant_orders', 'merchant_evaluations', 'interactions']
            };

            for (const [category, categoryTables] of Object.entries(tableCategories)) {
                const categoryDir = path.join(dataDir, category);
                await mkdir(categoryDir, { recursive: true });
                
                console.log(`导出 ${category} 数据...`);
                
                for (const tableName of categoryTables) {
                    if (tableNames.includes(tableName)) {
                        try {
                            const data = db.prepare(`SELECT * FROM ${tableName}`).all();
                            
                            if (format === 'json') {
                                await writeFile(
                                    path.join(categoryDir, `${tableName}.json`),
                                    JSON.stringify(data, null, 2),
                                    'utf8'
                                );
                            } else if (format === 'csv') {
                                await this.exportToCSV(data, path.join(categoryDir, `${tableName}.csv`));
                            }
                            
                            console.log(`✓ 导出 ${tableName}: ${data.length} 条记录`);
                        } catch (error) {
                            console.log(`⚠ 表 ${tableName} 导出失败:`, error.message);
                        }
                    }
                }
            }

            // 导出其他未分类的表
            const uncategorizedTables = tableNames.filter(name => 
                !Object.values(tableCategories).flat().includes(name)
            );
            
            if (uncategorizedTables.length > 0) {
                const otherDir = path.join(dataDir, 'other_tables');
                await mkdir(otherDir, { recursive: true });
                
                console.log('导出其他表数据...');
                for (const tableName of uncategorizedTables) {
                    try {
                        const data = db.prepare(`SELECT * FROM ${tableName}`).all();
                        
                        if (format === 'json') {
                            await writeFile(
                                path.join(otherDir, `${tableName}.json`),
                                JSON.stringify(data, null, 2),
                                'utf8'
                            );
                        }
                        
                        console.log(`✓ 导出 ${tableName}: ${data.length} 条记录`);
                    } catch (error) {
                        console.log(`⚠ 表 ${tableName} 导出失败:`, error.message);
                    }
                }
            }

            // 导出关键统计信息
            await this.exportDatabaseStatistics(db, dataDir);

        } finally {
            db.close();
        }
    }

    // 导出数据库统计信息
    async exportDatabaseStatistics(db, dataDir) {
        const stats = {
            export_time: new Date().toISOString(),
            database_info: {
                total_regions: this.safeQuery(db, 'SELECT COUNT(*) as count FROM regions')?.count || 0,
                total_merchants: this.safeQuery(db, 'SELECT COUNT(*) as count FROM merchants')?.count || 0,
                active_merchants: this.safeQuery(db, 'SELECT COUNT(*) as count FROM merchants WHERE status = "active"')?.count || 0,
                total_bind_codes: this.safeQuery(db, 'SELECT COUNT(*) as count FROM bind_codes')?.count || 0,
                used_bind_codes: this.safeQuery(db, 'SELECT COUNT(*) as count FROM bind_codes WHERE used = 1')?.count || 0,
                total_orders: this.safeQuery(db, 'SELECT COUNT(*) as count FROM orders')?.count || 0,
                total_evaluations: this.safeQuery(db, 'SELECT COUNT(*) as count FROM evaluations')?.count || 0,
                total_templates: this.safeQuery(db, 'SELECT COUNT(*) as count FROM message_templates')?.count || 0
            },
            table_summary: this.getAllTableCounts(db),
            merchant_summary: this.safeQuery(db, `
                SELECT 
                    r.name as region_name,
                    COUNT(m.id) as merchant_count,
                    COUNT(CASE WHEN m.status = 'active' THEN 1 END) as active_count
                FROM regions r 
                LEFT JOIN merchants m ON r.id = m.region_id 
                GROUP BY r.id, r.name
                ORDER BY merchant_count DESC
            `) || []
        };

        await writeFile(
            path.join(dataDir, 'database_statistics.json'),
            JSON.stringify(stats, null, 2),
            'utf8'
        );

        console.log('✓ 导出数据库统计信息');
    }

    // 获取所有表的记录数
    getAllTableCounts(db) {
        try {
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
            const counts = {};
            
            for (const table of tables) {
                try {
                    const result = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
                    counts[table.name] = result.count;
                } catch (error) {
                    counts[table.name] = 'ERROR: ' + error.message;
                }
            }
            
            return counts;
        } catch (error) {
            console.error('获取表记录数失败:', error);
            return {};
        }
    }

    // 安全查询（防止表不存在错误）
    safeQuery(db, query) {
        try {
            const result = db.prepare(query).get();
            return result || null;
        } catch (error) {
            console.log(`查询失败: ${query}`, error.message);
            return null;
        }
    }

    // 导出数据库文件备份
    async exportDatabaseFiles(exportDir) {
        const dbBackupDir = path.join(exportDir, 'database_backup');
        await mkdir(dbBackupDir, { recursive: true });

        console.log('备份数据库文件...');

        // 获取所有数据库文件（包括WAL和SHM文件）
        const dbFiles = fs.readdirSync(this.dataPath)
            .filter(file => file.endsWith('.db') || file.endsWith('.db-wal') || file.endsWith('.db-shm'));

        for (const dbFile of dbFiles) {
            const sourcePath = path.join(this.dataPath, dbFile);
            const targetPath = path.join(dbBackupDir, dbFile);
            
            try {
                if (fs.existsSync(sourcePath)) {
                    fs.copyFileSync(sourcePath, targetPath);
                    console.log(`✓ 备份数据库文件: ${dbFile}`);
                }
            } catch (error) {
                console.log(`⚠ 备份失败: ${dbFile}`, error.message);
            }
        }
    }

    // 生成导出元数据
    async generateExportMetadata(exportDir) {
        const metadata = {
            export_info: {
                timestamp: new Date().toISOString(),
                version: '1.1.0',
                system: 'Telegram Bot - 小鸡预约系统',
                export_type: 'complete_backup',
                database_structure: 'single_database',
                main_database: 'marketing_bot.db'
            },
            file_structure: {
                business_data: {
                    core_business: '核心业务数据（地区、商家、订单、评价等）',
                    configuration: '配置数据（消息模板、触发词、按钮等）',
                    statistics: '统计数据（评分汇总等）',
                    interactions: '交互数据（用户预约、评价等）',
                    other_tables: '其他未分类表数据'
                },
                database_backup: '原始数据库文件备份（marketing_bot.db及相关文件）',
                database_statistics: '数据库统计信息和表记录数汇总'
            },
            restoration_guide: {
                description: '数据恢复指南',
                methods: {
                    method1_database_files: {
                        title: '方法1：直接恢复数据库文件（推荐）',
                        steps: [
                            '1. 停止Bot服务',
                            '2. 备份当前data目录',
                            '3. 将database_backup中的文件复制到data目录',
                            '4. 重启Bot服务',
                            '5. 验证数据完整性'
                        ]
                    },
                    method2_json_import: {
                        title: '方法2：使用JSON数据导入',
                        steps: [
                            '1. 停止Bot服务',
                            '2. 备份当前数据库',
                            '3. 使用导入脚本从business_data中的JSON文件恢复',
                            '4. 重启Bot服务',
                            '5. 验证数据完整性'
                        ]
                    }
                }
            },
            railway_deployment: {
                title: 'Railway云端部署恢复',
                notes: [
                    '在Railway中，数据存储在持久化Volume中',
                    '可以通过Railway CLI或管理界面访问数据',
                    '推荐定期导出数据作为备份',
                    '系统支持自动数据迁移，无需手动操作'
                ],
                volume_path: '/app/data',
                backup_frequency: '建议每月导出一次完整备份'
            },
            important_notes: [
                '此备份包含所有用户数据和商家信息',
                '恢复前请确保停止所有Bot服务',
                '建议在测试环境先验证备份完整性',
                '定期进行数据备份以防数据丢失',
                '系统已内置自动数据迁移机制，升级时会自动处理数据兼容性'
            ]
        };

        await writeFile(
            path.join(exportDir, 'export_metadata.json'),
            JSON.stringify(metadata, null, 2),
            'utf8'
        );

        console.log('✓ 生成导出元数据');
    }

    // 创建ZIP压缩包
    async createZipArchive(sourceDir, zipFileName) {
        return new Promise((resolve, reject) => {
            const zipPath = path.join(this.exportPath, zipFileName);
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => {
                console.log(`✓ 创建压缩包: ${zipFileName} (${archive.pointer()} bytes)`);
                resolve(zipPath);
            });

            archive.on('error', (err) => {
                reject(err);
            });

            archive.pipe(output);
            archive.directory(sourceDir, false);
            archive.finalize();
        });
    }

    // 清理临时目录
    async cleanupDirectory(dir) {
        try {
            fs.rmSync(dir, { recursive: true, force: true });
            console.log('✓ 清理临时文件');
        } catch (error) {
            console.log('⚠ 清理临时文件失败:', error.message);
        }
    }

    // 导出为CSV格式
    async exportToCSV(data, filePath) {
        if (!data || data.length === 0) {
            await writeFile(filePath, '', 'utf8');
            return;
        }

        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => 
                headers.map(header => {
                    const value = row[header];
                    if (value === null || value === undefined) return '';
                    if (typeof value === 'string' && value.includes(',')) {
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                    return String(value);
                }).join(',')
            )
        ].join('\n');

        await writeFile(filePath, csvContent, 'utf8');
    }

    // 获取导出历史
    getExportHistory() {
        try {
            const files = fs.readdirSync(this.exportPath)
                .filter(file => file.startsWith('export_') && file.endsWith('.zip'))
                .map(file => {
                    const stats = fs.statSync(path.join(this.exportPath, file));
                    return {
                        filename: file,
                        size: stats.size,
                        created: stats.birthtime,
                        path: path.join(this.exportPath, file)
                    };
                })
                .sort((a, b) => b.created - a.created);

            return files;
        } catch (error) {
            console.error('获取导出历史失败:', error);
            return [];
        }
    }

    // 清理旧的导出文件（保留最近N个）
    cleanupOldExports(keepCount = 5) {
        try {
            const exports = this.getExportHistory();
            const toDelete = exports.slice(keepCount);

            for (const exportFile of toDelete) {
                fs.unlinkSync(exportFile.path);
                console.log(`✓ 删除旧导出文件: ${exportFile.filename}`);
            }

            return toDelete.length;
        } catch (error) {
            console.error('清理旧导出文件失败:', error);
            return 0;
        }
    }

    // 验证导出文件完整性
    async validateExport(zipPath) {
        // 这里可以添加ZIP文件完整性验证逻辑
        try {
            const stats = fs.statSync(zipPath);
            return {
                valid: true,
                size: stats.size,
                created: stats.birthtime
            };
        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }
}

module.exports = DataExportService; 
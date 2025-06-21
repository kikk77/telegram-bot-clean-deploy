const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { promisify } = require('util');
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

class DataExportService {
    constructor() {
        this.dataPath = path.join(__dirname, '../data');
        this.exportPath = path.join(__dirname, '../exports');
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
            
            // 1. 导出核心业务数据
            await this.exportCoreData(exportDir, format);
            
            // 2. 导出模板配置数据
            await this.exportTemplateData(exportDir, format);
            
            // 3. 导出用户交互数据（所有月份）
            await this.exportUserData(exportDir, format);
            
            // 4. 导出数据库文件备份
            await this.exportDatabaseFiles(exportDir);
            
            // 5. 生成导出元数据
            await this.generateExportMetadata(exportDir);
            
            // 6. 创建压缩包
            const zipPath = await this.createZipArchive(exportDir, `export_${timestamp}.zip`);
            
            // 7. 清理临时目录
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

    // 导出核心业务数据
    async exportCoreData(exportDir, format) {
        const coreDbPath = path.join(this.dataPath, 'core.db');
        if (!fs.existsSync(coreDbPath)) {
            console.log('核心数据库不存在，跳过导出');
            return;
        }

        const db = new Database(coreDbPath, { readonly: true });
        const coreDir = path.join(exportDir, 'core_data');
        await mkdir(coreDir, { recursive: true });

        try {
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

            console.log('导出核心业务数据...');
            
            for (const table of coreTables) {
                try {
                    const data = db.prepare(`SELECT * FROM ${table}`).all();
                    
                    if (format === 'json') {
                        await writeFile(
                            path.join(coreDir, `${table}.json`),
                            JSON.stringify(data, null, 2),
                            'utf8'
                        );
                    } else if (format === 'csv') {
                        await this.exportToCSV(data, path.join(coreDir, `${table}.csv`));
                    }
                    
                    console.log(`✓ 导出 ${table}: ${data.length} 条记录`);
                } catch (error) {
                    console.log(`⚠ 表 ${table} 不存在或导出失败:`, error.message);
                }
            }

            // 导出关键统计信息
            await this.exportCoreStatistics(db, coreDir);

        } finally {
            db.close();
        }
    }

    // 导出核心统计信息
    async exportCoreStatistics(db, coreDir) {
        const stats = {
            export_time: new Date().toISOString(),
            database_info: {
                total_regions: this.safeQuery(db, 'SELECT COUNT(*) as count FROM regions').count || 0,
                total_merchants: this.safeQuery(db, 'SELECT COUNT(*) as count FROM merchants').count || 0,
                active_merchants: this.safeQuery(db, 'SELECT COUNT(*) as count FROM merchants WHERE status = "active"').count || 0,
                total_orders: this.safeQuery(db, 'SELECT COUNT(*) as count FROM orders').count || 0,
                completed_orders: this.safeQuery(db, 'SELECT COUNT(*) as count FROM orders o LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id WHERE bs.user_course_status = "completed"').count || 0,
                total_evaluations: this.safeQuery(db, 'SELECT COUNT(*) as count FROM evaluations').count || 0,
                unused_bind_codes: this.safeQuery(db, 'SELECT COUNT(*) as count FROM bind_codes WHERE used = 0').count || 0
            },
            merchant_summary: this.safeQuery(db, `
                SELECT 
                    r.name as region_name,
                    COUNT(m.id) as merchant_count,
                    COUNT(CASE WHEN m.status = 'active' THEN 1 END) as active_count
                FROM regions r 
                LEFT JOIN merchants m ON r.id = m.region_id 
                GROUP BY r.id, r.name
                ORDER BY merchant_count DESC
            `) || [],
            order_summary: this.safeQuery(db, `
                SELECT 
                    DATE(datetime(o.created_at, 'unixepoch')) as order_date,
                    COUNT(*) as daily_orders,
                    COUNT(CASE WHEN bs.user_course_status = 'completed' THEN 1 END) as completed_orders
                FROM orders o
                LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id
                WHERE o.created_at >= strftime('%s', 'now', '-30 days')
                GROUP BY DATE(datetime(o.created_at, 'unixepoch'))
                ORDER BY order_date DESC
            `) || []
        };

        await writeFile(
            path.join(coreDir, 'statistics.json'),
            JSON.stringify(stats, null, 2),
            'utf8'
        );

        console.log('✓ 导出核心统计信息');
    }

    // 安全查询（防止表不存在错误）
    safeQuery(db, query) {
        try {
            return db.prepare(query).get() || db.prepare(query).all();
        } catch (error) {
            console.log(`查询失败: ${query}`, error.message);
            return null;
        }
    }

    // 导出模板配置数据
    async exportTemplateData(exportDir, format) {
        const templateDbPath = path.join(this.dataPath, 'templates.db');
        if (!fs.existsSync(templateDbPath)) {
            console.log('模板数据库不存在，跳过导出');
            return;
        }

        const db = new Database(templateDbPath, { readonly: true });
        const templateDir = path.join(exportDir, 'template_data');
        await mkdir(templateDir, { recursive: true });

        try {
            const templateTables = [
                'message_templates',
                'trigger_words',
                'scheduled_tasks',
                'button_configs'
            ];

            console.log('导出模板配置数据...');

            for (const table of templateTables) {
                try {
                    const data = db.prepare(`SELECT * FROM ${table}`).all();
                    
                    if (format === 'json') {
                        await writeFile(
                            path.join(templateDir, `${table}.json`),
                            JSON.stringify(data, null, 2),
                            'utf8'
                        );
                    }
                    
                    console.log(`✓ 导出 ${table}: ${data.length} 条记录`);
                } catch (error) {
                    console.log(`⚠ 表 ${table} 不存在或导出失败:`, error.message);
                }
            }

        } finally {
            db.close();
        }
    }

    // 导出用户交互数据（所有月份）
    async exportUserData(exportDir, format) {
        const userDir = path.join(exportDir, 'user_data');
        await mkdir(userDir, { recursive: true });

        // 获取所有用户数据库文件
        const userDbFiles = fs.readdirSync(this.dataPath)
            .filter(file => file.match(/^users_\d{4}_\d{2}\.db$/));

        console.log(`发现 ${userDbFiles.length} 个用户数据库文件`);

        for (const dbFile of userDbFiles) {
            const dbPath = path.join(this.dataPath, dbFile);
            const db = new Database(dbPath, { readonly: true });
            
            try {
                const monthDir = path.join(userDir, dbFile.replace('.db', ''));
                await mkdir(monthDir, { recursive: true });

                const userTables = [
                    'user_bookings',
                    'user_evaluations', 
                    'user_reports',
                    'merchant_orders',
                    'merchant_evaluations',
                    'interactions'
                ];

                console.log(`导出用户数据: ${dbFile}`);

                for (const table of userTables) {
                    try {
                        const data = db.prepare(`SELECT * FROM ${table}`).all();
                        
                        if (data.length > 0) {
                            if (format === 'json') {
                                await writeFile(
                                    path.join(monthDir, `${table}.json`),
                                    JSON.stringify(data, null, 2),
                                    'utf8'
                                );
                            }
                            console.log(`  ✓ ${table}: ${data.length} 条记录`);
                        }
                    } catch (error) {
                        console.log(`  ⚠ 表 ${table} 不存在或导出失败`);
                    }
                }

            } finally {
                db.close();
            }
        }
    }

    // 导出数据库文件备份
    async exportDatabaseFiles(exportDir) {
        const dbBackupDir = path.join(exportDir, 'database_backup');
        await mkdir(dbBackupDir, { recursive: true });

        console.log('备份数据库文件...');

        // 获取所有数据库文件
        const dbFiles = fs.readdirSync(this.dataPath)
            .filter(file => file.endsWith('.db') || file.endsWith('.db-wal') || file.endsWith('.db-shm'));

        for (const dbFile of dbFiles) {
            const sourcePath = path.join(this.dataPath, dbFile);
            const targetPath = path.join(dbBackupDir, dbFile);
            
            try {
                fs.copyFileSync(sourcePath, targetPath);
                console.log(`✓ 备份数据库文件: ${dbFile}`);
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
                version: '1.0.0',
                system: 'Telegram Bot - 小鸡预约系统',
                export_type: 'complete_backup'
            },
            file_structure: {
                core_data: '核心业务数据（地区、商家、订单、评价等）',
                template_data: '模板配置数据（消息模板、触发词等）',
                user_data: '用户交互数据（按月分区）',
                database_backup: '原始数据库文件备份'
            },
            restoration_guide: {
                description: '数据恢复指南',
                steps: [
                    '1. 停止Bot服务',
                    '2. 备份当前data目录',
                    '3. 将database_backup中的文件复制到data目录',
                    '4. 或者使用JSON文件通过导入脚本恢复数据',
                    '5. 重启Bot服务',
                    '6. 验证数据完整性'
                ]
            },
            important_notes: [
                '此备份包含所有用户数据和商家信息',
                '恢复前请确保停止所有Bot服务',
                '建议在测试环境先验证备份完整性',
                '定期进行数据备份以防数据丢失'
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
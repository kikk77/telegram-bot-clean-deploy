#!/usr/bin/env node

const DatabaseRepair = require('../utils/databaseRepair');
const { db } = require('../config/database');

async function testDatabaseRepair() {
    console.log('🧪 开始数据库修复测试...\n');
    
    try {
        // 1. 显示修复前的统计
        console.log('📊 修复前统计:');
        const beforeStats = {
            totalMerchants: db.prepare('SELECT COUNT(*) as count FROM merchants').get().count,
            activeMerchants: db.prepare("SELECT COUNT(*) as count FROM merchants WHERE status = 'active'").get().count,
            totalOrders: db.prepare('SELECT COUNT(*) as count FROM orders').get().count,
            completedOrders: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").get().count,
            totalRegions: db.prepare('SELECT COUNT(*) as count FROM regions').get().count,
            totalBindCodes: db.prepare('SELECT COUNT(*) as count FROM bind_codes').get().count
        };
        
        console.table(beforeStats);
        
        // 2. 执行数据库修复
        const repair = new DatabaseRepair();
        const healthReport = await repair.getHealthReport();
        
        console.log('\n📋 数据库健康报告:');
        console.table(healthReport.tables);
        
        if (healthReport.integrity !== 'OK') {
            console.log('⚠️ 发现数据完整性问题，开始修复...');
            await repair.repairDatabase();
        } else {
            console.log('✅ 数据库完整性良好');
        }
        
        // 3. 显示修复后的统计
        console.log('\n📊 修复后统计:');
        const afterStats = {
            totalMerchants: db.prepare('SELECT COUNT(*) as count FROM merchants').get().count,
            activeMerchants: db.prepare("SELECT COUNT(*) as count FROM merchants WHERE status = 'active'").get().count,
            totalOrders: db.prepare('SELECT COUNT(*) as count FROM orders').get().count,
            completedOrders: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").get().count,
            totalRegions: db.prepare('SELECT COUNT(*) as count FROM regions').get().count,
            totalBindCodes: db.prepare('SELECT COUNT(*) as count FROM bind_codes').get().count
        };
        
        console.table(afterStats);
        
        // 4. 比较修复前后的差异
        console.log('\n🔍 修复对比:');
        const changes = {};
        for (const key in beforeStats) {
            const before = beforeStats[key];
            const after = afterStats[key];
            if (before !== after) {
                changes[key] = `${before} → ${after}`;
            } else {
                changes[key] = `${after} (无变化)`;
            }
        }
        console.table(changes);
        
        // 5. 测试API响应
        console.log('\n🌐 测试API响应...');
        const apiResponse = await testApiResponse();
        console.log('API测试结果:', apiResponse ? '✅ 正常' : '❌ 异常');
        
        console.log('\n✅ 数据库修复测试完成！');
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
        process.exit(1);
    }
}

async function testApiResponse() {
    try {
        const http = require('http');
        
        return new Promise((resolve) => {
            const req = http.get('http://localhost:3000/api/stats', (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const stats = JSON.parse(data);
                        console.log('API返回数据:', stats.data);
                        resolve(true);
                    } catch (error) {
                        console.error('API响应解析失败:', error);
                        resolve(false);
                    }
                });
            });
            
            req.on('error', (error) => {
                console.error('API请求失败:', error);
                resolve(false);
            });
            
            req.setTimeout(5000, () => {
                console.log('API请求超时');
                resolve(false);
            });
        });
    } catch (error) {
        console.error('API测试异常:', error);
        return false;
    }
}

// 运行测试
if (require.main === module) {
    testDatabaseRepair().catch(console.error);
}

module.exports = { testDatabaseRepair }; 
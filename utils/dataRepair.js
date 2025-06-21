#!/usr/bin/env node

/**
 * 数据修复工具
 * 解决Bot切换和数据一致性问题
 */

const { db } = require('../config/database');
const fs = require('fs');
const path = require('path');

class DataRepair {
    constructor() {
        this.repairLog = [];
    }

    // 主修复函数
    async repairAll() {
        console.log('🔧 开始数据修复（重点：订单系统完整性）...');
        
        try {
            // 1. 修复商家数据一致性
            await this.repairMerchantDataConsistency();
            
            // 2. 修复订单关联数据
            await this.repairOrderRelationships();
            
            // 3. 修复预约会话数据
            await this.repairBookingSessionData();
            
            // 4. 修复评价系统数据
            await this.repairEvaluationData();
            
            // 5. 修复孤儿商家记录
            await this.repairOrphanMerchants();
            
            // 6. 修复孤儿绑定码记录
            await this.repairOrphanBindCodes();
            
            // 7. 清理硬编码Bot引用
            await this.cleanupHardcodedBotReferences();
            
            // 8. 验证订单系统完整性
            await this.validateOrderSystemIntegrity();
            
            // 9. 生成修复报告
            await this.generateRepairReport();
            
            console.log('✅ 数据修复完成');
            return {
                success: true,
                repairsCount: this.repairLog.length,
                log: this.repairLog
            };
            
        } catch (error) {
            console.error('❌ 数据修复失败:', error);
            throw error;
        }
    }

    // 修复商家数据一致性
    async repairMerchantDataConsistency() {
        console.log('🔄 修复商家数据一致性...');
        
        try {
            // 检查商家表中的user_id为NULL但有绑定码的情况
            const merchantsWithNullUserId = db.prepare(`
                SELECT m.*, bc.used_by 
                FROM merchants m 
                LEFT JOIN bind_codes bc ON m.bind_code = bc.code 
                WHERE m.user_id IS NULL AND bc.used_by IS NOT NULL
            `).all();
            
            if (merchantsWithNullUserId.length > 0) {
                console.log(`🔧 发现 ${merchantsWithNullUserId.length} 个商家user_id为NULL但绑定码有used_by`);
                
                const updateMerchantUserId = db.prepare('UPDATE merchants SET user_id = ? WHERE id = ?');
                
                for (const merchant of merchantsWithNullUserId) {
                    try {
                        updateMerchantUserId.run(merchant.used_by, merchant.id);
                        
                        this.repairLog.push({
                            type: 'merchant_user_id_repair',
                            merchantId: merchant.id,
                            merchantName: merchant.teacher_name,
                            oldUserId: null,
                            newUserId: merchant.used_by,
                            timestamp: new Date().toISOString()
                        });
                        
                        console.log(`✅ 商家 ${merchant.teacher_name} user_id 已更新为: ${merchant.used_by}`);
                        
                    } catch (error) {
                        console.warn(`⚠️ 更新商家user_id失败: ${merchant.id} - ${error.message}`);
                    }
                }
            } else {
                console.log('✅ 商家user_id数据一致性正常');
            }
            
            // 检查商家的地区关联
            const merchantsWithoutRegion = db.prepare(`
                SELECT m.* FROM merchants m 
                WHERE m.region_id IS NULL OR m.region_id NOT IN (SELECT id FROM regions)
            `).all();
            
            if (merchantsWithoutRegion.length > 0) {
                console.log(`🔧 发现 ${merchantsWithoutRegion.length} 个商家缺少有效地区关联`);
                
                // 获取默认地区（第一个地区）
                const defaultRegion = db.prepare('SELECT id FROM regions ORDER BY id LIMIT 1').get();
                if (defaultRegion) {
                    const updateMerchantRegion = db.prepare('UPDATE merchants SET region_id = ? WHERE id = ?');
                    
                    for (const merchant of merchantsWithoutRegion) {
                        updateMerchantRegion.run(defaultRegion.id, merchant.id);
                        
                        this.repairLog.push({
                            type: 'merchant_region_repair',
                            merchantId: merchant.id,
                            merchantName: merchant.teacher_name,
                            newRegionId: defaultRegion.id,
                            timestamp: new Date().toISOString()
                        });
                        
                        console.log(`✅ 商家 ${merchant.teacher_name} 地区已设置为默认地区: ${defaultRegion.id}`);
                    }
                }
            }
            
        } catch (error) {
            console.error('❌ 修复商家数据一致性失败:', error);
        }
    }

    // 修复订单关联数据
    async repairOrderRelationships() {
        console.log('🔄 修复订单关联数据...');
        
        try {
            // 检查订单表中merchant_user_id为NULL的情况
            const ordersWithNullMerchantUserId = db.prepare(`
                SELECT o.*, m.user_id as merchant_user_id_from_merchant 
                FROM orders o 
                LEFT JOIN merchants m ON o.merchant_id = m.id 
                WHERE o.merchant_user_id IS NULL AND m.user_id IS NOT NULL
            `).all();
            
            if (ordersWithNullMerchantUserId.length > 0) {
                console.log(`🔧 发现 ${ordersWithNullMerchantUserId.length} 个订单的merchant_user_id为NULL`);
                
                const updateOrderMerchantUserId = db.prepare('UPDATE orders SET merchant_user_id = ? WHERE id = ?');
                
                for (const order of ordersWithNullMerchantUserId) {
                    updateOrderMerchantUserId.run(order.merchant_user_id_from_merchant, order.id);
                    
                    this.repairLog.push({
                        type: 'order_merchant_user_id_repair',
                        orderId: order.id,
                        orderNumber: order.order_number,
                        merchantId: order.merchant_id,
                        newMerchantUserId: order.merchant_user_id_from_merchant,
                        timestamp: new Date().toISOString()
                    });
                    
                    console.log(`✅ 订单 ${order.order_number} merchant_user_id 已更新`);
                }
            } else {
                console.log('✅ 订单merchant_user_id数据正常');
            }
            
            // 检查订单的地区关联
            const ordersWithoutRegion = db.prepare(`
                SELECT o.*, m.region_id as merchant_region_id 
                FROM orders o 
                LEFT JOIN merchants m ON o.merchant_id = m.id 
                WHERE o.region_id IS NULL AND m.region_id IS NOT NULL
            `).all();
            
            if (ordersWithoutRegion.length > 0) {
                console.log(`🔧 发现 ${ordersWithoutRegion.length} 个订单缺少地区关联`);
                
                const updateOrderRegion = db.prepare('UPDATE orders SET region_id = ? WHERE id = ?');
                
                for (const order of ordersWithoutRegion) {
                    updateOrderRegion.run(order.merchant_region_id, order.id);
                    
                    this.repairLog.push({
                        type: 'order_region_repair',
                        orderId: order.id,
                        orderNumber: order.order_number,
                        newRegionId: order.merchant_region_id,
                        timestamp: new Date().toISOString()
                    });
                    
                    console.log(`✅ 订单 ${order.order_number} 地区关联已修复`);
                }
            }
            
        } catch (error) {
            console.error('❌ 修复订单关联数据失败:', error);
        }
    }

    // 修复预约会话数据
    async repairBookingSessionData() {
        console.log('🔄 修复预约会话数据...');
        
        try {
            // 检查孤儿预约会话（商家不存在）
            const orphanBookingSessions = db.prepare(`
                SELECT bs.* FROM booking_sessions bs 
                LEFT JOIN merchants m ON bs.merchant_id = m.id 
                WHERE m.id IS NULL
            `).all();
            
            if (orphanBookingSessions.length > 0) {
                console.log(`🔧 发现 ${orphanBookingSessions.length} 个孤儿预约会话`);
                
                const deleteOrphanSession = db.prepare('DELETE FROM booking_sessions WHERE id = ?');
                
                for (const session of orphanBookingSessions) {
                    deleteOrphanSession.run(session.id);
                    
                    this.repairLog.push({
                        type: 'orphan_booking_session_cleanup',
                        sessionId: session.id,
                        merchantId: session.merchant_id,
                        userId: session.user_id,
                        timestamp: new Date().toISOString()
                    });
                    
                    console.log(`✅ 删除孤儿预约会话: ${session.id}`);
                }
            } else {
                console.log('✅ 预约会话数据正常');
            }
            
        } catch (error) {
            console.error('❌ 修复预约会话数据失败:', error);
        }
    }

    // 修复评价系统数据
    async repairEvaluationData() {
        console.log('🔄 修复评价系统数据...');
        
        try {
            // 检查孤儿评价记录（预约会话不存在）
            const orphanEvaluations = db.prepare(`
                SELECT e.* FROM evaluations e 
                LEFT JOIN booking_sessions bs ON e.booking_session_id = bs.id 
                WHERE bs.id IS NULL
            `).all();
            
            if (orphanEvaluations.length > 0) {
                console.log(`🔧 发现 ${orphanEvaluations.length} 个孤儿评价记录`);
                
                const deleteOrphanEvaluation = db.prepare('DELETE FROM evaluations WHERE id = ?');
                
                for (const evaluation of orphanEvaluations) {
                    deleteOrphanEvaluation.run(evaluation.id);
                    
                    this.repairLog.push({
                        type: 'orphan_evaluation_cleanup',
                        evaluationId: evaluation.id,
                        bookingSessionId: evaluation.booking_session_id,
                        evaluatorType: evaluation.evaluator_type,
                        timestamp: new Date().toISOString()
                    });
                    
                    console.log(`✅ 删除孤儿评价记录: ${evaluation.id}`);
                }
            } else {
                console.log('✅ 评价数据正常');
            }
            
            // 检查孤儿评价会话
            const orphanEvaluationSessions = db.prepare(`
                SELECT es.* FROM evaluation_sessions es 
                LEFT JOIN evaluations e ON es.evaluation_id = e.id 
                WHERE e.id IS NULL
            `).all();
            
            if (orphanEvaluationSessions.length > 0) {
                console.log(`🔧 发现 ${orphanEvaluationSessions.length} 个孤儿评价会话`);
                
                const deleteOrphanEvalSession = db.prepare('DELETE FROM evaluation_sessions WHERE id = ?');
                
                for (const session of orphanEvaluationSessions) {
                    deleteOrphanEvalSession.run(session.id);
                    
                    this.repairLog.push({
                        type: 'orphan_evaluation_session_cleanup',
                        sessionId: session.id,
                        evaluationId: session.evaluation_id,
                        userId: session.user_id,
                        timestamp: new Date().toISOString()
                    });
                    
                    console.log(`✅ 删除孤儿评价会话: ${session.id}`);
                }
            }
            
        } catch (error) {
            console.error('❌ 修复评价系统数据失败:', error);
        }
    }

    // 修复孤儿商家记录（商家存在但绑定码不存在）
    async repairOrphanMerchants() {
        console.log('🔄 修复孤儿商家记录...');
        
        const orphanMerchants = db.prepare(`
            SELECT m.* FROM merchants m 
            LEFT JOIN bind_codes bc ON m.bind_code = bc.code 
            WHERE m.bind_code IS NOT NULL AND bc.code IS NULL
        `).all();
        
        if (orphanMerchants.length === 0) {
            console.log('✅ 未发现孤儿商家记录');
            return;
        }
        
        console.log(`🔧 发现 ${orphanMerchants.length} 个孤儿商家，正在修复...`);
        
        const insertBindCode = db.prepare(`
            INSERT OR IGNORE INTO bind_codes (code, description, used, used_by, created_at, used_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        for (const merchant of orphanMerchants) {
            const description = `数据修复 - ${merchant.teacher_name || '未知商家'}`;
            const now = Math.floor(Date.now() / 1000);
            
            try {
                insertBindCode.run(
                    merchant.bind_code,
                    description,
                    1, // 标记为已使用
                    merchant.user_id,
                    now - 86400, // 创建时间设为1天前
                    now - 3600 // 使用时间设为1小时前
                );
                
                this.repairLog.push({
                    type: 'orphan_merchant_repair',
                    merchantId: merchant.id,
                    merchantName: merchant.teacher_name,
                    bindCode: merchant.bind_code,
                    action: 'created_bind_code',
                    timestamp: new Date().toISOString()
                });
                
                console.log(`✅ 为商家 ${merchant.teacher_name} 创建绑定码: ${merchant.bind_code}`);
                
            } catch (error) {
                console.warn(`⚠️ 创建绑定码失败: ${merchant.bind_code} - ${error.message}`);
                this.repairLog.push({
                    type: 'orphan_merchant_repair_failed',
                    merchantId: merchant.id,
                    bindCode: merchant.bind_code,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    // 修复孤儿绑定码记录（绑定码已使用但商家不存在）
    async repairOrphanBindCodes() {
        console.log('🔄 修复孤儿绑定码记录...');
        
        const orphanBindCodes = db.prepare(`
            SELECT bc.* FROM bind_codes bc 
            LEFT JOIN merchants m ON bc.code = m.bind_code 
            WHERE bc.used = 1 AND m.bind_code IS NULL
        `).all();
        
        if (orphanBindCodes.length === 0) {
            console.log('✅ 未发现孤儿绑定码记录');
            return;
        }
        
        console.log(`🔧 发现 ${orphanBindCodes.length} 个孤儿绑定码，正在处理...`);
        
        const updateBindCode = db.prepare(`
            UPDATE bind_codes SET used = 0, used_by = NULL, used_at = NULL 
            WHERE code = ?
        `);
        
        for (const bindCode of orphanBindCodes) {
            try {
                updateBindCode.run(bindCode.code);
                
                this.repairLog.push({
                    type: 'orphan_bind_code_repair',
                    bindCode: bindCode.code,
                    action: 'reset_to_unused',
                    originalUsedBy: bindCode.used_by,
                    timestamp: new Date().toISOString()
                });
                
                console.log(`✅ 重置绑定码为未使用: ${bindCode.code}`);
                
            } catch (error) {
                console.warn(`⚠️ 重置绑定码失败: ${bindCode.code} - ${error.message}`);
            }
        }
    }

    // 清理硬编码的Bot引用
    async cleanupHardcodedBotReferences() {
        console.log('🔄 清理硬编码Bot引用...');
        
        const botNames = ['xiaoji_daniao_bot', 'xiaojisystembot'];
        let totalCleaned = 0;
        
        for (const botName of botNames) {
            // 清理商家表中的硬编码引用
            const updateMerchants = db.prepare(`
                UPDATE merchants 
                SET teacher_name = REPLACE(teacher_name, ?, ''),
                    contact = REPLACE(contact, ?, '')
                WHERE teacher_name LIKE ? OR contact LIKE ?
            `);
            
            const pattern = `%${botName}%`;
            const result = updateMerchants.run(botName, botName, pattern, pattern);
            
            if (result.changes > 0) {
                totalCleaned += result.changes;
                this.repairLog.push({
                    type: 'hardcoded_bot_cleanup',
                    botName: botName,
                    recordsAffected: result.changes,
                    timestamp: new Date().toISOString()
                });
                
                console.log(`✅ 清理了 ${result.changes} 个 ${botName} 引用`);
            }
        }
        
        if (totalCleaned === 0) {
            console.log('✅ 未发现硬编码Bot引用');
        } else {
            console.log(`✅ 共清理了 ${totalCleaned} 个硬编码Bot引用`);
        }
    }

    // 验证订单系统完整性
    async validateOrderSystemIntegrity() {
        console.log('🔍 验证订单系统完整性...');
        
        const validation = {
            // 基础数据统计
            merchants: 0,
            bindCodes: 0,
            orders: 0,
            bookingSessions: 0,
            evaluations: 0,
            evaluationSessions: 0,
            regions: 0,
            
            // 数据一致性检查
            orphanMerchants: 0,
            orphanBindCodes: 0,
            orphanOrders: 0,
            orphanBookingSessions: 0,
            orphanEvaluations: 0,
            orphanEvaluationSessions: 0,
            
            // 订单系统特定检查
            ordersWithNullMerchantUserId: 0,
            ordersWithNullRegion: 0,
            merchantsWithNullUserId: 0,
            merchantsWithNullRegion: 0,
            
            // 整体一致性
            consistent: true,
            orderSystemHealthy: true
        };
        
        try {
            // 统计基础数据
            validation.merchants = db.prepare('SELECT COUNT(*) as count FROM merchants').get().count;
            validation.bindCodes = db.prepare('SELECT COUNT(*) as count FROM bind_codes').get().count;
            validation.orders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
            validation.bookingSessions = db.prepare('SELECT COUNT(*) as count FROM booking_sessions').get().count;
            validation.evaluations = db.prepare('SELECT COUNT(*) as count FROM evaluations').get().count;
            validation.evaluationSessions = db.prepare('SELECT COUNT(*) as count FROM evaluation_sessions').get().count;
            validation.regions = db.prepare('SELECT COUNT(*) as count FROM regions').get().count;
            
            // 检查孤儿记录
            validation.orphanMerchants = db.prepare(`
                SELECT COUNT(*) as count FROM merchants m 
                LEFT JOIN bind_codes bc ON m.bind_code = bc.code 
                WHERE m.bind_code IS NOT NULL AND bc.code IS NULL
            `).get().count;
            
            validation.orphanBindCodes = db.prepare(`
                SELECT COUNT(*) as count FROM bind_codes bc 
                LEFT JOIN merchants m ON bc.code = m.bind_code 
                WHERE bc.used = 1 AND m.bind_code IS NULL
            `).get().count;
            
            validation.orphanOrders = db.prepare(`
                SELECT COUNT(*) as count FROM orders o 
                LEFT JOIN merchants m ON o.merchant_id = m.id 
                WHERE m.id IS NULL
            `).get().count;
            
            validation.orphanBookingSessions = db.prepare(`
                SELECT COUNT(*) as count FROM booking_sessions bs 
                LEFT JOIN merchants m ON bs.merchant_id = m.id 
                WHERE m.id IS NULL
            `).get().count;
            
            validation.orphanEvaluations = db.prepare(`
                SELECT COUNT(*) as count FROM evaluations e 
                LEFT JOIN booking_sessions bs ON e.booking_session_id = bs.id 
                WHERE bs.id IS NULL
            `).get().count;
            
            validation.orphanEvaluationSessions = db.prepare(`
                SELECT COUNT(*) as count FROM evaluation_sessions es 
                LEFT JOIN evaluations e ON es.evaluation_id = e.id 
                WHERE e.id IS NULL
            `).get().count;
            
            // 订单系统特定检查
            validation.ordersWithNullMerchantUserId = db.prepare(`
                SELECT COUNT(*) as count FROM orders o 
                LEFT JOIN merchants m ON o.merchant_id = m.id 
                WHERE o.merchant_user_id IS NULL AND m.user_id IS NOT NULL
            `).get().count;
            
            validation.ordersWithNullRegion = db.prepare(`
                SELECT COUNT(*) as count FROM orders o 
                LEFT JOIN merchants m ON o.merchant_id = m.id 
                WHERE o.region_id IS NULL AND m.region_id IS NOT NULL
            `).get().count;
            
            validation.merchantsWithNullUserId = db.prepare(`
                SELECT COUNT(*) as count FROM merchants m 
                LEFT JOIN bind_codes bc ON m.bind_code = bc.code 
                WHERE m.user_id IS NULL AND bc.used_by IS NOT NULL
            `).get().count;
            
            validation.merchantsWithNullRegion = db.prepare(`
                SELECT COUNT(*) as count FROM merchants m 
                WHERE m.region_id IS NULL OR m.region_id NOT IN (SELECT id FROM regions)
            `).get().count;
            
            // 判断整体一致性
            validation.consistent = (
                validation.orphanMerchants === 0 && 
                validation.orphanBindCodes === 0
            );
            
            validation.orderSystemHealthy = (
                validation.orphanOrders === 0 &&
                validation.orphanBookingSessions === 0 &&
                validation.orphanEvaluations === 0 &&
                validation.orphanEvaluationSessions === 0 &&
                validation.ordersWithNullMerchantUserId === 0 &&
                validation.ordersWithNullRegion === 0 &&
                validation.merchantsWithNullUserId === 0 &&
                validation.merchantsWithNullRegion === 0
            );
            
            console.log('📊 订单系统完整性验证结果:');
            console.log('');
            console.log('📈 基础数据统计:');
            console.log(`   商家数量: ${validation.merchants}`);
            console.log(`   绑定码数量: ${validation.bindCodes}`);
            console.log(`   订单数量: ${validation.orders}`);
            console.log(`   预约会话数量: ${validation.bookingSessions}`);
            console.log(`   评价数量: ${validation.evaluations}`);
            console.log(`   评价会话数量: ${validation.evaluationSessions}`);
            console.log(`   地区数量: ${validation.regions}`);
            console.log('');
            console.log('🔍 数据一致性检查:');
            console.log(`   孤儿商家: ${validation.orphanMerchants}`);
            console.log(`   孤儿绑定码: ${validation.orphanBindCodes}`);
            console.log(`   孤儿订单: ${validation.orphanOrders}`);
            console.log(`   孤儿预约会话: ${validation.orphanBookingSessions}`);
            console.log(`   孤儿评价: ${validation.orphanEvaluations}`);
            console.log(`   孤儿评价会话: ${validation.orphanEvaluationSessions}`);
            console.log('');
            console.log('⚙️ 订单系统特定检查:');
            console.log(`   订单缺少merchant_user_id: ${validation.ordersWithNullMerchantUserId}`);
            console.log(`   订单缺少地区关联: ${validation.ordersWithNullRegion}`);
            console.log(`   商家缺少user_id: ${validation.merchantsWithNullUserId}`);
            console.log(`   商家缺少地区关联: ${validation.merchantsWithNullRegion}`);
            console.log('');
            console.log(`📋 基础数据一致性: ${validation.consistent ? '✅ 正常' : '❌ 异常'}`);
            console.log(`🛒 订单系统健康度: ${validation.orderSystemHealthy ? '✅ 健康' : '❌ 有问题'}`);
            
            this.repairLog.push({
                type: 'order_system_validation',
                result: validation,
                timestamp: new Date().toISOString()
            });
            
            return validation;
            
        } catch (error) {
            console.error('❌ 订单系统完整性验证失败:', error);
            throw error;
        }
    }

    // 生成修复报告
    async generateRepairReport() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = path.join(__dirname, '../backups', `repair-report-${timestamp}.json`);
        
        const report = {
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            botUsername: process.env.BOT_USERNAME || 'unknown',
            repairLog: this.repairLog,
            summary: {
                totalRepairs: this.repairLog.length,
                // 商家和绑定码修复
                merchantUserIdFixed: this.repairLog.filter(log => log.type === 'merchant_user_id_repair').length,
                merchantRegionFixed: this.repairLog.filter(log => log.type === 'merchant_region_repair').length,
                orphanMerchantsFixed: this.repairLog.filter(log => log.type === 'orphan_merchant_repair').length,
                orphanBindCodesFixed: this.repairLog.filter(log => log.type === 'orphan_bind_code_repair').length,
                // 订单系统修复
                orderMerchantUserIdFixed: this.repairLog.filter(log => log.type === 'order_merchant_user_id_repair').length,
                orderRegionFixed: this.repairLog.filter(log => log.type === 'order_region_repair').length,
                orphanBookingSessionsCleared: this.repairLog.filter(log => log.type === 'orphan_booking_session_cleanup').length,
                orphanEvaluationsCleared: this.repairLog.filter(log => log.type === 'orphan_evaluation_cleanup').length,
                orphanEvaluationSessionsCleared: this.repairLog.filter(log => log.type === 'orphan_evaluation_session_cleanup').length,
                // 其他修复
                hardcodedReferencesCleared: this.repairLog.filter(log => log.type === 'hardcoded_bot_cleanup').length
            }
        };
        
        // 确保备份目录存在
        const backupDir = path.dirname(reportPath);
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`📋 修复报告已生成: ${reportPath}`);
        
        return report;
    }
}

// 导出类
module.exports = DataRepair;

// 如果直接运行此脚本
if (require.main === module) {
    (async () => {
        try {
            const repair = new DataRepair();
            const result = await repair.repairAll();
            
            console.log('🎉 数据修复完成！');
            console.log(`📊 共执行了 ${result.repairsCount} 项修复`);
            
        } catch (error) {
            console.error('❌ 数据修复失败:', error);
            process.exit(1);
        }
    })();
} 
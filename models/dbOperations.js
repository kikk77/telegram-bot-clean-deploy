const { db, cache } = require('../config/database');

// 初始化EAV服务 (延迟加载避免循环依赖)
let merchantSkillService = null;
let orderStatusService = null;

function getMerchantSkillService() {
    if (!merchantSkillService) {
        const MerchantSkillService = require('../services/merchantSkillService');
        merchantSkillService = new MerchantSkillService(db);
    }
    return merchantSkillService;
}

function getOrderStatusService() {
    if (!orderStatusService) {
        const OrderStatusService = require('../services/orderStatusService');
        orderStatusService = new OrderStatusService(db);
    }
    return orderStatusService;
}

// 数据库操作函数
const dbOperations = {
    // 绑定码操作 - 统一的绑定码管理逻辑
    generateBindCode() {
        let code;
        let attempts = 0;
        const maxAttempts = 100;
        
        do {
            code = Math.random().toString(36).substring(2, 8).toUpperCase();
            attempts++;
            
            if (attempts > maxAttempts) {
                throw new Error('无法生成唯一绑定码，请重试');
            }
            
            // 检查是否已存在
            const existing = db.prepare('SELECT id FROM bind_codes WHERE code = ?').get(code);
            if (!existing) break;
        } while (true);
        
        return code;
    },

    createBindCode(description) {
        const code = this.generateBindCode();
        const stmt = db.prepare('INSERT INTO bind_codes (code, description, used, created_at) VALUES (?, ?, 0, strftime(\'%s\', \'now\'))');
        const result = stmt.run(code, description);
        return { id: result.lastInsertRowid, code };
    },

    getBindCode(code) {
        const stmt = db.prepare('SELECT * FROM bind_codes WHERE code = ?');
        return stmt.get(code);
    },

    getBindCodeById(id) {
        const stmt = db.prepare('SELECT * FROM bind_codes WHERE id = ?');
        return stmt.get(id);
    },

    getAllBindCodes() {
        const stmt = db.prepare(`
            SELECT 
                bc.id,
                bc.code,
                bc.description,
                bc.used,
                bc.used_by,
                bc.used_at,
                bc.created_at,
                m.teacher_name,
                m.username
            FROM bind_codes bc 
            LEFT JOIN merchants m ON bc.used_by = m.user_id AND bc.used = 1
            ORDER BY bc.created_at DESC
        `);
        return stmt.all();
    },

    // 标记绑定码为已使用 - 统一方法
    useBindCode(code, userId) {
        const transaction = db.transaction(() => {
            // 检查绑定码是否存在且未使用
            const bindCode = db.prepare('SELECT * FROM bind_codes WHERE code = ?').get(code);
            if (!bindCode) {
                throw new Error('绑定码不存在');
            }
            if (bindCode.used) {
                throw new Error('绑定码已被使用');
            }
            
            // 标记为已使用
            const stmt = db.prepare('UPDATE bind_codes SET used = 1, used_by = ?, used_at = strftime(\'%s\', \'now\') WHERE code = ?');
            const result = stmt.run(userId, code);
            
            if (result.changes === 0) {
                throw new Error('标记绑定码失败');
            }
            
            return true;
        });
        
        return transaction();
    },

    // 检查绑定码是否已使用 - 统一检查方法
    isBindCodeUsed(code) {
        const stmt = db.prepare('SELECT used, used_by FROM bind_codes WHERE code = ?');
        const result = stmt.get(code);
        return result ? { used: result.used === 1, usedBy: result.used_by } : null;
    },

    deleteBindCode(id) {
        const stmt = db.prepare('DELETE FROM bind_codes WHERE id = ?');
        return stmt.run(id);
    },

    // 检查绑定码的使用状态和依赖关系
    checkBindCodeDependencies(id) {
        const bindCode = this.getBindCodeById(id);
        if (!bindCode) {
            return { exists: false };
        }
        
        // 检查是否有商家使用此绑定码
        const merchant = db.prepare('SELECT id, teacher_name, username FROM merchants WHERE bind_code = ?').get(bindCode.code);
        
        return {
            exists: true,
            used: bindCode.used === 1,
            usedBy: bindCode.used_by,
            merchant: merchant,
            canDelete: !bindCode.used && !merchant
        };
    },

    // 强制删除绑定码及相关商家记录
    forceDeleteBindCode(id) {
        const transaction = db.transaction(() => {
            const bindCode = this.getBindCodeById(id);
            if (!bindCode) {
                throw new Error('绑定码不存在');
            }
            
            // 删除使用此绑定码的商家记录
            const merchant = db.prepare('SELECT id FROM merchants WHERE bind_code = ?').get(bindCode.code);
            let deletedMerchant = false;
            
            if (merchant) {
                // 删除商家相关的所有数据
                db.prepare('DELETE FROM orders WHERE merchant_id = ?').run(merchant.id);
                db.prepare('DELETE FROM booking_sessions WHERE merchant_id = ?').run(merchant.id);
                db.prepare('DELETE FROM merchants WHERE id = ?').run(merchant.id);
                deletedMerchant = true;
                
                // 清理相关缓存
                cache.set('all_merchants', null);
                cache.set('active_merchants', null);
            }
            
            // 删除绑定码
            this.deleteBindCode(id);
            
            return { deletedMerchant };
        });
        
        return transaction();
    },

    // 修复绑定码数据一致性
    repairBindCodeConsistency() {
        const transaction = db.transaction(() => {
            console.log('🔧 开始修复绑定码数据一致性...');
            
            // 1. 查找商家使用但不存在的绑定码
            const orphanBindCodes = db.prepare(`
                SELECT DISTINCT m.bind_code, m.teacher_name, m.username
                FROM merchants m 
                LEFT JOIN bind_codes bc ON m.bind_code = bc.code 
                WHERE m.bind_code IS NOT NULL AND bc.code IS NULL
            `).all();
            
            let createdCount = 0;
            for (const orphan of orphanBindCodes) {
                // 创建缺失的绑定码记录
                db.prepare('INSERT INTO bind_codes (code, description, used, used_by, used_at, created_at) VALUES (?, ?, 1, (SELECT user_id FROM merchants WHERE bind_code = ? LIMIT 1), strftime(\'%s\', \'now\'), strftime(\'%s\', \'now\'))').run(
                    orphan.bind_code,
                    `系统修复: ${orphan.teacher_name} (@${orphan.username})`,
                    orphan.bind_code
                );
                createdCount++;
                console.log(`✅ 创建缺失的绑定码: ${orphan.bind_code} (${orphan.teacher_name})`);
            }
            
            // 2. 修复绑定码状态不一致的问题
            const inconsistentBindCodes = db.prepare(`
                SELECT bc.id, bc.code, bc.used, bc.used_by, m.user_id as merchant_user_id
                FROM bind_codes bc
                LEFT JOIN merchants m ON bc.code = m.bind_code
                WHERE (bc.used = 0 AND m.bind_code IS NOT NULL) OR (bc.used = 1 AND bc.used_by != m.user_id)
            `).all();
            
            let fixedCount = 0;
            for (const inconsistent of inconsistentBindCodes) {
                if (inconsistent.merchant_user_id) {
                    // 有商家使用，更新绑定码状态
                    db.prepare('UPDATE bind_codes SET used = 1, used_by = ?, used_at = strftime(\'%s\', \'now\') WHERE id = ?').run(
                        inconsistent.merchant_user_id,
                        inconsistent.id
                    );
                    fixedCount++;
                    console.log(`✅ 修复绑定码状态: ${inconsistent.code} -> 已使用`);
                }
            }
            
            console.log(`🎉 绑定码一致性修复完成: 创建 ${createdCount} 个，修复 ${fixedCount} 个`);
            return { 
                success: true,
                message: `创建 ${createdCount} 个，修复 ${fixedCount} 个`,
                created: createdCount, 
                fixed: fixedCount 
            };
        });
        
        return transaction();
    },

    // 地区操作
    createRegion(name, sortOrder = 0) {
        const stmt = db.prepare('INSERT INTO regions (name, sort_order) VALUES (?, ?)');
        const result = stmt.run(name, sortOrder);
        
        // 清理相关缓存
        cache.set('all_regions', null);
        cache.set('all_merchants', null);
        
        return result.lastInsertRowid;
    },

    getAllRegions() {
        const cacheKey = 'all_regions';
        const cached = cache.get(cacheKey);
        if (cached) return cached;
        
        const stmt = db.prepare('SELECT * FROM regions WHERE active = 1 ORDER BY sort_order, name');
        const result = stmt.all();
        cache.set(cacheKey, result, 10 * 60 * 1000); // 10分钟缓存
        return result;
    },

    getRegionById(id) {
        const stmt = db.prepare('SELECT * FROM regions WHERE id = ? AND active = 1');
        return stmt.get(id);
    },

    updateRegion(id, name, sortOrder) {
        const stmt = db.prepare('UPDATE regions SET name = ?, sort_order = ? WHERE id = ?');
        const result = stmt.run(name, sortOrder, id);
        
        // 清理相关缓存
        cache.set('all_regions', null);
        cache.set('all_merchants', null);
        
        return result;
    },

    // 检查地区删除前的相关数据
    checkRegionDependencies(id) {
        const merchants = db.prepare('SELECT COUNT(*) as count FROM merchants WHERE region_id = ?').get(id);
        
        return {
            merchants: merchants.count,
            total: merchants.count
        };
    },

    deleteRegion(id) {
        // 检查是否有商家绑定到此地区
        const dependencies = this.checkRegionDependencies(id);
        if (dependencies.merchants > 0) {
            throw new Error(`无法删除地区：还有 ${dependencies.merchants} 个商家绑定到此地区`);
        }
        
        const stmt = db.prepare('DELETE FROM regions WHERE id = ?');
        const result = stmt.run(id);
        
        // 清理相关缓存
        cache.set('all_regions', null);
        cache.set('all_merchants', null);
        
        return result;
    },

    // 商家操作
    createMerchant(teacherName, regionId, contact, bindCode, userId) {
        const stmt = db.prepare(`
            INSERT INTO merchants (user_id, teacher_name, region_id, contact, bind_code, bind_step, status) 
            VALUES (?, ?, ?, ?, ?, 5, 'active')
        `);
        const result = stmt.run(userId, teacherName, regionId, contact, bindCode);
        
        // 清理相关缓存
        cache.set('all_merchants', null);
        
        return result.lastInsertRowid;
    },

    // 简化的商家创建方法 - 用于新的绑定流程
    createMerchantSimple(merchantData) {
        const stmt = db.prepare(`
            INSERT INTO merchants (user_id, username, bind_code, bind_step, status, teacher_name, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        const teacherName = merchantData.username || `用户${merchantData.user_id}`;
        const now = Math.floor(Date.now() / 1000);
        
        const result = stmt.run(
            merchantData.user_id,
            merchantData.username,
            merchantData.bind_code,
            merchantData.bind_step,
            merchantData.status,
            teacherName,
            now
        );
        
        // 清理相关缓存
        cache.set('all_merchants', null);
        cache.set('active_merchants', null);
        
        return result.lastInsertRowid;
    },

    getMerchantByUserId(userId) {
        const stmt = db.prepare(`
            SELECT m.*, r.name as region_name 
            FROM merchants m 
            LEFT JOIN regions r ON m.region_id = r.id 
            WHERE m.user_id = ?
        `);
        return stmt.get(userId);
    },

    getAllMerchants() {
        const cacheKey = 'all_merchants';
        const cached = cache.get(cacheKey);
        if (cached) return cached;
        
        const stmt = db.prepare(`
            SELECT m.*, r.name as region_name 
            FROM merchants m 
            LEFT JOIN regions r ON m.region_id = r.id 
            ORDER BY m.created_at DESC
        `);
        const result = stmt.all();
        cache.set(cacheKey, result, 2 * 60 * 1000); // 2分钟缓存
        return result;
    },

    getActiveMerchants() {
        const cacheKey = 'active_merchants';
        const cached = cache.get(cacheKey);
        if (cached) return cached;
        
        const stmt = db.prepare(`
            SELECT m.*, r.name as region_name 
            FROM merchants m 
            LEFT JOIN regions r ON m.region_id = r.id 
            WHERE m.status = 'active'
            ORDER BY m.created_at DESC
        `);
        const result = stmt.all();
        cache.set(cacheKey, result, 2 * 60 * 1000); // 2分钟缓存
        return result;
    },

    getMerchantById(id) {
        const stmt = db.prepare(`
            SELECT m.*, r.name as region_name 
            FROM merchants m 
            LEFT JOIN regions r ON m.region_id = r.id 
            WHERE m.id = ?
        `);
        return stmt.get(id);
    },

    getMerchantsByRegion(regionId) {
        const stmt = db.prepare(`
            SELECT m.*, r.name as region_name 
            FROM merchants m 
            LEFT JOIN regions r ON m.region_id = r.id 
            WHERE m.region_id = ?
        `);
        return stmt.all(regionId);
    },

    updateMerchantBindStep(userId, step, bindData = null) {
        const stmt = db.prepare('UPDATE merchants SET bind_step = ?, bind_data = ? WHERE user_id = ?');
        return stmt.run(step, bindData, userId);
    },

    // 检查商家删除前的相关数据
    checkMerchantDependencies(id) {
        const bookingSessions = db.prepare('SELECT COUNT(*) as count FROM booking_sessions WHERE merchant_id = ?').get(id);
        const buttons = db.prepare('SELECT COUNT(*) as count FROM buttons WHERE merchant_id = ?').get(id);
        const ordersByBooking = db.prepare(`
            SELECT COUNT(*) as count FROM orders 
            WHERE booking_session_id IN (SELECT id FROM booking_sessions WHERE merchant_id = ?)
        `).get(id);
        const ordersByMerchant = db.prepare('SELECT COUNT(*) as count FROM orders WHERE merchant_id = ?').get(id);
        
        const totalOrders = ordersByBooking.count + ordersByMerchant.count;
        
        return {
            bookingSessions: bookingSessions.count,
            buttons: buttons.count,
            orders: totalOrders,
            total: bookingSessions.count + buttons.count + totalOrders
        };
    },

    deleteMerchant(id) {
        // 开始事务，确保数据一致性
        const transaction = db.transaction(() => {
            console.log(`开始删除商家ID: ${id}`);
            
            // 1. 先删除评价会话（基于evaluation_id）
            const deleteEvalSessionsStmt = db.prepare(`
                DELETE FROM evaluation_sessions 
                WHERE evaluation_id IN (
                    SELECT id FROM evaluations 
                    WHERE booking_session_id IN (
                        SELECT id FROM booking_sessions WHERE merchant_id = ?
                    )
                )
            `);
            const evalSessionResult = deleteEvalSessionsStmt.run(id);
            console.log(`删除评价会话: ${evalSessionResult.changes} 条`);
            
            // 2. 删除预约会话相关的评价记录
            const deleteEvaluationsStmt = db.prepare(`
                DELETE FROM evaluations 
                WHERE booking_session_id IN (
                    SELECT id FROM booking_sessions WHERE merchant_id = ?
                )
            `);
            const evalResult = deleteEvaluationsStmt.run(id);
            console.log(`删除评价记录: ${evalResult.changes} 条`);
            
            // 3. 删除订单记录（通过booking_session_id）
            const deleteOrdersByBookingStmt = db.prepare(`
                DELETE FROM orders 
                WHERE booking_session_id IN (
                    SELECT id FROM booking_sessions WHERE merchant_id = ?
                )
            `);
            const orderByBookingResult = deleteOrdersByBookingStmt.run(id);
            console.log(`通过预约删除订单记录: ${orderByBookingResult.changes} 条`);
            
            // 4. 删除直接关联merchant_id的订单记录  
            const deleteOrdersByMerchantStmt = db.prepare('DELETE FROM orders WHERE merchant_id = ?');
            const orderByMerchantResult = deleteOrdersByMerchantStmt.run(id);
            console.log(`直接删除商家订单记录: ${orderByMerchantResult.changes} 条`);
            
            // 5. 删除预约会话
            const deleteBookingSessionsStmt = db.prepare('DELETE FROM booking_sessions WHERE merchant_id = ?');
            const bookingResult = deleteBookingSessionsStmt.run(id);
            console.log(`删除预约会话: ${bookingResult.changes} 条`);
            
            // 6. 删除相关的交互记录（通过按钮关联）
            const deleteInteractionsStmt = db.prepare(`
                DELETE FROM interactions 
                WHERE button_id IN (SELECT id FROM buttons WHERE merchant_id = ?)
            `);
            const interactionResult = deleteInteractionsStmt.run(id);
            console.log(`删除交互记录: ${interactionResult.changes} 条`);
            
            // 7. 删除商家相关的按钮
            const deleteButtonsStmt = db.prepare('DELETE FROM buttons WHERE merchant_id = ?');
            const buttonResult = deleteButtonsStmt.run(id);
            console.log(`删除按钮记录: ${buttonResult.changes} 条`);
            
            // 8. 最后删除商家
            const deleteMerchantStmt = db.prepare('DELETE FROM merchants WHERE id = ?');
            const merchantResult = deleteMerchantStmt.run(id);
            console.log(`删除商家记录: ${merchantResult.changes} 条`);
            
            if (merchantResult.changes === 0) {
                throw new Error('商家记录不存在或已被删除');
            }
            
            return merchantResult;
        });
        
        const result = transaction();
        
        // 清理相关缓存
        cache.set('all_merchants', null);
        cache.set('active_merchants', null);
        
        return result;
    },

    resetMerchantBind(id) {
        const stmt = db.prepare('UPDATE merchants SET bind_step = 0, bind_data = NULL WHERE id = ?');
        return stmt.run(id);
    },

    updateMerchant(id, teacherName, regionId, contact) {
        const stmt = db.prepare('UPDATE merchants SET teacher_name = ?, region_id = ?, contact = ? WHERE id = ?');
        return stmt.run(teacherName, regionId, contact, id);
    },

    updateMerchantTemplate(id, data) {
        const transaction = db.transaction(() => {
            // 更新基础商家信息
            const stmt = db.prepare(`
                UPDATE merchants SET 
                    teacher_name = ?, 
                    region_id = ?, 
                    contact = ?, 
                    channel_link = ?,
                    advantages = ?, 
                    disadvantages = ?, 
                    price1 = ?, 
                    price2 = ?, 
                    skill_wash = ?, 
                    skill_blow = ?, 
                    skill_do = ?, 
                    skill_kiss = ?,
                    image_url = ?
                WHERE id = ?
            `);
            
            const result = stmt.run(
                data.teacherName, 
                data.regionId, 
                data.contact, 
                data.channelLink,
                data.advantages, 
                data.disadvantages, 
                data.price1, 
                data.price2, 
                data.skillWash, 
                data.skillBlow, 
                data.skillDo, 
                data.skillKiss, 
                data.imageData,
                id
            );
            
            // 同时更新EAV中的技能数据
            try {
                const skillService = getMerchantSkillService();
                const skillData = {
                    wash: data.skillWash || '未填写',
                    blow: data.skillBlow || '未填写',
                    do: data.skillDo || '未填写',
                    kiss: data.skillKiss || '未填写'
                };
                skillService.updateMerchantSkills(id, skillData);
            } catch (error) {
                console.error(`更新商家 ${id} 的EAV技能数据失败:`, error);
                // 不阻断主流程，仅记录错误
            }
            
            return result;
        });
        
        return transaction();
    },

    toggleMerchantStatus(id) {
        // 直接使用db而不是getPreparedStatement，避免缓存问题
        const stmt = db.prepare('UPDATE merchants SET status = CASE WHEN status = ? THEN ? ELSE ? END WHERE id = ?');
        const result = stmt.run('active', 'suspended', 'active', id);
        
        // 清理相关缓存
        cache.set('all_merchants', null);
        cache.set('active_merchants', null);
        
        return result;
    },

    // 检查商家关注状态 - 使用 Telegram API getChatMember
    async checkMerchantsFollowStatus(merchantIds) {
        const results = {};
        
        // 获取 Bot 实例
        let bot = null;
        try {
            const botService = require('../services/botService');
            if (botService && typeof botService.getBotInstance === 'function') {
                bot = botService.getBotInstance();
            }
        } catch (error) {
            console.error('无法获取Bot实例:', error);
        }
        
        if (!bot) {
            console.error('❌ Bot实例不可用，无法检测关注状态');
            for (const merchantId of merchantIds) {
                results[merchantId] = { followed: false, reason: 'Bot实例不可用' };
            }
            return results;
        }
        
        for (const merchantId of merchantIds) {
            const merchant = this.getMerchantById(merchantId);
            if (!merchant) {
                results[merchantId] = { followed: false, reason: '商家不存在' };
                continue;
            }
            
            // 优先使用 user_id，如果没有则尝试通过用户名查找
            let userId = merchant.user_id;
            let username = merchant.username;
            
            // 如果没有 user_id，尝试从交互记录中获取
            if (!userId || userId === 0) {
                if (username) {
                    const userRecord = this.getUserRecordByUsername(username);
                    if (userRecord && userRecord.user_id) {
                        userId = userRecord.user_id;
                        console.log(`🔍 从交互记录中找到商家 ${merchant.teacher_name} 的user_id: ${userId}`);
                        
                        // 更新商家记录中的 user_id
                        this.updateMerchantUserId(merchantId, userId);
                    }
                }
            }
            
            if (!userId || userId === 0) {
                results[merchantId] = { 
                    followed: false, 
                    reason: '缺少用户ID，请商家先与机器人交互',
                    suggestion: '让商家发送 /start 命令给机器人'
                };
                console.log(`❌ 商家 ${merchant.teacher_name} (${username}) 缺少用户ID`);
                continue;
            }
            
            try {
                console.log(`🔍 检测商家 ${merchant.teacher_name} (ID: ${userId}) 的关注状态...`);
                
                // 使用 getChatMember API 检查用户状态
                const chatMember = await bot.getChatMember(userId, userId);
                
                if (chatMember) {
                    // 检查用户状态
                    const status = chatMember.status;
                    const user = chatMember.user;
                    
                    let followed = false;
                    let reason = '';
                    
                    switch (status) {
                        case 'creator':
                        case 'administrator':
                        case 'member':
                            followed = true;
                            reason = '用户可以与机器人正常交互';
                            break;
                        case 'restricted':
                            followed = false;
                            reason = '用户被限制与机器人交互';
                            break;
                        case 'left':
                            followed = false;
                            reason = '用户已停止机器人或删除对话';
                            break;
                        case 'kicked':
                            followed = false;
                            reason = '用户已屏蔽机器人';
                            break;
                        default:
                            followed = false;
                            reason = `未知状态: ${status}`;
                    }
                    
                    results[merchantId] = {
                        followed: followed,
                        reason: reason,
                        telegram_status: status,
                        user_info: {
                            id: user.id,
                            username: user.username,
                            first_name: user.first_name,
                            last_name: user.last_name,
                            is_bot: user.is_bot
                        },
                        detection_method: 'telegram_api',
                        checked_at: Math.floor(Date.now() / 1000)
                    };
                    
                    // 更新商家信息（如果用户名有变化）
                    if (user.username && user.username !== merchant.username) {
                        console.log(`🔄 更新商家 ${merchant.teacher_name} 的用户名: ${merchant.username} -> ${user.username}`);
                        this.updateMerchantUsername(merchantId, user.username);
                    }
                    
                    const statusIcon = followed ? '✅' : '❌';
                    console.log(`${statusIcon} 商家 ${merchant.teacher_name} 检测结果: ${followed ? '已关注' : '未关注'} (${reason})`);
                    
                } else {
                    results[merchantId] = { 
                        followed: false, 
                        reason: '无法获取用户信息',
                        detection_method: 'telegram_api',
                        checked_at: Math.floor(Date.now() / 1000)
                    };
                    console.log(`❌ 商家 ${merchant.teacher_name} 无法获取用户信息`);
                }
                
            } catch (error) {
                console.error(`❌ 检测商家 ${merchant.teacher_name} 关注状态失败:`, error.message);
                
                // 分析错误类型
                let reason = '检测失败';
                let suggestion = '';
                
                if (error.message.includes('Bad Request: user not found')) {
                    reason = '用户不存在或从未与机器人交互';
                    suggestion = '让商家发送 /start 命令给机器人';
                } else if (error.message.includes('Forbidden')) {
                    reason = '机器人无权限访问用户信息';
                    suggestion = '用户可能已屏蔽机器人';
                } else if (error.message.includes('chat not found')) {
                    reason = '对话不存在';
                    suggestion = '让商家重新启动与机器人的对话';
                } else {
                    reason = `API调用失败: ${error.message}`;
                }
                
                results[merchantId] = {
                    followed: false,
                    reason: reason,
                    suggestion: suggestion,
                    error: error.message,
                    detection_method: 'telegram_api',
                    checked_at: Math.floor(Date.now() / 1000)
                };
            }
        }
        
        return results;
    },

    // 检查单个商家的关注状态（用于管理后台测试）
    async checkSingleMerchantFollowStatus(merchantId) {
        const result = await this.checkMerchantsFollowStatus([merchantId]);
        return result[merchantId] || { followed: false, reason: '检查失败' };
    },

    // 获取用户记录（通过用户名，支持大小写不敏感，自动处理@符号）
    getUserRecordByUsername(username) {
        if (!username) return null;
        
        // 标准化用户名：移除 @ 符号
        const normalizedUsername = username.replace(/^@/, '');
        
        // 尝试多种用户名格式匹配
        const stmt = db.prepare(`
            SELECT user_id, username, first_name, last_name, timestamp
            FROM interactions 
            WHERE LOWER(REPLACE(username, '@', '')) = LOWER(?) 
            OR LOWER(username) = LOWER(?)
            OR LOWER(username) = LOWER(?)
            ORDER BY timestamp DESC 
            LIMIT 1
        `);
        
        // 尝试匹配：不带@的用户名, 带@的用户名, 原始用户名
        return stmt.get(normalizedUsername, '@' + normalizedUsername, username);
    },

    // 获取用户的交互次数
    getInteractionCount(userId) {
        if (!userId) return 0;
        
        const stmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM interactions 
            WHERE user_id = ?
        `);
        const result = stmt.get(userId);
        return result?.count || 0;
    },

    // 更新商家的用户ID
    updateMerchantUserId(merchantId, userId) {
        const stmt = db.prepare('UPDATE merchants SET user_id = ? WHERE id = ?');
        const result = stmt.run(userId, merchantId);
        
        // 清理相关缓存
        cache.set('all_merchants', null);
        cache.set('active_merchants', null);
        
        return result;
    },

    // 更新商家的用户名
    updateMerchantUsername(merchantId, username) {
        const stmt = db.prepare('UPDATE merchants SET username = ? WHERE id = ?');
        const result = stmt.run(username, merchantId);
        
        // 清理相关缓存
        cache.set('all_merchants', null);
        cache.set('active_merchants', null);
        
        return result;
    },

    // 单独更新商家地区
    updateMerchantRegion(id, regionId) {
        const stmt = db.prepare('UPDATE merchants SET region_id = ? WHERE id = ?');
        const result = stmt.run(regionId, id);
        
        // 清理相关缓存
        cache.set('all_merchants', null);
        cache.set('active_merchants', null);
        
        return result;
    },

    // 单独更新商家艺名
    updateMerchantTeacherName(id, teacherName) {
        const stmt = db.prepare('UPDATE merchants SET teacher_name = ? WHERE id = ?');
        const result = stmt.run(teacherName, id);
        
        // 清理相关缓存
        cache.set('all_merchants', null);
        cache.set('active_merchants', null);
        
        return result;
    },

    // 单独更新商家联系方式
    updateMerchantContact(id, contact) {
        const stmt = db.prepare('UPDATE merchants SET contact = ? WHERE id = ?');
        const result = stmt.run(contact, id);
        
        // 清理相关缓存
        cache.set('all_merchants', null);
        cache.set('active_merchants', null);
        
        return result;
    },

    // 单独更新商家价格
    updateMerchantPrices(id, price1, price2) {
        const stmt = db.prepare('UPDATE merchants SET price1 = ?, price2 = ? WHERE id = ?');
        const result = stmt.run(price1, price2, id);
        
        // 清理相关缓存
        cache.set('all_merchants', null);
        cache.set('active_merchants', null);
        
        return result;
    },

    // 单独更新商家状态
    updateMerchantStatus(id, status) {
        const stmt = db.prepare('UPDATE merchants SET status = ? WHERE id = ?');
        const result = stmt.run(status, id);
        
        // 清理相关缓存
        cache.set('all_merchants', null);
        cache.set('active_merchants', null);
        
        return result;
    },

    // 单独更新商家绑定码
    updateMerchantBindCode(id, bindCode) {
        const stmt = db.prepare('UPDATE merchants SET bind_code = ? WHERE id = ?');
        const result = stmt.run(bindCode || null, id);
        
        // 清理相关缓存
        cache.set('all_merchants', null);
        cache.set('active_merchants', null);
        
        return result;
    },

    // 频道点击相关操作
    recordChannelClick(clickData) {
        const stmt = db.prepare(`
            INSERT INTO channel_clicks (user_id, username, first_name, last_name, merchant_id, merchant_name, channel_link) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
            clickData.user_id,
            clickData.username,
            clickData.first_name,
            clickData.last_name,
            clickData.merchant_id,
            clickData.merchant_name,
            clickData.channel_link
        );
        return result.lastInsertRowid;
    },

    // 增加商家频道点击计数
    incrementMerchantChannelClicks(merchantId) {
        const stmt = db.prepare('UPDATE merchants SET channel_clicks = channel_clicks + 1 WHERE id = ?');
        const result = stmt.run(merchantId);
        
        // 清理相关缓存
        cache.set('all_merchants', null);
        cache.set('active_merchants', null);
        
        return result;
    },

    // 获取商家频道点击统计
    getMerchantChannelClickStats(merchantId) {
        const stmt = db.prepare(`
            SELECT 
                m.id,
                m.teacher_name,
                m.channel_clicks,
                COUNT(cc.id) as detailed_clicks
            FROM merchants m
            LEFT JOIN channel_clicks cc ON m.id = cc.merchant_id
            WHERE m.id = ?
            GROUP BY m.id
        `);
        return stmt.get(merchantId);
    },

    // 获取频道点击排名
    getChannelClickRanking(limit = 50) {
        const stmt = db.prepare(`
            SELECT 
                m.id,
                m.teacher_name,
                m.channel_link,
                m.channel_clicks,
                r.name as region_name,
                COUNT(cc.id) as detailed_clicks
            FROM merchants m
            LEFT JOIN regions r ON m.region_id = r.id
            LEFT JOIN channel_clicks cc ON m.id = cc.merchant_id
            WHERE m.status = 'active' AND m.channel_link IS NOT NULL AND m.channel_link != ''
            GROUP BY m.id
            ORDER BY m.channel_clicks DESC, detailed_clicks DESC
            LIMIT ?
        `);
        return stmt.all(limit);
    },

    // 获取频道点击详细记录
    getChannelClickDetails(merchantId, limit = 100) {
        const stmt = db.prepare(`
            SELECT 
                cc.*,
                datetime(cc.clicked_at, 'unixepoch', 'localtime') as clicked_time
            FROM channel_clicks cc
            WHERE cc.merchant_id = ?
            ORDER BY cc.clicked_at DESC
            LIMIT ?
        `);
        return stmt.all(merchantId, limit);
    },

    // 按钮操作
    createButton(title, message, merchantId) {
        const stmt = db.prepare('INSERT INTO buttons (title, message, merchant_id) VALUES (?, ?, ?)');
        const result = stmt.run(title, message, merchantId);
        return result.lastInsertRowid;
    },

    getButtons() {
        const stmt = db.prepare(`
            SELECT b.*, m.teacher_name as merchant_name, m.contact as merchant_contact 
            FROM buttons b 
            LEFT JOIN merchants m ON b.merchant_id = m.id 
            WHERE b.active = 1 
            ORDER BY b.created_at DESC
        `);
        return stmt.all();
    },

    getButton(id) {
        const stmt = db.prepare('SELECT * FROM buttons WHERE id = ?');
        return stmt.get(id);
    },

    incrementButtonClick(buttonId) {
        const stmt = db.prepare('UPDATE buttons SET click_count = click_count + 1 WHERE id = ?');
        return stmt.run(buttonId);
    },

    deleteButton(id) {
        const stmt = db.prepare('DELETE FROM buttons WHERE id = ?');
        return stmt.run(id);
    },

    // 消息模板操作
    createMessageTemplate(name, content, imageUrl, buttonsConfig) {
        const stmt = db.prepare('INSERT INTO message_templates (name, content, image_url, buttons_config) VALUES (?, ?, ?, ?)');
        const result = stmt.run(name, content, imageUrl, JSON.stringify(buttonsConfig));
        return result.lastInsertRowid;
    },

    getMessageTemplates() {
        const stmt = db.prepare('SELECT * FROM message_templates ORDER BY created_at DESC');
        return stmt.all();
    },

    getMessageTemplate(id) {
        const stmt = db.prepare('SELECT * FROM message_templates WHERE id = ?');
        return stmt.get(id);
    },

    getMessageTemplateById(id) {
        const stmt = db.prepare('SELECT * FROM message_templates WHERE id = ?');
        return stmt.get(id);
    },

    updateMessageTemplate(id, name, content, imageUrl, buttonsConfig) {
        const stmt = db.prepare('UPDATE message_templates SET name = ?, content = ?, image_url = ?, buttons_config = ? WHERE id = ?');
        return stmt.run(name, content, imageUrl, JSON.stringify(buttonsConfig), id);
    },

    deleteMessageTemplate(id) {
        const stmt = db.prepare('DELETE FROM message_templates WHERE id = ?');
        return stmt.run(id);
    },

    // 触发词操作
    createTriggerWord(word, templateId, matchType, chatId) {
        const stmt = db.prepare('INSERT INTO trigger_words (word, template_id, match_type, chat_id) VALUES (?, ?, ?, ?)');
        const result = stmt.run(word.toLowerCase(), templateId, matchType, chatId);
        return result.lastInsertRowid;
    },

    getTriggerWords() {
        const stmt = db.prepare(`
            SELECT tw.*, mt.name as template_name, mt.content as template_content
            FROM trigger_words tw
            LEFT JOIN message_templates mt ON tw.template_id = mt.id
            WHERE tw.active = 1
            ORDER BY tw.created_at DESC
        `);
        return stmt.all();
    },

    getTriggerWordsByChatId(chatId) {
        const stmt = db.prepare(`
            SELECT tw.*, mt.content, mt.image_url, mt.buttons_config
            FROM trigger_words tw
            LEFT JOIN message_templates mt ON tw.template_id = mt.id
            WHERE tw.chat_id = ? AND tw.active = 1
        `);
        return stmt.all(chatId);
    },

    incrementTriggerCount(id) {
        const now = Math.floor(Date.now() / 1000);
        const stmt = db.prepare('UPDATE trigger_words SET trigger_count = trigger_count + 1, last_triggered = ? WHERE id = ?');
        return stmt.run(now, id);
    },

    deleteTriggerWord(id) {
        const stmt = db.prepare('DELETE FROM trigger_words WHERE id = ?');
        return stmt.run(id);
    },

    // 定时任务操作
    createScheduledTask(name, templateId, chatId, scheduleType, scheduleTime, sequenceOrder, sequenceDelay) {
        const stmt = db.prepare('INSERT INTO scheduled_tasks (name, template_id, chat_id, schedule_type, schedule_time, sequence_order, sequence_delay) VALUES (?, ?, ?, ?, ?, ?, ?)');
        const result = stmt.run(name, templateId, chatId, scheduleType, scheduleTime, sequenceOrder || 0, sequenceDelay || 0);
        return result.lastInsertRowid;
    },

    getScheduledTasks() {
        const stmt = db.prepare(`
            SELECT st.*, mt.name as template_name, mt.content as template_content
            FROM scheduled_tasks st
            LEFT JOIN message_templates mt ON st.template_id = mt.id
            ORDER BY st.created_at DESC
        `);
        return stmt.all();
    },

    getActiveScheduledTasks() {
        const stmt = db.prepare(`
            SELECT st.*, mt.content, mt.image_url, mt.buttons_config
            FROM scheduled_tasks st
            LEFT JOIN message_templates mt ON st.template_id = mt.id
            WHERE st.active = 1
        `);
        return stmt.all();
    },

    updateTaskLastRun(id) {
        const now = Math.floor(Date.now() / 1000);
        const stmt = db.prepare('UPDATE scheduled_tasks SET last_run = ? WHERE id = ?');
        return stmt.run(now, id);
    },

    deleteScheduledTask(id) {
        const stmt = db.prepare('DELETE FROM scheduled_tasks WHERE id = ?');
        return stmt.run(id);
    },

    // 交互日志操作
    logInteraction(userId, username, firstName, lastName, buttonId, templateId, actionType, chatId) {
        const stmt = db.prepare('INSERT INTO interactions (user_id, username, first_name, last_name, button_id, template_id, action_type, chat_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        return stmt.run(userId, username, firstName, lastName, buttonId, templateId, actionType, chatId);
    },

    getInteractionStats() {
        const stmt = db.prepare(`
            SELECT 
                COUNT(*) as total_interactions,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(DISTINCT chat_id) as active_chats
            FROM interactions
        `);
        return stmt.get();
    },

    // 获取商家预约统计
    getMerchantBookingStats() {
        const stmt = db.prepare(`
            SELECT 
                m.id,
                m.teacher_name,
                r.name as region_name,
                COUNT(CASE WHEN i.action_type LIKE 'book_%' THEN 1 END) as booking_count,
                GROUP_CONCAT(
                    CASE WHEN i.action_type LIKE 'book_%' THEN
                        i.username || '|' || 
                        CASE 
                            WHEN i.action_type = 'book_p' THEN 'p课程'
                            WHEN i.action_type = 'book_pp' THEN 'pp课程'
                            WHEN i.action_type = 'book_other' THEN '其他时长'
                            ELSE i.action_type
                        END || '|' ||
                        datetime(i.timestamp, 'unixepoch', 'localtime')
                    END,
                    '; '
                ) as booking_details
            FROM merchants m
            LEFT JOIN regions r ON m.region_id = r.id
            LEFT JOIN interactions i ON i.user_id = m.user_id AND i.action_type LIKE 'book_%'
            WHERE m.status = 'active'
            GROUP BY m.id, m.teacher_name, r.name
            ORDER BY booking_count DESC, m.teacher_name
        `);
        return stmt.all();
    },

    // 获取消息浏览和点击统计
    getMessageStats() {
        const stmt = db.prepare(`
            SELECT 
                i.chat_id,
                i.action_type,
                COUNT(*) as count,
                COUNT(DISTINCT i.user_id) as unique_users,
                GROUP_CONCAT(DISTINCT i.username) as usernames,
                datetime(MAX(i.timestamp), 'unixepoch', 'localtime') as last_interaction
            FROM interactions i
            WHERE i.action_type IN ('click', 'template_click', 'view')
            GROUP BY i.chat_id, i.action_type
            ORDER BY count DESC
        `);
        return stmt.all();
    },

    // 获取最近预约记录
    getRecentBookings(limit = 20) {
        const stmt = db.prepare(`
            SELECT 
                o.user_username as username,
                o.user_name as first_name,
                '' as last_name,
                o.user_id,
                CASE 
                    WHEN o.course_content LIKE '%基础%' THEN 'p'
                    WHEN o.course_content LIKE '%高级%' THEN 'pp'
                    ELSE 'other'
                END as course_type,
                o.booking_time,
                o.teacher_name,
                r.name as region_name
            FROM orders o
            LEFT JOIN merchants m ON o.merchant_id = m.id
            LEFT JOIN regions r ON m.region_id = r.id
            ORDER BY datetime(o.booking_time) DESC
            LIMIT ?
        `);
        return stmt.all(limit);
    },

    // 获取按钮点击统计
    getButtonClickStats() {
        const stmt = db.prepare(`
            SELECT 
                b.id,
                b.title,
                b.click_count,
                m.teacher_name as merchant_name,
                COUNT(i.id) as interaction_count,
                datetime(MAX(i.timestamp), 'unixepoch', 'localtime') as last_click
            FROM buttons b
            LEFT JOIN merchants m ON b.merchant_id = m.id
            LEFT JOIN interactions i ON b.id = i.button_id
            WHERE b.active = 1
            GROUP BY b.id, b.title, b.click_count, m.teacher_name
            ORDER BY b.click_count DESC
        `);
        return stmt.all();
    },

    // 预约会话管理
    createBookingSession(userId, merchantId, courseType) {
        const stmt = db.prepare('INSERT INTO booking_sessions (user_id, merchant_id, course_type) VALUES (?, ?, ?)');
        const result = stmt.run(userId, merchantId, courseType);
        return result.lastInsertRowid;
    },

    getBookingSession(id) {
        const stmt = db.prepare('SELECT * FROM booking_sessions WHERE id = ?');
        return stmt.get(id);
    },

    updateBookingSession(id, status, step) {
        const stmt = db.prepare('UPDATE booking_sessions SET status = ?, step = ?, updated_at = strftime(\'%s\', \'now\') WHERE id = ?');
        return stmt.run(status, step, id);
    },

    // 更新用户课程状态
    updateUserCourseStatus(bookingSessionId, status) {
        const stmt = db.prepare('UPDATE booking_sessions SET user_course_status = ?, updated_at = strftime(\'%s\', \'now\') WHERE id = ?');
        return stmt.run(status, bookingSessionId);
    },

    // 更新商家课程状态
    updateMerchantCourseStatus(bookingSessionId, status) {
        const stmt = db.prepare('UPDATE booking_sessions SET merchant_course_status = ?, updated_at = strftime(\'%s\', \'now\') WHERE id = ?');
        return stmt.run(status, bookingSessionId);
    },

    getActiveBookingSession(userId, merchantId) {
        const stmt = db.prepare('SELECT * FROM booking_sessions WHERE user_id = ? AND merchant_id = ? AND status IN ("pending", "confirmed") ORDER BY created_at DESC LIMIT 1');
        return stmt.get(userId, merchantId);
    },

    // 评价管理
    createEvaluation(bookingSessionId, evaluatorType, evaluatorId, targetId) {
        const stmt = db.prepare('INSERT INTO evaluations (booking_session_id, evaluator_type, evaluator_id, target_id) VALUES (?, ?, ?, ?)');
        const result = stmt.run(bookingSessionId, evaluatorType, evaluatorId, targetId);
        return result.lastInsertRowid;
    },

    updateEvaluation(id, overallScore, detailedScores, comments, status) {
        // 构建动态更新语句，只更新非null的字段
        let updateFields = [];
        let values = [];
        
        if (overallScore !== null && overallScore !== undefined) {
            updateFields.push('overall_score = ?');
            values.push(overallScore);
        }
        
                if (detailedScores !== null && detailedScores !== undefined) {
            updateFields.push('detailed_scores = ?');
            values.push(typeof detailedScores === 'object' ? JSON.stringify(detailedScores) : detailedScores);
        }

        if (comments !== null && comments !== undefined) {
            updateFields.push('comments = ?');
            values.push(comments);
        }
        
        if (status !== null && status !== undefined) {
            updateFields.push('status = ?');
            values.push(status);
        }
        
        if (updateFields.length === 0) {
            console.log('updateEvaluation: 没有字段需要更新');
            return { changes: 0 };
        }
        
        values.push(id);
        const sql = `UPDATE evaluations SET ${updateFields.join(', ')} WHERE id = ?`;
        
        const stmt = db.prepare(sql);
        return stmt.run(...values);
    },

    getEvaluation(id) {
        const stmt = db.prepare('SELECT * FROM evaluations WHERE id = ?');
        return stmt.get(id);
    },

    // 评价会话管理
    createEvaluationSession(userId, evaluationId) {
        const stmt = db.prepare('INSERT INTO evaluation_sessions (user_id, evaluation_id) VALUES (?, ?)');
        const result = stmt.run(userId, evaluationId);
        return result.lastInsertRowid;
    },

    updateEvaluationSession(id, currentStep, tempData) {
        const stmt = db.prepare('UPDATE evaluation_sessions SET current_step = ?, temp_data = ?, updated_at = strftime(\'%s\', \'now\') WHERE id = ?');
        return stmt.run(currentStep, JSON.stringify(tempData), id);
    },

    getEvaluationSession(userId, evaluationId) {
        const stmt = db.prepare('SELECT * FROM evaluation_sessions WHERE user_id = ? AND evaluation_id = ? ORDER BY created_at DESC LIMIT 1');
        return stmt.get(userId, evaluationId);
    },

    getActiveEvaluationSession(userId) {
        const stmt = db.prepare('SELECT * FROM evaluation_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1');
        return stmt.get(userId);
    },

    getEvaluationSessionByUserAndState(userId, state) {
        const stmt = db.prepare('SELECT * FROM evaluation_sessions WHERE user_id = ? AND current_step = ? ORDER BY created_at DESC LIMIT 1');
        return stmt.get(userId, state);
    },

    deleteEvaluationSession(id) {
        const stmt = db.prepare('DELETE FROM evaluation_sessions WHERE id = ?');
        return stmt.run(id);
    },

    // 订单管理
    createOrder(orderData) {
        const stmt = db.prepare(`
            INSERT INTO orders (
                booking_session_id, user_id, user_name, user_username, 
                merchant_id, merchant_user_id, teacher_name, teacher_contact, 
                course_type, course_content, price_range, status, 
                user_evaluation, merchant_evaluation, report_content
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
            orderData.booking_session_id,
            orderData.user_id,
            orderData.user_name,
            orderData.user_username,
            orderData.merchant_id,
            orderData.merchant_user_id || null,
            orderData.teacher_name,
            orderData.teacher_contact,
            orderData.course_type,
            orderData.course_content,
            orderData.price_range,
            orderData.status || 'attempting',
            orderData.user_evaluation,
            orderData.merchant_evaluation,
            orderData.report_content
        );
        return result.lastInsertRowid;
    },

    getOrder(id) {
        const stmt = db.prepare('SELECT * FROM orders WHERE id = ?');
        return stmt.get(id);
    },

    getOrderByBookingSession(bookingSessionId) {
        const stmt = db.prepare('SELECT * FROM orders WHERE booking_session_id = ?');
        return stmt.get(bookingSessionId);
    },

    getAllOrders() {
        const stmt = db.prepare('SELECT * FROM orders ORDER BY created_at DESC');
        return stmt.all();
    },

    updateOrderEvaluation(id, userEvaluation, merchantEvaluation) {
        const stmt = db.prepare('UPDATE orders SET user_evaluation = ?, merchant_evaluation = ?, updated_at = ? WHERE id = ?');
        return stmt.run(userEvaluation, merchantEvaluation, Math.floor(Date.now() / 1000), id);
    },

    updateOrderReport(id, reportContent) {
        const stmt = db.prepare('UPDATE orders SET report_content = ?, updated_at = ? WHERE id = ?');
        return stmt.run(reportContent, new Date().toISOString(), id);
    },

    updateOrderStatus(id, status, updatedBy = 'system') {
        const transaction = db.transaction(() => {
            // 使用EAV状态服务进行状态流转
            try {
                const statusService = getOrderStatusService();
                const result = statusService.transitionStatus(id, status, updatedBy);
                if (!result) {
                    // 如果EAV服务失败，回退到直接更新
                    const stmt = db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?');
                    return stmt.run(status, Math.floor(Date.now() / 1000), id);
                }
                return { changes: 1 }; // 模拟successful result
            } catch (error) {
                console.error(`使用EAV状态服务更新失败，回退到直接更新: ${error.message}`);
                // 回退到直接数据库更新
                const stmt = db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?');
                return stmt.run(status, Math.floor(Date.now() / 1000), id);
            }
        });
        
        return transaction();
    },

    // 更新订单多个字段
    updateOrderFields(id, updateData) {
        const fields = Object.keys(updateData);
        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = Object.values(updateData);
        values.push(id);
        
        const stmt = db.prepare(`UPDATE orders SET ${setClause} WHERE id = ?`);
        return stmt.run(...values);
    },

    // 获取用户最近的"尝试预约"订单
    getRecentAttemptingOrder(userId, merchantId) {
        const stmt = db.prepare(`
            SELECT * FROM orders 
            WHERE user_id = ? AND merchant_id = ? AND status = 'attempting'
            ORDER BY created_at DESC 
            LIMIT 1
        `);
        return stmt.get(userId, merchantId);
    },

    // 获取用户指定状态的订单
    getOrderByStatus(userId, merchantId, status) {
        const stmt = db.prepare(`
            SELECT * FROM orders 
            WHERE user_id = ? AND merchant_id = ? AND status = ?
            ORDER BY created_at DESC 
            LIMIT 1
        `);
        return stmt.get(userId, merchantId, status);
    },

    // ===== 评价系统 - 简单高效的数据返回 =====
    
    // 获取所有评价数据（简化版本，只返回基础信息）
    getAllEvaluations() {
        const stmt = db.prepare(`
            SELECT 
                o.id,
                o.user_name as user_name,
                o.user_username,
                o.teacher_name,
                o.course_content,
                o.price_range,
                datetime(o.created_at, 'unixepoch', 'localtime') as order_time,
                CASE 
                    WHEN o.user_evaluation IS NOT NULL AND o.merchant_evaluation IS NOT NULL 
                    THEN '✅ 双向完成' 
                    WHEN o.user_evaluation IS NOT NULL 
                    THEN '👤 用户已评' 
                    WHEN o.merchant_evaluation IS NOT NULL 
                    THEN '👩‍🏫 老师已评'
                    ELSE '⏳ 待评价'
                END as eval_status,
                o.status as order_status
            FROM orders o
            ORDER BY o.created_at DESC
            LIMIT 50
        `);
        return stmt.all();
    },

    // 获取评价详情（包含完整评价内容）
    getEvaluationDetails(orderId) {
        const stmt = db.prepare(`
            SELECT 
                o.*,
                r.name as region_name,
                datetime(o.created_at, 'unixepoch', 'localtime') as formatted_time
            FROM orders o
            LEFT JOIN merchants m ON o.merchant_id = m.id
            LEFT JOIN regions r ON m.region_id = r.id
            WHERE o.id = ?
        `);
        const order = stmt.get(orderId);
        
        if (order) {
            // 解析评价数据
            try {
                order.user_eval_parsed = order.user_evaluation ? JSON.parse(order.user_evaluation) : null;
                order.merchant_eval_parsed = order.merchant_evaluation ? JSON.parse(order.merchant_evaluation) : null;
            } catch (e) {
                order.user_eval_parsed = null;
                order.merchant_eval_parsed = null;
            }
        }
        
        return order;
    },

    // 获取评价统计数据
    getEvaluationStats() {
        const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
        const userEvaluated = db.prepare('SELECT COUNT(*) as count FROM orders WHERE user_evaluation IS NOT NULL').get().count;
        const merchantEvaluated = db.prepare('SELECT COUNT(*) as count FROM orders WHERE merchant_evaluation IS NOT NULL').get().count;
        const bothEvaluated = db.prepare('SELECT COUNT(*) as count FROM orders WHERE user_evaluation IS NOT NULL AND merchant_evaluation IS NOT NULL').get().count;
        
        return {
            total_orders: totalOrders,
            user_evaluated: userEvaluated,
            merchant_evaluated: merchantEvaluated,
            both_evaluated: bothEvaluated,
            user_eval_rate: totalOrders > 0 ? Math.round((userEvaluated / totalOrders) * 100) : 0,
            merchant_eval_rate: totalOrders > 0 ? Math.round((merchantEvaluated / totalOrders) * 100) : 0,
            completion_rate: totalOrders > 0 ? Math.round((bothEvaluated / totalOrders) * 100) : 0
        };
    },

    // 获取订单评价数据（用于管理后台展示）
    getOrderEvaluations() {
        const stmt = db.prepare(`
            SELECT 
                o.id,
                o.user_name,
                o.user_username,
                o.teacher_name,
                o.course_content,
                o.price_range,
                o.user_evaluation,
                o.merchant_evaluation,
                datetime(o.created_at, 'unixepoch', 'localtime') as order_time,
                CASE 
                    WHEN o.user_evaluation IS NOT NULL AND o.merchant_evaluation IS NOT NULL 
                    THEN 'completed' 
                    WHEN o.user_evaluation IS NOT NULL 
                    THEN 'user_only' 
                    WHEN o.merchant_evaluation IS NOT NULL 
                    THEN 'merchant_only'
                    ELSE 'pending'
                END as eval_status
            FROM orders o
            WHERE o.user_evaluation IS NOT NULL OR o.merchant_evaluation IS NOT NULL
            ORDER BY o.created_at DESC
        `);
        
        const evaluations = stmt.all();
        
        // 简化评价数据，只提取关键信息用于展示
        return evaluations.map(eval => {
            const result = { ...eval };
            
            // 解析用户评价，提取平均分和关键信息
            if (eval.user_evaluation) {
                try {
                    const userEval = JSON.parse(eval.user_evaluation);
                    if (userEval.scores) {
                        const scores = Object.values(userEval.scores).filter(s => typeof s === 'number');
                        result.user_avg_score = scores.length > 0 ? 
                            (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 'N/A';
                    }
                    result.user_eval_summary = `👤 ${result.user_avg_score || 'N/A'}分`;
                } catch (e) {
                    result.user_eval_summary = '👤 数据异常';
                }
            }
            
            // 解析商家评价
            if (eval.merchant_evaluation) {
                try {
                    const merchantEval = JSON.parse(eval.merchant_evaluation);
                    if (merchantEval.scores) {
                        const scores = Object.values(merchantEval.scores).filter(s => typeof s === 'number');
                        result.merchant_avg_score = scores.length > 0 ? 
                            (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 'N/A';
                    }
                    result.merchant_eval_summary = `👩‍🏫 ${result.merchant_avg_score || 'N/A'}分`;
                } catch (e) {
                    result.merchant_eval_summary = '👩‍🏫 数据异常';
                }
            }
            
            return result;
        });
    },

    // 批量获取商家信息（优化版本）
    getBatchMerchants(merchantIds) {
        if (!merchantIds || merchantIds.length === 0) return [];
        
        const cacheKey = `batch_merchants_${merchantIds.sort().join('_')}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;
        
        const placeholders = merchantIds.map(() => '?').join(',');
        const stmt = db.prepare(`
            SELECT m.*, r.name as region_name 
            FROM merchants m 
            LEFT JOIN regions r ON m.region_id = r.id 
            WHERE m.id IN (${placeholders})
        `);
        const result = stmt.all(...merchantIds);
        cache.set(cacheKey, result, 2 * 60 * 1000); // 2分钟缓存
        return result;
    },

    // 批量更新商家状态
    batchUpdateMerchantStatus(updates) {
        const transaction = db.transaction((updates) => {
            const stmt = db.prepare('UPDATE merchants SET status = ? WHERE id = ?');
            for (const update of updates) {
                stmt.run(update.status, update.id);
            }
        });
        
        const result = transaction(updates);
        
        // 清理相关缓存
        cache.set('all_merchants', null);
        cache.set('active_merchants', null);
        
        return result;
    }
};

// 添加EAV相关方法到导出对象
dbOperations.getMerchantSkills = function(merchantId) {
    try {
        const skillService = getMerchantSkillService();
        return skillService.getMerchantSkills(merchantId);
    } catch (error) {
        console.error(`获取商家技能失败 (merchantId: ${merchantId}):`, error);
        return { wash: '未填写', blow: '未填写', do: '未填写', kiss: '未填写' };
    }
};

dbOperations.getBatchMerchantSkills = function(merchantIds) {
    try {
        const skillService = getMerchantSkillService();
        return skillService.getBatchMerchantSkills(merchantIds);
    } catch (error) {
        console.error('批量获取商家技能失败:', error);
        const result = {};
        for (const merchantId of merchantIds) {
            result[merchantId] = { wash: '未填写', blow: '未填写', do: '未填写', kiss: '未填写' };
        }
        return result;
    }
};

dbOperations.formatMerchantSkillsDisplay = function(merchantId) {
    try {
        const skillService = getMerchantSkillService();
        return skillService.formatSkillsDisplay(merchantId);
    } catch (error) {
        console.error(`格式化商家技能显示失败 (merchantId: ${merchantId}):`, error);
        return '💦洗:未填写\n👄吹:未填写\n❤️做:未填写\n🐍吻:未填写';
    }
};

dbOperations.getOrderStatusConfig = function(status) {
    try {
        const statusService = getOrderStatusService();
        return statusService.getStatusDisplayInfo(status);
    } catch (error) {
        console.error(`获取订单状态配置失败 (status: ${status}):`, error);
        return { status, name: status, description: '未知状态', color: '#808080' };
    }
};

dbOperations.canTransitionOrderStatus = function(currentStatus, targetStatus) {
    try {
        const statusService = getOrderStatusService();
        return statusService.canTransitionTo(currentStatus, targetStatus);
    } catch (error) {
        console.error(`检查状态流转失败 (${currentStatus} -> ${targetStatus}):`, error);
        return true; // 默认允许，兼容原逻辑
    }
};

dbOperations.handleTimeoutOrders = function() {
    try {
        const statusService = getOrderStatusService();
        return statusService.handleTimeoutOrders();
    } catch (error) {
        console.error('处理超时订单失败:', error);
        return 0;
    }
};

// 数据迁移相关方法
dbOperations.migrateAllMerchantSkillsToEAV = function() {
    try {
        const skillService = getMerchantSkillService();
        return skillService.migrateAllMerchantSkills();
    } catch (error) {
        console.error('迁移商家技能到EAV失败:', error);
        return 0;
    }
};

module.exports = dbOperations;
module.exports.db = db; 
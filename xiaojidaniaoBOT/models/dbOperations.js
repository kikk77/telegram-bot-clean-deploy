const { db } = require('../config/database');

// 数据库操作函数
const dbOperations = {
    // 绑定码操作
    generateBindCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    },

    createBindCode(description) {
        const code = this.generateBindCode();
        const stmt = db.prepare('INSERT INTO bind_codes (code, description) VALUES (?, ?)');
        const result = stmt.run(code, description);
        return { id: result.lastInsertRowid, code };
    },

    getBindCode(code) {
        const stmt = db.prepare('SELECT * FROM bind_codes WHERE code = ? AND used = 0');
        return stmt.get(code);
    },

    getAllBindCodes() {
        const stmt = db.prepare(`
            SELECT bc.*, m.teacher_name, m.username 
            FROM bind_codes bc 
            LEFT JOIN merchants m ON bc.used_by = m.user_id 
            ORDER BY bc.created_at DESC
        `);
        return stmt.all();
    },

    useBindCode(code, userId) {
        const stmt = db.prepare('UPDATE bind_codes SET used = 1, used_by = ?, used_at = strftime(\'%s\', \'now\') WHERE code = ? AND used = 0');
        const result = stmt.run(userId, code);
        return result.changes > 0;
    },

    deleteBindCode(id) {
        const stmt = db.prepare('DELETE FROM bind_codes WHERE id = ?');
        return stmt.run(id);
    },

    // 地区操作
    createRegion(name, sortOrder = 0) {
        const stmt = db.prepare('INSERT INTO regions (name, sort_order) VALUES (?, ?)');
        const result = stmt.run(name, sortOrder);
        return result.lastInsertRowid;
    },

    getAllRegions() {
        const stmt = db.prepare('SELECT * FROM regions WHERE active = 1 ORDER BY sort_order, name');
        return stmt.all();
    },

    getRegionById(id) {
        const stmt = db.prepare('SELECT * FROM regions WHERE id = ? AND active = 1');
        return stmt.get(id);
    },

    updateRegion(id, name, sortOrder) {
        const stmt = db.prepare('UPDATE regions SET name = ?, sort_order = ? WHERE id = ?');
        return stmt.run(name, sortOrder, id);
    },

    deleteRegion(id) {
        const stmt = db.prepare('DELETE FROM regions WHERE id = ?');
        return stmt.run(id);
    },

    // 商家操作
    createMerchant(teacherName, regionId, contact, bindCode, userId) {
        const stmt = db.prepare(`
            INSERT INTO merchants (user_id, teacher_name, region_id, contact, bind_code, bind_step, status) 
            VALUES (?, ?, ?, ?, ?, 5, 'active')
        `);
        const result = stmt.run(userId, teacherName, regionId, contact, bindCode);
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
        const stmt = db.prepare(`
            SELECT m.*, r.name as region_name 
            FROM merchants m 
            LEFT JOIN regions r ON m.region_id = r.id 
            ORDER BY m.created_at DESC
        `);
        return stmt.all();
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
        
        return transaction();
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
        const stmt = db.prepare(`
            UPDATE merchants SET 
                teacher_name = ?, 
                region_id = ?, 
                contact = ?, 
                advantages = ?, 
                disadvantages = ?, 
                price1 = ?, 
                price2 = ?, 
                skill_wash = ?, 
                skill_blow = ?, 
                skill_do = ?, 
                skill_kiss = ? 
            WHERE id = ?
        `);
        return stmt.run(
            data.teacherName, 
            data.regionId, 
            data.contact, 
            data.advantages, 
            data.disadvantages, 
            data.price1, 
            data.price2, 
            data.skillWash, 
            data.skillBlow, 
            data.skillDo, 
            data.skillKiss, 
            id
        );
    },

    toggleMerchantStatus(id) {
        const stmt = db.prepare('UPDATE merchants SET status = CASE WHEN status = "active" THEN "suspended" ELSE "active" END WHERE id = ?');
        return stmt.run(id);
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
        const stmt = db.prepare('UPDATE evaluations SET overall_score = ?, detailed_scores = ?, comments = ?, status = ? WHERE id = ?');
        return stmt.run(overallScore, JSON.stringify(detailedScores), comments, status, id);
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

    // 订单管理
    createOrder(orderData) {
        const stmt = db.prepare(`
            INSERT INTO orders (
                booking_session_id, user_id, user_name, user_username, 
                merchant_id, teacher_name, teacher_contact, course_content, 
                price, booking_time, status, user_evaluation, merchant_evaluation, 
                report_content, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
            orderData.booking_session_id,
            orderData.user_id,
            orderData.user_name,
            orderData.user_username,
            orderData.merchant_id,
            orderData.teacher_name,
            orderData.teacher_contact,
            orderData.course_content,
            orderData.price,
            orderData.booking_time,
            orderData.status,
            orderData.user_evaluation,
            orderData.merchant_evaluation,
            orderData.report_content,
            orderData.created_at,
            orderData.updated_at
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
        return stmt.run(userEvaluation, merchantEvaluation, new Date().toISOString(), id);
    },

    updateOrderReport(id, reportContent) {
        const stmt = db.prepare('UPDATE orders SET report_content = ?, updated_at = ? WHERE id = ?');
        return stmt.run(reportContent, new Date().toISOString(), id);
    },

    updateOrderStatus(id, status) {
        const stmt = db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?');
        return stmt.run(status, new Date().toISOString(), id);
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
                o.price,
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
                o.price,
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
    }
};

module.exports = dbOperations;
module.exports.db = db; 
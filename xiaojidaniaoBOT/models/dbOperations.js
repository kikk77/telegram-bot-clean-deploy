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

    updateMerchantBindStep(userId, step, bindData = null) {
        const stmt = db.prepare('UPDATE merchants SET bind_step = ?, bind_data = ? WHERE user_id = ?');
        return stmt.run(step, bindData, userId);
    },

    deleteMerchant(id) {
        // 开始事务，确保数据一致性
        const transaction = db.transaction(() => {
            // 1. 先删除相关的交互记录（通过按钮关联）
            const deleteInteractionsStmt = db.prepare(`
                DELETE FROM interactions 
                WHERE button_id IN (SELECT id FROM buttons WHERE merchant_id = ?)
            `);
            deleteInteractionsStmt.run(id);
            
            // 2. 删除商家相关的按钮
            const deleteButtonsStmt = db.prepare('DELETE FROM buttons WHERE merchant_id = ?');
            deleteButtonsStmt.run(id);
            
            // 3. 最后删除商家
            const deleteMerchantStmt = db.prepare('DELETE FROM merchants WHERE id = ?');
            return deleteMerchantStmt.run(id);
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
    logInteraction(userId, username, buttonId, templateId, actionType, chatId) {
        const stmt = db.prepare('INSERT INTO interactions (user_id, username, button_id, template_id, action_type, chat_id) VALUES (?, ?, ?, ?, ?, ?)');
        return stmt.run(userId, username, buttonId, templateId, actionType, chatId);
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
    }
};

module.exports = dbOperations; 
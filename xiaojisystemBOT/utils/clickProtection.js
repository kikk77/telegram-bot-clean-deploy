/**
 * Telegram Bot 防重复点击保护模块
 * 防止用户快速连续点击按钮导致的各种问题
 */

class ClickProtection {
    constructor() {
        // 存储正在处理的callback query
        this.callbackQueryLocks = new Map();
        
        // 用户操作冷却期
        this.userActionCooldowns = new Map();
        
        // 消息删除尝试记录
        this.messageDeleteAttempts = new Map();
        
        // 预约相关的长期冷却期
        this.bookingCooldowns = new Map();
        
        // 清理间隔
        this.setupCleanupIntervals();
    }
    
    /**
     * 设置定期清理任务
     */
    setupCleanupIntervals() {
        // 每5分钟清理过期的操作记录
        setInterval(() => {
            this.cleanupExpiredRecords();
        }, 5 * 60 * 1000);
    }
    
    /**
     * 清理过期记录
     */
    cleanupExpiredRecords() {
        const now = Date.now();
        
        // 清理callback query锁 (超过30秒的)
        for (const [key, timestamp] of this.callbackQueryLocks.entries()) {
            if (now - timestamp > 30000) {
                this.callbackQueryLocks.delete(key);
            }
        }
        
        // 清理用户操作冷却期 (超过10秒的)
        for (const [key, timestamp] of this.userActionCooldowns.entries()) {
            if (now - timestamp > 10000) {
                this.userActionCooldowns.delete(key);
            }
        }
        
        // 清理消息删除记录 (超过5分钟的)
        for (const [key, timestamp] of this.messageDeleteAttempts.entries()) {
            if (now - timestamp > 5 * 60 * 1000) {
                this.messageDeleteAttempts.delete(key);
            }
        }
        
        console.log('🧹 清理过期的点击保护记录');
    }
    
    /**
     * 检查callback query是否为重复点击
     */
    isCallbackQueryDuplicate(query) {
        const queryId = query.id;
        const userId = query.from.id;
        const data = query.data;
        
        // 1. 检查相同query ID是否正在处理
        if (this.callbackQueryLocks.has(queryId)) {
            console.log(`🛡️ 重复query ID被拦截: ${queryId}`);
            return true;
        }
        
        // 2. 检查用户在短时间内是否有相同操作
        const actionKey = `${userId}_${data}`;
        const lastActionTime = this.userActionCooldowns.get(actionKey) || 0;
        const now = Date.now();
        const cooldownPeriod = 1000; // 1秒冷却期
        
        if (now - lastActionTime < cooldownPeriod) {
            console.log(`🛡️ 用户操作冷却期内被拦截: ${actionKey}`);
            return true;
        }
        
        // 3. 对于预约相关操作，检查更长的冷却期
        if (data.startsWith('book_') || data.startsWith('attack_')) {
            const bookingKey = `booking_${userId}_${data}`;
            const lastBookingTime = this.userActionCooldowns.get(bookingKey) || 0;
            const bookingCooldown = 2000; // 2秒预约冷却期
            
            if (now - lastBookingTime < bookingCooldown) {
                console.log(`🛡️ 预约操作冷却期内被拦截: ${bookingKey}`);
                return true;
            }
            
            // 记录预约操作时间
            this.userActionCooldowns.set(bookingKey, now);
            setTimeout(() => this.userActionCooldowns.delete(bookingKey), bookingCooldown);
        }
        
        return false;
    }
    
    /**
     * 锁定callback query处理
     */
    lockCallbackQuery(queryId, timeoutMs = 10000) {
        this.callbackQueryLocks.set(queryId, Date.now());
        setTimeout(() => this.callbackQueryLocks.delete(queryId), timeoutMs);
    }
    
    /**
     * 记录用户操作
     */
    recordUserAction(userId, data) {
        const actionKey = `${userId}_${data}`;
        this.userActionCooldowns.set(actionKey, Date.now());
        setTimeout(() => this.userActionCooldowns.delete(actionKey), 3000);
    }
    
    /**
     * 安全删除消息 - 防止重复删除错误
     */
    async safeDeleteMessage(bot, chatId, messageId, context = '') {
        const deleteKey = `${chatId}_${messageId}`;
        
        // 检查是否已经尝试删除过这条消息
        if (this.messageDeleteAttempts.has(deleteKey)) {
            console.log(`🛡️ 消息删除跳过(已尝试): ${deleteKey} ${context}`);
            return false;
        }
        
        try {
            // 标记为正在删除
            this.messageDeleteAttempts.set(deleteKey, Date.now());
            
            await bot.deleteMessage(chatId, messageId);
            console.log(`✅ 消息删除成功: ${deleteKey} ${context}`);
            
            // 5秒后清理记录
            setTimeout(() => this.messageDeleteAttempts.delete(deleteKey), 5000);
            return true;
            
        } catch (error) {
            console.log(`⚠️ 消息删除失败: ${deleteKey} ${context} - ${error.message}`);
            
            // 立即清理记录，因为可能消息已经不存在了
            this.messageDeleteAttempts.delete(deleteKey);
            return false;
        }
    }
    
    /**
     * 安全的callback query响应
     */
    async safeAnswerCallbackQuery(bot, queryId, options = {}) {
        try {
            await bot.answerCallbackQuery(queryId, options);
            return true;
        } catch (error) {
            console.error(`⚠️ 响应callback query失败 ${queryId}:`, error.message);
            return false;
        }
    }
    
    /**
     * 检查预约冷却期
     */
    checkBookingCooldown(userId, merchantId, cooldownPeriod = 30 * 60 * 1000) {
        const cooldownKey = `${userId}_${merchantId}`;
        const lastBookingTime = this.bookingCooldowns.get(cooldownKey) || 0;
        const now = Date.now();
        
        return {
            isInCooldown: now - lastBookingTime < cooldownPeriod,
            remainingTime: Math.max(0, cooldownPeriod - (now - lastBookingTime)),
            lastBookingTime
        };
    }
    
    /**
     * 设置预约冷却期
     */
    setBookingCooldown(userId, merchantId) {
        const cooldownKey = `${userId}_${merchantId}`;
        this.bookingCooldowns.set(cooldownKey, Date.now());
    }
    
    /**
     * 清除预约冷却期
     */
    clearBookingCooldown(userId, merchantId) {
        const cooldownKey = `${userId}_${merchantId}`;
        this.bookingCooldowns.delete(cooldownKey);
        console.log(`已清除用户 ${userId} 对商家 ${merchantId} 的预约冷却时间`);
    }
    
    /**
     * 包装callback query处理器，自动应用防护机制
     * 遵循"立刻删除消息"然后"后台防重复检查"的流程
     */
    wrapCallbackQueryHandler(bot, originalHandler) {
        return async (query) => {
            const queryId = query.id;
            const chatId = query.message.chat.id;
            
            try {
                // 1. 立即响应callback query
                await this.safeAnswerCallbackQuery(bot, queryId);
                
                // 2. 立即删除消息
                await this.safeDeleteMessage(bot, chatId, query.message.message_id, 'callback_click');
                
                // 3. 后台异步处理防重复检查和业务逻辑
                setImmediate(async () => {
                    try {
                        // 检查是否为重复点击
                        if (this.isCallbackQueryDuplicate(query)) {
                            console.log(`🛡️ 后台拦截重复点击: ${query.from.id}_${query.data}`);
                            return; // 静默拦截，用户端已经得到响应且消息已删除
                        }
                        
                        // 锁定当前query处理
                        this.lockCallbackQuery(queryId);
                        
                        // 记录用户操作
                        this.recordUserAction(query.from.id, query.data);
                        
                        // 调用原始处理器
                        await originalHandler(query);
                        
                    } catch (error) {
                        console.error('后台处理callback逻辑失败:', error);
                    }
                });
                
            } catch (error) {
                console.error('处理callback_query失败:', error);
            }
        };
    }
    
    /**
     * 获取统计信息
     */
    getStats() {
        return {
            activeQueryLocks: this.callbackQueryLocks.size,
            activeActionCooldowns: this.userActionCooldowns.size,
            activeDeleteAttempts: this.messageDeleteAttempts.size,
            activeBookingCooldowns: this.bookingCooldowns.size
        };
    }
}

// 创建全局实例
const clickProtection = new ClickProtection();

module.exports = {
    ClickProtection,
    clickProtection
}; 
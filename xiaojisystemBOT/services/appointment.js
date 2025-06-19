const dbOperations = require('../models/dbOperations');

// 约课流程管理模块
class AppointmentService {
    constructor(bot) {
        this.bot = bot;
        this.bookingCooldowns = new Map(); // 预约冷却时间管理
    }

    // 发送约课成功确认消息
    async sendBookingSuccessCheck(userId, bookingSessionId, merchant, bookType, fullName, username) {
        try {
            const message = `⚠️本条信息预约后再点击按钮⚠️
本次是否与老师约课成功？`;
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '成功✅', callback_data: `booking_success_${bookingSessionId}` },
                        { text: '未约成❌', callback_data: `booking_failed_${bookingSessionId}` }
                    ]
                ]
            };
            
            // 使用不删除历史的方式发送约课成功确认消息
            await this.sendMessageWithoutDelete(userId, message, { 
                reply_markup: keyboard 
            }, 'booking_success_check', {
                bookingSessionId,
                merchantId: merchant.id,
                bookType,
                fullName,
                username,
                teacherName: merchant.teacher_name
            });
            
        } catch (error) {
            console.error('发送约课成功确认消息失败:', error);
        }
    }

    // 处理约课成功确认流程
    async handleBookingSuccessFlow(userId, data, query) {
        try {
            if (data.startsWith('booking_success_')) {
                const bookingSessionId = data.replace('booking_success_', '');
                const bookingSession = dbOperations.getBookingSession(bookingSessionId);
                
                if (bookingSession) {
                    this.bot.answerCallbackQuery(query.id, { text: '约课成功确认' });
                    
                    // 创建后台订单数据
                    const orderId = await this.createOrderData(bookingSession, userId, query);
                    
                    await this.sendMessageWithoutDelete(userId, '✅ 约课成功！订单已创建，请等待课程完成确认。', {}, 'booking_success_confirmed');
                    
                    // 延迟发送课程完成确认消息
                    setTimeout(async () => {
                        const merchant = dbOperations.getMerchantById(bookingSession.merchant_id);
                        const userFullName = `${query.from.first_name || ''} ${query.from.last_name || ''}`.trim() || '未设置名称';
                        const username = query.from.username ? `@${query.from.username}` : '未设置用户名';
                        
                        await this.sendCourseCompletionCheck(userId, merchant.user_id, bookingSessionId, userFullName, username, merchant.teacher_name);
                    }, 2000);
                    
                    console.log(`用户 ${userId} 确认约课成功，预约会话 ${bookingSessionId}，订单ID ${orderId}`);
                    
                } else {
                    this.bot.answerCallbackQuery(query.id, { text: '预约信息不存在' });
                }
                
            } else if (data.startsWith('booking_failed_')) {
                const bookingSessionId = data.replace('booking_failed_', '');
                
                this.bot.answerCallbackQuery(query.id, { text: '约课未成功' });
                
                // 清空本轮对话历史
                await this.clearUserConversation(userId);
                
                // 发送最终消息
                await this.bot.sendMessage(userId, '欢迎下次预约课程📅 🐤小鸡与你同在。');
                
                console.log(`用户 ${userId} 确认约课未成功，预约会话 ${bookingSessionId}`);
            }
        } catch (error) {
            console.error('处理约课成功确认流程失败:', error);
            this.bot.answerCallbackQuery(query.id, { text: '处理失败，请重试' });
        }
    }

    // 创建后台订单数据
    async createOrderData(bookingSession, userId, query) {
        try {
            const merchant = dbOperations.getMerchantById(bookingSession.merchant_id);
            const userFullName = `${query.from.first_name || ''} ${query.from.last_name || ''}`.trim() || '未设置名称';
            const username = query.from.username ? `@${query.from.username}` : '未设置用户名';
            
            // 确定课程内容和价格
            let courseContent = '';
            let price = '';
            
            switch (bookingSession.course_type) {
                case 'p':
                    courseContent = 'p';
                    price = merchant.p_price || '未设置';
                    break;
                case 'pp':
                    courseContent = 'pp';
                    price = merchant.pp_price || '未设置';
                    break;
                case 'other':
                    courseContent = '其他时长';
                    price = '其他';
                    break;
            }
            
            // 创建订单数据
            const orderData = {
                booking_session_id: bookingSession.id,
                user_id: userId,
                user_name: userFullName,
                user_username: username,
                merchant_id: merchant.id,
                teacher_name: merchant.teacher_name,
                teacher_contact: merchant.contact,
                course_content: courseContent,
                price: price,
                booking_time: new Date().toISOString(),
                status: 'confirmed', // 约课成功
                user_evaluation: null, // 将来填入用户评价
                merchant_evaluation: null, // 将来填入商家评价
                report_content: null, // 将来填入报告内容
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            // 保存到数据库
            const orderId = dbOperations.createOrder(orderData);
            
            console.log(`创建订单成功: 订单ID ${orderId}, 用户 ${userFullName} (${username}), 老师 ${merchant.teacher_name}, 课程 ${courseContent}`);
            
            return orderId;
            
        } catch (error) {
            console.error('创建订单数据失败:', error);
            throw error;
        }
    }

    // 处理预约流程
    async handleBookingFlow(userId, data, query, sendMessageWithoutDelete, sendCourseCompletionCheck, clearUserConversation) {
        // 存储外部函数引用
        this.sendMessageWithoutDelete = sendMessageWithoutDelete;
        this.sendCourseCompletionCheck = sendCourseCompletionCheck;
        this.clearUserConversation = clearUserConversation;

        if (data.startsWith('book_')) {
            const parts = data.split('_');
            const bookType = parts[1]; // p, pp, other
            const merchantId = parts[2];
            const chatId = query.message.chat.id;
            
            // 检查防重复点击机制（30分钟内同一用户对同一商家只能点击一次）
            const cooldownKey = `${userId}_${merchantId}`;
            const lastBookingTime = this.bookingCooldowns.get(cooldownKey) || 0;
            const now = Date.now();
            const cooldownPeriod = 30 * 60 * 1000; // 30分钟
            
            if (now - lastBookingTime < cooldownPeriod) {
                this.bot.answerCallbackQuery(query.id, {
                    text: `🐤鸡总，咱已经预约过了哦～\n请点击联系方式直接私聊老师。`,
                    show_alert: true
                });
                return;
            }
            
            const merchant = dbOperations.getMerchantById(merchantId);
            if (merchant) {
                // 记录本次点击时间
                this.bookingCooldowns.set(cooldownKey, now);
                
                // 获取用户信息
                const userName = query.from.first_name || '';
                const userLastName = query.from.last_name || '';
                const fullName = `${userName} ${userLastName}`.trim() || '未设置名称';
                const username = query.from.username ? `@${query.from.username}` : '未设置用户名';
                
                // 确定预约类型的中文描述
                let bookTypeText = '';
                switch (bookType) {
                    case 'p':
                        bookTypeText = 'p';
                        break;
                    case 'pp':
                        bookTypeText = 'pp';
                        break;
                    case 'other':
                        bookTypeText = '其他时长';
                        break;
                }
                
                // 创建预约会话
                const bookingSessionId = dbOperations.createBookingSession(userId, merchantId, bookType);
                
                // 发送通知给商家
                if (merchant.user_id) {
                    const merchantNotification = `老师您好，
用户名称 ${fullName}（${username}）即将与您进行联系。他想跟您预约${bookTypeText}课程
请及时关注私聊信息。
————————————————————————
🐤小鸡出征！请尽力服务好我们的勇士～
如遇任何问题，请群内联系小鸡管理员。`;
                    
                    this.bot.sendMessage(merchant.user_id, merchantNotification).catch(error => {
                        console.log(`无法发送通知给商家 ${merchant.user_id}: ${error.message}`);
                    });
                    
                    console.log(`已通知商家 ${merchant.user_id}，用户 ${fullName} (${username}) 预约了 ${bookTypeText}`);
                }
                
                // 生成联系方式链接
                let contactLink = merchant.contact;
                if (contactLink && contactLink.startsWith('@')) {
                    contactLink = `[${contactLink}](https://t.me/${contactLink.substring(1)})`;
                }
                
                const finalMessage = `🐤小鸡出征！
         已将出击信息发送给${contactLink}老师。请点击联系方式开始私聊老师进行预约。`;
                
                // 发送联系老师信息（不删除，保留此信息）
                const contactOptions = {
                    parse_mode: 'Markdown'
                };
                
                await this.bot.sendMessage(chatId, finalMessage, contactOptions);
                
                // 延迟2秒发送约课成功确认消息
                setTimeout(async () => {
                    await this.sendBookingSuccessCheck(userId, bookingSessionId, merchant, bookType, fullName, username);
                }, 2000);
                
                // 记录交互
                dbOperations.logInteraction(userId, query.from.username, query.from.first_name, query.from.last_name, null, null, `book_${bookType}`, chatId);
                console.log(`用户 ${userId} ${fullName} (${username}) 预约了商家 ${merchantId} (${bookType})`);
            }
            return true; // 表示已处理
        }
        return false; // 表示未处理
    }

    // 清除预约冷却时间
    clearBookingCooldown(userId, merchantId) {
        const cooldownKey = `${userId}_${merchantId}`;
        this.bookingCooldowns.delete(cooldownKey);
        console.log(`重新预约时已清除用户 ${userId} 对商家 ${merchantId} 的预约冷却时间`);
    }

    // 获取预约冷却时间
    getBookingCooldown(userId, merchantId) {
        const cooldownKey = `${userId}_${merchantId}`;
        return this.bookingCooldowns.get(cooldownKey) || 0;
    }
}

module.exports = AppointmentService; 
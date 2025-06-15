const TelegramBot = require('node-telegram-bot-api');
const dbOperations = require('../models/dbOperations');

// 环境变量
const BOT_TOKEN = process.env.BOT_TOKEN;

// 初始化Telegram Bot
let bot;
try {
    bot = new TelegramBot(BOT_TOKEN, { polling: true });
    console.log('✅ Telegram Bot初始化成功');
} catch (error) {
    console.log('⚠️ Telegram Bot初始化失败，但应用将继续运行:', error.message);
    // 创建一个假的bot对象，避免后续代码报错
    bot = {
        on: () => {},
        sendMessage: () => Promise.reject(new Error('Bot未初始化')),
        sendPhoto: () => Promise.reject(new Error('Bot未初始化')),
        answerCallbackQuery: () => Promise.reject(new Error('Bot未初始化'))
    };
}

// 内存缓存
let merchants = [];
let buttons = [];
let messageTemplates = [];
let triggerWords = [];
let scheduledTasks = [];
let triggerCooldowns = new Map(); // 防刷屏机制
let bindCodes = []; // 绑定码缓存
let regions = []; // 地区缓存
let userBindStates = new Map(); // 用户绑定状态缓存
let bookingCooldowns = new Map(); // 预约防重复点击机制 - 格式: "userId_merchantId" -> timestamp

// 绑定流程状态机
const BindSteps = {
    NONE: 0,
    WELCOME: 1,
    INPUT_NAME: 2,
    SELECT_REGION: 3,
    INPUT_CONTACT: 4,
    COMPLETED: 5
};

// 加载缓存数据
function loadCacheData() {
    merchants = dbOperations.getAllMerchants();
    buttons = dbOperations.getButtons();
    messageTemplates = dbOperations.getMessageTemplates();
    triggerWords = dbOperations.getTriggerWords();
    scheduledTasks = dbOperations.getScheduledTasks();
    bindCodes = dbOperations.getAllBindCodes();
    regions = dbOperations.getAllRegions();
    console.log('✅ 缓存数据加载完成');
}

// 发送消息模板
async function sendMessageTemplate(chatId, template, replyToMessageId = null) {
    try {
        const options = {
            parse_mode: 'HTML'
        };

        if (replyToMessageId) {
            options.reply_to_message_id = replyToMessageId;
        }

        // 解析按钮配置
        if (template.buttons_config) {
            const buttonsConfig = JSON.parse(template.buttons_config);
            if (buttonsConfig && buttonsConfig.length > 0) {
                const keyboard = buttonsConfig.map(row => 
                    row.map(btn => ({
                        text: btn.text,
                        callback_data: btn.callback_data || `template_${template.id}_${btn.text}`
                    }))
                );
                options.reply_markup = { inline_keyboard: keyboard };
            }
        }

        // 发送消息
        if (template.image_url) {
            await bot.sendPhoto(chatId, template.image_url, {
                caption: template.content,
                ...options
            });
        } else {
            await bot.sendMessage(chatId, template.content, options);
        }

        return true;
    } catch (error) {
        console.error('发送消息模板失败:', error);
        return false;
    }
}

// 触发词检测
function checkTriggerWords(message, chatId) {
    const text = message.text?.toLowerCase() || '';
    const chatTriggers = triggerWords.filter(tw => tw.chat_id == chatId && tw.active);

    for (const trigger of chatTriggers) {
        let isMatch = false;
        
        if (trigger.match_type === 'exact') {
            isMatch = text === trigger.word.toLowerCase();
        } else if (trigger.match_type === 'contains') {
            isMatch = text.includes(trigger.word.toLowerCase());
        }

        if (isMatch) {
            // 检查防刷屏机制
            const cooldownKey = `${chatId}_${trigger.id}`;
            const lastTriggered = triggerCooldowns.get(cooldownKey) || 0;
            const now = Date.now();
            
            if (now - lastTriggered < 5 * 60 * 1000) { // 5分钟冷却
                continue;
            }

            triggerCooldowns.set(cooldownKey, now);
            
            // 异步处理触发
            setImmediate(async () => {
                try {
                    const template = messageTemplates.find(t => t.id === trigger.template_id);
                    if (template) {
                        await sendMessageTemplate(chatId, template, message.message_id);
                        dbOperations.incrementTriggerCount(trigger.id);
                        dbOperations.logInteraction(
                            message.from.id,
                            message.from.username,
                            message.from.first_name,
                            message.from.last_name,
                            null,
                            template.id,
                            'trigger',
                            chatId
                        );
                        console.log(`触发词 "${trigger.word}" 在群组 ${chatId} 被触发`);
                    }
                } catch (error) {
                    console.error('处理触发词失败:', error);
                }
            });

            break; // 只触发第一个匹配的触发词
        }
    }
}

// 绑定流程处理函数
function handleBindProcess(userId, chatId, text, username) {
    const userState = userBindStates.get(userId) || { step: BindSteps.NONE };
    
    switch (userState.step) {
        case BindSteps.INPUT_NAME:
            if (!text || text.startsWith('/')) {
                bot.sendMessage(chatId, '❌ 请输入有效的老师名称');
                return;
            }
            
            userState.teacherName = text.trim();
            userState.step = BindSteps.SELECT_REGION;
            userBindStates.set(userId, userState);
            
            // 显示地区选择按钮
            showRegionSelection(chatId, userId);
            break;
            
        case BindSteps.INPUT_CONTACT:
            if (!text || text.startsWith('/')) {
                bot.sendMessage(chatId, '❌ 请输入有效的联系方式');
                return;
            }
            
            userState.contact = text.trim();
            userState.step = BindSteps.COMPLETED;
            userBindStates.set(userId, userState);
            
            // 完成绑定
            completeBinding(userId, chatId, userState, username);
            break;
            
        default:
            // 不在绑定流程中，检查触发词
            if (chatId < 0) { // 群组消息
                checkTriggerWords({ text, from: { id: userId, username }, chat: { id: chatId } }, chatId);
            }
            break;
    }
}

// 显示地区选择
function showRegionSelection(chatId, userId) {
    const keyboard = [];
    const regionsPerRow = 2;
    
    for (let i = 0; i < regions.length; i += regionsPerRow) {
        const row = [];
        for (let j = i; j < Math.min(i + regionsPerRow, regions.length); j++) {
            row.push({
                text: regions[j].name,
                callback_data: `select_region_${regions[j].id}`
            });
        }
        keyboard.push(row);
    }
    
    // 添加上一步按钮
    keyboard.push([{ text: '⬅️ 上一步', callback_data: 'bind_prev_step' }]);
    
    const options = {
        reply_markup: {
            inline_keyboard: keyboard
        }
    };
    
    bot.sendMessage(chatId, '📍 请选择您所在的地区：', options);
}

// 完成绑定
function completeBinding(userId, chatId, userState, username) {
    try {
        // 创建商家记录
        const merchantId = dbOperations.createMerchant(
            userState.teacherName,
            userState.regionId,
            userState.contact,
            userState.bindCode,
            userId
        );
        
        // 标记绑定码为已使用
        dbOperations.useBindCode(userState.bindCode, userId);
        
        // 清除用户状态
        userBindStates.delete(userId);
        
        // 重新加载缓存
        loadCacheData();
        
        // 发送成功消息
        const region = regions.find(r => r.id === userState.regionId);
        const successMessage = `✅ 绑定成功！\n\n👨‍🏫 老师名称：${userState.teacherName}\n📍 所在地区：${region ? region.name : '未知'}\n📞 联系方式：${userState.contact}\n\n您现在可以接收用户咨询了！`;
        
        bot.sendMessage(chatId, successMessage);
        
    } catch (error) {
        console.error('完成绑定时出错:', error);
        bot.sendMessage(chatId, '❌ 绑定过程中出现错误，请重试');
        userBindStates.delete(userId);
    }
}

// 初始化Bot事件监听
function initBotHandlers() {
    // Bot消息处理
    bot.on('message', (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;
        const username = msg.from.username;

        // 处理 /start 命令
        if (text && text.startsWith('/start')) {
            console.log(`收到/start命令: ${text}`);
            
            // 检查是否是商家联系流程
            if (text.includes(' merchant_')) {
                const merchantId = text.split('merchant_')[1];
                console.log(`解析到商家ID: ${merchantId}`);
                
                const merchant = dbOperations.getMerchantById(merchantId);
                console.log(`查询到商家信息:`, merchant);
                
                if (merchant) {
                    // 发送商家信息（不包含联系方式）
                    const merchantInfo = `地区：#${merchant.region_name || 'xx'}              艺名：${merchant.teacher_name || '未填写'}\n` +
                                       `优点：${merchant.advantages || '未填写'}\n` +
                                       `缺点：${merchant.disadvantages || '未填写'}\n` +
                                       `价格：${merchant.price1 || '未填写'}p              ${merchant.price2 || '未填写'}pp\n\n` +
                                       `老师💃自填基本功：\n` +
                                       `💦洗:${merchant.skill_wash || '未填写'}\n` +
                                       `👄吹:${merchant.skill_blow || '未填写'}\n` +
                                       `❤️做:${merchant.skill_do || '未填写'}\n` +
                                       `🐍吻:${merchant.skill_kiss || '未填写'}`;
                    
                    const options = {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '出击！', callback_data: `attack_${merchantId}` }],
                                [{ text: '榜单', url: 'https://t.me/xiaoji233' }]
                            ]
                        }
                    };
                    
                    console.log(`发送商家信息给用户 ${userId}`);
                    bot.sendMessage(chatId, merchantInfo, options);
                    return;
                } else {
                    console.log(`未找到商家ID ${merchantId} 对应的商家信息`);
                }
            }
            
            console.log(`发送默认欢迎消息给用户 ${userId}`);
            bot.sendMessage(chatId, '🤖 欢迎使用营销机器人！\n\n如果您是商家，请使用 /bind <绑定码> 来绑定您的账户');
            return;
        }

        // 处理 /bind 命令
        if (text && text.startsWith('/bind ')) {
            const code = text.replace('/bind ', '').trim().toUpperCase();
            
            // 检查用户是否已绑定
            const existingMerchant = dbOperations.getMerchantByUserId(userId);
            if (existingMerchant) {
                bot.sendMessage(chatId, '❌ 您已经绑定过账户了！');
                return;
            }
            
            // 验证绑定码
            const bindCode = dbOperations.getBindCode(code);
            if (!bindCode) {
                bot.sendMessage(chatId, '❌ 绑定码无效或已被使用');
                return;
            }
            
            // 开始绑定流程
            const userState = {
                step: BindSteps.WELCOME,
                bindCode: code
            };
            userBindStates.set(userId, userState);
            
            // 显示欢迎信息和开始按钮
            const options = {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🚀 开始绑定', callback_data: 'start_bind' }
                    ]]
                }
            };
            
            bot.sendMessage(chatId, `🎉 绑定码验证成功！\n\n📋 绑定码：${code}\n📝 描述：${bindCode.description || '无'}\n\n点击下方按钮开始绑定流程：`, options);
            return;
        }

        // 处理 /help 命令
        if (text === '/help') {
            bot.sendMessage(chatId, '📖 使用说明：\n\n/start - 开始使用\n/bind <绑定码> - 商家绑定账户\n/help - 查看帮助');
            return;
        }

        // 处理绑定流程中的文字输入
        handleBindProcess(userId, chatId, text, username);
    });

    // 处理按钮点击
    bot.on('callback_query', (query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;
        const queryId = query.id;

        // 立即关闭查询
        bot.answerCallbackQuery(queryId);

        // 处理按钮点击
        if (data.startsWith('attack_')) {
            const merchantId = data.replace('attack_', '');
            
            // 发送认证提示信息
            const attackMessage = `✅本榜单老师均已通过视频认证，请小鸡们放心预约。
————————————————————————————
🔔提示：
1.定金大多数不会超过100哦～ 
2.如果老师以前不需要定金，突然需要定金了，请跟管理员核实。`;
            
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '预约p', callback_data: `book_p_${merchantId}` }],
                        [{ text: '预约pp', callback_data: `book_pp_${merchantId}` }],
                        [{ text: '其他时长', callback_data: `book_other_${merchantId}` }]
                    ]
                }
            };
            
            bot.sendMessage(chatId, attackMessage, options);
            return;
        }
        
        // 处理预约按钮点击
        if (data.startsWith('book_')) {
            const parts = data.split('_');
            const bookType = parts[1]; // p, pp, other
            const merchantId = parts[2];
            
            // 检查防重复点击机制（30分钟内同一用户对同一商家只能点击一次）
            const cooldownKey = `${userId}_${merchantId}`;
            const lastBookingTime = bookingCooldowns.get(cooldownKey) || 0;
            const now = Date.now();
            const cooldownPeriod = 30 * 60 * 1000; // 30分钟
            
            if (now - lastBookingTime < cooldownPeriod) {
                bot.answerCallbackQuery(queryId, {
                    text: `🐤鸡总，咱已经预约过了哦～\n请点击联系方式直接私聊老师。`,
                    show_alert: true
                });
                return;
            }
            
            const merchant = dbOperations.getMerchantById(merchantId);
            if (merchant) {
                // 记录本次点击时间
                bookingCooldowns.set(cooldownKey, now);
                
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
                    
                    bot.sendMessage(merchant.user_id, merchantNotification).catch(error => {
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
                
                bot.sendMessage(chatId, finalMessage, { parse_mode: 'Markdown' });
                
                // 延迟发送课程完成确认消息（跳过预约确认步骤）
                setTimeout(() => {
                    sendCourseCompletionCheck(userId, merchant.user_id, bookingSessionId, fullName, username, merchant.teacher_name);
                }, 2000);
                
                // 记录交互
                dbOperations.logInteraction(userId, query.from.username, query.from.first_name, query.from.last_name, null, null, `book_${bookType}`, chatId);
                console.log(`用户 ${userId} ${fullName} (${username}) 预约了商家 ${merchantId} (${bookType})`);
            }
            return;
        }

        // 处理绑定流程按钮
        if (data === 'start_bind') {
            const userState = userBindStates.get(userId);
            if (userState && userState.step === BindSteps.WELCOME) {
                userState.step = BindSteps.INPUT_NAME;
                userBindStates.set(userId, userState);
                
                const options = {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '⬅️ 上一步', callback_data: 'bind_prev_step' }
                        ]]
                    }
                };
                
                bot.sendMessage(chatId, '👨‍🏫 请输入您的老师名称：', options);
            }
            return;
        }
        
        if (data.startsWith('select_region_')) {
            const regionId = parseInt(data.replace('select_region_', ''));
            const userState = userBindStates.get(userId);
            
            if (userState && userState.step === BindSteps.SELECT_REGION) {
                userState.regionId = regionId;
                userState.step = BindSteps.INPUT_CONTACT;
                userBindStates.set(userId, userState);
                
                const region = regions.find(r => r.id === regionId);
                const options = {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '⬅️ 上一步', callback_data: 'bind_prev_step' }
                        ]]
                    }
                };
                
                bot.sendMessage(chatId, `✅ 已选择地区：${region ? region.name : '未知'}\n\n📞 请输入您的联系方式（如：@username 或 手机号）：`, options);
            }
            return;
        }
        
        if (data === 'bind_prev_step') {
            const userState = userBindStates.get(userId);
            if (!userState) return;
            
            switch (userState.step) {
                case BindSteps.INPUT_NAME:
                    // 回到欢迎页面
                    userState.step = BindSteps.WELCOME;
                    userBindStates.set(userId, userState);
                    
                    const options = {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🚀 开始绑定', callback_data: 'start_bind' }
                            ]]
                        }
                    };
                    
                    bot.sendMessage(chatId, `🎉 绑定码验证成功！\n\n📋 绑定码：${userState.bindCode}\n\n点击下方按钮开始绑定流程：`, options);
                    break;
                    
                case BindSteps.SELECT_REGION:
                    // 回到输入名称
                    userState.step = BindSteps.INPUT_NAME;
                    userState.teacherName = undefined;
                    userBindStates.set(userId, userState);
                    
                    const nameOptions = {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '⬅️ 上一步', callback_data: 'bind_prev_step' }
                            ]]
                        }
                    };
                    
                    bot.sendMessage(chatId, '👨‍🏫 请输入您的老师名称：', nameOptions);
                    break;
                    
                case BindSteps.INPUT_CONTACT:
                    // 回到地区选择
                    userState.step = BindSteps.SELECT_REGION;
                    userState.regionId = undefined;
                    userBindStates.set(userId, userState);
                    
                    showRegionSelection(chatId, userId);
                    break;
            }
            return;
        }

        // 处理原有按钮点击
        if (data.startsWith('contact_')) {
            const buttonId = data.replace('contact_', '');
            
            // 立即回应callback query
            bot.answerCallbackQuery(queryId, { text: '正在处理...' });
            
            setImmediate(() => {
                try {
                    dbOperations.incrementButtonClick(buttonId);
                    
                    const button = dbOperations.getButton(buttonId);
                    if (!button) {
                        bot.sendMessage(userId, '❌ 按钮信息不存在');
                        return;
                    }

                    const message = button.message || '您好！感谢您的咨询，我们会尽快回复您！';
                    bot.sendMessage(userId, `📞 ${message}`).catch(error => {
                        console.log(`无法发送消息给用户 ${userId}: ${error.message}`);
                    });
                    
                    dbOperations.logInteraction(userId, query.from.username, query.from.first_name, query.from.last_name, buttonId, null, 'click', chatId);
                    console.log(`用户 ${userId} 点击了按钮 ${buttonId}`);
                } catch (error) {
                    console.error('处理按钮点击错误:', error);
                }
            });
            return;
        } else if (data.startsWith('template_')) {
            // 处理模板按钮点击
            const parts = data.split('_');
            const templateId = parts[1];
            
            // 立即回应callback query
            bot.answerCallbackQuery(queryId, { text: '正在处理...' });
            
            setImmediate(() => {
                try {
                    const template = messageTemplates.find(t => t.id == templateId);
                    if (template) {
                        bot.sendMessage(userId, `📞 ${template.content}`).catch(error => {
                            console.log(`无法发送消息给用户 ${userId}: ${error.message}`);
                        });
                        
                        dbOperations.logInteraction(userId, query.from.username, query.from.first_name, query.from.last_name, null, templateId, 'template_click', chatId);
                        console.log(`用户 ${userId} 点击了模板按钮 ${templateId}`);
                    }
                } catch (error) {
                    console.error('处理模板按钮点击错误:', error);
                }
            });
            return;
        }
        
        // 预约确认流程已移除
        
        // 处理课程完成流程
        else if (data.startsWith('course_')) {
            handleCourseFlow(userId, data, query);
            return;
        }
        
        // 处理重新预约流程
        else if (data.startsWith('rebook_')) {
            handleRebookFlow(userId, data, query);
            return;
        }
        
        // 处理评价流程
        else if (data.startsWith('evaluate_') || data.startsWith('eval_') || data.startsWith('user_eval_') || data.startsWith('merchant_detail_eval_')) {
            console.log(`路由到评价流程处理: ${data}`);
            handleEvaluationFlow(userId, data, query);
            return;
        }
        
        // 如果没有匹配到任何处理逻辑，记录日志
        else {
            console.log(`未处理的callback data: ${data}`);
            bot.answerCallbackQuery(queryId, { text: '操作完成' });
        }
    });
}

// 发送预约确认消息
// 预约确认功能已移除，直接进入课程完成确认流程

// 发送课程完成确认消息
async function sendCourseCompletionCheck(userId, merchantId, bookingSessionId, userFullName, username, teacherName) {
    try {
        // 给用户发送
        const userMessage = `是否完成该老师（${teacherName}）的课程？`;
        const userKeyboard = {
            inline_keyboard: [[
                { text: '已完成', callback_data: `course_completed_${bookingSessionId}` },
                { text: '未完成', callback_data: `course_incomplete_${bookingSessionId}` }
            ]]
        };
        
        bot.sendMessage(userId, userMessage, { reply_markup: userKeyboard });
        
        // 给商家发送
        const merchantMessage = `是否完成该用户（${userFullName}）的课程？`;
        const merchantKeyboard = {
            inline_keyboard: [[
                { text: '已完成', callback_data: `course_completed_${bookingSessionId}` },
                { text: '未完成', callback_data: `course_incomplete_${bookingSessionId}` }
            ]]
        };
        
        bot.sendMessage(merchantId, merchantMessage, { reply_markup: merchantKeyboard });
        
    } catch (error) {
        console.error('发送课程完成确认消息失败:', error);
    }
}

// 处理课程完成流程
async function handleCourseFlow(userId, data, query) {
    try {
        if (data.startsWith('course_completed_')) {
            const bookingSessionId = data.replace('course_completed_', '');
            const bookingSession = dbOperations.getBookingSession(bookingSessionId);
            
            if (bookingSession) {
                // 判断是用户还是商家
                const isUser = userId === bookingSession.user_id;
                const isMerchant = userId === dbOperations.getMerchantById(bookingSession.merchant_id)?.user_id;
                
                if (isUser) {
                    // 用户确认课程完成
                    dbOperations.updateUserCourseStatus(bookingSessionId, 'completed');
                    bot.answerCallbackQuery(query.id, { text: '课程完成确认' });
                    bot.sendMessage(userId, '✅ 您已确认课程完成，即将进入评价环节');
                    
                    // 用户进入评价流程
                    setTimeout(() => {
                        startUserEvaluation(userId, bookingSessionId);
                    }, 1000);
                    
                } else if (isMerchant) {
                    // 商家确认课程完成
                    dbOperations.updateMerchantCourseStatus(bookingSessionId, 'completed');
                    bot.answerCallbackQuery(query.id, { text: '课程完成确认' });
                    bot.sendMessage(userId, '✅ 您已确认课程完成，即将进入评价环节');
                    
                    // 商家进入评价流程
                    setTimeout(() => {
                        startMerchantEvaluation(userId, bookingSessionId);
                    }, 1000);
                }
                
                console.log(`${isUser ? '用户' : '商家'} ${userId} 确认课程完成，预约会话 ${bookingSessionId}`);
                
            } else {
                bot.answerCallbackQuery(query.id, { text: '预约信息不存在' });
            }
            
        } else if (data.startsWith('course_incomplete_')) {
            const bookingSessionId = data.replace('course_incomplete_', '');
            const bookingSession = dbOperations.getBookingSession(bookingSessionId);
            
            if (bookingSession) {
                // 判断是用户还是商家
                const isUser = userId === bookingSession.user_id;
                const isMerchant = userId === dbOperations.getMerchantById(bookingSession.merchant_id)?.user_id;
                
                if (isUser) {
                    dbOperations.updateUserCourseStatus(bookingSessionId, 'incomplete');
                    bot.answerCallbackQuery(query.id, { text: '课程未完成' });
                    bot.sendMessage(userId, '课程未完成，是否重新预约？');
                    
                    // 发送重新预约选项给用户
                    sendRebookingQuestionToUser(userId, bookingSessionId);
                    
                } else if (isMerchant) {
                    dbOperations.updateMerchantCourseStatus(bookingSessionId, 'incomplete');
                    bot.answerCallbackQuery(query.id, { text: '课程未完成' });
                    bot.sendMessage(userId, '您已标记课程未完成');
                }
                
                console.log(`${isUser ? '用户' : '商家'} ${userId} 标记课程未完成，预约会话 ${bookingSessionId}`);
                
            } else {
                bot.answerCallbackQuery(query.id, { text: '预约信息不存在' });
            }
        }
    } catch (error) {
        console.error('处理课程完成流程失败:', error);
        bot.answerCallbackQuery(query.id, { text: '处理失败，请重试' });
    }
}

// 发送重新预约询问
async function sendRebookingQuestion(userId, merchantId, bookingSessionId) {
    try {
        const message = `是否重新预约？`;
        const keyboard = {
            inline_keyboard: [[
                { text: '是', callback_data: `rebook_yes_${bookingSessionId}` },
                { text: '否', callback_data: `rebook_no_${bookingSessionId}` }
            ]]
        };
        
        bot.sendMessage(userId, message, { reply_markup: keyboard });
        bot.sendMessage(merchantId, message, { reply_markup: keyboard });
        
    } catch (error) {
        console.error('发送重新预约询问失败:', error);
    }
}

// 只给用户发送重新预约询问
async function sendRebookingQuestionToUser(userId, bookingSessionId) {
    try {
        const message = `是否重新预约？`;
        const keyboard = {
            inline_keyboard: [[
                { text: '是', callback_data: `rebook_yes_${bookingSessionId}` },
                { text: '否', callback_data: `rebook_no_${bookingSessionId}` }
            ]]
        };
        
        bot.sendMessage(userId, message, { reply_markup: keyboard });
        
    } catch (error) {
        console.error('发送重新预约询问失败:', error);
    }
}

// 处理重新预约流程
async function handleRebookFlow(userId, data, query) {
    try {
        if (data.startsWith('rebook_no_')) {
            bot.answerCallbackQuery(query.id, { text: '已选择不重新预约' });
            bot.sendMessage(userId, '欢迎下次预约课程📅 🐤小鸡与你同在。');
            
            console.log(`用户 ${userId} 选择不重新预约`);
            
        } else if (data.startsWith('rebook_yes_')) {
            const bookingSessionId = data.replace('rebook_yes_', '');
            const bookingSession = dbOperations.getBookingSession(bookingSessionId);
            
            if (bookingSession) {
                bot.answerCallbackQuery(query.id, { text: '正在重新预约' });
                bot.sendMessage(userId, '正在为您重新安排预约...');
                
                const merchant = dbOperations.getMerchantById(bookingSession.merchant_id);
                if (!merchant) {
                    console.error(`找不到商家信息，merchant_id: ${bookingSession.merchant_id}`);
                    return;
                }
                
                const userFullName = `${query.from.first_name || ''} ${query.from.last_name || ''}`.trim() || '未设置名称';
                const username = query.from.username ? `@${query.from.username}` : '未设置用户名';
                
                console.log(`用户 ${userId} 选择重新预约，预约会话 ${bookingSessionId}`);
                
                // 重新发送预约通知
                const merchantNotification = `老师您好，
用户名称 ${userFullName}（${username}）即将与您进行联系。他想跟您预约其他时长课程
请及时关注私聊信息。
————————————————————————
🐤小鸡出征！请尽力服务好我们的勇士～
如遇任何问题，请群内联系小鸡管理员。`;
                
                bot.sendMessage(merchant.user_id, merchantNotification);
                
                // 重新发送课程完成确认
                setTimeout(() => {
                    sendCourseCompletionCheck(bookingSession.user_id, merchant.user_id, bookingSessionId, userFullName, username, merchant.teacher_name);
                }, 2000);
            } else {
                bot.answerCallbackQuery(query.id, { text: '预约信息不存在' });
            }
        }
    } catch (error) {
        console.error('处理重新预约流程失败:', error);
        bot.answerCallbackQuery(query.id, { text: '处理失败，请重试' });
    }
}

// 发送课程完成祝贺消息
// sendCourseCompletedMessage函数已移除，评价流程现在在各自确认课程完成后直接触发

// 处理评价流程
async function handleEvaluationFlow(userId, data, query) {
    try {
        if (data.startsWith('evaluate_user_')) {
            bot.answerCallbackQuery(query.id, { text: '开始评价勇士' });
            const bookingSessionId = data.replace('evaluate_user_', '');
            startMerchantEvaluation(userId, bookingSessionId);
            
        } else if (data.startsWith('evaluate_teacher_')) {
            bot.answerCallbackQuery(query.id, { text: '开始评价老师' });
            const bookingSessionId = data.replace('evaluate_teacher_', '');
            startUserEvaluation(userId, bookingSessionId);
            
        } else if (data.startsWith('eval_score_')) {
            // 处理商家评价勇士的总体评分
            bot.answerCallbackQuery(query.id);
            handleMerchantScoring(userId, data, query);
            
        } else if (data.startsWith('user_eval_')) {
            // 处理用户评价老师
            if (data.includes('_confirm_')) {
                bot.answerCallbackQuery(query.id, { text: '评价已确认' });
                handleUserEvaluationConfirm(userId, data, query);
            } else if (data.includes('_restart_')) {
                bot.answerCallbackQuery(query.id, { text: '重新开始评价' });
                handleUserEvaluationRestart(userId, data, query);
            } else if (data.includes('_back_')) {
                bot.answerCallbackQuery(query.id, { text: '返回上一步' });
                handleUserEvaluationBack(userId, data, query);
            } else {
                bot.answerCallbackQuery(query.id);
                handleUserScoring(userId, data, query);
            }
        } else if (data.startsWith('eval_confirm_') || data.startsWith('eval_modify_')) {
            // 处理商家评价确认
            bot.answerCallbackQuery(query.id);
            handleMerchantEvaluationConfirm(userId, data, query);
        } else if (data.startsWith('detailed_eval_')) {
            // 处理详细评价
            console.log(`处理详细评价回调: ${data}, 用户: ${userId}`);
            bot.answerCallbackQuery(query.id);
            handleDetailedEvaluation(userId, data, query);
            return;
        } else if (data.startsWith('broadcast_')) {
            // 处理播报选择
            bot.answerCallbackQuery(query.id);
            handleBroadcastChoice(userId, data, query);
        } else if (data.startsWith('detail_')) {
            // 处理详细评价评分
            if (data.includes('_confirm_') || data.includes('_restart_')) {
                bot.answerCallbackQuery(query.id);
                handleDetailedEvaluationConfirm(userId, data, query);
            } else {
                bot.answerCallbackQuery(query.id);
                handleDetailedEvaluationScoring(userId, data, query);
            }
        } else if (data.startsWith('merchant_detail_eval_')) {
            // 处理商家详细评价
            if (data.includes('_confirm_') || data.includes('_restart_')) {
                bot.answerCallbackQuery(query.id, { text: '详细评价已确认' });
                handleMerchantDetailEvaluationConfirm(userId, data, query);
            } else if (data.includes('_back_')) {
                bot.answerCallbackQuery(query.id, { text: '返回上一步' });
                handleMerchantDetailEvaluationBack(userId, data, query);
            } else {
                bot.answerCallbackQuery(query.id);
                handleMerchantDetailEvaluationScoring(userId, data, query);
            }
        } else {
            // 处理其他未匹配的评价相关回调
            console.log(`评价流程中未处理的callback data: ${data}`);
            bot.answerCallbackQuery(query.id, { text: '操作完成' });
        }
    } catch (error) {
        console.error('处理评价流程失败:', error);
        bot.answerCallbackQuery(query.id, { text: '处理失败，请重试' });
    }
}

// 开始商家评价勇士流程
async function startMerchantEvaluation(userId, bookingSessionId) {
    try {
        const bookingSession = dbOperations.getBookingSession(bookingSessionId);
        if (!bookingSession) return;
        
        // 创建评价记录
        const evaluationId = dbOperations.createEvaluation(bookingSessionId, 'merchant', userId, bookingSession.user_id);
        const sessionId = dbOperations.createEvaluationSession(userId, evaluationId);
        
        // 开始评价流程
        const message = `出击总体素质：`;
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '1', callback_data: `eval_score_1_${evaluationId}` },
                    { text: '2', callback_data: `eval_score_2_${evaluationId}` },
                    { text: '3', callback_data: `eval_score_3_${evaluationId}` },
                    { text: '4', callback_data: `eval_score_4_${evaluationId}` },
                    { text: '5', callback_data: `eval_score_5_${evaluationId}` }
                ],
                [
                    { text: '6', callback_data: `eval_score_6_${evaluationId}` },
                    { text: '7', callback_data: `eval_score_7_${evaluationId}` },
                    { text: '8', callback_data: `eval_score_8_${evaluationId}` },
                    { text: '9', callback_data: `eval_score_9_${evaluationId}` },
                    { text: '10', callback_data: `eval_score_10_${evaluationId}` }
                ]
            ]
        };
        
        bot.sendMessage(userId, message, { reply_markup: keyboard });
        
        // 更新评价会话状态
        dbOperations.updateEvaluationSession(sessionId, 'overall_score', {});
        
    } catch (error) {
        console.error('开始商家评价流程失败:', error);
    }
}

// 处理商家评分
async function handleMerchantScoring(userId, data, query) {
    try {
        const parts = data.split('_');
        const score = parseInt(parts[2]);
        const evaluationId = parts[3];
        
        // 发送确认消息
        const message = `是否确认提交该勇士素质为 ${score} 分？`;
        const keyboard = {
            inline_keyboard: [[
                { text: '确认✅', callback_data: `eval_confirm_${score}_${evaluationId}` },
                { text: '修改✍️', callback_data: `eval_modify_${evaluationId}` }
            ]]
        };
        
        bot.sendMessage(userId, message, { reply_markup: keyboard });
        
    } catch (error) {
        console.error('处理商家评分失败:', error);
    }
}

// 开始用户评价老师流程
async function startUserEvaluation(userId, bookingSessionId) {
    try {
        const bookingSession = dbOperations.getBookingSession(bookingSessionId);
        if (!bookingSession) return;
        
        // 创建评价记录
        const evaluationId = dbOperations.createEvaluation(bookingSessionId, 'user', userId, bookingSession.merchant_id);
        const sessionId = dbOperations.createEvaluationSession(userId, evaluationId);
        
        // 开始硬件评价 - 颜值
        const message = `硬件评价\n\n颜值：`;
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '0', callback_data: `user_eval_appearance_0_${evaluationId}` },
                    { text: '1', callback_data: `user_eval_appearance_1_${evaluationId}` },
                    { text: '2', callback_data: `user_eval_appearance_2_${evaluationId}` },
                    { text: '3', callback_data: `user_eval_appearance_3_${evaluationId}` },
                    { text: '4', callback_data: `user_eval_appearance_4_${evaluationId}` }
                ],
                [
                    { text: '5', callback_data: `user_eval_appearance_5_${evaluationId}` },
                    { text: '6', callback_data: `user_eval_appearance_6_${evaluationId}` },
                    { text: '7', callback_data: `user_eval_appearance_7_${evaluationId}` },
                    { text: '8', callback_data: `user_eval_appearance_8_${evaluationId}` },
                    { text: '9', callback_data: `user_eval_appearance_9_${evaluationId}` },
                    { text: '10', callback_data: `user_eval_appearance_10_${evaluationId}` }
                ]
            ]
        };
        
        bot.sendMessage(userId, message, { reply_markup: keyboard });
        
        // 更新评价会话状态
        dbOperations.updateEvaluationSession(sessionId, 'hardware_appearance', {});
        
    } catch (error) {
        console.error('开始用户评价流程失败:', error);
    }
}

// 处理用户评分
async function handleUserScoring(userId, data, query) {
    try {
        const parts = data.split('_');
        const evaluationType = parts[2]; // appearance, tightness, etc.
        const score = parseInt(parts[3]);
        const evaluationId = parts[4];
        
        // 获取评价会话
        const evalSession = dbOperations.getEvaluationSession(userId, evaluationId);
        if (!evalSession) return;
        
        let tempData = {};
        try {
            tempData = JSON.parse(evalSession.temp_data || '{}');
        } catch (e) {
            tempData = {};
        }
        
        // 保存当前评分
        tempData[evaluationType] = score;
        
        // 定义评价流程顺序
        const hardwareSteps = ['appearance', 'tightness', 'feet', 'legs', 'waist', 'breasts'];
        const softwareSteps = ['temperament', 'environment', 'sexiness', 'attitude', 'voice', 'initiative'];
        
        let nextStep = null;
        let nextMessage = '';
        let nextKeyboard = null;
        
        // 确定下一步
        if (hardwareSteps.includes(evaluationType)) {
            const currentIndex = hardwareSteps.indexOf(evaluationType);
            if (currentIndex < hardwareSteps.length - 1) {
                // 继续硬件评价
                nextStep = hardwareSteps[currentIndex + 1];
                nextMessage = getHardwareMessage(nextStep);
                nextKeyboard = getScoreKeyboard(nextStep, evaluationId);
            } else {
                // 硬件评价完成，开始软件评价
                nextStep = softwareSteps[0];
                nextMessage = getSoftwareMessage(nextStep);
                nextKeyboard = getScoreKeyboard(nextStep, evaluationId);
            }
        } else if (softwareSteps.includes(evaluationType)) {
            const currentIndex = softwareSteps.indexOf(evaluationType);
            if (currentIndex < softwareSteps.length - 1) {
                // 继续软件评价
                nextStep = softwareSteps[currentIndex + 1];
                nextMessage = getSoftwareMessage(nextStep);
                nextKeyboard = getScoreKeyboard(nextStep, evaluationId);
            } else {
                // 所有评价完成，显示确认页面
                showEvaluationSummary(userId, evaluationId, tempData);
                return;
            }
        }
        
        // 更新评价会话
        dbOperations.updateEvaluationSession(evalSession.id, nextStep, tempData);
        
        // 发送下一个评价项目
        if (nextMessage && nextKeyboard) {
            bot.sendMessage(userId, nextMessage, { reply_markup: nextKeyboard });
        }
        
    } catch (error) {
        console.error('处理用户评分失败:', error);
    }
}

// 获取硬件评价消息
function getHardwareMessage(step) {
    const messages = {
        'appearance': '硬件评价\n\n颜值：',
        'tightness': '松紧：',
        'feet': '脚型：',
        'legs': '腿型：',
        'waist': '腰腹：',
        'breasts': '咪咪：'
    };
    return messages[step] || '评价：';
}

// 获取软件评价消息
function getSoftwareMessage(step) {
    const messages = {
        'temperament': '软件评价\n\n气质：',
        'environment': '环境：',
        'sexiness': '骚气：',
        'attitude': '态度：',
        'voice': '叫声：',
        'initiative': '主动：'
    };
    return messages[step] || '评价：';
}

// 获取评分键盘
function getScoreKeyboard(step, evaluationId) {
    return {
        inline_keyboard: [
            [
                { text: '0', callback_data: `user_eval_${step}_0_${evaluationId}` },
                { text: '1', callback_data: `user_eval_${step}_1_${evaluationId}` },
                { text: '2', callback_data: `user_eval_${step}_2_${evaluationId}` },
                { text: '3', callback_data: `user_eval_${step}_3_${evaluationId}` },
                { text: '4', callback_data: `user_eval_${step}_4_${evaluationId}` }
            ],
            [
                { text: '5', callback_data: `user_eval_${step}_5_${evaluationId}` },
                { text: '6', callback_data: `user_eval_${step}_6_${evaluationId}` },
                { text: '7', callback_data: `user_eval_${step}_7_${evaluationId}` },
                { text: '8', callback_data: `user_eval_${step}_8_${evaluationId}` },
                { text: '9', callback_data: `user_eval_${step}_9_${evaluationId}` },
                { text: '10', callback_data: `user_eval_${step}_10_${evaluationId}` }
            ],
            [
                { text: '⬅️ 返回', callback_data: `user_eval_back_${evaluationId}` }
            ]
        ]
    };
}

// 显示评价总结
async function showEvaluationSummary(userId, evaluationId, scores) {
    try {
        const summary = `是否确认该老师参数

颜值：${scores.appearance || 0}
松紧：${scores.tightness || 0}
脚型：${scores.feet || 0}
腿型：${scores.legs || 0}
腰腹：${scores.waist || 0}
咪咪：${scores.breasts || 0}
——————
气质：${scores.temperament || 0}
环境：${scores.environment || 0}
骚气：${scores.sexiness || 0}
态度：${scores.attitude || 0}
叫声：${scores.voice || 0}
主动：${scores.initiative || 0}`;

        const keyboard = {
            inline_keyboard: [[
                { text: '确认✅', callback_data: `user_eval_confirm_${evaluationId}` },
                { text: '重评✍️', callback_data: `user_eval_restart_${evaluationId}` }
            ]]
        };
        
        bot.sendMessage(userId, summary, { reply_markup: keyboard });
        
    } catch (error) {
        console.error('显示评价总结失败:', error);
    }
}

// 处理用户评价确认
async function handleUserEvaluationConfirm(userId, data, query) {
    try {
        const evaluationId = data.replace('user_eval_confirm_', '');
        const evalSession = dbOperations.getEvaluationSession(userId, evaluationId);
        
        if (evalSession) {
            const scores = JSON.parse(evalSession.temp_data || '{}');
            
            // 保存评价到数据库
            dbOperations.updateEvaluation(evaluationId, null, scores, null, 'completed');
            
            // 发送完成消息
            const message = `🎉 恭喜您完成一次评价～ 
经管理员审核后为您添加积分，等级会自动更新！
————————————————
是否在大群播报本次出击记录？`;
            
            const keyboard = {
                inline_keyboard: [[
                    { text: '实名播报', callback_data: `broadcast_real_${evaluationId}` },
                    { text: '匿名播报', callback_data: `broadcast_anon_${evaluationId}` },
                    { text: '不播报', callback_data: `broadcast_no_${evaluationId}` }
                ]]
            };
            
            bot.sendMessage(userId, message, { reply_markup: keyboard });
        }
        
    } catch (error) {
        console.error('处理用户评价确认失败:', error);
    }
}

// 处理用户评价重新开始
async function handleUserEvaluationRestart(userId, data, query) {
    try {
        const evaluationId = data.replace('user_eval_restart_', '');
        const evaluation = dbOperations.getEvaluation(evaluationId);
        
        if (evaluation) {
            // 重新开始评价流程
            const sessionId = dbOperations.createEvaluationSession(userId, evaluationId);
            
            // 开始硬件评价 - 颜值
            const message = `硬件评价\n\n颜值：`;
            const keyboard = getScoreKeyboard('appearance', evaluationId);
            
            bot.sendMessage(userId, message, { reply_markup: keyboard });
            
            // 更新评价会话状态
            dbOperations.updateEvaluationSession(sessionId, 'hardware_appearance', {});
        }
        
    } catch (error) {
        console.error('处理用户评价重新开始失败:', error);
    }
}

// 处理用户评价返回
async function handleUserEvaluationBack(userId, data, query) {
    try {
        // 这里可以实现返回上一步的逻辑
        // 由于逻辑比较复杂，暂时提示用户
        bot.sendMessage(userId, '返回功能正在完善中，请继续当前评价或重新开始。');
        
    } catch (error) {
        console.error('处理用户评价返回失败:', error);
    }
}

// 处理商家评价确认
async function handleMerchantEvaluationConfirm(userId, data, query) {
    try {
        if (data.startsWith('eval_confirm_')) {
            const parts = data.split('_');
            const score = parseInt(parts[2]);
            const evaluationId = parts[3];
            
            // 保存评分
            dbOperations.updateEvaluation(evaluationId, score, null, null, 'overall_completed');
            
            // 询问是否进行详细评价
            const message = `是否进行详细评价？`;
            const keyboard = {
                inline_keyboard: [[
                    { text: '确认✅', callback_data: `merchant_detail_eval_start_${evaluationId}` },
                    { text: '不了👋', callback_data: `merchant_detail_eval_no_${evaluationId}` }
                ]]
            };
            
            bot.sendMessage(userId, message, { reply_markup: keyboard });
            
        } else if (data.startsWith('eval_modify_')) {
            const evaluationId = data.replace('eval_modify_', '');
            
            // 重新显示评分选项
            const message = `出击总体素质：`;
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '1', callback_data: `eval_score_1_${evaluationId}` },
                        { text: '2', callback_data: `eval_score_2_${evaluationId}` },
                        { text: '3', callback_data: `eval_score_3_${evaluationId}` },
                        { text: '4', callback_data: `eval_score_4_${evaluationId}` },
                        { text: '5', callback_data: `eval_score_5_${evaluationId}` }
                    ],
                    [
                        { text: '6', callback_data: `eval_score_6_${evaluationId}` },
                        { text: '7', callback_data: `eval_score_7_${evaluationId}` },
                        { text: '8', callback_data: `eval_score_8_${evaluationId}` },
                        { text: '9', callback_data: `eval_score_9_${evaluationId}` },
                        { text: '10', callback_data: `eval_score_10_${evaluationId}` }
                    ]
                ]
            };
            
            bot.sendMessage(userId, message, { reply_markup: keyboard });
        }
        
    } catch (error) {
        console.error('处理商家评价确认失败:', error);
    }
}

// 处理详细评价
async function handleDetailedEvaluation(userId, data, query) {
    try {
        if (data.startsWith('detailed_eval_no_')) {
            const evaluationId = data.replace('detailed_eval_no_', '');
            
            // 保存评价状态为完成
            dbOperations.updateEvaluation(evaluationId, null, null, null, 'completed');
            
            bot.sendMessage(userId, '感谢您的支持。欢迎下次使用。');
            
        } else if (data.startsWith('detailed_eval_yes_')) {
            const evaluationId = data.replace('detailed_eval_yes_', '');
            
            // 创建详细评价会话
            const sessionId = dbOperations.createEvaluationSession(userId, evaluationId);
            
            // 开始详细评价流程 - 第一项：鸡鸡长度
            const message = `详细评价\n\n鸡鸡长度：`;
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '1', callback_data: `detail_length_1_${evaluationId}` },
                        { text: '2', callback_data: `detail_length_2_${evaluationId}` },
                        { text: '3', callback_data: `detail_length_3_${evaluationId}` },
                        { text: '4', callback_data: `detail_length_4_${evaluationId}` },
                        { text: '5', callback_data: `detail_length_5_${evaluationId}` }
                    ],
                    [
                        { text: '6', callback_data: `detail_length_6_${evaluationId}` },
                        { text: '7', callback_data: `detail_length_7_${evaluationId}` },
                        { text: '8', callback_data: `detail_length_8_${evaluationId}` },
                        { text: '9', callback_data: `detail_length_9_${evaluationId}` },
                        { text: '10', callback_data: `detail_length_10_${evaluationId}` }
                    ]
                ]
            };
            
            bot.sendMessage(userId, message, { reply_markup: keyboard });
            
            // 更新评价会话状态
            dbOperations.updateEvaluationSession(sessionId, 'detail_length', {});
        }
        
    } catch (error) {
        console.error('处理详细评价失败:', error);
    }
}

// 处理详细评价评分
async function handleDetailedEvaluationScoring(userId, data, query) {
    try {
        const parts = data.split('_');
        const evaluationType = parts[1]; // length, thickness, durability, technique
        const score = parseInt(parts[2]);
        const evaluationId = parts[3];
        
        // 获取评价会话
        const evalSession = dbOperations.getEvaluationSession(userId, evaluationId);
        if (!evalSession) {
            bot.sendMessage(userId, '评价会话已失效，请重新开始评价。');
            return;
        }
        
        let tempData = {};
        try {
            tempData = JSON.parse(evalSession.temp_data || '{}');
        } catch (e) {
            tempData = {};
        }
        
        // 保存当前评分
        tempData[evaluationType] = score;
        
        // 定义详细评价流程顺序
        const detailSteps = ['length', 'thickness', 'durability', 'technique'];
        const currentIndex = detailSteps.indexOf(evaluationType);
        
        if (currentIndex < detailSteps.length - 1) {
            // 继续下一个详细评价项目
            const nextStep = detailSteps[currentIndex + 1];
            const nextMessage = getDetailedEvaluationMessage(nextStep);
            const nextKeyboard = getDetailedEvaluationKeyboard(nextStep, evaluationId);
            
            // 更新评价会话
            dbOperations.updateEvaluationSession(evalSession.id, `detail_${nextStep}`, tempData);
            
            // 发送下一个评价项目
            bot.sendMessage(userId, nextMessage, { reply_markup: nextKeyboard });
            
        } else {
            // 所有详细评价完成，显示确认页面
            showDetailedEvaluationSummary(userId, evaluationId, tempData);
        }
        
    } catch (error) {
        console.error('处理详细评价评分失败:', error);
    }
}

// 获取详细评价消息
function getDetailedEvaluationMessage(step) {
    const messages = {
        'length': '详细评价\n\n鸡鸡长度：',
        'thickness': '鸡鸡粗度：',
        'durability': '持久度：',
        'technique': '技巧：'
    };
    return messages[step] || '评价：';
}

// 获取详细评价键盘
function getDetailedEvaluationKeyboard(step, evaluationId) {
    return {
        inline_keyboard: [
            [
                { text: '1', callback_data: `detail_${step}_1_${evaluationId}` },
                { text: '2', callback_data: `detail_${step}_2_${evaluationId}` },
                { text: '3', callback_data: `detail_${step}_3_${evaluationId}` },
                { text: '4', callback_data: `detail_${step}_4_${evaluationId}` },
                { text: '5', callback_data: `detail_${step}_5_${evaluationId}` }
            ],
            [
                { text: '6', callback_data: `detail_${step}_6_${evaluationId}` },
                { text: '7', callback_data: `detail_${step}_7_${evaluationId}` },
                { text: '8', callback_data: `detail_${step}_8_${evaluationId}` },
                { text: '9', callback_data: `detail_${step}_9_${evaluationId}` },
                { text: '10', callback_data: `detail_${step}_10_${evaluationId}` }
            ]
        ]
    };
}

// 显示详细评价总结
async function showDetailedEvaluationSummary(userId, evaluationId, scores) {
    try {
        const summary = `详细评价确认

鸡鸡长度：${scores.length || 0}分
鸡鸡粗度：${scores.thickness || 0}分
持久度：${scores.durability || 0}分
技巧：${scores.technique || 0}分

是否确认提交详细评价？`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '确认提交✅', callback_data: `detail_confirm_${evaluationId}` },
                    { text: '重新评价✍️', callback_data: `detail_restart_${evaluationId}` }
                ]
            ]
        };
        
        bot.sendMessage(userId, summary, { reply_markup: keyboard });
        
    } catch (error) {
        console.error('显示详细评价总结失败:', error);
    }
}

// 处理详细评价确认
async function handleDetailedEvaluationConfirm(userId, data, query) {
    try {
        if (data.startsWith('detail_confirm_')) {
            const evaluationId = data.replace('detail_confirm_', '');
            const evalSession = dbOperations.getEvaluationSession(userId, evaluationId);
            
            if (evalSession) {
                const detailScores = JSON.parse(evalSession.temp_data || '{}');
                
                // 保存详细评价到数据库
                dbOperations.updateEvaluation(evaluationId, null, detailScores, '详细评价已完成', 'completed');
                
                // 发送完成消息
                bot.sendMessage(userId, '🎉 详细评价提交成功！\n\n感谢您的耐心评价，这将帮助我们提供更好的服务。');
            }
            
        } else if (data.startsWith('detail_restart_')) {
            const evaluationId = data.replace('detail_restart_', '');
            
            // 重新开始详细评价流程
            const sessionId = dbOperations.createEvaluationSession(userId, evaluationId);
            
            // 开始详细评价流程 - 第一项：鸡鸡长度
            const message = `详细评价\n\n鸡鸡长度：`;
            const keyboard = getDetailedEvaluationKeyboard('length', evaluationId);
            
            bot.sendMessage(userId, message, { reply_markup: keyboard });
            
            // 更新评价会话状态
            dbOperations.updateEvaluationSession(sessionId, 'detail_length', {});
        }
        
    } catch (error) {
        console.error('处理详细评价确认失败:', error);
    }
}

// 处理播报选择
async function handleBroadcastChoice(userId, data, query) {
    try {
        if (data.startsWith('broadcast_no_')) {
            bot.sendMessage(userId, '感谢您的评价！记录已保存。');
            
        } else if (data.startsWith('broadcast_real_')) {
            const evaluationId = data.replace('broadcast_real_', '');
            // 这里可以实现实名播报逻辑
            bot.sendMessage(userId, '实名播报功能正在开发中，感谢您的评价！');
            
        } else if (data.startsWith('broadcast_anon_')) {
            const evaluationId = data.replace('broadcast_anon_', '');
            // 这里可以实现匿名播报逻辑
            bot.sendMessage(userId, '匿名播报功能正在开发中，感谢您的评价！');
        }
        
    } catch (error) {
        console.error('处理播报选择失败:', error);
    }
}

// 处理商家详细评价评分
async function handleMerchantDetailEvaluationScoring(userId, data, query) {
    try {
        const parts = data.split('_');
        let evaluationType, score, evaluationId;
        
        if (data.startsWith('merchant_detail_eval_start_')) {
            // 开始详细评价流程
            evaluationId = data.replace('merchant_detail_eval_start_', '');
            startMerchantDetailEvaluation(userId, evaluationId);
            return;
            
        } else if (data.startsWith('merchant_detail_eval_no_')) {
            // 不进行详细评价
            evaluationId = data.replace('merchant_detail_eval_no_', '');
            dbOperations.updateEvaluation(evaluationId, null, null, null, 'completed');
            bot.sendMessage(userId, '感谢您的支持。欢迎下次使用。');
            return;
            
        } else if (data.includes('_duration_')) {
            // 处理单次做爱时间选择
            evaluationType = 'duration';
            const durationParts = data.split('_duration_');
            score = durationParts[1].split('_')[0];
            evaluationId = durationParts[1].split('_')[1];
            
        } else {
            // 处理数字评分 (鸡鸡长度、硬度)
            evaluationType = parts[3]; // length, hardness
            score = parseInt(parts[4]);
            evaluationId = parts[5];
        }
        
        // 获取评价会话
        const evalSession = dbOperations.getEvaluationSession(userId, evaluationId);
        if (!evalSession) {
            bot.sendMessage(userId, '评价会话已失效，请重新开始评价。');
            return;
        }
        
        let tempData = {};
        try {
            tempData = JSON.parse(evalSession.temp_data || '{}');
        } catch (e) {
            tempData = {};
        }
        
        // 保存当前评分
        tempData[evaluationType] = score;
        
        // 定义详细评价流程顺序
        const detailSteps = ['length', 'hardness', 'duration'];
        const currentIndex = detailSteps.indexOf(evaluationType);
        
        if (currentIndex < detailSteps.length - 1) {
            // 继续下一个详细评价项目
            const nextStep = detailSteps[currentIndex + 1];
            const nextMessage = getMerchantDetailEvaluationMessage(nextStep);
            const nextKeyboard = getMerchantDetailEvaluationKeyboard(nextStep, evaluationId);
            
            // 更新评价会话
            dbOperations.updateEvaluationSession(evalSession.id, `merchant_detail_${nextStep}`, tempData);
            
            // 发送下一个评价项目
            bot.sendMessage(userId, nextMessage, { reply_markup: nextKeyboard });
            
        } else {
            // 进入额外点评环节
            dbOperations.updateEvaluationSession(evalSession.id, 'merchant_detail_comment', tempData);
            
            const message = `额外点评（额外输入文字点评，任何都行）：

请输入您的额外点评，或直接点击提交按钮完成评价。`;
            
            const keyboard = {
                inline_keyboard: [[
                    { text: '确认提交报告🎫', callback_data: `merchant_detail_eval_confirm_${evaluationId}` }
                ]]
            };
            
            bot.sendMessage(userId, message, { reply_markup: keyboard });
        }
        
    } catch (error) {
        console.error('处理商家详细评价评分失败:', error);
    }
}

// 开始商家详细评价流程
async function startMerchantDetailEvaluation(userId, evaluationId) {
    try {
        // 创建详细评价会话
        const sessionId = dbOperations.createEvaluationSession(userId, evaluationId);
        
        // 开始详细评价流程 - 第一项：鸡鸡长度
        const message = `鸡鸡长度（输入数字1-10评分）：`;
        const keyboard = getMerchantDetailEvaluationKeyboard('length', evaluationId);
        
        bot.sendMessage(userId, message, { reply_markup: keyboard });
        
        // 更新评价会话状态
        dbOperations.updateEvaluationSession(sessionId, 'merchant_detail_length', {});
        
    } catch (error) {
        console.error('开始商家详细评价流程失败:', error);
    }
}

// 获取商家详细评价消息
function getMerchantDetailEvaluationMessage(step) {
    const messages = {
        'length': '鸡鸡长度（输入数字1-10评分）：',
        'hardness': '鸡鸡硬度（输入数字1-10评分）：',
        'duration': '单次做爱时间：'
    };
    return messages[step] || '评价：';
}

// 获取商家详细评价键盘
function getMerchantDetailEvaluationKeyboard(step, evaluationId) {
    if (step === 'length' || step === 'hardness') {
        return {
            inline_keyboard: [
                [
                    { text: '1', callback_data: `merchant_detail_eval_${step}_1_${evaluationId}` },
                    { text: '2', callback_data: `merchant_detail_eval_${step}_2_${evaluationId}` },
                    { text: '3', callback_data: `merchant_detail_eval_${step}_3_${evaluationId}` },
                    { text: '4', callback_data: `merchant_detail_eval_${step}_4_${evaluationId}` },
                    { text: '5', callback_data: `merchant_detail_eval_${step}_5_${evaluationId}` }
                ],
                [
                    { text: '6', callback_data: `merchant_detail_eval_${step}_6_${evaluationId}` },
                    { text: '7', callback_data: `merchant_detail_eval_${step}_7_${evaluationId}` },
                    { text: '8', callback_data: `merchant_detail_eval_${step}_8_${evaluationId}` },
                    { text: '9', callback_data: `merchant_detail_eval_${step}_9_${evaluationId}` },
                    { text: '10', callback_data: `merchant_detail_eval_${step}_10_${evaluationId}` }
                ],
                [
                    { text: '⬅️ 返回', callback_data: `merchant_detail_eval_back_${evaluationId}` }
                ]
            ]
        };
    } else if (step === 'duration') {
        return {
            inline_keyboard: [
                [
                    { text: '1分钟内', callback_data: `merchant_detail_eval_duration_1min_${evaluationId}` },
                    { text: '3分钟', callback_data: `merchant_detail_eval_duration_3min_${evaluationId}` },
                    { text: '5分钟', callback_data: `merchant_detail_eval_duration_5min_${evaluationId}` }
                ],
                [
                    { text: '10分钟', callback_data: `merchant_detail_eval_duration_10min_${evaluationId}` },
                    { text: '15分钟', callback_data: `merchant_detail_eval_duration_15min_${evaluationId}` },
                    { text: '30分钟', callback_data: `merchant_detail_eval_duration_30min_${evaluationId}` }
                ],
                [
                    { text: '1小时以上', callback_data: `merchant_detail_eval_duration_1hour_${evaluationId}` },
                    { text: '未出水💦', callback_data: `merchant_detail_eval_duration_no_${evaluationId}` }
                ],
                [
                    { text: '⬅️ 返回', callback_data: `merchant_detail_eval_back_${evaluationId}` }
                ]
            ]
        };
    }
}

// 处理商家详细评价确认
async function handleMerchantDetailEvaluationConfirm(userId, data, query) {
    try {
        const evaluationId = data.replace('merchant_detail_eval_confirm_', '');
        const evalSession = dbOperations.getEvaluationSession(userId, evaluationId);
        
        if (evalSession) {
            const detailScores = JSON.parse(evalSession.temp_data || '{}');
            
            // 保存详细评价到数据库
            dbOperations.updateEvaluation(evaluationId, null, detailScores, '详细评价已完成', 'completed');
            
            // 发送完成消息
            bot.sendMessage(userId, '🎉 详细评价提交成功！\n\n感谢您的耐心评价，这将帮助我们提供更好的服务。');
        }
        
    } catch (error) {
        console.error('处理商家详细评价确认失败:', error);
    }
}

// 处理商家详细评价返回
async function handleMerchantDetailEvaluationBack(userId, data, query) {
    try {
        // 这里可以实现返回上一步的逻辑
        // 由于逻辑比较复杂，暂时提示用户
        bot.sendMessage(userId, '返回功能正在完善中，请继续当前评价或重新开始。');
        
    } catch (error) {
        console.error('处理商家详细评价返回失败:', error);
    }
}

module.exports = {
    bot,
    loadCacheData,
    sendMessageTemplate,
    checkTriggerWords,
    initBotHandlers,
    sendCourseCompletionCheck,
    sendRebookingQuestion,
    sendRebookingQuestionToUser,
    startMerchantEvaluation,
    startUserEvaluation,
    // 导出缓存数据的getter
    getCacheData: () => ({
        merchants,
        buttons,
        messageTemplates,
        triggerWords,
        scheduledTasks,
        bindCodes,
        regions
    })
}; 
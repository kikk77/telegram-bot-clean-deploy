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
                const fullName = `${userName} ${userLastName}`.trim();
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
                
                // 发送通知给商家
                if (merchant.user_id) {
                    const merchantNotification = `老师您好，
用户名称（${username}）即将与您进行联系。他想跟您预约${bookTypeText}课程
请及时关注私聊信息。
————————————————————————
🐤小鸡出征！请尽力服务好我们的勇士～
如遇任何问题，请群内联系小鸡管理员。`;
                    
                    bot.sendMessage(merchant.user_id, merchantNotification).catch(error => {
                        console.log(`无法发送通知给商家 ${merchant.user_id}: ${error.message}`);
                    });
                    
                    console.log(`已通知商家 ${merchant.user_id}，用户 ${username} 预约了 ${bookTypeText}`);
                }
                
                // 生成联系方式链接
                let contactLink = merchant.contact;
                if (contactLink && contactLink.startsWith('@')) {
                    contactLink = `[${contactLink}](https://t.me/${contactLink.substring(1)})`;
                }
                
                const finalMessage = `🐤小鸡出征！
         已将出击信息发送给${contactLink}老师。请点击联系方式开始私聊老师进行预约。`;
                
                bot.sendMessage(chatId, finalMessage, { parse_mode: 'Markdown' });
                
                // 记录交互
                dbOperations.logInteraction(userId, query.from.username, null, null, `book_${bookType}`, chatId);
                console.log(`用户 ${userId} (${username}) 预约了商家 ${merchantId} (${bookType})`);
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
                        bot.answerCallbackQuery(queryId, {
                            text: '请先私聊机器人发送 /start 开启对话！',
                            show_alert: true
                        });
                    });
                    
                    dbOperations.logInteraction(userId, query.from.username, buttonId, null, 'click', chatId);
                    console.log(`用户 ${userId} 点击了按钮 ${buttonId}`);
                } catch (error) {
                    console.error('处理按钮点击错误:', error);
                }
            });
        } else if (data.startsWith('template_')) {
            // 处理模板按钮点击
            const parts = data.split('_');
            const templateId = parts[1];
            
            setImmediate(() => {
                try {
                    const template = messageTemplates.find(t => t.id == templateId);
                    if (template) {
                        bot.sendMessage(userId, `📞 ${template.content}`).catch(error => {
                            console.log(`无法发送消息给用户 ${userId}: ${error.message}`);
                            bot.answerCallbackQuery(queryId, {
                                text: '请先私聊机器人发送 /start 开启对话！',
                                show_alert: true
                            });
                        });
                        
                        dbOperations.logInteraction(userId, query.from.username, null, templateId, 'template_click', chatId);
                        console.log(`用户 ${userId} 点击了模板按钮 ${templateId}`);
                    }
                } catch (error) {
                    console.error('处理模板按钮点击错误:', error);
                }
            });
        }
    });
}

module.exports = {
    bot,
    loadCacheData,
    sendMessageTemplate,
    checkTriggerWords,
    initBotHandlers,
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
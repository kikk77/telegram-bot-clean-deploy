const http = require('http');
const fs = require('fs');
const url = require('url');
const dbOperations = require('../models/dbOperations');
const { bot, loadCacheData, getCacheData } = require('./botService');

const PORT = process.env.PORT || 3000;

// HTTP服务器和管理后台API
function createHttpServer() {
    const server = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        const method = req.method;

        // 设置CORS头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // 静态文件服务
        if (pathname === '/' || pathname === '/admin') {
            const path = require('path');
            const adminPath = path.join(__dirname, '..', 'admin', 'admin-legacy.html');
            fs.readFile(adminPath, 'utf8', (err, data) => {
                if (err) {
                    console.error('读取管理后台文件失败:', err);
                    res.writeHead(404);
                    res.end('Admin file not found');
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(data);
            });
            return;
        }

        // 静态资源服务（CSS, JS文件）
        if (pathname.startsWith('/admin/')) {
            const path = require('path');
            const filePath = path.join(__dirname, '..', pathname);
            const ext = path.extname(filePath);
            
            let contentType = 'text/plain';
            if (ext === '.css') contentType = 'text/css';
            else if (ext === '.js') contentType = 'application/javascript';
            else if (ext === '.html') contentType = 'text/html';
            
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    res.writeHead(404);
                    res.end('File not found');
                    return;
                }
                res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
                res.end(data);
            });
            return;
        }

        // Webhook路由 - Telegram Bot更新
        if (pathname === '/webhook' && method === 'POST') {
            handleWebhookRequest(req, res);
            return;
        }

        // 健康检查端点
        if (pathname === '/health' && method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ 
                success: true, 
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            }));
            return;
        }

        // API路由
        if (pathname.startsWith('/api/')) {
            handleApiRequest(req, res, pathname, method);
            return;
        }

        // 404
        res.writeHead(404);
        res.end('Not Found');
    });

    server.listen(PORT, () => {
        console.log(`🚀 HTTP服务器启动在端口 ${PORT}`);
        console.log(`📱 管理后台: http://localhost:${PORT}/admin`);
    });
}

// Webhook请求处理 - 处理Telegram更新
function handleWebhookRequest(req, res) {
    let body = '';
    
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        try {
            const update = JSON.parse(body);
            
            // 立即响应Telegram服务器
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('OK');
            
            // 处理更新（事件驱动，不阻塞响应）
            processWebhookUpdate(update);
            
        } catch (error) {
            console.error('Webhook处理错误:', error);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('OK'); // 总是返回200给Telegram
        }
    });
}

// API请求处理
function handleApiRequest(req, res, pathname, method) {
    let body = '';
    
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', async () => {
        try {
            const data = body ? JSON.parse(body) : {};
            const response = await processApiRequest(pathname, method, data);
            
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(response));
        } catch (error) {
            console.error('API请求处理错误:', error);
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: error.message }));
        }
    });
}

// API请求路由处理
async function processApiRequest(pathname, method, data) {
    // 绑定码管理API
    if (pathname === '/api/bind-codes') {
        if (method === 'GET') {
            return { success: true, data: dbOperations.getAllBindCodes() };
        } else if (method === 'POST') {
            const result = dbOperations.createBindCode(data.description);
            await loadCacheData();
            return { success: true, data: result };
        } else if (method === 'DELETE') {
            dbOperations.deleteBindCode(data.id);
            await loadCacheData();
            return { success: true };
        }
    }

    // 强制删除绑定码API
    if (pathname === '/api/bind-codes/force-delete' && method === 'DELETE') {
        try {
            // 直接操作数据库，然后重新加载缓存
            dbOperations.deleteBindCode(data.id);
            await loadCacheData();
            return { success: true, message: '绑定码已强制删除' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }



    // 地区管理API
    if (pathname === '/api/regions') {
        if (method === 'GET') {
            return { success: true, data: dbOperations.getAllRegions() };
        } else if (method === 'POST') {
            const result = dbOperations.createRegion(data.name, data.sortOrder);
            await loadCacheData();
            return { success: true, data: { id: result } };
        } else if (method === 'PUT') {
            dbOperations.updateRegion(data.id, data.name, data.sortOrder);
            await loadCacheData();
            return { success: true };
        } else if (method === 'DELETE') {
            try {
            dbOperations.deleteRegion(data.id);
            await loadCacheData();
                return { success: true, message: '地区删除成功' };
            } catch (error) {
                console.error('删除地区失败:', error);
                return { success: false, error: error.message };
        }
        }
    }

    // 检查地区依赖关系API
    if (pathname.match(/^\/api\/regions\/\d+\/dependencies$/) && method === 'GET') {
        const regionId = pathname.split('/')[3];
        const dependencies = dbOperations.checkRegionDependencies(regionId);
        return { success: true, data: dependencies };
    }

    // 商家管理API
    if (pathname === '/api/merchants') {
        if (method === 'GET') {
            return { success: true, data: dbOperations.getAllMerchants() };
        }
    }

    // 检查商家依赖关系API
    if (pathname.match(/^\/api\/merchants\/\d+\/dependencies$/) && method === 'GET') {
        const merchantId = pathname.split('/')[3];
        const dependencies = dbOperations.checkMerchantDependencies(merchantId);
        return { success: true, data: dependencies };
    }

    // 删除商家API
    if (pathname.match(/^\/api\/merchants\/\d+$/) && method === 'DELETE') {
        const merchantId = pathname.split('/')[3];
        try {
            console.log(`🗑️ 开始删除商家 ID: ${merchantId}`);
            const result = dbOperations.deleteMerchant(merchantId);
            console.log(`✅ 商家删除成功，影响行数: ${result.changes}`);
            
            // 重新加载缓存数据
            await loadCacheData();
            console.log(`🔄 缓存数据已重新加载`);
            
            return { success: true, message: '商家删除成功', deletedId: merchantId };
        } catch (error) {
            console.error('❌ 删除商家失败:', error);
            throw new Error('删除商家失败: ' + error.message);
        }
    }

    // 商家绑定状态重置API
    if (pathname.match(/^\/api\/merchants\/\d+\/reset$/) && method === 'POST') {
        const merchantId = pathname.split('/')[3];
        dbOperations.resetMerchantBind(merchantId);
        await loadCacheData();
        return { success: true };
    }

    // 更新商家信息API
    if (pathname.match(/^\/api\/merchants\/\d+$/) && method === 'PUT') {
        const merchantId = pathname.split('/')[3];
        
        // 检查是否是模板更新（包含更多字段）
        if (data.advantages !== undefined || data.disadvantages !== undefined || 
            data.price1 !== undefined || data.price2 !== undefined ||
            data.skillWash !== undefined || data.skillBlow !== undefined ||
            data.skillDo !== undefined || data.skillKiss !== undefined) {
            // 使用新的模板更新方法
            dbOperations.updateMerchantTemplate(merchantId, data);
        } else {
            // 使用原有的基本信息更新方法
            dbOperations.updateMerchant(merchantId, data.teacherName, data.regionId, data.contact);
        }
        
        await loadCacheData();
        return { success: true };
    }

    // 暂停/恢复商家API
    if (pathname.match(/^\/api\/merchants\/\d+\/toggle-status$/) && method === 'POST') {
        const merchantId = pathname.split('/')[3];
        dbOperations.toggleMerchantStatus(merchantId);
        await loadCacheData();
        return { success: true };
    }

    // 按钮管理API
    if (pathname === '/api/buttons') {
        if (method === 'GET') {
            return { success: true, data: dbOperations.getButtons() };
        } else if (method === 'POST') {
            const result = dbOperations.createButton(data.title, data.message, data.merchantId);
            await loadCacheData();
            return { success: true, data: { id: result } };
        } else if (method === 'DELETE') {
            dbOperations.deleteButton(data.id);
            await loadCacheData();
            return { success: true };
        }
    }

    // 消息模板管理API
    if (pathname === '/api/templates') {
        if (method === 'GET') {
            return { success: true, data: dbOperations.getMessageTemplates() };
        } else if (method === 'POST') {
            const result = dbOperations.createMessageTemplate(
                data.name, data.content, data.imageUrl, data.buttonsConfig
            );
            await loadCacheData();
            return { success: true, data: { id: result } };
        } else if (method === 'PUT') {
            dbOperations.updateMessageTemplate(
                data.id, data.name, data.content, data.imageUrl, data.buttonsConfig
            );
            await loadCacheData();
            return { success: true };
        } else if (method === 'DELETE') {
            dbOperations.deleteMessageTemplate(data.id);
            await loadCacheData();
            return { success: true };
        }
    }

    // 触发词管理API
    if (pathname === '/api/triggers') {
        if (method === 'GET') {
            return { success: true, data: dbOperations.getTriggerWords() };
        } else if (method === 'POST') {
            const result = dbOperations.createTriggerWord(
                data.word, data.templateId, data.matchType, data.chatId
            );
            await loadCacheData();
            return { success: true, data: { id: result } };
        } else if (method === 'DELETE') {
            dbOperations.deleteTriggerWord(data.id);
            await loadCacheData();
            return { success: true };
        }
    }

    // 定时任务管理API
    if (pathname === '/api/tasks') {
        if (method === 'GET') {
            return { success: true, data: dbOperations.getScheduledTasks() };
        } else if (method === 'POST') {
            const result = dbOperations.createScheduledTask(
                data.name, data.templateId, data.chatId, data.scheduleType,
                data.scheduleTime, data.sequenceOrder, data.sequenceDelay
            );
            await loadCacheData();
            return { success: true, data: { id: result } };
        } else if (method === 'DELETE') {
            dbOperations.deleteScheduledTask(data.id);
            await loadCacheData();
            return { success: true };
        }
    }



    // 统计数据API
    if (pathname === '/api/stats' && method === 'GET') {
        const stats = dbOperations.getInteractionStats();
        const cacheData = getCacheData();
        const buttonStats = dbOperations.getButtons();
        const totalClicks = buttonStats.reduce((sum, btn) => sum + btn.click_count, 0);
        
        // 获取实际数据库计数
        const bindCodes = dbOperations.getAllBindCodes();
        const regions = dbOperations.getAllRegions();
        
        return {
            success: true,
            data: {
                totalMerchants: cacheData.merchants.length,
                totalButtons: cacheData.buttons.length,
                totalTemplates: cacheData.messageTemplates.length,
                totalTriggers: cacheData.triggerWords.length,
                totalTasks: cacheData.scheduledTasks.length,
                totalBindCodes: bindCodes.length,
                totalRegions: regions.length,
                totalClicks: totalClicks,
                ...stats
            }
        };
    }

    // 商家预约统计API
    if (pathname === '/api/merchant-bookings' && method === 'GET') {
        const bookingStats = dbOperations.getMerchantBookingStats();
        return {
            success: true,
            data: bookingStats
        };
    }

    // 消息统计API
    if (pathname === '/api/message-stats' && method === 'GET') {
        const messageStats = dbOperations.getMessageStats();
        return {
            success: true,
            data: messageStats
        };
    }

    // 最近预约记录API
    if (pathname === '/api/recent-bookings' && method === 'GET') {
        const recentBookings = dbOperations.getRecentBookings(20);
        return {
            success: true,
            data: recentBookings
        };
    }

    // 按钮点击统计API
    if (pathname === '/api/button-stats' && method === 'GET') {
        const buttonStats = dbOperations.getButtonClickStats();
        return {
            success: true,
            data: buttonStats
        };
    }

    // 评价管理API
    if (pathname === '/api/evaluations' && method === 'GET') {
        const evaluations = dbOperations.getAllEvaluations();
        return {
            success: true,
            data: evaluations
        };
    }

    // 评价详情API
    if (pathname.match(/^\/api\/evaluations\/\d+$/) && method === 'GET') {
        const evaluationId = pathname.split('/')[3];
        const evaluation = dbOperations.getEvaluationDetails(evaluationId);
        if (!evaluation) {
            return {
                success: false,
                error: '订单不存在或无评价数据'
            };
        }
        return {
            success: true,
            data: evaluation
        };
    }

    // 评价统计API
    if (pathname === '/api/evaluation-stats' && method === 'GET') {
        const stats = dbOperations.getEvaluationStats();
        return {
            success: true,
            data: stats
        };
    }

    // 订单评价API
    if (pathname === '/api/order-evaluations' && method === 'GET') {
        const orderEvaluations = dbOperations.getOrderEvaluations();
        return {
            success: true,
            data: orderEvaluations
        };
    }

    // 订单管理API - 使用apiService提供正确的数据处理
    if (pathname === '/api/orders' && method === 'GET') {
        try {
            const apiService = require('./apiService');
            const result = await apiService.getOrders({ query: {} });
            return result;
        } catch (error) {
            console.error('获取订单列表失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 订单统计API
    if (pathname === '/api/stats/optimized' && method === 'GET') {
        try {
            const apiService = require('./apiService');
            const result = await apiService.getOptimizedStats({ query: {} });
            return result;
        } catch (error) {
            console.error('获取优化统计失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 简单计数API
    if (pathname.startsWith('/api/simple-count/') && method === 'GET') {
        try {
            const tableName = pathname.split('/')[3];
            const apiService = require('./apiService');
            const result = await apiService.getSimpleCount({ params: { table: tableName } });
            return result;
        } catch (error) {
            console.error('获取简单计数失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 图表API路由
    if (pathname === '/api/charts/orders-trend' && method === 'GET') {
        try {
            const apiService = require('./apiService');
            const result = await apiService.getOrdersTrendChart({ query: {} });
            return result;
        } catch (error) {
            console.error('获取订单趋势图表失败:', error);
            return { success: false, error: error.message };
        }
    }

    if (pathname === '/api/charts/region-distribution' && method === 'GET') {
        try {
            const apiService = require('./apiService');
            const result = await apiService.getRegionDistributionChart({ query: {} });
            return result;
        } catch (error) {
            console.error('获取地区分布图表失败:', error);
            return { success: false, error: error.message };
        }
    }

    if (pathname === '/api/charts/price-distribution' && method === 'GET') {
        try {
            const apiService = require('./apiService');
            const result = await apiService.getPriceDistributionChart({ query: {} });
            return result;
        } catch (error) {
            console.error('获取价格分布图表失败:', error);
            return { success: false, error: error.message };
        }
    }

    if (pathname === '/api/charts/status-distribution' && method === 'GET') {
        try {
            const apiService = require('./apiService');
            const result = await apiService.getStatusDistributionChart({ query: {} });
            return result;
        } catch (error) {
            console.error('获取状态分布图表失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 订单详情API
    if (pathname.match(/^\/api\/orders\/\d+$/) && method === 'GET') {
        try {
            const orderId = pathname.split('/')[3];
            const apiService = require('./apiService');
            const result = await apiService.getOrderById({ params: { id: orderId } });
            return {
                success: true,
                ...result
            };
        } catch (error) {
            console.error('获取订单详情失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 测试发送API
    if (pathname === '/api/test-send' && method === 'POST') {
        try {
            const botService = global.botService;
            if (!botService) {
                return { success: false, error: 'Bot服务未初始化' };
            }

            const { chatId, groupId, type, merchantId, templateId, message, imageUrl, buttonsConfig } = data;
            
            // 兼容前端的参数名
            const targetChatId = chatId || groupId;
            
            // 验证必要参数
            if (!targetChatId) {
                return { success: false, error: '请输入群组ID' };
            }

            let messageContent = '';
            let sendOptions = {};

            // 根据发送类型构建消息内容
            if (type === 'merchant') {
                if (!merchantId) {
                    return { success: false, error: '请选择商家' };
                }
                
                const merchant = dbOperations.getMerchantById(merchantId);
                if (!merchant) {
                    return { success: false, error: '商家不存在' };
                }

                // 构建商家信息消息，使用正确的数据库字段名
                messageContent = `地区：#${merchant.region_name || 'xx'}              艺名：${merchant.teacher_name || '未填写'}
优点：${merchant.advantages || '未填写'}
缺点：${merchant.disadvantages || '未填写'}
价格：${merchant.price1 || '未填写'}p              ${merchant.price2 || '未填写'}pp

老师💃自填基本功：
💦洗:${merchant.skill_wash || '未填写'}
👄吹:${merchant.skill_blow || '未填写'}
❤️做:${merchant.skill_do || '未填写'}
🐍吻:${merchant.skill_kiss || '未填写'}`;

                // 添加跳转到私聊的按钮
                let botUsername = process.env.BOT_USERNAME;
                
                // 如果环境变量未设置，尝试从bot服务获取
                if (!botUsername && botService && botService.bot) {
                    try {
                        const botInfo = await botService.bot.getMe();
                        botUsername = botInfo.username;
                        console.log(`动态获取到bot用户名: ${botUsername}`);
                    } catch (error) {
                        console.error('获取bot用户名失败:', error);
                        botUsername = 'xiaojisystemBOT'; // 默认值
                    }
                } else if (!botUsername) {
                    botUsername = 'xiaojisystemBOT'; // 默认值
                }
                
                sendOptions.reply_markup = {
                    inline_keyboard: [
                        [{ text: '出击！', url: `https://t.me/${botUsername}?start=merchant_${merchantId}` }],
                        [{ text: '榜单', url: 'https://t.me/xiaoji233' }]
                    ]
                };

                // 如果有图片，添加图片
                if (imageUrl) {
                    sendOptions.caption = messageContent;
                    sendOptions.photo = imageUrl;
                }
            } else if (type === 'template') {
                if (!templateId) {
                    return { success: false, error: '请选择消息模板' };
                }
                
                const template = dbOperations.getMessageTemplateById(templateId);
                if (!template) {
                    return { success: false, error: '消息模板不存在' };
                }
                
                messageContent = template.content;
                
                // 如果模板有图片，使用模板图片
                if (template.image_url) {
                    sendOptions.caption = messageContent;
                    sendOptions.photo = template.image_url;
                }
            } else if (type === 'custom') {
                if (!message || !message.trim()) {
                    return { success: false, error: '请输入消息内容' };
                }
                messageContent = message;
                
                // 如果有图片，添加图片
                if (imageUrl) {
                    sendOptions.caption = messageContent;
                    sendOptions.photo = imageUrl;
                }
                
                // 如果有按钮配置，添加按钮
                if (buttonsConfig && buttonsConfig.length > 0) {
                    sendOptions.reply_markup = {
                        inline_keyboard: buttonsConfig
                    };
                }
            } else {
                return { success: false, error: '无效的发送类型' };
            }

            // 发送消息
            let result;
            if (sendOptions.photo) {
                // 发送图片消息
                const photoOptions = {
                    caption: sendOptions.caption,
                    parse_mode: 'HTML'
                };
                if (sendOptions.reply_markup) {
                    photoOptions.reply_markup = sendOptions.reply_markup;
                }
                result = await botService.bot.sendPhoto(targetChatId, sendOptions.photo, photoOptions);
            } else {
                // 发送文本消息
                const textOptions = {
                    parse_mode: 'HTML'
                };
                if (sendOptions.reply_markup) {
                    textOptions.reply_markup = sendOptions.reply_markup;
                }
                result = await botService.bot.sendMessage(targetChatId, messageContent, textOptions);
            }

            console.log('✅ 测试消息发送成功:', {
                chatId: targetChatId,
                messageId: result.message_id,
                type,
                merchantId,
                templateId
            });

            return {
                success: true,
                message: '消息发送成功',
                data: {
                    messageId: result.message_id,
                    chatId: targetChatId
                }
            };

        } catch (error) {
            console.error('❌ 测试发送失败:', error);
            
            // 处理常见错误
            if (error.code === 'ETELEGRAM') {
                if (error.response && error.response.description) {
                    if (error.response.description.includes('chat not found')) {
                        return { success: false, error: '群组不存在或机器人未加入该群组' };
                    } else if (error.response.description.includes('not enough rights')) {
                        return { success: false, error: '机器人在该群组中没有发送消息的权限' };
                    } else if (error.response.description.includes('blocked')) {
                        return { success: false, error: '机器人被该群组屏蔽' };
                    }
                    return { success: false, error: `Telegram错误: ${error.response.description}` };
                }
            }
            
            return { 
                success: false, 
                error: `发送失败: ${error.message}` 
            };
        }
    }

    return { success: false, error: 'API路径不存在' };
}

// Webhook更新处理 - 事件驱动机制
function processWebhookUpdate(update) {
    try {
        // 获取Bot服务实例（通过全局引用或依赖注入）
        const botService = global.botService;
        if (!botService) {
            console.error('❌ Bot服务实例不存在');
            return;
        }

        // 处理文本消息
        if (update.message && update.message.text) {
            // 模拟bot.on('message')事件
            setImmediate(() => {
                botService.bot.emit('message', update.message);
            });
        }

        // 处理callback query
        if (update.callback_query) {
            // 模拟bot.on('callback_query')事件
            setImmediate(() => {
                botService.bot.emit('callback_query', update.callback_query);
            });
        }

        // 处理其他类型的更新
        if (update.inline_query) {
            setImmediate(() => {
                botService.bot.emit('inline_query', update.inline_query);
            });
        }

    } catch (error) {
        console.error('❌ 处理webhook更新失败:', error);
    }
}

module.exports = {
    createHttpServer,
    handleApiRequest,
    processApiRequest,
    handleWebhookRequest,
    processWebhookUpdate
}; 
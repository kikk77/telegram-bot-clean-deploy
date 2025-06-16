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

// API请求处理
function handleApiRequest(req, res, pathname, method) {
    let body = '';
    
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        try {
            const data = body ? JSON.parse(body) : {};
            const response = processApiRequest(pathname, method, data);
            
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
function processApiRequest(pathname, method, data) {
    // 绑定码管理API
    if (pathname === '/api/bind-codes') {
        if (method === 'GET') {
            return { success: true, data: dbOperations.getAllBindCodes() };
        } else if (method === 'POST') {
            const result = dbOperations.createBindCode(data.description);
            loadCacheData();
            return { success: true, data: result };
        } else if (method === 'DELETE') {
            dbOperations.deleteBindCode(data.id);
            loadCacheData();
            return { success: true };
        }
    }

    // 地区管理API
    if (pathname === '/api/regions') {
        if (method === 'GET') {
            return { success: true, data: dbOperations.getAllRegions() };
        } else if (method === 'POST') {
            const result = dbOperations.createRegion(data.name, data.sortOrder);
            loadCacheData();
            return { success: true, data: { id: result } };
        } else if (method === 'PUT') {
            dbOperations.updateRegion(data.id, data.name, data.sortOrder);
            loadCacheData();
            return { success: true };
        } else if (method === 'DELETE') {
            dbOperations.deleteRegion(data.id);
            loadCacheData();
            return { success: true };
        }
    }

    // 商家管理API
    if (pathname === '/api/merchants') {
        if (method === 'GET') {
            return { success: true, data: dbOperations.getAllMerchants() };
        }
    }

    // 删除商家API
    if (pathname.match(/^\/api\/merchants\/\d+$/) && method === 'DELETE') {
        const merchantId = pathname.split('/')[3];
        dbOperations.deleteMerchant(merchantId);
        loadCacheData();
        return { success: true };
    }

    // 商家绑定状态重置API
    if (pathname.match(/^\/api\/merchants\/\d+\/reset$/) && method === 'POST') {
        const merchantId = pathname.split('/')[3];
        dbOperations.resetMerchantBind(merchantId);
        loadCacheData();
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
        
        loadCacheData();
        return { success: true };
    }

    // 暂停/恢复商家API
    if (pathname.match(/^\/api\/merchants\/\d+\/toggle-status$/) && method === 'POST') {
        const merchantId = pathname.split('/')[3];
        dbOperations.toggleMerchantStatus(merchantId);
        loadCacheData();
        return { success: true };
    }

    // 按钮管理API
    if (pathname === '/api/buttons') {
        if (method === 'GET') {
            return { success: true, data: dbOperations.getButtons() };
        } else if (method === 'POST') {
            const result = dbOperations.createButton(data.title, data.message, data.merchantId);
            loadCacheData();
            return { success: true, data: { id: result } };
        } else if (method === 'DELETE') {
            dbOperations.deleteButton(data.id);
            loadCacheData();
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
            loadCacheData();
            return { success: true, data: { id: result } };
        } else if (method === 'PUT') {
            dbOperations.updateMessageTemplate(
                data.id, data.name, data.content, data.imageUrl, data.buttonsConfig
            );
            loadCacheData();
            return { success: true };
        } else if (method === 'DELETE') {
            dbOperations.deleteMessageTemplate(data.id);
            loadCacheData();
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
            loadCacheData();
            return { success: true, data: { id: result } };
        } else if (method === 'DELETE') {
            dbOperations.deleteTriggerWord(data.id);
            loadCacheData();
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
            loadCacheData();
            return { success: true, data: { id: result } };
        } else if (method === 'DELETE') {
            dbOperations.deleteScheduledTask(data.id);
            loadCacheData();
            return { success: true };
        }
    }

    // 测试发送API
    if (pathname === '/api/test-send' && method === 'POST') {
        console.log('测试发送API接收到的数据:', JSON.stringify(data, null, 2));
        
        // 立即执行发送逻辑，不使用setImmediate
        (async () => {
            try {
                let message, options = {};
                
                if (data.type === 'merchant') {
                    // 商家信息模式
                    const merchant = dbOperations.getMerchantById(data.merchantId);
                    if (merchant) {
                        // 使用与商家管理页面相同的格式，但隐藏联系方式
                        message = `地区：#${merchant.region_name || 'xx'}              艺名：${merchant.teacher_name || '未填写'}\n` +
                                `优点：${merchant.advantages || '未填写'}\n` +
                                `缺点：${merchant.disadvantages || '未填写'}\n` +
                                `价格：${merchant.price1 || '未填写'}p              ${merchant.price2 || '未填写'}pp\n\n` +
                                `老师💃自填基本功：\n` +
                                `💦洗:${merchant.skill_wash || '未填写'}\n` +
                                `👄吹:${merchant.skill_blow || '未填写'}\n` +
                                `❤️做:${merchant.skill_do || '未填写'}\n` +
                                `🐍吻:${merchant.skill_kiss || '未填写'}`;
                        
                        options.reply_markup = {
                            inline_keyboard: [[
                                { text: '联系', url: `https://t.me/xiaoji_daniao_bot?start=merchant_${merchant.id}` }
                            ]]
                        };
                    } else {
                        message = '❌ 商家信息不存在';
                    }
                    
                } else if (data.type === 'template') {
                    // 消息模板模式
                    const template = dbOperations.getMessageTemplateById(data.templateId);
                    if (template) {
                        message = template.content;
                        
                        if (template.buttons_config) {
                            try {
                                const buttons = JSON.parse(template.buttons_config);
                                if (buttons.length > 0) {
                                    options.reply_markup = { inline_keyboard: buttons };
                                }
                            } catch (e) {
                                console.error('解析模板按钮配置失败:', e);
                            }
                        }
                        
                        // 如果有图片，先发送图片
                        if (template.image_url) {
                            await bot.sendPhoto(data.chatId, template.image_url, {
                                caption: message,
                                reply_markup: options.reply_markup
                            });
                            return;
                        }
                    } else {
                        message = '❌ 消息模板不存在';
                    }
                    
                } else if (data.type === 'custom') {
                    // 自定义消息模式
                    message = data.message;
                    
                    if (data.buttonsConfig && data.buttonsConfig.length > 0) {
                        options.reply_markup = { inline_keyboard: data.buttonsConfig };
                    }
                    
                    // 如果有图片，先发送图片
                    if (data.imageUrl) {
                        await bot.sendPhoto(data.chatId, data.imageUrl, {
                            caption: message,
                            reply_markup: options.reply_markup
                        });
                        return;
                    }
                    
                } else {
                    // 默认模式（兼容旧版本）
                    message = data.message || '🎯 点击下方按钮联系商家';
                    options.reply_markup = {
                        inline_keyboard: [[
                            { text: '联系客服', url: 'https://t.me/xiaoji_daniao_bot' }
                        ]]
                    };
                    }
                
                await bot.sendMessage(data.chatId, message, options);
            } catch (error) {
                console.error('测试发送失败:', error);
            }
        })();
        
        return { success: true };
    }

    // 统计数据API
    if (pathname === '/api/stats' && method === 'GET') {
        const stats = dbOperations.getInteractionStats();
        const cacheData = getCacheData();
        const buttonStats = dbOperations.getButtons();
        const totalClicks = buttonStats.reduce((sum, btn) => sum + btn.click_count, 0);
        
        return {
            success: true,
            data: {
                totalMerchants: cacheData.merchants.length,
                totalButtons: cacheData.buttons.length,
                totalTemplates: cacheData.messageTemplates.length,
                totalTriggers: cacheData.triggerWords.length,
                totalTasks: cacheData.scheduledTasks.length,
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

    return { success: false, error: 'API路径不存在' };
}

module.exports = {
    createHttpServer,
    handleApiRequest,
    processApiRequest
}; 
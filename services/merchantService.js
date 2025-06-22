const dbOperations = require('../models/dbOperations');

// 商家管理服务模块
class MerchantService {
    constructor(bot) {
        this.bot = bot;
        this.bindingSessions = new Map(); // 绑定会话管理
    }

    // 处理商家绑定流程
    async handleMerchantBinding(userId, message, username, firstName, lastName) {
        try {
            const merchant = dbOperations.getMerchantByUserId(userId);
            
            if (!merchant) {
                // 检查是否是绑定码
                const bindCode = dbOperations.getBindCode(message);
                if (bindCode && !bindCode.used) {
                    // 开始绑定流程
                    await this.startBindingProcess(userId, bindCode, username, firstName, lastName);
                    return true;
                }
                return false;
            }

            // 处理已绑定商家的信息更新
            return await this.handleMerchantInfoUpdate(merchant, message);
            
        } catch (error) {
            console.error('处理商家绑定流程失败:', error);
            return false;
        }
    }

    // 开始绑定流程
    async startBindingProcess(userId, bindCode, username, firstName, lastName) {
        try {
            // 创建商家记录 - 使用createMerchantSimple方法
            const merchantData = {
                user_id: userId,
                username: username,
                bind_code: bindCode.code,
                bind_step: 1,
                status: 'binding'
            };
            
            const merchantId = dbOperations.createMerchantSimple(merchantData);
            
            // 标记绑定码为已使用
            dbOperations.useBindCode(bindCode.code, userId);
            
            // 发送绑定成功消息
            await this.bot.sendMessage(userId, `✅ 绑定码验证成功！
欢迎加入小鸡团队！

请按照以下步骤完成信息设置：

1️⃣ 请选择您的地区`);
            
            // 发送地区选择
            await this.sendRegionSelection(userId);
            
            console.log(`商家 ${userId} 开始绑定流程，绑定码: ${bindCode.code}`);
            
        } catch (error) {
            console.error('开始绑定流程失败:', error);
            await this.bot.sendMessage(userId, '绑定失败，请联系管理员');
        }
    }

    // 发送地区选择
    async sendRegionSelection(userId) {
        try {
            const regions = dbOperations.getAllRegions();
            
            if (regions.length === 0) {
                await this.bot.sendMessage(userId, '暂无可选地区，请联系管理员');
                return;
            }
            
            const keyboard = {
                inline_keyboard: regions.map(region => [{
                    text: region.name,
                    callback_data: `select_region_${region.id}`
                }])
            };
            
            await this.bot.sendMessage(userId, '请选择您的地区：', {
                reply_markup: keyboard
            });
            
        } catch (error) {
            console.error('发送地区选择失败:', error);
        }
    }

    // 处理地区选择
    async handleRegionSelection(userId, regionId, query) {
        try {
            const merchant = dbOperations.getMerchantByUserId(userId);
            if (!merchant || merchant.bind_step !== 1) {
                this.bot.answerCallbackQuery(query.id, { text: '绑定状态异常' });
                return;
            }
            
            const region = dbOperations.getRegionById(regionId);
            if (!region) {
                this.bot.answerCallbackQuery(query.id, { text: '地区不存在' });
                return;
            }
            
            // 更新商家地区信息
            dbOperations.updateMerchantRegion(merchant.id, regionId);
            dbOperations.updateMerchantBindStep(merchant.user_id, 2);
            
            this.bot.answerCallbackQuery(query.id, { text: `已选择地区: ${region.name}` });
            
            // 进入下一步：设置艺名
            await this.bot.sendMessage(userId, `✅ 地区设置完成: ${region.name}

2️⃣ 请输入您的艺名：`);
            
            console.log(`商家 ${userId} 选择地区: ${region.name}`);
            
        } catch (error) {
            console.error('处理地区选择失败:', error);
            this.bot.answerCallbackQuery(query.id, { text: '处理失败' });
        }
    }

    // 处理商家信息更新
    async handleMerchantInfoUpdate(merchant, message) {
        try {
            switch (merchant.bind_step) {
                case 2:
                    // 设置艺名
                    return await this.handleTeacherNameInput(merchant, message);
                case 3:
                    // 设置联系方式
                    return await this.handleContactInput(merchant, message);
                case 4:
                    // 设置价格信息
                    return await this.handlePriceInput(merchant, message);
                default:
                    return false;
            }
        } catch (error) {
            console.error('处理商家信息更新失败:', error);
            return false;
        }
    }

    // 处理艺名输入
    async handleTeacherNameInput(merchant, teacherName) {
        try {
            // 更新艺名
            dbOperations.updateMerchantTeacherName(merchant.id, teacherName);
            dbOperations.updateMerchantBindStep(merchant.user_id, 3);
            
            await this.bot.sendMessage(merchant.user_id, `✅ 艺名设置完成: ${teacherName}

3️⃣ 请输入您的联系方式（如：@username）：`);
            
            console.log(`商家 ${merchant.user_id} 设置艺名: ${teacherName}`);
            return true;
            
        } catch (error) {
            console.error('处理艺名输入失败:', error);
            return false;
        }
    }

    // 处理联系方式输入
    async handleContactInput(merchant, contact) {
        try {
            // 更新联系方式
            dbOperations.updateMerchantContact(merchant.id, contact);
            dbOperations.updateMerchantBindStep(merchant.user_id, 4);
            
            await this.bot.sendMessage(merchant.user_id, `✅ 联系方式设置完成: ${contact}

4️⃣ 请设置价格信息，格式：p价格,pp价格
例如：300,500`);
            
            console.log(`商家 ${merchant.user_id} 设置联系方式: ${contact}`);
            return true;
            
        } catch (error) {
            console.error('处理联系方式输入失败:', error);
            return false;
        }
    }

    // 处理价格输入
    async handlePriceInput(merchant, priceText) {
        try {
            const prices = priceText.split(',');
            if (prices.length !== 2) {
                await this.bot.sendMessage(merchant.user_id, '❌ 价格格式错误，请按照格式输入：p价格,pp价格\n例如：300,500');
                return true;
            }
            
            const pPrice = parseInt(prices[0].trim());
            const ppPrice = parseInt(prices[1].trim());
            
            if (isNaN(pPrice) || isNaN(ppPrice)) {
                await this.bot.sendMessage(merchant.user_id, '❌ 价格必须是数字，请重新输入');
                return true;
            }
            
            // 更新价格信息
            dbOperations.updateMerchantPrices(merchant.id, pPrice, ppPrice);
            dbOperations.updateMerchantBindStep(merchant.user_id, 5);
            dbOperations.updateMerchantStatus(merchant.id, 'active');
            
            const region = dbOperations.getRegionById(merchant.region_id);
            const completionMessage = `🎉 恭喜！商家信息设置完成！

📋 您的信息：
📍 地区: ${region ? region.name : '未知'}
👤 艺名: ${merchant.teacher_name}
📞 联系方式: ${merchant.contact}
💰 价格: ${pPrice}p, ${ppPrice}pp

您现在可以接收预约了！`;
            
            await this.bot.sendMessage(merchant.user_id, completionMessage);
            
            console.log(`商家 ${merchant.user_id} 完成绑定流程`);
            return true;
            
        } catch (error) {
            console.error('处理价格输入失败:', error);
            return false;
        }
    }

    // 获取商家信息模板
    getMerchantInfoTemplate(merchant) {
        try {
            const region = dbOperations.getRegionById(merchant.region_id);
            const regionName = region ? region.name : 'xx';
            
            return `地区：#${regionName}              艺名：${merchant.teacher_name || '未填写'}
优点：${merchant.advantages || '未填写'}
缺点：${merchant.disadvantages || '未填写'}
价格：${merchant.price1 || '未填写'}p              ${merchant.price2 || '未填写'}pp
联系：${merchant.contact || '未填写'}

老师💃自填基本功：
💦洗:${merchant.skill_wash || '未填写'}
👄吹:${merchant.skill_blow || '未填写'}
❤️做:${merchant.skill_do || '未填写'}
🐍吻:${merchant.skill_kiss || '未填写'}`;
            
        } catch (error) {
            console.error('获取商家信息模板失败:', error);
            return '获取商家信息失败';
        }
    }

    // 生成商家预约按钮
    generateMerchantButtons(merchant) {
        try {
            const buttons = [];
            
            // 添加预约按钮
            if (merchant.price1) {
                buttons.push({ text: `${merchant.price1}p`, callback_data: `book_p_${merchant.id}` });
            }
            if (merchant.price2) {
                buttons.push({ text: `${merchant.price2}pp`, callback_data: `book_pp_${merchant.id}` });
            }
            buttons.push({ text: '其他时长', callback_data: `book_other_${merchant.id}` });
            
            return [buttons];
            
        } catch (error) {
            console.error('生成商家按钮失败:', error);
            return [];
        }
    }

    // 检查商家状态
    isMerchantActive(merchant) {
        return merchant && merchant.status === 'active' && merchant.bind_step === 5;
    }

    // 获取活跃商家列表
    getActiveMerchants() {
        try {
            return dbOperations.getActiveMerchants();
        } catch (error) {
            console.error('获取活跃商家列表失败:', error);
            return [];
        }
    }

    // 按地区获取商家
    getMerchantsByRegion(regionId) {
        try {
            return dbOperations.getMerchantsByRegion(regionId);
        } catch (error) {
            console.error('按地区获取商家失败:', error);
            return [];
        }
    }
}

// 验证管理员密码
function verifyAdminPassword(password) {
    const { dbManager } = require('../config/database');
    return dbManager.verifyAdminPassword(password);
}

module.exports = {
    MerchantService,
    verifyAdminPassword
}; 
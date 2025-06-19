const dbOperations = require('../models/dbOperations');

// 生成随机数据的辅助函数
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomDate(startDate, endDate) {
    const start = startDate.getTime();
    const end = endDate.getTime();
    return new Date(start + Math.random() * (end - start));
}

// 初始化测试数据
function initTestData() {
    try {
        const { db } = require('../config/database');
        const dbOperations = require('../models/dbOperations');
        
        console.log('🚀 开始生成完整测试数据...');
        
        // 临时禁用外键约束
        db.pragma('foreign_keys = OFF');
        
        // 检查并创建地区数据
        const existingRegions = dbOperations.getAllRegions();
        if (existingRegions.length < 10) {
            console.log('📍 创建地区数据...');
            const regions = [
                '上海', '北京', '广州', '深圳', '杭州', 
                '成都', '武汉', '南京', '西安', '其他'
            ];
            
            // 清空现有地区
            db.prepare('DELETE FROM regions').run();
            
            regions.forEach((name, index) => {
                dbOperations.createRegion(name, index + 1);
            });
            console.log('✅ 地区数据创建完成');
        }

        // 检查并创建绑定码数据
        const existingBindCodes = dbOperations.getAllBindCodes();
        if (existingBindCodes.length < 35) {
            console.log('🔑 创建绑定码数据...');
            // 清空现有绑定码
            db.prepare('DELETE FROM bind_codes').run();
            
            // 生成35个绑定码
            for (let i = 0; i < 35; i++) {
                dbOperations.createBindCode(`测试绑定码${i + 1}`);
            }
            console.log('✅ 绑定码数据创建完成');
        }

        // 检查并创建商家数据
        const existingMerchants = dbOperations.getAllMerchants();
        if (existingMerchants.length < 30) {
            console.log('👨‍🏫 创建商家数据...');
            // 清空现有商家
            db.prepare('DELETE FROM merchants').run();
            
            const teacherNames = [
                '小雨', '晓雪', '梦琪', '思雨', '欣妍', '雅琪', '诗涵', '梦洁', '雅欣', '若汐',
                '心悦', '语桐', '思琪', '梦瑶', '雨婷', '欣然', '静雯', '雅琪', '诗雨', '梦娜',
                '美琳', '欣妍', '雪儿', '婷婷', '静怡', '诗涵', '梦洁', '雅欣', '若汐', '心悦',
                '语桐', '思琪', '梦瑶', '雨婷', '欣然'
            ];
            
            const regions = dbOperations.getAllRegions();
            const bindCodes = dbOperations.getAllBindCodes();
            
            for (let i = 0; i < 32; i++) {
                const teacherName = teacherNames[i];
                const userId = 1000000 + i;
                const username = `teacher${i.toString().padStart(2, '0')}`;
                const region = getRandomElement(regions);
                const bindCode = bindCodes[i];
                
                // 随机价格范围
                const priceBase = getRandomInt(400, 900);
                const price1 = priceBase;
                const price2 = priceBase + getRandomInt(100, 400);
                
                // 直接插入商家数据，不使用外键
                const stmt = db.prepare(`
                    INSERT INTO merchants (
                        user_id, username, teacher_name, region_id, 
                        contact, bind_code, bind_step, status, price1, price2,
                        advantages, disadvantages, skill_wash, skill_blow, skill_do, skill_kiss
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                
                stmt.run(
                    userId, username, teacherName, region.id, 
                    `@${username}`, bindCode.code, 5, 'active',
                    price1, price2, '服务优质，态度好', '暂无',
                    '熟练', '精通', '专业', '温柔'
                );
                
                // 标记绑定码为已使用
                db.prepare('UPDATE bind_codes SET used = 1, used_by = ? WHERE code = ?')
                  .run(userId, bindCode.code);
            }
            console.log('✅ 32位老师数据创建完成');
        }

        // 生成大量订单数据 - 已禁用，保留真实数据
        console.log('📦 跳过生成订单数据，保留真实数据...');
        
        // 清空现有订单数据重新生成 - 已禁用以保护真实数据
        // db.prepare('DELETE FROM orders').run();
        // db.prepare('DELETE FROM booking_sessions').run();
        // db.prepare('DELETE FROM evaluations').run();
        
        // 订单生成逻辑已禁用，保留真实数据
        /*
        const merchants = dbOperations.getAllMerchants();
        const regions = dbOperations.getAllRegions();
        const courseTypes = ['p', 'pp', 'other'];
        const courseContents = ['基础服务', '高级服务', '特色服务', '定制服务', 'VIP服务', '专业护理'];
        
        // 生成200+用户名列表
        const userNames = [];
        const userPrefixes = ['小', '大', '老', '阿', ''];
        const userSuffixes = [
            '明', '红', '丽', '华', '强', '军', '伟', '芳', '娟', '敏', '静', '丹', '霞', '峰', 
            '磊', '超', '勇', '艳', '秀', '英', '杰', '涛', '浩', '宇', '鹏', '飞', '凯', '辉',
            '斌', '刚', '健', '亮', '建', '文', '武', '志', '勇', '毅', '俊', '帅', '威', '雄'
        ];
        
        for (let i = 0; i < 220; i++) {
            const prefix = getRandomElement(userPrefixes);
            const suffix = getRandomElement(userSuffixes);
            const number = Math.random() > 0.7 ? getRandomInt(1, 99) : '';
            userNames.push(`${prefix}${suffix}${number}`);
        }
        */
        
        // 生成真实的用户预约流程数据（过去1个月）- 已禁用
        /*
        const now = new Date();
        const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        
        let bookingSessionId = 1;
        let totalOrdersGenerated = 0;
        
        // 每个用户平均2-4个预约流程
        for (let userId = 2000000; userId < 2000220; userId++) {
            const userName = userNames[userId - 2000000];
            const username = `user${(userId - 2000000).toString().padStart(3, '0')}`;
            const bookingCount = getRandomInt(2, 5); // 2-4个预约
            
            for (let j = 0; j < bookingCount; j++) {
                const merchant = getRandomElement(merchants);
                const courseType = getRandomElement(courseTypes);
                
                // 根据课程类型确定价格和内容（按照真实逻辑）
                let courseContent = '';
                let price = '';
                
                switch (courseType) {
                    case 'p':
                        courseContent = 'p';
                        price = merchant.price1 || getRandomInt(400, 600);
                        break;
                    case 'pp':
                        courseContent = 'pp';
                        price = merchant.price2 || getRandomInt(600, 900);
                        break;
                    case 'other':
                        courseContent = '其他时长';
                        price = getRandomInt(500, 800);
                        break;
                }
                
                const initialDate = getRandomDate(oneMonthAgo, now);
                
                // 1. 首先创建预约会话（模拟用户点击预约按钮）
                const bookingStmt = db.prepare(`
                    INSERT INTO booking_sessions (
                        id, user_id, merchant_id, course_type, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                
                const bookingCreatedAt = Math.floor(initialDate.getTime() / 1000);
                
                // 85%的预约会约课成功，70%的成功约课会完成课程
                const bookingSuccess = Math.random() > 0.15;
                const courseCompleted = bookingSuccess && Math.random() > 0.3;
                
                let sessionStatus = 'pending';
                let confirmedTime = bookingCreatedAt;
                let completedTime = bookingCreatedAt;
                
                if (bookingSuccess) {
                    sessionStatus = 'confirmed';
                    confirmedTime = bookingCreatedAt + getRandomInt(1800, 7200); // 0.5-2小时后确认约课成功
                    
                    if (courseCompleted) {
                        sessionStatus = 'completed';
                        completedTime = confirmedTime + getRandomInt(3600, 172800); // 1小时-2天后完成课程
                    }
                }
                
                bookingStmt.run(
                    bookingSessionId, userId, merchant.id, courseType, 
                    sessionStatus, bookingCreatedAt, 
                    courseCompleted ? completedTime : (bookingSuccess ? confirmedTime : bookingCreatedAt)
                );
                
                // 2. 如果约课成功，创建订单（模拟createOrderData函数）
                if (bookingSuccess) {
                    const orderStmt = db.prepare(`
                        INSERT INTO orders (
                            booking_session_id, user_id, user_name, user_username,
                            merchant_id, teacher_name, teacher_contact, course_content,
                            price, booking_time, status, user_evaluation, merchant_evaluation,
                            report_content, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);
                    
                    let orderStatus = 'confirmed';
                    let userEvaluation = null;
                    let merchantEvaluation = null;
                    
                    // 3. 如果课程完成，更新订单状态并生成评价
                    if (courseCompleted) {
                        orderStatus = 'completed';
                        
                        // 生成用户评价（按照真实评价结构）
                        const userScore = getRandomInt(7, 10);
                        const userScores = {
                            hardware1: getRandomInt(7, 10), // 长度
                            hardware2: getRandomInt(7, 10), // 粗细  
                            hardware3: getRandomInt(7, 10), // 持久力
                            software1: getRandomInt(7, 10), // 技巧
                        };
                        
                        const userComments = [
                            '服务很好，很满意',
                            '老师很专业，态度也很好',
                            '整体体验不错，下次还会来',
                            '性价比很高，推荐',
                            '服务到位，环境也很干净',
                            '老师技术很好，很用心'
                        ];
                        
                        userEvaluation = JSON.stringify({
                            overall_score: userScore,
                            scores: userScores,
                            comments: getRandomElement(userComments),
                            created_at: new Date(completedTime * 1000 + 3600000).toISOString()
                        });
                        
                        // 生成商家评价
                        const merchantScore = getRandomInt(8, 10);
                        const merchantScores = {
                            length: getRandomInt(8, 10),
                            thickness: getRandomInt(8, 10),
                            durability: getRandomInt(8, 10),
                            technique: getRandomInt(8, 10)
                        };
                        
                        const merchantComments = [
                            '客户很配合，沟通顺畅',
                            '准时到达，很守时',
                            '很好的客户，推荐',
                            '付款及时，合作愉快',
                            '客户很友善，体验很好'
                        ];
                        
                        merchantEvaluation = JSON.stringify({
                            overall_score: merchantScore,
                            scores: merchantScores,
                            comments: getRandomElement(merchantComments),
                            created_at: new Date(completedTime * 1000 + 7200000).toISOString()
                        });
                    }
                    
                    // 生成时间字符串
                    const bookingTimeStr = new Date(confirmedTime * 1000).toISOString();
                    const createdAtStr = new Date(confirmedTime * 1000).toISOString();
                    const updatedAtStr = new Date((courseCompleted ? completedTime : confirmedTime) * 1000).toISOString();
                    
                    orderStmt.run(
                        bookingSessionId, userId, userName, username,
                        merchant.id, merchant.teacher_name, merchant.contact, courseContent,
                        price.toString(), bookingTimeStr, orderStatus,
                        userEvaluation, merchantEvaluation, null,
                        createdAtStr, updatedAtStr
                    );
                    
                    totalOrdersGenerated++;
                }
                
                bookingSessionId++;
            }
        }
        
        // 重新启用外键约束
        db.pragma('foreign_keys = ON');
        
        console.log(`✅ 生成了 ${totalOrdersGenerated} 个订单`);
        console.log(`✅ 涵盖 ${userNames.length} 位用户`);
        console.log(`✅ 涵盖 ${merchants.length} 位老师`);
        console.log('🎉 完整测试数据生成完成！');
        */
        
        console.log('✅ 跳过订单数据生成，保留真实数据');
        
    } catch (error) {
        console.error('❌ 初始化测试数据失败:', error);
        // 确保重新启用外键约束
        try {
            const { db } = require('../config/database');
            db.pragma('foreign_keys = ON');
        } catch (e) {
            console.error('恢复外键约束失败:', e);
        }
    }
}

module.exports = {
    initTestData
}; 

// 如果直接运行此文件，执行初始化 - 暂时禁用
// if (require.main === module) {
//     initTestData();
// } 
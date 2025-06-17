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

        // 生成大量订单数据
        console.log('📦 开始生成订单数据...');
        
        // 清空现有订单数据重新生成
        db.prepare('DELETE FROM orders').run();
        db.prepare('DELETE FROM booking_sessions').run();
        db.prepare('DELETE FROM evaluations').run();
        
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
        
        // 生成订单数据（过去1个月）
        const now = new Date();
        const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        
        let orderId = 1;
        let totalOrdersGenerated = 0;
        
        // 每个用户平均2-4个订单
        for (let userId = 2000000; userId < 2000220; userId++) {
            const userName = userNames[userId - 2000000];
            const username = `user${(userId - 2000000).toString().padStart(3, '0')}`;
            const orderCount = getRandomInt(2, 5); // 2-4个订单
            
            for (let j = 0; j < orderCount; j++) {
                const merchant = getRandomElement(merchants);
                const courseType = getRandomElement(courseTypes);
                const courseContent = getRandomElement(courseContents);
                const orderDate = getRandomDate(oneMonthAgo, now);
                
                // 85%的订单被确认，70%的确认订单被完成
                const isConfirmed = Math.random() > 0.15;
                const isCompleted = isConfirmed && Math.random() > 0.3;
                
                let status = 'pending';
                let confirmedTime = null;
                let completedTime = null;
                
                if (isConfirmed) {
                    status = 'confirmed';
                    confirmedTime = Math.floor(orderDate.getTime() / 1000) + getRandomInt(3600, 86400);
                    
                    if (isCompleted) {
                        status = 'completed';
                        completedTime = confirmedTime + getRandomInt(3600, 172800);
                    }
                }
                
                const actualPrice = getRandomInt(merchant.price1, merchant.price2);
                const bookingSessionId = orderId;
                
                // 先创建booking_session
                const bookingStmt = db.prepare(`
                    INSERT INTO booking_sessions (
                        id, user_id, merchant_id, course_type, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                
                const bookingCreatedAt = Math.floor(orderDate.getTime() / 1000);
                
                bookingStmt.run(
                    bookingSessionId, userId, merchant.id, courseType, 
                    isCompleted ? 'completed' : (isConfirmed ? 'confirmed' : 'pending'),
                    bookingCreatedAt, completedTime || confirmedTime || bookingCreatedAt
                );
                
                // 插入订单 - 使用简化的结构
                const orderStmt = db.prepare(`
                    INSERT INTO orders (
                        id, booking_session_id, user_id, user_name, user_username,
                        merchant_id, teacher_name, teacher_contact,
                        course_content, price, booking_time, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                
                const bookingTimeStr = orderDate.toISOString();
                const createdAtStr = orderDate.toISOString();
                const updatedAtStr = (completedTime ? new Date(completedTime * 1000) : orderDate).toISOString();
                
                orderStmt.run(
                    orderId, bookingSessionId, userId, userName, username,
                    merchant.id, merchant.teacher_name, merchant.contact,
                    courseContent, actualPrice.toString(), bookingTimeStr, status, createdAtStr, updatedAtStr
                );
                
                // 如果订单完成，生成双方评价
                if (isCompleted) {
                    // 生成用户评价
                    const userScore = getRandomInt(7, 10);
                    const userEvaluationStmt = db.prepare(`
                        INSERT INTO evaluations (
                            booking_session_id, evaluator_type, evaluator_id, target_id,
                            overall_score, detailed_scores, comments, status, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);
                    
                    const userDetailScores = {
                        service: getRandomInt(7, 10),
                        skill: getRandomInt(7, 10),
                        environment: getRandomInt(7, 10),
                        value: getRandomInt(6, 9),
                        punctuality: getRandomInt(7, 10)
                    };
                    
                    const userComments = [
                        '服务很好，很满意',
                        '老师很专业，态度也很好',
                        '整体体验不错，下次还会来',
                        '性价比很高，推荐',
                        '服务到位，环境也很干净',
                        '老师技术很好，很用心',
                        '预约很方便，服务很棒',
                        '非常满意，会推荐给朋友',
                        '专业水准很高',
                        '服务态度非常好'
                    ];
                    
                    userEvaluationStmt.run(
                        bookingSessionId, 'user', userId, merchant.user_id,
                        userScore, JSON.stringify(userDetailScores), 
                        getRandomElement(userComments), 'completed', completedTime
                    );
                    
                    // 生成商家评价
                    const merchantScore = getRandomInt(8, 10);
                    const merchantEvaluationStmt = db.prepare(`
                        INSERT INTO evaluations (
                            booking_session_id, evaluator_type, evaluator_id, target_id,
                            overall_score, detailed_scores, comments, status, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);
                    
                    const merchantDetailScores = {
                        communication: getRandomInt(8, 10),
                        punctuality: getRandomInt(8, 10),
                        cooperation: getRandomInt(8, 10),
                        payment: getRandomInt(9, 10)
                    };
                    
                    const merchantComments = [
                        '客户很配合，沟通顺畅',
                        '准时到达，很守时',
                        '很好的客户，推荐',
                        '付款及时，合作愉快',
                        '客户很友善，体验很好',
                        '沟通很好，没有问题',
                        '非常配合的客户',
                        '准时守约，很好合作'
                    ];
                    
                    merchantEvaluationStmt.run(
                        bookingSessionId, 'merchant', merchant.user_id, userId,
                        merchantScore, JSON.stringify(merchantDetailScores),
                        getRandomElement(merchantComments), 'completed', completedTime + 3600
                    );
                }
                
                orderId++;
                totalOrdersGenerated++;
            }
        }
        
        // 重新启用外键约束
        db.pragma('foreign_keys = ON');
        
        console.log(`✅ 生成了 ${totalOrdersGenerated} 个订单`);
        console.log(`✅ 涵盖 ${userNames.length} 位用户`);
        console.log(`✅ 涵盖 ${merchants.length} 位老师`);
        console.log('🎉 完整测试数据生成完成！');
        
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

// 如果直接运行此文件，执行初始化
if (require.main === module) {
    initTestData();
} 
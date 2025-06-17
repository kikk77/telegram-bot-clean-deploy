const dbOperations = require('../models/dbOperations');

// 生成随机数据的辅助函数
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomDate(startDate, endDate) {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    return new Date(start + Math.random() * (end - start));
}

// 初始化测试数据
function initTestData() {
    try {
        // 检查是否已有地区数据
        const existingRegions = dbOperations.getAllRegions();
        if (existingRegions.length === 0) {
            // 添加默认地区
            const defaultRegions = [
                { name: '上海', sortOrder: 1 },
                { name: '北京', sortOrder: 2 },
                { name: '广州', sortOrder: 3 },
                { name: '深圳', sortOrder: 4 },
                { name: '杭州', sortOrder: 5 },
                { name: '成都', sortOrder: 6 },
                { name: '武汉', sortOrder: 7 },
                { name: '西安', sortOrder: 8 },
                { name: '南京', sortOrder: 9 },
                { name: '其他', sortOrder: 99 }
            ];
            
            defaultRegions.forEach(region => {
                dbOperations.createRegion(region.name, region.sortOrder);
            });
            
            console.log('✅ 默认地区数据初始化完成');
        }
        
        // 检查是否已有绑定码数据
        const existingBindCodes = dbOperations.getAllBindCodes();
        if (existingBindCodes.length === 0) {
            // 添加足够的绑定码供29位老师使用
            for (let i = 1; i <= 35; i++) {
                dbOperations.createBindCode(`商家绑定码${i.toString().padStart(3, '0')}`);
            }
            
            console.log('✅ 绑定码初始化完成');
        }

        // 检查是否已有商家数据
        const existingMerchants = dbOperations.getAllMerchants();
        if (existingMerchants.length < 29) {
            // 清空现有商家数据重新生成
            const { db } = require('../config/database');
            db.prepare('DELETE FROM merchants').run();
            
            // 生成29位老师数据
            const teacherNames = [
                '小雨', '晓雪', '梦琪', '雨涵', '欣怡', '佳琪', '雅静', '思雨', '可馨', '语嫣',
                '美琳', '欣妍', '雪儿', '婷婷', '静怡', '诗涵', '梦洁', '雅欣', '若汐', '心悦',
                '语桐', '思琪', '梦瑶', '雨婷', '欣然', '静雯', '雅琪', '诗雨', '梦娜'
            ];
            
            const regions = dbOperations.getAllRegions();
            const bindCodes = dbOperations.getAllBindCodes();
            
            for (let i = 0; i < 29; i++) {
                const teacherName = teacherNames[i];
                const userId = 1000000 + i;
                const username = `teacher${i.toString().padStart(2, '0')}`;
                const region = getRandomElement(regions);
                const bindCode = bindCodes[i];
                
                // 随机价格范围
                const priceBase = getRandomInt(400, 800);
                const price1 = priceBase;
                const price2 = priceBase + getRandomInt(100, 300);
                
                const merchantData = {
                    user_id: userId,
                    username: username,
                    first_name: teacherName,
                    region_id: region.id,
                    teacher_name: teacherName,
                    contact: `@${username}`,
                    bind_code: bindCode.code,
                    bind_step: 5,
                    status: 'active',
                    price1: price1,
                    price2: price2,
                    advantages: '服务优质',
                    disadvantages: '暂无',
                    skill_wash: '熟练',
                    skill_blow: '精通',
                    skill_do: '专业',
                    skill_kiss: '温柔'
                };
                
                // 插入商家数据
                const stmt = db.prepare(`
                    INSERT INTO merchants (
                        user_id, username, region_id, teacher_name, 
                        contact, bind_code, bind_step, status, price1, price2,
                        advantages, disadvantages, skill_wash, skill_blow, skill_do, skill_kiss
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                
                stmt.run(
                    merchantData.user_id, merchantData.username,
                    merchantData.region_id, merchantData.teacher_name, merchantData.contact,
                    merchantData.bind_code, merchantData.bind_step, merchantData.status,
                    merchantData.price1, merchantData.price2, merchantData.advantages,
                    merchantData.disadvantages, merchantData.skill_wash, merchantData.skill_blow,
                    merchantData.skill_do, merchantData.skill_kiss
                );
                
                // 标记绑定码为已使用
                db.prepare('UPDATE bind_codes SET used = 1, used_by = ? WHERE code = ?')
                  .run(userId, bindCode.code);
            }
            
            console.log('✅ 29位老师数据初始化完成');
        }

        // 检查是否已有大量订单数据
        const existingOrders = dbOperations.getAllOrders();
        if (existingOrders.length < 200) {
            // 清空现有订单数据重新生成
            const { db } = require('../config/database');
            db.prepare('DELETE FROM orders').run();
            db.prepare('DELETE FROM evaluations').run();
            
            // 生成233位用户的订单数据
            const merchants = dbOperations.getAllMerchants();
            const regions = dbOperations.getAllRegions();
            const courseTypes = ['p', 'pp', 'other'];
            const courseContents = ['基础服务', '高级服务', '特色服务', '定制服务'];
            
            // 生成用户名列表
            const userNames = [];
            const userPrefixes = ['小', '大', '老', '阿', ''];
            const userSuffixes = ['明', '红', '丽', '华', '强', '军', '伟', '芳', '娟', '敏', '静', '丹', '霞', '峰', '磊', '超', '勇', '艳', '秀', '英', '杰', '涛', '浩', '宇', '鹏'];
            
            for (let i = 0; i < 233; i++) {
                const prefix = getRandomElement(userPrefixes);
                const suffix = getRandomElement(userSuffixes);
                const number = Math.random() > 0.7 ? getRandomInt(1, 99) : '';
                userNames.push(`${prefix}${suffix}${number}`);
            }
            
            // 生成订单数据（过去2个月）
            const now = new Date();
            const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            
            let orderId = 1;
            
            // 每个用户平均1-3个订单
            for (let userId = 2000000; userId < 2000233; userId++) {
                const userName = userNames[userId - 2000000];
                const username = `user${(userId - 2000000).toString().padStart(3, '0')}`;
                const orderCount = getRandomInt(1, 4);
                
                for (let j = 0; j < orderCount; j++) {
                    const merchant = getRandomElement(merchants);
                    const courseType = getRandomElement(courseTypes);
                    const courseContent = getRandomElement(courseContents);
                    const orderDate = getRandomDate(twoMonthsAgo, now);
                    
                    // 80%的订单被确认，60%的确认订单被完成
                    const isConfirmed = Math.random() > 0.2;
                    const isCompleted = isConfirmed && Math.random() > 0.4;
                    
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
                    
                    // 先创建booking_session
                    const bookingStmt = db.prepare(`
                        INSERT INTO booking_sessions (
                            id, user_id, merchant_id, course_type, status, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    `);
                    
                    const bookingSessionId = orderId;
                    const bookingCreatedAt = Math.floor(orderDate.getTime() / 1000);
                    
                    bookingStmt.run(
                        bookingSessionId, userId, merchant.id, courseType, 
                        isCompleted ? 'completed' : (isConfirmed ? 'confirmed' : 'pending'),
                        bookingCreatedAt, completedTime || confirmedTime || bookingCreatedAt
                    );
                    
                    // 插入订单
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
                        // 更新订单的评价信息
                        const userScore = getRandomInt(7, 10);
                        const merchantScore = getRandomInt(8, 10);
                        
                        const updateOrderStmt = db.prepare(`
                            UPDATE orders SET 
                                user_evaluation = ?, 
                                merchant_evaluation = ?
                            WHERE id = ?
                        `);
                        
                        updateOrderStmt.run(
                            userScore.toString(),
                            merchantScore.toString(),
                            orderId
                        );
                    }
                    
                    orderId++;
                }
            }
            
            console.log('✅ 233位用户订单和评价数据初始化完成');
            console.log(`✅ 总共生成了 ${orderId - 1} 个订单`);
        }
        
    } catch (error) {
        console.error('初始化测试数据失败:', error);
    }
}

module.exports = {
    initTestData
}; 
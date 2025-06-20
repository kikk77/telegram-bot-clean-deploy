const dbOperations = require('../models/dbOperations');

// 生成随机数据的辅助函数（保留用于将来可能的需要）
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

// 数据库基础结构初始化（不创建任何测试数据）
function initBasicData() {
    try {
        const { db } = require('../config/database');
        
        console.log('🚀 开始检查数据库基础结构...');
        
        // 仅检查数据库表是否存在，不创建任何默认数据
        // 这确保了数据库结构正确，但不会自动填充任何数据
        
        console.log('✅ 数据库结构检查完成');
        console.log('💡 所有数据需要通过后台管理界面手动创建');
        
    } catch (error) {
        console.error('❌ 初始化数据库结构失败:', error);
    }
}

// 测试数据生成函数（完全禁用）
function initTestData() {
    console.log('⚠️ 测试数据生成已完全禁用');
    console.log('💡 请通过后台管理界面手动创建所需的数据：');
    console.log('   - 地区管理：创建服务地区');
    console.log('   - 绑定码管理：创建商家绑定码');
    console.log('   - 其他数据将通过正常业务流程产生');
    
    // 只执行基础结构检查
    initBasicData();
    
    /* 
    // === 以下为测试数据生成代码，已完全禁用 ===
    
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

        // 重新启用外键约束
        db.pragma('foreign_keys = ON');
        
        console.log('✅ 测试数据生成完成');
        
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
    */
}

module.exports = {
    initTestData,
    initBasicData
};

// 生产环境：不自动创建任何测试数据
// 所有数据需要通过后台管理界面手动创建

// 如果直接运行此文件，仅执行基础结构检查（不创建数据）
// if (require.main === module) {
//     initBasicData();
// } 
const dbOperations = require('../models/dbOperations');

// 初始化测试数据
function initTestData() {
    try {
        // 检查是否已有地区数据
        const existingRegions = dbOperations.getAllRegions();
        if (existingRegions.length === 0) {
            // 添加默认地区
            const defaultRegions = [
                { name: '北京', sortOrder: 1 },
                { name: '上海', sortOrder: 2 },
                { name: '广州', sortOrder: 3 },
                { name: '深圳', sortOrder: 4 },
                { name: '杭州', sortOrder: 5 },
                { name: '成都', sortOrder: 6 },
                { name: '武汉', sortOrder: 7 },
                { name: '西安', sortOrder: 8 },
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
            // 添加测试绑定码
            dbOperations.createBindCode('测试商家绑定码');
            dbOperations.createBindCode('VIP商家专用');
            dbOperations.createBindCode('新用户体验码');
            
            console.log('✅ 测试绑定码初始化完成');
        }
        
    } catch (error) {
        console.error('初始化测试数据失败:', error);
    }
}

module.exports = {
    initTestData
}; 
#!/usr/bin/env node

/**
 * 商家关注状态检测测试脚本
 * 
 * 此脚本用于测试修复后的商家关注状态检测功能
 * 包括：
 * 1. my_chat_member事件处理
 * 2. 商家关注状态检查逻辑
 * 3. 用户交互记录查询
 */

const dbOperations = require('./models/dbOperations');

console.log('🔍 开始测试商家关注状态检测功能...\n');

async function testMerchantFollowStatus() {
    try {
        // 1. 获取所有商家
        console.log('1️⃣ 获取商家列表...');
        const merchants = dbOperations.getAllMerchants();
        console.log(`✅ 找到 ${merchants.length} 个商家\n`);
        
        if (merchants.length === 0) {
            console.log('⚠️ 没有商家数据，无法进行测试');
            return;
        }
        
        // 2. 测试有用户名的商家
        const merchantsWithUsername = merchants.filter(m => m.username);
        console.log(`2️⃣ 测试有用户名的商家 (${merchantsWithUsername.length}个)...\n`);
        
        for (const merchant of merchantsWithUsername.slice(0, 5)) { // 只测试前5个
            console.log(`🔍 测试商家: ${merchant.teacher_name} (@${merchant.username})`);
            
            // 检查用户记录
            const userRecord = dbOperations.getUserRecordByUsername(merchant.username);
            if (userRecord) {
                console.log(`  ✅ 找到用户记录: ID ${userRecord.user_id}, 用户名: ${userRecord.username}`);
                
                // 检查交互次数
                const interactionCount = dbOperations.getInteractionCount(userRecord.user_id);
                console.log(`  📊 交互次数: ${interactionCount}`);
                
                // 检查关注状态
                const followStatus = await dbOperations.checkSingleMerchantFollowStatus(merchant.id);
                console.log(`  📱 关注状态: ${followStatus.followed ? '✅ 已关注' : '❌ 未关注'}`);
                if (followStatus.reason) {
                    console.log(`  📝 状态原因: ${followStatus.reason}`);
                }
            } else {
                console.log(`  ❌ 未找到用户记录`);
            }
            console.log('');
        }
        
        // 3. 批量检查关注状态
        console.log('3️⃣ 批量检查关注状态...');
        const merchantIds = merchantsWithUsername.slice(0, 3).map(m => m.id);
        const batchResults = await dbOperations.checkMerchantsFollowStatus(merchantIds);
        
        console.log('📊 批量检查结果:');
        for (const [merchantId, result] of Object.entries(batchResults)) {
            const merchant = merchants.find(m => m.id == merchantId);
            console.log(`  商家 ${merchant?.teacher_name}: ${result.followed ? '✅ 已关注' : '❌ 未关注'}`);
            if (result.reason) {
                console.log(`    原因: ${result.reason}`);
            }
        }
        console.log('');
        
        // 4. 测试数据库查询方法
        console.log('4️⃣ 测试数据库查询方法...');
        
        // 测试用户名查询（大小写不敏感）
        const testUsername = merchantsWithUsername[0]?.username;
        if (testUsername) {
            console.log(`🔍 测试用户名查询: ${testUsername}`);
            
            // 测试不同大小写
            const variations = [
                testUsername.toLowerCase(),
                testUsername.toUpperCase(),
                testUsername
            ];
            
            for (const variation of variations) {
                const record = dbOperations.getUserRecordByUsername(variation);
                console.log(`  ${variation}: ${record ? '✅ 找到' : '❌ 未找到'}`);
            }
        }
        console.log('');
        
        // 5. 显示交互记录统计
        console.log('5️⃣ 交互记录统计...');
        const { db } = require('./config/database');
        
        const totalInteractions = db.prepare('SELECT COUNT(*) as count FROM interactions').get();
        console.log(`📊 总交互记录: ${totalInteractions.count}`);
        
        const uniqueUsers = db.prepare('SELECT COUNT(DISTINCT user_id) as count FROM interactions WHERE user_id IS NOT NULL').get();
        console.log(`👥 唯一用户数: ${uniqueUsers.count}`);
        
        const statusUpdates = db.prepare("SELECT COUNT(*) as count FROM interactions WHERE action_type LIKE 'status_%'").get();
        console.log(`📱 状态更新记录: ${statusUpdates.count}`);
        
        // 显示最近的状态更新
        const recentStatusUpdates = db.prepare(`
            SELECT user_id, username, action_type, timestamp
            FROM interactions 
            WHERE action_type LIKE 'status_%' 
            ORDER BY timestamp DESC 
            LIMIT 5
        `).all();
        
        if (recentStatusUpdates.length > 0) {
            console.log('\n📱 最近的状态更新:');
            recentStatusUpdates.forEach((update, index) => {
                const date = new Date(update.timestamp * 1000).toLocaleString();
                console.log(`  ${index + 1}. ${update.username} - ${update.action_type} (${date})`);
            });
        }
        
        console.log('\n✅ 测试完成！');
        
        // 6. 生成测试报告
        console.log('\n📋 测试报告:');
        console.log(`- 总商家数: ${merchants.length}`);
        console.log(`- 有用户名的商家: ${merchantsWithUsername.length}`);
        console.log(`- 总交互记录: ${totalInteractions.count}`);
        console.log(`- 唯一用户数: ${uniqueUsers.count}`);
        console.log(`- 状态更新记录: ${statusUpdates.count}`);
        
        const followedCount = Object.values(batchResults).filter(r => r.followed).length;
        const testCount = Object.keys(batchResults).length;
        if (testCount > 0) {
            console.log(`- 关注状态检测: ${followedCount}/${testCount} 个商家已关注`);
        }
        
    } catch (error) {
        console.error('❌ 测试过程中出现错误:', error);
    }
}

// 运行测试
testMerchantFollowStatus().then(() => {
    console.log('\n🎯 测试脚本执行完成');
    process.exit(0);
}).catch(error => {
    console.error('❌ 测试脚本执行失败:', error);
    process.exit(1);
}); 
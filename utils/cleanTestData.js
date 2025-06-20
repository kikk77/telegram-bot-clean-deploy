const { db } = require('../config/database');

// 清理所有测试数据
function cleanTestData() {
    console.log('🧹 开始清理测试数据...');
    
    try {
        // 临时禁用外键约束
        db.pragma('foreign_keys = OFF');
        
        // 开始事务
        const transaction = db.transaction(() => {
            // 1. 清理评价会话
            const deleteEvalSessions = db.prepare('DELETE FROM evaluation_sessions').run();
            console.log(`删除评价会话: ${deleteEvalSessions.changes} 条`);
            
            // 2. 清理评价记录
            const deleteEvaluations = db.prepare('DELETE FROM evaluations').run();
            console.log(`删除评价记录: ${deleteEvaluations.changes} 条`);
            
            // 3. 清理订单记录
            const deleteOrders = db.prepare('DELETE FROM orders').run();
            console.log(`删除订单记录: ${deleteOrders.changes} 条`);
            
            // 4. 清理预约会话
            const deleteBookingSessions = db.prepare('DELETE FROM booking_sessions').run();
            console.log(`删除预约会话: ${deleteBookingSessions.changes} 条`);
            
            // 5. 清理交互记录
            const deleteInteractions = db.prepare('DELETE FROM interactions').run();
            console.log(`删除交互记录: ${deleteInteractions.changes} 条`);
            
            // 6. 清理按钮记录
            const deleteButtons = db.prepare('DELETE FROM buttons').run();
            console.log(`删除按钮记录: ${deleteButtons.changes} 条`);
            
            // 7. 清理商家记录
            const deleteMerchants = db.prepare('DELETE FROM merchants').run();
            console.log(`删除商家记录: ${deleteMerchants.changes} 条`);
            
            // 8. 清理绑定码记录
            const deleteBindCodes = db.prepare('DELETE FROM bind_codes').run();
            console.log(`删除绑定码记录: ${deleteBindCodes.changes} 条`);
            
            // 9. 清理地区记录
            const deleteRegions = db.prepare('DELETE FROM regions').run();
            console.log(`删除地区记录: ${deleteRegions.changes} 条`);
            
            // 10. 清理消息模板（如果有测试模板）
            const deleteTemplates = db.prepare('DELETE FROM message_templates').run();
            console.log(`删除消息模板: ${deleteTemplates.changes} 条`);
            
            // 11. 清理触发词
            const deleteTriggers = db.prepare('DELETE FROM trigger_words').run();
            console.log(`删除触发词: ${deleteTriggers.changes} 条`);
            
            // 12. 清理定时任务
            const deleteTasks = db.prepare('DELETE FROM scheduled_tasks').run();
            console.log(`删除定时任务: ${deleteTasks.changes} 条`);
            
            // 重置自增ID（可选）
            db.prepare('DELETE FROM sqlite_sequence').run();
            console.log('✅ 重置自增ID序列');
        });
        
        // 执行事务
        transaction();
        
        // 重新启用外键约束
        db.pragma('foreign_keys = ON');
        
        console.log('✅ 测试数据清理完成！');
        console.log('💡 数据库已重置为空白状态，请通过后台管理界面创建所需数据');
        
    } catch (error) {
        console.error('❌ 清理测试数据失败:', error);
        // 确保重新启用外键约束
        try {
            db.pragma('foreign_keys = ON');
        } catch (e) {
            console.error('恢复外键约束失败:', e);
        }
    }
}

// 验证清理结果
function verifyCleanup() {
    console.log('\n📊 验证清理结果:');
    
    const tables = [
        'merchants', 'bind_codes', 'regions', 'buttons', 
        'message_templates', 'trigger_words', 'scheduled_tasks',
        'orders', 'booking_sessions', 'evaluations', 'evaluation_sessions',
        'interactions'
    ];
    
    tables.forEach(table => {
        try {
            const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
            console.log(`${table}: ${count.count} 条记录`);
        } catch (error) {
            console.log(`${table}: 表不存在或查询失败`);
        }
    });
}

module.exports = {
    cleanTestData,
    verifyCleanup
};

// 如果直接运行此文件，执行清理操作
if (require.main === module) {
    console.log('⚠️  即将清理所有测试数据，此操作不可撤销！');
    console.log('⚠️  请确保你真的要清理所有数据');
    console.log('⚠️  按 Ctrl+C 取消，或等待 5 秒后自动执行...');
    
    setTimeout(() => {
        cleanTestData();
        verifyCleanup();
    }, 5000);
} 
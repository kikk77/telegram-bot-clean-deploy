const cron = require('node-cron');
const dbOperations = require('../models/dbOperations');
const { sendMessageTemplate } = require('./botService');

// 定时任务调度
function initScheduler() {
    // 每分钟检查一次定时任务
    cron.schedule('* * * * *', () => {
        const activeTasks = dbOperations.getActiveScheduledTasks();
        const now = new Date();

        for (const task of activeTasks) {
            try {
                let shouldRun = false;

                if (task.schedule_type === 'daily') {
                    const [hour, minute] = task.schedule_time.split(':');
                    if (now.getHours() == hour && now.getMinutes() == minute) {
                        shouldRun = true;
                    }
                } else if (task.schedule_type === 'weekly') {
                    const [dayOfWeek, hour, minute] = task.schedule_time.split(':');
                    if (now.getDay() == dayOfWeek && now.getHours() == hour && now.getMinutes() == minute) {
                        shouldRun = true;
                    }
                } else if (task.schedule_type === 'cron') {
                    // 简单的cron解析，这里可以扩展
                    shouldRun = cron.validate(task.schedule_time);
                }

                if (shouldRun) {
                    // 检查是否已经在这一分钟内执行过
                    const lastRun = task.last_run || 0;
                    const currentMinute = Math.floor(now.getTime() / 60000);
                    const lastRunMinute = Math.floor(lastRun * 1000 / 60000);

                    if (currentMinute !== lastRunMinute) {
                        executeScheduledTask(task);
                    }
                }
            } catch (error) {
                console.error(`定时任务 ${task.id} 执行失败:`, error);
            }
        }
    });

    console.log('✅ 定时任务调度器启动完成');
}

// 执行定时任务
async function executeScheduledTask(task) {
    try {
        const { getCacheData } = require('./botService');
        const { messageTemplates } = getCacheData();
        
        const template = messageTemplates.find(t => t.id === task.template_id);
        if (template) {
            await sendMessageTemplate(task.chat_id, template);
            dbOperations.updateTaskLastRun(task.id);
            dbOperations.logInteraction(
                0, // 系统用户
                'system',
                'System',
                'Bot',
                null,
                template.id,
                'scheduled',
                task.chat_id
            );
            console.log(`定时任务 "${task.name}" 执行完成`);
        }
    } catch (error) {
        console.error(`执行定时任务失败:`, error);
    }
}

module.exports = {
    initScheduler,
    executeScheduledTask
}; 
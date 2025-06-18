const db = require('./database');

class SchedulerManager {
    constructor() {
        this.activeTimers = new Map();
        this.botInstance = null;
    }

    setBotInstance(bot) {
        this.botInstance = bot;
        this.initScheduledTasks();
    }

    initScheduledTasks() {
        // 清除所有现有定时器
        this.clearAllTimers();
        
        // 重新设置所有定时任务
        const scheduleTasks = db.getTasksByType('schedule');
        
        for (const task of scheduleTasks) {
            this.scheduleTask(task);
        }
        
        console.log(`已设置 ${scheduleTasks.length} 个定时任务`);
    }

    scheduleTask(task) {
        try {
            const scheduleTime = task.schedule_time;
            
            if (this.isCronExpression(scheduleTime)) {
                this.scheduleCronTask(task, scheduleTime);
            } else if (this.isTimeExpression(scheduleTime)) {
                this.scheduleTimeTask(task, scheduleTime);
            } else if (this.isIntervalExpression(scheduleTime)) {
                this.scheduleIntervalTask(task, scheduleTime);
            } else {
                console.error('无效的定时表达式:', scheduleTime);
            }
        } catch (error) {
            console.error('设置定时任务失败:', error);
        }
    }

    isCronExpression(expression) {
        // 简单检查是否为cron表达式格式 (5个空格分隔的字段)
        return expression && expression.split(' ').length === 5;
    }

    isTimeExpression(expression) {
        // 检查是否为时间格式 HH:MM
        return /^\d{2}:\d{2}$/.test(expression);
    }

    isIntervalExpression(expression) {
        // 检查是否为间隔表达式 如: "每30分钟", "每2小时"
        return /^每\d+(分钟|小时|秒)$/.test(expression);
    }

    scheduleCronTask(task, cronExpression) {
        // 简化的cron解析，只支持基本格式
        const [minute, hour, day, month, weekday] = cronExpression.split(' ');
        
        const now = new Date();
        const nextRun = this.calculateNextCronRun(minute, hour, day, month, weekday);
        
        if (nextRun) {
            const delay = nextRun.getTime() - now.getTime();
            if (delay > 0) {
                const timerId = setTimeout(() => {
                    this.executeScheduledTask(task);
                    // 重新安排下一次执行
                    this.scheduleTask(task);
                }, delay);
                
                this.activeTimers.set(task.id, timerId);
                console.log(`定时任务 ${task.id} 将在 ${nextRun.toLocaleString()} 执行`);
            }
        }
    }

    scheduleTimeTask(task, timeExpression) {
        const [hour, minute] = timeExpression.split(':').map(Number);
        const now = new Date();
        const nextRun = new Date();
        
        nextRun.setHours(hour, minute, 0, 0);
        
        // 如果今天的时间已过，安排到明天
        if (nextRun <= now) {
            nextRun.setDate(nextRun.getDate() + 1);
        }
        
        const delay = nextRun.getTime() - now.getTime();
        
        const timerId = setTimeout(() => {
            this.executeScheduledTask(task);
            // 重新安排下一次执行（明天同一时间）
            this.scheduleTask(task);
        }, delay);
        
        this.activeTimers.set(task.id, timerId);
        console.log(`定时任务 ${task.id} 将在 ${nextRun.toLocaleString()} 执行`);
    }

    scheduleIntervalTask(task, intervalExpression) {
        const match = intervalExpression.match(/^每(\d+)(分钟|小时|秒)$/);
        if (!match) return;
        
        const [, number, unit] = match;
        const num = parseInt(number);
        
        let intervalMs;
        switch (unit) {
            case '秒':
                intervalMs = num * 1000;
                break;
            case '分钟':
                intervalMs = num * 60 * 1000;
                break;
            case '小时':
                intervalMs = num * 60 * 60 * 1000;
                break;
            default:
                return;
        }
        
        const intervalId = setInterval(() => {
            this.executeScheduledTask(task);
        }, intervalMs);
        
        this.activeTimers.set(task.id, intervalId);
        console.log(`定时任务 ${task.id} 将每${intervalExpression.slice(1)}执行一次`);
    }

    calculateNextCronRun(minute, hour, day, month, weekday) {
        // 简化的cron计算，只处理基本情况
        const now = new Date();
        const next = new Date(now);
        
        // 解析分钟
        const targetMinute = minute === '*' ? now.getMinutes() : parseInt(minute);
        // 解析小时
        const targetHour = hour === '*' ? now.getHours() : parseInt(hour);
        
        next.setSeconds(0, 0);
        next.setMinutes(targetMinute);
        next.setHours(targetHour);
        
        // 如果设定时间已过，移到下一天
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }
        
        return next;
    }

    executeScheduledTask(task) {
        try {
            if (!this.botInstance) {
                console.error('Bot实例未设置');
                return;
            }
            
            const targetChat = task.target_chat;
            const content = task.content;
            const buttons = JSON.parse(task.buttons || '[]');
            
            this.botInstance.sendScheduledMessage(targetChat, content, buttons)
                .then(() => {
                    console.log(`定时任务 ${task.id} 执行成功`);
                    
                    // 记录执行日志
                    db.logInteraction('system', 'scheduler', 'scheduled_message', {
                        task_id: task.id,
                        target_chat: targetChat,
                        content: content
                    });
                })
                .catch(error => {
                    console.error(`定时任务 ${task.id} 执行失败:`, error);
                });
                
        } catch (error) {
            console.error('执行定时任务失败:', error);
        }
    }

    addScheduledTask(merchantId, type, content, scheduleTime, triggerWords, targetChat, buttons) {
        const task = db.addAutoTask(merchantId, type, content, scheduleTime, triggerWords, targetChat, buttons);
        
        if (task && task.type === 'schedule') {
            this.scheduleTask(task);
        }
        
        return task;
    }

    removeScheduledTask(taskId) {
        // 清除定时器
        if (this.activeTimers.has(taskId)) {
            const timerId = this.activeTimers.get(taskId);
            if (typeof timerId === 'number') {
                clearTimeout(timerId);
            } else {
                clearInterval(timerId);
            }
            this.activeTimers.delete(taskId);
        }
        
        // 从数据库中删除（这里简化处理）
        if (db.cache.autoTasks.has(taskId)) {
            db.cache.autoTasks.delete(taskId);
        }
        
        console.log(`定时任务 ${taskId} 已删除`);
    }

    clearAllTimers() {
        for (const [taskId, timerId] of this.activeTimers) {
            if (typeof timerId === 'number') {
                clearTimeout(timerId);
            } else {
                clearInterval(timerId);
            }
        }
        this.activeTimers.clear();
        console.log('所有定时器已清除');
    }

    getActiveTasksStatus() {
        const activeTasks = [];
        
        for (const [taskId, timerId] of this.activeTimers) {
            const task = db.cache.autoTasks.get(taskId);
            if (task) {
                activeTasks.push({
                    id: taskId,
                    type: task.type,
                    schedule_time: task.schedule_time,
                    content: task.content.substring(0, 50) + '...',
                    target_chat: task.target_chat,
                    is_active: true
                });
            }
        }
        
        return activeTasks;
    }

    // 重新加载所有定时任务
    reloadTasks() {
        this.initScheduledTasks();
    }
}

module.exports = new SchedulerManager(); 
const express = require('express');
const path = require('path');
const db = require('./database');
const scheduler = require('./scheduler');

class AdminManager {
    constructor() {
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static(path.join(__dirname, '../public')));
    }

    setupRoutes() {
        // 管理后台首页
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/admin.html'));
        });

        // API路由
        this.app.get('/api/stats', this.getStats.bind(this));
        this.app.get('/api/merchants', this.getMerchants.bind(this));
        this.app.get('/api/tasks', this.getTasks.bind(this));
        this.app.get('/api/interactions', this.getInteractions.bind(this));
        
        this.app.post('/api/merchants', this.createMerchant.bind(this));
        this.app.post('/api/buttons', this.createButton.bind(this));
        this.app.post('/api/tasks', this.createTask.bind(this));
        
        this.app.delete('/api/tasks/:id', this.deleteTask.bind(this));
        this.app.put('/api/tasks/:id', this.updateTask.bind(this));
    }

    // 获取统计数据
    getStats(req, res) {
        try {
            const stats = {
                merchants: db.cache.merchants.size,
                buttons: Array.from(db.cache.buttons.values()).reduce((total, buttons) => total + buttons.length, 0),
                activeTasks: db.cache.autoTasks.size,
                interactions: db.getInteractionStats(),
                activeSchedules: scheduler.getActiveTasksStatus().length
            };
            
            res.json({ success: true, data: stats });
        } catch (error) {
            console.error('获取统计数据失败:', error);
            res.status(500).json({ success: false, message: '获取统计数据失败' });
        }
    }

    // 获取商家列表
    getMerchants(req, res) {
        try {
            const merchants = Array.from(db.cache.merchants.values()).map(merchant => ({
                id: merchant.id,
                name: merchant.name,
                telegram_id: merchant.telegram_id,
                bind_code: merchant.bind_code,
                created_at: merchant.created_at,
                buttons: db.getButtonsByMerchantId(merchant.id)
            }));
            
            res.json({ success: true, data: merchants });
        } catch (error) {
            console.error('获取商家列表失败:', error);
            res.status(500).json({ success: false, message: '获取商家列表失败' });
        }
    }

    // 获取任务列表
    getTasks(req, res) {
        try {
            const tasks = Array.from(db.cache.autoTasks.values()).map(task => ({
                ...task,
                trigger_words: JSON.parse(task.trigger_words || '[]'),
                buttons: JSON.parse(task.buttons || '[]'),
                merchant_name: db.cache.merchants.get(task.merchant_id)?.name || '未知商家'
            }));
            
            const activeTasks = scheduler.getActiveTasksStatus();
            
            res.json({ success: true, data: { tasks, activeTasks } });
        } catch (error) {
            console.error('获取任务列表失败:', error);
            res.status(500).json({ success: false, message: '获取任务列表失败' });
        }
    }

    // 获取交互记录
    getInteractions(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const start = (page - 1) * limit;
            
            const recentInteractions = db.cache.interactions
                .slice(-1000) // 取最近1000条
                .reverse() // 最新的在前
                .slice(start, start + limit);
            
            res.json({ 
                success: true, 
                data: {
                    interactions: recentInteractions,
                    total: db.cache.interactions.length,
                    page,
                    limit
                }
            });
        } catch (error) {
            console.error('获取交互记录失败:', error);
            res.status(500).json({ success: false, message: '获取交互记录失败' });
        }
    }

    // 创建商家
    createMerchant(req, res) {
        try {
            const { name, telegram_id } = req.body;
            
            if (!name) {
                return res.status(400).json({ success: false, message: '商家名称不能为空' });
            }
            
            // 生成绑定码
            const bindCode = this.generateBindCode();
            
            const merchant = db.addMerchant(telegram_id || '', name, bindCode);
            
            if (merchant) {
                res.json({ success: true, data: merchant });
            } else {
                res.status(400).json({ success: false, message: '创建商家失败' });
            }
        } catch (error) {
            console.error('创建商家失败:', error);
            res.status(500).json({ success: false, message: '创建商家失败' });
        }
    }

    // 创建按钮
    createButton(req, res) {
        try {
            const { merchant_id, text, url, private_msg } = req.body;
            
            if (!merchant_id || !text) {
                return res.status(400).json({ success: false, message: '商家ID和按钮文本不能为空' });
            }
            
            const button = db.addButton(merchant_id, text, url, private_msg);
            
            if (button) {
                res.json({ success: true, data: button });
            } else {
                res.status(400).json({ success: false, message: '创建按钮失败' });
            }
        } catch (error) {
            console.error('创建按钮失败:', error);
            res.status(500).json({ success: false, message: '创建按钮失败' });
        }
    }

    // 创建任务
    createTask(req, res) {
        try {
            const { merchant_id, type, content, schedule_time, trigger_words, target_chat, buttons } = req.body;
            
            if (!merchant_id || !type || !content) {
                return res.status(400).json({ success: false, message: '商家ID、类型和内容不能为空' });
            }
            
            if (type === 'schedule' && !schedule_time) {
                return res.status(400).json({ success: false, message: '定时任务必须设置执行时间' });
            }
            
            if (type === 'trigger' && (!trigger_words || trigger_words.length === 0)) {
                return res.status(400).json({ success: false, message: '触发任务必须设置触发词' });
            }
            
            const task = scheduler.addScheduledTask(
                merchant_id, type, content, schedule_time, 
                trigger_words || [], target_chat, buttons || []
            );
            
            if (task) {
                res.json({ success: true, data: task });
            } else {
                res.status(400).json({ success: false, message: '创建任务失败' });
            }
        } catch (error) {
            console.error('创建任务失败:', error);
            res.status(500).json({ success: false, message: '创建任务失败' });
        }
    }

    // 删除任务
    deleteTask(req, res) {
        try {
            const taskId = parseInt(req.params.id);
            
            scheduler.removeScheduledTask(taskId);
            
            res.json({ success: true, message: '任务删除成功' });
        } catch (error) {
            console.error('删除任务失败:', error);
            res.status(500).json({ success: false, message: '删除任务失败' });
        }
    }

    // 更新任务
    updateTask(req, res) {
        try {
            const taskId = parseInt(req.params.id);
            const updates = req.body;
            
            // 简化处理：先删除旧任务，再创建新任务
            scheduler.removeScheduledTask(taskId);
            
            const newTask = scheduler.addScheduledTask(
                updates.merchant_id, 
                updates.type, 
                updates.content, 
                updates.schedule_time,
                updates.trigger_words || [], 
                updates.target_chat, 
                updates.buttons || []
            );
            
            if (newTask) {
                res.json({ success: true, data: newTask });
            } else {
                res.status(400).json({ success: false, message: '更新任务失败' });
            }
        } catch (error) {
            console.error('更新任务失败:', error);
            res.status(500).json({ success: false, message: '更新任务失败' });
        }
    }

    // 生成绑定码
    generateBindCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    start(port = 3000) {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(port, () => {
                    console.log(`管理后台启动成功: http://localhost:${port}`);
                    resolve(this.server);
                });
            } catch (error) {
                console.error('管理后台启动失败:', error);
                reject(error);
            }
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
            console.log('管理后台已停止');
        }
    }
}

module.exports = new AdminManager(); 
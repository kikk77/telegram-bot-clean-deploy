const dbOperations = require('../models/dbOperations');
const cron = require('node-cron');

class StatsService {
    constructor() {
        // 内存缓存
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存
        this.isInitialized = false;
        
        // 延迟初始化，等待数据库准备就绪
        this.initializeWhenReady();
    }

    // 等待数据库准备就绪后初始化
    async initializeWhenReady() {
        // 检查数据库是否可用
        const maxRetries = 10;
        let retries = 0;
        
        const checkDatabase = () => {
            try {
                if (dbOperations && dbOperations.db) {
                    console.log('数据库已准备就绪，初始化统计服务...');
                    this.createDatabaseViews();
                    this.initScheduledTasks();
                    this.isInitialized = true;
                    return true;
                }
            } catch (error) {
                console.log('数据库尚未准备就绪，等待中...');
            }
            
            retries++;
            if (retries < maxRetries) {
                setTimeout(checkDatabase, 1000); // 1秒后重试
            } else {
                console.warn('数据库初始化超时，统计服务将在有限模式下运行');
                this.isInitialized = false;
            }
            return false;
        };
        
        checkDatabase();
    }

    // 创建数据库视图简化复杂查询
    createDatabaseViews() {
        try {
            // 检查数据库是否可用
            if (!dbOperations || !dbOperations.db) {
                throw new Error('数据库未初始化');
            }
            // 订单统计视图
            dbOperations.db.exec(`
                CREATE VIEW IF NOT EXISTS v_order_stats AS
                SELECT 
                    date(created_at, 'unixepoch') as order_date,
                    region_id,
                    price_range,
                    merchant_id,
                    status,
                    COUNT(*) as order_count,
                    AVG(actual_price) as avg_price,
                    strftime('%Y', created_at, 'unixepoch') as year,
                    strftime('%m', created_at, 'unixepoch') as month,
                    strftime('%W', created_at, 'unixepoch') as week
                FROM orders 
                GROUP BY order_date, region_id, price_range, merchant_id, status
            `);

            // 评价统计视图
            dbOperations.db.exec(`
                CREATE VIEW IF NOT EXISTS v_evaluation_stats AS
                SELECT 
                    e.evaluator_type,
                    e.target_id,
                    COUNT(*) as total_evaluations,
                    AVG(e.overall_score) as avg_score,
                    date(e.created_at, 'unixepoch') as eval_date,
                    o.region_id,
                    o.price_range
                FROM evaluations e
                LEFT JOIN orders o ON e.order_id = o.id
                WHERE e.status = 'completed'
                GROUP BY e.evaluator_type, e.target_id, eval_date, o.region_id, o.price_range
            `);

            // 商家排名视图
            dbOperations.db.exec(`
                CREATE VIEW IF NOT EXISTS v_merchant_rankings AS
                SELECT 
                    m.id as merchant_id,
                    m.teacher_name,
                    m.region_id,
                    r.name as region_name,
                    mr.avg_overall_score,
                    mr.total_evaluations,
                    mr.avg_length_score,
                    mr.avg_hardness_score,
                    mr.avg_duration_score,
                    mr.avg_technique_score,
                    CASE 
                        WHEN m.price1 IS NOT NULL AND m.price2 IS NOT NULL THEN 
                            CASE 
                                WHEN (m.price1 + m.price2) / 2 <= 500 THEN '0-500'
                                WHEN (m.price1 + m.price2) / 2 <= 1000 THEN '500-1000'
                                WHEN (m.price1 + m.price2) / 2 <= 2000 THEN '1000-2000'
                                ELSE '2000+'
                            END
                        WHEN m.price1 IS NOT NULL THEN
                            CASE 
                                WHEN m.price1 <= 500 THEN '0-500'
                                WHEN m.price1 <= 1000 THEN '500-1000'
                                WHEN m.price1 <= 2000 THEN '1000-2000'
                                ELSE '2000+'
                            END
                        ELSE '未设置'
                    END as price_range
                FROM merchants m
                LEFT JOIN merchant_ratings mr ON m.id = mr.merchant_id
                LEFT JOIN regions r ON m.region_id = r.id
                WHERE mr.total_evaluations > 0
            `);

            console.log('数据库视图创建完成');
        } catch (error) {
            console.error('创建数据库视图失败:', error);
        }
    }

    // 初始化定时任务
    initScheduledTasks() {
        // 每5分钟更新实时统计
        cron.schedule('*/5 * * * *', () => {
            this.updateRealtimeStats();
        });

        // 每小时更新小时统计
        cron.schedule('0 * * * *', () => {
            this.updateHourlyStats();
        });

        // 每天凌晨2点更新日统计
        cron.schedule('0 2 * * *', () => {
            this.updateDailyStats();
        });

        // 每周一凌晨3点更新周统计
        cron.schedule('0 3 * * 1', () => {
            this.updateWeeklyStats();
        });

        // 每月1号凌晨4点更新月统计
        cron.schedule('0 4 1 * *', () => {
            this.updateMonthlyStats();
        });

        console.log('定时任务初始化完成');
    }

    // 获取缓存键
    getCacheKey(type, filters = {}) {
        const key = `${type}_${JSON.stringify(filters)}`;
        return key;
    }

    // 设置缓存
    setCache(key, data, timeout = null) {
        const expireTime = Date.now() + (timeout || this.cacheTimeout);
        this.cache.set(key, {
            data,
            expireTime
        });
    }

    // 获取缓存
    getCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        if (Date.now() > cached.expireTime) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data;
    }

    // 清除缓存
    clearCache(pattern = null) {
        if (pattern) {
            for (const key of this.cache.keys()) {
                if (key.includes(pattern)) {
                    this.cache.delete(key);
                }
            }
        } else {
            this.cache.clear();
        }
    }

    // 获取优化后的统计数据
    async getOptimizedStats(filters = {}) {
        const cacheKey = this.getCacheKey('stats', filters);
        
        // 尝试从缓存获取
        let stats = this.getCache(cacheKey);
        if (stats) {
            return { ...stats, fromCache: true };
        }

        try {
            // 从预计算表获取数据
            stats = await this.getPrecomputedStats(filters);
            
            // 如果没有预计算数据，实时计算
            if (!stats || stats.length === 0) {
                stats = await this.calculateRealtimeStats(filters);
            }

            // 缓存结果
            this.setCache(cacheKey, stats);
            
            return { ...stats, fromCache: false };
            
        } catch (error) {
            console.error('获取优化统计失败:', error);
            return { error: error.message };
        }
    }

    // 从预计算表获取统计
    async getPrecomputedStats(filters) {
        try {
            let whereConditions = ['1=1'];
            let params = [];
            
            if (filters.dateFrom) {
                whereConditions.push('stat_date >= ?');
                params.push(filters.dateFrom);
            }
            if (filters.dateTo) {
                whereConditions.push('stat_date <= ?');
                params.push(filters.dateTo);
            }
            if (filters.regionId) {
                whereConditions.push('(region_id = ? OR region_id IS NULL)');
                params.push(filters.regionId);
            }
            if (filters.priceRange) {
                whereConditions.push('(price_range = ? OR price_range IS NULL)');
                params.push(filters.priceRange);
            }
            if (filters.merchantId) {
                whereConditions.push('(merchant_id = ? OR merchant_id IS NULL)');
                params.push(filters.merchantId);
            }

            const statType = filters.statType || 'daily';
            whereConditions.push('stat_type = ?');
            params.push(statType);

            const whereClause = whereConditions.join(' AND ');

            return dbOperations.db.prepare(`
                SELECT 
                    stat_date,
                    SUM(total_orders) as total_orders,
                    SUM(confirmed_orders) as confirmed_orders,
                    SUM(completed_orders) as completed_orders,
                    SUM(cancelled_orders) as cancelled_orders,
                    AVG(avg_user_score) as avg_user_score,
                    AVG(avg_merchant_score) as avg_merchant_score
                FROM order_stats 
                WHERE ${whereClause}
                GROUP BY stat_date
                ORDER BY stat_date DESC
                LIMIT 30
            `).all(...params);

        } catch (error) {
            console.error('获取预计算统计失败:', error);
            return [];
        }
    }

    // 实时计算统计（备用方案）
    async calculateRealtimeStats(filters) {
        try {
            let whereConditions = ['1=1'];
            let params = [];
            
            if (filters.dateFrom) {
                whereConditions.push('date(created_at, "unixepoch") >= ?');
                params.push(filters.dateFrom);
            }
            if (filters.dateTo) {
                whereConditions.push('date(created_at, "unixepoch") <= ?');
                params.push(filters.dateTo);
            }
            if (filters.regionId) {
                whereConditions.push('region_id = ?');
                params.push(filters.regionId);
            }
            if (filters.priceRange) {
                whereConditions.push('price_range = ?');
                params.push(filters.priceRange);
            }
            if (filters.merchantId) {
                whereConditions.push('merchant_id = ?');
                params.push(filters.merchantId);
            }

            const whereClause = whereConditions.join(' AND ');

            return dbOperations.db.prepare(`
                SELECT 
                    date(created_at, 'unixepoch') as stat_date,
                    COUNT(*) as total_orders,
                    SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_orders,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
                    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
                    AVG(actual_price) as avg_price
                FROM orders 
                WHERE ${whereClause}
                GROUP BY date(created_at, 'unixepoch')
                ORDER BY stat_date DESC
                LIMIT 30
            `).all(...params);

        } catch (error) {
            console.error('实时计算统计失败:', error);
            return [];
        }
    }

    // 更新实时统计（5分钟级别）
    updateRealtimeStats() {
        try {
            const now = new Date();
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
            
            // 清除相关缓存
            this.clearCache('stats');
            this.clearCache('chart');
            
            console.log('实时统计更新完成');
        } catch (error) {
            console.error('更新实时统计失败:', error);
        }
    }

    // 更新小时统计
    updateHourlyStats() {
        try {
            const currentHour = new Date();
            currentHour.setMinutes(0, 0, 0);
            
            const hourStart = Math.floor(currentHour.getTime() / 1000);
            const hourEnd = hourStart + 3600;

            this.updateStatsForPeriod('hourly', hourStart, hourEnd);
            console.log('小时统计更新完成');
        } catch (error) {
            console.error('更新小时统计失败:', error);
        }
    }

    // 更新日统计
    updateDailyStats() {
        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);
            
            const dayStart = Math.floor(yesterday.getTime() / 1000);
            const dayEnd = dayStart + 24 * 3600;

            this.updateStatsForPeriod('daily', dayStart, dayEnd);
            console.log('日统计更新完成');
        } catch (error) {
            console.error('更新日统计失败:', error);
        }
    }

    // 更新周统计
    updateWeeklyStats() {
        try {
            const lastWeek = new Date();
            lastWeek.setDate(lastWeek.getDate() - 7);
            const weekStart = new Date(lastWeek);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            weekStart.setHours(0, 0, 0, 0);
            
            const weekStartTime = Math.floor(weekStart.getTime() / 1000);
            const weekEndTime = weekStartTime + 7 * 24 * 3600;

            this.updateStatsForPeriod('weekly', weekStartTime, weekEndTime);
            console.log('周统计更新完成');
        } catch (error) {
            console.error('更新周统计失败:', error);
        }
    }

    // 更新月统计
    updateMonthlyStats() {
        try {
            const lastMonth = new Date();
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            lastMonth.setDate(1);
            lastMonth.setHours(0, 0, 0, 0);
            
            const monthStart = Math.floor(lastMonth.getTime() / 1000);
            const nextMonth = new Date(lastMonth);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            const monthEnd = Math.floor(nextMonth.getTime() / 1000);

            this.updateStatsForPeriod('monthly', monthStart, monthEnd);
            console.log('月统计更新完成');
        } catch (error) {
            console.error('更新月统计失败:', error);
        }
    }

    // 更新指定时期的统计
    updateStatsForPeriod(statType, startTime, endTime) {
        try {
            const statDate = new Date(startTime * 1000).toISOString().split('T')[0];
            
            // 聚合订单统计
            const orderStats = dbOperations.db.prepare(`
                SELECT 
                    region_id, price_range, merchant_id,
                    COUNT(*) as total_orders,
                    SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_orders,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
                    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders
                FROM orders 
                WHERE created_at >= ? AND created_at < ?
                GROUP BY region_id, price_range, merchant_id
            `).all(startTime, endTime);

            // 聚合评价统计
            const evalStats = dbOperations.db.prepare(`
                SELECT 
                    AVG(CASE WHEN e.evaluator_type = 'user' THEN e.overall_score END) as avg_user_score,
                    AVG(CASE WHEN e.evaluator_type = 'merchant' THEN e.overall_score END) as avg_merchant_score,
                    COUNT(*) as total_evaluations
                FROM evaluations e
                JOIN orders o ON e.order_id = o.id
                WHERE e.created_at >= ? AND e.created_at < ? AND e.status = 'completed'
            `).get(startTime, endTime);

            // 插入或更新统计数据
            orderStats.forEach(stat => {
                dbOperations.db.prepare(`
                    INSERT OR REPLACE INTO order_stats (
                        stat_date, stat_type, region_id, price_range, merchant_id,
                        total_orders, confirmed_orders, completed_orders, cancelled_orders,
                        avg_user_score, avg_merchant_score, total_evaluations
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    statDate, statType, stat.region_id, stat.price_range, stat.merchant_id,
                    stat.total_orders, stat.confirmed_orders, stat.completed_orders, stat.cancelled_orders,
                    evalStats.avg_user_score || 0, evalStats.avg_merchant_score || 0, evalStats.total_evaluations || 0
                );
            });

        } catch (error) {
            console.error(`更新${statType}统计失败:`, error);
        }
    }

    // 获取热门查询的缓存数据
    async getHotQueries() {
        const cacheKey = 'hot_queries';
        let hotQueries = this.getCache(cacheKey);
        
        if (!hotQueries) {
            hotQueries = {
                todayStats: await this.getOptimizedStats({ 
                    dateFrom: new Date().toISOString().split('T')[0],
                    statType: 'daily' 
                }),
                weekStats: await this.getOptimizedStats({ 
                    dateFrom: this.getWeekStart(),
                    statType: 'weekly' 
                }),
                monthStats: await this.getOptimizedStats({ 
                    dateFrom: this.getMonthStart(),
                    statType: 'monthly' 
                }),
                topRegions: await this.getTopRegions(),
                topMerchants: await this.getTopMerchants()
            };
            
            // 缓存热门查询30分钟
            this.setCache(cacheKey, hotQueries, 30 * 60 * 1000);
        }
        
        return hotQueries;
    }

    // 获取周开始日期
    getWeekStart() {
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        return weekStart.toISOString().split('T')[0];
    }

    // 获取月开始日期
    getMonthStart() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    }

    // 获取热门地区
    async getTopRegions() {
        return dbOperations.db.prepare(`
            SELECT region_name, SUM(order_count) as total_orders
            FROM v_order_stats v
            LEFT JOIN regions r ON v.region_id = r.id
            WHERE order_date >= date('now', '-30 days')
            GROUP BY region_id, region_name
            ORDER BY total_orders DESC
            LIMIT 5
        `).all();
    }

    // 获取热门商家
    async getTopMerchants() {
        return dbOperations.db.prepare(`
            SELECT teacher_name, avg_overall_score, total_evaluations
            FROM v_merchant_rankings
            ORDER BY avg_overall_score DESC, total_evaluations DESC
            LIMIT 5
        `).all();
    }

    // 清理过期缓存
    cleanupExpiredCache() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now > value.expireTime) {
                this.cache.delete(key);
            }
        }
    }

    // 获取缓存统计信息
    getCacheStats() {
        const now = Date.now();
        let activeCount = 0;
        let expiredCount = 0;
        
        for (const [key, value] of this.cache.entries()) {
            if (now <= value.expireTime) {
                activeCount++;
            } else {
                expiredCount++;
            }
        }
        
        return {
            total: this.cache.size,
            active: activeCount,
            expired: expiredCount,
            memoryUsage: process.memoryUsage()
        };
    }
}

module.exports = new StatsService(); 
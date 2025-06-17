const orderService = require('./orderService');
const evaluationService = require('./evaluationService');
const dbOperations = require('../models/dbOperations');
// statsService将在需要时延迟加载

class ApiService {
    constructor() {
        this.routes = new Map();
        this.setupRoutes();
    }

    setupRoutes() {
        // 统计相关接口
        this.routes.set('GET /api/stats/optimized', this.getOptimizedStats.bind(this));
        this.routes.set('GET /api/stats/dashboard', this.getDashboardStats.bind(this));
        this.routes.set('GET /api/stats/cache-info', this.getCacheInfo.bind(this));

        // 图表数据接口
        this.routes.set('GET /api/charts/orders-trend', this.getOrdersTrendChart.bind(this));
        this.routes.set('GET /api/charts/region-distribution', this.getRegionDistributionChart.bind(this));
        this.routes.set('GET /api/charts/price-distribution', this.getPriceDistributionChart.bind(this));
        this.routes.set('GET /api/charts/status-distribution', this.getStatusDistributionChart.bind(this));

        // 订单相关接口
        this.routes.set('GET /api/orders', this.getOrders.bind(this));
        this.routes.set('GET /api/orders/:id', this.getOrderById.bind(this));

        // 基础数据接口
        this.routes.set('GET /api/regions', this.getRegions.bind(this));
        this.routes.set('GET /api/merchants', this.getMerchants.bind(this));

        // 排名接口
        this.routes.set('GET /api/rankings/merchants', this.getMerchantRankings.bind(this));
        this.routes.set('GET /api/rankings/users', this.getUserRankings.bind(this));

        // 导出接口 (暂时禁用，后续实现)
        // this.routes.set('GET /api/export/orders', this.exportOrders.bind(this));
        // this.routes.set('GET /api/export/stats', this.exportStats.bind(this));
    }

    // 处理HTTP请求
    async handleRequest(method, path, query = {}, body = {}) {
        try {
            const routeKey = `${method} ${path}`;
            const handler = this.routes.get(routeKey);
            
            if (!handler) {
                // 尝试匹配带参数的路由
                for (const [route, routeHandler] of this.routes.entries()) {
                    const [routeMethod, routePath] = route.split(' ');
                    if (routeMethod === method && this.matchRoute(routePath, path)) {
                        const params = this.extractParams(routePath, path);
                        return await routeHandler({ query, body, params });
                    }
                }
                
                return {
                    success: false,
                    status: 404,
                    message: '接口不存在'
                };
            }

            const result = await handler({ query, body });
            return {
                success: true,
                status: 200,
                ...result
            };

        } catch (error) {
            console.error('API请求处理失败:', error);
            return {
                success: false,
                status: 500,
                message: error.message || '服务器内部错误'
            };
        }
    }

    // 路由匹配
    matchRoute(routePath, actualPath) {
        const routeParts = routePath.split('/');
        const actualParts = actualPath.split('/');
        
        if (routeParts.length !== actualParts.length) return false;
        
        return routeParts.every((part, index) => {
            return part.startsWith(':') || part === actualParts[index];
        });
    }

    // 提取路由参数
    extractParams(routePath, actualPath) {
        const routeParts = routePath.split('/');
        const actualParts = actualPath.split('/');
        const params = {};
        
        routeParts.forEach((part, index) => {
            if (part.startsWith(':')) {
                const paramName = part.substring(1);
                params[paramName] = actualParts[index];
            }
        });
        
        return params;
    }

    // 获取优化统计数据
    async getOptimizedStats({ query }) {
        try {
            const filters = this.parseFilters(query);
            const whereConditions = this.buildWhereConditions(filters);
            const whereClause = whereConditions.conditions.join(' AND ');
            const params = whereConditions.params;

            // 获取真实订单统计
            const orderStats = dbOperations.db.prepare(`
                SELECT 
                    COUNT(*) as totalOrders,
                    SUM(CASE WHEN o.status = 'confirmed' THEN 1 ELSE 0 END) as confirmedOrders,
                    SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) as completedOrders,
                    0 as avgPrice,
                    CAST(SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS FLOAT) / 
                    NULLIF(COUNT(*), 0) as completionRate
                FROM orders o
                WHERE ${whereClause}
            `).get(...params);

            // 获取真实评价统计 (简化版本，因为没有evaluations表)
            const avgRating = 0;

            const stats = {
                totalOrders: orderStats.totalOrders || 0,
                confirmedOrders: orderStats.confirmedOrders || 0,
                completedOrders: orderStats.completedOrders || 0,
                avgPrice: orderStats.avgPrice || 0,
                avgRating: avgRating || 0,
                completionRate: orderStats.completionRate || 0
            };
            
            return {
                data: stats,
                fromCache: false
            };
        } catch (error) {
            throw new Error('获取统计数据失败: ' + error.message);
        }
    }

    // 获取仪表板统计
    async getDashboardStats({ query }) {
        try {
            const filters = this.parseFilters(query);
            
            // 延迟加载statsService
            let hotQueries = [];
            let cacheStats = {};
            try {
                const statsService = require('./statsService');
                hotQueries = await statsService.getHotQueries();
                cacheStats = statsService.getCacheStats();
            } catch (error) {
                console.warn('统计服务暂不可用:', error.message);
            }
            
            // 计算关键指标
            const stats = await this.calculateDashboardMetrics(filters);
            
            return {
                data: {
                    metrics: stats,
                    hotQueries,
                    cacheStats
                }
            };
        } catch (error) {
            throw new Error('获取仪表板数据失败: ' + error.message);
        }
    }

    // 计算仪表板指标
    async calculateDashboardMetrics(filters) {
        try {
            const whereConditions = this.buildWhereConditions(filters);
            const whereClause = whereConditions.conditions.join(' AND ');
            const params = whereConditions.params;

            const metrics = dbOperations.db.prepare(`
                SELECT 
                    COUNT(*) as totalOrders,
                    SUM(CASE WHEN o.status = 'confirmed' THEN 1 ELSE 0 END) as confirmedOrders,
                    SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) as completedOrders,
                    0 as avgPrice,
                    CAST(SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS FLOAT) / 
                    NULLIF(COUNT(*), 0) as completionRate
                FROM orders o
                WHERE ${whereClause}
            `).get(...params);

            // 获取平均评分 (简化版本)
            const avgRating = { avgRating: 0 };

            return {
                ...metrics,
                avgRating: avgRating.avgRating || 0,
                completionRate: metrics.completionRate || 0
            };
        } catch (error) {
            throw new Error('计算仪表板指标失败: ' + error.message);
        }
    }

    // 获取订单趋势图表数据
    async getOrdersTrendChart({ query }) {
        try {
            const filters = this.parseFilters(query);
            const period = query.period || 'daily';
            
            let dateFormat, groupBy;
            switch (period) {
                case 'hourly':
                    dateFormat = '%Y-%m-%d %H:00:00';
                    groupBy = "strftime('%Y-%m-%d %H', created_at, 'unixepoch')";
                    break;
                case 'weekly':
                    dateFormat = '%Y-W%W';
                    groupBy = "strftime('%Y-W%W', created_at, 'unixepoch')";
                    break;
                case 'monthly':
                    dateFormat = '%Y-%m';
                    groupBy = "strftime('%Y-%m', created_at, 'unixepoch')";
                    break;
                default: // daily
                    dateFormat = '%Y-%m-%d';
                    groupBy = "date(created_at, 'unixepoch')";
            }

            const whereConditions = this.buildWhereConditions(filters);
            const whereClause = whereConditions.conditions.join(' AND ');

            const trendData = dbOperations.db.prepare(`
                SELECT 
                    ${groupBy} as period,
                    COUNT(*) as orderCount,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedCount
                FROM orders 
                WHERE ${whereClause}
                GROUP BY ${groupBy}
                ORDER BY period DESC
                LIMIT 30
            `).all(...whereConditions.params);

            return {
                data: {
                    labels: trendData.map(d => d.period).reverse(),
                    values: trendData.map(d => d.orderCount).reverse(),
                    completedValues: trendData.map(d => d.completedCount).reverse()
                }
            };
        } catch (error) {
            throw new Error('获取订单趋势数据失败: ' + error.message);
        }
    }

    // 获取地区分布图表数据
    async getRegionDistributionChart({ query }) {
        try {
            const filters = this.parseFilters(query);
            const whereConditions = this.buildWhereConditions(filters);
            const whereClause = whereConditions.conditions.join(' AND ');

            const regionData = dbOperations.db.prepare(`
                SELECT 
                    '未知地区' as regionName,
                    COUNT(o.id) as orderCount
                FROM orders o
                WHERE ${whereClause}
                GROUP BY 1
                ORDER BY orderCount DESC
                LIMIT 10
            `).all(...whereConditions.params);

            return {
                data: {
                    labels: regionData.map(d => d.regionName || '未知地区'),
                    values: regionData.map(d => d.orderCount)
                }
            };
        } catch (error) {
            throw new Error('获取地区分布数据失败: ' + error.message);
        }
    }

    // 获取价格分布图表数据
    async getPriceDistributionChart({ query }) {
        try {
            const filters = this.parseFilters(query);
            const whereConditions = this.buildWhereConditions(filters);
            const whereClause = whereConditions.conditions.join(' AND ');

            const priceData = dbOperations.db.prepare(`
                SELECT 
                    price_range,
                    COUNT(*) as orderCount
                FROM orders 
                WHERE ${whereClause}
                GROUP BY price_range
                ORDER BY 
                    CASE price_range
                        WHEN '0-500' THEN 1
                        WHEN '500-1000' THEN 2
                        WHEN '1000-2000' THEN 3
                        WHEN '2000+' THEN 4
                        ELSE 5
                    END
            `).all(...whereConditions.params);

            return {
                data: {
                    labels: priceData.map(d => d.price_range || '未知'),
                    values: priceData.map(d => d.orderCount)
                }
            };
        } catch (error) {
            throw new Error('获取价格分布数据失败: ' + error.message);
        }
    }

    // 获取状态分布图表数据
    async getStatusDistributionChart({ query }) {
        try {
            const filters = this.parseFilters(query);
            const whereConditions = this.buildWhereConditions(filters);
            const whereClause = whereConditions.conditions.join(' AND ');

            const statusData = dbOperations.db.prepare(`
                SELECT 
                    status,
                    COUNT(*) as orderCount
                FROM orders 
                WHERE ${whereClause}
                GROUP BY status
                ORDER BY orderCount DESC
            `).all(...whereConditions.params);

            const statusLabels = {
                'pending': '待确认',
                'confirmed': '已确认',
                'completed': '已完成',
                'cancelled': '已取消'
            };

            return {
                data: {
                    labels: statusData.map(d => statusLabels[d.status] || d.status),
                    values: statusData.map(d => d.orderCount)
                }
            };
        } catch (error) {
            throw new Error('获取状态分布数据失败: ' + error.message);
        }
    }

    // 获取订单列表（支持分页和虚拟滚动）
    async getOrders({ query }) {
        try {
            const page = parseInt(query.page) || 1;
            const pageSize = parseInt(query.pageSize) || 50;
            const offset = (page - 1) * pageSize;
            const filters = this.parseFilters(query);
            
            const whereConditions = this.buildWhereConditions(filters);
            const whereClause = whereConditions.conditions.join(' AND ');
            const params = whereConditions.params;

            // 获取真实订单数据
            const orders = dbOperations.db.prepare(`
                SELECT 
                    o.id,
                    o.id as order_number,
                    o.user_name,
                    o.user_username,
                    o.teacher_name as merchant_name,
                    o.course_content,
                    o.price as actual_price,
                    o.status,
                    o.created_at,
                    o.booking_time,
                    o.updated_at as completed_time,
                    '' as region_name,
                    CASE 
                        WHEN o.user_evaluation IS NOT NULL
                        THEN 'completed' 
                        ELSE 'pending' 
                    END as user_evaluation_status,
                    CASE 
                        WHEN o.merchant_evaluation IS NOT NULL
                        THEN 'completed' 
                        ELSE 'pending' 
                    END as merchant_evaluation_status
                FROM orders o
                WHERE ${whereClause}
                ORDER BY o.created_at DESC
                LIMIT ? OFFSET ?
            `).all(...params, pageSize, offset);

            // 获取总数
            const total = dbOperations.db.prepare(`
                SELECT COUNT(*) as count FROM orders o WHERE ${whereClause}
            `).get(...params);

            return {
                data: {
                    orders,
                    total: total.count,
                    page,
                    pageSize,
                    totalPages: Math.ceil(total.count / pageSize)
                }
            };
        } catch (error) {
            throw new Error('获取订单列表失败: ' + error.message);
        }
    }

    // 获取订单详情
    async getOrderById({ params }) {
        try {
            const orderId = params.id;
            
            const order = dbOperations.db.prepare(`
                SELECT 
                    o.*,
                    u.name as user_name,
                    u.username as user_username,
                    m.teacher_name as merchant_name,
                    m.username as merchant_username,
                    r.name as region_name
                FROM orders o
                LEFT JOIN users u ON o.user_id = u.id
                LEFT JOIN merchants m ON o.merchant_id = m.id
                LEFT JOIN regions r ON o.region_id = r.id
                WHERE o.id = ?
            `).get(orderId);

            if (!order) {
                throw new Error('订单不存在');
            }

            // 获取评价信息
            const evaluations = dbOperations.db.prepare(`
                SELECT * FROM evaluations WHERE order_id = ? ORDER BY created_at DESC
            `).all(orderId);

            return {
                data: {
                    order,
                    evaluations
                }
            };
        } catch (error) {
            throw new Error('获取订单详情失败: ' + error.message);
        }
    }

    // 获取地区列表
    async getRegions() {
        try {
            const regions = dbOperations.db.prepare(`
                SELECT id, name FROM regions ORDER BY id
            `).all();

            return { data: regions };
        } catch (error) {
            throw new Error('获取地区列表失败: ' + error.message);
        }
    }

    // 获取商家列表
    async getMerchants() {
        try {
            const merchants = dbOperations.db.prepare(`
                SELECT 
                    m.id,
                    m.teacher_name,
                    m.username,
                    m.region_id,
                    m.contact,
                    m.price1,
                    m.price2,
                    r.name as region_name
                FROM merchants m
                LEFT JOIN regions r ON m.region_id = r.id
                ORDER BY m.id
            `).all();

            return { data: merchants };
        } catch (error) {
            throw new Error('获取商家列表失败: ' + error.message);
        }
    }

    // 获取商家排名
    async getMerchantRankings({ query }) {
        try {
            const filters = this.parseFilters(query);
            let whereConditions = ['mr.total_evaluations > 0'];
            let params = [];

            if (filters.regionId) {
                whereConditions.push('m.region_id = ?');
                params.push(filters.regionId);
            }

            if (filters.priceRange) {
                whereConditions.push(`
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
                    END = ?
                `);
                params.push(filters.priceRange);
            }

            const whereClause = whereConditions.join(' AND ');

            const rankings = dbOperations.db.prepare(`
                SELECT 
                    m.id,
                    m.teacher_name,
                    m.username,
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
                WHERE ${whereClause}
                ORDER BY mr.avg_overall_score DESC, mr.total_evaluations DESC
                LIMIT 50
            `).all(...params);

            return { data: rankings };
        } catch (error) {
            throw new Error('获取商家排名失败: ' + error.message);
        }
    }

    // 获取用户排名
    async getUserRankings({ query }) {
        try {
            const rankings = dbOperations.db.prepare(`
                SELECT 
                    u.id,
                    u.name,
                    u.username,
                    ur.avg_overall_score,
                    ur.total_evaluations,
                    COUNT(o.id) as total_orders
                FROM users u
                LEFT JOIN user_ratings ur ON u.id = ur.user_id
                LEFT JOIN orders o ON u.id = o.user_id
                WHERE ur.total_evaluations > 0
                GROUP BY u.id, u.name, u.username, ur.avg_overall_score, ur.total_evaluations
                ORDER BY ur.avg_overall_score DESC, ur.total_evaluations DESC
                LIMIT 50
            `).all();

            return { data: rankings };
        } catch (error) {
            throw new Error('获取用户排名失败: ' + error.message);
        }
    }

    // 获取缓存信息
    async getCacheInfo() {
        try {
            // 延迟加载statsService
            let cacheStats = {};
            try {
                const statsService = require('./statsService');
                cacheStats = statsService.getCacheStats();
            } catch (error) {
                console.warn('统计服务暂不可用:', error.message);
                cacheStats = { error: '统计服务暂不可用' };
            }
            
            return { data: cacheStats };
        } catch (error) {
            throw new Error('获取缓存信息失败: ' + error.message);
        }
    }

    // 解析筛选条件
    parseFilters(query) {
        const filters = {};
        
        if (query.timeRange) {
            const now = new Date();
            switch (query.timeRange) {
                case 'today':
                    filters.dateFrom = now.toISOString().split('T')[0];
                    break;
                case 'week':
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    filters.dateFrom = weekAgo.toISOString().split('T')[0];
                    break;
                case 'month':
                    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    filters.dateFrom = monthAgo.toISOString().split('T')[0];
                    break;
            }
        }

        if (query.dateFrom) filters.dateFrom = query.dateFrom;
        if (query.dateTo) filters.dateTo = query.dateTo;
        if (query.regionId) filters.regionId = query.regionId;
        if (query.priceRange) filters.priceRange = query.priceRange;
        if (query.merchantId) filters.merchantId = query.merchantId;
        if (query.status) filters.status = query.status;
        if (query.courseType) filters.courseType = query.courseType;

        return filters;
    }

    // 构建WHERE条件
    buildWhereConditions(filters) {
        const conditions = ['1=1'];
        const params = [];

        if (filters.dateFrom) {
            conditions.push('date(o.created_at) >= ?');
            params.push(filters.dateFrom);
        }

        if (filters.dateTo) {
            conditions.push('date(o.created_at) <= ?');
            params.push(filters.dateTo);
        }

        if (filters.merchantId) {
            conditions.push('o.merchant_id = ?');
            params.push(filters.merchantId);
        }

        if (filters.status) {
            conditions.push('o.status = ?');
            params.push(filters.status);
        }

        if (filters.courseType) {
            conditions.push('o.course_content LIKE ?');
            params.push(`%${filters.courseType}%`);
        }

        return { conditions, params };
    }
}

module.exports = new ApiService(); 
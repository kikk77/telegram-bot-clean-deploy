const orderService = require('./orderService');
const evaluationService = require('./evaluationService');
const dbOperations = require('../models/dbOperations');
const { db } = require('../config/database');
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
        this.routes.set('GET /api/stats', this.getBasicStats.bind(this));
        this.routes.set('GET /api/merchant-bookings', this.getMerchantBookings.bind(this));
        this.routes.set('GET /api/recent-bookings', this.getRecentBookings.bind(this));
        this.routes.set('GET /api/message-stats', this.getMessageStats.bind(this));
        this.routes.set('GET /api/button-stats', this.getButtonStats.bind(this));
        this.routes.set('GET /api/evaluation-stats', this.getEvaluationStats.bind(this));
        this.routes.set('GET /api/evaluations', this.getEvaluations.bind(this));
        this.routes.set('GET /api/evaluations/:id', this.getEvaluationDetails.bind(this));

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

        // 简单计数接口
        this.routes.set('GET /api/simple-count/:table', this.getSimpleCount.bind(this));

        // 导出接口 (暂时禁用，后续实现)
        // this.routes.set('GET /api/export/orders', this.exportOrders.bind(this));
        // this.routes.set('GET /api/export/stats', this.exportStats.bind(this));


        
        console.log('API路由设置完成，共', Object.keys(this.routes).length, '个路由');
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

    // 获取优化的统计数据
    async getOptimizedStats({ query }) {
        try {
            const filters = this.parseFilters(query);
            const whereConditions = this.buildWhereConditions(filters);
            const whereClause = whereConditions.conditions.join(' AND ');
            const params = whereConditions.params;

            // 1. 基础订单统计 - 使用与订单列表一致的状态判断逻辑
            const orderStats = db.prepare(`
                SELECT 
                    COUNT(*) as totalOrders,
                    SUM(CASE 
                        WHEN bs.user_course_status = 'confirmed' OR o.status = 'confirmed' 
                        THEN 1 ELSE 0 
                    END) as bookedOrders,
                    SUM(CASE 
                        WHEN bs.user_course_status != 'completed' 
                        OR bs.user_course_status IS NULL
                        THEN 1 ELSE 0 
                    END) as incompleteOrders,
                    SUM(CASE 
                        WHEN bs.user_course_status = 'completed' 
                        THEN 1 ELSE 0 
                    END) as completedOrders
                FROM orders o
                LEFT JOIN merchants m ON o.merchant_id = m.id
                LEFT JOIN regions r ON m.region_id = r.id
                LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id
                WHERE ${whereClause}
            `).get(...params);

            // 2. 计算平均订单价格 - 根据课程内容和商家价格设置
            const priceStats = db.prepare(`
                SELECT 
                    AVG(
                        CASE 
                            WHEN o.price IS NOT NULL AND o.price != '未设置' AND CAST(o.price AS REAL) > 0 
                            THEN CAST(o.price AS REAL)
                            WHEN o.course_content = 'p' AND m.price1 IS NOT NULL 
                            THEN CAST(m.price1 AS REAL)
                            WHEN o.course_content = 'pp' AND m.price2 IS NOT NULL 
                            THEN CAST(m.price2 AS REAL)
                            ELSE NULL
                        END
                    ) as avgPrice
                FROM orders o
                LEFT JOIN merchants m ON o.merchant_id = m.id
                LEFT JOIN regions r ON m.region_id = r.id
                LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id
                WHERE ${whereClause}
            `).get(...params);

            // 3. 计算平均用户评分 - 基于evaluations表
            const userRatingStats = db.prepare(`
                SELECT AVG(e.overall_score) as avgUserRating
                FROM evaluations e
                INNER JOIN orders o ON e.booking_session_id = o.booking_session_id
                LEFT JOIN merchants m ON o.merchant_id = m.id
                LEFT JOIN regions r ON m.region_id = r.id
                LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id
                WHERE e.evaluator_type = 'user' 
                AND e.status = 'completed' 
                AND e.overall_score IS NOT NULL
                AND ${whereClause}
            `).get(...params);

            // 4. 计算平均出击素质 - 基于evaluations表
            const merchantRatingStats = db.prepare(`
                SELECT AVG(e.overall_score) as avgMerchantRating
                FROM evaluations e
                INNER JOIN orders o ON e.booking_session_id = o.booking_session_id
                LEFT JOIN merchants m ON o.merchant_id = m.id
                LEFT JOIN regions r ON m.region_id = r.id
                LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id
                WHERE e.evaluator_type = 'merchant' 
                AND e.status = 'completed' 
                AND e.overall_score IS NOT NULL
                AND ${whereClause}
            `).get(...params);

            // 5. 计算完成率
            const completionRate = orderStats.totalOrders > 0 ? 
                (orderStats.completedOrders / orderStats.totalOrders) * 100 : 0;

            const stats = {
                totalOrders: orderStats.totalOrders || 0,
                bookedOrders: orderStats.bookedOrders || 0,  // 已预约订单 (confirmed状态)
                incompleteOrders: orderStats.incompleteOrders || 0,  // 待处理订单 (包括预约完成但课程未完成的订单)
                completedOrders: orderStats.completedOrders || 0,  // 已完成订单
                avgPrice: priceStats.avgPrice ? Math.round(priceStats.avgPrice) : 0,  // 平均订单价格
                avgUserRating: userRatingStats.avgUserRating ? Math.round(userRatingStats.avgUserRating * 10) / 10 : 0,  // 平均用户评分
                avgMerchantRating: merchantRatingStats.avgMerchantRating ? Math.round(merchantRatingStats.avgMerchantRating * 10) / 10 : 0,  // 平均出击素质
                completionRate: Math.round(completionRate * 10) / 10  // 完成率
            };
            
            return {
                success: true,
                data: stats,
                fromCache: false
            };
        } catch (error) {
            console.error('获取统计数据失败:', error);
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

            const metrics = db.prepare(`
                SELECT 
                    COUNT(*) as totalOrders,
                    SUM(CASE 
                        WHEN bs.user_course_status = 'confirmed' OR o.status = 'confirmed' 
                        THEN 1 ELSE 0 
                    END) as confirmedOrders,
                    SUM(CASE 
                        WHEN bs.user_course_status = 'completed' 
                        THEN 1 ELSE 0 
                    END) as completedOrders,
                    AVG(CAST(o.price AS REAL)) as avgPrice,
                    CAST(SUM(CASE 
                        WHEN bs.user_course_status = 'completed' 
                        THEN 1 ELSE 0 
                    END) AS FLOAT) / NULLIF(COUNT(*), 0) as completionRate
                FROM orders o
                LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id
                WHERE ${whereClause}
            `).get(...params);

            // 获取平均评分
            const avgRatingResult = db.prepare(`
                SELECT 
                    AVG(CAST(json_extract(o.user_evaluation, '$.overall_score') AS REAL)) as avgUserRating,
                    AVG(CAST(json_extract(o.merchant_evaluation, '$.overall_score') AS REAL)) as avgMerchantRating
                FROM orders o
                LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id
                WHERE ${whereClause} AND bs.user_course_status = 'completed'
            `).get(...params);

            const avgRating = (avgRatingResult.avgUserRating + avgRatingResult.avgMerchantRating) / 2 || 0;

            return {
                ...metrics,
                avgPrice: Math.round(metrics.avgPrice || 0),
                avgRating: Math.round(avgRating * 10) / 10,
                completionRate: Math.round((metrics.completionRate || 0) * 100) / 100
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
                    groupBy = "strftime('%Y-%m-%d %H', datetime(o.created_at))";
                    break;
                case 'weekly':
                    dateFormat = '%Y-W%W';
                    groupBy = "strftime('%Y-W%W', datetime(o.created_at))";
                    break;
                case 'monthly':
                    dateFormat = '%Y-%m';
                    groupBy = "strftime('%Y-%m', datetime(o.created_at))";
                    break;
                default: // daily
                    dateFormat = '%Y-%m-%d';
                    groupBy = "date(datetime(o.created_at))";
            }

            const whereConditions = this.buildWhereConditions(filters);
            const whereClause = whereConditions.conditions.join(' AND ');

            const trendData = db.prepare(`
                SELECT 
                    ${groupBy} as period,
                    COUNT(*) as orderCount,
                    SUM(CASE 
                        WHEN bs.user_course_status = 'completed' 
                        THEN 1 ELSE 0 
                    END) as completedCount
                FROM orders o
                LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id
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
            console.error('获取订单趋势数据失败:', error);
            throw new Error('获取订单趋势数据失败: ' + error.message);
        }
    }

    // 获取地区分布图表数据
    async getRegionDistributionChart({ query }) {
        try {
            const filters = this.parseFilters(query);
            const whereConditions = this.buildWhereConditions(filters);
            const whereClause = whereConditions.conditions.join(' AND ');

            const regionData = db.prepare(`
                SELECT 
                    COALESCE(r.name, '未知地区') as regionName,
                    COUNT(o.id) as orderCount
                FROM orders o
                LEFT JOIN merchants m ON o.merchant_id = m.id
                LEFT JOIN regions r ON m.region_id = r.id
                WHERE ${whereClause}
                GROUP BY r.name
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
            console.error('获取地区分布数据失败:', error);
            throw new Error('获取地区分布数据失败: ' + error.message);
        }
    }

    // 获取价格分布图表数据
    async getPriceDistributionChart({ query }) {
        try {
            const filters = this.parseFilters(query);
            const whereConditions = this.buildWhereConditions(filters);
            const whereClause = whereConditions.conditions.join(' AND ');

            const priceData = db.prepare(`
                SELECT 
                    CASE 
                        WHEN CAST(o.price AS REAL) < 500 THEN '0-500'
                        WHEN CAST(o.price AS REAL) < 700 THEN '500-700'
                        WHEN CAST(o.price AS REAL) < 900 THEN '700-900'
                        WHEN CAST(o.price AS REAL) < 1100 THEN '900-1100'
                        ELSE '1100+'
                    END as price_range,
                    COUNT(*) as orderCount
                FROM orders o
                WHERE ${whereClause}
                GROUP BY price_range
                ORDER BY 
                    CASE price_range
                        WHEN '0-500' THEN 1
                        WHEN '500-700' THEN 2
                        WHEN '700-900' THEN 3
                        WHEN '900-1100' THEN 4
                        WHEN '1100+' THEN 5
                    END
            `).all(...whereConditions.params);

            return {
                data: {
                    labels: priceData.map(d => d.price_range),
                    values: priceData.map(d => d.orderCount)
                }
            };
        } catch (error) {
            console.error('获取价格分布数据失败:', error);
            throw new Error('获取价格分布数据失败: ' + error.message);
        }
    }

    // 获取状态分布图表数据
    async getStatusDistributionChart({ query }) {
        try {
            const filters = this.parseFilters(query);
            const whereConditions = this.buildWhereConditions(filters);
            const whereClause = whereConditions.conditions.join(' AND ');

            const statusData = db.prepare(`
                SELECT 
                    CASE 
                        WHEN bs.user_course_status = 'completed' THEN 'completed'
                        WHEN bs.user_course_status = 'confirmed' OR o.status = 'confirmed' THEN 'confirmed'
                        WHEN o.status = 'attempting' THEN 'attempting'
                        WHEN o.status = 'failed' THEN 'failed'
                        WHEN o.status = 'cancelled' THEN 'cancelled'
                        ELSE 'pending'
                    END as status,
                    COUNT(*) as orderCount
                FROM orders o
                LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id
                WHERE ${whereClause}
                GROUP BY CASE 
                    WHEN bs.user_course_status = 'completed' THEN 'completed'
                    WHEN bs.user_course_status = 'confirmed' OR o.status = 'confirmed' THEN 'confirmed'
                    WHEN o.status = 'attempting' THEN 'attempting'
                    WHEN o.status = 'failed' THEN 'failed'
                    WHEN o.status = 'cancelled' THEN 'cancelled'
                    ELSE 'pending'
                END
                ORDER BY orderCount DESC
            `).all(...whereConditions.params);

            const statusLabels = {
                'attempting': '尝试预约',
                'pending': '待确认',
                'confirmed': '已确认',
                'completed': '已完成',
                'failed': '预约失败',
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

            // 获取真实订单数据，关联商家和地区信息，包含评价状态
            const rawOrders = db.prepare(`
                SELECT 
                    o.*,
                    m.id as merchant_id,
                    m.teacher_name as actual_merchant_name,
                    m.username as merchant_username,
                    m.contact as teacher_contact,
                    m.price1,
                    m.price2,
                    r.name as region_name,
                    bs.user_course_status,
                    bs.merchant_course_status,
                    bs.updated_at as completion_time,
                    -- 检查用户评价是否存在
                    (SELECT CASE WHEN COUNT(*) > 0 THEN 'completed' ELSE 'pending' END 
                     FROM evaluations 
                     WHERE booking_session_id = o.booking_session_id 
                     AND evaluator_type = 'user' 
                     AND status = 'completed') as user_evaluation_status,
                    -- 检查商家评价是否存在
                    (SELECT CASE WHEN COUNT(*) > 0 THEN 'completed' ELSE 'pending' END 
                     FROM evaluations 
                     WHERE booking_session_id = o.booking_session_id 
                     AND evaluator_type = 'merchant' 
                     AND status = 'completed') as merchant_evaluation_status
                FROM orders o
                LEFT JOIN merchants m ON o.merchant_id = m.id
                LEFT JOIN regions r ON m.region_id = r.id
                LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id
                WHERE ${whereClause}
                ORDER BY o.created_at DESC
                LIMIT ? OFFSET ?
            `).all(...params, pageSize, offset);

            // 处理订单数据，计算正确价格
            const orders = rawOrders.map(order => {
                // 计算实际价格
                let actualPrice = '价格未设置';
                if (order.price && order.price !== '未设置' && !isNaN(order.price)) {
                    actualPrice = parseInt(order.price);
                } else {
                    // 根据课程内容匹配商家价格
                    if (order.course_content === 'p' && order.price1) {
                        actualPrice = order.price1;
                    } else if (order.course_content === 'pp' && order.price2) {
                        actualPrice = order.price2;
                    } else if (order.course_content === 'other') {
                        actualPrice = '其他时长(面议)';
                    }
                }

                // 确定订单真实状态
                let realStatus = 'pending'; // 默认状态
                if (order.user_course_status === 'completed') {
                    realStatus = 'completed';
                } else if (order.user_course_status === 'confirmed' || order.status === 'confirmed') {
                    realStatus = 'confirmed';
                } else if (order.status === 'attempting') {
                    realStatus = 'attempting';
                } else if (order.status === 'failed') {
                    realStatus = 'failed';
                } else if (order.status === 'cancelled') {
                    realStatus = 'cancelled';
                }

                return {
                    ...order,
                    order_number: order.id,
                    actual_price: actualPrice,
                    price: actualPrice,
                    status: realStatus,
                    merchant_name: order.actual_merchant_name || order.teacher_name,
                    region_name: order.region_name || '未知地区',
                                    // 添加评价状态字段 - 基于evaluations表的实际数据
                user_evaluation_status: this.getUserEvaluationStatus(order.booking_session_id),
                merchant_evaluation_status: this.getMerchantEvaluationStatus(order.booking_session_id)
                };
            });

            // 获取总数
            const total = db.prepare(`
                SELECT COUNT(*) as count 
                FROM orders o
                LEFT JOIN merchants m ON o.merchant_id = m.id
                LEFT JOIN regions r ON m.region_id = r.id
                LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id
                WHERE ${whereClause}
            `).get(...params);

            return {
                success: true,
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

    // 获取用户评价状态
    getUserEvaluationStatus(bookingSessionId) {
        try {
            const evaluation = db.prepare(`
                SELECT status, detailed_scores, overall_score FROM evaluations 
                WHERE booking_session_id = ? AND evaluator_type = 'user'
            `).get(bookingSessionId);
            
            // 必须状态为completed且有实际评分数据
            if (evaluation && evaluation.status === 'completed') {
                const hasDetailedScores = evaluation.detailed_scores && evaluation.detailed_scores !== 'null';
                const hasOverallScore = evaluation.overall_score !== null;
                return (hasDetailedScores || hasOverallScore) ? 'completed' : 'pending';
            }
            return 'pending';
        } catch (error) {
            return 'pending';
        }
    }
    
    // 获取商家评价状态
    getMerchantEvaluationStatus(bookingSessionId) {
        try {
            const evaluation = db.prepare(`
                SELECT status, detailed_scores, overall_score FROM evaluations 
                WHERE booking_session_id = ? AND evaluator_type = 'merchant'
            `).get(bookingSessionId);
            
            // 商家评价：status为completed即视为已完成评价
            // 包括简单评价（选择"不了👋"）和详细评价
            return evaluation && evaluation.status === 'completed' ? 'completed' : 'pending';
        } catch (error) {
            return 'pending';
        }
    }

    // 获取订单详情
    async getOrderById({ params }) {
        try {
            const orderId = params.id;
            
            const order = db.prepare(`
                SELECT 
                    o.*,
                    m.id as merchant_id,
                    m.teacher_name as actual_merchant_name,
                    m.username as merchant_username,
                    m.contact as teacher_contact,
                    m.price1,
                    m.price2,
                    r.name as region_name,
                    bs.user_course_status,
                    bs.merchant_course_status,
                    bs.updated_at as completion_time,
                    -- 获取用户评价（包含评价时间）
                    (SELECT json_object(
                        'overall_score', overall_score,
                        'detailed_scores', detailed_scores,
                        'comments', comments,
                        'status', status,
                        'created_at', created_at
                    ) FROM evaluations 
                     WHERE booking_session_id = o.booking_session_id 
                     AND evaluator_type = 'user' LIMIT 1) as user_evaluation_data,
                    -- 获取商家评价（包含评价时间）
                    (SELECT json_object(
                        'overall_score', overall_score,
                        'detailed_scores', detailed_scores,
                        'comments', comments,
                        'status', status,
                        'created_at', created_at
                    ) FROM evaluations 
                     WHERE booking_session_id = o.booking_session_id 
                     AND evaluator_type = 'merchant' LIMIT 1) as merchant_evaluation_data,
                    -- 获取用户评价时间
                    (SELECT created_at FROM evaluations 
                     WHERE booking_session_id = o.booking_session_id 
                     AND evaluator_type = 'user' LIMIT 1) as user_evaluation_time,
                    -- 获取商家评价时间  
                    (SELECT created_at FROM evaluations 
                     WHERE booking_session_id = o.booking_session_id 
                     AND evaluator_type = 'merchant' LIMIT 1) as merchant_evaluation_time
                FROM orders o
                LEFT JOIN merchants m ON o.merchant_id = m.id
                LEFT JOIN regions r ON m.region_id = r.id
                LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id
                WHERE o.id = ?
            `).get(orderId);

            if (!order) {
                throw new Error('订单不存在');
            }

            // 计算实际价格 - 根据课程类型匹配商家价格设置
            let actualPrice = '价格未设置';
            if (order.price && order.price !== '未设置' && !isNaN(order.price)) {
                actualPrice = parseInt(order.price);
            } else {
                // 根据课程内容匹配商家价格
                if (order.course_content === 'p' && order.price1) {
                    actualPrice = order.price1;
                } else if (order.course_content === 'pp' && order.price2) {
                    actualPrice = order.price2;
                } else if (order.course_content === 'other') {
                    actualPrice = '其他时长(面议)';
                }
            }

            // 确定订单真实状态 - 基于booking_sessions的状态
            let realStatus = 'pending'; // 默认状态
            if (order.user_course_status === 'completed') {
                realStatus = 'completed';
            } else if (order.user_course_status === 'confirmed' || order.status === 'confirmed') {
                realStatus = 'confirmed';
            } else if (order.status === 'cancelled') {
                realStatus = 'cancelled';
            }

            // 时间处理 - 转换Unix时间戳为ISO格式
            const formatTime = (timestamp) => {
                if (!timestamp) return null;
                // 如果是Unix时间戳（数字）
                if (typeof timestamp === 'number' || /^\d+$/.test(timestamp)) {
                    return new Date(parseInt(timestamp) * 1000).toISOString();
                }
                // 如果已经是ISO格式
                return timestamp;
            };

            // 处理评价数据
            let userEvaluation = null;
            let merchantEvaluation = null;
            
            try {
                if (order.user_evaluation_data) {
                    const evalData = JSON.parse(order.user_evaluation_data);
                    userEvaluation = {
                        overall_score: evalData.overall_score,
                        scores: JSON.parse(evalData.detailed_scores || '{}'),
                        comments: evalData.comments,
                        created_at: formatTime(evalData.created_at)
                    };
                }
            } catch (e) {
                console.error('解析用户评价数据失败:', e);
            }

            try {
                if (order.merchant_evaluation_data) {
                    const evalData = JSON.parse(order.merchant_evaluation_data);
                    // 检查是否有实际评分数据
                    const hasDetailedScores = evalData.detailed_scores && evalData.detailed_scores !== 'null';
                    const hasOverallScore = evalData.overall_score !== null;
                    
                    merchantEvaluation = {
                        overall_score: evalData.overall_score,
                        scores: hasDetailedScores ? JSON.parse(evalData.detailed_scores) : {},
                        comments: evalData.comments, // 只使用数据库中的comments，不自动生成
                        created_at: formatTime(evalData.created_at),
                        is_simple_evaluation: !hasDetailedScores && hasOverallScore // 标记是否为简单评价（有总体评分但无详细评分）
                    };
                }
            } catch (e) {
                console.error('解析商家评价数据失败:', e);
            }

            // 构建处理后的订单数据
            const processedOrder = {
                ...order,
                // 基本信息
                user_name: order.user_name || '未知用户',
                user_username: order.user_username,
                merchant_id: order.merchant_id,
                merchant_name: order.actual_merchant_name || order.teacher_name,
                teacher_contact: order.teacher_contact,
                region: order.region_name || '未知地区',
                
                // 价格信息
                price: actualPrice,
                actual_price: actualPrice,
                
                // 状态信息  
                status: realStatus,
                user_evaluation_status: this.getUserEvaluationStatus(order.booking_session_id),
                merchant_evaluation_status: this.getMerchantEvaluationStatus(order.booking_session_id),
                
                // 时间信息
                booking_time: order.booking_time, // 预约时间
                created_at: order.created_at,     // 创建时间
                updated_at: order.updated_at,     // 更新时间
                completion_time: formatTime(order.completion_time), // 完成时间
                user_evaluation_time: formatTime(order.user_evaluation_time), // 用户评价时间
                merchant_evaluation_time: formatTime(order.merchant_evaluation_time), // 商家评价时间
                
                // 评价数据
                user_evaluation: userEvaluation,
                merchant_evaluation: merchantEvaluation
            };

            return {
                success: true,
                data: processedOrder
            };
        } catch (error) {
            console.error('获取订单详情失败:', error);
            throw new Error('获取订单详情失败: ' + error.message);
        }
    }

    // 获取地区列表
    async getRegions() {
        try {
            const regions = db.prepare(`
                SELECT id, name FROM regions WHERE active = 1 ORDER BY sort_order, name
            `).all();

            return { data: regions };
        } catch (error) {
            throw new Error('获取地区列表失败: ' + error.message);
        }
    }

    // 获取商家列表
    async getMerchants() {
        try {
            const merchants = db.prepare(`
                SELECT 
                    m.id,
                    m.teacher_name,
                    m.username,
                    m.region_id,
                    m.contact,
                    m.price1,
                    m.price2,
                    COALESCE(r.name, '未知地区') as region_name
                FROM merchants m
                LEFT JOIN regions r ON m.region_id = r.id
                WHERE m.status = 'active'
                ORDER BY m.teacher_name
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

            const rankings = db.prepare(`
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
            const rankings = db.prepare(`
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
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            
            switch (query.timeRange) {
                case 'today':
                case '本日':
                    filters.dateFrom = today.toISOString().split('T')[0];
                    filters.dateTo = today.toISOString().split('T')[0];
                    break;
                case 'week':
                case '本周':
                    // 本周开始（周一）
                    const weekStart = new Date(today);
                    weekStart.setDate(today.getDate() - today.getDay() + 1);
                    filters.dateFrom = weekStart.toISOString().split('T')[0];
                    filters.dateTo = today.toISOString().split('T')[0];
                    break;
                case 'month':
                case '本月':
                    // 本月开始
                    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                    filters.dateFrom = monthStart.toISOString().split('T')[0];
                    filters.dateTo = today.toISOString().split('T')[0];
                    break;
                case 'quarter':
                case '本季度':
                    // 本季度开始
                    const quarter = Math.floor(today.getMonth() / 3);
                    const quarterStart = new Date(today.getFullYear(), quarter * 3, 1);
                    filters.dateFrom = quarterStart.toISOString().split('T')[0];
                    filters.dateTo = today.toISOString().split('T')[0];
                    break;
                case 'year':
                case '本年':
                    // 本年开始
                    const yearStart = new Date(today.getFullYear(), 0, 1);
                    filters.dateFrom = yearStart.toISOString().split('T')[0];
                    filters.dateTo = today.toISOString().split('T')[0];
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

    // 计算订单实际价格
    calculateOrderPrice(order) {
        // 如果订单有明确价格且不是"未设置"，使用订单价格
        if (order.price && order.price !== '未设置' && !isNaN(order.price)) {
            return parseInt(order.price);
        }
        
        // 根据课程类型匹配商家价格
        if (order.course_content === 'p' && order.price1) {
            return order.price1;
        } else if (order.course_content === 'pp' && order.price2) {
            return order.price2;
        }
        
        // 如果没有匹配，返回课程类型提示
        if (order.course_content === 'p') {
            return '待定价(p服务)';
        } else if (order.course_content === 'pp') {
            return '待定价(pp服务)';
        }
        
        return '价格未设置';
    }

    // 构建WHERE条件
    buildWhereConditions(filters) {
        const conditions = ['1=1'];
        const params = [];

        // 时间筛选 - 使用ISO字符串格式的时间
        if (filters.dateFrom) {
            conditions.push('date(datetime(o.created_at)) >= date(?)');
            params.push(filters.dateFrom);
        }

        if (filters.dateTo) {
            conditions.push('date(datetime(o.created_at)) <= date(?)');
            params.push(filters.dateTo);
        }

        // 商家筛选 - 支持按商家ID或老师名称
        if (filters.merchantId) {
            conditions.push('(o.merchant_id = ? OR m.teacher_name = ?)');
            params.push(filters.merchantId);
            params.push(filters.merchantId); // 当作老师名称搜索
        }

        // 地区筛选 - 直接通过JOIN的条件筛选
        if (filters.regionId) {
            conditions.push('m.region_id = ?');
            params.push(filters.regionId);
        }

        // 价格区间筛选 - 基于实际价格计算
        if (filters.priceRange) {
            switch (filters.priceRange) {
                case '0-500':
                    conditions.push('CAST(o.price AS INTEGER) BETWEEN 0 AND 500');
                    break;
                case '500-1000':
                    conditions.push('CAST(o.price AS INTEGER) BETWEEN 500 AND 1000');
                    break;
                case '1000-2000':
                    conditions.push('CAST(o.price AS INTEGER) BETWEEN 1000 AND 2000');
                    break;
                case '2000+':
                    conditions.push('CAST(o.price AS INTEGER) > 2000');
                    break;
            }
        }

        // 状态筛选
        if (filters.status) {
            conditions.push('o.status = ?');
            params.push(filters.status);
        }

        // 课程类型筛选
        if (filters.courseType) {
            conditions.push('o.course_content LIKE ?');
            params.push(`%${filters.courseType}%`);
        }

        return { conditions, params };
    }

    // Dashboard需要的基础API方法
    async getBasicStats() {
        try {
            const stats = dbOperations.getInteractionStats();
            return { data: stats };
        } catch (error) {
            throw new Error('获取基础统计失败: ' + error.message);
        }
    }

    async getMerchantBookings() {
        try {
            const bookings = dbOperations.getMerchantBookingStats();
            return { data: bookings };
        } catch (error) {
            throw new Error('获取商家预约统计失败: ' + error.message);
        }
    }

    async getRecentBookings() {
        try {
            const bookings = dbOperations.getRecentBookings(20);
            return { data: bookings };
        } catch (error) {
            throw new Error('获取最近预约失败: ' + error.message);
        }
    }

    async getMessageStats() {
        try {
            const stats = dbOperations.getMessageStats();
            return { data: stats };
        } catch (error) {
            throw new Error('获取消息统计失败: ' + error.message);
        }
    }

    async getButtonStats() {
        try {
            const stats = dbOperations.getButtonClickStats();
            return { data: stats };
        } catch (error) {
            throw new Error('获取按钮统计失败: ' + error.message);
        }
    }

    async getEvaluationStats() {
        try {
            const stats = dbOperations.getEvaluationStats();
            return { data: stats };
        } catch (error) {
            throw new Error('获取评价统计失败: ' + error.message);
        }
    }

    async getEvaluations() {
        try {
            const evaluations = dbOperations.getAllEvaluations();
            return { data: evaluations };
        } catch (error) {
            throw new Error('获取评价列表失败: ' + error.message);
        }
    }

    async getEvaluationDetails({ params }) {
        try {
            const evaluationId = params.id;
            const details = dbOperations.getEvaluationDetails(evaluationId);
            if (!details) {
                throw new Error('评价不存在');
            }
            return { data: details };
        } catch (error) {
            throw new Error('获取评价详情失败: ' + error.message);
        }
    }

    // 简单计数方法
    async getSimpleCount({ params }) {
        try {
            const tableName = params.table;
            
            // 安全的表名映射
            const tableMap = {
                'merchants': 'merchants',
                'message_templates': 'message_templates',
                'bind_codes': 'bind_codes',
                'regions': 'regions',
                'orders': 'orders'
            };
            
            const actualTable = tableMap[tableName];
            if (!actualTable) {
                throw new Error('无效的表名');
            }
            
            const result = db.prepare(`SELECT COUNT(*) as count FROM ${actualTable}`).get();
            
            return {
                success: true,
                count: result.count || 0
            };
        } catch (error) {
            console.error('获取计数失败:', error);
            throw new Error('获取计数失败: ' + error.message);
        }
    }


}

module.exports = new ApiService(); 
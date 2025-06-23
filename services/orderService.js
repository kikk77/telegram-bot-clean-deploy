const dbOperations = require('../models/dbOperations');

class OrderService {
    constructor() {
        this.priceRanges = {
            '0-500': { min: 0, max: 500 },
            '500-1000': { min: 500, max: 1000 },
            '1000-2000': { min: 1000, max: 2000 },
            '2000+': { min: 2000, max: 999999 }
        };
    }

    // 生成订单号：格式 YYYYMMDDHHMM + 序号(3位)
    generateOrderNumber() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        
        const datePrefix = `${year}${month}${day}${hour}${minute}`;
        
        // 获取当天同时间段的订单数量作为序号
        const todayStart = new Date(year, now.getMonth(), day).getTime() / 1000;
        const todayEnd = todayStart + 24 * 60 * 60;
        
        const todayOrderCount = dbOperations.db.prepare(`
            SELECT COUNT(*) as count FROM orders 
            WHERE created_at >= ? AND created_at < ?
        `).get(todayStart, todayEnd).count;
        
        const sequence = String(todayOrderCount + 1).padStart(3, '0');
        return `${datePrefix}${sequence}`;
    }

    // 确定价格区间
    getPriceRange(price) {
        for (const [range, limits] of Object.entries(this.priceRanges)) {
            if (price >= limits.min && price < limits.max) {
                return range;
            }
        }
        return '2000+';
    }

    // 创建订单
    createOrder(bookingSession, userInfo, merchantInfo) {
        try {
            const orderNumber = this.generateOrderNumber();
            const now = Math.floor(Date.now() / 1000);
            
            // 确定价格和价格区间
            let actualPrice = 0;
            let courseContent = '';
            
            switch (bookingSession.course_type) {
                case 'p':
                    actualPrice = merchantInfo.price1 || 0;
                    courseContent = 'p课程';
                    break;
                case 'pp':
                    actualPrice = merchantInfo.price2 || 0;
                    courseContent = 'pp课程';
                    break;
                case 'other':
                    actualPrice = 0;
                    courseContent = '其他时长';
                    break;
            }
            
            const priceRange = this.getPriceRange(actualPrice);
            
            const orderData = {
                order_number: orderNumber,
                booking_session_id: bookingSession.id,
                user_id: bookingSession.user_id,
                user_name: userInfo.user_name || userInfo.first_name || '未设置',
                user_username: userInfo.username || '未设置',
                merchant_id: merchantInfo.id,
                merchant_user_id: merchantInfo.user_id,
                teacher_name: merchantInfo.teacher_name,
                teacher_contact: merchantInfo.contact,
                region_id: merchantInfo.region_id,
                course_type: bookingSession.course_type,
                course_content: courseContent,
                price_range: priceRange,
                actual_price: actualPrice,
                status: 'pending',
                booking_time: now
            };
            
            const result = dbOperations.db.prepare(`
                INSERT INTO orders (
                    order_number, booking_session_id, user_id, user_name, user_username,
                    merchant_id, merchant_user_id, teacher_name, teacher_contact, region_id,
                    course_type, course_content, price_range, actual_price, status, booking_time
                ) VALUES (
                    @order_number, @booking_session_id, @user_id, @user_name, @user_username,
                    @merchant_id, @merchant_user_id, @teacher_name, @teacher_contact, @region_id,
                    @course_type, @course_content, @price_range, @actual_price, @status, @booking_time
                )
            `).run(orderData);
            
            console.log(`订单创建成功: ${orderNumber}, ID: ${result.lastInsertRowid}`);
            return { orderId: result.lastInsertRowid, orderNumber };
            
        } catch (error) {
            console.error('创建订单失败:', error);
            throw error;
        }
    }

    // 更新订单状态
    updateOrderStatus(orderId, status, additionalData = {}) {
        try {
            const now = Math.floor(Date.now() / 1000);
            let updateFields = ['status = ?', 'updated_at = ?'];
            let values = [status, now];
            
            // 根据状态添加时间戳
            if (status === 'confirmed' && !additionalData.confirmed_time) {
                updateFields.push('confirmed_time = ?');
                values.push(now);
            } else if (status === 'completed' && !additionalData.completed_time) {
                updateFields.push('completed_time = ?');
                values.push(now);
            }
            
            // 添加其他字段
            Object.entries(additionalData).forEach(([key, value]) => {
                updateFields.push(`${key} = ?`);
                values.push(value);
            });
            
            values.push(orderId);
            
            const result = dbOperations.db.prepare(`
                UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?
            `).run(...values);
            
            if (result.changes > 0) {
                console.log(`订单状态更新成功: ID ${orderId}, 状态: ${status}`);
                
                // 更新统计缓存
                this.updateStatsCache();
                return true;
            }
            return false;
            
        } catch (error) {
            console.error('更新订单状态失败:', error);
            throw error;
        }
    }

    // 获取订单详情
    getOrderById(orderId) {
        try {
            return dbOperations.db.prepare(`
                SELECT o.*, r.name as region_name,
                       ue.overall_score as user_overall_score, ue.detailed_scores as user_detail_scores, ue.comments as user_comment,
                       me.overall_score as merchant_overall_score, me.detailed_scores as merchant_detail_scores, me.comments as merchant_comment
                FROM orders o
                LEFT JOIN regions r ON o.region_id = r.id
                LEFT JOIN evaluations ue ON o.id = ue.order_id AND ue.evaluator_type = 'user'
                LEFT JOIN evaluations me ON o.id = me.order_id AND me.evaluator_type = 'merchant'
                WHERE o.id = ?
            `).get(orderId);
        } catch (error) {
            console.error('获取订单详情失败:', error);
            return null;
        }
    }

    // 获取订单列表（支持多维度筛选）
    getOrders(filters = {}) {
        try {
            let whereConditions = [];
            let params = [];
            
            // 日期筛选
            if (filters.dateFrom) {
                whereConditions.push('date(o.created_at, "unixepoch") >= ?');
                params.push(filters.dateFrom);
            }
            if (filters.dateTo) {
                whereConditions.push('date(o.created_at, "unixepoch") <= ?');
                params.push(filters.dateTo);
            }
            
            // 状态筛选
            if (filters.status) {
                whereConditions.push('o.status = ?');
                params.push(filters.status);
            }
            
            // 地区筛选
            if (filters.regionId) {
                whereConditions.push('o.region_id = ?');
                params.push(filters.regionId);
            }
            
            // 价格区间筛选
            if (filters.priceRange) {
                whereConditions.push('o.price_range = ?');
                params.push(filters.priceRange);
            }
            
            // 商家筛选
            if (filters.merchantId) {
                whereConditions.push('o.merchant_id = ?');
                params.push(filters.merchantId);
            }
            
            const whereClause = whereConditions.length > 0 ? 
                `WHERE ${whereConditions.join(' AND ')}` : '';
            
            const query = `
                SELECT o.*, r.name as region_name, m.teacher_name
                FROM orders o
                LEFT JOIN regions r ON o.region_id = r.id
                LEFT JOIN merchants m ON o.merchant_id = m.id
                ${whereClause}
                ORDER BY o.created_at DESC
                LIMIT ${filters.limit || 100}
                OFFSET ${filters.offset || 0}
            `;
            
            return dbOperations.db.prepare(query).all(...params);
            
        } catch (error) {
            console.error('获取订单列表失败:', error);
            return [];
        }
    }

    // 获取统计数据
    getStats(filters = {}) {
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
            
            const stats = dbOperations.db.prepare(`
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
            `).all(...params);
            
            return stats;
            
        } catch (error) {
            console.error('获取统计数据失败:', error);
            return [];
        }
    }

    // 获取缓存的统计数据
    getCachedStats(filters) {
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
            if (filters.statType) {
                whereConditions.push('stat_type = ?');
                params.push(filters.statType);
            }
            
            const whereClause = whereConditions.join(' AND ');
            
            return dbOperations.db.prepare(`
                SELECT * FROM order_stats 
                WHERE ${whereClause}
                ORDER BY stat_date DESC
            `).all(...params);
            
        } catch (error) {
            console.error('获取缓存统计失败:', error);
            return [];
        }
    }

    // 更新统计缓存
    updateStatsCache() {
        try {
            const today = new Date().toISOString().split('T')[0];
            this.updateDailyStats(today);
            console.log('统计缓存更新完成');
        } catch (error) {
            console.error('更新统计缓存失败:', error);
        }
    }

    // 更新日统计
    updateDailyStats(date) {
        const stats = dbOperations.db.prepare(`
            SELECT 
                region_id, price_range, merchant_id,
                COUNT(*) as total_orders,
                SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_orders,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders
            FROM orders 
            WHERE date(created_at, 'unixepoch') = ?
            GROUP BY region_id, price_range, merchant_id
        `).all(date);
        
        stats.forEach(stat => {
            dbOperations.db.prepare(`
                INSERT OR REPLACE INTO order_stats (
                    stat_date, stat_type, region_id, price_range, merchant_id,
                    total_orders, confirmed_orders, completed_orders, cancelled_orders
                ) VALUES (?, 'daily', ?, ?, ?, ?, ?, ?, ?)
            `).run(
                date, stat.region_id, stat.price_range, stat.merchant_id,
                stat.total_orders, stat.confirmed_orders, stat.completed_orders, stat.cancelled_orders
            );
        });
    }

    // 获取图表数据
    getChartData(type, filters = {}) {
        try {
            switch (type) {
                case 'orders_trend':
                    return this.getOrdersTrendData(filters);
                case 'region_distribution':
                    return this.getRegionDistributionData(filters);
                case 'price_distribution':
                    return this.getPriceDistributionData(filters);
                case 'status_summary':
                    return this.getStatusSummaryData(filters);
                default:
                    return [];
            }
        } catch (error) {
            console.error(`获取图表数据失败 (${type}):`, error);
            return [];
        }
    }

    // 订单趋势数据
    getOrdersTrendData(filters) {
        const stats = this.getStats(filters);
        return stats.map(stat => ({
            date: stat.stat_date,
            total: stat.total_orders,
            confirmed: stat.confirmed_orders,
            completed: stat.completed_orders,
            cancelled: stat.cancelled_orders
        }));
    }

    // 地区分布数据
    getRegionDistributionData(filters) {
        let whereConditions = ['1=1'];
        let params = [];
        
        if (filters.dateFrom) {
            whereConditions.push('date(o.created_at, "unixepoch") >= ?');
            params.push(filters.dateFrom);
        }
        if (filters.dateTo) {
            whereConditions.push('date(o.created_at, "unixepoch") <= ?');
            params.push(filters.dateTo);
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        return dbOperations.db.prepare(`
            SELECT r.name as region, COUNT(*) as count
            FROM orders o
            LEFT JOIN regions r ON o.region_id = r.id
            WHERE ${whereClause}
            GROUP BY o.region_id, r.name
            ORDER BY count DESC
        `).all(...params);
    }

    // 价格分布数据
    getPriceDistributionData(filters) {
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
        
        const whereClause = whereConditions.join(' AND ');
        
        return dbOperations.db.prepare(`
            SELECT price_range, COUNT(*) as count
            FROM orders 
            WHERE ${whereClause}
            GROUP BY price_range
            ORDER BY 
                CASE price_range 
                    WHEN '0-500' THEN 1
                    WHEN '500-1000' THEN 2
                    WHEN '1000-2000' THEN 3
                    WHEN '2000+' THEN 4
                END
        `).all(...params);
    }

    // 状态汇总数据
    getStatusSummaryData(filters) {
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
        
        const whereClause = whereConditions.join(' AND ');
        
        return dbOperations.db.prepare(`
            SELECT status, COUNT(*) as count
            FROM orders 
            WHERE ${whereClause}
            GROUP BY status
        `).all(...params);
    }
}

module.exports = new OrderService(); 
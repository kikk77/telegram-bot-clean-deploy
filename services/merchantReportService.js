const dbOperations = require('../models/dbOperations');
const { db } = require('../config/database');

class MerchantReportService {
    constructor() {
        // 缓存配置 - 优化缓存策略
        this.cache = new Map();
        this.cacheTimeout = 60 * 60 * 1000; // 1小时缓存
        this.rankingCache = new Map();
        this.rankingCacheTimeout = 24 * 60 * 60 * 1000; // 24小时缓存（每日更新）
        
        // 性能监控
        this.performanceMetrics = {
            totalRequests: 0,
            cacheHits: 0,
            averageResponseTime: 0,
            lastCleanup: Date.now()
        };
        
        // 内存管理配置
        this.maxCacheSize = 100; // 最大缓存条目数
        this.maxRankingCacheSize = 50; // 最大排名缓存条目数
        
        // 报告模板配置
        this.reportTemplates = {
            orderStats: {
                title: "📊 订单统计",
                enabled: true,
                description: "总咨询量、确认预约、实际成交等",
                priority: 1
            },
            courseAnalysis: {
                title: "📚 课程分析", 
                enabled: true,
                description: "p课程、pp课程占比分析",
                priority: 2
            },
            priceAnalysis: {
                title: "💰 收入分析",
                enabled: true,
                description: "总收入、平均客单价分析",
                priority: 3
            },
            evaluationStats: {
                title: "⭐ 评价统计",
                enabled: true,
                description: "客户评价、商家评价统计",
                priority: 4
            },
            ranking: {
                title: "🏆 排名情况",
                enabled: true,
                description: "本月成交排名及超越比例",
                priority: 5
            },
            returnCustomers: {
                title: "🔄 回头客分析",
                enabled: true,
                description: "重复消费用户详细分析",
                priority: 6
            }
        };
        
        // 定期清理缓存
        this.setupPeriodicCleanup();
    }

    // 设置定期清理
    setupPeriodicCleanup() {
        // 每30分钟清理一次过期缓存
        setInterval(() => {
            this.cleanupCache();
        }, 30 * 60 * 1000);
        
        // 每6小时进行内存优化
        setInterval(() => {
            this.optimizeMemory();
        }, 6 * 60 * 60 * 1000);
    }

    // 内存优化
    optimizeMemory() {
        try {
            console.log('开始内存优化...');
            
            // 清理过期缓存
            this.cleanupCache();
            
            // 如果缓存过大，清理最旧的条目
            if (this.cache.size > this.maxCacheSize) {
                const entries = Array.from(this.cache.entries());
                entries.sort((a, b) => a[1].expireTime - b[1].expireTime);
                
                const toDelete = entries.slice(0, entries.length - this.maxCacheSize);
                toDelete.forEach(([key]) => this.cache.delete(key));
                
                console.log(`清理了 ${toDelete.length} 个旧缓存条目`);
            }
            
            // 清理排名缓存
            if (this.rankingCache.size > this.maxRankingCacheSize) {
                const entries = Array.from(this.rankingCache.entries());
                entries.sort((a, b) => a[1].expireTime - b[1].expireTime);
                
                const toDelete = entries.slice(0, entries.length - this.maxRankingCacheSize);
                toDelete.forEach(([key]) => this.rankingCache.delete(key));
                
                console.log(`清理了 ${toDelete.length} 个旧排名缓存条目`);
            }
            
            // 更新性能指标
            this.performanceMetrics.lastCleanup = Date.now();
            
            console.log('内存优化完成');
            
        } catch (error) {
            console.error('内存优化失败:', error);
        }
    }

    // 生成商家月度报告 - 增加性能监控
    async generateMerchantMonthlyReport(merchantId, year, month) {
        const startTime = Date.now();
        this.performanceMetrics.totalRequests++;
        
        try {
            const cacheKey = `merchant_report_${merchantId}_${year}_${month}`;
            const cached = this.getCache(cacheKey);
            if (cached) {
                this.performanceMetrics.cacheHits++;
                console.log(`缓存命中: 商家 ${merchantId} 的 ${year}-${month} 月度报告`);
                return cached;
            }

            console.log(`生成商家 ${merchantId} 的 ${year}-${month} 月度报告...`);

            // 获取商家基本信息
            const merchant = dbOperations.getMerchantById(merchantId);
            if (!merchant) {
                throw new Error('商家不存在');
            }

            // 计算月份时间范围
            const monthStartTime = new Date(year, month - 1, 1).getTime() / 1000;
            const monthEndTime = new Date(year, month, 1).getTime() / 1000;

            // 并行计算所有统计数据以提高性能
            const [
                orderStats,
                courseAnalysis,
                priceAnalysis,
                evaluationStats,
                ranking,
                returnCustomers
            ] = await Promise.all([
                this.calculateOrderStats(merchantId, monthStartTime, monthEndTime),
                this.calculateCourseAnalysis(merchantId, monthStartTime, monthEndTime),
                this.calculatePriceAnalysis(merchantId, monthStartTime, monthEndTime),
                this.calculateEvaluationStats(merchantId, monthStartTime, monthEndTime),
                this.getMerchantRanking(merchantId, year, month),
                this.calculateReturnCustomers(merchantId, monthStartTime, monthEndTime)
            ]);

            const report = {
                merchant,
                period: { year, month },
                orderStats,
                courseAnalysis,
                priceAnalysis,
                evaluationStats,
                ranking,
                returnCustomers,
                generatedAt: new Date().toISOString(),
                processingTime: Date.now() - startTime
            };

            // 缓存结果
            this.setCache(cacheKey, report);
            
            // 更新性能指标
            const responseTime = Date.now() - startTime;
            this.performanceMetrics.averageResponseTime = 
                (this.performanceMetrics.averageResponseTime + responseTime) / 2;
            
            console.log(`商家 ${merchantId} 月度报告生成完成，耗时 ${responseTime}ms`);
            return report;

        } catch (error) {
            console.error('生成商家月度报告失败:', error);
            throw error;
        }
    }

    // 计算订单统计
    async calculateOrderStats(merchantId, startTime, endTime) {
        try {
            // 基于现有的订单状态逻辑，增加更精确的统计
            const orderQuery = `
                SELECT 
                    COUNT(*) as totalOrders,
                    COUNT(CASE WHEN bs.user_course_status = 'confirmed' OR o.status = 'confirmed' THEN 1 END) as confirmedOrders,
                    COUNT(CASE WHEN bs.user_course_status = 'completed' THEN 1 END) as completedOrders,
                    COUNT(CASE WHEN bs.user_course_status = 'pending' OR bs.user_course_status IS NULL THEN 1 END) as pendingOrders,
                    COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END) as cancelledOrders,
                    COUNT(CASE WHEN bs.user_course_status = 'incomplete' THEN 1 END) as incompleteOrders,
                    COUNT(CASE WHEN bs.user_course_status = 'attempting' THEN 1 END) as attemptingOrders,
                    COUNT(CASE WHEN bs.user_course_status = 'failed' THEN 1 END) as failedOrders
                FROM orders o
                LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id
                WHERE o.merchant_id = ? 
                AND o.created_at >= ? 
                AND o.created_at < ?
            `;

            const stats = db.prepare(orderQuery).get(merchantId, startTime, endTime);

            // 数据验证
            if (!stats || stats.totalOrders === null) {
                console.warn(`商家 ${merchantId} 在 ${new Date(startTime * 1000).toLocaleDateString()} - ${new Date(endTime * 1000).toLocaleDateString()} 期间无订单数据`);
                return this.getDefaultOrderStats();
            }

            // 计算更精确的转化率
            const totalValidOrders = stats.totalOrders || 0;
            const totalProcessedOrders = (stats.confirmedOrders || 0) + (stats.completedOrders || 0);
            const contactRate = totalValidOrders > 0 ? 
                ((totalProcessedOrders / totalValidOrders) * 100).toFixed(1) : '0.0';
            
            const completionRate = stats.confirmedOrders > 0 ? 
                ((stats.completedOrders || 0) / stats.confirmedOrders * 100).toFixed(1) : '0.0';

            // 计算订单处理效率
            const processingEfficiency = totalValidOrders > 0 ?
                (((stats.completedOrders || 0) / totalValidOrders) * 100).toFixed(1) : '0.0';

            return {
                totalOrders: totalValidOrders,
                confirmedOrders: stats.confirmedOrders || 0,
                completedOrders: stats.completedOrders || 0,
                pendingOrders: stats.pendingOrders || 0,
                cancelledOrders: stats.cancelledOrders || 0,
                incompleteOrders: stats.incompleteOrders || 0,
                attemptingOrders: stats.attemptingOrders || 0,
                failedOrders: stats.failedOrders || 0,
                contactRate: `${contactRate}%`,
                completionRate: `${completionRate}%`,
                processingEfficiency: `${processingEfficiency}%`
            };

        } catch (error) {
            console.error('计算订单统计失败:', error);
            return this.getDefaultOrderStats();
        }
    }

    // 计算课程类型分析 - 增加更详细的分析
    async calculateCourseAnalysis(merchantId, startTime, endTime) {
        try {
            const courseQuery = `
                SELECT 
                    o.course_type,
                    o.course_content,
                    COUNT(*) as count,
                    AVG(CASE 
                        WHEN o.course_type = 'p' AND m.price1 IS NOT NULL THEN m.price1
                        WHEN o.course_type = 'pp' AND m.price2 IS NOT NULL THEN m.price2
                        ELSE 0
                    END) as avgPrice
                FROM orders o
                LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id
                LEFT JOIN merchants m ON o.merchant_id = m.id
                WHERE o.merchant_id = ? 
                AND o.created_at >= ? 
                AND o.created_at < ?
                AND bs.user_course_status = 'completed'
                GROUP BY o.course_type, o.course_content
                ORDER BY count DESC
            `;

            const courseData = db.prepare(courseQuery).all(merchantId, startTime, endTime);
            const totalCompleted = courseData.reduce((sum, item) => sum + item.count, 0);

            if (totalCompleted === 0) {
                console.info(`商家 ${merchantId} 在指定期间内无已完成课程`);
                return this.getDefaultCourseAnalysis();
            }

            const analysis = courseData.map(item => ({
                type: item.course_type,
                content: item.course_content || '未设置',
                count: item.count,
                percentage: ((item.count / totalCompleted) * 100).toFixed(1),
                avgPrice: Math.round(item.avgPrice || 0)
            }));

            // 计算课程类型汇总
            const summary = {
                p: courseData.filter(item => item.course_type === 'p').reduce((sum, item) => sum + item.count, 0),
                pp: courseData.filter(item => item.course_type === 'pp').reduce((sum, item) => sum + item.count, 0),
                other: courseData.filter(item => item.course_type !== 'p' && item.course_type !== 'pp').reduce((sum, item) => sum + item.count, 0)
            };

            // 计算课程多样性指数（基于香农熵）
            const diversity = this.calculateDiversityIndex(analysis);

            return {
                totalCompleted,
                breakdown: analysis,
                summary,
                diversity: diversity.toFixed(2),
                mostPopular: analysis[0] || null
            };

        } catch (error) {
            console.error('计算课程类型分析失败:', error);
            return this.getDefaultCourseAnalysis();
        }
    }

    // 计算多样性指数
    calculateDiversityIndex(analysis) {
        if (!analysis || analysis.length === 0) return 0;
        
        const total = analysis.reduce((sum, item) => sum + item.count, 0);
        if (total === 0) return 0;
        
        let entropy = 0;
        analysis.forEach(item => {
            const proportion = item.count / total;
            if (proportion > 0) {
                entropy -= proportion * Math.log2(proportion);
            }
        });
        
        return entropy;
    }

    // 计算价格分析
    async calculatePriceAnalysis(merchantId, startTime, endTime) {
        try {
            // 获取商家价格设置
            const merchant = dbOperations.getMerchantById(merchantId);
            if (!merchant) {
                throw new Error('商家不存在');
            }
            
            const priceQuery = `
                SELECT 
                    o.course_type,
                    COUNT(*) as count,
                    m.price1,
                    m.price2,
                    SUM(CASE 
                        WHEN o.course_type = 'p' AND m.price1 IS NOT NULL THEN m.price1
                        WHEN o.course_type = 'pp' AND m.price2 IS NOT NULL THEN m.price2
                        ELSE 0
                    END) as totalRevenue
                FROM orders o
                LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id
                LEFT JOIN merchants m ON o.merchant_id = m.id
                WHERE o.merchant_id = ? 
                AND o.created_at >= ? 
                AND o.created_at < ?
                AND bs.user_course_status = 'completed'
                GROUP BY o.course_type, m.price1, m.price2
            `;

            const priceData = db.prepare(priceQuery).all(merchantId, startTime, endTime);

            const totalRevenue = priceData.reduce((sum, item) => sum + (item.totalRevenue || 0), 0);
            const totalCompleted = priceData.reduce((sum, item) => sum + item.count, 0);
            const averageOrderValue = totalCompleted > 0 ? (totalRevenue / totalCompleted) : 0;

            const breakdown = priceData.map(item => ({
                type: item.course_type,
                count: item.count,
                revenue: item.totalRevenue || 0,
                price: item.course_type === 'p' ? (item.price1 || 0) : 
                       item.course_type === 'pp' ? (item.price2 || 0) : 0
            }));

            // 如果没有课程类型数据，但商家有价格设置，创建默认结构
            if (breakdown.length === 0) {
                if (merchant.price1) {
                    breakdown.push({
                        type: 'p',
                        count: 0,
                        revenue: 0,
                        price: merchant.price1
                    });
                }
                if (merchant.price2) {
                    breakdown.push({
                        type: 'pp',
                        count: 0,
                        revenue: 0,
                        price: merchant.price2
                    });
                }
            }

            // 调试信息
            console.log(`商家${merchantId}价格分析:`, {
                merchant: { price1: merchant.price1, price2: merchant.price2 },
                breakdown,
                totalRevenue,
                averageOrderValue
            });

            // 确保至少显示商家的价格设置
            const finalBreakdown = breakdown.length > 0 ? breakdown : [];
            
            // 如果没有数据但商家有价格设置，显示价格信息
            if (finalBreakdown.length === 0) {
                if (merchant.price1) {
                    finalBreakdown.push({
                        type: 'p',
                        count: 0,
                        revenue: 0,
                        price: merchant.price1
                    });
                }
                if (merchant.price2) {
                    finalBreakdown.push({
                        type: 'pp',
                        count: 0,
                        revenue: 0,
                        price: merchant.price2
                    });
                }
            }

            return {
                totalRevenue,
                breakdown: finalBreakdown,
                averageOrderValue: Math.round(averageOrderValue)
            };

        } catch (error) {
            console.error('计算价格分析失败:', error);
            return this.getDefaultPriceAnalysis();
        }
    }

    // 计算评价统计
    async calculateEvaluationStats(merchantId, startTime, endTime) {
        try {
            // 获取商家的user_id
            const merchant = dbOperations.getMerchantById(merchantId);
            if (!merchant) {
                throw new Error('商家不存在');
            }

            // 客户评价商家的统计 - 通过orders表关联时间
            const receivedQuery = `
                SELECT 
                    COUNT(e.id) as count,
                    AVG(CASE WHEN e.overall_score IS NOT NULL THEN e.overall_score END) as averageScore
                FROM evaluations e
                LEFT JOIN booking_sessions bs ON e.booking_session_id = bs.id
                LEFT JOIN orders o ON bs.id = o.booking_session_id
                WHERE e.target_id = ? 
                AND e.evaluator_type = 'user'
                AND e.overall_score IS NOT NULL
                AND o.created_at >= ? 
                AND o.created_at < ?
            `;

            const receivedStats = db.prepare(receivedQuery).get(merchant.user_id, startTime, endTime);

            // 商家评价客户的统计 - 通过orders表关联时间
            const givenQuery = `
                SELECT 
                    COUNT(e.id) as count,
                    AVG(CASE WHEN e.overall_score IS NOT NULL THEN e.overall_score END) as averageScore
                FROM evaluations e
                LEFT JOIN booking_sessions bs ON e.booking_session_id = bs.id
                LEFT JOIN orders o ON bs.id = o.booking_session_id
                WHERE e.evaluator_id = ? 
                AND e.evaluator_type = 'merchant'
                AND e.overall_score IS NOT NULL
                AND o.created_at >= ? 
                AND o.created_at < ?
            `;

            const givenStats = db.prepare(givenQuery).get(merchant.user_id, startTime, endTime);

            // 调试信息
            console.log(`商家${merchantId}评价统计:`, {
                merchant_user_id: merchant.user_id,
                received: receivedStats,
                given: givenStats
            });

            return {
                receivedEvaluations: {
                    count: receivedStats.count || 0,
                    averageScore: receivedStats.averageScore ? parseFloat(receivedStats.averageScore).toFixed(1) : 0
                },
                givenEvaluations: {
                    count: givenStats.count || 0,
                    averageScore: givenStats.averageScore ? parseFloat(givenStats.averageScore).toFixed(1) : 0
                }
            };

        } catch (error) {
            console.error('计算评价统计失败:', error);
            return this.getDefaultEvaluationStats();
        }
    }

    // 获取商家排名
    async getMerchantRanking(merchantId, year, month) {
        try {
            const rankingKey = `ranking_${year}_${month}`;
            let rankings = this.getRankingCache(rankingKey);
            
            if (!rankings) {
                rankings = await this.calculateMonthlyRankings(year, month);
                this.setRankingCache(rankingKey, rankings);
            }

            const merchantRanking = rankings.find(r => r.merchantId === merchantId);
            
            if (merchantRanking) {
                return {
                    rank: merchantRanking.rank,
                    totalMerchants: rankings.length,
                    completedOrders: merchantRanking.completedOrders,
                    percentile: ((rankings.length - merchantRanking.rank + 1) / rankings.length * 100).toFixed(1)
                };
            } else {
                return this.getDefaultRanking();
            }

        } catch (error) {
            console.error('获取商家排名失败:', error);
            return this.getDefaultRanking();
        }
    }

    // 计算月度排名
    async calculateMonthlyRankings(year, month) {
        try {
            const startTime = new Date(year, month - 1, 1).getTime() / 1000;
            const endTime = new Date(year, month, 1).getTime() / 1000;

            const rankingQuery = `
                SELECT 
                    m.id as merchantId,
                    m.teacher_name,
                    m.username,
                    m.price1,
                    m.price2,
                    COUNT(CASE WHEN bs.user_course_status = 'completed' THEN 1 END) as completedOrders,
                    SUM(CASE 
                        WHEN bs.user_course_status = 'completed' AND o.course_type = 'p' AND m.price1 IS NOT NULL THEN m.price1
                        WHEN bs.user_course_status = 'completed' AND o.course_type = 'pp' AND m.price2 IS NOT NULL THEN m.price2
                        ELSE 0
                    END) as totalRevenue
                FROM merchants m
                LEFT JOIN orders o ON m.id = o.merchant_id
                LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id
                WHERE m.status = 'active'
                AND o.created_at >= ? 
                AND o.created_at < ?
                GROUP BY m.id, m.teacher_name, m.username, m.price1, m.price2
                ORDER BY completedOrders DESC, m.teacher_name ASC
            `;

            const rankings = db.prepare(rankingQuery).all(startTime, endTime);
            
            // 添加排名
            rankings.forEach((ranking, index) => {
                ranking.rank = index + 1;
            });

            console.log(`计算 ${year}-${month} 月度排名完成，共 ${rankings.length} 个商家`);
            return rankings;

        } catch (error) {
            console.error('计算月度排名失败:', error);
            return [];
        }
    }

    // 计算回头客分析
    async calculateReturnCustomers(merchantId, startTime, endTime) {
        try {
            const returnCustomerQuery = `
                SELECT 
                    o.user_id,
                    o.user_name,
                    o.user_username,
                    COUNT(*) as orderCount
                FROM orders o
                LEFT JOIN booking_sessions bs ON o.booking_session_id = bs.id
                WHERE o.merchant_id = ? 
                AND o.created_at >= ? 
                AND o.created_at < ?
                AND bs.user_course_status = 'completed'
                GROUP BY o.user_id, o.user_name, o.user_username
                HAVING COUNT(*) >= 2
                ORDER BY orderCount DESC
            `;

            const returnCustomers = db.prepare(returnCustomerQuery).all(merchantId, startTime, endTime);
            const totalReturnOrders = returnCustomers.reduce((sum, customer) => sum + customer.orderCount, 0);

            return {
                totalReturnCustomers: returnCustomers.length,
                totalReturnOrders,
                customers: returnCustomers.map(customer => ({
                    userId: customer.user_id,
                    name: customer.user_name || '未设置',
                    username: customer.user_username || '未设置',
                    orderCount: customer.orderCount
                }))
            };

        } catch (error) {
            console.error('计算回头客分析失败:', error);
            return this.getDefaultReturnCustomers();
        }
    }

    // 生成报告文本 - 通俗易懂版本
    generateReportText(reportData, selectedSections = null) {
        try {
            const { merchant, period, orderStats, courseAnalysis, priceAnalysis, 
                    evaluationStats, ranking, returnCustomers } = reportData;

            let reportText = `🎉 ${merchant.teacher_name}老师 ${period.year}年${period.month}月成绩单\n\n`;
            reportText += `亲爱的${merchant.teacher_name}老师，您的${period.month}月成绩单新鲜出炉啦！\n\n`;

            // 如果没有指定选择的部分，则包含所有部分
            const sections = selectedSections || Object.keys(this.reportTemplates);

            // 订单统计 - 通俗易懂版
            if (sections.includes('orderStats')) {
                reportText += `📞 本月接单情况\n`;
                reportText += `━━━━━━━━━━━━━━━\n`;
                
                if (orderStats.totalOrders === 0) {
                    reportText += `😅 这个月好像有点安静哦，一个咨询都没有收到\n`;
                    reportText += `💡 小鸡建议：多在朋友圈分享一下自己的课程吧！\n\n`;
                } else {
                    reportText += `📱 总共有 ${orderStats.totalOrders} 个学生找您咨询\n`;
                    
                    if (orderStats.confirmedOrders > 0) {
                        const confirmRate = ((orderStats.confirmedOrders/Math.max(orderStats.totalOrders,1))*100).toFixed(0);
                        reportText += `✅ 其中 ${orderStats.confirmedOrders} 个确定要上课 (${confirmRate}%的学生都说要！)\n`;
                    }
                    
                    if (orderStats.completedOrders > 0) {
                        const completeRate = ((orderStats.completedOrders/Math.max(orderStats.totalOrders,1))*100).toFixed(0);
                        reportText += `🎓 已经上完课的有 ${orderStats.completedOrders} 个 (${completeRate}%完课率)\n`;
                        
                        // 给予鼓励性评价
                        if (completeRate >= 80) {
                            reportText += `👏 哇！您的完课率超高，学生们都很喜欢您的课！\n`;
                        } else if (completeRate >= 60) {
                            reportText += `👍 完课率不错哦，继续保持！\n`;
                        } else if (completeRate >= 40) {
                            reportText += `💪 还有提升空间，也许可以和学生多互动一下？\n`;
                        } else {
                            reportText += `🤔 完课率有点低，是不是课程安排需要调整一下？\n`;
                        }
                    }
                    
                    if (orderStats.pendingOrders > 0) {
                        reportText += `⏰ 还有 ${orderStats.pendingOrders} 个在考虑中（要主动联系哦）\n`;
                    }
                    
                    if (orderStats.cancelledOrders > 0) {
                        reportText += `😔 ${orderStats.cancelledOrders} 个取消了（没关系，下次会更好的）\n`;
                    }
                    
                    // 新增状态的通俗说明
                    if (orderStats.incompleteOrders > 0) {
                        reportText += `📚 ${orderStats.incompleteOrders} 个课还没上完（记得提醒学生哦）\n`;
                    }
                    if (orderStats.attemptingOrders > 0) {
                        reportText += `🔄 ${orderStats.attemptingOrders} 个还在约时间（耐心等等）\n`;
                    }
                    if (orderStats.failedOrders > 0) {
                        reportText += `❌ ${orderStats.failedOrders} 个没约成功（可能时间不合适）\n`;
                    }
                }
                reportText += '\n';
            }

            // 课程分析 - 通俗易懂版
            if (sections.includes('courseAnalysis')) {
                reportText += `📚 您教了什么课\n`;
                reportText += `━━━━━━━━━━━━━━━\n`;
                
                if (courseAnalysis.totalCompleted === 0) {
                    reportText += `😅 这个月还没有上完课的学生\n`;
                    reportText += `💡 小鸡提醒：记得跟进已确认的学生哦！\n\n`;
                } else {
                    reportText += `🎉 这个月您总共教了 ${courseAnalysis.totalCompleted} 节课！\n\n`;
                    
                    reportText += `📊 课程类型分布：\n`;
                    if (courseAnalysis.summary.p > 0) {
                        const pPercentage = ((courseAnalysis.summary.p / courseAnalysis.totalCompleted) * 100).toFixed(0);
                        reportText += `🔤 P课程: ${courseAnalysis.summary.p}节 (${pPercentage}%)\n`;
                    }
                    if (courseAnalysis.summary.pp > 0) {
                        const ppPercentage = ((courseAnalysis.summary.pp / courseAnalysis.totalCompleted) * 100).toFixed(0);
                        reportText += `🔠 PP课程: ${courseAnalysis.summary.pp}节 (${ppPercentage}%)\n`;
                    }
                    if (courseAnalysis.summary.other > 0) {
                        const otherPercentage = ((courseAnalysis.summary.other / courseAnalysis.totalCompleted) * 100).toFixed(0);
                        reportText += `📖 其他课程: ${courseAnalysis.summary.other}节 (${otherPercentage}%)\n`;
                    }
                    
                    // 课程多样性的通俗解释
                    if (courseAnalysis.diversity) {
                        const diversity = parseFloat(courseAnalysis.diversity);
                        reportText += `\n🎯 课程风格：`;
                        if (diversity >= 2.0) {
                            reportText += `您是个"全能老师"，什么课都能教！👨‍🏫\n`;
                        } else if (diversity >= 1.0) {
                            reportText += `您的课程搭配很均衡，学生选择多样！😊\n`;
                        } else {
                            reportText += `您很专业，专注教某种课程！🎯\n`;
                        }
                    }
                    
                    // 最受欢迎课程
                    if (courseAnalysis.mostPopular) {
                        reportText += `🏆 最受欢迎：${courseAnalysis.mostPopular.content} (${courseAnalysis.mostPopular.count}节)\n`;
                    }
                }
                reportText += '\n';
            }

            // 价格分析 - 通俗易懂版
            if (sections.includes('priceAnalysis')) {
                reportText += `💰 这个月赚了多少\n`;
                reportText += `━━━━━━━━━━━━━━━\n`;
                
                if (priceAnalysis.totalRevenue === 0) {
                    reportText += `😅 这个月还没有收入进账\n`;
                    reportText += `💡 小鸡建议：主动联系确认的学生，安排上课时间！\n\n`;
                } else {
                    reportText += `🤑 恭喜！这个月一共赚了 ¥${priceAnalysis.totalRevenue.toLocaleString()}\n`;
                    reportText += `💳 平均每节课收入 ¥${priceAnalysis.averageOrderValue.toLocaleString()}\n`;
                    
                    // 收入评价
                    if (priceAnalysis.totalRevenue >= 3000) {
                        reportText += `🎉 收入很不错！您这个月表现优秀！\n`;
                    } else if (priceAnalysis.totalRevenue >= 1500) {
                        reportText += `👍 收入还可以，继续努力！\n`;
                    } else if (priceAnalysis.totalRevenue >= 500) {
                        reportText += `💪 有收入总是好的，下个月争取更多！\n`;
                    } else {
                        reportText += `🤗 虽然不多，但这是个好开始！\n`;
                    }
                    
                    if (priceAnalysis.breakdown.length > 0) {
                        reportText += `\n💸 钱都是怎么赚的：\n`;
                        priceAnalysis.breakdown.forEach(item => {
                            if (item.count > 0) {
                                const percentage = priceAnalysis.totalRevenue > 0 ? 
                                    ((item.revenue / priceAnalysis.totalRevenue) * 100).toFixed(0) : 0;
                                reportText += `• ${item.type.toUpperCase()}课程：教了${item.count}节，赚了¥${item.revenue.toLocaleString()} (${percentage}%)\n`;
                            }
                        });
                        
                        // 主要收入来源
                        const mainRevenue = priceAnalysis.breakdown.reduce((max, item) => 
                            item.revenue > max.revenue ? item : max, priceAnalysis.breakdown[0]);
                        if (mainRevenue) {
                            const mainPercentage = ((mainRevenue.revenue / priceAnalysis.totalRevenue) * 100).toFixed(0);
                            reportText += `\n🎯 主要靠${mainRevenue.type.toUpperCase()}课程赚钱 (${mainPercentage}%的收入)\n`;
                        }
                    }
                }
                reportText += '\n';
            }

            // 评价统计 - 通俗易懂版
            if (sections.includes('evaluationStats')) {
                reportText += `⭐ 大家对您的评价\n`;
                reportText += `━━━━━━━━━━━━━━━\n`;
                
                if (evaluationStats.receivedEvaluations.count === 0) {
                    reportText += `🤔 这个月还没有收到学生评价\n`;
                    reportText += `💡 小鸡提醒：上完课记得提醒学生给个好评哦！\n\n`;
                } else {
                    reportText += `📝 收到了 ${evaluationStats.receivedEvaluations.count} 个学生评价`;
                    
                    if (evaluationStats.receivedEvaluations.averageScore > 0) {
                        const avgScore = parseFloat(evaluationStats.receivedEvaluations.averageScore);
                        reportText += ` (平均${avgScore}分)`;
                        
                        // 评分解读
                        if (avgScore >= 4.5) {
                            reportText += `\n🏆 哇！学生们都超级喜欢您！您是明星老师！`;
                        } else if (avgScore >= 4.0) {
                            reportText += `\n👍 学生们对您很满意！继续保持！`;
                        } else if (avgScore >= 3.5) {
                            reportText += `\n😊 评价还不错，还有进步空间！`;
                        } else {
                            reportText += `\n🤗 评价一般般，多和学生互动可能会更好！`;
                        }
                    }
                    reportText += `\n`;
                    
                    if (evaluationStats.givenEvaluations.count > 0) {
                        reportText += `👨‍🏫 您也给了 ${evaluationStats.givenEvaluations.count} 个学生评价`;
                        if (evaluationStats.givenEvaluations.averageScore > 0) {
                            reportText += ` (平均${evaluationStats.givenEvaluations.averageScore}分)`;
                        }
                        reportText += `\n`;
                        
                        // 互动活跃度
                        const interactionRate = evaluationStats.receivedEvaluations.count > 0 ? 
                            (evaluationStats.givenEvaluations.count / evaluationStats.receivedEvaluations.count * 100).toFixed(0) : 0;
                        if (interactionRate >= 80) {
                            reportText += `💯 您很积极回评学生，互动满分！\n`;
                        } else if (interactionRate >= 50) {
                            reportText += `👏 互动不错，学生应该很喜欢！\n`;
                        } else {
                            reportText += `💡 可以多给学生一些评价反馈哦！\n`;
                        }
                    }
                }
                reportText += '\n';
            }

            // 排名情况 - 通俗易懂版
            if (sections.includes('ranking')) {
                reportText += `🏆 您在所有老师中的排名\n`;
                reportText += `━━━━━━━━━━━━━━━\n`;
                reportText += `📊 成交排名：第${ranking.rank}名 (全平台${ranking.totalMerchants}个老师)\n`;
                reportText += `🎯 您超过了 ${ranking.percentile}% 的老师\n`;
                reportText += `📚 本月教了 ${ranking.completedOrders} 节课\n`;
                
                // 排名鼓励
                if (ranking.rank <= 3) {
                    reportText += `\n🎉 哇塞！您是前三名！太厉害了！\n`;
                    reportText += `👑 您就是我们平台的明星老师！\n`;
                } else if (ranking.rank <= Math.ceil(ranking.totalMerchants * 0.1)) {
                    reportText += `\n🌟 您是前10%的优秀老师！非常棒！\n`;
                } else if (ranking.rank <= Math.ceil(ranking.totalMerchants * 0.25)) {
                    reportText += `\n👍 您是前25%的好老师！继续加油！\n`;
                } else if (ranking.rank <= Math.ceil(ranking.totalMerchants * 0.5)) {
                    reportText += `\n😊 您的排名在中上水平，还有很大潜力！\n`;
                } else {
                    reportText += `\n💪 虽然排名靠后，但每个人都有进步空间！\n`;
                    reportText += `🚀 小鸡相信您下个月会更好！\n`;
                }
                reportText += '\n';
            }

            // 回头客分析 - 通俗易懂版
            if (sections.includes('returnCustomers')) {
                reportText += `🔄 有哪些学生又回来找您\n`;
                reportText += `━━━━━━━━━━━━━━━\n`;
                
                if (returnCustomers.totalReturnCustomers === 0) {
                    reportText += `😅 这个月还没有回头客\n`;
                    reportText += `💡 小鸡建议：课后多关心学生，他们会记得您的好！\n\n`;
                } else {
                    reportText += `🎉 有 ${returnCustomers.totalReturnCustomers} 个学生又回来找您上课！\n`;
                    reportText += `📚 这些回头客总共上了 ${returnCustomers.totalReturnOrders} 节课\n`;
                    
                    const avgReturnOrders = (returnCustomers.totalReturnOrders / returnCustomers.totalReturnCustomers).toFixed(1);
                    reportText += `💯 平均每个回头客上了 ${avgReturnOrders} 节课\n`;
                    
                    // 客户忠诚度评估
                    const loyaltyRate = returnCustomers.totalReturnCustomers > 0 ? 
                        (returnCustomers.totalReturnCustomers / Math.max(orderStats.completedOrders, 1) * 100).toFixed(0) : 0;
                    reportText += `❤️ ${loyaltyRate}% 的学生会再次选择您\n`;
                    
                    if (parseFloat(loyaltyRate) >= 40) {
                        reportText += `🏆 您的回头客超多！学生们都很信任您！\n`;
                    } else if (parseFloat(loyaltyRate) >= 25) {
                        reportText += `👍 回头客不少，说明您教得很好！\n`;
                    } else if (parseFloat(loyaltyRate) >= 15) {
                        reportText += `😊 有一些回头客，继续努力！\n`;
                    } else {
                        reportText += `💪 回头客还不多，多和学生保持联系吧！\n`;
                    }
                    
                    if (returnCustomers.customers.length > 0) {
                        reportText += `\n👑 您的忠实粉丝们：\n`;
                        returnCustomers.customers.slice(0, 5).forEach((customer, index) => {
                            const displayName = customer.name !== '未设置' ? customer.name : 
                                              customer.username !== '未设置' ? customer.username : `学生${customer.userId}`;
                            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '⭐';
                            reportText += `${medal} ${displayName}：上了${customer.orderCount}节课\n`;
                        });
                        
                        if (returnCustomers.customers.length > 5) {
                            reportText += `... 还有${returnCustomers.customers.length - 5}个忠实学生\n`;
                        }
                        
                        // 最佳客户
                        const topCustomer = returnCustomers.customers[0];
                        if (topCustomer && topCustomer.orderCount >= 3) {
                            const topName = topCustomer.name !== '未设置' ? topCustomer.name : '这位学生';
                            reportText += `\n💎 ${topName}是您的超级粉丝！上了${topCustomer.orderCount}节课！\n`;
                        }
                    }
                }
                reportText += '\n';
            }

            reportText += `━━━━━━━━━━━━━━━\n`;
            reportText += `📅 报告生成时间：${new Date().toLocaleString('zh-CN')}\n`;
            reportText += `📊 统计时间：${period.year}年${period.month}月\n`;
            reportText += `\n🐥 这份报告是小鸡管家为您精心准备的！\n`;
            reportText += `💝 看完记得给小鸡点个赞哦，我们下个月见！`;

            return reportText;

        } catch (error) {
            console.error('生成报告文本失败:', error);
            return '😅 哎呀，报告生成出了点小问题，请稍后重试哦！';
        }
    }

    // 缓存管理 - 优化版本
    setCache(key, data) {
        try {
            // 检查缓存大小限制
            if (this.cache.size >= this.maxCacheSize) {
                // 删除最旧的条目
                const oldestKey = this.cache.keys().next().value;
                this.cache.delete(oldestKey);
            }
            
            const expireTime = Date.now() + this.cacheTimeout;
            this.cache.set(key, { 
                data, 
                expireTime,
                accessCount: 0,
                lastAccessed: Date.now()
            });
            
        } catch (error) {
            console.error('设置缓存失败:', error);
        }
    }

    getCache(key) {
        try {
            const cached = this.cache.get(key);
            if (!cached) return null;
            
            if (Date.now() > cached.expireTime) {
                this.cache.delete(key);
                return null;
            }
            
            // 更新访问统计
            cached.accessCount++;
            cached.lastAccessed = Date.now();
            
            return cached.data;
            
        } catch (error) {
            console.error('获取缓存失败:', error);
            return null;
        }
    }

    // 排名缓存管理 - 优化版本
    setRankingCache(key, data) {
        try {
            // 检查缓存大小限制
            if (this.rankingCache.size >= this.maxRankingCacheSize) {
                const oldestKey = this.rankingCache.keys().next().value;
                this.rankingCache.delete(oldestKey);
            }
            
            const expireTime = Date.now() + this.rankingCacheTimeout;
            this.rankingCache.set(key, { 
                data, 
                expireTime,
                accessCount: 0,
                lastAccessed: Date.now()
            });
            
        } catch (error) {
            console.error('设置排名缓存失败:', error);
        }
    }

    getRankingCache(key) {
        try {
            const cached = this.rankingCache.get(key);
            if (!cached) return null;
            
            if (Date.now() > cached.expireTime) {
                this.rankingCache.delete(key);
                return null;
            }
            
            // 更新访问统计
            cached.accessCount++;
            cached.lastAccessed = Date.now();
            
            return cached.data;
            
        } catch (error) {
            console.error('获取排名缓存失败:', error);
            return null;
        }
    }

    // 清理过期缓存 - 增强版
    cleanupCache() {
        try {
            const now = Date.now();
            let cleanedCount = 0;
            
            // 清理普通缓存
            for (const [key, value] of this.cache.entries()) {
                if (now > value.expireTime) {
                    this.cache.delete(key);
                    cleanedCount++;
                }
            }
            
            // 清理排名缓存
            for (const [key, value] of this.rankingCache.entries()) {
                if (now > value.expireTime) {
                    this.rankingCache.delete(key);
                    cleanedCount++;
                }
            }
            
            if (cleanedCount > 0) {
                console.log(`清理了 ${cleanedCount} 个过期缓存条目`);
            }
            
        } catch (error) {
            console.error('清理缓存失败:', error);
        }
    }

    // 获取性能指标
    getPerformanceMetrics() {
        const cacheHitRate = this.performanceMetrics.totalRequests > 0 ? 
            (this.performanceMetrics.cacheHits / this.performanceMetrics.totalRequests * 100).toFixed(2) : 0;
        
        return {
            ...this.performanceMetrics,
            cacheHitRate: `${cacheHitRate}%`,
            cacheSize: this.cache.size,
            rankingCacheSize: this.rankingCache.size,
            memoryUsage: process.memoryUsage ? process.memoryUsage() : null
        };
    }

    // 重置性能指标
    resetPerformanceMetrics() {
        this.performanceMetrics = {
            totalRequests: 0,
            cacheHits: 0,
            averageResponseTime: 0,
            lastCleanup: Date.now()
        };
        console.log('性能指标已重置');
    }

    // 预热缓存 - 为活跃商家预生成报告
    async warmupCache(merchantIds, year, month) {
        try {
            console.log(`开始为 ${merchantIds.length} 个商家预热缓存...`);
            
            const promises = merchantIds.map(async (merchantId) => {
                try {
                    await this.generateMerchantMonthlyReport(merchantId, year, month);
                } catch (error) {
                    console.warn(`商家 ${merchantId} 缓存预热失败:`, error.message);
                }
            });
            
            await Promise.all(promises);
            console.log('缓存预热完成');
            
        } catch (error) {
            console.error('缓存预热失败:', error);
        }
    }

    // 默认数据
    getDefaultOrderStats() {
        return {
            totalOrders: 0,
            confirmedOrders: 0,
            completedOrders: 0,
            pendingOrders: 0,
            cancelledOrders: 0,
            incompleteOrders: 0,
            attemptingOrders: 0,
            failedOrders: 0,
            contactRate: '0%',
            completionRate: '0%',
            processingEfficiency: '0%'
        };
    }

    getDefaultCourseAnalysis() {
        return {
            totalCompleted: 0,
            breakdown: [],
            summary: { p: 0, pp: 0, other: 0 },
            diversity: '0.00',
            mostPopular: null
        };
    }

    getDefaultPriceAnalysis() {
        return {
            totalRevenue: 0,
            breakdown: [],
            averageOrderValue: 0
        };
    }

    getDefaultEvaluationStats() {
        return {
            receivedEvaluations: { count: 0, averageScore: 0 },
            givenEvaluations: { count: 0, averageScore: 0 }
        };
    }

    getDefaultRanking() {
        return {
            rank: 0,
            totalMerchants: 0,
            completedOrders: 0,
            percentile: '0'
        };
    }

    getDefaultReturnCustomers() {
        return {
            totalReturnCustomers: 0,
            totalReturnOrders: 0,
            customers: []
        };
    }

    // 获取报告模板
    getReportTemplates() {
        return this.reportTemplates;
    }
}

module.exports = MerchantReportService; 
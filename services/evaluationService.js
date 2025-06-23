const dbOperations = require('../models/dbOperations');

class EvaluationService {
    constructor() {
        // 评价维度定义
        this.userEvaluationDimensions = ['length', 'hardness', 'duration', 'technique'];
        this.merchantEvaluationDimensions = ['attitude', 'punctuality', 'cooperation'];
    }

    // 创建评价记录
    createEvaluation(orderData, evaluatorType, evaluatorId, targetId) {
        try {
            const now = Math.floor(Date.now() / 1000);
            
            const evaluationData = {
                order_id: orderData.orderId,
                booking_session_id: orderData.bookingSessionId,
                evaluator_type: evaluatorType,
                evaluator_id: evaluatorId,
                target_id: targetId,
                status: 'pending',
                created_at: now
            };
            
            const result = dbOperations.db.prepare(`
                INSERT INTO evaluations (
                    order_id, booking_session_id, evaluator_type, evaluator_id, target_id, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                evaluationData.order_id,
                evaluationData.booking_session_id,
                evaluationData.evaluator_type,
                evaluationData.evaluator_id,
                evaluationData.target_id,
                evaluationData.status,
                evaluationData.created_at
            );
            
            console.log(`评价记录创建成功: ID ${result.lastInsertRowid}, 类型: ${evaluatorType}`);
            return result.lastInsertRowid;
            
        } catch (error) {
            console.error('创建评价记录失败:', error);
            throw error;
        }
    }

    // 更新评价数据
    updateEvaluation(evaluationId, overallScore = null, detailScores = null, textComment = null, status = null) {
        try {
            console.log('=== updateEvaluation 调试信息 ===');
            console.log('evaluationId:', evaluationId);
            console.log('overallScore:', overallScore, typeof overallScore);
            console.log('detailScores:', detailScores);
            console.log('textComment:', textComment);
            console.log('status:', status);
            
            // 先获取当前评价数据
            const currentEval = dbOperations.db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId);
            console.log('当前评价数据:', currentEval);
            
            // 修复：移除不存在的updated_at字段，使用正确的字段名
            let updateFields = [];
            let values = [];
            
            if (overallScore !== null) {
                updateFields.push('overall_score = ?');
                values.push(overallScore);
                console.log('将更新overall_score为:', overallScore);
            } else {
                console.log('overallScore为null，不更新overall_score字段');
            }
            
            if (detailScores !== null) {
                updateFields.push('detailed_scores = ?'); // 使用数据库中实际存在的字段名detailed_scores
                values.push(typeof detailScores === 'object' ? JSON.stringify(detailScores) : detailScores);
                console.log('将更新detailed_scores');
            }
            
            if (textComment !== null) {
                updateFields.push('comments = ?'); // 使用数据库中实际存在的字段名comments
                values.push(textComment);
                console.log('将更新comments');
            }
            
            if (status !== null) {
                updateFields.push('status = ?');
                values.push(status);
                console.log('将更新status为:', status);
            }
            
            // 如果没有字段需要更新，直接返回
            if (updateFields.length === 0) {
                console.log('没有字段需要更新');
                return true;
            }
            
            values.push(evaluationId);
            
            const sql = `UPDATE evaluations SET ${updateFields.join(', ')} WHERE id = ?`;
                    // console.log('执行SQL:', sql); // 调试时可启用
        // console.log('参数:', values); // 调试时可启用
            
            const result = dbOperations.db.prepare(sql).run(...values);
            console.log('更新结果:', result);
            
            // 更新后再次查询确认
            const updatedEval = dbOperations.db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId);
            console.log('更新后的评价数据:', updatedEval);
            console.log('=== updateEvaluation 调试结束 ===');
            
            if (result.changes > 0) {
                console.log(`评价更新成功: ID ${evaluationId}`);
                
                // 如果评价完成，更新相关的汇总数据
                if (status === 'completed') {
                    this.updateRatingSummary(evaluationId);
                }
                
                return true;
            }
            return false;
            
        } catch (error) {
            console.error('更新评价失败:', error);
            throw error;
        }
    }

    // 获取评价详情
    getEvaluation(evaluationId) {
        try {
            return dbOperations.db.prepare(`
                SELECT e.*, o.order_number, o.teacher_name, o.user_name
                FROM evaluations e
                LEFT JOIN orders o ON e.order_id = o.id
                WHERE e.id = ?
            `).get(evaluationId);
        } catch (error) {
            console.error('获取评价详情失败:', error);
            return null;
        }
    }

    // 获取用户的所有评价
    getUserEvaluations(userId, type = 'received') {
        try {
            const field = type === 'received' ? 'target_id' : 'evaluator_id';
            
            return dbOperations.db.prepare(`
                SELECT e.*, o.order_number, o.teacher_name, o.user_name
                FROM evaluations e
                LEFT JOIN orders o ON e.order_id = o.id
                WHERE e.${field} = ?
                ORDER BY e.created_at DESC
            `).all(userId);
        } catch (error) {
            console.error('获取用户评价失败:', error);
            return [];
        }
    }

    // 获取商家的所有评价
    getMerchantEvaluations(merchantUserId, type = 'received') {
        try {
            const field = type === 'received' ? 'target_id' : 'evaluator_id';
            
            return dbOperations.db.prepare(`
                SELECT e.*, o.order_number, o.teacher_name, o.user_name
                FROM evaluations e
                LEFT JOIN orders o ON e.order_id = o.id
                WHERE e.${field} = ? AND e.evaluator_type = 'user'
                ORDER BY e.created_at DESC
            `).all(merchantUserId);
        } catch (error) {
            console.error('获取商家评价失败:', error);
            return [];
        }
    }

    // 更新评分汇总数据
    updateRatingSummary(evaluationId) {
        try {
            const evaluation = this.getEvaluation(evaluationId);
            if (!evaluation) return;
            
            if (evaluation.evaluator_type === 'user') {
                // 用户评价商家，更新商家评分
                this.updateMerchantRating(evaluation.target_id);
            } else {
                // 商家评价用户，更新用户评分
                this.updateUserRating(evaluation.target_id);
            }
            
        } catch (error) {
            console.error('更新评分汇总失败:', error);
        }
    }

    // 更新商家评分汇总
    updateMerchantRating(merchantUserId) {
        try {
            // 获取商家信息
            const merchant = dbOperations.getMerchantByUserId(merchantUserId);
            if (!merchant) return;
            
            // 计算商家的评价统计
            const stats = dbOperations.db.prepare(`
                SELECT 
                    COUNT(*) as total_evaluations,
                    AVG(overall_score) as avg_overall_score,
                    detail_scores
                FROM evaluations 
                WHERE target_id = ? AND evaluator_type = 'user' AND status = 'completed'
            `).get(merchantUserId);
            
            if (stats.total_evaluations === 0) return;
            
            // 计算详细维度平均分
            const detailAvgs = this.calculateDetailAverages(merchantUserId, 'user');
            
            // 更新或插入商家评分汇总
            dbOperations.db.prepare(`
                INSERT OR REPLACE INTO merchant_ratings (
                    merchant_id, total_evaluations, avg_overall_score,
                    avg_length_score, avg_hardness_score, avg_duration_score, avg_technique_score,
                    last_updated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                merchant.id,
                stats.total_evaluations,
                stats.avg_overall_score || 0,
                detailAvgs.length || 0,
                detailAvgs.hardness || 0,
                detailAvgs.duration || 0,
                detailAvgs.technique || 0,
                Math.floor(Date.now() / 1000)
            );
            
            console.log(`商家评分汇总更新成功: 商家ID ${merchant.id}`);
            
        } catch (error) {
            console.error('更新商家评分汇总失败:', error);
        }
    }

    // 更新用户评分汇总
    updateUserRating(userId) {
        try {
            // 计算用户的评价统计
            const stats = dbOperations.db.prepare(`
                SELECT 
                    COUNT(*) as total_evaluations,
                    AVG(overall_score) as avg_overall_score
                FROM evaluations 
                WHERE target_id = ? AND evaluator_type = 'merchant' AND status = 'completed'
            `).get(userId);
            
            if (stats.total_evaluations === 0) return;
            
            // 计算详细维度平均分
            const detailAvgs = this.calculateDetailAverages(userId, 'merchant');
            
            // 更新或插入用户评分汇总
            dbOperations.db.prepare(`
                INSERT OR REPLACE INTO user_ratings (
                    user_id, total_evaluations, avg_overall_score,
                    avg_attitude_score, avg_punctuality_score, avg_cooperation_score,
                    last_updated
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                userId,
                stats.total_evaluations,
                stats.avg_overall_score || 0,
                detailAvgs.attitude || 0,
                detailAvgs.punctuality || 0,
                detailAvgs.cooperation || 0,
                Math.floor(Date.now() / 1000)
            );
            
            console.log(`用户评分汇总更新成功: 用户ID ${userId}`);
            
        } catch (error) {
            console.error('更新用户评分汇总失败:', error);
        }
    }

    // 计算详细维度平均分
    calculateDetailAverages(targetId, evaluatorType) {
        try {
            const evaluations = dbOperations.db.prepare(`
                SELECT detailed_scores 
                FROM evaluations 
                WHERE target_id = ? AND evaluator_type = ? AND status = 'completed' AND detailed_scores IS NOT NULL
            `).all(targetId, evaluatorType);
            
            const totals = {};
            const counts = {};
            
            evaluations.forEach(evaluation => {
                try {
                    const scores = JSON.parse(evaluation.detailed_scores);
                    Object.entries(scores).forEach(([dimension, score]) => {
                        if (typeof score === 'number' && score >= 1 && score <= 10) {
                            totals[dimension] = (totals[dimension] || 0) + score;
                            counts[dimension] = (counts[dimension] || 0) + 1;
                        }
                    });
                } catch (parseError) {
                    console.error('解析详细评分失败:', parseError);
                }
            });
            
            const averages = {};
            Object.keys(totals).forEach(dimension => {
                averages[dimension] = totals[dimension] / counts[dimension];
            });
            
            return averages;
            
        } catch (error) {
            console.error('计算详细维度平均分失败:', error);
            return {};
        }
    }

    // 获取商家排名
    getMerchantRankings(filters = {}) {
        try {
            let whereConditions = ['mr.total_evaluations > 0'];
            let params = [];
            
            // 地区筛选
            if (filters.regionId) {
                whereConditions.push('m.region_id = ?');
                params.push(filters.regionId);
            }
            
            // 价格区间筛选
            if (filters.priceRange) {
                const range = this.getPriceRangeCondition(filters.priceRange);
                if (range) {
                    whereConditions.push(range.condition);
                    params.push(...range.params);
                }
            }
            
            const whereClause = whereConditions.join(' AND ');
            
            const rankings = dbOperations.db.prepare(`
                SELECT 
                    mr.*,
                    m.teacher_name,
                    m.contact,
                    r.name as region_name,
                    CASE 
                        WHEN m.price1 IS NOT NULL AND m.price2 IS NOT NULL THEN m.price1 || '-' || m.price2
                        WHEN m.price1 IS NOT NULL THEN m.price1 || 'p'
                        WHEN m.price2 IS NOT NULL THEN m.price2 || 'pp'
                        ELSE '未设置'
                    END as price_display,
                    ROW_NUMBER() OVER (ORDER BY mr.avg_overall_score DESC) as current_rank
                FROM merchant_ratings mr
                JOIN merchants m ON mr.merchant_id = m.id
                LEFT JOIN regions r ON m.region_id = r.id
                WHERE ${whereClause}
                ORDER BY mr.avg_overall_score DESC
                LIMIT ${filters.limit || 50}
            `).all(...params);
            
            return rankings;
            
        } catch (error) {
            console.error('获取商家排名失败:', error);
            return [];
        }
    }

    // 获取用户排名
    getUserRankings(filters = {}) {
        try {
            const rankings = dbOperations.db.prepare(`
                SELECT 
                    ur.*,
                    ROW_NUMBER() OVER (ORDER BY ur.avg_overall_score DESC) as current_rank
                FROM user_ratings ur
                WHERE ur.total_evaluations > 0
                ORDER BY ur.avg_overall_score DESC
                LIMIT ${filters.limit || 50}
            `).all();
            
            return rankings;
            
        } catch (error) {
            console.error('获取用户排名失败:', error);
            return [];
        }
    }

    // 获取价格区间查询条件
    getPriceRangeCondition(priceRange) {
        switch (priceRange) {
            case '0-500':
                return {
                    condition: '(m.price1 BETWEEN ? AND ? OR m.price2 BETWEEN ? AND ?)',
                    params: [0, 500, 0, 500]
                };
            case '500-1000':
                return {
                    condition: '(m.price1 BETWEEN ? AND ? OR m.price2 BETWEEN ? AND ?)',
                    params: [500, 1000, 500, 1000]
                };
            case '1000-2000':
                return {
                    condition: '(m.price1 BETWEEN ? AND ? OR m.price2 BETWEEN ? AND ?)',
                    params: [1000, 2000, 1000, 2000]
                };
            case '2000+':
                return {
                    condition: '(m.price1 >= ? OR m.price2 >= ?)',
                    params: [2000, 2000]
                };
            default:
                return null;
        }
    }

    // 获取评价统计数据
    getEvaluationStats(filters = {}) {
        try {
            let whereConditions = ['1=1'];
            let params = [];
            
            if (filters.dateFrom) {
                whereConditions.push('date(e.created_at, "unixepoch") >= ?');
                params.push(filters.dateFrom);
            }
            if (filters.dateTo) {
                whereConditions.push('date(e.created_at, "unixepoch") <= ?');
                params.push(filters.dateTo);
            }
            if (filters.evaluatorType) {
                whereConditions.push('e.evaluator_type = ?');
                params.push(filters.evaluatorType);
            }
            
            const whereClause = whereConditions.join(' AND ');
            
            return dbOperations.db.prepare(`
                SELECT 
                    COUNT(*) as total_evaluations,
                    COUNT(CASE WHEN e.status = 'completed' THEN 1 END) as completed_evaluations,
                    AVG(CASE WHEN e.status = 'completed' THEN e.overall_score END) as avg_score,
                    e.evaluator_type
                FROM evaluations e
                WHERE ${whereClause}
                GROUP BY e.evaluator_type
            `).all(...params);
            
        } catch (error) {
            console.error('获取评价统计失败:', error);
            return [];
        }
    }

    // 批量更新所有评分汇总
    updateAllRatings() {
        try {
            console.log('开始批量更新评分汇总...');
            
            // 获取所有有评价的商家用户ID
            const merchantUserIds = dbOperations.db.prepare(`
                SELECT DISTINCT target_id 
                FROM evaluations 
                WHERE evaluator_type = 'user' AND status = 'completed'
            `).all().map(row => row.target_id);
            
            merchantUserIds.forEach(userId => {
                this.updateMerchantRating(userId);
            });
            
            // 获取所有有评价的普通用户ID
            const userIds = dbOperations.db.prepare(`
                SELECT DISTINCT target_id 
                FROM evaluations 
                WHERE evaluator_type = 'merchant' AND status = 'completed'
            `).all().map(row => row.target_id);
            
            userIds.forEach(userId => {
                this.updateUserRating(userId);
            });
            
            console.log(`评分汇总更新完成: ${merchantUserIds.length} 个商家, ${userIds.length} 个用户`);
            
        } catch (error) {
            console.error('批量更新评分汇总失败:', error);
        }
    }
}

module.exports = new EvaluationService(); 
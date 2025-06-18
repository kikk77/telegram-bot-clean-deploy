// 评价管理页面逻辑

class EvaluationManager {
    constructor() {
        this.data = {
            stats: {},
            evaluations: [],
            filteredEvaluations: []
        };
        
        this.init();
    }

    async init() {
        try {
            await this.loadAllData();
            console.log('评价管理初始化完成');
        } catch (error) {
            console.error('评价管理初始化失败:', error);
            notify.error('评价管理初始化失败: ' + error.message);
        }
    }

    async loadAllData() {
        try {
            await Promise.all([
                this.loadStats(),
                this.loadEvaluations()
            ]);
        } catch (error) {
            console.error('加载数据失败:', error);
            throw error;
        }
    }

    async loadStats() {
        try {
            const stats = await api.get('/api/evaluation-stats');
            this.data.stats = stats;
            this.renderStats();
        } catch (error) {
            console.error('加载统计数据失败:', error);
            this.renderStatsError();
        }
    }

    async loadEvaluations() {
        try {
            this.showLoading('evaluationsList');
            const evaluations = await api.get('/api/evaluations');
            this.data.evaluations = evaluations;
            this.data.filteredEvaluations = evaluations;
            this.renderEvaluations();
        } catch (error) {
            console.error('加载评价数据失败:', error);
            this.renderError('evaluationsList', '加载评价数据失败');
        }
    }

    renderStats() {
        const stats = this.data.stats;
        
        document.getElementById('totalOrders').textContent = stats.total_orders || 0;
        document.getElementById('userEvaluated').textContent = stats.user_evaluated || 0;
        document.getElementById('merchantEvaluated').textContent = stats.merchant_evaluated || 0;
        document.getElementById('bothEvaluated').textContent = stats.both_evaluated || 0;
        document.getElementById('completionRate').textContent = (stats.completion_rate || 0) + '%';
    }

    renderStatsError() {
        document.getElementById('totalOrders').textContent = '错误';
        document.getElementById('userEvaluated').textContent = '错误';
        document.getElementById('merchantEvaluated').textContent = '错误';
        document.getElementById('bothEvaluated').textContent = '错误';
        document.getElementById('completionRate').textContent = '错误';
    }

    renderEvaluations() {
        const container = document.getElementById('evaluationsList');
        const evaluations = this.data.filteredEvaluations;

        if (evaluations.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <div class="empty-state-text">暂无评价数据</div>
                    <div class="empty-state-subtext">当有订单产生评价后会在这里显示</div>
                </div>
            `;
            return;
        }

        const html = evaluations.map(evaluation => `
            <div class="evaluation-item" onclick="showEvaluationDetails(${evaluation.id})">
                <div class="evaluation-header">
                    <div class="evaluation-info">
                        <div class="evaluation-title">
                            <strong>订单 #${evaluation.id}</strong>
                            <span class="badge ${this.getStatusBadgeClass(evaluation.eval_status)}">${evaluation.eval_status}</span>
                        </div>
                        <div class="evaluation-meta">
                            <span>👤 ${evaluation.user_name || '未知用户'}</span>
                            <span>👩‍🏫 ${evaluation.teacher_name || '未知老师'}</span>
                            <span>🕒 ${evaluation.order_time}</span>
                        </div>
                    </div>
                    <div class="evaluation-actions">
                        <span class="course-info">${evaluation.course_content} - ${evaluation.price}</span>
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    getStatusBadgeClass(status) {
        switch (status) {
            case '✅ 双向完成': return 'success';
            case '👤 用户已评': return 'info';
            case '👩‍🏫 老师已评': return 'warning';
            case '⏳ 待评价': return 'secondary';
            default: return 'secondary';
        }
    }

    async showEvaluationDetails(evaluationId) {
        try {
            const details = await api.get(`/api/evaluations/${evaluationId}`);
            this.renderEvaluationModal(details);
            document.getElementById('evaluationModal').style.display = 'block';
        } catch (error) {
            console.error('获取评价详情失败:', error);
            notify.error(`获取订单详情失败: ${error.message || error}`);
        }
    }

    renderEvaluationModal(evaluation) {
        const container = document.getElementById('evaluationDetails');
        
        let userEvalHtml = '';
        let merchantEvalHtml = '';

        // 渲染用户评价
        if (evaluation.user_eval_parsed) {
            const userEval = evaluation.user_eval_parsed;
            userEvalHtml = `
                <div class="eval-section">
                    <h4>👤 用户评价</h4>
                    ${this.renderEvaluationScores(userEval.scores)}
                    ${userEval.comments ? `<div class="eval-comment"><strong>评论：</strong>${userEval.comments}</div>` : ''}
                </div>
            `;
        }

        // 渲染商家评价
        if (evaluation.merchant_eval_parsed) {
            const merchantEval = evaluation.merchant_eval_parsed;
            merchantEvalHtml = `
                <div class="eval-section">
                    <h4>👩‍🏫 老师评价</h4>
                    ${this.renderEvaluationScores(merchantEval.scores)}
                    ${merchantEval.comments ? `<div class="eval-comment"><strong>评论：</strong>${merchantEval.comments}</div>` : ''}
                </div>
            `;
        }

        container.innerHTML = `
            <h3>📝 评价详情 - 订单 #${evaluation.id}</h3>
            
            <div class="order-info">
                <div class="info-row">
                    <span class="label">用户：</span>
                    <span>${evaluation.user_name} ${evaluation.user_username ? `(@${evaluation.user_username})` : ''}</span>
                </div>
                <div class="info-row">
                    <span class="label">老师：</span>
                    <span>${evaluation.teacher_name}</span>
                </div>
                <div class="info-row">
                    <span class="label">课程：</span>
                    <span>${evaluation.course_content} - ${evaluation.price}</span>
                </div>
                <div class="info-row">
                    <span class="label">时间：</span>
                    <span>${evaluation.formatted_time}</span>
                </div>
                <div class="info-row">
                    <span class="label">地区：</span>
                    <span>${evaluation.region_name || '未知'}</span>
                </div>
            </div>

            ${userEvalHtml}
            ${merchantEvalHtml}

            ${!evaluation.user_eval_parsed && !evaluation.merchant_eval_parsed ? 
                '<div class="no-eval">暂无评价数据</div>' : ''}
        `;
    }

    renderEvaluationScores(scores) {
        if (!scores) return '';
        
        const scoreLabels = {
            // 你原有的评价标签
            appearance: '👀 外观',
            tightness: '🤏 紧度',
            feet: '🦶 脚部',
            legs: '🦵 腿部',
            waist: '⚖️ 腰部',
            breasts: '🍒 胸部',
            temperament: '💫 气质',
            environment: '🏠 环境',
            sexiness: '💋 性感度',
            attitude: '😊 态度',
            voice: '🎵 声音',
            initiative: '🔥 主动性',
            
            // 添加模拟数据中使用的字段映射
            hardware1: '硬件1',
            hardware2: '硬件2', 
            hardware3: '硬件3',
            software1: '软件1',
            length: '长度',
            thickness: '粗细',
            durability: '持久力',
            technique: '技巧',
            service: '服务',
            skill: '技能',
            value: '性价比',
            punctuality: '准时性',
            communication: '沟通',
            cooperation: '配合度',
            payment: '付款'
        };

        const html = Object.entries(scores)
            .filter(([key, value]) => value !== null && value !== undefined)
            .map(([key, value]) => `
                <div class="score-item">
                    <span class="score-label">${scoreLabels[key] || key}：</span>
                    <span class="score-value">${value}分</span>
                    <div class="score-bar">
                        <div class="score-fill" style="width: ${(value/10)*100}%"></div>
                    </div>
                </div>
            `).join('');

        return `<div class="scores-grid">${html}</div>`;
    }

    filterEvaluations() {
        const filter = document.getElementById('statusFilter').value;
        
        if (filter === 'all') {
            this.data.filteredEvaluations = this.data.evaluations;
        } else {
            const filterMap = {
                'completed': '✅ 双向完成',
                'user_only': '👤 用户已评',
                'merchant_only': '👩‍🏫 老师已评',
                'pending': '⏳ 待评价'
            };
            
            this.data.filteredEvaluations = this.data.evaluations.filter(
                evaluation => evaluation.eval_status === filterMap[filter]
            );
        }
        
        this.renderEvaluations();
    }

    async refresh() {
        try {
            notify.info('正在刷新数据...');
            await this.loadAllData();
            notify.success('数据刷新完成');
        } catch (error) {
            notify.error('刷新失败: ' + error.message);
        }
    }

    showLoading(containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div class="loading-container">
                    <div class="loading">
                        <div class="spinner"></div>
                        <p>加载中...</p>
                    </div>
                </div>
            `;
        }
    }

    renderError(containerId, message) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">❌</div>
                    <div class="error-message">${message}</div>
                    <button class="btn btn-primary btn-small" onclick="evaluationManager.refresh()">
                        重新加载
                    </button>
                </div>
            `;
        }
    }
}

// 全局函数
function showEvaluationDetails(evaluationId) {
    evaluationManager.showEvaluationDetails(evaluationId);
}

function closeEvaluationModal() {
    document.getElementById('evaluationModal').style.display = 'none';
}

function filterEvaluations() {
    evaluationManager.filterEvaluations();
}

function refreshEvaluations() {
    evaluationManager.refresh();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    window.evaluationManager = new EvaluationManager();
});

// 添加专用样式
const evaluationStyle = document.createElement('style');
evaluationStyle.textContent = `
    .filter-controls {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
        align-items: center;
    }

    .filter-controls select {
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: white;
    }

    .evaluation-item {
        padding: 15px;
        border: 1px solid #eee;
        border-radius: 8px;
        margin-bottom: 10px;
        cursor: pointer;
        transition: all 0.3s ease;
    }

    .evaluation-item:hover {
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        transform: translateY(-2px);
    }

    .evaluation-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
    }

    .evaluation-title {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
    }

    .evaluation-meta {
        display: flex;
        gap: 15px;
        font-size: 0.9em;
        color: #666;
    }

    .course-info {
        font-weight: 500;
        color: #2196F3;
    }

    .eval-section {
        margin: 20px 0;
        padding: 15px;
        border: 1px solid #f0f0f0;
        border-radius: 8px;
        background: #fafafa;
    }

    .eval-section h4 {
        margin-bottom: 15px;
        color: #333;
    }

    .scores-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 10px;
        margin-bottom: 15px;
    }

    .score-item {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .score-label {
        font-size: 0.9em;
        color: #666;
        font-weight: 500;
    }

    .score-value {
        font-weight: bold;
        color: #2196F3;
    }

    .score-bar {
        height: 6px;
        background: #e0e0e0;
        border-radius: 3px;
        overflow: hidden;
    }

    .score-fill {
        height: 100%;
        background: linear-gradient(90deg, #4CAF50, #2196F3);
        transition: width 0.3s ease;
    }

    .eval-comment {
        background: white;
        padding: 10px;
        border-radius: 6px;
        border-left: 4px solid #2196F3;
        margin-top: 10px;
    }

    .order-info {
        background: #f8f9fa;
        padding: 15px;
        border-radius: 8px;
        margin-bottom: 20px;
    }

    .info-row {
        display: flex;
        padding: 5px 0;
    }

    .info-row .label {
        min-width: 80px;
        font-weight: 500;
        color: #666;
    }

    .no-eval {
        text-align: center;
        padding: 40px;
        color: #999;
        font-style: italic;
    }

    .badge.secondary {
        background: #6c757d;
        color: white;
    }
`;

document.head.appendChild(evaluationStyle); 
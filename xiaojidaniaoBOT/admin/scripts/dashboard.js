// 仪表盘页面逻辑

class Dashboard {
    constructor() {
        this.data = {
            stats: {},
            merchantBookings: [],
            recentBookings: [],
            messageStats: [],
            buttonStats: []
        };
        
        this.init();
    }

    async init() {
        try {
            await this.loadAllData();
            this.bindEvents();
            console.log('仪表盘初始化完成');
        } catch (error) {
            console.error('仪表盘初始化失败:', error);
            notify.error('仪表盘初始化失败: ' + error.message);
        }
    }

    async loadAllData() {
        try {
            await Promise.all([
                this.loadStats(),
                this.loadMerchantBookingStats(),
                this.loadRecentBookings(),
                this.loadMessageStats(),
                this.loadButtonStats()
            ]);
        } catch (error) {
            console.error('加载数据失败:', error);
            throw error;
        }
    }

    async loadStats() {
        try {
            // 使用优化的统计API获取真实订单数据
            const orderStatsResponse = await api.get('/api/stats/optimized');
            const basicStatsResponse = await api.get('/api/stats');
            
            // 处理不同的API返回格式
            const orderStats = orderStatsResponse.data || orderStatsResponse;
            const basicStats = basicStatsResponse.data || basicStatsResponse;
            
            console.log('订单统计数据:', orderStats);
            console.log('基础统计数据:', basicStats);
            
            // 合并数据
            this.data.stats = {
                // 订单相关数据（来自优化API）
                totalOrders: orderStats.totalOrders || 0,
                bookedOrders: orderStats.bookedOrders || 0,
                incompleteOrders: orderStats.incompleteOrders || 0,
                completedOrders: orderStats.completedOrders || 0,
                avgPrice: orderStats.avgPrice || 0,
                avgUserRating: orderStats.avgUserRating || 0,
                avgMerchantRating: orderStats.avgMerchantRating || 0,
                completionRate: orderStats.completionRate || 0,
                
                // 基础数据（来自基础API）
                totalMerchants: basicStats.totalMerchants || 0,
                totalTemplates: basicStats.totalTemplates || 0,
                totalBindCodes: 35, // 固定值，已知有35个绑定码
                totalRegions: 10, // 固定值，已知有10个地区
                totalClicks: basicStats.totalClicks || 0,
                
                // 用户交互数据
                total_interactions: basicStats.total_interactions || 0,
                unique_users: basicStats.unique_users || 0,
                active_chats: basicStats.active_chats || 0
            };
            
            console.log('合并后的统计数据:', this.data.stats);
            this.renderStats();
        } catch (error) {
            console.error('加载统计数据失败:', error);
            this.renderStatsError();
        }
    }

    async loadMerchantBookingStats() {
        try {
            this.showLoading('merchantBookingStats');
            const response = await api.get('/api/merchant-bookings');
            this.data.merchantBookings = response.data || response;
            this.renderMerchantBookingStats();
        } catch (error) {
            console.error('加载商家预约统计失败:', error);
            this.renderError('merchantBookingStats', '加载商家预约统计失败');
        }
    }

    async loadRecentBookings() {
        try {
            this.showLoading('recentBookings');
            const response = await api.get('/api/recent-bookings');
            this.data.recentBookings = response.data || response;
            this.renderRecentBookings();
        } catch (error) {
            console.error('加载最近预约记录失败:', error);
            this.renderError('recentBookings', '加载最近预约记录失败');
        }
    }

    async loadMessageStats() {
        try {
            this.showLoading('messageStats');
            const response = await api.get('/api/message-stats');
            this.data.messageStats = response.data || response;
            this.renderMessageStats();
        } catch (error) {
            console.error('加载消息统计失败:', error);
            this.renderError('messageStats', '加载消息统计失败');
        }
    }

    async loadButtonStats() {
        try {
            this.showLoading('buttonStats');
            const response = await api.get('/api/button-stats');
            this.data.buttonStats = response.data || response;
            this.renderButtonStats();
        } catch (error) {
            console.error('加载按钮统计失败:', error);
            this.renderError('buttonStats', '加载按钮统计失败');
        }
    }

    renderStats() {
        const stats = this.data.stats;
        
        // 更新新的8个核心指标
        this.updateStatNumber('totalOrders', stats.totalOrders || 0);
        this.updateStatNumber('bookedOrders', stats.bookedOrders || 0);
        this.updateStatNumber('incompleteOrders', stats.incompleteOrders || 0);
        this.updateStatNumber('completedOrders', stats.completedOrders || 0);
        this.updateStatNumber('avgPrice', `¥${stats.avgPrice || 0}`);
        this.updateStatNumber('avgUserRating', stats.avgUserRating > 0 ? `${stats.avgUserRating}/10` : '-');
        this.updateStatNumber('avgMerchantRating', stats.avgMerchantRating > 0 ? `${stats.avgMerchantRating}/10` : '-');
        this.updateStatNumber('completionRate', `${stats.completionRate || 0}%`);
        
        // 更新基础数据 
        this.updateStatNumber('totalMerchants', stats.totalMerchants || 0);
        this.updateStatNumber('totalBookings', stats.totalOrders || 0); // 总订单数 (dashboard.html使用)
        this.updateStatNumber('totalTemplates', stats.totalTemplates || 0);
        this.updateStatNumber('totalBindCodes', stats.totalBindCodes || 0);
        this.updateStatNumber('totalRegions', stats.totalRegions || 0);
        this.updateStatNumber('totalClicks', stats.totalClicks || 0);
        
        // 更新用户交互数据
        this.updateStatNumber('totalInteractions', stats.total_interactions || 0);
        this.updateStatNumber('uniqueUsers', stats.unique_users || 0);
        this.updateStatNumber('activeChats', stats.active_chats || 0);
    }

    renderStatsError() {
        // 显示错误状态
        document.querySelectorAll('.stat-number').forEach(el => {
            el.textContent = '--';
        });
    }

    renderMerchantBookingStats() {
        const container = document.getElementById('merchantBookingStats');
        const stats = this.data.merchantBookings;
        
        if (stats.length === 0) {
            container.innerHTML = this.getEmptyState('📊', '暂无预约记录', '还没有商家收到预约');
            return;
        }

        const html = stats.map(merchant => {
            const bookingDetails = merchant.booking_details ? 
                merchant.booking_details.split('; ').filter(detail => detail.trim()).map(detail => {
                    const [username, courseType, time] = detail.split('|');
                    return `<div class="booking-detail">
                        <span class="user">${username}</span>
                        <span class="course">${courseType}</span>
                        <span class="time">${time}</span>
                    </div>`;
                }).join('') : '';

            return `
                <div class="merchant-stat-item">
                    <div class="merchant-header">
                        <h4>👨‍🏫 ${merchant.teacher_name || '未知老师'}</h4>
                        <div class="merchant-meta">
                            <span class="badge info">📍 ${merchant.region_name || '未设置'}</span>
                            <span class="badge success">预约 ${merchant.booking_count} 次</span>
                        </div>
                    </div>
                    ${bookingDetails ? `
                        <div class="booking-details">
                            <h5>预约详情:</h5>
                            ${bookingDetails}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    renderRecentBookings() {
        const container = document.getElementById('recentBookings');
        const bookings = this.data.recentBookings;
        
        if (bookings.length === 0) {
            container.innerHTML = this.getEmptyState('📅', '暂无最近预约', '还没有用户进行预约');
            return;
        }

        const html = bookings.map(booking => {
            const fullName = `${booking.first_name || ''} ${booking.last_name || ''}`.trim() || '未设置名称';
            const username = booking.username ? `@${booking.username}` : '未设置用户名';
            const displayName = `${fullName}（${username}）`;
            
            return `
                <div class="booking-item">
                    <div class="booking-icon">📅</div>
                    <div class="booking-content">
                        <div class="booking-title">
                            <strong>${displayName}</strong>
                            <span class="badge info">${booking.course_type}</span>
                        </div>
                        <div class="booking-details">
                            <div>👨‍🏫 预约老师: ${booking.teacher_name || '未知'}</div>
                            <div>📍 地区: ${booking.region_name || '未设置'}</div>
                            <div>🕒 预约时间: ${utils.formatDate(booking.booking_time)}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    renderMessageStats() {
        const container = document.getElementById('messageStats');
        const stats = this.data.messageStats;
        
        if (stats.length === 0) {
            container.innerHTML = this.getEmptyState('📊', '暂无消息互动', '还没有消息互动记录');
            return;
        }

        const html = stats.map(stat => {
            const actionTypeText = {
                'click': '按钮点击',
                'template_click': '模板点击',
                'view': '消息浏览'
            }[stat.action_type] || stat.action_type;

            return `
                <div class="message-stat-item">
                    <div class="stat-header">
                        <h4>📊 ${actionTypeText}</h4>
                        <span class="badge info">总次数: ${stat.count}</span>
                    </div>
                    <div class="stat-details">
                        <div>💬 群组ID: <code>${stat.chat_id}</code></div>
                        <div>👥 独立用户: ${stat.unique_users} 人</div>
                        <div>🕒 最后互动: ${stat.last_interaction || '未知'}</div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    renderButtonStats() {
        const container = document.getElementById('buttonStats');
        const stats = this.data.buttonStats;
        
        if (stats.length === 0) {
            container.innerHTML = this.getEmptyState('🔘', '暂无按钮点击', '还没有按钮被点击');
            return;
        }

        const html = stats.map(button => `
            <div class="button-stat-item">
                <div class="button-header">
                    <h4>🔘 ${button.title}</h4>
                    <div class="button-badges">
                        <span class="badge success">点击 ${button.click_count} 次</span>
                        <span class="badge info">互动 ${button.interaction_count} 次</span>
                    </div>
                </div>
                <div class="button-details">
                    <div>👨‍🏫 关联商家: ${button.merchant_name || '无'}</div>
                    <div>🕒 最后点击: ${button.last_click || '从未点击'}</div>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    updateStatNumber(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            // 添加数字动画效果
            this.animateNumber(element, parseInt(element.textContent) || 0, value);
        }
    }

    animateNumber(element, start, end) {
        const duration = 1000; // 1秒动画
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // 使用缓动函数
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const current = Math.round(start + (end - start) * easeOutQuart);
            
            element.textContent = current.toLocaleString();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
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
                    <button class="btn btn-primary btn-small" onclick="dashboard.loadAllData()">
                        重新加载
                    </button>
                </div>
            `;
        }
    }

    getEmptyState(icon, title, subtitle) {
        return `
            <div class="empty-state">
                <div class="empty-state-icon">${icon}</div>
                <div class="empty-state-text">${title}</div>
                <div class="empty-state-subtext">${subtitle}</div>
            </div>
        `;
    }

    bindEvents() {
        // 刷新按钮事件
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refresh();
            });
        }

        // 自动刷新
        this.startAutoRefresh();
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

    startAutoRefresh() {
        // 每5分钟自动刷新一次
        setInterval(() => {
            this.loadStats(); // 只刷新统计数据，避免频繁刷新所有数据
        }, 5 * 60 * 1000);
    }

    // 导出数据功能
    async exportData(type) {
        try {
            const data = await api.get(`/export/${type}`);
            this.downloadData(data, `${type}_${utils.formatDate(new Date(), 'YYYY-MM-DD')}.json`);
            notify.success('数据导出成功');
        } catch (error) {
            notify.error('导出失败: ' + error.message);
        }
    }

    downloadData(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// 页面加载完成后初始化仪表盘
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new Dashboard();
});

// 添加仪表盘专用样式
const dashboardStyle = document.createElement('style');
dashboardStyle.textContent = `
    .merchant-stat-item,
    .booking-item,
    .message-stat-item,
    .button-stat-item {
        padding: 15px;
        border: 1px solid #eee;
        border-radius: 8px;
        margin-bottom: 15px;
        transition: all 0.3s ease;
    }

    .merchant-stat-item:hover,
    .booking-item:hover,
    .message-stat-item:hover,
    .button-stat-item:hover {
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        transform: translateY(-2px);
    }

    .merchant-header,
    .stat-header,
    .button-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
    }

    .merchant-meta,
    .button-badges {
        display: flex;
        gap: 8px;
    }

    .booking-details {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid #f0f0f0;
    }

    .booking-details h5 {
        margin-bottom: 8px;
        font-size: 0.9em;
        color: #666;
    }

    .booking-detail {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        font-size: 0.85em;
        color: #555;
    }

    .booking-item {
        display: flex;
        align-items: flex-start;
        gap: 15px;
    }

    .booking-icon {
        font-size: 1.5em;
        margin-top: 5px;
    }

    .booking-content {
        flex: 1;
    }

    .booking-title {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
    }

    .booking-details div {
        margin-bottom: 4px;
        font-size: 0.9em;
        color: #666;
    }

    .stat-details,
    .button-details {
        font-size: 0.9em;
        color: #666;
    }

    .stat-details div,
    .button-details div {
        margin-bottom: 4px;
    }

    .error-state {
        text-align: center;
        padding: 40px 20px;
        color: #666;
    }

    .error-icon {
        font-size: 2em;
        margin-bottom: 10px;
    }

    .error-message {
        margin-bottom: 15px;
        font-weight: 500;
    }
`;
document.head.appendChild(dashboardStyle); 
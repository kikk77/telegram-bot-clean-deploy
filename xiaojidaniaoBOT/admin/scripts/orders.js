// 订单管理系统优化版本
class OptimizedOrdersManager {
    constructor() {
        // 基础配置
        this.currentPage = 1;
        this.pageSize = 50; // 增加页面大小以减少请求次数
        this.totalPages = 1;
        this.totalOrders = 0;
        
        // 缓存管理
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存
        
        // 图表实例
        this.charts = {};
        this.chartsLoaded = new Set();
        
        // 虚拟滚动配置
        this.virtualScroll = {
            itemHeight: 60,
            containerHeight: 500,
            visibleItems: 0,
            scrollTop: 0,
            totalItems: 0,
            renderBuffer: 5
        };
        
        // 懒加载观察器
        this.lazyObserver = null;
        
        // 防抖定时器
        this.debounceTimers = {};
        
        this.init();
    }

    init() {
        this.setupVirtualScroll();
        this.setupEventListeners();
        this.loadInitialData();
        
        // 直接加载所有图表，不使用懒加载
        setTimeout(() => {
            console.log('开始加载所有图表...');
            this.loadAllCharts();
        }, 1000);
    }

    // 设置懒加载
    setupLazyLoading() {
        if ('IntersectionObserver' in window) {
            this.lazyObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const chartId = entry.target.dataset.chartId;
                        if (chartId && !this.chartsLoaded.has(chartId)) {
                            this.loadChart(chartId);
                            this.chartsLoaded.add(chartId);
                            this.lazyObserver.unobserve(entry.target);
                        }
                    }
                });
            }, {
                rootMargin: '50px 0px', // 提前50px开始加载
                threshold: 0.1
            });

            // 观察所有图表容器
            document.querySelectorAll('.chart-container canvas').forEach(canvas => {
                canvas.dataset.chartId = canvas.id;
                this.lazyObserver.observe(canvas);
            });
        } else {
            // 降级处理：直接加载所有图表
            this.loadAllCharts();
        }
    }

    // 设置虚拟滚动
    setupVirtualScroll() {
        const tableContainer = document.querySelector('.table-container');
        if (!tableContainer) return;

        const tbody = document.getElementById('ordersTableBody');
        if (!tbody) return;

        // 创建虚拟滚动容器
        const virtualContainer = document.createElement('div');
        virtualContainer.className = 'virtual-scroll-container';
        virtualContainer.style.height = `${this.virtualScroll.containerHeight}px`;
        virtualContainer.style.overflow = 'auto';
        virtualContainer.style.position = 'relative';

        // 创建内容容器
        const contentContainer = document.createElement('div');
        contentContainer.className = 'virtual-scroll-content';
        contentContainer.style.position = 'relative';

        // 创建可见区域
        const visibleContainer = document.createElement('div');
        visibleContainer.className = 'virtual-scroll-visible';
        visibleContainer.style.position = 'absolute';
        visibleContainer.style.top = '0';
        visibleContainer.style.width = '100%';

        contentContainer.appendChild(visibleContainer);
        virtualContainer.appendChild(contentContainer);

        // 替换原表格容器
        tableContainer.appendChild(virtualContainer);

        // 监听滚动事件
        virtualContainer.addEventListener('scroll', this.debounce(() => {
            this.handleVirtualScroll(virtualContainer, visibleContainer);
        }, 16)); // 60fps

        this.virtualContainer = virtualContainer;
        this.visibleContainer = visibleContainer;
        this.contentContainer = contentContainer;
    }

    // 虚拟滚动处理
    handleVirtualScroll(container, visibleContainer) {
        const scrollTop = container.scrollTop;
        const startIndex = Math.floor(scrollTop / this.virtualScroll.itemHeight);
        const endIndex = Math.min(
            startIndex + Math.ceil(this.virtualScroll.containerHeight / this.virtualScroll.itemHeight) + this.virtualScroll.renderBuffer,
            this.virtualScroll.totalItems
        );

        this.renderVisibleItems(visibleContainer, startIndex, endIndex);
    }

    // 渲染可见项目
    renderVisibleItems(container, startIndex, endIndex) {
        // 清空容器
        container.innerHTML = '';

        // 设置容器位置
        container.style.transform = `translateY(${startIndex * this.virtualScroll.itemHeight}px)`;

        // 渲染可见项目
        for (let i = startIndex; i < endIndex; i++) {
            if (this.ordersData && this.ordersData[i]) {
                const orderElement = this.createOrderElement(this.ordersData[i], i);
                container.appendChild(orderElement);
            }
        }
    }

    // 创建订单元素
    createOrderElement(order, index) {
        const row = document.createElement('div');
        row.className = 'virtual-order-row';
        row.style.height = `${this.virtualScroll.itemHeight}px`;
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.borderBottom = '1px solid #eee';
        row.style.padding = '0 15px';

        row.innerHTML = `
            <div class="order-cell" style="flex: 1;">${order.order_number}</div>
            <div class="order-cell" style="flex: 1.5;">${order.user_name || order.username || '未知用户'}</div>
            <div class="order-cell" style="flex: 1.5;">${order.merchant_name || '未知商家'}</div>
            <div class="order-cell" style="flex: 1;">${order.course_content || '-'}</div>
            <div class="order-cell" style="flex: 0.8;">¥${order.actual_price || order.price || 0}</div>
            <div class="order-cell" style="flex: 0.8;">
                <span class="status-badge status-${order.status}">${this.getStatusText(order.status)}</span>
            </div>
            <div class="order-cell" style="flex: 1.2;">${this.formatDate(order.created_at)}</div>
            <div class="order-cell" style="flex: 1;">
                ${order.user_evaluation_status === 'completed' && order.merchant_evaluation_status === 'completed' ? 
                    '<span class="eval-complete">已完成</span>' : 
                    '<span class="eval-pending">待评价</span>'}
            </div>
            <div class="order-cell" style="flex: 0.8;">
                <button class="btn btn-sm btn-primary" onclick="ordersManager.showOrderDetails('${order.id}')">详情</button>
            </div>
        `;

        return row;
    }

    // 设置事件监听器
    setupEventListeners() {
        // 时间范围变化
        document.getElementById('timeRange').addEventListener('change', (e) => {
            this.handleTimeRangeChange(e.target.value);
        });

        // 搜索防抖
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.debounce(() => {
                this.searchOrders(e.target.value);
            }, 300)();
        });

        // 窗口大小变化时重新计算虚拟滚动
        window.addEventListener('resize', this.debounce(() => {
            this.recalculateVirtualScroll();
        }, 250));

        // 页面可见性变化时刷新数据
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.refreshStaleData();
            }
        });
    }

    // 防抖函数
    debounce(func, wait, immediate = false) {
        return (...args) => {
            const later = () => {
                if (!immediate) func.apply(this, args);
            };
            const callNow = immediate && !this.debounceTimers[func.name];
            clearTimeout(this.debounceTimers[func.name]);
            this.debounceTimers[func.name] = setTimeout(later, wait);
            if (callNow) func.apply(this, args);
        };
    }

    // 缓存管理
    setCache(key, data, timeout = null) {
        const expireTime = Date.now() + (timeout || this.cacheTimeout);
        this.cache.set(key, {
            data: JSON.parse(JSON.stringify(data)), // 深拷贝
            expireTime,
            timestamp: Date.now()
        });
    }

    getCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        if (Date.now() > cached.expireTime) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data;
    }

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

    // 获取缓存键
    getCacheKey(type, params = {}) {
        return `${type}_${JSON.stringify(params)}`;
    }

    // 加载初始数据
    async loadInitialData() {
        this.showLoading(true);
        
        try {
            // 并行加载基础数据
            const [regions, merchants] = await Promise.all([
                this.fetchRegions(),
                this.fetchMerchants()
            ]);

            this.populateFilters(regions, merchants);
            
            // 加载仪表板数据
            await this.updateDashboard();
            
            // 加载订单列表
            await this.loadOrders();

        } catch (error) {
            console.error('加载初始数据失败:', error);
            this.showError('加载数据失败，请刷新页面重试');
        } finally {
            this.showLoading(false);
        }
    }

    // 优化的API请求
    async fetchWithCache(url, params = {}, cacheTimeout = null) {
        const cacheKey = this.getCacheKey(url, params);
        
        // 尝试从缓存获取
        const cached = this.getCache(cacheKey);
        if (cached) {
            return { ...cached, fromCache: true };
        }

        try {
            const queryString = new URLSearchParams(params).toString();
            const fullUrl = queryString ? `${url}?${queryString}` : url;
            
            const response = await fetch(fullUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // 缓存结果
            this.setCache(cacheKey, data, cacheTimeout);
            
            return { ...data, fromCache: false };
            
        } catch (error) {
            console.error(`API请求失败 (${url}):`, error);
            throw error;
        }
    }

    // 懒加载图表
    async loadChart(chartId) {
        try {
            console.log(`开始加载图表: ${chartId}`);
            const canvas = document.getElementById(chartId);
            if (!canvas) {
                console.error(`找不到图表canvas元素: ${chartId}`);
                return;
            }

            // 显示加载指示器
            const container = canvas.closest('.chart-container');
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'chart-loading';
            loadingDiv.innerHTML = '<div class="loading-spinner"></div><div>加载图表中...</div>';
            container.appendChild(loadingDiv);

            // 获取图表数据
            console.log(`获取图表数据: ${chartId}`);
            const chartData = await this.fetchChartData(chartId);
            console.log(`图表数据获取成功 (${chartId}):`, chartData);
            
            // 创建图表
            console.log(`创建图表: ${chartId}`);
            this.createChart(chartId, chartData);
            console.log(`图表创建完成: ${chartId}`);
            
            // 移除加载指示器
            container.removeChild(loadingDiv);
            
        } catch (error) {
            console.error(`加载图表失败 (${chartId}):`, error);
            this.showChartError(chartId);
        }
    }

    // 获取图表数据
    async fetchChartData(chartId) {
        const filters = this.getCurrentFilters();
        
        let response;
        switch (chartId) {
            case 'ordersChart':
                response = await this.fetchWithCache('/api/charts/orders-trend', filters);
                break;
            case 'regionChart':
                response = await this.fetchWithCache('/api/charts/region-distribution', filters);
                break;
            case 'priceChart':
                response = await this.fetchWithCache('/api/charts/price-distribution', filters);
                break;
            case 'statusChart':
                response = await this.fetchWithCache('/api/charts/status-distribution', filters);
                break;
            default:
                throw new Error(`未知图表类型: ${chartId}`);
        }
        
        // 处理API返回的数据格式
        return response.data || response;
    }

    // 创建图表
    createChart(chartId, data) {
        const canvas = document.getElementById(chartId);
        const ctx = canvas.getContext('2d');

        // 销毁已存在的图表
        if (this.charts[chartId]) {
            this.charts[chartId].destroy();
        }

        const config = this.getChartConfig(chartId, data);
        this.charts[chartId] = new Chart(ctx, config);
    }

    // 获取图表配置
    getChartConfig(chartId, data) {
        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            animation: {
                duration: 750,
                easing: 'easeInOutQuart'
            }
        };

        switch (chartId) {
            case 'ordersChart':
                return {
                    type: 'line',
                    data: {
                        labels: data.labels || [],
                        datasets: [{
                            label: '订单数量',
                            data: data.values || [],
                            borderColor: '#4f46e5',
                            backgroundColor: 'rgba(79, 70, 229, 0.1)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: {
                        ...commonOptions,
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    precision: 0
                                }
                            }
                        }
                    }
                };

            case 'regionChart':
                return {
                    type: 'pie',
                    data: {
                        labels: data.labels || [],
                        datasets: [{
                            data: data.values || [],
                            backgroundColor: [
                                '#4f46e5', '#06b6d4', '#10b981', 
                                '#f59e0b', '#ef4444', '#8b5cf6'
                            ]
                        }]
                    },
                    options: commonOptions
                };

            case 'priceChart':
                return {
                    type: 'bar',
                    data: {
                        labels: data.labels || [],
                        datasets: [{
                            label: '订单数量',
                            data: data.values || [],
                            backgroundColor: '#10b981'
                        }]
                    },
                    options: {
                        ...commonOptions,
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    precision: 0
                                }
                            }
                        }
                    }
                };

            case 'statusChart':
                return {
                    type: 'doughnut',
                    data: {
                        labels: data.labels || [],
                        datasets: [{
                            data: data.values || [],
                            backgroundColor: ['#10b981', '#4f46e5', '#f59e0b', '#ef4444']
                        }]
                    },
                    options: commonOptions
                };

            default:
                return { type: 'bar', data: { labels: [], datasets: [] }, options: commonOptions };
        }
    }

    // 分页加载订单
    async loadOrders(page = 1, append = false) {
        try {
            const filters = this.getCurrentFilters();
            const params = {
                page,
                pageSize: this.pageSize,
                ...filters
            };

            const response = await this.fetchWithCache('/api/orders', params);
            
            if (response.success) {
                if (append) {
                    this.ordersData = [...(this.ordersData || []), ...response.data.orders];
                } else {
                    this.ordersData = response.data.orders;
                }
                
                this.totalOrders = response.data.total;
                this.totalPages = Math.ceil(this.totalOrders / this.pageSize);
                this.currentPage = page;
                
                // 更新虚拟滚动
                this.updateVirtualScroll();
                
                // 更新分页信息
                this.updatePaginationInfo();
                
            } else {
                throw new Error(response.message || '加载订单失败');
            }
            
        } catch (error) {
            console.error('加载订单失败:', error);
            this.showError('加载订单失败: ' + error.message);
        }
    }

    // 更新虚拟滚动
    updateVirtualScroll() {
        if (!this.ordersData) return;

        this.virtualScroll.totalItems = this.ordersData.length;
        
        // 更新内容容器高度
        if (this.contentContainer) {
            const totalHeight = this.virtualScroll.totalItems * this.virtualScroll.itemHeight;
            this.contentContainer.style.height = `${totalHeight}px`;
        }

        // 重新渲染可见项目
        if (this.virtualContainer && this.visibleContainer) {
            this.handleVirtualScroll(this.virtualContainer, this.visibleContainer);
        }
    }

    // 无限滚动加载
    setupInfiniteScroll() {
        if (!this.virtualContainer) return;

        this.virtualContainer.addEventListener('scroll', this.debounce(() => {
            const { scrollTop, scrollHeight, clientHeight } = this.virtualContainer;
            
            // 当滚动到底部附近时加载更多
            if (scrollTop + clientHeight >= scrollHeight - 100) {
                if (this.currentPage < this.totalPages && !this.isLoading) {
                    this.loadOrders(this.currentPage + 1, true);
                }
            }
        }, 100));
    }

    // 获取当前筛选条件
    getCurrentFilters() {
        return {
            timeRange: document.getElementById('timeRange').value,
            dateFrom: document.getElementById('dateFrom')?.value,
            dateTo: document.getElementById('dateTo')?.value,
            regionId: document.getElementById('regionFilter').value,
            priceRange: document.getElementById('priceRangeFilter').value,
            merchantId: document.getElementById('merchantFilter').value,
            status: document.getElementById('statusFilter')?.value,
            courseType: document.getElementById('courseTypeFilter')?.value,
            search: document.getElementById('searchInput').value
        };
    }

    // 更新仪表板
    async updateDashboard() {
        try {
            const filters = this.getCurrentFilters();
            const response = await this.fetchWithCache('/api/stats/optimized', filters);
            
            // 处理不同的API返回格式
            const stats = response.data || response;
            
            console.log('Orders页面获取到的统计数据:', stats);
            
            if (stats) {
                this.updateMetricCards(stats);
                
                // 标记需要重新加载的图表
                this.chartsLoaded.clear();
                
                // 重新观察图表以触发懒加载
                document.querySelectorAll('.chart-container canvas').forEach(canvas => {
                    if (this.lazyObserver) {
                        this.lazyObserver.observe(canvas);
                    }
                });
            } else {
                console.error('未获取到有效的统计数据');
                this.showError('未获取到有效的统计数据');
            }
            
        } catch (error) {
            console.error('更新仪表板失败:', error);
            this.showError('更新仪表板失败: ' + error.message);
        }
    }

    // 更新指标卡片
    updateMetricCards(data) {
        const metrics = {
            totalOrders: data.totalOrders || 0,
            confirmedOrders: data.confirmedOrders || 0,
            completedOrders: data.completedOrders || 0,
            avgPrice: data.avgPrice || 0,
            avgRating: data.avgRating || 0,
            completionRate: data.completionRate || 0
        };

        Object.entries(metrics).forEach(([key, value]) => {
            const element = document.getElementById(key);
            if (element) {
                if (key === 'avgPrice') {
                    element.textContent = `¥${value.toFixed(2)}`;
                } else if (key === 'avgRating') {
                    element.textContent = value.toFixed(1);
                } else if (key === 'completionRate') {
                    element.textContent = `${(value * 100).toFixed(1)}%`;
                } else {
                    element.textContent = value.toLocaleString();
                }
            }
        });
    }

    // 刷新过期数据
    refreshStaleData() {
        const now = Date.now();
        const staleThreshold = 2 * 60 * 1000; // 2分钟

        for (const [key, cached] of this.cache.entries()) {
            if (now - cached.timestamp > staleThreshold) {
                this.cache.delete(key);
            }
        }

        // 如果有过期数据，重新加载
        if (this.cache.size === 0) {
            this.updateDashboard();
            this.loadOrders();
        }
    }

    // 工具方法
    formatDate(timestamp) {
        if (!timestamp) return '-';
        const date = new Date(timestamp * 1000);
        return date.toLocaleString('zh-CN');
    }

    getStatusText(status) {
        const statusMap = {
            'pending': '待确认',
            'confirmed': '已确认', 
            'completed': '已完成',
            'cancelled': '已取消'
        };
        return statusMap[status] || status;
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = show ? 'flex' : 'none';
        }
        this.isLoading = show;
    }

    showError(message) {
        // 可以实现更好的错误提示UI
        console.error(message);
        alert(message);
    }

    showChartError(chartId) {
        const canvas = document.getElementById(chartId);
        const container = canvas.closest('.chart-container');
        container.innerHTML = `
            <h3>${container.querySelector('h3').textContent}</h3>
            <div class="chart-error">
                <div>📊</div>
                <div>图表加载失败</div>
                <button onclick="ordersManager.retryLoadChart('${chartId}')">重试</button>
            </div>
        `;
    }

    retryLoadChart(chartId) {
        this.chartsLoaded.delete(chartId);
        this.loadChart(chartId);
    }

    // 公共方法
    async refreshData() {
        this.clearCache();
        await this.loadInitialData();
    }

    async searchOrders(query) {
        this.currentPage = 1;
        await this.loadOrders();
    }

    async changePage(direction) {
        const newPage = this.currentPage + direction;
        if (newPage >= 1 && newPage <= this.totalPages) {
            await this.loadOrders(newPage);
        }
    }

    updatePaginationInfo() {
        const pageInfo = document.getElementById('pageInfo');
        if (pageInfo) {
            pageInfo.textContent = `第 ${this.currentPage} 页，共 ${this.totalPages} 页`;
        }

        // 更新按钮状态
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        
        if (prevBtn) prevBtn.disabled = this.currentPage <= 1;
        if (nextBtn) nextBtn.disabled = this.currentPage >= this.totalPages;
    }

    // 占位方法（需要根据实际API实现）
    async fetchRegions() {
        return await this.fetchWithCache('/api/regions');
    }

    async fetchMerchants() {
        return await this.fetchWithCache('/api/merchants');
    }

    populateFilters(regions, merchants) {
        // 实现筛选器填充逻辑
    }

    handleTimeRangeChange(value) {
        // 实现时间范围变化处理
    }

    recalculateVirtualScroll() {
        // 重新计算虚拟滚动参数
    }

    showOrderDetails(orderId) {
        // 显示订单详情
        this.fetchOrderDetails(orderId);
    }

    async fetchOrderDetails(orderId) {
        try {
            this.showLoading(true);
            const response = await fetch(`/api/orders/${orderId}`);
            const result = await response.json();
            
            if (result.success) {
                this.displayOrderDetailsModal(result.data);
            } else {
                this.showError('获取订单详情失败: ' + (result.error || result.message || '未知错误'));
            }
        } catch (error) {
            console.error('获取订单详情失败:', error);
            this.showError('获取订单详情失败: ' + (error.message || error));
        } finally {
            this.showLoading(false);
        }
    }

    displayOrderDetailsModal(order) {
        // 创建模态框
        const modal = document.createElement('div');
        modal.className = 'order-details-modal';
        modal.id = 'orderDetailsModal';
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-container">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <span class="order-icon">📋</span>
                            订单详情 - #${order.id}
                        </h3>
                        <button type="button" class="modal-close" onclick="this.closest('.order-details-modal').remove()">
                            <span>×</span>
                        </button>
                    </div>
                    
                    <div class="modal-content">
                        <!-- 基本信息 -->
                        <div class="info-section">
                            <div class="section-title">
                                <span class="section-icon">ℹ️</span>
                                基本信息
                            </div>
                            <div class="info-grid">
                                <div class="info-item">
                                    <span class="info-label">订单ID</span>
                                    <span class="info-value">#${order.id}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">用户</span>
                                    <span class="info-value">${order.user_name || '未知用户'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">用户名</span>
                                    <span class="info-value">${order.user_username || '-'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">商家</span>
                                    <span class="info-value">${order.teacher_name || '未知商家'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">联系方式</span>
                                    <span class="info-value">${order.teacher_contact || '-'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">课程内容</span>
                                    <span class="info-value">${order.course_content || '-'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">价格</span>
                                    <span class="info-value price">¥${order.price || 0}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">状态</span>
                                    <span class="status-badge status-${order.status}">${this.getStatusText(order.status)}</span>
                                </div>
                            </div>
                        </div>

                        <!-- 时间信息 -->
                        <div class="info-section">
                            <div class="section-title">
                                <span class="section-icon">🕒</span>
                                时间信息
                            </div>
                            <div class="info-grid">
                                <div class="info-item">
                                    <span class="info-label">预约时间</span>
                                    <span class="info-value">${this.formatDate(order.booking_time)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">创建时间</span>
                                    <span class="info-value">${this.formatDate(order.created_at)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">更新时间</span>
                                    <span class="info-value">${this.formatDate(order.updated_at)}</span>
                                </div>
                            </div>
                        </div>
                        
                        ${order.user_evaluation ? `
                        <div class="evaluation-section">
                            <div class="section-title">
                                <span class="section-icon">👤</span>
                                用户评价
                            </div>
                            <div class="evaluation-content">
                                ${this.renderEvaluation(order.user_evaluation)}
                            </div>
                        </div>
                        ` : ''}
                        
                        ${order.merchant_evaluation ? `
                        <div class="evaluation-section">
                            <div class="section-title">
                                <span class="section-icon">👩‍🏫</span>
                                商家评价
                            </div>
                            <div class="evaluation-content">
                                ${this.renderEvaluation(order.merchant_evaluation)}
                            </div>
                        </div>
                        ` : ''}
                        
                        ${order.report_content ? `
                        <div class="info-section">
                            <div class="section-title">
                                <span class="section-icon">📄</span>
                                报告内容
                            </div>
                            <div class="report-content">
                                <pre>${order.report_content}</pre>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.order-details-modal').remove()">
                            关闭
                        </button>
                    </div>
                </div>
            </div>
        `;

        // 移除现有模态框
        const existingModal = document.getElementById('orderDetailsModal');
        if (existingModal) {
            existingModal.remove();
        }

        // 添加到页面
        document.body.appendChild(modal);

        // 点击背景关闭
        modal.querySelector('.modal-overlay').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                modal.remove();
            }
        });

        // 阻止模态框内容区域的点击事件冒泡
        modal.querySelector('.modal-container').addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // ESC键关闭
        const handleEscKey = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleEscKey);
            }
        };
        document.addEventListener('keydown', handleEscKey);

        // 当模态框被移除时清理事件监听器
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.removedNodes.forEach((node) => {
                        if (node === modal) {
                            document.removeEventListener('keydown', handleEscKey);
                            observer.disconnect();
                        }
                    });
                }
            });
        });
        observer.observe(document.body, { childList: true });
    }

    renderEvaluation(evaluationData) {
        try {
            const evaluation = typeof evaluationData === 'string' ? JSON.parse(evaluationData) : evaluationData;
            
            let html = `<div class="evaluation-display">`;
            
            // 总体评分
            if (evaluation.overall_score) {
                html += `
                <div class="overall-score">
                    <span class="score-label">总体评分</span>
                    <div class="score-display">
                        <span class="score-number">${evaluation.overall_score}</span>
                        <span class="score-max">/10</span>
                        <div class="score-stars">
                            ${this.renderStars(evaluation.overall_score)}
                        </div>
                    </div>
                </div>`;
            }
            
            // 详细评分
            if (evaluation.scores) {
                html += `<div class="detailed-scores">`;
                html += `<div class="scores-title">详细评分</div>`;
                html += `<div class="scores-grid">`;
                
                Object.entries(evaluation.scores).forEach(([key, score]) => {
                    const labels = {
                        // 原有标签
                        service: '服务态度',
                        skill: '专业技能', 
                        environment: '环境卫生',
                        value: '性价比',
                        punctuality: '准时性',
                        communication: '沟通能力',
                        
                        // 添加模拟数据中的标签映射
                        hardware1: '硬件1',
                        hardware2: '硬件2', 
                        hardware3: '硬件3',
                        software1: '软件1',
                        length: '长度',
                        thickness: '粗细',
                        durability: '持久力',
                        technique: '技巧'
                    };
                    
                    html += `
                    <div class="score-item">
                        <div class="score-item-header">
                            <span class="score-item-label">${labels[key] || key}</span>
                            <span class="score-item-value">${score}/10</span>
                        </div>
                        <div class="score-bar">
                            <div class="score-fill" style="width: ${(score/10)*100}%"></div>
                        </div>
                    </div>`;
                });
                
                html += `</div></div>`;
            }
            
            // 评价内容
            if (evaluation.comments) {
                html += `
                <div class="evaluation-comment">
                    <div class="comment-title">评价内容</div>
                    <div class="comment-text">${evaluation.comments}</div>
                </div>`;
            }
            
            html += `</div>`;
            return html;
        } catch (error) {
            console.error('评价数据解析错误:', error);
            return `<div class="evaluation-error">评价数据格式错误: ${error.message}</div>`;
        }
    }

    renderStars(score) {
        const fullStars = Math.floor(score / 2);
        const halfStar = (score % 2) >= 1;
        const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);
        
        let stars = '';
        for (let i = 0; i < fullStars; i++) {
            stars += '<span class="star star-full">★</span>';
        }
        if (halfStar) {
            stars += '<span class="star star-half">☆</span>';
        }
        for (let i = 0; i < emptyStars; i++) {
            stars += '<span class="star star-empty">☆</span>';
        }
        
        return stars;
    }

    loadAllCharts() {
        // 加载所有图表（降级方案）
        ['ordersChart', 'regionChart', 'priceChart', 'statusChart'].forEach(chartId => {
            this.loadChart(chartId);
        });
    }
}

// 初始化管理器
const ordersManager = new OptimizedOrdersManager();

// 全局方法（保持向后兼容）
window.refreshData = () => ordersManager.refreshData();
window.searchOrders = (query) => ordersManager.searchOrders(query);
window.changePage = (direction) => ordersManager.changePage(direction);
window.updateDashboard = () => ordersManager.updateDashboard();

console.log('订单管理系统优化版本已加载'); 
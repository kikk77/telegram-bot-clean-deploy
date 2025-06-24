// 排名管理系统 - 重构版
class RankingManager {
    constructor() {
        this.apiClient = window.api || null;
        this.currentYear = 2025;
        this.currentMonth = 6;
        this.currentMerchantRanking = null;
        this.currentUserRanking = null;
    }

    async init() {
        try {
            console.log('初始化排名管理器...');
            
            // 设置默认时间
            this.currentYear = 2025;
            this.currentMonth = 6;
            
            // 初始化年月选择器
            this.initDateSelectors();
            
            // 初始化事件监听器
            this.initEventListeners();
            
            // 自动加载上方综合排名系统的数据
            setTimeout(() => {
                this.showRankingTab('merchant');
            }, 500);
            
            // 预加载用户排名数据
            setTimeout(() => {
                this.loadUserRanking();
            }, 1000);

            // 加载地区数据
            this.loadRegions();

            // 更新统计数据
            this.updateRankingStats();
            
            console.log('排名管理器初始化完成');
        } catch (error) {
            console.error('排名管理器初始化失败:', error);
            if (window.notificationSystem) {
                window.notificationSystem.show('排名系统初始化失败: ' + error.message, 'error');
            }
        }
    }

    // 初始化日期选择器
    initDateSelectors() {
        const yearSelect = document.getElementById('rankingYear');
        const monthSelect = document.getElementById('rankingMonth');
        
        if (yearSelect) {
            yearSelect.innerHTML = '';
            for (let year = 2025; year >= 2023; year--) {
                const option = new Option(year + '年', year);
                yearSelect.add(option);
            }
            yearSelect.value = this.currentYear;
        }
        
        if (monthSelect) {
            monthSelect.value = this.currentMonth;
        }
    }

    // 初始化事件监听器
    initEventListeners() {
        // 排名类型切换
        const rankingTypeRadios = document.querySelectorAll('input[name="rankingType"]');
        rankingTypeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.switchRankingType(e.target.value);
            });
        });

        // 年月变化监听
        const yearSelect = document.getElementById('rankingYear');
        const monthSelect = document.getElementById('rankingMonth');
        
        if (yearSelect) {
            yearSelect.addEventListener('change', () => {
                this.currentYear = parseInt(yearSelect.value);
                this.loadRankings(); // 重新加载数据
            });
        }
        
        if (monthSelect) {
            monthSelect.addEventListener('change', () => {
                this.currentMonth = parseInt(monthSelect.value);
                this.loadRankings(); // 重新加载数据
            });
        }

        // 商家排名筛选器事件监听
        const merchantRankingType = document.getElementById('merchantRankingType');
        const merchantRankingRegion = document.getElementById('merchantRankingRegion');
        const merchantRankingPeriod = document.getElementById('merchantRankingPeriod');

        if (merchantRankingType) {
            merchantRankingType.addEventListener('change', () => {
                this.updateMerchantRankings();
            });
        }

        if (merchantRankingRegion) {
            merchantRankingRegion.addEventListener('change', () => {
                this.updateMerchantRankings();
            });
        }

        if (merchantRankingPeriod) {
            merchantRankingPeriod.addEventListener('change', () => {
                this.updateMerchantRankings();
            });
        }
    }

    // 加载排名数据
    async loadRankings() {
        try {
            console.log('=== 加载排名数据 ===');
            console.log('当前年月:', this.currentYear, this.currentMonth);
            
            if (window.loadingManager) {
                window.loadingManager.show('加载排名数据中...');
            }

            // 获取当前选择的排名类型
            const selectedType = document.querySelector('input[name="rankingType"]:checked')?.value || 'merchant';
            
            if (selectedType === 'merchant') {
                await this.loadMerchantRanking();
                this.displayMerchantRanking();
            } else {
                await this.loadUserRanking();
                this.displayUserRanking();
            }

            if (window.notificationSystem) {
                window.notificationSystem.show('排名数据加载成功', 'success');
            }

        } catch (error) {
            console.error('加载排名失败:', error);
            if (window.notificationSystem) {
                window.notificationSystem.show('加载排名数据失败: ' + error.message, 'error');
            } else {
                alert('加载排名数据失败: ' + error.message);
            }
        } finally {
            if (window.loadingManager) {
                window.loadingManager.hide();
            }
        }
    }

    // 加载商家排名
    async loadMerchantRanking() {
        try {
            // 获取筛选参数
            const rankingType = document.getElementById('merchantRankingType')?.value || 'monthlyOrders';
            const regionId = document.getElementById('merchantRankingRegion')?.value || '';
            const period = document.getElementById('merchantRankingPeriod')?.value || 'month';

            console.log(`加载商家排名: ${this.currentYear}年${this.currentMonth}月`, {
                rankingType, regionId, period
            });

            // 构建请求参数 - 使用新的API
            const params = new URLSearchParams();
            
            // 添加地区筛选
            if (regionId) {
                params.append('regionId', regionId);
            }
            
            // 添加时间范围筛选
            const today = new Date();
            switch (period) {
                case 'today':
                    const todayStr = today.toISOString().split('T')[0];
                    params.append('dateFrom', todayStr);
                    params.append('dateTo', todayStr);
                    break;
                case 'week':
                    const weekStart = new Date(today);
                    weekStart.setDate(today.getDate() - today.getDay() + 1);
                    params.append('dateFrom', weekStart.toISOString().split('T')[0]);
                    params.append('dateTo', today.toISOString().split('T')[0]);
                    break;
                case 'month':
                    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                    params.append('dateFrom', monthStart.toISOString().split('T')[0]);
                    params.append('dateTo', today.toISOString().split('T')[0]);
                    break;
                case 'quarter':
                    const quarter = Math.floor(today.getMonth() / 3);
                    const quarterStart = new Date(today.getFullYear(), quarter * 3, 1);
                    params.append('dateFrom', quarterStart.toISOString().split('T')[0]);
                    params.append('dateTo', today.toISOString().split('T')[0]);
                    break;
            }
            
            // 添加排名类型参数
            params.append('type', rankingType);
            
            const queryString = params.toString();
            const apiUrl = queryString ? `/rankings/merchants?${queryString}` : '/rankings/merchants';
            
            console.log('使用API URL:', apiUrl);
            
            const response = await this.apiClient.request(apiUrl, 'GET');
            
            console.log('商家排名API响应:', response);
            
            // 处理API返回的数据结构
            let rankings = [];
            if (Array.isArray(response)) {
                rankings = response;
            } else if (response.data && Array.isArray(response.data)) {
                rankings = response.data;
            } else if (response && response.rankings && Array.isArray(response.rankings)) {
                rankings = response.rankings;
            }
            
            this.currentMerchantRanking = {
                rankings: rankings,
                year: this.currentYear,
                month: this.currentMonth,
                totalMerchants: rankings.length,
                rankingType,
                regionId,
                period
            };
            
            console.log('处理后的商家排名数据:', this.currentMerchantRanking);
            
        } catch (error) {
            console.error('加载商家排名失败:', error);
            // 如果新API失败，尝试使用旧API作为备用
            try {
                console.log('尝试使用备用API...');
                const response = await this.apiClient.request(
                    `/merchant-reports/ranking/${this.currentYear}/${this.currentMonth}`, 
                    'GET'
                );
                
                let rankings = [];
                if (Array.isArray(response)) {
                    rankings = response;
                } else if (response.data && Array.isArray(response.data)) {
                    rankings = response.data;
                }
                
                this.currentMerchantRanking = {
                    rankings: rankings,
                    year: this.currentYear,
                    month: this.currentMonth,
                    totalMerchants: rankings.length
                };
                
                console.log('使用备用API加载成功:', this.currentMerchantRanking);
            } catch (fallbackError) {
                console.error('备用API也失败:', fallbackError);
                throw error;
            }
        }
    }

    // 加载用户排名
    async loadUserRanking() {
        try {
            console.log(`加载用户排名: ${this.currentYear}年${this.currentMonth}月`);
            
            // 获取筛选参数
            const userRankingType = document.getElementById('userRankingType')?.value || 'orderCount';
            const userRankingPeriod = document.getElementById('userRankingPeriod')?.value || 'month';
            
            // 构建请求参数
            const params = new URLSearchParams();
            
            // 添加时间范围筛选
            const today = new Date();
            switch (userRankingPeriod) {
                case 'month':
                    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                    params.append('dateFrom', monthStart.toISOString().split('T')[0]);
                    params.append('dateTo', today.toISOString().split('T')[0]);
                    break;
                case 'quarter':
                    const quarter = Math.floor(today.getMonth() / 3);
                    const quarterStart = new Date(today.getFullYear(), quarter * 3, 1);
                    params.append('dateFrom', quarterStart.toISOString().split('T')[0]);
                    params.append('dateTo', today.toISOString().split('T')[0]);
                    break;
                case 'year':
                    const yearStart = new Date(today.getFullYear(), 0, 1);
                    params.append('dateFrom', yearStart.toISOString().split('T')[0]);
                    params.append('dateTo', today.toISOString().split('T')[0]);
                    break;
                // 'all' 不添加时间筛选
            }
            
            const queryString = params.toString();
            const apiUrl = queryString ? `/rankings/users?${queryString}` : '/rankings/users';
            
            console.log('使用用户排名API URL:', apiUrl);
            
            const response = await this.apiClient.request(apiUrl, 'GET');
            
            console.log('用户排名API响应:', response);
            
            // 处理API返回的数据结构
            let rankings = [];
            if (Array.isArray(response)) {
                rankings = response;
            } else if (response.data && Array.isArray(response.data)) {
                rankings = response.data;
            } else if (response && response.rankings && Array.isArray(response.rankings)) {
                rankings = response.rankings;
            }
            
            this.currentUserRanking = {
                rankings: rankings,
                year: this.currentYear,
                month: this.currentMonth,
                totalUsers: rankings.length,
                rankingType: userRankingType,
                period: userRankingPeriod
            };
            
            console.log('处理后的用户排名数据:', this.currentUserRanking);
            
        } catch (error) {
            console.error('加载用户排名失败:', error);
            // 尝试使用备用API
            try {
                console.log('尝试使用备用用户排名API...');
                const response = await this.apiClient.request(
                    `/user-rankings/${this.currentYear}/${this.currentMonth}`, 
                    'GET'
                );
                
                if (response.data) {
                    this.currentUserRanking = response.data;
                } else {
                    this.currentUserRanking = response;
                }
                
                console.log('使用备用API加载用户排名成功:', this.currentUserRanking);
            } catch (fallbackError) {
                console.error('备用用户排名API也失败:', fallbackError);
                // 用户排名失败不阻断流程，只是显示暂无数据
                this.currentUserRanking = null;
            }
        }
    }

    // 切换排名类型
    switchRankingType(type) {
        const merchantTab = document.getElementById('merchantRankingTab');
        const userTab = document.getElementById('userRankingTab');

        if (type === 'merchant') {
            if (merchantTab) merchantTab.style.display = 'block';
            if (userTab) userTab.style.display = 'none';
            this.displayMerchantRanking();
        } else {
            if (merchantTab) merchantTab.style.display = 'none';
            if (userTab) userTab.style.display = 'block';
            this.displayUserRanking();
        }
    }

    // 显示商家排名
    displayMerchantRanking() {
        console.log('=== 显示商家排名 ===');
        console.log('当前商家排名数据:', this.currentMerchantRanking);
        
        // 优先使用主页面容器，如果不存在则使用模态框容器
        let container = document.getElementById('merchantRankingList');
        console.log('尝试找到 merchantRankingList:', container);
        
        if (!container) {
            container = document.getElementById('merchantRankingResults');
            console.log('尝试找到 merchantRankingResults:', container);
        }
        
        // 如果还没找到，尝试查找其他可能的容器
        if (!container) {
            // 查找所有可能的容器
            const possibleContainers = [
                'merchantRankings',
                'ranking-results', 
                'rankings-content',
                'merchant-ranking-content'
            ];
            
            for (const id of possibleContainers) {
                container = document.getElementById(id);
                console.log(`尝试找到 ${id}:`, container);
                if (container) break;
            }
        }
        
        if (!container) {
            console.error('找不到商家排名容器，尝试过的ID:', [
                'merchantRankingResults', 'merchantRankingList', 'merchantRankings', 
                'ranking-results', 'rankings-content', 'merchant-ranking-content'
            ]);
            
            // 列出页面中所有的div元素，帮助调试
            const allDivs = document.querySelectorAll('div[id]');
            console.log('页面中所有有ID的div元素:', Array.from(allDivs).map(div => div.id));
            return;
        }
        
        console.log('找到容器:', container.id, container);

        if (!this.currentMerchantRanking || !this.currentMerchantRanking.rankings) {
            console.log('排名数据检查失败:', {
                currentMerchantRanking: this.currentMerchantRanking,
                hasRankings: this.currentMerchantRanking ? !!this.currentMerchantRanking.rankings : false
            });
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">暂无排名数据</div>';
            return;
        }

        const { rankings, year, month, totalMerchants } = this.currentMerchantRanking;
        
        if (!Array.isArray(rankings)) {
            console.error('rankings 不是数组:', rankings);
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">数据格式错误</div>';
            return;
        }

        // 清爽简洁的排名显示
        let html = `
            <div class="clean-ranking-header">
                ${year}年${month}月商家排名 (${totalMerchants}位)
            </div>
            <div class="clean-ranking-list">
        `;

        console.log('开始处理rankings数据，长度:', rankings.length);
        
        rankings.forEach((merchant, index) => {
            console.log(`处理商家 ${index}:`, merchant);
            
            const completedOrders = merchant.completedOrders || 0;
            const channelClicks = merchant.channel_clicks || 0;
            const rankNumber = merchant.rank || (index + 1);
            const merchantName = merchant.teacher_name || '未知商家';
            const rankingType = this.currentMerchantRanking?.rankingType || 'monthlyOrders';
            
            // 根据排名显示不同样式
            let rankClass = '';
            let rankIcon = '';
            if (index === 0) {
                rankClass = 'rank-first';
                rankIcon = '🥇';
            } else if (index === 1) {
                rankClass = 'rank-second';
                rankIcon = '🥈';
            } else if (index === 2) {
                rankClass = 'rank-third';
                rankIcon = '🥉';
            }
            
            // 根据排名类型显示不同信息
            let orderInfo = '';
            if (rankingType === 'channelClicks') {
                orderInfo = `${channelClicks}次点击`;
            } else {
                orderInfo = `${completedOrders}单`;
            }
            
            // 使用正确的商家ID字段
            const merchantId = merchant.merchantId || merchant.id;
            
            console.log(`商家 ${index} 处理结果:`, {
                rank: rankNumber,
                teacher_name: merchantName,
                completedOrders,
                orderInfo,
                merchantId
            });
            
            html += `
                <div class="clean-ranking-item ${rankClass}">
                    <div class="rank-info">
                        <span class="rank-position">${rankIcon ? rankIcon + ' ' : ''}${rankNumber}</span>
                        <span class="merchant-name">${merchantName}</span>
                    </div>
                    <div class="rank-data">
                        <span class="order-count">${orderInfo}</span>
                        <button class="report-btn" onclick="window.rankingManager.generateMerchantReportFromRanking(${merchantId}, ${year}, ${month})" title="生成报告">
                            报告
                        </button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        
        console.log('设置HTML内容，长度:', html.length);
        console.log('HTML完整内容:', html);
        
        container.innerHTML = html;
        
        console.log('HTML设置完成，容器内容长度:', container.innerHTML.length);
        console.log('容器实际内容:', container.innerHTML);

        // 更新统计数据
        this.updateRankingStats();
        
        // 临时测试：检查容器是否可见
        const containerStyle = window.getComputedStyle(container);
        console.log('容器样式检查:', {
            display: containerStyle.display,
            visibility: containerStyle.visibility,
            opacity: containerStyle.opacity,
            height: containerStyle.height,
            width: containerStyle.width
        });
    }

    // 显示用户排名
    async displayUserRanking() {
        console.log('=== 显示用户排名 ===');
        
        // 优先使用主页面容器，如果不存在则使用模态框容器
        let container = document.getElementById('userRankingList');
        if (!container) {
            container = document.getElementById('userRankingResults');
        }
        
        if (!container) {
            console.error('找不到用户排名容器: userRankingList 或 userRankingResults');
            return;
        }

        // 如果没有数据，先加载
        if (!this.currentUserRanking) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">加载用户排名数据中...</div>';
            await this.loadUserRanking();
        }

        if (!this.currentUserRanking || !this.currentUserRanking.rankings) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">暂无用户排名数据</div>';
            return;
        }

        const { rankings, year, month, totalUsers } = this.currentUserRanking;

        // 清爽简洁的用户排名显示
        let html = `
            <div class="clean-ranking-header">
                ${year}年${month}月学员排名 (${totalUsers || rankings.length}位)
            </div>
            <div class="clean-ranking-list">
        `;

        if (rankings && rankings.length > 0) {
            rankings.slice(0, 30).forEach((user, index) => {
                const completedOrders = user.completedOrders || user.totalOrders || 0;
                const rankNumber = user.rank || (index + 1);
                const userName = user.displayName || user.username || user.name || '未知用户';
                
                // 根据排名显示不同样式
                let rankClass = '';
                let rankIcon = '';
                if (index === 0) {
                    rankClass = 'rank-first';
                    rankIcon = '🥇';
                } else if (index === 1) {
                    rankClass = 'rank-second';
                    rankIcon = '🥈';
                } else if (index === 2) {
                    rankClass = 'rank-third';
                    rankIcon = '🥉';
                }
                
                // 只显示完成课程数
                const orderInfo = `${completedOrders}课`;
                
                html += `
                    <div class="clean-ranking-item ${rankClass}">
                        <div class="rank-info">
                            <span class="rank-position">${rankIcon ? rankIcon + ' ' : ''}${rankNumber}</span>
                            <span class="user-name">${userName}</span>
                        </div>
                        <div class="rank-data">
                            <span class="course-count">${orderInfo}</span>
                        </div>
                    </div>
                `;
            });
        } else {
            html += '<div style="padding: 20px; text-align: center; color: #666;">暂无用户排名数据</div>';
        }

        html += '</div>';
        container.innerHTML = html;
    }

    // 刷新排名数据
    async refreshRankings() {
        try {
            console.log('=== 刷新排名数据 ===');
            
            if (window.loadingManager) {
                window.loadingManager.show('刷新排名数据中...');
            }

            // 强制刷新商家排名
            const refreshResponse = await this.apiClient.request('/merchant-reports/refresh-ranking', 'POST', {
                year: this.currentYear,
                month: this.currentMonth
            });

            console.log('刷新排名响应:', refreshResponse);

            // 重新加载排名数据
            await this.loadRankings();

            if (window.notificationSystem) {
                window.notificationSystem.show('排名数据刷新成功', 'success');
            } else {
                alert('排名数据刷新成功！');
            }

        } catch (error) {
            console.error('刷新排名失败:', error);
            if (window.notificationSystem) {
                window.notificationSystem.show('刷新排名失败: ' + error.message, 'error');
            } else {
                alert('刷新排名失败: ' + error.message);
            }
        } finally {
            if (window.loadingManager) {
                window.loadingManager.hide();
            }
        }
    }

    // 显示排名标签页（兼容旧HTML调用）
    showRankingTab(tabType) {
        // 更新标签按钮状态
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`[data-tab="${tabType}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        // 显示对应内容
        const merchantRankings = document.getElementById('merchantRankings');
        const userRankings = document.getElementById('userRankings');
        
        if (merchantRankings && userRankings) {
            merchantRankings.style.display = tabType === 'merchant' ? 'block' : 'none';
            userRankings.style.display = tabType === 'user' ? 'block' : 'none';
        }

        // 加载对应数据
        if (tabType === 'merchant') {
            this.loadRankings();
        } else if (tabType === 'user') {
            this.loadUserRanking();
        }
    }

    // 更新商家排名（兼容旧HTML调用）
    updateMerchantRankings() {
        this.loadRankings();
    }

    // 更新用户排名（兼容旧HTML调用）
    updateUserRankings() {
        this.loadUserRanking();
    }

    // 刷新所有排名（兼容旧HTML调用）
    refreshAllRankings() {
        this.refreshRankings();
    }

    // 加载地区数据
    async loadRegions() {
        try {
            console.log('开始加载地区数据...');
            const response = await this.apiClient.request('/regions');
            console.log('地区API响应:', response);
            
            const regions = response.data || response;
            console.log('解析出的地区数据:', regions);
            
            // 填充商家排名地区选择器
            const merchantRegionSelect = document.getElementById('merchantRankingRegion');
            console.log('找到地区选择器元素:', merchantRegionSelect);
            
            if (merchantRegionSelect && regions) {
                merchantRegionSelect.innerHTML = '<option value="">全部地区</option>';
                regions.forEach(region => {
                    console.log('添加地区选项:', region);
                    const option = new Option(region.name, region.id);
                    merchantRegionSelect.add(option);
                });
                console.log('地区选择器选项总数:', merchantRegionSelect.options.length);
            }

            console.log('地区数据加载完成，共', regions?.length || 0, '个地区');
        } catch (error) {
            console.error('加载地区数据失败:', error);
            console.error('错误详情:', error.message, error.stack);
        }
    }

    // 更新排名统计数据
    async updateRankingStats() {
        try {
            // 获取仪表盘统计数据
            const statsResponse = await this.apiClient.request('/stats/optimized');
            const stats = statsResponse.data || statsResponse;

            console.log('获取到的统计数据:', stats);

            // 更新商家排名统计
            const merchantTotalCount = document.getElementById('merchantTotalCount');
            const merchantTopRevenue = document.getElementById('merchantTopRevenue');
            const merchantAvgRating = document.getElementById('merchantAvgRating');

            if (merchantTotalCount) {
                // 活跃商家数量 - 从当前排名数据获取
                const activeMerchants = this.currentMerchantRanking?.totalMerchants || stats.totalMerchants || 0;
                merchantTotalCount.textContent = activeMerchants;
            }

            if (merchantTopRevenue) {
                // 最高收入 - 从排名数据中获取最高收入
                if (this.currentMerchantRanking?.rankings?.length > 0) {
                    const topMerchant = this.currentMerchantRanking.rankings[0];
                    const topRevenue = topMerchant.totalRevenue || topMerchant.completedOrders * (stats.avgPrice || 0);
                    merchantTopRevenue.textContent = topRevenue > 0 ? `¥${Math.round(topRevenue)}` : `¥${stats.avgPrice || 0}`;
                } else {
                    merchantTopRevenue.textContent = stats.avgPrice > 0 ? `¥${stats.avgPrice}` : '-';
                }
            }

            if (merchantAvgRating) {
                // 平均评分 - 使用商家平均评分
                const avgRating = stats.avgMerchantRating || 0;
                merchantAvgRating.textContent = avgRating > 0 ? `${avgRating}/10` : '-';
            }

            // 更新用户排名统计
            const userTotalCount = document.getElementById('userTotalCount');
            const userTopSpent = document.getElementById('userTopSpent');
            const userAvgRating = document.getElementById('userAvgRating');

            if (userTotalCount) {
                // 活跃用户数量 - 从用户排名数据获取
                const activeUsers = this.currentUserRanking?.totalUsers || Math.floor((stats.totalOrders || 0) * 0.6);
                userTotalCount.textContent = activeUsers || '-';
            }

            if (userTopSpent) {
                // 最高消费 - 从用户排名数据获取
                if (this.currentUserRanking?.rankings?.length > 0) {
                    const topUser = this.currentUserRanking.rankings[0];
                    const topSpent = topUser.totalSpent || topUser.completedOrders * (stats.avgPrice || 0);
                    userTopSpent.textContent = topSpent > 0 ? `¥${Math.round(topSpent)}` : '-';
                } else {
                    const maxSpent = (stats.avgPrice || 0) * 3; // 估算最高消费
                    userTopSpent.textContent = maxSpent > 0 ? `¥${Math.round(maxSpent)}` : '-';
                }
            }

            if (userAvgRating) {
                // 平均素质 - 使用用户平均评分
                const avgUserRating = stats.avgUserRating || 0;
                userAvgRating.textContent = avgUserRating > 0 ? `${avgUserRating}/10` : '-';
            }

            console.log('排名统计数据更新完成');
        } catch (error) {
            console.error('更新排名统计数据失败:', error);
            // 如果获取失败，显示默认值
            const elements = [
                'merchantTotalCount', 'merchantTopRevenue', 'merchantAvgRating',
                'userTotalCount', 'userTopSpent', 'userAvgRating'
            ];
            elements.forEach(id => {
                const element = document.getElementById(id);
                if (element && element.textContent === '') {
                    element.textContent = '-';
                }
            });
        }
    }

    // 生成商家报告
    // 从排名页面生成商家报告
    async generateMerchantReportFromRanking(merchantId, year, month) {
        try {
            // 检查是否存在商家报告管理器
            if (!window.merchantReports) {
                window.notificationSystem.show('商家报告系统未初始化', 'error');
                return;
            }
            
            // 关闭排名模态框
            document.getElementById('merchantRankingModal').style.display = 'none';
            
            // 打开报告生成模态框
            window.merchantReports.showReportModal();
            
            // 设置选择的商家和日期
            document.getElementById('reportMerchantSelect').value = merchantId;
            document.getElementById('reportYear').value = year;
            document.getElementById('reportMonth').value = month;
            
            // 自动生成预览
            setTimeout(() => {
                window.merchantReports.generatePreview();
            }, 100);
            
        } catch (error) {
            console.error('生成商家报告失败:', error);
            window.notificationSystem.show('生成商家报告失败: ' + error.message, 'error');
        }
    }

    async generateMerchantReport(merchantId, year, month) {
        try {
            if (window.merchantReports) {
                await window.merchantReports.generateMerchantReportFromRanking(merchantId, year, month);
            } else {
                console.error('商家报告系统未初始化');
                if (window.notificationSystem) {
                    window.notificationSystem.show('商家报告系统未初始化', 'error');
                }
            }
        } catch (error) {
            console.error('生成商家报告失败:', error);
            if (window.notificationSystem) {
                window.notificationSystem.show('生成商家报告失败', 'error');
            }
        }
    }
}

// 初始化排名管理器
document.addEventListener('DOMContentLoaded', () => {
    console.log('排名管理器 - DOM加载完成');
    
    // 检查依赖
    const checkDependencies = () => {
        return window.api && window.notificationSystem && window.loadingManager;
    };
    
    // 尝试初始化
    const tryInit = () => {
        if (checkDependencies()) {
            console.log('排名管理器 - 依赖检查通过，开始初始化');
            try {
                window.rankingManager = new RankingManager();
                if (typeof window.rankingManager.init === 'function') {
                    window.rankingManager.init();
                    console.log('排名管理器 - 初始化成功');
                } else {
                    console.error('排名管理器 - init方法不存在');
                }
            } catch (error) {
                console.error('排名管理器 - 初始化失败:', error);
            }
        } else {
            console.log('排名管理器 - 依赖未就绪，等待中...');
            console.log('window.api:', typeof window.api);
            console.log('window.notificationSystem:', typeof window.notificationSystem);
            console.log('window.loadingManager:', typeof window.loadingManager);
            setTimeout(tryInit, 500);
        }
    };
    
    // 开始尝试初始化
    setTimeout(tryInit, 100);
}); 
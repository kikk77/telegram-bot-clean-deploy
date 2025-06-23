// 商家报告管理系统
class MerchantReportsManager {
    constructor() {
        this.apiClient = window.api || null;
        this.merchants = [];
        this.reportTemplates = {};
        this.currentReport = null;
    }

    async init() {
        try {
            // 初始化年份选择器
            this.initYearSelectors();
            
            // 加载商家列表和报告模板
            await this.loadMerchants();
            
            // 更新统计数据
            await this.updateStats();
            
            // 添加实时预览事件监听器
            this.initRealtimePreview();
            
            console.log('商家报告系统初始化完成');
        } catch (error) {
            console.error('商家报告系统初始化失败:', error);
            window.notificationSystem.show('系统初始化失败: ' + error.message, 'error');
        }
    }

    // 初始化实时预览功能
    initRealtimePreview() {
        // 监听复选框变化
        const checkboxes = document.querySelectorAll('input[name="reportSections"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updatePreview();
            });
        });
        
        // 监听商家选择变化
        const merchantSelect = document.getElementById('reportMerchantSelect');
        if (merchantSelect) {
            merchantSelect.addEventListener('change', () => {
                const selectedMerchantId = merchantSelect.value;
                console.log('商家选择变更为:', selectedMerchantId);
                
                if (selectedMerchantId) {
                    const selectedMerchant = this.merchants.find(m => m.id == selectedMerchantId || m.merchantId == selectedMerchantId);
                    console.log('选中的商家信息:', selectedMerchant);
                }
                
                // 清除当前预览
                document.getElementById('reportPreview').style.display = 'none';
                this.currentReport = null;
            });
        }
        
        // 监听年月变化
        const reportYear = document.getElementById('reportYear');
        const reportMonth = document.getElementById('reportMonth');
        
        if (reportYear) {
            reportYear.addEventListener('change', () => {
                console.log('报告年份变更为:', reportYear.value);
                document.getElementById('reportPreview').style.display = 'none';
                this.currentReport = null;
            });
        }
        
        if (reportMonth) {
            reportMonth.addEventListener('change', () => {
                console.log('报告月份变更为:', reportMonth.value);
                document.getElementById('reportPreview').style.display = 'none';
                this.currentReport = null;
            });
        }
    }

    // 初始化年份选择器
    initYearSelectors() {
        // 使用实际有数据的时间
        const currentYear = 2025;
        const currentMonth = 6;
        
        // 报告年份选择器
        const reportYearSelect = document.getElementById('reportYear');
        const rankingYearSelect = document.getElementById('rankingYear');
        
        // 清空现有选项
        reportYearSelect.innerHTML = '';
        rankingYearSelect.innerHTML = '';
        
        // 生成年份选项，包含2023-2025
        for (let year = 2025; year >= 2023; year--) {
            const option1 = new Option(year + '年', year);
            const option2 = new Option(year + '年', year);
            reportYearSelect.add(option1);
            rankingYearSelect.add(option2);
        }
        
        // 设置默认值
        reportYearSelect.value = currentYear;
        rankingYearSelect.value = currentYear;
        
        document.getElementById('reportMonth').value = currentMonth;
        document.getElementById('rankingMonth').value = currentMonth;
    }

    // 加载商家列表
    async loadMerchants() {
        try {
            console.log('开始加载商家列表...');
            
            // 从报告模板API获取商家列表
            const response = await this.apiClient.request('/merchant-reports/templates');
            console.log('商家模板API响应:', response);
            
            this.merchants = response.merchants || [];
            this.reportTemplates = response.templates || {};
            
            // 填充商家选择器
            const merchantSelect = document.getElementById('reportMerchantSelect');
            if (!merchantSelect) {
                console.error('找不到商家选择器元素: reportMerchantSelect');
                return;
            }
            
            merchantSelect.innerHTML = '<option value="">请选择商家...</option>';
            
            // 验证商家数据结构并填充选择器
            this.merchants.forEach((merchant, index) => {
                console.log(`处理商家 ${index}:`, merchant);
                
                // 确保商家有必要的字段
                const merchantId = merchant.id || merchant.merchantId;
                const merchantName = merchant.name || merchant.teacher_name || '未知商家';
                const merchantUsername = merchant.username || '';
                
                if (!merchantId) {
                    console.warn('商家缺少ID字段:', merchant);
                    return;
                }
                
                const displayText = merchantUsername ? 
                    `${merchantName} (@${merchantUsername})` : 
                    merchantName;
                
                const option = new Option(displayText, merchantId);
                merchantSelect.add(option);
                
                console.log(`添加商家选项: ${displayText} (ID: ${merchantId})`);
            });
            
            console.log('已加载', this.merchants.length, '个活跃商家');
            console.log('商家选择器选项数量:', merchantSelect.options.length - 1); // 减去默认选项
            console.log('已加载报告模板:', this.reportTemplates);
            
            // 如果没有商家数据，显示提示
            if (this.merchants.length === 0) {
                merchantSelect.innerHTML = '<option value="">暂无可用商家</option>';
                console.warn('没有找到任何商家数据');
            }
            
        } catch (error) {
            console.error('加载商家列表和报告模板失败:', error);
            
            // 在选择器中显示错误信息
            const merchantSelect = document.getElementById('reportMerchantSelect');
            if (merchantSelect) {
                merchantSelect.innerHTML = '<option value="">加载商家失败，请刷新重试</option>';
            }
            
            throw error;
        }
    }

    // 加载报告模板（现在合并到loadMerchants中）
    async loadReportTemplates() {
        // 模板已在loadMerchants中加载
        return this.reportTemplates;
    }

    // 更新统计数据
    async updateStats() {
        try {
            // 更新活跃商家数量
            document.getElementById('totalMerchants').textContent = this.merchants.length;
            
            // 这里可以添加更多统计数据的获取
            document.getElementById('reportsGenerated').textContent = '-';
            document.getElementById('rankingUpdated').textContent = '每日';
            
        } catch (error) {
            console.error('更新统计数据失败:', error);
        }
    }

    // 显示报告生成模态框
    showReportModal() {
        document.getElementById('merchantReportModal').style.display = 'block';
        document.getElementById('reportPreview').style.display = 'none';
    }

    // 关闭报告生成模态框
    closeReportModal() {
        document.getElementById('merchantReportModal').style.display = 'none';
        this.currentReport = null;
    }

    // 显示排名查看模态框
    showRankingModal() {
        document.getElementById('merchantRankingModal').style.display = 'block';
    }

    // 关闭排名查看模态框
    closeRankingModal() {
        document.getElementById('merchantRankingModal').style.display = 'none';
    }

    // 商家选择变化事件
    onMerchantChange() {
        const merchantId = document.getElementById('reportMerchantSelect').value;
        if (merchantId) {
            const merchant = this.merchants.find(m => m.id == merchantId);
            console.log('选择商家:', merchant);
        }
    }

    // 获取选中的报告部分
    getSelectedSections() {
        const checkboxes = document.querySelectorAll('input[name="reportSections"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    // 生成报告预览 - 增加数据验证和用户友好提示
    async generatePreview() {
        try {
            const merchantId = document.getElementById('reportMerchantSelect').value;
            const year = document.getElementById('reportYear').value;
            const month = document.getElementById('reportMonth').value;
            
            // 数据验证
            if (!merchantId || !year || !month) {
                window.notificationSystem.show('请选择商家和报告年月', 'warning');
                return;
            }

            // 检查选择的部分
            const selectedSections = this.getSelectedSections();
            if (selectedSections.length === 0) {
                window.notificationSystem.show('请至少选择一个报告内容', 'warning');
                return;
            }

            // 日期合理性检查
            const currentDate = new Date();
            const reportDate = new Date(year, month - 1);
            if (reportDate > currentDate) {
                window.notificationSystem.show('不能生成未来月份的报告', 'warning');
                return;
            }

            // 检查是否选择了太久远的日期
            const monthsAgo = (currentDate.getFullYear() - year) * 12 + (currentDate.getMonth() + 1 - month);
            if (monthsAgo > 12) {
                const confirmGenerate = confirm(`您选择的是${monthsAgo}个月前的数据，可能数据较少。确定要生成报告吗？`);
                if (!confirmGenerate) return;
            }

            window.loadingManager.show('正在生成报告预览...');

            // 生成报告
            const response = await this.apiClient.request('/merchant-reports/generate', 'POST', {
                merchantId: parseInt(merchantId),
                year: parseInt(year),
                month: parseInt(month)
            });

            this.currentReport = response;

            // 数据完整性检查
            if (!response.orderStats || response.orderStats.totalOrders === 0) {
                window.notificationSystem.show('该商家在选定期间内暂无订单数据', 'info');
            }

            // 生成报告文本
            const reportText = this.generateReportTextPreview(response, selectedSections);
            
            // 生成图表HTML
            const chartHtml = this.generateChartsPreview(response, selectedSections);

            // 同时显示预览和图表
            document.getElementById('reportPreviewContent').innerHTML = 
                this.formatReportForPreview(reportText) + chartHtml;
            document.getElementById('reportPreview').style.display = 'block';
            
            // 等待DOM更新后渲染图表
            setTimeout(() => {
                this.renderPreviewCharts(response, selectedSections);
            }, 100);

            window.notificationSystem.show('报告预览生成成功', 'success');

        } catch (error) {
            console.error('生成报告预览失败:', error);
            
            // 详细错误处理
            let errorMessage = '生成报告预览失败';
            if (error.message.includes('商家不存在')) {
                errorMessage = '所选商家不存在或已被删除';
            } else if (error.message.includes('网络')) {
                errorMessage = '网络连接异常，请检查网络后重试';
            } else if (error.message.includes('timeout')) {
                errorMessage = '请求超时，请稍后重试';
            }
            
            window.notificationSystem.show(errorMessage, 'error');
        } finally {
            window.loadingManager.hide();
        }
    }

    // 生成报告文本预览 - 使用与后端一致的格式
    generateReportTextPreview(reportData, selectedSections) {
        const { merchant, period, orderStats, courseAnalysis, priceAnalysis, 
                evaluationStats, ranking, returnCustomers } = reportData;

        let reportText = `📋 ${merchant.teacher_name} ${period.year}年${period.month}月经营分析报告\n\n`;

        // 订单统计 - 增强版
        if (selectedSections.includes('orderStats')) {
            reportText += `📊 业务统计分析\n`;
            reportText += `━━━━━━━━━━━━━━━\n`;
            reportText += `📈 订单总览:\n`;
            reportText += `• 总咨询量: ${orderStats.totalOrders}个订单\n`;
            reportText += `• 确认预约: ${orderStats.confirmedOrders}个 (${((orderStats.confirmedOrders/Math.max(orderStats.totalOrders,1))*100).toFixed(1)}%)\n`;
            reportText += `• 实际成交: ${orderStats.completedOrders}个 (${((orderStats.completedOrders/Math.max(orderStats.totalOrders,1))*100).toFixed(1)}%)\n`;
            reportText += `• 待处理中: ${orderStats.pendingOrders}个\n`;
            reportText += `• 已取消: ${orderStats.cancelledOrders}个\n`;
            
            // 新增状态统计
            if (orderStats.incompleteOrders > 0 || orderStats.attemptingOrders > 0 || orderStats.failedOrders > 0) {
                reportText += `• 未完成: ${orderStats.incompleteOrders}个\n`;
                reportText += `• 尝试中: ${orderStats.attemptingOrders}个\n`;
                reportText += `• 失败: ${orderStats.failedOrders}个\n`;
            }
            
            reportText += `\n🎯 关键绩效指标:\n`;
            reportText += `• 预约转化率: ${orderStats.contactRate} (行业平均: 60-70%)\n`;
            reportText += `• 成交完成率: ${orderStats.completionRate} (行业平均: 80-90%)\n`;
            reportText += `• 整体处理效率: ${orderStats.processingEfficiency}\n`;
            
            // 添加业绩评估
            const completionRateNum = parseFloat(orderStats.completionRate);
            let performanceLevel = '';
            if (completionRateNum >= 90) performanceLevel = '🏆 优秀';
            else if (completionRateNum >= 75) performanceLevel = '👍 良好';
            else if (completionRateNum >= 60) performanceLevel = '📈 一般';
            else performanceLevel = '⚠️ 需改进';
            
            reportText += `• 业绩评估: ${performanceLevel}\n\n`;
        }

        // 课程分析 - 增强版
        if (selectedSections.includes('courseAnalysis')) {
            reportText += `📚 课程类型深度分析\n`;
            reportText += `━━━━━━━━━━━━━━━\n`;
            reportText += `📊 成交概况:\n`;
            reportText += `• 总成交课程: ${courseAnalysis.totalCompleted}个\n`;
            
            if (courseAnalysis.totalCompleted > 0) {
                if (courseAnalysis.diversity) {
                    reportText += `• 课程多样性指数: ${courseAnalysis.diversity} (满分3.0)\n`;
                }
                if (courseAnalysis.mostPopular) {
                    reportText += `• 最受欢迎: ${courseAnalysis.mostPopular.content} (${courseAnalysis.mostPopular.count}个)\n`;
                }
                reportText += `\n📈 课程类型分布:\n`;
                
                if (courseAnalysis.summary.p > 0) {
                    const pPercentage = ((courseAnalysis.summary.p / courseAnalysis.totalCompleted) * 100).toFixed(1);
                    reportText += `• P课程: ${courseAnalysis.summary.p}个 (${pPercentage}%) 💡\n`;
                }
                if (courseAnalysis.summary.pp > 0) {
                    const ppPercentage = ((courseAnalysis.summary.pp / courseAnalysis.totalCompleted) * 100).toFixed(1);
                    reportText += `• PP课程: ${courseAnalysis.summary.pp}个 (${ppPercentage}%) 🎯\n`;
                }
                if (courseAnalysis.summary.other > 0) {
                    const otherPercentage = ((courseAnalysis.summary.other / courseAnalysis.totalCompleted) * 100).toFixed(1);
                    reportText += `• 其他课程: ${courseAnalysis.summary.other}个 (${otherPercentage}%) ⭐\n`;
                }
                
                // 课程结构分析
                if (courseAnalysis.diversity) {
                    reportText += `\n🔍 课程结构洞察:\n`;
                    const diversity = parseFloat(courseAnalysis.diversity);
                    if (diversity >= 2.0) {
                        reportText += `• 课程结构: 多元化发展，覆盖面广 🌟\n`;
                    } else if (diversity >= 1.0) {
                        reportText += `• 课程结构: 相对均衡，有一定专业化 📊\n`;
                    } else {
                        reportText += `• 课程结构: 专业化程度高，聚焦特定领域 🎯\n`;
                    }
                }
                
            } else {
                reportText += `暂无成交课程数据，建议加强课程推广 📢\n`;
            }
            reportText += '\n';
        }

        // 价格分析 - 增强版
        if (selectedSections.includes('priceAnalysis')) {
            reportText += `💰 收入分析报告\n`;
            reportText += `━━━━━━━━━━━━━━━\n`;
            reportText += `💵 收入总览:\n`;
            reportText += `• 总收入: ¥${priceAnalysis.totalRevenue.toLocaleString()}\n`;
            reportText += `• 平均客单价: ¥${priceAnalysis.averageOrderValue.toLocaleString()}\n`;
            
            if (priceAnalysis.breakdown.length > 0) {
                const avgIndustryPrice = 150; // 假设行业平均价格
                const priceCompetitiveness = priceAnalysis.averageOrderValue >= avgIndustryPrice ? '高于行业均价' : '低于行业均价';
                reportText += `• 价格竞争力: ${priceCompetitiveness} (行业均价¥${avgIndustryPrice})\n\n`;
                
                reportText += `💳 收入构成明细:\n`;
                priceAnalysis.breakdown.forEach(item => {
                    const percentage = priceAnalysis.totalRevenue > 0 ? 
                        ((item.revenue / priceAnalysis.totalRevenue) * 100).toFixed(1) : 0;
                    const unitPrice = item.count > 0 ? (item.revenue / item.count).toFixed(0) : item.price || 0;
                    
                    reportText += `• ${item.type.toUpperCase()}课程: ${item.count}个 | ¥${item.revenue.toLocaleString()} (${percentage}%) | 设定价格¥${item.price || 0}\n`;
                    
                    if (item.count === 0 && item.price > 0) {
                        reportText += `  💡 该课程类型已设置价格但本月暂无成交\n`;
                    }
                });
                
                // 收入趋势分析
                reportText += `\n📊 收入结构分析:\n`;
                const mainRevenue = priceAnalysis.breakdown.reduce((max, item) => 
                    item.revenue > max.revenue ? item : max, priceAnalysis.breakdown[0]);
                if (mainRevenue) {
                    const mainPercentage = ((mainRevenue.revenue / priceAnalysis.totalRevenue) * 100).toFixed(1);
                    reportText += `• 主要收入来源: ${mainRevenue.type.toUpperCase()}课程 (${mainPercentage}%)\n`;
                }
            }
            reportText += '\n';
        }

        // 评价统计 - 增强版
        if (selectedSections.includes('evaluationStats')) {
            reportText += `⭐ 服务质量评价\n`;
            reportText += `━━━━━━━━━━━━━━━\n`;
            reportText += `📝 评价统计:\n`;
            reportText += `• 收到客户评价: ${evaluationStats.receivedEvaluations.count}个`;
            if (evaluationStats.receivedEvaluations.averageScore > 0) {
                reportText += ` (平均${evaluationStats.receivedEvaluations.averageScore}分)`;
            }
            reportText += `\n`;
            
            if (evaluationStats.givenEvaluations.count > 0) {
                reportText += `• 给出客户评价: ${evaluationStats.givenEvaluations.count}个`;
                if (evaluationStats.givenEvaluations.averageScore > 0) {
                    reportText += ` (平均${evaluationStats.givenEvaluations.averageScore}分)`;
                }
                reportText += `\n`;
            }
            
            // 服务质量评估
            if (evaluationStats.receivedEvaluations.count > 0) {
                const avgScore = parseFloat(evaluationStats.receivedEvaluations.averageScore);
                let serviceLevel = '';
                if (avgScore >= 4.5) serviceLevel = '🏆 卓越服务';
                else if (avgScore >= 4.0) serviceLevel = '👍 优质服务';
                else if (avgScore >= 3.5) serviceLevel = '📈 良好服务';
                else serviceLevel = '⚠️ 待改进';
                
                reportText += `• 服务质量等级: ${serviceLevel}\n`;
                
                // 互动活跃度
                const interactionRate = evaluationStats.receivedEvaluations.count > 0 ? 
                    (evaluationStats.givenEvaluations.count / evaluationStats.receivedEvaluations.count * 100).toFixed(1) : 0;
                reportText += `• 互动活跃度: ${interactionRate}% (双向评价比例)\n`;
            }
            reportText += '\n';
        }

        // 排名情况 - 增强版
        if (selectedSections.includes('ranking')) {
            reportText += `🏆 市场竞争力分析\n`;
            reportText += `━━━━━━━━━━━━━━━\n`;
            reportText += `🎯 排名表现:\n`;
            reportText += `• 本月成交排名: 第${ranking.rank}名/${ranking.totalMerchants}名\n`;
            reportText += `• 超越商家比例: ${ranking.percentile}%\n`;
            reportText += `• 本月成交量: ${ranking.completedOrders}个\n`;
            
            // 排名等级评估
            const rankPercentile = parseFloat(ranking.percentile);
            let rankLevel = '';
            if (rankPercentile >= 90) rankLevel = '🏆 顶尖水平';
            else if (rankPercentile >= 75) rankLevel = '🥇 优秀水平';
            else if (rankPercentile >= 50) rankLevel = '📈 中上水平';
            else if (rankPercentile >= 25) rankLevel = '📊 中等水平';
            else rankLevel = '⚡ 成长空间大';
            
            reportText += `• 竞争力等级: ${rankLevel}\n`;
            
            // 市场地位分析
            if (ranking.rank <= 3) {
                reportText += `• 🎉 恭喜！您位列前三甲，市场领先地位稳固\n`;
            } else if (ranking.rank <= Math.ceil(ranking.totalMerchants * 0.1)) {
                reportText += `• 👏 您位列前10%，表现优异！\n`;
            } else if (ranking.rank <= Math.ceil(ranking.totalMerchants * 0.25)) {
                reportText += `• 💪 您位列前25%，竞争力强劲\n`;
            } else {
                reportText += `• 📈 还有很大提升空间，继续加油！\n`;
            }
            reportText += '\n';
        }

        // 回头客分析 - 增强版
        if (selectedSections.includes('returnCustomers')) {
            reportText += `🔄 客户忠诚度分析\n`;
            reportText += `━━━━━━━━━━━━━━━\n`;
            reportText += `👥 回头客概况:\n`;
            reportText += `• 回头客数量: ${returnCustomers.totalReturnCustomers}人\n`;
            reportText += `• 回头客订单: ${returnCustomers.totalReturnOrders}个\n`;
            
            if (returnCustomers.totalReturnCustomers > 0) {
                const avgReturnOrders = (returnCustomers.totalReturnOrders / returnCustomers.totalReturnCustomers).toFixed(1);
                reportText += `• 平均复购次数: ${avgReturnOrders}次/人\n`;
                
                // 客户忠诚度评估
                const loyaltyRate = returnCustomers.totalReturnCustomers > 0 ? 
                    (returnCustomers.totalReturnCustomers / Math.max(orderStats.completedOrders, 1) * 100).toFixed(1) : 0;
                reportText += `• 客户忠诚度: ${loyaltyRate}% (回头客占比)\n`;
                
                let loyaltyLevel = '';
                if (parseFloat(loyaltyRate) >= 40) loyaltyLevel = '🏆 极高忠诚度';
                else if (parseFloat(loyaltyRate) >= 25) loyaltyLevel = '👍 高忠诚度';
                else if (parseFloat(loyaltyRate) >= 15) loyaltyLevel = '📈 中等忠诚度';
                else loyaltyLevel = '⚡ 待提升';
                
                reportText += `• 忠诚度等级: ${loyaltyLevel}\n`;
                
                if (returnCustomers.customers.length > 0) {
                    reportText += `\n👑 忠实客户名单:\n`;
                    returnCustomers.customers.slice(0, 10).forEach((customer, index) => {
                        const displayName = customer.name !== '未设置' ? customer.name : 
                                          customer.username !== '未设置' ? `@${customer.username}` : `用户${customer.userId}`;
                        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '⭐';
                        reportText += `${medal} ${displayName}: ${customer.orderCount}次课程\n`;
                    });
                    if (returnCustomers.customers.length > 10) {
                        reportText += `... 还有${returnCustomers.customers.length - 10}位忠实客户\n`;
                    }
                    
                    // 客户价值分析
                    const topCustomer = returnCustomers.customers[0];
                    if (topCustomer) {
                        reportText += `\n💎 最佳客户: ${topCustomer.name !== '未设置' ? topCustomer.name : '用户' + topCustomer.userId} (${topCustomer.orderCount}次)\n`;
                    }
                }
            } else {
                reportText += `\n💡 建议: 加强客户关系维护，提升复购率\n`;
            }
            reportText += '\n';
        }

        reportText += `━━━━━━━━━━━━━━━\n`;
        reportText += `📅 报告生成时间: ${new Date().toLocaleString('zh-CN')}\n`;
        reportText += `📊 数据统计周期: ${period.year}年${period.month}月\n`;
        reportText += `🐥 本报告由小鸡管家智能分析生成，感谢您对小鸡的支持！`;

        return reportText;
    }

    // 实时更新预览
    updatePreview() {
        if (this.currentReport) {
            const selectedSections = this.getSelectedSections();
            const reportText = this.generateReportTextPreview(this.currentReport, selectedSections);
            const chartHtml = this.generateChartsPreview(this.currentReport, selectedSections);
            
            document.getElementById('reportPreviewContent').innerHTML = 
                this.formatReportForPreview(reportText) + chartHtml;
            
            // 渲染图表
            this.renderPreviewCharts(this.currentReport, selectedSections);
        }
    }

    // 格式化报告预览
    formatReportForPreview(reportText) {
        return `<div class="report-text-preview"><pre>${reportText}</pre></div>`;
    }

    // 生成图表预览HTML
    generateChartsPreview(reportData, selectedSections) {
        let chartsHtml = '<div class="report-charts-preview"><h4>📊 数据图表</h4><div class="charts-grid">';
        
        // 订单统计图表
        if (selectedSections.includes('orderStats')) {
            chartsHtml += `
            <div class="chart-item">
                <h5>📞 订单状态分布</h5>
                <canvas id="previewOrderChart" width="300" height="200"></canvas>
            </div>`;
        }
        
        // 课程类型图表
        if (selectedSections.includes('courseAnalysis')) {
            chartsHtml += `
            <div class="chart-item">
                <h5>📚 课程类型分布</h5>
                <canvas id="previewCourseChart" width="300" height="200"></canvas>
            </div>`;
        }
        
        // 收入分析图表
        if (selectedSections.includes('priceAnalysis')) {
            chartsHtml += `
            <div class="chart-item">
                <h5>💰 收入构成分析</h5>
                <canvas id="previewRevenueChart" width="300" height="200"></canvas>
            </div>`;
        }
        
        chartsHtml += '</div></div>';
        return chartsHtml;
    }

    // 渲染预览图表
    renderPreviewCharts(reportData, selectedSections) {
        // 等待DOM更新后再渲染图表
        setTimeout(() => {
            if (selectedSections.includes('orderStats')) {
                this.renderOrderChart(reportData.orderStats);
            }
            if (selectedSections.includes('courseAnalysis')) {
                this.renderCourseChart(reportData.courseAnalysis);
            }
            if (selectedSections.includes('priceAnalysis')) {
                this.renderRevenueChart(reportData.priceAnalysis);
            }
        }, 100);
    }

    // 渲染订单统计图表
    renderOrderChart(orderStats) {
        const canvas = document.getElementById('previewOrderChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // 销毁之前的图表
        if (this.previewCharts?.orderChart) {
            this.previewCharts.orderChart.destroy();
        }
        
        if (!this.previewCharts) this.previewCharts = {};
        
        // 准备数据
        const data = [];
        const labels = [];
        const colors = [];
        
        if (orderStats.completedOrders > 0) {
            data.push(orderStats.completedOrders);
            labels.push('已完成');
            colors.push('#28a745');
        }
        if (orderStats.confirmedOrders > 0) {
            data.push(orderStats.confirmedOrders);
            labels.push('已确认');
            colors.push('#007bff');
        }
        if (orderStats.pendingOrders > 0) {
            data.push(orderStats.pendingOrders);
            labels.push('待处理');
            colors.push('#ffc107');
        }
        if (orderStats.cancelledOrders > 0) {
            data.push(orderStats.cancelledOrders);
            labels.push('已取消');
            colors.push('#dc3545');
        }
        
        if (data.length === 0) {
            ctx.fillStyle = '#666';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('暂无数据', canvas.width/2, canvas.height/2);
            return;
        }
        
        this.previewCharts.orderChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: false,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 10,
                            usePointStyle: true,
                            font: { size: 11 }
                        }
                    }
                }
            }
        });
    }

    // 渲染课程类型图表
    renderCourseChart(courseAnalysis) {
        const canvas = document.getElementById('previewCourseChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (this.previewCharts?.courseChart) {
            this.previewCharts.courseChart.destroy();
        }
        
        if (!this.previewCharts) this.previewCharts = {};
        
        // 准备数据
        const data = [];
        const labels = [];
        const colors = ['#ff6384', '#36a2eb', '#ffce56'];
        
        if (courseAnalysis.summary.p > 0) {
            data.push(courseAnalysis.summary.p);
            labels.push('P课程');
        }
        if (courseAnalysis.summary.pp > 0) {
            data.push(courseAnalysis.summary.pp);
            labels.push('PP课程');
        }
        if (courseAnalysis.summary.other > 0) {
            data.push(courseAnalysis.summary.other);
            labels.push('其他课程');
        }
        
        if (data.length === 0) {
            ctx.fillStyle = '#666';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('暂无数据', canvas.width/2, canvas.height/2);
            return;
        }
        
        this.previewCharts.courseChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, data.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: false,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 10,
                            usePointStyle: true,
                            font: { size: 11 }
                        }
                    }
                }
            }
        });
    }

    // 渲染收入分析图表
    renderRevenueChart(priceAnalysis) {
        const canvas = document.getElementById('previewRevenueChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (this.previewCharts?.revenueChart) {
            this.previewCharts.revenueChart.destroy();
        }
        
        if (!this.previewCharts) this.previewCharts = {};
        
        // 准备数据
        const data = [];
        const labels = [];
        const colors = ['#4bc0c0', '#9966ff', '#ff9f40'];
        
        priceAnalysis.breakdown.forEach((item, index) => {
            if (item.count > 0) {
                data.push(item.revenue);
                labels.push(item.type.toUpperCase() + '课程');
            }
        });
        
        if (data.length === 0) {
            ctx.fillStyle = '#666';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('暂无数据', canvas.width/2, canvas.height/2);
            return;
        }
        
        this.previewCharts.revenueChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '收入(¥)',
                    data: data,
                    backgroundColor: colors.slice(0, data.length),
                    borderWidth: 1,
                    borderColor: colors.slice(0, data.length).map(color => color + '80')
                }]
            },
            options: {
                responsive: false,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '¥' + value.toLocaleString();
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    // 发送报告给商家
    async sendReport() {
        try {
            if (!this.currentReport) {
                window.notificationSystem.show('请先生成报告预览', 'warning');
                return;
            }

            const selectedSections = this.getSelectedSections();
            if (selectedSections.length === 0) {
                window.notificationSystem.show('请至少选择一个报告内容', 'warning');
                return;
            }

            window.loadingManager.show('正在发送报告...');

            const response = await this.apiClient.request('/merchant-reports/send', 'POST', {
                merchantId: this.currentReport.merchant.id,
                year: this.currentReport.period.year,
                month: this.currentReport.period.month,
                selectedSections: selectedSections
            });

            window.notificationSystem.show('报告发送成功！', 'success');
            this.closeReportModal();

        } catch (error) {
            console.error('发送报告失败:', error);
            window.notificationSystem.show('发送报告失败: ' + error.message, 'error');
        } finally {
            window.loadingManager.hide();
        }
    }

    // 生成并下载报告 - 直接下载TXT格式
    async generateAndDownload() {
        try {
            console.log('=== 开始生成下载 ===');
            console.log('当前报告数据:', this.currentReport);
            
            if (!this.currentReport) {
                console.warn('没有报告数据，显示警告');
                window.notificationSystem.show('请先生成报告预览', 'warning');
                return;
            }

            const selectedSections = this.getSelectedSections();
            console.log('选中的报告部分:', selectedSections);
            
            if (selectedSections.length === 0) {
                console.warn('没有选中报告部分，显示警告');
                window.notificationSystem.show('请至少选择一个报告内容', 'warning');
                return;
            }

            console.log('开始生成下载内容...');
            
            // 直接下载TXT格式，简化流程
            const content = this.generateReportTextPreview(this.currentReport, selectedSections);
            
            // 安全获取商家名称
            const merchantName = this.currentReport.merchant?.teacher_name || 
                                this.currentReport.merchant?.name || '未知商家';
            const year = this.currentReport.period?.year || new Date().getFullYear();
            const month = this.currentReport.period?.month || new Date().getMonth() + 1;
            
            const filename = `${merchantName}_${year}年${month}月报告.txt`;
            
            console.log('准备下载文件:', filename, '内容长度:', content.length);
            
            // 创建下载
            try {
                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                console.log('Blob创建成功，大小:', blob.size);
                
                const url = URL.createObjectURL(blob);
                console.log('URL创建成功:', url);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.style.display = 'none';
                
                console.log('添加下载链接到页面');
                document.body.appendChild(a);
                
                console.log('触发下载');
                a.click();
                
                // 立即检查是否触发成功
                console.log('下载链接已点击，href:', a.href, 'download:', a.download);
                
                // 清理
                setTimeout(() => {
                    console.log('清理下载链接');
                    try {
                        if (document.body.contains(a)) {
                            document.body.removeChild(a);
                        }
                        URL.revokeObjectURL(url);
                    } catch (cleanupError) {
                        console.warn('清理时出错:', cleanupError);
                    }
                }, 1000);
                
            } catch (downloadError) {
                console.error('创建下载时出错:', downloadError);
                
                // 备用方案：尝试使用传统方法
                try {
                    const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(content);
                    const a = document.createElement('a');
                    a.href = dataUrl;
                    a.download = filename;
                    a.click();
                    console.log('使用备用下载方案成功');
                } catch (fallbackError) {
                    console.error('备用下载方案也失败:', fallbackError);
                    throw new Error('下载功能不可用，请尝试复制内容');
                }
            }
            
            window.notificationSystem.show('报告下载成功！', 'success');
            console.log('下载完成');

        } catch (error) {
            console.error('生成下载失败:', error);
            window.notificationSystem.show('生成下载失败: ' + error.message, 'error');
        }
    }

    // 显示下载选项
    showDownloadOptions() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>📥 选择下载格式</h3>
                    <span class="close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="download-options">
                        <button class="btn btn-primary download-option" onclick="window.merchantReports.downloadReport('txt')">
                            <i class="btn-icon">📄</i>
                            纯文本格式 (.txt)
                            <small>适合打印和简单查看</small>
                        </button>
                        
                        <button class="btn btn-success download-option" onclick="window.merchantReports.downloadReport('html')">
                            <i class="btn-icon">🌐</i>
                            网页格式 (.html)
                            <small>包含图表，适合分享</small>
                        </button>
                        
                        <button class="btn btn-secondary download-option" onclick="window.merchantReports.downloadReport('json')">
                            <i class="btn-icon">📊</i>
                            数据格式 (.json)
                            <small>原始数据，适合进一步分析</small>
                        </button>
                    </div>
                    
                    <div class="download-options-extra">
                        <label>
                            <input type="checkbox" id="includeCharts" checked>
                            包含图表（仅HTML格式）
                        </label>
                        <label>
                            <input type="checkbox" id="includeRawData">
                            包含原始数据
                        </label>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 点击外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // 下载报告
    async downloadReport(format) {
        try {
            console.log('开始下载报告，格式:', format);
            console.log('当前报告数据:', this.currentReport);
            
            // 检查是否有报告数据
            if (!this.currentReport) {
                window.notificationSystem.show('请先生成报告预览', 'warning');
                return;
            }
            
            const selectedSections = this.getSelectedSections();
            console.log('选中的报告部分:', selectedSections);
            
            if (selectedSections.length === 0) {
                window.notificationSystem.show('请至少选择一个报告内容', 'warning');
                return;
            }
            
            const includeCharts = document.getElementById('includeCharts')?.checked || false;
            const includeRawData = document.getElementById('includeRawData')?.checked || false;
            
            let content, filename, mimeType;
            
            // 安全获取商家名称
            const merchantName = this.currentReport.merchant?.teacher_name || 
                                this.currentReport.merchant?.name || '未知商家';
            const year = this.currentReport.period?.year || new Date().getFullYear();
            const month = this.currentReport.period?.month || new Date().getMonth() + 1;
            
            console.log('文件信息:', { merchantName, year, month });
            
            switch (format) {
                case 'txt':
                    content = this.generateReportTextPreview(this.currentReport, selectedSections);
                    filename = `${merchantName}_${year}年${month}月报告.txt`;
                    mimeType = 'text/plain;charset=utf-8';
                    break;
                    
                case 'html':
                    content = this.generateHTMLReport(this.currentReport, selectedSections, includeCharts);
                    filename = `${merchantName}_${year}年${month}月报告.html`;
                    mimeType = 'text/html;charset=utf-8';
                    break;
                    
                case 'json':
                    content = JSON.stringify({
                        report: this.currentReport,
                        selectedSections,
                        exportTime: new Date().toISOString(),
                        includeRawData
                    }, null, 2);
                    filename = `${merchantName}_${year}年${month}月数据.json`;
                    mimeType = 'application/json;charset=utf-8';
                    break;
                    
                default:
                    throw new Error('不支持的格式: ' + format);
            }
            
            console.log('准备下载文件:', filename, '内容长度:', content.length);
            
            // 创建下载链接
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            
            // 触发下载
            a.click();
            
            // 清理
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            // 关闭模态框
            const modal = document.querySelector('.modal');
            if (modal) {
                modal.remove();
            }
            
            window.notificationSystem.show(`${format.toUpperCase()}格式报告下载成功！`, 'success');
            console.log('下载完成');

        } catch (error) {
            console.error('下载报告失败:', error);
            window.notificationSystem.show('下载报告失败: ' + error.message, 'error');
        }
    }

    // 生成HTML报告
    generateHTMLReport(reportData, selectedSections, includeCharts = true) {
        const reportText = this.generateReportTextPreview(reportData, selectedSections);
        
        let html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${reportData.merchant.teacher_name} ${reportData.period.year}年${reportData.period.month}月经营分析报告</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f8f9fa;
        }
        .report-container {
            background: white;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .report-header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e9ecef;
        }
        .report-content {
            white-space: pre-wrap;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 14px;
            line-height: 1.8;
            color: #2c3e50;
        }
        .charts-section {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
        }
        .chart-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        .chart-item {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
        }
        .chart-item h4 {
            margin-bottom: 15px;
            color: #495057;
        }
        .export-info {
            margin-top: 30px;
            padding: 15px;
            background: #e7f3ff;
            border-radius: 8px;
            font-size: 12px;
            color: #0066cc;
        }
        @media print {
            body { background: white; }
            .report-container { box-shadow: none; }
        }
    </style>
    ${includeCharts ? '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>' : ''}
</head>
<body>
    <div class="report-container">
        <div class="report-header">
            <h1>📋 ${reportData.merchant.teacher_name}</h1>
            <h2>${reportData.period.year}年${reportData.period.month}月经营分析报告</h2>
            <p>生成时间: ${new Date().toLocaleString('zh-CN')}</p>
        </div>
        
        <div class="report-content">${reportText}</div>
        
        ${includeCharts ? this.generateChartsHTML(reportData, selectedSections) : ''}
        
        <div class="export-info">
            <strong>📊 报告说明：</strong><br>
            • 本报告由小鸡管家智能分析生成<br>
            • 数据统计周期：${reportData.period.year}年${reportData.period.month}月<br>
            • 导出时间：${new Date().toLocaleString('zh-CN')}<br>
            • 包含内容：${selectedSections.map(s => this.reportTemplates[s]?.title || s).join('、')}
        </div>
    </div>
</body>
</html>`;
        
        return html;
    }

    // 生成图表HTML
    generateChartsHTML(reportData, selectedSections) {
        let chartsHTML = '<div class="charts-section"><h3>📊 数据可视化</h3><div class="chart-grid">';
        
        if (selectedSections.includes('orderStats')) {
            chartsHTML += `
                <div class="chart-item">
                    <h4>订单统计分析</h4>
                    <canvas id="orderChart" width="400" height="300"></canvas>
                </div>
            `;
        }
        
        if (selectedSections.includes('courseAnalysis') && reportData.courseAnalysis.totalCompleted > 0) {
            chartsHTML += `
                <div class="chart-item">
                    <h4>课程类型分布</h4>
                    <canvas id="courseChart" width="400" height="300"></canvas>
                </div>
            `;
        }
        
        if (selectedSections.includes('priceAnalysis') && reportData.priceAnalysis.breakdown.length > 0) {
            chartsHTML += `
                <div class="chart-item">
                    <h4>收入构成分析</h4>
                    <canvas id="revenueChart" width="400" height="300"></canvas>
                </div>
            `;
        }
        
        chartsHTML += '</div></div>';
        
        // 添加图表渲染脚本
        chartsHTML += `
<script>
document.addEventListener('DOMContentLoaded', function() {
    ${this.generateChartScripts(reportData, selectedSections)}
});
</script>`;
        
        return chartsHTML;
    }

    // 生成图表脚本
    generateChartScripts(reportData, selectedSections) {
        let scripts = '';
        
        if (selectedSections.includes('orderStats')) {
            scripts += `
    // 订单统计图表
    const orderCtx = document.getElementById('orderChart');
    if (orderCtx) {
        new Chart(orderCtx, {
            type: 'doughnut',
            data: {
                labels: ['已完成', '确认预约', '待处理', '已取消'],
                datasets: [{
                    data: [${reportData.orderStats.completedOrders}, ${reportData.orderStats.confirmedOrders}, ${reportData.orderStats.pendingOrders}, ${reportData.orderStats.cancelledOrders}],
                    backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }
            `;
        }
        
        if (selectedSections.includes('courseAnalysis') && reportData.courseAnalysis.totalCompleted > 0) {
            scripts += `
    // 课程类型图表
    const courseCtx = document.getElementById('courseChart');
    if (courseCtx) {
        const courseData = [];
        const courseLabels = [];
        const courseColors = [];
        
        if (${reportData.courseAnalysis.summary.p} > 0) {
            courseLabels.push('P课程');
            courseData.push(${reportData.courseAnalysis.summary.p});
            courseColors.push('#8b5cf6');
        }
        if (${reportData.courseAnalysis.summary.pp} > 0) {
            courseLabels.push('PP课程');
            courseData.push(${reportData.courseAnalysis.summary.pp});
            courseColors.push('#06b6d4');
        }
        if (${reportData.courseAnalysis.summary.other} > 0) {
            courseLabels.push('其他课程');
            courseData.push(${reportData.courseAnalysis.summary.other});
            courseColors.push('#10b981');
        }
        
        new Chart(courseCtx, {
            type: 'pie',
            data: {
                labels: courseLabels,
                datasets: [{
                    data: courseData,
                    backgroundColor: courseColors
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }
            `;
        }
        
        if (selectedSections.includes('priceAnalysis') && reportData.priceAnalysis.breakdown.length > 0) {
            const validBreakdown = reportData.priceAnalysis.breakdown.filter(item => item.count > 0);
            scripts += `
    // 收入分析图表
    const revenueCtx = document.getElementById('revenueChart');
    if (revenueCtx) {
        new Chart(revenueCtx, {
            type: 'bar',
            data: {
                labels: [${validBreakdown.map(item => `'${item.type}课程'`).join(',')}],
                datasets: [{
                    label: '收入 (¥)',
                    data: [${validBreakdown.map(item => item.revenue).join(',')}],
                    backgroundColor: ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
            `;
        }
        
        return scripts;
    }

    // 分享报告功能
    async shareReport() {
        try {
            if (!this.currentReport) {
                window.notificationSystem.show('请先生成报告预览', 'warning');
                return;
            }

            const selectedSections = this.getSelectedSections();
            if (selectedSections.length === 0) {
                window.notificationSystem.show('请至少选择一个报告内容', 'warning');
                return;
            }

            // 生成分享链接或复制到剪贴板
            const reportText = this.generateReportTextPreview(this.currentReport, selectedSections);
            
            if (navigator.share) {
                // 使用原生分享API
                await navigator.share({
                    title: `${this.currentReport.merchant.teacher_name} ${this.currentReport.period.year}年${this.currentReport.period.month}月经营报告`,
                    text: reportText.substring(0, 500) + '...',
                    url: window.location.href
                });
                window.notificationSystem.show('分享成功！', 'success');
            } else {
                // 复制到剪贴板
                await navigator.clipboard.writeText(reportText);
                window.notificationSystem.show('报告内容已复制到剪贴板！', 'success');
            }

        } catch (error) {
            console.error('分享报告失败:', error);
            window.notificationSystem.show('分享失败: ' + error.message, 'error');
        }
    }



    // 从排名页面生成商家报告
    async generateMerchantReportFromRanking(merchantId, year, month) {
        try {
            // 关闭排名模态框
            this.closeRankingModal();
            
            // 打开报告生成模态框
            this.showReportModal();
            
            // 设置选择的商家和日期
            document.getElementById('reportMerchantSelect').value = merchantId;
            document.getElementById('reportYear').value = year;
            document.getElementById('reportMonth').value = month;
            
            // 自动生成预览
            setTimeout(() => {
                this.generatePreview();
            }, 100);
            
        } catch (error) {
            console.error('生成商家报告失败:', error);
            window.notificationSystem.show('生成商家报告失败: ' + error.message, 'error');
        }
    }


}

// 初始化商家报告管理器
document.addEventListener('DOMContentLoaded', function() {
    console.log('商家报告管理器 - DOM加载完成');
    
    // 立即创建实例，不等待依赖
    try {
        window.merchantReports = new MerchantReportsManager();
        console.log('商家报告管理器实例创建成功:', window.merchantReports);
        console.log('generateAndDownload方法:', typeof window.merchantReports.generateAndDownload);
    } catch (error) {
        console.error('商家报告管理器实例创建失败:', error);
    }
    
    // 检查依赖
    const checkDependencies = () => {
        return window.api && window.notificationSystem && window.loadingManager;
    };
    
    // 尝试初始化
    const tryInit = () => {
        if (checkDependencies() && window.merchantReports) {
            console.log('商家报告管理器 - 依赖检查通过，开始初始化');
            try {
                if (typeof window.merchantReports.init === 'function') {
                    window.merchantReports.init();
                    console.log('商家报告管理器 - 初始化成功');
                } else {
                    console.error('商家报告管理器 - init方法不存在');
                }
            } catch (error) {
                console.error('商家报告管理器 - 初始化失败:', error);
            }
        } else {
            console.log('商家报告管理器 - 依赖未就绪，等待中...');
            console.log('window.api:', typeof window.api);
            console.log('window.notificationSystem:', typeof window.notificationSystem);
            console.log('window.loadingManager:', typeof window.loadingManager);
            console.log('window.merchantReports:', typeof window.merchantReports);
            setTimeout(tryInit, 500);
        }
    };
    
    // 开始尝试初始化
    setTimeout(tryInit, 200);
});

// 点击模态框外部关闭
window.addEventListener('click', function(event) {
    const reportModal = document.getElementById('merchantReportModal');
    const rankingModal = document.getElementById('merchantRankingModal');
    
    if (event.target === reportModal) {
        window.merchantReports.closeReportModal();
    }
    
    if (event.target === rankingModal) {
        window.merchantReports.closeRankingModal();
    }
}); 
/**
 * 性能监控模块
 * 监控API响应时间、数据库查询性能、内存使用等
 */

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            apiRequests: new Map(),
            dbQueries: new Map(),
            memoryUsage: [],
            activeConnections: 0
        };
        
        this.startTime = Date.now();
        this.requestCounter = 0;
        
        // 定期收集性能数据
        this.startPeriodicCollection();
    }
    
    // 开始API请求计时
    startApiTimer(endpoint) {
        const requestId = `${endpoint}_${++this.requestCounter}_${Date.now()}`;
        return {
            requestId,
            startTime: process.hrtime.bigint()
        };
    }
    
    // 结束API请求计时
    endApiTimer(timer, endpoint, statusCode = 200) {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - timer.startTime) / 1000000; // 转换为毫秒
        
        if (!this.metrics.apiRequests.has(endpoint)) {
            this.metrics.apiRequests.set(endpoint, {
                count: 0,
                totalTime: 0,
                avgTime: 0,
                minTime: Infinity,
                maxTime: 0,
                errors: 0
            });
        }
        
        const metric = this.metrics.apiRequests.get(endpoint);
        metric.count++;
        metric.totalTime += duration;
        metric.avgTime = metric.totalTime / metric.count;
        metric.minTime = Math.min(metric.minTime, duration);
        metric.maxTime = Math.max(metric.maxTime, duration);
        
        if (statusCode >= 400) {
            metric.errors++;
        }
        
        // 如果响应时间超过阈值，记录警告
        if (duration > 1000) { // 1秒
            console.warn(`⚠️ 慢请求警告: ${endpoint} 耗时 ${duration.toFixed(2)}ms`);
        }
    }
    
    // 记录数据库查询性能
    recordDbQuery(query, duration, error = null) {
        const queryType = this.getQueryType(query);
        
        if (!this.metrics.dbQueries.has(queryType)) {
            this.metrics.dbQueries.set(queryType, {
                count: 0,
                totalTime: 0,
                avgTime: 0,
                errors: 0
            });
        }
        
        const metric = this.metrics.dbQueries.get(queryType);
        metric.count++;
        metric.totalTime += duration;
        metric.avgTime = metric.totalTime / metric.count;
        
        if (error) {
            metric.errors++;
        }
        
        // 慢查询警告
        if (duration > 100) { // 100ms
            console.warn(`⚠️ 慢查询警告: ${queryType} 耗时 ${duration}ms`);
        }
    }
    
    // 获取查询类型
    getQueryType(query) {
        const sql = query.toLowerCase().trim();
        if (sql.startsWith('select')) return 'SELECT';
        if (sql.startsWith('insert')) return 'INSERT';
        if (sql.startsWith('update')) return 'UPDATE';
        if (sql.startsWith('delete')) return 'DELETE';
        return 'OTHER';
    }
    
    // 记录内存使用情况
    recordMemoryUsage() {
        const usage = process.memoryUsage();
        this.metrics.memoryUsage.push({
            timestamp: Date.now(),
            rss: usage.rss,
            heapUsed: usage.heapUsed,
            heapTotal: usage.heapTotal,
            external: usage.external
        });
        
        // 只保留最近100条记录
        if (this.metrics.memoryUsage.length > 100) {
            this.metrics.memoryUsage.shift();
        }
        
        // 内存泄漏检测
        const heapUsedMB = usage.heapUsed / 1024 / 1024;
        if (heapUsedMB > 512) { // 512MB
            console.warn(`⚠️ 内存使用过高: ${heapUsedMB.toFixed(2)}MB`);
        }
    }
    
    // 获取性能报告
    getPerformanceReport() {
        const uptime = Date.now() - this.startTime;
        const memoryUsage = process.memoryUsage();
        
        return {
            uptime: uptime,
            uptimeFormatted: this.formatUptime(uptime),
            memory: {
                rss: (memoryUsage.rss / 1024 / 1024).toFixed(2) + ' MB',
                heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
                heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2) + ' MB'
            },
            apiMetrics: this.getApiMetrics(),
            dbMetrics: this.getDbMetrics(),
            activeConnections: this.metrics.activeConnections
        };
    }
    
    // 获取API性能指标
    getApiMetrics() {
        const metrics = {};
        for (const [endpoint, data] of this.metrics.apiRequests.entries()) {
            metrics[endpoint] = {
                requests: data.count,
                avgResponseTime: data.avgTime.toFixed(2) + 'ms',
                minResponseTime: data.minTime.toFixed(2) + 'ms',
                maxResponseTime: data.maxTime.toFixed(2) + 'ms',
                errorRate: ((data.errors / data.count) * 100).toFixed(2) + '%'
            };
        }
        return metrics;
    }
    
    // 获取数据库性能指标
    getDbMetrics() {
        const metrics = {};
        for (const [queryType, data] of this.metrics.dbQueries.entries()) {
            metrics[queryType] = {
                queries: data.count,
                avgTime: data.avgTime.toFixed(2) + 'ms',
                errorRate: ((data.errors / data.count) * 100).toFixed(2) + '%'
            };
        }
        return metrics;
    }
    
    // 格式化运行时间
    formatUptime(uptime) {
        const seconds = Math.floor(uptime / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days}天 ${hours % 24}小时`;
        if (hours > 0) return `${hours}小时 ${minutes % 60}分钟`;
        if (minutes > 0) return `${minutes}分钟 ${seconds % 60}秒`;
        return `${seconds}秒`;
    }
    
    // 开始定期收集性能数据
    startPeriodicCollection() {
        // 每分钟收集一次内存使用情况
        setInterval(() => {
            this.recordMemoryUsage();
        }, 60 * 1000);
        
        // 每10分钟清理过期的性能数据
        setInterval(() => {
            this.cleanupOldMetrics();
        }, 10 * 60 * 1000);
    }
    
    // 清理旧的性能数据
    cleanupOldMetrics() {
        // 重置API指标（保留结构但清零计数器）
        for (const [endpoint, data] of this.metrics.apiRequests.entries()) {
            if (data.count > 1000) { // 超过1000次请求时重置
                data.count = Math.floor(data.count / 2);
                data.totalTime = data.totalTime / 2;
                data.errors = Math.floor(data.errors / 2);
            }
        }
        
        // 清理旧的内存使用记录
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        this.metrics.memoryUsage = this.metrics.memoryUsage.filter(
            record => record.timestamp > oneHourAgo
        );
    }
    
    // 增加活跃连接数
    incrementConnections() {
        this.metrics.activeConnections++;
    }
    
    // 减少活跃连接数
    decrementConnections() {
        this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
    }
}

// 创建全局性能监控实例
const performanceMonitor = new PerformanceMonitor();

module.exports = performanceMonitor; 
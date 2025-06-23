// 通用JavaScript功能模块

// API请求封装
class ApiClient {
    constructor(baseUrl = '/api') {
        this.baseUrl = baseUrl;
    }

    async request(url, method = 'GET', data = null) {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        try {
            const response = await fetch(`${this.baseUrl}${url}`, options);
            const result = await response.json();
            
            console.log(`API请求 ${method} ${url}:`, result);
            
            // 处理不同的API返回格式
            // 有些API返回 { success: true, data: {...} }
            // 有些API直接返回 { data: {...} }
            if (result.success === false) {
                throw new Error(result.error || result.message || '请求失败');
            }
            
            // 如果有data字段，返回data；否则返回整个结果
            return result.data !== undefined ? result.data : result;
        } catch (error) {
            console.error('API请求失败:', error);
            throw error;
        }
    }

    async get(url) {
        return this.request(url, 'GET');
    }

    async post(url, data) {
        return this.request(url, 'POST', data);
    }

    async put(url, data) {
        return this.request(url, 'PUT', data);
    }

    async delete(url, data = null) {
        return this.request(url, 'DELETE', data);
    }
}

// 全局API客户端实例
const api = new ApiClient();
window.api = api;

// 通知系统
class NotificationSystem {
    constructor() {
        this.container = this.createContainer();
    }

    createContainer() {
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                max-width: 400px;
            `;
            document.body.appendChild(container);
        }
        return container;
    }

    show(message, type = 'success', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `alert alert-${type}`;
        notification.style.cssText = `
            margin-bottom: 10px;
            animation: slideInRight 0.3s ease;
            cursor: pointer;
        `;
        notification.textContent = message;
        
        // 点击关闭
        notification.addEventListener('click', () => {
            this.remove(notification);
        });
        
        this.container.appendChild(notification);
        
        // 自动关闭
        if (duration > 0) {
            setTimeout(() => {
                this.remove(notification);
            }, duration);
        }
        
        return notification;
    }

    remove(notification) {
        if (notification && notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }

    success(message, duration) {
        return this.show(message, 'success', duration);
    }

    error(message, duration) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration) {
        return this.show(message, 'info', duration);
    }
}

// 全局通知系统实例
const notify = new NotificationSystem();
window.notificationSystem = notify;

// 加载状态管理
class LoadingManager {
    constructor() {
        this.loadingCount = 0;
        this.overlay = this.createOverlay();
    }

    createOverlay() {
        let overlay = document.getElementById('loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: none;
                justify-content: center;
                align-items: center;
                z-index: 9999;
            `;
            
            const spinner = document.createElement('div');
            spinner.className = 'spinner';
            spinner.style.cssText = `
                border: 4px solid #f3f3f3;
                border-top: 4px solid #667eea;
                border-radius: 50%;
                width: 50px;
                height: 50px;
                animation: spin 1s linear infinite;
            `;
            
            // 添加CSS动画
            if (!document.getElementById('loading-spinner-style')) {
                const style = document.createElement('style');
                style.id = 'loading-spinner-style';
                style.textContent = `
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    @keyframes slideInRight {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                    @keyframes slideOutRight {
                        from { transform: translateX(0); opacity: 1; }
                        to { transform: translateX(100%); opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
            }
            
            overlay.appendChild(spinner);
            document.body.appendChild(overlay);
        }
        return overlay;
    }

    show() {
        this.loadingCount++;
        this.overlay.style.display = 'flex';
    }

    hide() {
        this.loadingCount = Math.max(0, this.loadingCount - 1);
        if (this.loadingCount === 0) {
            this.overlay.style.display = 'none';
        }
    }

    async wrap(promise) {
        this.show();
        try {
            const result = await promise;
            return result;
        } finally {
            this.hide();
        }
    }
}

// 全局加载管理器实例
const loading = new LoadingManager();
window.loadingManager = loading;

// 模态框管理
class ModalManager {
    constructor() {
        this.modals = new Map();
    }

    create(id, title, content, options = {}) {
        const modal = document.createElement('div');
        modal.id = id;
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: ${options.maxWidth || '500px'}">
                <span class="close">&times;</span>
                <h3>${title}</h3>
                <div class="modal-body">
                    ${content}
                </div>
                ${options.showActions !== false ? `
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" data-action="cancel">取消</button>
                        <button type="button" class="btn btn-primary" data-action="confirm">确认</button>
                    </div>
                ` : ''}
            </div>
        `;
        
        document.body.appendChild(modal);
        this.modals.set(id, modal);
        
        // 绑定事件
        this.bindEvents(modal, options);
        
        return modal;
    }

    bindEvents(modal, options) {
        const closeBtn = modal.querySelector('.close');
        const cancelBtn = modal.querySelector('[data-action="cancel"]');
        const confirmBtn = modal.querySelector('[data-action="confirm"]');
        
        const closeModal = () => this.hide(modal.id);
        
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        
        if (confirmBtn && options.onConfirm) {
            confirmBtn.addEventListener('click', () => {
                const result = options.onConfirm(modal);
                if (result !== false) {
                    closeModal();
                }
            });
        }
        
        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    show(id) {
        const modal = this.modals.get(id);
        if (modal) {
            modal.style.display = 'block';
        }
    }

    hide(id) {
        const modal = this.modals.get(id);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    remove(id) {
        const modal = this.modals.get(id);
        if (modal) {
            modal.remove();
            this.modals.delete(id);
        }
    }

    confirm(title, message, onConfirm) {
        const id = 'confirm-modal-' + Date.now();
        this.create(id, title, `<p>${message}</p>`, {
            onConfirm: () => {
                if (onConfirm) onConfirm();
                return true;
            }
        });
        this.show(id);
    }

    alert(title, message) {
        const id = 'alert-modal-' + Date.now();
        this.create(id, title, `<p>${message}</p>`, {
            showActions: false
        });
        this.show(id);
        
        // 3秒后自动关闭
        setTimeout(() => {
            this.remove(id);
        }, 3000);
    }
}

// 全局模态框管理器实例
const modal = new ModalManager();

// 表单验证工具
class FormValidator {
    constructor(form) {
        this.form = form;
        this.rules = new Map();
        this.errors = new Map();
    }

    addRule(fieldName, validator, message) {
        if (!this.rules.has(fieldName)) {
            this.rules.set(fieldName, []);
        }
        this.rules.get(fieldName).push({ validator, message });
        return this;
    }

    required(fieldName, message = '此字段为必填项') {
        return this.addRule(fieldName, (value) => value && value.trim() !== '', message);
    }

    email(fieldName, message = '请输入有效的邮箱地址') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return this.addRule(fieldName, (value) => !value || emailRegex.test(value), message);
    }

    minLength(fieldName, length, message) {
        return this.addRule(fieldName, (value) => !value || value.length >= length, 
            message || `最少需要${length}个字符`);
    }

    maxLength(fieldName, length, message) {
        return this.addRule(fieldName, (value) => !value || value.length <= length, 
            message || `最多允许${length}个字符`);
    }

    pattern(fieldName, regex, message) {
        return this.addRule(fieldName, (value) => !value || regex.test(value), message);
    }

    validate() {
        this.errors.clear();
        let isValid = true;

        this.rules.forEach((rules, fieldName) => {
            const field = this.form.querySelector(`[name="${fieldName}"]`);
            if (!field) return;

            const value = field.value;
            
            for (const rule of rules) {
                if (!rule.validator(value)) {
                    this.errors.set(fieldName, rule.message);
                    this.showFieldError(field, rule.message);
                    isValid = false;
                    break;
                } else {
                    this.clearFieldError(field);
                }
            }
        });

        return isValid;
    }

    showFieldError(field, message) {
        this.clearFieldError(field);
        
        field.style.borderColor = '#f44336';
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'field-error';
        errorDiv.style.cssText = 'color: #f44336; font-size: 12px; margin-top: 5px;';
        errorDiv.textContent = message;
        
        field.parentNode.appendChild(errorDiv);
    }

    clearFieldError(field) {
        field.style.borderColor = '';
        
        const existingError = field.parentNode.querySelector('.field-error');
        if (existingError) {
            existingError.remove();
        }
    }

    getErrors() {
        return Object.fromEntries(this.errors);
    }
}

// 工具函数
const utils = {
    // 格式化日期
    formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
        if (!date) return '';
        
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        
        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds);
    },

    // 防抖函数
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // 节流函数
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // 深拷贝
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        if (typeof obj === 'object') {
            const clonedObj = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    clonedObj[key] = this.deepClone(obj[key]);
                }
            }
            return clonedObj;
        }
    },

    // 生成随机ID
    generateId(prefix = 'id') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    // 本地存储封装
    storage: {
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (error) {
                console.error('存储数据失败:', error);
            }
        },

        get(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (error) {
                console.error('读取数据失败:', error);
                return defaultValue;
            }
        },

        remove(key) {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.error('删除数据失败:', error);
            }
        },

        clear() {
            try {
                localStorage.clear();
            } catch (error) {
                console.error('清空数据失败:', error);
            }
        }
    }
};

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

// 导出全局对象
window.api = api;
window.notify = notify;
window.notificationSystem = notify;  // 兼容性别名
window.loading = new LoadingManager();
window.loadingManager = window.loading;     // 兼容性别名
window.modal = new ModalManager();
window.FormValidator = FormValidator;
window.utils = utils; 
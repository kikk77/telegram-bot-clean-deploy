const dbOperations = require('../models/dbOperations');
const crypto = require('crypto');

// 绑定码管理服务模块
class BindCodeService {
    constructor() {
        this.bindCodes = new Map(); // 绑定码缓存
        this.loadBindCodes();
    }

    // 加载绑定码数据到缓存
    loadBindCodes() {
        try {
            const bindCodes = dbOperations.getAllBindCodes();
            this.bindCodes.clear();
            bindCodes.forEach(bindCode => {
                this.bindCodes.set(bindCode.code, bindCode);
            });
            console.log(`已加载 ${bindCodes.length} 个绑定码到缓存`);
        } catch (error) {
            console.error('加载绑定码数据失败:', error);
        }
    }

    // 生成唯一绑定码
    generateUniqueCode() {
        let code;
        let attempts = 0;
        const maxAttempts = 100;
        
        do {
            // 生成8位随机字符串
            code = crypto.randomBytes(4).toString('hex').toUpperCase();
            attempts++;
            
            if (attempts > maxAttempts) {
                throw new Error('无法生成唯一绑定码，请重试');
            }
        } while (this.bindCodes.has(code));
        
        return code;
    }

    // 创建新绑定码
    createBindCode(description = '') {
        try {
            const code = this.generateUniqueCode();
            const bindCodeId = dbOperations.createBindCode(code, description);
            
            // 添加到缓存
            const newBindCode = {
                id: bindCodeId,
                code: code,
                description: description,
                used: false,
                used_by_user_id: null,
                used_by_username: null,
                created_at: Math.floor(Date.now() / 1000),
                used_at: null
            };
            
            this.bindCodes.set(code, newBindCode);
            
            console.log(`创建新绑定码: ${code}, 描述: ${description}`);
            return { id: bindCodeId, code: code };
        } catch (error) {
            console.error('创建绑定码失败:', error);
            throw error;
        }
    }

    // 验证绑定码
    validateBindCode(code) {
        try {
            const bindCode = this.bindCodes.get(code);
            
            if (!bindCode) {
                return { valid: false, reason: 'INVALID_CODE', message: '绑定码不存在' };
            }
            
            if (bindCode.used) {
                return { 
                    valid: false, 
                    reason: 'ALREADY_USED', 
                    message: '绑定码已被使用',
                    usedBy: bindCode.used_by_username || '未知用户'
                };
            }
            
            return { valid: true, bindCode: bindCode };
        } catch (error) {
            console.error('验证绑定码失败:', error);
            return { valid: false, reason: 'ERROR', message: '验证失败' };
        }
    }

    // 标记绑定码为已使用
    markBindCodeAsUsed(code, userId, username) {
        try {
            const bindCode = this.bindCodes.get(code);
            if (!bindCode) {
                throw new Error('绑定码不存在');
            }
            
            if (bindCode.used) {
                throw new Error('绑定码已被使用');
            }
            
            // 更新数据库
            dbOperations.markBindCodeAsUsed(bindCode.id, userId, username);
            
            // 更新缓存
            bindCode.used = true;
            bindCode.used_by_user_id = userId;
            bindCode.used_by_username = username;
            bindCode.used_at = Math.floor(Date.now() / 1000);
            
            console.log(`绑定码 ${code} 已被用户 ${username} (${userId}) 使用`);
            return true;
        } catch (error) {
            console.error('标记绑定码为已使用失败:', error);
            throw error;
        }
    }

    // 获取所有绑定码
    getAllBindCodes() {
        try {
            return Array.from(this.bindCodes.values()).sort((a, b) => b.created_at - a.created_at);
        } catch (error) {
            console.error('获取所有绑定码失败:', error);
            return [];
        }
    }

    // 根据代码获取绑定码
    getBindCodeByCode(code) {
        try {
            return this.bindCodes.get(code) || null;
        } catch (error) {
            console.error('根据代码获取绑定码失败:', error);
            return null;
        }
    }

    // 根据ID获取绑定码
    getBindCodeById(id) {
        try {
            return Array.from(this.bindCodes.values()).find(bindCode => bindCode.id === id) || null;
        } catch (error) {
            console.error('根据ID获取绑定码失败:', error);
            return null;
        }
    }

    // 删除绑定码
    deleteBindCode(id, force = false) {
        try {
            const bindCode = this.getBindCodeById(id);
            if (!bindCode) {
                throw new Error('绑定码不存在');
            }
            
            if (bindCode.used && !force) {
                throw new Error('已使用的绑定码无法删除，如需强制删除请使用force参数');
            }
            
            // 从数据库删除
            dbOperations.deleteBindCode(id);
            
            // 从缓存中移除
            this.bindCodes.delete(bindCode.code);
            
            console.log(`删除绑定码: ${bindCode.code}${force ? ' (强制删除)' : ''}`);
            return true;
        } catch (error) {
            console.error('删除绑定码失败:', error);
            throw error;
        }
    }

    // 强制删除已使用的绑定码（管理员功能）
    forceDeleteBindCode(id) {
        return this.deleteBindCode(id, true);
    }



    // 获取绑定码统计信息
    getBindCodeStats() {
        try {
            const allBindCodes = this.getAllBindCodes();
            const usedBindCodes = allBindCodes.filter(bc => bc.used);
            const unusedBindCodes = allBindCodes.filter(bc => !bc.used);
            
            return {
                total: allBindCodes.length,
                used: usedBindCodes.length,
                unused: unusedBindCodes.length,
                usageRate: allBindCodes.length > 0 ? (usedBindCodes.length / allBindCodes.length * 100).toFixed(2) : 0
            };
        } catch (error) {
            console.error('获取绑定码统计信息失败:', error);
            return { total: 0, used: 0, unused: 0, usageRate: 0 };
        }
    }

    // 批量创建绑定码
    createMultipleBindCodes(count, description = '') {
        try {
            const createdCodes = [];
            
            for (let i = 0; i < count; i++) {
                const result = this.createBindCode(`${description} (批量创建 ${i + 1}/${count})`);
                createdCodes.push(result);
            }
            
            console.log(`批量创建 ${count} 个绑定码完成`);
            return createdCodes;
        } catch (error) {
            console.error('批量创建绑定码失败:', error);
            throw error;
        }
    }

    // 清理过期未使用的绑定码
    cleanupExpiredBindCodes(daysOld = 30) {
        try {
            const cutoffTime = Math.floor(Date.now() / 1000) - (daysOld * 24 * 60 * 60);
            const expiredCodes = Array.from(this.bindCodes.values())
                .filter(bc => !bc.used && bc.created_at < cutoffTime);
            
            let deletedCount = 0;
            expiredCodes.forEach(bindCode => {
                try {
                    this.deleteBindCode(bindCode.id);
                    deletedCount++;
                } catch (error) {
                    console.error(`删除过期绑定码 ${bindCode.code} 失败:`, error);
                }
            });
            
            console.log(`清理了 ${deletedCount} 个过期未使用的绑定码`);
            return deletedCount;
        } catch (error) {
            console.error('清理过期绑定码失败:', error);
            return 0;
        }
    }

    // 重新加载绑定码缓存
    reloadBindCodes() {
        this.loadBindCodes();
    }
}

module.exports = BindCodeService; 
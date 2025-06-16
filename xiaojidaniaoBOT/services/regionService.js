const dbOperations = require('../models/dbOperations');

// 地区管理服务模块
class RegionService {
    constructor() {
        this.regions = new Map(); // 地区缓存
        this.loadRegions();
    }

    // 加载地区数据到缓存
    loadRegions() {
        try {
            const regions = dbOperations.getAllRegions();
            this.regions.clear();
            regions.forEach(region => {
                this.regions.set(region.id, region);
            });
            console.log(`已加载 ${regions.length} 个地区到缓存`);
        } catch (error) {
            console.error('加载地区数据失败:', error);
        }
    }

    // 获取所有地区
    getAllRegions() {
        try {
            return Array.from(this.regions.values()).sort((a, b) => a.sort_order - b.sort_order);
        } catch (error) {
            console.error('获取所有地区失败:', error);
            return [];
        }
    }

    // 根据ID获取地区
    getRegionById(regionId) {
        try {
            return this.regions.get(regionId) || null;
        } catch (error) {
            console.error('根据ID获取地区失败:', error);
            return null;
        }
    }

    // 根据名称获取地区
    getRegionByName(name) {
        try {
            return Array.from(this.regions.values()).find(region => region.name === name) || null;
        } catch (error) {
            console.error('根据名称获取地区失败:', error);
            return null;
        }
    }

    // 创建新地区
    createRegion(name, sortOrder = 0) {
        try {
            const regionId = dbOperations.createRegion(name, sortOrder);
            
            // 更新缓存
            const newRegion = { id: regionId, name, sort_order: sortOrder };
            this.regions.set(regionId, newRegion);
            
            console.log(`创建新地区: ${name}, ID: ${regionId}`);
            return regionId;
        } catch (error) {
            console.error('创建地区失败:', error);
            throw error;
        }
    }

    // 更新地区信息
    updateRegion(regionId, name, sortOrder) {
        try {
            dbOperations.updateRegion(regionId, name, sortOrder);
            
            // 更新缓存
            const region = this.regions.get(regionId);
            if (region) {
                region.name = name;
                region.sort_order = sortOrder;
            }
            
            console.log(`更新地区: ID ${regionId}, 名称: ${name}, 排序: ${sortOrder}`);
            return true;
        } catch (error) {
            console.error('更新地区失败:', error);
            throw error;
        }
    }

    // 删除地区
    deleteRegion(regionId) {
        try {
            // 检查是否有商家使用此地区
            const merchants = dbOperations.getMerchantsByRegion(regionId);
            if (merchants.length > 0) {
                throw new Error(`无法删除地区，还有 ${merchants.length} 个商家使用此地区`);
            }
            
            dbOperations.deleteRegion(regionId);
            
            // 从缓存中移除
            this.regions.delete(regionId);
            
            console.log(`删除地区: ID ${regionId}`);
            return true;
        } catch (error) {
            console.error('删除地区失败:', error);
            throw error;
        }
    }

    // 生成地区选择键盘
    generateRegionKeyboard() {
        try {
            const regions = this.getAllRegions();
            
            if (regions.length === 0) {
                return null;
            }
            
            return {
                inline_keyboard: regions.map(region => [{
                    text: region.name,
                    callback_data: `select_region_${region.id}`
                }])
            };
        } catch (error) {
            console.error('生成地区键盘失败:', error);
            return null;
        }
    }

    // 获取地区统计信息
    getRegionStats() {
        try {
            const regions = this.getAllRegions();
            const stats = [];
            
            regions.forEach(region => {
                const merchants = dbOperations.getMerchantsByRegion(region.id);
                const activeMerchants = merchants.filter(m => m.status === 'active' && m.bind_step === 5);
                
                stats.push({
                    id: region.id,
                    name: region.name,
                    totalMerchants: merchants.length,
                    activeMerchants: activeMerchants.length,
                    sortOrder: region.sort_order
                });
            });
            
            return stats;
        } catch (error) {
            console.error('获取地区统计信息失败:', error);
            return [];
        }
    }

    // 重新加载地区缓存
    reloadRegions() {
        this.loadRegions();
    }
}

module.exports = RegionService; 
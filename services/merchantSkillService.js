const EAVOperations = require('../models/eavOperations');

class MerchantSkillService {
    constructor(db) {
        this.eav = new EAVOperations(db);
        this.db = db;
    }

    // 获取单个商家的技能信息
    getMerchantSkills(merchantId) {
        try {
            const skills = this.eav.getEntity(`merchant_${merchantId}`, 'merchant_skills');
            if (!skills) {
                // 如果EAV中没有找到，尝试从原始表中迁移
                return this.migrateMerchantSkillsFromLegacy(merchantId);
            }
            return skills;
        } catch (error) {
            console.error(`获取商家技能失败 (merchantId: ${merchantId}):`, error);
            return this.getDefaultSkills();
        }
    }

    // 批量获取多个商家的技能信息
    getBatchMerchantSkills(merchantIds) {
        try {
            const entityKeys = merchantIds.map(id => `merchant_${id}`);
            const skillsData = this.eav.getBatchEntities(entityKeys, 'merchant_skills');
            
            const result = {};
            for (const merchantId of merchantIds) {
                const entityKey = `merchant_${merchantId}`;
                result[merchantId] = skillsData[entityKey] || this.getDefaultSkills();
            }
            
            return result;
        } catch (error) {
            console.error('批量获取商家技能失败:', error);
            const result = {};
            for (const merchantId of merchantIds) {
                result[merchantId] = this.getDefaultSkills();
            }
            return result;
        }
    }

    // 更新商家技能
    updateMerchantSkills(merchantId, skillData) {
        try {
            const entityKey = `merchant_${merchantId}`;
            
            // 验证技能数据
            const validatedSkills = this.validateSkillData(skillData);
            
            // 检查实体是否存在
            const existingSkills = this.eav.getEntity(entityKey, 'merchant_skills');
            
            if (existingSkills) {
                // 更新现有技能
                for (const [fieldName, value] of Object.entries(validatedSkills)) {
                    this.eav.updateEntityField(entityKey, 'merchant_skills', fieldName, value);
                }
            } else {
                // 创建新的技能记录
                this.eav.createEntity(entityKey, 'merchant_skills', validatedSkills);
            }
            
            return true;
        } catch (error) {
            console.error(`更新商家技能失败 (merchantId: ${merchantId}):`, error);
            return false;
        }
    }

    // 格式化技能显示文本
    formatSkillsDisplay(merchantId) {
        const skills = this.getMerchantSkills(merchantId);
        
        const skillEmojis = {
            wash: '💦',
            blow: '👄', 
            do: '❤️',
            kiss: '🐍'
        };
        
        const skillNames = {
            wash: '洗',
            blow: '吹',
            do: '做', 
            kiss: '吻'
        };
        
        let display = '';
        for (const [key, name] of Object.entries(skillNames)) {
            const emoji = skillEmojis[key];
            const value = skills[key] || '未填写';
            display += `${emoji}${name}:${value}\n`;
        }
        
        return display.trim();
    }

    // 搜索具有特定技能的商家
    findMerchantsBySkill(skillType, skillValue) {
        try {
            const entityKeys = this.eav.getEntitiesByFieldValue('merchant_skills', skillType, skillValue);
            return entityKeys.map(key => parseInt(key.replace('merchant_', '')));
        } catch (error) {
            console.error(`按技能搜索商家失败 (${skillType}: ${skillValue}):`, error);
            return [];
        }
    }

    // 获取所有商家的技能统计
    getSkillsStatistics() {
        try {
            const allSkills = this.eav.getAllEntities('merchant_skills');
            const stats = {
                total_merchants: Object.keys(allSkills).length,
                skill_distribution: {}
            };
            
            const skillTypes = ['wash', 'blow', 'do', 'kiss'];
            
            for (const skillType of skillTypes) {
                stats.skill_distribution[skillType] = {};
                
                for (const [entityKey, skills] of Object.entries(allSkills)) {
                    const skillValue = skills[skillType] || '未填写';
                    if (!stats.skill_distribution[skillType][skillValue]) {
                        stats.skill_distribution[skillType][skillValue] = 0;
                    }
                    stats.skill_distribution[skillType][skillValue]++;
                }
            }
            
            return stats;
        } catch (error) {
            console.error('获取技能统计失败:', error);
            return {
                total_merchants: 0,
                skill_distribution: {}
            };
        }
    }

    // 从传统表结构迁移技能数据
    migrateMerchantSkillsFromLegacy(merchantId) {
        try {
            const stmt = this.db.prepare(`
                SELECT skill_wash, skill_blow, skill_do, skill_kiss 
                FROM merchants 
                WHERE id = ?
            `);
            
            const legacyData = stmt.get(merchantId);
            if (!legacyData) {
                return this.getDefaultSkills();
            }
            
            const skillData = {
                wash: legacyData.skill_wash || '未填写',
                blow: legacyData.skill_blow || '未填写',
                do: legacyData.skill_do || '未填写',
                kiss: legacyData.skill_kiss || '未填写'
            };
            
            // 迁移到EAV
            const entityKey = `merchant_${merchantId}`;
            this.eav.createEntity(entityKey, 'merchant_skills', skillData);
            
            console.log(`成功将商家 ${merchantId} 的技能数据迁移到EAV`);
            return skillData;
        } catch (error) {
            console.error(`迁移商家技能数据失败 (merchantId: ${merchantId}):`, error);
            return this.getDefaultSkills();
        }
    }

    // 批量迁移所有商家的技能数据
    migrateAllMerchantSkills() {
        try {
            const merchantsStmt = this.db.prepare(`
                SELECT id, skill_wash, skill_blow, skill_do, skill_kiss 
                FROM merchants 
                WHERE skill_wash IS NOT NULL 
                   OR skill_blow IS NOT NULL 
                   OR skill_do IS NOT NULL 
                   OR skill_kiss IS NOT NULL
            `);
            
            const merchants = merchantsStmt.all();
            let migrated = 0;
            
            for (const merchant of merchants) {
                const skillData = {
                    wash: merchant.skill_wash || '未填写',
                    blow: merchant.skill_blow || '未填写',
                    do: merchant.skill_do || '未填写',
                    kiss: merchant.skill_kiss || '未填写'
                };
                
                const entityKey = `merchant_${merchant.id}`;
                try {
                    this.eav.createEntity(entityKey, 'merchant_skills', skillData);
                    migrated++;
                } catch (error) {
                    console.error(`迁移商家 ${merchant.id} 技能数据失败:`, error);
                }
            }
            
            console.log(`成功迁移 ${migrated}/${merchants.length} 个商家的技能数据到EAV`);
            return migrated;
        } catch (error) {
            console.error('批量迁移商家技能数据失败:', error);
            return 0;
        }
    }

    // 验证技能数据
    validateSkillData(skillData) {
        const validSkills = {};
        const skillTypes = ['wash', 'blow', 'do', 'kiss'];
        
        for (const skillType of skillTypes) {
            if (skillData[skillType] !== undefined) {
                validSkills[skillType] = String(skillData[skillType]).trim() || '未填写';
            }
        }
        
        return validSkills;
    }

    // 获取默认技能
    getDefaultSkills() {
        return {
            wash: '未填写',
            blow: '未填写',
            do: '未填写',
            kiss: '未填写'
        };
    }

    // 同步技能数据到传统表结构 (向后兼容)
    syncSkillsToLegacyTable(merchantId) {
        try {
            const skills = this.getMerchantSkills(merchantId);
            
            const updateStmt = this.db.prepare(`
                UPDATE merchants 
                SET skill_wash = ?, skill_blow = ?, skill_do = ?, skill_kiss = ?
                WHERE id = ?
            `);
            
            updateStmt.run(
                skills.wash,
                skills.blow,
                skills.do,
                skills.kiss,
                merchantId
            );
            
            return true;
        } catch (error) {
            console.error(`同步技能数据到传统表失败 (merchantId: ${merchantId}):`, error);
            return false;
        }
    }

    // 删除商家技能数据
    deleteMerchantSkills(merchantId) {
        try {
            const entityKey = `merchant_${merchantId}`;
            this.eav.deleteEntity(entityKey, 'merchant_skills');
            
            // 同时清理传统表的数据
            const clearStmt = this.db.prepare(`
                UPDATE merchants 
                SET skill_wash = NULL, skill_blow = NULL, skill_do = NULL, skill_kiss = NULL
                WHERE id = ?
            `);
            clearStmt.run(merchantId);
            
            return true;
        } catch (error) {
            console.error(`删除商家技能数据失败 (merchantId: ${merchantId}):`, error);
            return false;
        }
    }

    // 获取技能配置元数据 (从EAV schema)
    getSkillMetadata() {
        try {
            // 从EAV schema获取技能字段的元数据
            const schemaStmt = this.db.prepare(`
                SELECT f.field_name, f.field_type, f.description, f.required
                FROM eav_field_definitions f
                JOIN eav_schema_definitions s ON f.schema_id = s.schema_id
                WHERE s.schema_name = 'merchant_skills'
            `);
            
            const fields = schemaStmt.all();
            const metadata = {};
            
            for (const field of fields) {
                metadata[field.field_name] = {
                    type: field.field_type,
                    description: field.description,
                    required: Boolean(field.required)
                };
            }
            
            return metadata;
        } catch (error) {
            console.error('获取技能元数据失败:', error);
            return {
                wash: { type: 'string', description: '洗的技能描述', required: false },
                blow: { type: 'string', description: '吹的技能描述', required: false },
                do: { type: 'string', description: '做的技能描述', required: false },
                kiss: { type: 'string', description: '吻的技能描述', required: false }
            };
        }
    }
}

module.exports = MerchantSkillService; 
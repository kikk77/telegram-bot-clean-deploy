const path = require('path');
const fs = require('fs');

class EAVOperations {
    constructor(db) {
        this.db = db;
        this.initializeEAVTables();
        this.loadSchemaDefinitions();
        this.loadDataValues();
    }

    // 初始化EAV表结构
    initializeEAVTables() {
        // EAV Schema定义表
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS eav_schema_definitions (
                schema_id INTEGER PRIMARY KEY,
                schema_name TEXT UNIQUE NOT NULL,
                description TEXT,
                version TEXT DEFAULT '1.0',
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);

        // EAV字段定义表
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS eav_field_definitions (
                field_id INTEGER PRIMARY KEY,
                schema_id INTEGER NOT NULL,
                field_name TEXT NOT NULL,
                field_type TEXT NOT NULL,
                required INTEGER DEFAULT 0,
                max_length INTEGER,
                min_value INTEGER,
                max_value INTEGER,
                pattern TEXT,
                description TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (schema_id) REFERENCES eav_schema_definitions(schema_id),
                UNIQUE(schema_id, field_name)
            )
        `);

        // EAV数据值表
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS eav_data_values (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_id INTEGER NOT NULL,
                schema_id INTEGER NOT NULL,
                entity_key TEXT NOT NULL,
                field_id INTEGER NOT NULL,
                value TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (schema_id) REFERENCES eav_schema_definitions(schema_id),
                FOREIGN KEY (field_id) REFERENCES eav_field_definitions(field_id),
                UNIQUE(entity_id, field_id)
            )
        `);

        // 创建EAV优化索引
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_eav_entity_schema ON eav_data_values(entity_key, schema_id, field_id);
            CREATE INDEX IF NOT EXISTS idx_eav_field_value ON eav_data_values(field_id, value, entity_key);
            CREATE INDEX IF NOT EXISTS idx_eav_schema_entity ON eav_data_values(schema_id, entity_key);
            CREATE INDEX IF NOT EXISTS idx_eav_field_definitions_schema ON eav_field_definitions(schema_id, field_name);
        `);

        console.log('EAV表结构初始化完成');
    }

    // 加载Schema定义
    loadSchemaDefinitions() {
        try {
            const configPath = path.join(__dirname, '../../business_data/configuration/eav_schema_definitions.json');
            if (fs.existsSync(configPath)) {
                const schemas = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                
                for (const schema of schemas) {
                    // 插入schema定义
                    const schemaStmt = this.db.prepare(`
                        INSERT OR REPLACE INTO eav_schema_definitions 
                        (schema_id, schema_name, description, version) 
                        VALUES (?, ?, ?, ?)
                    `);
                    schemaStmt.run(schema.schema_id, schema.schema_name, schema.description, schema.version);

                    // 插入字段定义
                    const fieldStmt = this.db.prepare(`
                        INSERT OR REPLACE INTO eav_field_definitions 
                        (field_id, schema_id, field_name, field_type, required, max_length, min_value, max_value, pattern, description) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);

                    for (const field of schema.fields) {
                        fieldStmt.run(
                            field.field_id,
                            schema.schema_id,
                            field.field_name,
                            field.field_type,
                            field.required ? 1 : 0,
                            field.max_length || null,
                            field.min_value || null,
                            field.max_value || null,
                            field.pattern || null,
                            field.description
                        );
                    }
                }
                console.log(`加载了 ${schemas.length} 个EAV Schema定义`);
            }
        } catch (error) {
            console.error('加载EAV Schema定义失败:', error);
        }
    }

    // 加载数据值
    loadDataValues() {
        try {
            const dataPath = path.join(__dirname, '../../business_data/configuration/eav_data_values.json');
            if (fs.existsSync(dataPath)) {
                const dataValues = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
                
                const stmt = this.db.prepare(`
                    INSERT OR REPLACE INTO eav_data_values 
                    (entity_id, schema_id, entity_key, field_id, value) 
                    VALUES (?, ?, ?, ?, ?)
                `);

                for (const entity of dataValues) {
                    for (const valueItem of entity.values) {
                        stmt.run(
                            entity.entity_id,
                            entity.schema_id,
                            entity.entity_key,
                            valueItem.field_id,
                            valueItem.value
                        );
                    }
                }
                console.log(`加载了 ${dataValues.length} 个EAV实体数据`);
            }
        } catch (error) {
            console.error('加载EAV数据值失败:', error);
        }
    }

    // 获取单个实体的所有字段值
    getEntity(entityKey, schemaName) {
        const stmt = this.db.prepare(`
            SELECT f.field_name, v.value 
            FROM eav_data_values v 
            JOIN eav_schema_definitions s ON v.schema_id = s.schema_id 
            JOIN eav_field_definitions f ON v.field_id = f.field_id 
            WHERE v.entity_key = ? AND s.schema_name = ?
        `);

        const rows = stmt.all(entityKey, schemaName);
        const result = {};
        
        for (const row of rows) {
            let value = row.value;
            // 尝试解析JSON数组
            if (value && (value.startsWith('[') || value.startsWith('{'))) {
                try {
                    value = JSON.parse(value);
                } catch (e) {
                    // 如果解析失败，保持原始字符串
                }
            }
            result[row.field_name] = value;
        }
        
        return Object.keys(result).length > 0 ? result : null;
    }

    // 批量获取多个实体
    getBatchEntities(entityKeys, schemaName) {
        if (!entityKeys || entityKeys.length === 0) return {};

        const placeholders = entityKeys.map(() => '?').join(',');
        const stmt = this.db.prepare(`
            SELECT v.entity_key, f.field_name, v.value 
            FROM eav_data_values v 
            JOIN eav_schema_definitions s ON v.schema_id = s.schema_id 
            JOIN eav_field_definitions f ON v.field_id = f.field_id 
            WHERE v.entity_key IN (${placeholders}) AND s.schema_name = ?
            ORDER BY v.entity_key, f.field_id
        `);

        const rows = stmt.all(...entityKeys, schemaName);
        const results = {};
        
        for (const row of rows) {
            if (!results[row.entity_key]) {
                results[row.entity_key] = {};
            }
            
            let value = row.value;
            // 尝试解析JSON数组
            if (value && (value.startsWith('[') || value.startsWith('{'))) {
                try {
                    value = JSON.parse(value);
                } catch (e) {
                    // 如果解析失败，保持原始字符串
                }
            }
            results[row.entity_key][row.field_name] = value;
        }
        
        return results;
    }

    // 按字段值过滤查询
    getEntitiesByFieldValue(schemaName, fieldName, value) {
        const stmt = this.db.prepare(`
            SELECT DISTINCT v1.entity_key 
            FROM eav_data_values v1 
            JOIN eav_schema_definitions s ON v1.schema_id = s.schema_id 
            JOIN eav_field_definitions f ON v1.field_id = f.field_id 
            WHERE s.schema_name = ? AND f.field_name = ? AND v1.value = ?
        `);

        const rows = stmt.all(schemaName, fieldName, value);
        return rows.map(row => row.entity_key);
    }

    // 获取Schema下的所有实体
    getAllEntities(schemaName) {
        const stmt = this.db.prepare(`
            SELECT v.entity_key, f.field_name, v.value 
            FROM eav_data_values v 
            JOIN eav_schema_definitions s ON v.schema_id = s.schema_id 
            JOIN eav_field_definitions f ON v.field_id = f.field_id 
            WHERE s.schema_name = ? 
            ORDER BY v.entity_key, f.field_id
        `);

        const rows = stmt.all(schemaName);
        const results = {};
        
        for (const row of rows) {
            if (!results[row.entity_key]) {
                results[row.entity_key] = {};
            }
            
            let value = row.value;
            // 尝试解析JSON数组
            if (value && (value.startsWith('[') || value.startsWith('{'))) {
                try {
                    value = JSON.parse(value);
                } catch (e) {
                    // 如果解析失败，保持原始字符串
                }
            }
            results[row.entity_key][row.field_name] = value;
        }
        
        return results;
    }

    // 更新实体字段值
    updateEntityField(entityKey, schemaName, fieldName, value) {
        // 先获取schema_id和field_id
        const schemaStmt = this.db.prepare(`
            SELECT s.schema_id, f.field_id 
            FROM eav_schema_definitions s 
            JOIN eav_field_definitions f ON s.schema_id = f.schema_id 
            WHERE s.schema_name = ? AND f.field_name = ?
        `);
        
        const schemaInfo = schemaStmt.get(schemaName, fieldName);
        if (!schemaInfo) {
            throw new Error(`Schema ${schemaName} 或字段 ${fieldName} 不存在`);
        }

        // 获取entity_id
        const entityStmt = this.db.prepare(`
            SELECT entity_id FROM eav_data_values 
            WHERE entity_key = ? AND schema_id = ? 
            LIMIT 1
        `);
        const entityInfo = entityStmt.get(entityKey, schemaInfo.schema_id);
        
        if (!entityInfo) {
            throw new Error(`实体 ${entityKey} 不存在`);
        }

        // 更新值
        const updateStmt = this.db.prepare(`
            INSERT OR REPLACE INTO eav_data_values 
            (entity_id, schema_id, entity_key, field_id, value, updated_at) 
            VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
        `);

        const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return updateStmt.run(entityInfo.entity_id, schemaInfo.schema_id, entityKey, schemaInfo.field_id, stringValue);
    }

    // 创建新实体
    createEntity(entityKey, schemaName, fieldValues) {
        // 获取schema信息
        const schemaStmt = this.db.prepare(`SELECT schema_id FROM eav_schema_definitions WHERE schema_name = ?`);
        const schemaInfo = schemaStmt.get(schemaName);
        
        if (!schemaInfo) {
            throw new Error(`Schema ${schemaName} 不存在`);
        }

        // 获取下一个entity_id
        const maxEntityStmt = this.db.prepare(`SELECT MAX(entity_id) as max_id FROM eav_data_values WHERE schema_id = ?`);
        const maxResult = maxEntityStmt.get(schemaInfo.schema_id);
        const newEntityId = (maxResult.max_id || 0) + 1;

        // 获取字段定义
        const fieldsStmt = this.db.prepare(`
            SELECT field_id, field_name FROM eav_field_definitions WHERE schema_id = ?
        `);
        const fields = fieldsStmt.all(schemaInfo.schema_id);
        const fieldMap = {};
        for (const field of fields) {
            fieldMap[field.field_name] = field.field_id;
        }

        // 插入数据值
        const insertStmt = this.db.prepare(`
            INSERT INTO eav_data_values 
            (entity_id, schema_id, entity_key, field_id, value) 
            VALUES (?, ?, ?, ?, ?)
        `);

        for (const [fieldName, value] of Object.entries(fieldValues)) {
            if (fieldMap[fieldName]) {
                const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                insertStmt.run(newEntityId, schemaInfo.schema_id, entityKey, fieldMap[fieldName], stringValue);
            }
        }

        return newEntityId;
    }

    // 删除实体
    deleteEntity(entityKey, schemaName) {
        const stmt = this.db.prepare(`
            DELETE FROM eav_data_values 
            WHERE entity_key = ? AND schema_id = (
                SELECT schema_id FROM eav_schema_definitions WHERE schema_name = ?
            )
        `);
        return stmt.run(entityKey, schemaName);
    }
}

module.exports = EAVOperations; 
# 小鸡预约系统 - 数据导出导入指南

## 概述

本系统提供了完整的数据导出和导入功能，确保在Railway云端部署时数据安全，支持系统升级前的数据备份和恢复。

## 🎯 主要功能

### 1. 一键数据导出
- **覆盖范围**：所有业务数据、配置数据、用户数据
- **导出格式**：JSON（推荐）、CSV
- **文件结构**：ZIP压缩包，包含完整的数据结构和恢复指南

### 2. 自动数据备份
- **数据库文件备份**：原始.db文件的完整副本
- **结构化数据导出**：JSON格式的表数据
- **元数据记录**：导出时间、版本信息、恢复指南

### 3. 历史管理
- **导出历史**：查看所有历史导出记录
- **文件管理**：一键下载、自动清理旧文件
- **存储优化**：自动保留最近5个导出文件

## 📊 数据结构说明

### 核心业务数据 (core.db)
```
- regions: 地区配置
- bind_codes: 绑定码管理
- merchants: 商家信息
- booking_sessions: 预约会话
- orders: 订单数据
- evaluations: 评价数据
- evaluation_sessions: 评价会话
- order_stats: 订单统计
- merchant_ratings: 商家评分汇总
- user_ratings: 用户评分汇总
```

### 模板配置数据 (templates.db)
```
- message_templates: 消息模板
- trigger_words: 触发词配置
- scheduled_tasks: 定时任务
- button_configs: 按钮配置
```

### 用户交互数据 (users_YYYY_MM.db)
```
- user_bookings: 用户预约记录
- user_evaluations: 用户评价
- user_reports: 用户报告
- merchant_orders: 商家接单记录
- merchant_evaluations: 商家评价
- interactions: 交互记录
```

## 🚀 使用指南

### 导出数据

#### 1. 通过后台管理界面
1. 访问订单详情页面 (`/admin/orders.html`)
2. 点击 **📦 导出数据** 按钮
3. 选择导出格式：
   - **JSON格式**：推荐，便于数据恢复
   - **CSV格式**：便于Excel查看分析
4. 点击 **🎯 开始导出**
5. 等待导出完成，自动下载ZIP文件

#### 2. 通过API接口
```bash
# 导出所有数据
curl -X POST http://localhost:3000/api/export/all-data \
  -H "Content-Type: application/json" \
  -d '{"format": "json"}'

# 获取导出历史
curl http://localhost:3000/api/export/history

# 下载导出文件
curl -O http://localhost:3000/api/export/download/export_2024-01-01T00-00-00-000Z.zip
```

### 导出文件结构
```
export_2024-01-01T00-00-00-000Z.zip
├── core_data/                    # 核心业务数据
│   ├── regions.json
│   ├── bind_codes.json
│   ├── merchants.json
│   ├── orders.json
│   ├── evaluations.json
│   └── statistics.json           # 统计摘要
├── template_data/                # 模板配置数据
│   ├── message_templates.json
│   ├── trigger_words.json
│   └── scheduled_tasks.json
├── user_data/                    # 用户交互数据（按月分区）
│   ├── users_2024_01/
│   ├── users_2024_02/
│   └── ...
├── database_backup/              # 原始数据库文件备份
│   ├── core.db
│   ├── templates.db
│   ├── users_2024_01.db
│   └── ...
└── export_metadata.json         # 导出元数据和恢复指南
```

## 🔄 数据恢复

### Railway云端部署恢复步骤

#### 1. 准备工作
- 确保有最新的数据导出文件
- 停止当前Bot服务（如果正在运行）
- 备份当前数据（可选）

#### 2. 简单恢复（推荐）
```bash
# 1. 下载导出文件到服务器
wget [导出文件URL] -O backup.zip

# 2. 停止服务
pkill -f "node.*app.js"

# 3. 备份当前数据
cp -r data data_backup_$(date +%Y%m%d_%H%M%S)

# 4. 解压并恢复数据库文件
unzip -q backup.zip
cp export_*/database_backup/* data/

# 5. 重启服务
node app.js
```

#### 3. 完整恢复（使用导入服务）
```javascript
// 通过API恢复数据
const DataImportService = require('./services/dataImportService');
const importService = new DataImportService();

await importService.importAllData('/path/to/backup.zip', {
    overwriteExisting: true,
    createBackup: true,
    skipValidation: false
});
```

### 本地环境恢复
1. 将导出的ZIP文件放到项目根目录
2. 运行恢复脚本：
```bash
# 解压数据
unzip backup.zip

# 复制数据库文件
cp export_*/database_backup/* data/

# 重启应用
npm start
```

## ⚡ 自动化脚本

### 定期备份脚本
```bash
#!/bin/bash
# auto_backup.sh

# 设置变量
BACKUP_DIR="/path/to/backups"
API_URL="http://localhost:3000"
DATE=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p $BACKUP_DIR

# 调用导出API
curl -X POST $API_URL/api/export/all-data \
  -H "Content-Type: application/json" \
  -d '{"format": "json"}' \
  -o "$BACKUP_DIR/backup_$DATE.json"

# 清理旧备份（保留最近10个）
ls -t $BACKUP_DIR/backup_*.zip | tail -n +11 | xargs rm -f

echo "备份完成: backup_$DATE.zip"
```

### Railway部署前备份
```bash
#!/bin/bash
# pre_deploy_backup.sh

echo "🚀 部署前数据备份..."

# 导出数据
curl -X POST $RAILWAY_URL/api/export/all-data \
  -H "Content-Type: application/json" \
  -d '{"format": "json"}' \
  -o "pre_deploy_backup_$(date +%Y%m%d_%H%M%S).zip"

echo "✅ 备份完成，可以安全部署"
```

## 🛡️ 安全注意事项

### 1. 数据安全
- **敏感信息**：导出文件包含所有用户数据和商家信息
- **访问控制**：确保导出文件存储在安全位置
- **传输加密**：使用HTTPS传输导出文件
- **定期清理**：及时删除不需要的导出文件

### 2. 恢复安全
- **验证完整性**：恢复前验证文件完整性
- **备份当前数据**：恢复前先备份当前数据
- **测试环境验证**：在测试环境先验证恢复流程
- **分步恢复**：大数据量时分步进行恢复

### 3. Railway云端注意事项
- **存储限制**：注意Railway的存储空间限制
- **网络超时**：大文件导出可能遇到网络超时
- **环境变量**：确保恢复后环境变量配置正确
- **服务重启**：数据恢复后需要重启所有相关服务

## 🔧 故障排除

### 常见问题

#### 1. 导出失败
```
错误：数据导出失败: archiver is not defined
解决：npm install archiver
```

#### 2. 文件下载失败
```
错误：文件不存在
解决：检查exports目录权限，确保文件未被清理
```

#### 3. 数据恢复失败
```
错误：数据库文件损坏
解决：使用database_backup目录中的原始文件
```

#### 4. Railway部署问题
```
错误：健康检查失败
解决：检查环境变量配置，确保BOT_TOKEN等必需变量已设置
```

### 日志查看
```bash
# 查看导出日志
tail -f logs/export.log

# 查看应用日志
tail -f logs/app.log

# Railway日志
railway logs
```

## 📈 最佳实践

### 1. 定期备份策略
- **每日备份**：自动化每日数据导出
- **重要操作前备份**：升级、配置变更前手动备份
- **多地备份**：本地和云端多重备份
- **版本管理**：保留多个版本的备份文件

### 2. 升级流程
1. **部署前备份**：导出当前所有数据
2. **测试环境验证**：在测试环境验证新版本
3. **灰度部署**：逐步部署到生产环境
4. **数据验证**：部署后验证数据完整性
5. **回滚准备**：准备快速回滚方案

### 3. 监控和告警
- **导出成功率监控**：监控导出操作成功率
- **存储空间监控**：监控备份文件存储空间
- **数据完整性检查**：定期检查数据完整性
- **异常告警**：导出失败时及时告警

## 📞 技术支持

如果在数据导出导入过程中遇到问题，请：

1. **查看日志**：检查应用和导出日志
2. **验证环境**：确认环境配置正确
3. **测试网络**：检查网络连接和权限
4. **联系支持**：提供详细的错误信息和日志

---

**重要提醒**：数据是系统的核心资产，请务必定期备份，确保数据安全！ 
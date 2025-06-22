# Railway部署检查清单

## 🚀 部署前准备

### 1. Bot配置
- [ ] 已创建生产Bot：`@xiaojisystembot`
- [ ] 已获取生产Bot Token：`6873045781:AAGNvdO8TaJbOhGo5v-4NQmSU4Sd1KdKbRo`
- [ ] 已将Bot添加到目标群组：`-1002793326688`
- [ ] 已设置Bot为群组管理员

### 2. Railway Variables配置
在Railway控制台 → Variables页面设置：

```
BOT_TOKEN=6873045781:AAGNvdO8TaJbOhGo5v-4NQmSU4Sd1KdKbRo
BOT_USERNAME=xiaojisystembot
GROUP_CHAT_ID=-1002793326688
NODE_ENV=production
```

### 3. 部署步骤
1. [ ] 推送代码到GitHub
2. [ ] 在Railway中连接GitHub仓库
3. [ ] 配置环境变量
4. [ ] 触发部署
5. [ ] 等待健康检查通过

## 🧪 部署后验证

### 功能测试
- [ ] Bot响应 `/start` 命令
- [ ] 管理后台可访问：`https://your-app.railway.app/admin`
- [ ] 健康检查正常：`https://your-app.railway.app/health`
- [ ] 群组消息发送正常
- [ ] 预约流程完整可用

### 数据验证
- [ ] 数据库连接正常
- [ ] 现有数据未丢失
- [ ] 新订单可以创建

## 🔄 Bot切换操作

### 从测试Bot切换到生产Bot
1. [ ] 停止本地测试实例
2. [ ] 更新Railway Variables中的Bot配置
3. [ ] 重新部署Railway应用
4. [ ] 验证新Bot功能正常

### 群组切换
1. [ ] 将新Bot添加到目标群组
2. [ ] 设置Bot管理员权限
3. [ ] 更新`GROUP_CHAT_ID`变量
4. [ ] 测试群组消息发送

## 📋 应急回滚

如果部署出现问题：
1. [ ] 在Railway中回滚到上一个版本
2. [ ] 恢复原有环境变量配置
3. [ ] 检查日志排查问题
4. [ ] 验证回滚后功能正常

## 🔗 相关链接

- Railway控制台：https://railway.app/dashboard
- Bot管理：https://t.me/BotFather
- 项目仓库：https://github.com/kikk77/telegram-bot-clean-deploy 
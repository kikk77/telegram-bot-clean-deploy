# Railway 部署指南

## 修复健康检查问题

我们已经修复了健康检查配置问题，并将代码推送到了正确的仓库。以下是部署步骤：

### 1. 代码仓库信息

- **正确的GitHub仓库**: `https://github.com/kikk77/telegram-bot-clean-deploy.git`
- **正确的分支**: `clean-deploy-branch`

### 2. Railway配置更新

1. 登录Railway控制台: https://railway.app/dashboard
2. 找到你的项目 `06200217uploadfinalversion`
3. 点击 **Settings** 标签
4. 在 **Source** 部分:
   - 检查当前连接的GitHub仓库
   - 如果不是 `kikk77/telegram-bot-clean-deploy`，点击 **Change** 并选择正确的仓库
   - 在分支设置中，选择 `clean-deploy-branch`
   - 点击 **保存更改**

### 3. 重新部署

1. 在Railway控制台中，点击 **Deployments** 标签
2. 点击 **Deploy Now** 按钮
3. 等待部署完成
4. 检查健康检查是否通过

### 4. 健康检查改进

我们做了以下改进来解决健康检查失败问题：

1. **双端口健康检查**:
   - 主应用端口: 3000
   - 独立健康检查端口: 3001

2. **增强的健康检查端点**:
   - 路径: `/health`
   - 检查数据库连接
   - 检查机器人状态
   - 返回详细的健康状态信息

3. **Docker配置优化**:
   - 使用curl代替wget进行健康检查
   - 增加了健康检查的超时时间和重试次数

4. **Railway配置更新**:
   - 使用nixpacks构建器
   - 配置了更长的健康检查超时时间
   - 设置了正确的重启策略

### 5. 验证部署

部署完成后，可以通过以下方式验证:

1. 检查Railway控制台中的健康检查状态
2. 访问 `https://[your-app-url]/health` 查看健康检查响应
3. 测试机器人功能是否正常工作

如果部署仍然失败，请查看日志以获取更多信息。 
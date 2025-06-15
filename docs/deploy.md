# 🚀 完整部署指南

## 第一步：获取Telegram Bot Token

### 1. 创建机器人
1. 在Telegram中搜索 [@BotFather](https://t.me/BotFather)
2. 发送 `/start` 开始对话
3. 发送 `/newbot` 创建新机器人
4. 输入机器人名称，例如：`我的营销机器人`
5. 输入机器人用户名，例如：`my_marketing_bot`（必须以`bot`结尾）

### 2. 获取Token
创建成功后，BotFather会发送给你一个Token，格式如下：
```
1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

**⚠️ 重要：请妥善保管这个Token，不要泄露给他人！**

### 3. 设置机器人权限
继续在BotFather中设置：
```
/setjoingroups - 允许机器人加入群组
/setprivacy - 设置为Disable（关闭隐私模式，允许读取群组消息）
```

## 第二步：Railway部署（推荐）

### 1. 准备代码
确保你的项目包含以下文件：
```
telegram-marketing-bot/
├── app.js
├── admin.html  
├── package.json
├── railway.json
├── env.example
└── README.md
```

### 2. 上传到GitHub
```bash
# 初始化Git仓库
git init
git add .
git commit -m "Initial commit"

# 关联GitHub仓库（替换为你的仓库地址）
git remote add origin https://github.com/你的用户名/telegram-marketing-bot.git
git push -u origin main
```

### 3. Railway部署
1. **访问Railway**：https://railway.app
2. **登录/注册**：使用GitHub账户登录
3. **创建项目**：
   - 点击 "New Project"
   - 选择 "Deploy from GitHub repo"
   - 选择你刚上传的仓库
4. **设置环境变量**：
   - 在项目面板中点击 "Variables"
   - 添加环境变量：
     ```
     BOT_TOKEN = 你的机器人Token
     PORT = 3000
     ```
5. **部署**：Railway会自动检测Node.js项目并开始部署

### 4. 获取部署地址
部署完成后，Railway会提供一个URL，例如：
```
https://your-app-name.up.railway.app
```

## 第三步：本地测试（可选）

如果想先在本地测试：

```bash
# 克隆项目
git clone https://github.com/你的用户名/telegram-marketing-bot.git
cd telegram-marketing-bot

# 安装依赖
npm install

# 设置环境变量（Windows）
set BOT_TOKEN=你的机器人Token

# 设置环境变量（Mac/Linux）
export BOT_TOKEN="你的机器人Token"

# 启动服务
npm start
```

访问 http://localhost:3000 查看管理后台

## 第四步：验证部署

### 1. 检查机器人状态
- 在Telegram中搜索你的机器人
- 发送 `/start` 测试响应

### 2. 访问管理后台
- 打开你的Railway部署URL
- 应该能看到管理界面

### 3. 测试完整流程
1. **创建商家**：在管理后台添加商家，获得绑定码
2. **绑定商家**：商家私聊机器人发送 `/bind 绑定码`
3. **创建按钮**：在管理后台创建按钮并关联商家
4. **测试发送**：将机器人添加到测试群组，在管理后台发送测试消息

## 常见问题解决

### ❌ "Bot Token错误"
- 检查Token是否正确复制（没有多余空格）
- 确认机器人没有被删除
- 重新生成Token：在BotFather发送 `/token`

### ❌ "机器人不回复"
- 确认机器人隐私模式已关闭：`/setprivacy` -> `Disable`
- 检查服务器是否正常运行
- 查看Railway部署日志

### ❌ "无法发送到群组"
- 确认机器人已添加到群组
- 确认机器人有发送消息权限
- 群组ID格式应为负数，例如：`-1001234567890`

### ❌ "管理后台打不开"
- 检查Railway部署状态
- 确认PORT环境变量设置正确
- 查看部署日志排查错误

## 进阶配置

### 自定义域名
在Railway项目设置中可以绑定自定义域名

### 数据库备份
SQLite数据库文件 `marketing_bot.db` 会自动创建在项目根目录

### 监控日志
在Railway控制台的"Logs"标签可以查看实时日志

## 🎉 部署完成！

现在你的Telegram营销机器人已经成功部署并运行在云端，24小时在线为用户服务！ 
# 使用官方Node.js运行时作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apk add --no-cache python3 make g++ curl

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装项目依赖
RUN npm ci --only=production

# 复制项目文件
COPY . .

# 创建数据目录
RUN mkdir -p data

# 设置权限
RUN chown -R node:node /app
USER node

# 暴露端口
EXPOSE 3000

# 健康检查 - 使用curl代替wget，更可靠
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# 启动应用
CMD ["npm", "start"] 
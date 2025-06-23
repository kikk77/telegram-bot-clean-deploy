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

# 创建数据目录并设置权限
RUN mkdir -p data app-data && chown -R node:node /app

# 创建启动脚本来处理Volume权限问题
RUN echo '#!/bin/sh' > /app/fix-permissions.sh && \
    echo 'if [ -d "/app/data" ] && [ ! -w "/app/data" ]; then' >> /app/fix-permissions.sh && \
    echo '  echo "🔧 修复数据目录权限..."' >> /app/fix-permissions.sh && \
    echo '  chmod 755 /app/data 2>/dev/null || true' >> /app/fix-permissions.sh && \
    echo '  chown node:node /app/data 2>/dev/null || true' >> /app/fix-permissions.sh && \
    echo 'fi' >> /app/fix-permissions.sh && \
    echo 'exec "$@"' >> /app/fix-permissions.sh && \
    chmod +x /app/fix-permissions.sh

USER node

# 暴露端口
EXPOSE 3000

# 健康检查 - 使用curl代替wget，更可靠
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# 使用权限修复脚本启动应用
ENTRYPOINT ["/app/fix-permissions.sh"]
CMD ["npm", "start"] 
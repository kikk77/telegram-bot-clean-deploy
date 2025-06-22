#!/usr/bin/env node

// Railway部署专用启动脚本
// 简化启动流程，确保快速响应健康检查

console.log('🚀 Railway部署启动脚本');
console.log('📅 启动时间:', new Date().toISOString());

// 检查关键环境变量
const requiredEnvs = ['BOT_TOKEN', 'BOT_USERNAME'];
const missingEnvs = requiredEnvs.filter(env => !process.env[env]);

if (missingEnvs.length > 0) {
    console.log('⚠️ 缺少环境变量:', missingEnvs.join(', '));
    console.log('💡 将使用默认配置启动，请在Railway Variables中设置正确的环境变量');
}

// 设置NODE_ENV
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// 确保数据目录存在
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('📁 创建数据目录:', dataDir);
}

// 启动主应用
console.log('🎯 启动主应用...');
require('../app.js'); 
const http = require('http');
const fs = require('fs');
const url = require('url');
const dbOperations = require('../models/dbOperations');
const { bot, loadCacheData, getCacheData } = require('./botService');
const path = require('path');
// apiService将在需要时延迟加载

const PORT = process.env.PORT || 3000;

class HttpService {
    constructor(port = PORT) {
        this.port = port;
        this.server = null;
        this.mimeTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpg',
            '.gif': 'image/gif',
            '.ico': 'image/x-icon',
            '.svg': 'image/svg+xml'
        };
    }

    start() {
        this.server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });

        this.server.listen(this.port, () => {
            console.log(`HTTP服务已启动，端口: ${this.port}`);
            console.log(`订单管理页面: http://localhost:${this.port}/admin/orders.html`);
        });

        // 错误处理
        this.server.on('error', (error) => {
            console.error('HTTP服务错误:', error);
        });

        return this.server;
    }

    stop() {
        if (this.server) {
            this.server.close(() => {
                console.log('HTTP服务已停止');
            });
        }
    }

    async handleRequest(req, res) {
        try {
            const parsedUrl = url.parse(req.url, true);
            const pathname = parsedUrl.pathname;
            const method = req.method;

            // 设置CORS头
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

            // 处理OPTIONS请求
            if (method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            // API路由
            if (pathname.startsWith('/api/')) {
                await this.handleApiRequest(req, res, parsedUrl);
                return;
            }

            // 静态文件服务
            await this.handleStaticFile(req, res, pathname);

        } catch (error) {
            console.error('请求处理错误:', error);
            this.sendError(res, 500, '服务器内部错误');
        }
    }

    async handleApiRequest(req, res, parsedUrl) {
        try {
            const method = req.method;
            const pathname = parsedUrl.pathname;
            const query = parsedUrl.query;

            let body = {};
            if (method === 'POST' || method === 'PUT') {
                body = await this.parseRequestBody(req);
            }

            // 延迟加载apiService，确保所有依赖已初始化
            const apiService = require('./apiService');
            const result = await apiService.handleRequest(method, pathname, query, body);

            // 发送响应
            res.writeHead(result.status || 200, {
                'Content-Type': 'application/json; charset=utf-8'
            });
            res.end(JSON.stringify(result, null, 2));

        } catch (error) {
            console.error('API请求处理错误:', error);
            this.sendError(res, 500, 'API处理失败: ' + error.message);
        }
    }

    async handleStaticFile(req, res, pathname) {
        try {
            // 默认页面
            if (pathname === '/') {
                pathname = '/admin/orders.html';
            }

            // 构建文件路径
            const filePath = path.join(__dirname, '..', pathname);
            
            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                this.sendError(res, 404, '文件不存在');
                return;
            }

            // 检查是否为目录
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
                // 尝试查找index.html
                const indexPath = path.join(filePath, 'index.html');
                if (fs.existsSync(indexPath)) {
                    this.serveFile(res, indexPath);
                } else {
                    this.sendError(res, 403, '禁止访问目录');
                }
                return;
            }

            // 服务文件
            this.serveFile(res, filePath);

        } catch (error) {
            console.error('静态文件服务错误:', error);
            this.sendError(res, 500, '文件服务错误');
        }
    }

    serveFile(res, filePath) {
        try {
            const ext = path.extname(filePath).toLowerCase();
            const mimeType = this.mimeTypes[ext] || 'application/octet-stream';

            // 读取文件
            const content = fs.readFileSync(filePath);

            // 设置响应头
            res.writeHead(200, {
                'Content-Type': mimeType,
                'Content-Length': content.length,
                'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
            });

            res.end(content);

        } catch (error) {
            console.error('文件服务错误:', error);
            this.sendError(res, 500, '文件读取失败');
        }
    }

    async parseRequestBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const parsed = body ? JSON.parse(body) : {};
                    resolve(parsed);
                } catch (error) {
                    resolve({});
                }
            });
            req.on('error', reject);
        });
    }

    sendError(res, statusCode, message) {
        res.writeHead(statusCode, {
            'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(JSON.stringify({
            success: false,
            status: statusCode,
            message
        }));
    }

    // 获取服务器状态
    getStatus() {
        return {
            running: !!this.server,
            port: this.port,
            uptime: this.server ? process.uptime() : 0
        };
    }
}

module.exports = HttpService; 
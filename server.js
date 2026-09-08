/**
 * 喵链 · 香港服务器中转服务
 *
 * 做两件事：
 *   1. 托管 index.html 静态页面
 *   2. 转发 RPC 请求到 Polygon Amoy
 *
 * 使用方式：node server.js
 * 不需要安装任何依赖，Node.js 内置模块就够了。
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 80;
const RPC_HOST = 'polygon-amoy.drpc.org';
const DONATIONS_PATH = path.join(__dirname, 'donations.json');

// 文件类型对照表
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  // 允许跨域（方便调试）
  res.setHeader('Access-Control-Allow-Origin', '*');

  // ──────────────────────
  // 1. RPC 转发
  // ──────────────────────
  if (req.method === 'POST' && req.url === '/rpc') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const options = {
        hostname: RPC_HOST,
        path: '/',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      };
      const proxy = https.request(options, (rpcRes) => {
        let data = '';
        rpcRes.on('data', chunk => data += chunk);
        rpcRes.on('end', () => {
          res.writeHead(rpcRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(data);
        });
      });
      proxy.on('error', (err) => {
        console.error('RPC 转发失败:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'RPC proxy failed' }));
      });
      proxy.end(body);
    });
    return;
  }

  // ──────────────────────
  // 2. 捐款 API
  // ──────────────────────
  if (req.method === 'POST' && req.url === '/api/donation') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data.donorName || !data.amount || !data.paymentHash) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: '缺少必填字段' }));
          return;
        }
        data.timestamp = Math.floor(Date.now() / 1000);
        data.verified = false;

        let records = [];
        try {
          records = JSON.parse(fs.readFileSync(DONATIONS_PATH, 'utf-8'));
        } catch { /* 文件不存在则新建 */ }

        records.push(data);
        fs.writeFileSync(DONATIONS_PATH, JSON.stringify(records, null, 2), 'utf-8');

        console.log(`[捐款] ${data.donorName} ¥${(data.amount/100).toFixed(2)}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '数据格式错误' }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/donations') {
    try {
      const records = JSON.parse(fs.readFileSync(DONATIONS_PATH, 'utf-8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(records));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    }
    return;
  }

  // ──────────────────────
  // 3. 捐款页面
  // ──────────────────────
  if (req.url === '/donate') {
    fs.readFile(path.join(__dirname, 'donation.html'), (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('页面不存在');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // ──────────────────────
  // 4. 静态文件服务
  // ──────────────────────
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);

  // 安全校验：防止访问上级目录
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('页面不存在');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`喵链服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`RPC 转发目标: ${RPC_HOST}`);
});

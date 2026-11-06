/**
 * 喵链 · 香港服务器中转服务（HTTPS 版）
 *
 * 做三件事：
 *   1. 托管静态页面（443 端口，HTTPS 加密）
 *   2. 转发 RPC 请求到 Polygon Amoy
 *   3. 80 端口自动跳转到 HTTPS
 *
 * 使用方式：node server.js
 * 不需要安装任何依赖，Node.js 内置模块就够了。
 * 证书文件（www.lovepet.bond.pem / www.lovepet.bond.key）须与本文件同目录。
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HTTP_PORT = 80;
const HTTPS_PORT = 443;
const RPC_HOST = 'polygon-amoy.drpc.org';

// 证书文件（与本文件同目录）
const CERT_FILE = path.join(__dirname, 'www.lovepet.bond.pem');
const KEY_FILE = path.join(__dirname, 'www.lovepet.bond.key');

// 文件类型对照表
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
};

// ──────────────────────
// 投稿接口配置
// ──────────────────────
const SUBMISSIONS_FILE = path.join(__dirname, 'submissions.json');
const MAX_BODY_BYTES = 8 * 1024;          // 单次提交最多 8KB
const RATE_LIMIT_MAX = 5;                 // 每个 IP 每天最多 5 条
const RATE_LIMIT_WINDOW = 24 * 60 * 60 * 1000;
const ALLOWED_ACTIONS = ['投喂', '绝育', '送医', '领养', '找家', '临时照顾', '陪伴', '其他'];
const ALLOWED_THEMES = ['cream', 'mint', 'sakura', 'night'];
const ALLOWED_STICKER_PACKS = ['flower', 'sakura', 'star', 'none'];

const rateMap = new Map();
let writeQueue = Promise.resolve();

// RPC 转发限流（防止被当作免费公共节点滥用）
const RPC_MAX_BODY_BYTES = 64 * 1024;
const RPC_RATE_MAX = 120;
const RPC_RATE_WINDOW = 60 * 1000;
const rpcRateMap = new Map();

function isRpcRateLimited(ip) {
  const now = Date.now();
  const hits = (rpcRateMap.get(ip) || []).filter(t => now - t < RPC_RATE_WINDOW);
  if (hits.length >= RPC_RATE_MAX) {
    rpcRateMap.set(ip, hits);
    return true;
  }
  hits.push(now);
  rpcRateMap.set(ip, hits);
  return false;
}

// ──────────────────────
// 后台配置（随机地址 + Basic Auth）
// ──────────────────────
const ADMIN_PAGE = '/miao-admin-7f3k2.html';
const ADMIN_API = '/api/miao-admin-7f3k2/submissions';
const ADMIN_USER = 'admin';
const ADMIN_PASSWORD_FILE = path.join(__dirname, 'admin-password.txt');
const ADMIN_FAIL_MAX = 10;
const ADMIN_FAIL_WINDOW = 15 * 60 * 1000;
const adminFailMap = new Map();

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function cleanText(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

// ──────────────────────
// 猫咪照片列表（卡片随机配图）
// ──────────────────────
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|svg)$/i;

function plainName(name) {
  return String(name || '').replace(/[（(][^）)]*[）)]/g, '').trim();
}

async function catPhotoList(cat) {
  if (!cat || !cat.photo) return [];
  const folder = path.dirname(cat.photo).replace(/\\/g, '/');
  if (!folder.startsWith('cats/')) return [];
  try {
    const files = await fs.promises.readdir(path.join(__dirname, folder));
    const photos = files.filter(f => IMAGE_EXT.test(f)).sort().map(f => folder + '/' + f);
    return photos.length ? photos : [cat.photo];
  } catch {
    return [cat.photo];
  }
}

async function allCatPhotos() {
  let cats = [];
  try { cats = JSON.parse(await fs.promises.readFile(path.join(__dirname, 'cats.json'), 'utf8')); } catch { /* 档案读取失败 */ }
  const out = {};
  await Promise.all(cats.map(async cat => {
    const photos = await catPhotoList(cat);
    if (photos.length) out[cat.catId] = photos;
  }));
  return out;
}

function clientIp(req) {
  const sock = req.socket.remoteAddress || '';
  // 只信任本机反向代理传来的 X-Forwarded-For，防止客户端伪造绕过限流
  const isLocal = sock === '127.0.0.1' || sock === '::1' || sock === '::ffff:127.0.0.1';
  if (isLocal) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
  }
  return sock || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const hits = (rateMap.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW);
  if (hits.length >= RATE_LIMIT_MAX) {
    rateMap.set(ip, hits);
    return true;
  }
  hits.push(now);
  rateMap.set(ip, hits);
  return false;
}

// 排队写入，避免并发提交互相覆盖
function appendSubmission(record) {
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    let list = [];
    try { list = JSON.parse(await fs.promises.readFile(SUBMISSIONS_FILE, 'utf8')); } catch { /* 首次为空 */ }
    list.push(record);
    await fs.promises.writeFile(SUBMISSIONS_FILE, JSON.stringify(list, null, 2), { encoding: 'utf8', mode: 0o600 });
  });
  return writeQueue;
}

// ──────────────────────
// 后台：密码校验、读取、删除
// ──────────────────────
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

async function adminAuth(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const fails = (adminFailMap.get(ip) || []).filter(t => now - t < ADMIN_FAIL_WINDOW);

  let saved = '';
  try { saved = (await fs.promises.readFile(ADMIN_PASSWORD_FILE, 'utf8')).trim(); } catch { /* 未设置 */ }
  if (!saved) return 'unset';

  let ok = false;
  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    let decoded = '';
    try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8'); } catch { /* 忽略 */ }
    const idx = decoded.indexOf(':');
    if (idx > -1) {
      ok = safeEqual(decoded.slice(0, idx), ADMIN_USER) && safeEqual(decoded.slice(idx + 1), saved);
    }
  }

  if (ok) {
    adminFailMap.delete(ip);
    return 'ok';
  }

  fails.push(now);
  adminFailMap.set(ip, fails);
  return fails.length >= ADMIN_FAIL_MAX ? 'locked' : 'fail';
}

function deleteSubmission(id) {
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    let list = [];
    try { list = JSON.parse(await fs.promises.readFile(SUBMISSIONS_FILE, 'utf8')); } catch { /* 视为空 */ }
    const out = list.filter(r => !(r && r.id === id));
    if (out.length === list.length) return false;
    await fs.promises.writeFile(SUBMISSIONS_FILE, JSON.stringify(out, null, 2), { encoding: 'utf8', mode: 0o600 });
    return true;
  });
  return writeQueue;
}

function sendText(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

async function handleAdmin(req, res) {
  const state = await adminAuth(req);
  if (state === 'unset') return sendText(res, 503, '后台尚未启用');
  if (state === 'locked') return sendText(res, 429, '尝试次数过多，请 15 分钟后再试');
  if (state !== 'ok') {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Miao Admin", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    });
    return res.end('需要密码');
  }

  const urlPath = req.url.split('?')[0];

  if (req.method === 'GET' && urlPath === ADMIN_PAGE) {
    try {
      const html = await fs.promises.readFile(path.join(__dirname, 'admin.html'));
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      });
      return res.end(html);
    } catch {
      return sendText(res, 500, '后台页面缺失');
    }
  }

  if (urlPath === ADMIN_API) {
    if (req.method !== 'GET') return sendText(res, 405, 'Method Not Allowed');
    let list = [];
    try { list = JSON.parse(await fs.promises.readFile(SUBMISSIONS_FILE, 'utf8')); } catch { /* 首次为空 */ }
    const records = list.filter(r => r && typeof r === 'object' && r.id);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    return res.end(JSON.stringify(records));
  }

  const deletePrefix = ADMIN_API + '/';
  if (req.method === 'DELETE' && urlPath.startsWith(deletePrefix)) {
    let id = '';
    try { id = decodeURIComponent(urlPath.slice(deletePrefix.length)); } catch { /* 保留空 id */ }
    if (!id) return sendText(res, 400, '缺少 id');
    const removed = await deleteSubmission(id);
    if (!removed) return sendText(res, 404, '没有找到这条投稿');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true }));
  }

  sendText(res, 404, '页面不存在');
}

// 投稿：只落盘待审核，不直接上链
function handleSubmit(req, res) {
  const ip = clientIp(req);
  let body = '';
  let tooLarge = false;

  req.on('data', chunk => {
    if (tooLarge) return;
    body += chunk;
    if (body.length > MAX_BODY_BYTES) {
      tooLarge = true;
      sendJson(res, 413, { error: '内容太长了' });
    }
  });

  req.on('end', () => {
    if (tooLarge) return;

    let data;
    try { data = JSON.parse(body); } catch { return sendJson(res, 400, { error: '提交格式不正确' }); }

    // 蜜罐字段：正常访客不会填写，填了就当成功丢弃
    if (cleanText(data.website, 100)) return sendJson(res, 200, { ok: true });

    if (isRateLimited(ip)) return sendJson(res, 429, { error: '提交太频繁了，请明天再试' });

    const name = cleanText(data.name, 20);
    const contact = cleanText(data.contact, 60);
    const catId = cleanText(data.catId, 40) || 'other';
    const otherName = cleanText(data.otherName, 10);
    const otherPlace = cleanText(data.otherPlace, 60);
    const actionParts = cleanText(data.action, 60).split('、').map(s => s.trim()).filter(Boolean);
    const message = cleanText(data.message, 200);

    if (!name) return sendJson(res, 400, { error: '请填写你的称呼' });
    if (!contact) return sendJson(res, 400, { error: '请填写联系方式' });
    if (!message) return sendJson(res, 400, { error: '请写一句想留下的话' });
    if (catId === 'other' && !otherPlace) return sendJson(res, 400, { error: '请写下遇见它的地方' });
    if (!actionParts.length || actionParts.length > 8 || !actionParts.every(a => ALLOWED_ACTIONS.includes(a))) {
      return sendJson(res, 400, { error: '请选择你做了什么' });
    }
    const action = actionParts.join('、');
    const cardTheme = ALLOWED_THEMES.includes(data.cardTheme) ? data.cardTheme : 'cream';
    const stickerPack = ALLOWED_STICKER_PACKS.includes(data.stickerPack) ? data.stickerPack : 'flower';

    fs.readFile(path.join(__dirname, 'cats.json'), 'utf8', async (err, raw) => {
      let cats = [];
      try { cats = JSON.parse(raw); } catch { /* 档案读取失败 */ }

      let cat = null;
      let catName = otherName || '神秘毛孩子';
      if (catId !== 'other') {
        cat = cats.find(c => c.catId === catId) || null;
        if (!cat) return sendJson(res, 400, { error: '没有找到这只猫' });
        catName = cat.name;
      } else if (otherName) {
        cat = cats.find(c => plainName(c.name) === plainName(otherName)) || null;
      }

      // 只接受这只猫文件夹里真实存在的图，否则退回 profile
      let photo = '';
      if (cat) {
        const list = await catPhotoList(cat);
        const wanted = cleanText(data.photo, 200);
        photo = list.includes(wanted) ? wanted : (cat.photo || '');
      }

      const record = {
        id: 'sub-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        status: 'pending',
        submittedAt: new Date().toISOString(),
        name, contact, catId, catName,
        meetPlace: catId === 'other' ? otherPlace : '',
        photo, action, message, cardTheme, stickerPack, ip,
      };

      appendSubmission(record)
        .then(() => sendJson(res, 200, { ok: true }))
        .catch(e => {
          console.error('写入投稿失败:', e.message);
          sendJson(res, 500, { error: '保存失败，请稍后再试' });
        });
    });
  });
}

// 请求处理逻辑：HTTP 与 HTTPS 两个服务共用这一套
function handleRequest(req, res) {
  // ──────────────────────
  // 0. 私有后台（随机地址 + Basic Auth）
  // ──────────────────────
  const adminPath = req.url.split('?')[0];
  if (adminPath === ADMIN_PAGE || adminPath === ADMIN_API || adminPath.startsWith(ADMIN_API + '/')) {
    handleAdmin(req, res).catch(e => {
      console.error('后台请求失败:', e.message);
      if (!res.headersSent) sendText(res, 500, '后台出错');
    });
    return;
  }

  // ──────────────────────
  // 1. RPC 转发
  // ──────────────────────
  if (req.method === 'POST' && req.url === '/rpc') {
    const ip = clientIp(req);
    if (isRpcRateLimited(ip)) {
      req.resume();
      return sendJson(res, 429, { error: '请求太频繁，请稍后再试' });
    }
    let body = '';
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > RPC_MAX_BODY_BYTES) {
        tooLarge = true;
        sendJson(res, 413, { error: '请求内容太大' });
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
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
  // 2. 投稿接口
  // ──────────────────────
  if (req.method === 'POST' && req.url === '/api/submit') {
    handleSubmit(req, res);
    return;
  }

  // ──────────────────────
  // 3. 猫咪照片列表（每只猫文件夹里的图）
  // ──────────────────────
  if (req.method === 'GET' && req.url === '/api/cat-photos') {
    allCatPhotos()
      .then(map => sendJson(res, 200, map))
      .catch(() => sendJson(res, 500, { error: '读取照片失败' }));
    return;
  }

  // ──────────────────────
  // 4. 静态文件服务
  // ──────────────────────
  let urlPath = req.url.split('?')[0];
  try { urlPath = decodeURIComponent(urlPath); } catch { /* 保留原始路径 */ }
  let filePath = path.join(__dirname, urlPath === '/' ? '/index.html' : urlPath);

  // 安全校验：防止访问上级目录
  if (!filePath.startsWith(__dirname + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // 安全校验：服务端代码、证书私钥、投稿数据都不对外
  const blockedName = path.basename(filePath).toLowerCase();
  if (['server.js', 'server-dev.js', 'submissions.json', 'admin.html', 'admin-password.txt', 'donations.json', 'alipay.jpg', 'weixin.jpg'].includes(blockedName) || /\.(key|pem)$/i.test(blockedName)) {
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
}

// ──────────────────────
// HTTPS 服务（443）
// ──────────────────────
let tlsOptions;
try {
  tlsOptions = {
    cert: fs.readFileSync(CERT_FILE),
    key: fs.readFileSync(KEY_FILE),
  };
} catch (e) {
  console.error('读取证书失败，请确认证书文件已放到本文件同目录：');
  console.error('  ' + CERT_FILE);
  console.error('  ' + KEY_FILE);
  process.exit(1);
}

https.createServer(tlsOptions, handleRequest).listen(HTTPS_PORT, '0.0.0.0', () => {
  console.log(`喵链服务已启动: https://0.0.0.0:${HTTPS_PORT}`);
  console.log(`RPC 转发目标: ${RPC_HOST}`);
});

// ──────────────────────
// HTTP 服务（80）→ 全部跳转到 HTTPS
// ──────────────────────
http.createServer((req, res) => {
  const host = (req.headers.host || 'www.lovepet.bond').split(':')[0];
  res.writeHead(301, { Location: `https://${host}${req.url}` });
  res.end();
}).listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`HTTP ${HTTP_PORT} → 自动跳转 HTTPS`);
});

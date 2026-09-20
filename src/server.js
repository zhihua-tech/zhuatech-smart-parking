/**
 * 上海如静知华信息科技有限公司 https://www.zhuatech.cn/
 * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ParkingService, createDemoService } from './domain.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.resolve(process.env.PARKING_DATA_FILE || './data/parking.json');
const apiKey = process.env.PARKING_API_KEY || 'zhuatech-demo-key';
const port = Number(process.env.PORT || 18102);
const service = (() => { try { return new ParkingService(JSON.parse(fs.readFileSync(dataFile, 'utf8'))); } catch { return createDemoService(); } })();
const persist = () => { fs.mkdirSync(path.dirname(dataFile), { recursive: true }); fs.writeFileSync(dataFile, JSON.stringify(service.dump(), null, 2)); };
persist();

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
};
const bodyOf = async (req) => {
  const chunks = [];
  for await (const chunk of req) { chunks.push(chunk); if (chunks.reduce((n, value) => n + value.length, 0) > 1024 * 1024) throw new Error('请求体超过1MB'); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
};
const staticFiles = {
  '/': ['console.html', 'text/html; charset=utf-8'], '/console': ['console.html', 'text/html; charset=utf-8'],
  '/driver': ['client.html', 'text/html; charset=utf-8'], '/styles.css': ['styles.css', 'text/css; charset=utf-8']
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (staticFiles[url.pathname]) { const [name, type] = staticFiles[url.pathname]; return send(res, 200, fs.readFileSync(path.join(dirname, '..', 'public', name), 'utf8'), type); }
    if (url.pathname === '/health') return send(res, 200, { status: 'UP', service: 'zhuatech-smart-parking' });
    if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'NOT_FOUND' });
    if (req.headers['x-api-key'] !== apiKey && req.headers['x-gate-token'] === undefined) return send(res, 401, { error: 'UNAUTHORIZED' });
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await bodyOf(req) : {};
    const actor = req.headers['x-actor'] || 'api-user';
    let result;
    if (req.method === 'GET' && url.pathname === '/api/dashboard') result = service.dashboard();
    else if (req.method === 'POST' && url.pathname === '/api/lots') result = service.createLot(body, actor);
    else if (req.method === 'POST' && url.pathname === '/api/passes') result = service.issuePass(body, actor);
    else if (req.method === 'POST' && url.pathname === '/api/reservations') result = service.reserve(body, actor);
    else if (req.method === 'POST' && url.pathname === '/api/entries') result = service.enter(body, actor, req.headers['idempotency-key'] || '');
    else if (req.method === 'POST' && url.pathname === '/api/coupons') result = service.issueCoupon(body, actor);
    else if (req.method === 'POST' && url.pathname === '/api/blacklist') result = service.blockVehicle(body.plate, body.reason, actor);
    else {
      const spaces = url.pathname.match(/^\/api\/lots\/([^/]+)\/spaces$/);
      const quote = url.pathname.match(/^\/api\/records\/([^/]+)\/quote$/);
      const pay = url.pathname.match(/^\/api\/records\/([^/]+)\/pay$/);
      const exit = url.pathname.match(/^\/api\/records\/([^/]+)\/exit$/);
      if (req.method === 'POST' && spaces) result = service.addSpaces(spaces[1], body, actor);
      else if (req.method === 'GET' && quote) result = service.quote(quote[1], url.searchParams.get('at') || undefined, url.searchParams.get('coupon') || '');
      else if (req.method === 'POST' && pay) result = service.pay(pay[1], body, actor, req.headers['idempotency-key'] || '');
      else if (req.method === 'POST' && exit) result = service.exit(exit[1], body, actor);
      else return send(res, 404, { error: 'NOT_FOUND' });
    }
    if (req.method !== 'GET') persist();
    return send(res, req.method === 'POST' ? 201 : 200, result);
  } catch (error) {
    return send(res, 400, { error: 'BUSINESS_ERROR', message: error.message });
  }
});

server.listen(port, () => console.log(`ZhuaTech Smart Parking running at http://127.0.0.1:${port}`));

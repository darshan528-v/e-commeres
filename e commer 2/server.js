const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const port = process.env.PORT || 3000;
const root = __dirname;
const sessions = new Map();
const orders = [];
const products = [
  { id: 1, name: 'Studio Mug', category: 'home', meta: 'Stoneware / Sand', price: 28, tag: 'BESTSELLER', image: 'https://images.unsplash.com/photo-1514228742587-6b1558fcf93a?auto=format&fit=crop&w=700&q=85' },
  { id: 2, name: 'Linen Throw', category: 'home', meta: 'European linen / Moss', price: 86, tag: 'NEW IN', image: 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=700&q=85' },
  { id: 3, name: 'Field Notes', category: 'desk', meta: 'Recycled paper / Set of 3', price: 18, tag: '', image: 'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=700&q=85' },
  { id: 4, name: 'Daily Tote', category: 'wear', meta: 'Organic cotton / Ink', price: 54, tag: '', image: 'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=700&q=85' },
  { id: 5, name: 'Cedar Tray', category: 'home', meta: 'Solid cedar / Natural', price: 42, tag: '', image: 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=700&q=85' },
  { id: 6, name: 'Merino Cap', category: 'wear', meta: 'Merino wool / Oat', price: 38, tag: 'LIMITED', image: 'https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=700&q=85' },
  { id: 7, name: 'Brass Catchall', category: 'desk', meta: 'Brushed brass / Small', price: 24, tag: '', image: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=700&q=85' },
  { id: 8, name: 'Wool Slippers', category: 'wear', meta: 'Felted wool / Clay', price: 64, tag: '', image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=700&q=85' }
];

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function getUser(req) { return sessions.get(req.headers.authorization?.replace('Bearer ', '')); }
function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }); return res.end(); }
  if (req.method === 'GET' && url.pathname === '/api/products') return sendJson(res, 200, products);
  if (req.method === 'POST' && url.pathname === '/api/auth/login') return readBody(req).then(({ email }) => {
    if (!email || !email.includes('@')) return sendJson(res, 400, { error: 'A valid email is required' });
    const token = crypto.randomBytes(24).toString('hex');
    const user = { id: 1, email, name: email.split('@')[0] };
    sessions.set(token, user);
    return sendJson(res, 200, { token, user });
  }).catch(() => sendJson(res, 400, { error: 'Invalid request' }));
  if (req.method === 'GET' && url.pathname === '/api/orders') {
    const user = getUser(req); if (!user) return sendJson(res, 401, { error: 'Sign in required' });
    return sendJson(res, 200, orders.filter(order => order.userId === user.id));
  }
  if (req.method === 'POST' && url.pathname === '/api/orders') return readBody(req).then(({ items, email }) => {
    if (!Array.isArray(items) || !items.length) return sendJson(res, 400, { error: 'Cart cannot be empty' });
    const user = getUser(req) || { id: 1, email: email || 'guest@morrow.local' };
    const lineItems = items.map(item => { const product = products.find(p => p.id === item.id); return product && { id: product.id, name: product.name, price: product.price, qty: Math.max(1, Number(item.qty) || 1) }; }).filter(Boolean);
    if (!lineItems.length) return sendJson(res, 400, { error: 'No valid products in cart' });
    const total = lineItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    const order = { id: `MO-${Date.now().toString(36).toUpperCase()}`, userId: user.id, email: user.email, status: 'confirmed', total, items: lineItems, createdAt: new Date().toISOString() };
    orders.push(order);
    return sendJson(res, 201, order);
  }).catch(() => sendJson(res, 400, { error: 'Invalid order request' }));
  if (req.method === 'GET' && url.pathname === '/') return serveFile(res, path.join(root, 'index.html'), 'text/html; charset=utf-8');
  return serveFile(res, path.join(root, url.pathname), undefined);
}
function serveFile(res, file, contentType) {
  const safeFile = path.resolve(file);
  if (!safeFile.startsWith(root) || !fs.existsSync(safeFile) || fs.statSync(safeFile).isDirectory()) return sendJson(res, 404, { error: 'Not found' });
  const type = contentType || ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8' }[path.extname(safeFile)] || 'application/octet-stream');
  res.writeHead(200, { 'Content-Type': type }); res.end(fs.readFileSync(safeFile));
}
http.createServer((req, res) => Promise.resolve(route(req, res)).catch(() => sendJson(res, 500, { error: 'Server error' }))).listen(port, () => console.log(`Morrow Objects running at http://localhost:${port}`));

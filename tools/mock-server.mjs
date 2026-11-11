// Máy chủ giả để chạy thử: node tools/mock-server.mjs → http://localhost:8768/  (mật khẩu: thu123)
// Dữ liệu lưu ở tools/mock-data.json (không đưa lên git).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'tools', 'mock-data.json');
const PORT = Number(process.env.PORT || 8768);
const PASSWORD = 'thu123';
const TABLES = ['classes', 'notes', 'tasks', 'students', 'fees'];

function seed() {
  const classes = [
    ['hqv-6a1', 'HQV', '6A1'], ['hqv-6tc3', 'HQV', '6TC3'], ['hqv-7tc4', 'HQV', '7TC4'], ['hqv-7tc5', 'HQV', '7TC5'],
    ['dt-t7nsg', 'DT', 'Toán 7 NSG'], ['dt-t6nsg', 'DT', 'Toán 6 NSG'], ['dt-t7home', 'DT', 'Toán 7 Home'],
    ['dt-t6home', 'DT', 'Toán 6 Home'], ['dt-t9', 'DT', 'Toán 9'], ['dt-t9nc', 'DT', 'Toán 9NC']
  ].map((c, i) => ({ id: c[0], branch: c[1], name: c[2], order: String(i + 1), hidden: '' }));
  const names = { 'dt-t7nsg': ['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Hoàng Đông', 'Phạm Gia Huy'], 'dt-t9nc': ['Phạm Minh Chi', 'Đỗ Thanh An'] };
  const students = [];
  for (const cid in names) names[cid].forEach((n, i) => students.push({ id: 's-' + cid + '-' + i, classId: cid, name: n, order: String(i + 1), note: '' }));
  return { classes, notes: [], tasks: [], students, fees: [] };
}

let db = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, 'utf8')) : seed();
const tokens = new Set();
const save = () => fs.writeFileSync(DATA, JSON.stringify(db, null, 1));

function handle(p) {
  if (p.action === 'login') {
    if (p.password !== PASSWORD) return { ok: false, code: 401, error: 'Sai mật khẩu.' };
    const t = crypto.randomUUID(); tokens.add(t); return { ok: true, token: t };
  }
  if (!tokens.has(p.token)) return { ok: false, code: 401, error: 'Phiên đăng nhập đã hết. Đăng nhập lại.' };
  if (p.action === 'logout') { tokens.delete(p.token); return { ok: true }; }
  if (p.action === 'load') return { ok: true, data: db };
  if (p.action === 'changePassword') return { ok: true };
  if (p.action === 'ops') {
    for (const op of p.ops || []) {
      if (!TABLES.includes(op.table)) return { ok: false, code: 400, error: 'Bảng không hợp lệ' };
      const rows = db[op.table];
      if (op.t === 'put') {
        const i = rows.findIndex(r => r.id === op.row.id);
        if (i >= 0) rows[i] = op.row; else rows.push(op.row);
      } else if (op.t === 'del') {
        db[op.table] = rows.filter(r => r.id !== op.id);
      }
    }
    save();
    return { ok: true, applied: (p.ops || []).length };
  }
  return { ok: false, code: 400, error: 'Yêu cầu không hợp lệ.' };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      let out;
      try { out = handle(JSON.parse(body || '{}')); } catch (e) { out = { ok: false, code: 500, error: String(e) }; }
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }, 300);
    });
    return;
  }
  let f = decodeURIComponent(req.url.split('?')[0]);
  if (f.endsWith('/')) f += 'index.html';
  const file = path.join(ROOT, f);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('Sổ tay chạy thử: http://localhost:' + PORT + '/  (mật khẩu ' + PASSWORD + ')'));

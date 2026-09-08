import http from 'node:http';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSlips, transact } from './lib/store.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const uploadDir = path.join(root, 'uploads');
const port = Number(process.env.PORT || 3000);
const secret = process.env.LINE_CHANNEL_SECRET || '';
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const adminKey = process.env.ADMIN_KEY || '';
const allowedGroups = new Set((process.env.LINE_ALLOWED_GROUP_IDS || '').split(',').map(s => s.trim()).filter(Boolean));

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function bodyBuffer(req, max = 2_000_000) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > max) throw new Error('payload_too_large'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

function signatureValid(raw, signature) {
  if (!secret || !signature) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(raw).digest('base64'));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function authorized(req, url) {
  if (!adminKey) return true;
  return req.headers.authorization === `Bearer ${adminKey}` || url.searchParams.get('key') === adminKey;
}

async function lineGet(endpoint) {
  const response = await fetch(endpoint, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`LINE API ${response.status}`);
  return response;
}

async function processImage(event) {
  const source = event.source || {};
  if (source.type !== 'group' || (allowedGroups.size && !allowedGroups.has(source.groupId))) return;
  const messageId = event.message.id;
  const exists = (await listSlips()).some(s => s.messageId === messageId);
  if (exists) return;
  await mkdir(uploadDir, { recursive: true });
  const response = await lineGet(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`);
  const mime = response.headers.get('content-type') || 'image/jpeg';
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const filename = `${messageId}.${ext}`;
  await writeFile(path.join(uploadDir, filename), Buffer.from(await response.arrayBuffer()));
  let senderName = source.userId || 'ไม่ทราบชื่อ';
  try {
    const profile = await lineGet(`https://api.line.me/v2/bot/group/${source.groupId}/member/${source.userId}`);
    senderName = (await profile.json()).displayName || senderName;
  } catch {}
  await transact(items => items.unshift({
    id: randomUUID(), messageId, groupId: source.groupId, userId: source.userId || '', senderName,
    receivedAt: new Date(event.timestamp || Date.now()).toISOString(), image: `/uploads/${filename}`,
    amount: null, transferAt: '', bank: '', reference: '', note: '', status: 'pending', createdAt: new Date().toISOString()
  }));
}

function csv(items) {
  const cols = ['วันที่รับ','วันที่โอน','ผู้ส่งใน LINE','ธนาคาร','เลขอ้างอิง','จำนวนเงิน','สถานะ','หมายเหตุ'];
  const esc = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return '\uFEFF' + [cols, ...items.map(s => [s.receivedAt,s.transferAt,s.senderName,s.bank,s.reference,s.amount,s.status,s.note])].map(r => r.map(esc).join(',')).join('\n');
}

async function serveFile(res, file, contentType) {
  try { res.writeHead(200, { 'content-type': contentType }); res.end(await readFile(file)); }
  catch { json(res, 404, { error: 'not_found' }); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });
    if (req.method === 'POST' && url.pathname === '/webhook') {
      const raw = await bodyBuffer(req);
      if (!signatureValid(raw, req.headers['x-line-signature'])) return json(res, 401, { error: 'invalid_signature' });
      const payload = JSON.parse(raw.toString('utf8'));
      res.writeHead(200); res.end('OK');
      for (const event of payload.events || []) if (event.type === 'message' && event.message?.type === 'image') processImage(event).catch(console.error);
      return;
    }
    if (url.pathname.startsWith('/api/') && !authorized(req, url)) return json(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET' && url.pathname === '/api/slips') return json(res, 200, await listSlips());
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/slips/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/slips/'.length));
      const patch = JSON.parse((await bodyBuffer(req)).toString('utf8'));
      const allowed = ['amount','transferAt','bank','reference','note','status'];
      const updated = await transact(items => {
        const item = items.find(s => s.id === id); if (!item) return null;
        for (const key of allowed) if (key in patch) item[key] = key === 'amount' ? (patch[key] === '' ? null : Number(patch[key])) : String(patch[key]);
        item.updatedAt = new Date().toISOString(); return item;
      });
      return updated ? json(res, 200, updated) : json(res, 404, { error: 'not_found' });
    }
    if (req.method === 'GET' && url.pathname === '/api/export.csv') {
      const out = csv(await listSlips()); res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="slip-ledger.csv"' }); return res.end(out);
    }
    if (req.method === 'GET' && url.pathname.startsWith('/uploads/') && authorized(req, url)) return serveFile(res, path.join(uploadDir, path.basename(url.pathname)), 'image/jpeg');
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return serveFile(res, path.join(publicDir, 'index.html'), 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/app.js') return serveFile(res, path.join(publicDir, 'app.js'), 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/styles.css') return serveFile(res, path.join(publicDir, 'styles.css'), 'text/css; charset=utf-8');
    json(res, 404, { error: 'not_found' });
  } catch (error) { console.error(error); json(res, error.message === 'payload_too_large' ? 413 : 500, { error: 'server_error' }); }
});

server.listen(port, () => console.log(`Slip Ledger ready at http://localhost:${port}`));


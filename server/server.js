// Сервер «Вокал под бокал»: вход через Telegram и хранение прогресса. Без сторонних библиотек (Node 22.13+, встроенный SQLite).
// Храним только: id пользователя в Telegram и JSON прогресса профилей. Голос и видео сюда не попадают никогда.
// Запуск: node server/server.js (настройки - переменные окружения, см. server/README.md).
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const CFG = {
  host: process.env.HOST || '127.0.0.1', // наружу - только через nginx
  port: +(process.env.PORT || 8787),
  db: process.env.DB_PATH || './vocal.db',
  botToken: process.env.BOT_TOKEN || '',
  botName: process.env.BOT_NAME || 'vocal_pod_bokal_bot',
  tgApi: process.env.TG_API || 'https://api.telegram.org',
  origins: (process.env.ORIGINS || 'https://nchurashov.github.io,capacitor://localhost,https://localhost,http://localhost').split(',').map(s => s.trim()).filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === '1', // за nginx: адрес клиента из X-Real-IP
  maxBody: +(process.env.MAX_BODY || 512 * 1024),
  loginTtl: 10 * 60 * 1000, // ссылка входа живёт 10 минут
  sessionDays: 180,
};

// ---------- база
const db = new DatabaseSync(CFG.db);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, tg_id TEXT UNIQUE NOT NULL, created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER NOT NULL, last_used INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS logins (nonce_hash TEXT PRIMARY KEY, created INTEGER NOT NULL, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS progress (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, profile TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL, updated TEXT NOT NULL, PRIMARY KEY (user_id, profile));
`);
const q = {
  loginNew: db.prepare('INSERT INTO logins (nonce_hash, created) VALUES (?, ?)'),
  loginGet: db.prepare('SELECT * FROM logins WHERE nonce_hash = ?'),
  loginSetUser: db.prepare('UPDATE logins SET user_id = ? WHERE nonce_hash = ? AND user_id IS NULL'),
  loginDel: db.prepare('DELETE FROM logins WHERE nonce_hash = ?'),
  loginsOld: db.prepare('DELETE FROM logins WHERE created < ?'),
  userByTg: db.prepare('SELECT id FROM users WHERE tg_id = ?'),
  userNew: db.prepare('INSERT INTO users (tg_id, created) VALUES (?, ?)'),
  userDel: db.prepare('DELETE FROM users WHERE id = ?'),
  sessNew: db.prepare('INSERT INTO sessions (token_hash, user_id, created, last_used) VALUES (?, ?, ?, ?)'),
  sessGet: db.prepare('SELECT user_id, last_used FROM sessions WHERE token_hash = ?'),
  sessTouch: db.prepare('UPDATE sessions SET last_used = ? WHERE token_hash = ?'),
  sessDel: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  sessOld: db.prepare('DELETE FROM sessions WHERE last_used < ?'),
  progList: db.prepare('SELECT profile, version, updated FROM progress WHERE user_id = ? ORDER BY profile'),
  progGet: db.prepare('SELECT data, version, updated FROM progress WHERE user_id = ? AND profile = ?'),
  progIns: db.prepare('INSERT INTO progress (user_id, profile, data, version, updated) VALUES (?, ?, ?, 1, ?)'),
  progUpd: db.prepare('UPDATE progress SET data = ?, version = version + 1, updated = ? WHERE user_id = ? AND profile = ? AND version = ?'),
  progDel: db.prepare('DELETE FROM progress WHERE user_id = ? AND profile = ?'),
};

// ---------- утилиты
const now = () => Date.now();
const iso = () => new Date().toISOString();
const rnd = n => crypto.randomBytes(n).toString('base64url');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const PROFILE_RE = /^[A-Za-z0-9_-]{1,40}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;

// ограничение частоты: окно 1 минута на (адрес, группа)
const hits = new Map();
function limited(ip, group, max) {
  const k = ip + '|' + group, t = now(), w = hits.get(k);
  if (!w || t - w.t > 60000) { hits.set(k, { t, n: 1 }); return false; }
  w.n++; return w.n > max;
}
setInterval(() => { const t = now(); for (const [k, w] of hits) if (t - w.t > 60000) hits.delete(k); }, 60000).unref();
setInterval(() => { q.loginsOld.run(now() - CFG.loginTtl); q.sessOld.run(now() - CFG.sessionDays * 864e5); }, 10 * 60000).unref();

function send(res, code, obj, origin) {
  const body = obj === null ? '' : JSON.stringify(obj);
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  if (origin) Object.assign(h, { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' });
  res.writeHead(code, h); res.end(body);
}
function readBody(req) {
  // размер известен заранее - отказываем сразу и честно (413), не читая тело
  if (+(req.headers['content-length'] || 0) > CFG.maxBody) return Promise.reject(Object.assign(new Error('too big'), { code: 413 }));
  return new Promise((ok, bad) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > CFG.maxBody) { bad(Object.assign(new Error('too big'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { bad(Object.assign(new Error('bad json'), { code: 400 })); } });
    req.on('error', bad);
  });
}
function auth(req) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const h = sha(m[1]), s = q.sessGet.get(h);
  if (!s || s.last_used < now() - CFG.sessionDays * 864e5) return null;
  q.sessTouch.run(now(), h);
  return { userId: s.user_id, tokenHash: h };
}

// ---------- HTTP
async function handle(req, res) {
  const origin = CFG.origins.includes(req.headers.origin) ? req.headers.origin : null;
  const ip = (CFG.trustProxy && req.headers['x-real-ip']) || req.socket.remoteAddress || '?';
  const url = new URL(req.url, 'http://x'), path = url.pathname;
  if (req.method === 'OPTIONS') {
    if (!origin) return send(res, 403, { error: 'origin' });
    res.writeHead(204, { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' });
    return res.end();
  }
  if (req.headers.origin && !origin) return send(res, 403, { error: 'origin' }); // чужие сайты не пускаем
  if (limited(ip, 'all', 120)) return send(res, 429, { error: 'too many requests' }, origin);

  if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true }, origin);

  // вход: приложение получает одноразовую ссылку на бота
  if (req.method === 'POST' && path === '/auth/start') {
    if (limited(ip, 'start', 10)) return send(res, 429, { error: 'too many requests' }, origin);
    const nonce = rnd(24); q.loginNew.run(sha(nonce), now());
    return send(res, 200, { nonce, link: `https://t.me/${CFG.botName}?start=${nonce}`, expiresIn: CFG.loginTtl / 1000 }, origin);
  }
  // приложение спрашивает, нажал ли человек «Старт» в боте; токен выдаётся один раз
  if (req.method === 'GET' && path === '/auth/poll') {
    if (limited(ip, 'poll', 90)) return send(res, 429, { error: 'too many requests' }, origin);
    const nonce = url.searchParams.get('nonce') || '';
    if (!NONCE_RE.test(nonce)) return send(res, 400, { error: 'nonce' }, origin);
    const row = q.loginGet.get(sha(nonce));
    if (!row || row.created < now() - CFG.loginTtl) return send(res, 410, { error: 'expired' }, origin);
    if (!row.user_id) return send(res, 200, { status: 'pending' }, origin);
    q.loginDel.run(sha(nonce));
    const token = rnd(32); q.sessNew.run(sha(token), row.user_id, now(), now());
    return send(res, 200, { status: 'ok', token }, origin);
  }

  const a = auth(req);
  if (!a) return send(res, 401, { error: 'auth' }, origin);

  if (req.method === 'GET' && path === '/me') return send(res, 200, { profiles: q.progList.all(a.userId) }, origin);
  if (req.method === 'POST' && path === '/auth/logout') { q.sessDel.run(a.tokenHash); return send(res, 200, { ok: true }, origin); }
  if (req.method === 'DELETE' && path === '/account') { q.userDel.run(a.userId); return send(res, 200, { ok: true }, origin); }

  const pm = /^\/progress\/([^/]+)$/.exec(path);
  if (pm) {
    const profile = decodeURIComponent(pm[1]);
    if (!PROFILE_RE.test(profile)) return send(res, 400, { error: 'profile' }, origin);
    if (req.method === 'GET') {
      const r = q.progGet.get(a.userId, profile);
      return r ? send(res, 200, { data: JSON.parse(r.data), version: r.version, updated: r.updated }, origin) : send(res, 404, { error: 'none' }, origin);
    }
    if (req.method === 'PUT') {
      if (limited(ip, 'put', 30)) return send(res, 429, { error: 'too many requests' }, origin);
      let body; try { body = await readBody(req); } catch (e) { return send(res, e.code || 400, { error: e.message }, origin); }
      const data = body.data, base = body.baseVersion;
      if (!data || typeof data !== 'object' || Array.isArray(data)) return send(res, 400, { error: 'data' }, origin);
      const text = JSON.stringify(data), t = iso();
      const cur = q.progGet.get(a.userId, profile);
      if (!cur) { if (base) return send(res, 409, { error: 'conflict', version: 0 }, origin); q.progIns.run(a.userId, profile, text, t); return send(res, 200, { version: 1, updated: t }, origin); }
      // защита от затирания: писать можно только поверх той версии, которую клиент видел
      if (base !== cur.version || q.progUpd.run(text, t, a.userId, profile, base).changes !== 1) {
        return send(res, 409, { error: 'conflict', version: cur.version, updated: cur.updated, data: JSON.parse(cur.data) }, origin);
      }
      return send(res, 200, { version: cur.version + 1, updated: t }, origin);
    }
    if (req.method === 'DELETE') { q.progDel.run(a.userId, profile); return send(res, 200, { ok: true }, origin); }
  }
  return send(res, 404, { error: 'not found' }, origin);
}
const server = http.createServer((req, res) => { handle(req, res).catch(e => { console.error(e); try { send(res, 500, { error: 'server' }); } catch (x) { } }); });
server.headersTimeout = 15000; server.requestTimeout = 20000;
server.listen(CFG.port, CFG.host, () => console.log(`vocal-api: http://${CFG.host}:${CFG.port}`));

// ---------- бот: ловит «/start <одноразовый код>» и подтверждает вход
async function tg(method, params) {
  const r = await fetch(`${CFG.tgApi}/bot${CFG.botToken}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), signal: AbortSignal.timeout(40000) });
  const j = await r.json(); if (!j.ok) throw new Error(method + ': ' + (j.description || r.status));
  return j.result;
}
function onMessage(m) {
  if (!m || !m.chat || m.chat.type !== 'private' || !m.from || typeof m.text !== 'string') return;
  const mm = /^\/start(?:\s+([A-Za-z0-9_-]{16,64}))?\s*$/.exec(m.text.trim());
  if (!mm) return tg('sendMessage', { chat_id: m.chat.id, text: 'Это бот входа в «Вокал под бокал». Чтобы войти, нажми «Войти через Telegram» в приложении.' }).catch(() => { });
  if (!mm[1]) return tg('sendMessage', { chat_id: m.chat.id, text: 'Привет! Чтобы войти, нажми «Войти через Telegram» в приложении «Вокал под бокал».' }).catch(() => { });
  const h = sha(mm[1]), row = q.loginGet.get(h);
  if (!row || row.created < now() - CFG.loginTtl) return tg('sendMessage', { chat_id: m.chat.id, text: 'Ссылка для входа устарела. Нажми «Войти через Telegram» в приложении ещё раз.' }).catch(() => { });
  const tgId = String(m.from.id);
  let u = q.userByTg.get(tgId); if (!u) { q.userNew.run(tgId, iso()); u = q.userByTg.get(tgId); }
  q.loginSetUser.run(u.id, h);
  tg('sendMessage', { chat_id: m.chat.id, text: 'Готово, ты вошёл! Вернись в приложение «Вокал под бокал» 🍷' }).catch(() => { });
}
async function botLoop() {
  if (!CFG.botToken) { console.log('BOT_TOKEN не задан: вход через Telegram выключен'); return; }
  let offset = 0;
  for (;;) {
    try {
      const ups = await tg('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
      for (const u of ups) { offset = u.update_id + 1; onMessage(u.message); }
    } catch (e) { console.error('бот:', e.message); await new Promise(r => setTimeout(r, 3000)); }
  }
}
botLoop();
module.exports = { server };

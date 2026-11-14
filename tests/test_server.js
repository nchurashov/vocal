// Тест сервера: node tests/test_server.js
// Поднимает поддельный Telegram (getUpdates/sendMessage) и сервер на временной базе, проходит вход и работу с прогрессом.
const http = require('node:http'), { spawn } = require('node:child_process'), path = require('node:path'), fs = require('node:fs'), os = require('node:os');
let fail = 0;
const check = (name, cond, info) => { console.log((cond ? 'OK   ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); if (!cond) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ORIGIN = 'https://nchurashov.github.io';

// поддельный Telegram
const queue = [], sent = []; let upd = 1;
const tg = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', async () => {
    const p = b ? JSON.parse(b) : {}, m = req.url.split('/').pop();
    if (m === 'getUpdates') { if (!queue.length) await sleep(150); const out = queue.filter(u => u.update_id >= (p.offset || 0)); queue.length = 0; res.end(JSON.stringify({ ok: true, result: out })); }
    else if (m === 'sendMessage') { sent.push(p); res.end(JSON.stringify({ ok: true, result: {} })); }
    else res.end(JSON.stringify({ ok: false, description: 'unknown' }));
  });
});
const startMsg = (tgId, text) => queue.push({ update_id: upd++, message: { chat: { id: tgId, type: 'private' }, from: { id: tgId }, text } });

(async () => {
  await new Promise(r => tg.listen(0, '127.0.0.1', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocal-api-')), PORT = 18700 + Math.floor(Math.random() * 200);
  const srv = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(dir, 't.db'), BOT_TOKEN: 'TEST', BOT_NAME: 'test_bot', TG_API: `http://127.0.0.1:${tg.address().port}` }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  const B = `http://127.0.0.1:${PORT}`;
  const api = async (method, p, { token, body, origin = ORIGIN } = {}) => {
    const h = {}; if (origin) h.Origin = origin; if (token) h.Authorization = 'Bearer ' + token; if (body !== undefined) h['Content-Type'] = 'application/json';
    const r = await fetch(B + p, { method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
    let j = null; try { j = await r.json(); } catch (e) { }
    return { status: r.status, j, h: r.headers };
  };
  try {
    for (let i = 0; i < 50; i++) { try { if ((await api('GET', '/health')).status === 200) break; } catch (e) { } await sleep(100); }
    check('сервер отвечает', (await api('GET', '/health')).status === 200);
    // чужой сайт
    check('чужой сайт не пускаем', (await api('GET', '/health', { origin: 'https://evil.example' })).status === 403);
    const pre = await fetch(B + '/auth/start', { method: 'OPTIONS', headers: { Origin: ORIGIN } });
    check('CORS для своего сайта', pre.status === 204 && pre.headers.get('access-control-allow-origin') === ORIGIN);
    // вход
    async function login(tgId) {
      const s = await api('POST', '/auth/start');
      const p1 = await api('GET', '/auth/poll?nonce=' + s.j.nonce);
      startMsg(tgId, '/start ' + s.j.nonce);
      let r; for (let i = 0; i < 40; i++) { r = await api('GET', '/auth/poll?nonce=' + s.j.nonce); if (r.j && r.j.status === 'ok') break; await sleep(100); }
      return { s, p1, r };
    }
    const L = await login(111);
    check('ссылка на бота', /^https:\/\/t\.me\/test_bot\?start=[A-Za-z0-9_-]{32}$/.test(L.s.j.link), L.s.j.link);
    check('до «Старт» в боте - ждём', L.p1.j.status === 'pending');
    check('после «Старт» - токен', L.r.j.status === 'ok' && /^[A-Za-z0-9_-]{43}$/.test(L.r.j.token));
    check('бот ответил «Готово»', sent.some(m => m.chat_id === 111 && /Готово/.test(m.text)));
    check('токен выдаётся один раз', (await api('GET', '/auth/poll?nonce=' + L.s.j.nonce)).status === 410);
    const T = L.r.j.token;
    check('без токена нельзя', (await api('GET', '/me')).status === 401);
    check('с плохим токеном нельзя', (await api('GET', '/me', { token: 'x'.repeat(43) })).status === 401);
    check('профилей пока нет', (await api('GET', '/me', { token: T })).j.profiles.length === 0);
    // прогресс
    let r = await api('PUT', '/progress/p1', { token: T, body: { data: { ball: { best: { 1: 3 } } } } });
    check('первое сохранение - версия 1', r.status === 200 && r.j.version === 1, r.j);
    r = await api('PUT', '/progress/p1', { token: T, body: { data: { ball: { best: { 1: 3, 2: 2 } } }, baseVersion: 1 } });
    check('поверх своей версии - версия 2', r.status === 200 && r.j.version === 2, r.j);
    r = await api('PUT', '/progress/p1', { token: T, body: { data: { old: true }, baseVersion: 1 } });
    check('устаревшая версия не затирает: 409 и свежие данные', r.status === 409 && r.j.version === 2 && r.j.data.ball.best[2] === 2, r.j && r.j.version);
    r = await api('GET', '/progress/p1', { token: T });
    check('чтение прогресса', r.status === 200 && r.j.version === 2 && r.j.data.ball.best[2] === 2);
    check('плохое имя профиля', (await api('GET', '/progress/..%2Fetc', { token: T })).status === 400);
    check('массив вместо объекта', (await api('PUT', '/progress/p2', { token: T, body: { data: [1, 2] } })).status === 400);
    check('битый JSON', (await api('PUT', '/progress/p2', { token: T, body: '{не json' })).status === 400);
    check('слишком большой прогресс', (await api('PUT', '/progress/p2', { token: T, body: { data: { x: 'а'.repeat(600000) } } })).status === 413);
    // другой человек не видит чужое
    const L2 = await login(222), T2 = L2.r.j.token;
    check('второй человек вошёл', !!T2);
    check('чужой прогресс не виден', (await api('GET', '/progress/p1', { token: T2 })).status === 404);
    // устаревшая ссылка
    startMsg(333, '/start ' + 'A'.repeat(32)); await sleep(500);
    check('бот: неизвестная ссылка - «устарела»', sent.some(m => m.chat_id === 333 && /устарела/.test(m.text)));
    // выход и удаление
    check('выход', (await api('POST', '/auth/logout', { token: T2 })).status === 200 && (await api('GET', '/me', { token: T2 })).status === 401);
    check('удаление аккаунта', (await api('DELETE', '/account', { token: T })).status === 200);
    check('после удаления токен не работает', (await api('GET', '/me', { token: T })).status === 401);
    const L3 = await login(111);
    check('после удаления данных нет', (await api('GET', '/progress/p1', { token: L3.r.j.token })).status === 404);
    // частота
    let last = 0; for (let i = 0; i < 12; i++) last = (await api('POST', '/auth/start')).status;
    check('ограничение частоты входа', last === 429);
  } catch (e) { console.log('FAIL исключение', e.message, '\n', log); fail++; }
  srv.kill(); tg.close(); fs.rmSync(dir, { recursive: true, force: true });
  console.log(fail ? `Сервер: ошибок ${fail}` : 'OK: сервер - вход через Telegram, прогресс, защита');
  process.exit(fail ? 1 : 0);
})();

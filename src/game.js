// ===== Игра «Попади в ноту» =====
// notes: [полутон от базовой ноты | null (пауза), доли]
const GAME_LEVELS = [
  { n: 1, title: 'Одна нота', hint: 'Тяни одну ноту ровно', notes: [[0, 4], [null, 2], [0, 4], [null, 2], [0, 4]], bpm: 60, tol: 80 },
  { n: 2, title: 'Две ноты', hint: 'Шаг на тон вверх и обратно', notes: [[0, 3], [null, 1], [2, 3], [null, 1], [0, 3], [null, 1], [2, 3], [null, 1], [0, 4]], bpm: 66, tol: 80 },
  { n: 3, title: 'Три ступени', hint: 'Лесенка из трёх нот', notes: [[0, 2], [2, 2], [4, 3], [null, 1], [4, 2], [2, 2], [0, 4]], bpm: 66, tol: 80 },
  { n: 4, title: 'Пять ступеней', hint: 'Полутон между 3 и 4 нотой узкий', notes: [[0, 2], [2, 2], [4, 2], [5, 2], [7, 3], [null, 1], [5, 2], [4, 2], [2, 2], [0, 4]], bpm: 72, tol: 60 },
  { n: 5, title: 'Трезвучие', hint: 'До, ми, соль: ноты аккорда', notes: [[0, 2], [4, 2], [7, 4], [null, 1], [7, 2], [4, 2], [0, 4]], bpm: 72, tol: 60 },
  { n: 6, title: 'Ступени быстрее', hint: 'Темп растёт, не смазывай ноты', notes: [[0, 1], [2, 1], [4, 1], [5, 1], [7, 2], [5, 1], [4, 1], [2, 1], [0, 1], [2, 1], [4, 1], [0, 3]], bpm: 84, tol: 60 },
  { n: 7, title: 'Терции', hint: 'Прыжки через ступень', notes: [[0, 2], [4, 2], [2, 2], [5, 2], [4, 2], [7, 3], [null, 1], [5, 2], [2, 2], [0, 4]], bpm: 76, tol: 50 },
  { n: 8, title: 'Скачок на квинту', hint: 'Услышь верхнюю ноту до прыжка', notes: [[0, 2], [7, 3], [5, 1], [4, 2], [2, 2], [0, 2], [null, 1], [7, 2], [0, 4]], bpm: 76, tol: 50 },
  { n: 9, title: 'Минор', hint: 'Вторая нота ниже, чем в мажоре', notes: [[0, 2], [3, 2], [7, 3], [5, 1], [3, 2], [2, 2], [0, 4]], bpm: 76, tol: 50 },
  { n: 10, title: 'Секста', hint: 'Большой прыжок и спуск', notes: [[0, 2], [9, 3], [7, 1], [5, 2], [4, 2], [2, 2], [0, 4]], bpm: 80, tol: 40 },
  { n: 11, title: 'Октава', hint: 'Самый большой скачок', notes: [[0, 2], [12, 3], [null, 1], [7, 2], [4, 2], [0, 4]], bpm: 72, tol: 40 },
  { n: 12, title: 'Финал', hint: 'Всё вместе и быстрее', notes: [[0, 1], [4, 1], [7, 1], [9, 2], [7, 1], [5, 1], [4, 1], [2, 1], [4, 1], [7, 2], [12, 2], [7, 1], [4, 1], [0, 3]], bpm: 92, tol: 40 },
];
const STAR_AT = [50, 70, 85];
const starsFor = acc => STAR_AT.filter(s => acc >= s).length;
const starStr = (k, big) => [0, 1, 2].map(i => `<span style="color:${i < k ? 'var(--near)' : 'var(--line)'}${big ? ';font-size:34px' : ''}">★</span>`).join('');

function gameTimeline(lv) {
  const b = 60 / lv.bpm; let t = 0; const tl = [];
  for (const [s, beats] of lv.notes) { if (s != null) tl.push({ rel: s, start: t, end: t + beats * b * .96, in: 0, tot: 0, done: false }); t += beats * b; }
  return { tl, D: t };
}
function gameState() { state.game ||= { best: {}, plays: [] }; return state.game; }
const gameUnlocked = n => n === 1 || (gameState().best[n - 1]?.stars || 0) >= 1;

// ----- Список уровней -----
function viewGame() {
  const g = gameState(), total = Object.values(g.best).reduce((a, x) => a + x.stars, 0);
  let h = `<button class="back" onclick="go('ball')">${ICON.back} Шарик</button><h1>Попади в ноту</h1><p class="muted" style="margin:6px 0 0">Ноты плывут справа налево. Голос рисует точку: держи её внутри полосы ноты. Набери 50%, чтобы открыть следующий уровень.</p>
    <div class="row sec" style="margin-top:14px;gap:8px"><span class="pill">★ ${total} из ${GAME_LEVELS.length * 3}</span><span class="pill">Пройдено: ${Object.values(g.best).filter(x => x.stars >= 1).length} из ${GAME_LEVELS.length}</span></div>
    <div class="ggrid sec">`;
  for (const lv of GAME_LEVELS) {
    const best = g.best[lv.n], open = gameUnlocked(lv.n);
    h += `<button class="gtile ${open ? '' : 'locked'}" ${open ? `onclick="go('game-${lv.n}')"` : ''}>
      <span class="gnum">${open ? lv.n : '🔒'}</span><b>${esc(lv.title)}</b><span class="gstars">${starStr(best ? best.stars : 0)}</span>
      <span class="tiny muted">${best ? 'лучший ' + best.acc + '%' : open ? 'ещё не играл' : 'пройди уровень ' + (lv.n - 1)}</span></button>`;
  }
  h += `</div><p class="tiny muted">Звёзды: 1 за ${STAR_AT[0]}%, 2 за ${STAR_AT[1]}%, 3 за ${STAR_AT[2]}%. Полоса ноты с каждым уровнем уже: от ±80 до ±40 центов.</p>`;
  return h;
}

// ----- Экран уровня -----
let G = null;
function gameStop() {
  if (!G) return;
  G.stopped = true; cancelAnimationFrame(G.raf);
  if (G.stream) G.stream.getTracks().forEach(t => t.stop());
  stopAll(); G = null; busy = false;
}
function viewGameLevel(n) {
  const lv = GAME_LEVELS.find(l => l.n === n);
  if (!lv) return '<div class="empty">Уровень не найден</div>';
  if (!gameUnlocked(n)) return `<button class="back" onclick="go('game')">${ICON.back} Уровни</button><div class="note">🔒 Сначала пройди уровень ${n - 1} хотя бы на одну звезду.</div>`;
  const best = gameState().best[n];
  let h = `<button class="back" onclick="go('game')">${ICON.back} Все уровни</button>
    <div class="row between"><div><div class="tiny muted">Уровень ${n} из ${GAME_LEVELS.length} · полоса ±${lv.tol} центов</div><h1 style="margin-top:2px">${esc(lv.title)}</h1></div><div style="font-size:22px" id="gstars">${starStr(best ? best.stars : 0)}</div></div>
    <p class="muted" style="margin:4px 0 0">${esc(lv.hint)}. Первая нота: ${VA.noteName(base() + lv.notes.find(x => x[0] != null)[0])}.</p>
    <div class="gstage sec"><canvas id="gcv"></canvas><div id="gover" class="gover"></div></div>
    <div id="gctl" class="stack" style="margin-top:12px"></div><div id="gres"></div>`;
  afterHooks.push(() => gameSetup(lv));
  return h;
}
function gameSetup(lv) {
  const { tl, D } = gameTimeline(lv);
  const cv = $('#gcv');
  G = { lv, tl, D, cv, ctx: cv.getContext('2d'), trail: [], combo: 0, maxCombo: 0, pops: [], mode: 'idle', voice: null };
  gameResize(); gameDraw(-1.5);
  const ctl = $('#gctl');
  const takeBtns = `<div class="row wrap"><label class="btn ${MIC_DIRECT ? 'ghost' : ''}" style="flex:1">${ICON.mic} Записать попытку<input type="file" accept="video/*,audio/*" capture="user" class="hidden gfile"></label>
      <label class="btn ghost">${ICON.file} Загрузить запись<input type="file" accept="audio/*,video/*" class="hidden gfile"></label></div>`;
  ctl.innerHTML = MIC_DIRECT
    ? `<button class="btn block" id="glive">${ICON.play} Играть с микрофоном</button>
       <div class="row wrap"><button class="btn ghost" id="gprev">Послушать уровень</button></div>
       <div class="tiny muted">Лучше в наушниках: так микрофон слышит только тебя. Перед стартом прозвучит первая нота и 3 щелчка отсчёта.</div>
       <details class="small"><summary class="muted">Нет микрофона? Запиши попытку файлом</summary><div style="margin-top:8px">${takeBtns}</div></details>`
    : `<button class="btn ghost block" id="gprev">${ICON.play} Послушать уровень</button>
       <div class="info small">Здесь микрофон закрыт, поэтому играем попытками: послушай уровень, нажми «Записать попытку», спой мелодию на «ма» и получи очки и звёзды. Живая игра, где точка бегает за голосом, работает в файле приложения, открытом в браузере.</div>
       ${takeBtns}`;
  $('#gprev').addEventListener('click', () => gamePreview());
  $('#glive')?.addEventListener('click', () => gameLive());
  ctl.querySelectorAll('.gfile').forEach(inp => inp.addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return; e.target.value = '';
    gameTake(await f.arrayBuffer());
  }));
}
function gameResize() {
  const cv = G.cv, w = cv.parentElement.clientWidth, h = Math.round(Math.min(380, Math.max(260, w * .62))), dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
  G.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); G.W = w; G.H = h;
  const rels = G.tl.map(n => n.rel); G.lo = Math.min(...rels) - 2.5; G.hi = Math.max(...rels) + 2.5;
  if (G.hi - G.lo < 9) { const m = (G.hi + G.lo) / 2; G.lo = m - 4.5; G.hi = m + 4.5; }
  const css = getComputedStyle(document.documentElement), v = k => css.getPropertyValue(k).trim();
  G.col = { line: v('--line'), muted: v('--muted'), ink: v('--ink'), accent: v('--accent'), ok: v('--ok'), bad: v('--bad'), near: v('--near'), card: v('--card') };
}
const fold = (rel, target) => rel - 12 * Math.round((rel - target) / 12);
function gameDraw(now) {
  const { ctx, W, H, col, tl } = G, nowX = W * .26, pps = (W - nowX) / 3.6;
  const X = t => nowX + (t - now) * pps, semiH = (H - 24) / (G.hi - G.lo), Y = r => 12 + (G.hi - r) * semiH;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = col.card; ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 1;
  for (let s = Math.ceil(G.lo); s <= Math.floor(G.hi); s++) { ctx.strokeStyle = col.line; ctx.globalAlpha = s % 12 === 0 ? 1 : .55; ctx.beginPath(); ctx.moveTo(0, Y(s)); ctx.lineTo(W, Y(s)); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // ноты
  const band = Math.max(12, 2 * G.lv.tol / 100 * semiH);
  for (const n of tl) {
    const x1 = X(n.start), x2 = X(n.end); if (x2 < -10 || x1 > W + 10) continue;
    const y = Y(n.rel) - band / 2, w = x2 - x1, r = Math.min(band / 2, 10);
    let fill = col.accent, a = .25;
    if (n.done) { fill = n.score >= .5 ? col.ok : col.bad; a = .55; }
    else if (now >= n.start) a = .4;
    ctx.globalAlpha = a; ctx.fillStyle = fill; roundRect(ctx, x1, y, w, band, r); ctx.fill();
    if (!n.done && now >= n.start && n.tot > 0) { ctx.globalAlpha = .75; ctx.fillStyle = col.ok; roundRect(ctx, x1, y, Math.max(0, Math.min(w, (now - n.start) * pps)) * (n.in / n.tot), band, r); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.fillStyle = col.muted; ctx.font = '600 12px Manrope, system-ui';
    if (x1 > 0) ctx.fillText(VA.noteName(base() + n.rel), x1 + 4, y - 4);
  }
  // линия «сейчас»
  ctx.strokeStyle = col.ink; ctx.globalAlpha = .35; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(nowX, 0); ctx.lineTo(nowX, H); ctx.stroke(); ctx.globalAlpha = 1;
  // след голоса
  ctx.lineWidth = 3; ctx.strokeStyle = col.accent; ctx.globalAlpha = .7; ctx.beginPath(); let pen = false;
  for (const p of G.trail) { if (p.rel == null || now - p.t > 3) { pen = false; continue; } const x = X(p.t), y = Y(p.rel); pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; }
  ctx.stroke(); ctx.globalAlpha = 1;
  if (G.voice != null) { ctx.fillStyle = G.voiceHit ? col.ok : col.accent; ctx.beginPath(); ctx.arc(nowX, Y(G.voice), 9, 0, 7); ctx.fill(); ctx.strokeStyle = col.card; ctx.lineWidth = 2; ctx.stroke(); }
  // всплывашки
  ctx.font = '800 16px Manrope, system-ui'; ctx.textAlign = 'center';
  G.pops = G.pops.filter(p => now - p.t < 1);
  for (const p of G.pops) { ctx.globalAlpha = 1 - (now - p.t); ctx.fillStyle = p.good ? col.ok : col.bad; ctx.fillText(p.text, p.x, p.y - (now - p.t) * 30); }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
  // счёт
  const doneN = tl.filter(n => n.done), acc = doneN.length ? Math.round(100 * doneN.reduce((a, n) => a + n.score, 0) / doneN.length) : 0;
  ctx.fillStyle = col.ink; ctx.font = '800 15px Manrope, system-ui';
  if (G.mode === 'live') { ctx.fillText(acc + '%', 12, 22); if (G.combo > 1) { ctx.fillStyle = col.accent; ctx.fillText('серия ×' + G.combo, 12, 42); } }
  if (now < 0 && G.mode !== 'idle') { ctx.font = '800 44px Lora, serif'; ctx.textAlign = 'center'; ctx.fillStyle = col.accent; ctx.fillText(String(Math.ceil(-now)), W / 2, H / 2 + 14); ctx.textAlign = 'left'; }
}
function roundRect(ctx, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function noteScore(n) { return n.tot > 0 ? Math.min(1, (n.in / n.tot) / .8) : 0; }

function gameCountIn() {
  const c = ac(), b = 60 / G.lv.bpm, first = G.tl[0].rel, t = c.currentTime + .1;
  stopAll(); tone(base() + first, t, 1.2);
  for (let i = 0; i < 3; i++) click(t + 1.5 + i * b, i === 0);
  return t + 1.5 + 3 * b;
}
// ----- Просмотр с подсказкой -----
function gamePreview() {
  if (G.mode === 'live') return;
  const lv = G.lv, c = ac(); G.keepRes = true; gameReset(); G.mode = 'preview';
  const t0 = gameCountIn();
  G.tl.forEach(n => tone(base() + n.rel, t0 + n.start, n.end - n.start));
  const loop = () => { if (!G || G.stopped || G.mode !== 'preview') return; const now = c.currentTime - t0; gameDraw(now); if (now < G.D + .5) G.raf = requestAnimationFrame(loop); else { G.mode = 'idle'; gameDraw(-1.5); } };
  loop();
}
function gameReset() { cancelAnimationFrame(G.raf); stopAll(); G.tl.forEach(n => Object.assign(n, { in: 0, tot: 0, done: false, score: 0 })); G.trail = []; G.pops = []; G.combo = 0; G.maxCombo = 0; G.voice = null; G.oct = null; G.octBuf = []; G.devs = null; if (!G.keepRes) $('#gres').innerHTML = ''; G.keepRes = false; }

// ----- Живая игра -----
async function gameLive() {
  if (G.mode === 'live') return;
  let stream;
  try { stream = await openMic(); }
  catch (e) { $('#gres').innerHTML = '<div class="note" style="margin-top:10px"><b>Нет доступа к микрофону.</b><br>1. Если открыл ссылку из Telegram или другого приложения, нажми «Открыть в Safari» (или скопируй ссылку в Safari).<br>2. В Safari нажми «аА» слева от адреса → «Настройки веб-сайта» → «Микрофон» → «Разрешить», потом обнови страницу.<br>3. Если не помогло: Настройки iPhone → Приложения → Safari → Микрофон → «Спросить» или «Разрешить».</div>'; return; }
  const c = ac(); gameReset(); G.mode = 'live'; G.stream = stream; busy = true;
  const src = c.createMediaStreamSource(stream), an = c.createAnalyser(); an.fftSize = 4096; src.connect(an);
  const buf = new Float32Array(an.fftSize), hist = [];
  const t0 = gameCountIn(); let last = c.currentTime - t0;
  $('#glive').innerHTML = ICON.stop + ' Остановить'; $('#glive').onclick = () => gameFinish(true);
  const loop = () => {
    if (!G || G.stopped || G.mode !== 'live') return;
    const now = c.currentTime - t0, dt = Math.min(.1, now - last); last = now;
    an.getFloatTimeDomainData(buf);
    const m = VA.livePitch(buf, c.sampleRate);
    hist.push(m); if (hist.length > 3) hist.shift();
    const valid = hist.filter(v => v != null), rel = valid.length >= 2 ? VA.median(valid) - base() : null;
    const act = G.tl.find(n => now >= n.start && now < n.end);
    const near = act || G.tl.find(n => n.start > now) || G.tl[G.tl.length - 1];
    G.voice = rel == null ? null : octLock(G, rel, near.rel);
    G.voiceHit = false;
    if (act && now > act.start + .15) {
      act.tot += dt;
      if (G.voice != null && Math.abs(G.voice - act.rel) * 100 <= G.lv.tol) { act.in += dt; G.voiceHit = true; }
    }
    G.trail.push({ t: now, rel: G.voice }); if (G.trail.length > 400) G.trail.shift();
    for (const n of G.tl) if (!n.done && now >= n.end) {
      n.done = true; n.score = noteScore(n);
      const good = n.score >= .5; G.combo = good ? G.combo + 1 : 0; G.maxCombo = Math.max(G.maxCombo, G.combo);
      const W = G.W, nowX = W * .26;
      G.pops.push({ t: now, x: Math.min(W - 60, nowX + 70), y: 34, good, text: good ? (n.score >= .95 ? 'Идеально!' : 'Есть!') : 'Мимо' });
    }
    gameDraw(now);
    if (now < G.D + .4) G.raf = requestAnimationFrame(loop); else gameFinish(false);
  };
  loop();
}
function gameFinish(aborted) {
  if (!G) return;
  cancelAnimationFrame(G.raf); if (G.stream) G.stream.getTracks().forEach(t => t.stop()); G.stream = null; afterMic();
  const wasLive = G.mode === 'live'; G.mode = 'idle'; busy = false;
  const b = $('#glive'); if (b) { b.innerHTML = ICON.play + ' Играть ещё раз'; b.onclick = () => gameLive(); }
  if (aborted) { gameReset(); gameDraw(-1.5); return; }
  G.tl.forEach(n => { if (!n.done) { n.done = true; n.score = noteScore(n); } });
  gameResult(G.tl.map(n => n.score), wasLive ? 'live' : 'take');
}

// ----- Попытка записью -----
async function gameTake(arrayBuf) {
  gameReset(); busy = true;
  $('#gres').innerHTML = '<p class="muted small">Слушаю попытку...</p>';
  let audio;
  try { audio = await new Promise((ok, bad) => { const p = ac().decodeAudioData(arrayBuf, ok, bad); if (p && p.then) p.then(ok, bad); }); }
  catch (e) { busy = false; $('#gres').innerHTML = '<div class="note" style="margin-top:10px">Не получилось прочитать файл. Подойдут видео с телефона или аудио m4a, mp3, wav.</div>'; return; }
  setTimeout(() => {
    const chs = []; const len = Math.min(audio.length, audio.sampleRate * 60);
    for (let k = 0; k < audio.numberOfChannels; k++) chs.push(audio.getChannelData(k).subarray(0, len));
    const a = VA.analyzeSamples(chs, audio.sampleRate); busy = false; lastAudio = audio;
    if (!a.segs.length) { $('#gres').innerHTML = '<div class="note" style="margin-top:10px">Не слышу в записи голоса. Пой громче и ближе к телефону, на «ма» или «ла».</div>'; return; }
    const ref = G.tl.map(n => ({ midi: base() + n.rel, beats: 1 }));
    const ev = VA.evaluate(ref, a.segs, false), tol = G.lv.tol;
    const scores = ev.notes.map(r => r.dev == null ? 0 : Math.abs(r.dev) <= tol ? 1 : Math.abs(r.dev) <= tol * 1.6 ? .5 : 0);
    // показываем спетое на поле: точка-след по нотам
    G.tl.forEach((n, i) => { n.done = true; n.score = scores[i]; const r = ev.notes[i]; if (r.dev != null) { const v = n.rel + r.dev / 100; G.trail.push({ t: n.start + .05, rel: v }, { t: n.end - .05, rel: v }, { t: n.end, rel: null }); } });
    G.combo = 0; G.maxCombo = 0; scores.forEach(s => { G.combo = s >= .5 ? G.combo + 1 : 0; G.maxCombo = Math.max(G.maxCombo, G.combo); });
    G.devs = ev.notes.map(r => r.dev);
    gameResult(scores, 'take');
    gameReplay();
  }, 30);
}
function gameReplay() {
  const c = ac(), t0 = c.currentTime + .2; G.mode = 'replay';
  const loop = () => { if (!G || G.stopped || G.mode !== 'replay') return; const now = c.currentTime - t0 - 1; gameDraw(now); if (now < G.D) G.raf = requestAnimationFrame(loop); else { G.mode = 'idle'; } };
  loop();
}

// ----- Итог -----
function gameResult(scores, mode) {
  const lv = G.lv, acc = Math.round(100 * scores.reduce((a, s) => a + s, 0) / scores.length), st = starsFor(acc);
  const g = gameState(), prev = g.best[lv.n], wasOpen = gameUnlocked(lv.n + 1);
  const hits = scores.filter(s => s >= .5).length;
  g.plays.push({ lvl: lv.n, acc, stars: st, mode, date: nowLocal() }); if (g.plays.length > 300) g.plays.splice(0, g.plays.length - 300);
  const record = !prev || acc > prev.acc;
  if (record) g.best[lv.n] = { acc, stars: Math.max(st, prev ? prev.stars : 0), date: nowLocal() };
  save();
  $('#gstars').innerHTML = starStr(g.best[lv.n] ? g.best[lv.n].stars : 0);
  const opened = !wasOpen && gameUnlocked(lv.n + 1) && lv.n < GAME_LEVELS.length;
  const msg = st === 0 ? `Нужно ${STAR_AT[0]}%, чтобы пройти уровень. Послушай его ещё раз и попробуй снова.` : opened ? `Уровень ${lv.n + 1} открыт!` : st === 3 ? 'Максимум звёзд!' : `До следующей звезды нужно ${STAR_AT[st]}%.`;
  const notesTxt = G.devs ? G.tl.map((n, i) => { const d = G.devs[i]; const nm = VA.noteName(base() + n.rel); return d == null ? `${nm} ✗` : Math.abs(d) <= lv.tol ? `${nm} ✓` : `${nm} ${d > 0 ? '↑' : '↓'}${Math.abs(d)}ц`; }).join(' · ') : '';
  $('#gres').innerHTML = `<div class="card sec stack" style="text-align:center">
    <div>${starStr(st, true)}</div>
    <div style="font-family:Lora,serif;font-size:34px;font-weight:600">${acc}%</div>
    <div class="small muted">нот попал: ${hits} из ${scores.length} · лучшая серия ${G.maxCombo}${record && prev ? ' · новый рекорд!' : ''}</div>
    ${notesTxt ? `<div class="small">${notesTxt}</div>` : ''}
    <div class="${st ? 'info' : 'note'}">${msg}</div>
    <div class="row wrap" style="justify-content:center">${mode === 'take' && lastAudio ? `<button class="btn ghost" onclick="playAudioLast()">${ICON.play} Моя попытка</button>` : ''}
    ${gameUnlocked(lv.n + 1) && lv.n < GAME_LEVELS.length ? `<button class="btn" onclick="go('game-${lv.n + 1}')">Уровень ${lv.n + 1} →</button>` : ''}</div></div>`;
  if (opened) toast(`Уровень ${lv.n + 1} открыт!`);
}
window.addEventListener('resize', () => { if (G && G.mode === 'idle') { gameResize(); gameDraw(-1.5); } });

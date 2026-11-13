// ===== Игра «Шарик»: пой ноту, чтобы пролететь в окно =====
// walls: [полутон, длина тоннеля в долях, пауза после в долях]
// 10 глав по 10 заданий = 100 заданий. У главы своя цель (набор нот и тип препятствий), задания внутри растут:
// больше стен, быстрее, дольше тоннели, к концу главы без подсказки. 10-е задание главы - экзамен.
// Задания детерминированы (сид = номер), одинаковые при каждом заходе.
// walls: [полутон, длина тоннеля в долях, пауза после в долях]
const BALL_CHAPTERS = [
  { title: 'Одна нота', goal: 'Держи одну ноту ровно: шарик летит на одной высоте', pool: [0], bpm: [58, 70] },
  { title: 'Два соседа', goal: 'До и ре: шаг на тон вверх и вниз', pool: [0, 2], bpm: [60, 72] },
  { title: 'Три ступени', goal: 'До, ре, ми вразнобой', pool: [0, 2, 4], bpm: [60, 74] },
  { title: 'Трезвучие', goal: 'До, ми, соль: прыжки по нотам аккорда', pool: [0, 4, 7], bpm: [60, 72] },
  { title: 'Пять ступеней', goal: 'До-ре-ми-фа-соль: узкий полутон между ми и фа', pool: [0, 2, 4, 5, 7], step: true, bpm: [62, 76] },
  { title: 'Долгие ноты', goal: 'Длинные тоннели: держи ноту, не уплывая', pool: [0, 2, 4, 5, 7], long: true, bpm: [62, 72] },
  { title: 'Мелодии', goal: 'Ноты идут подряд без пауз: это уже мелодия', pool: [0, 2, 4, 5, 7, 9], step: true, legato: true, bpm: [64, 80] },
  { title: 'Скачки', goal: 'Кварта, квинта, секста: услышь ноту до прыжка', pool: [0, 4, 5, 7, 9, 12], leap: true, bpm: [62, 76] },
  { title: 'Минор', goal: 'Грустный лад: третья ступень на полутон ниже', pool: [0, 2, 3, 5, 7, 8], step: true, legato: true, bpm: [64, 80] },
  { title: 'Октава', goal: 'Весь диапазон октавы: мелодии со скачками', pool: [0, 2, 4, 5, 7, 9, 11, 12], step: true, legato: true, leap: true, bpm: [66, 80] },
];
function ballRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function ballGen(ci, ti) {
  const C = BALL_CHAPTERS[ci], exam = ti === 9, d = ti / 9, R = ballRng((ci + 1) * 1000 + ti + 7);
  const n = exam ? 10 : 5 + Math.round(4 * d), pool = C.pool;
  const legato = C.legato ? ti >= 2 : false;
  const bpm = Math.round(C.bpm[0] + (C.bpm[1] - C.bpm[0]) * d);
  const guide = exam ? false : ci < 6 ? ti < 7 : ti < 3;
  const walls = []; let cur = 0, same = 0;
  for (let k = 0; k < n; k++) {
    let s;
    if (k === 0) s = 0;
    else if (C.step && !C.leap) { const i = pool.indexOf(cur), cand = [pool[i - 1], pool[i + 1], pool[i - 2], pool[i + 2]].filter(x => x != null); s = cand[Math.floor(R() * (R() < .75 ? Math.min(2, cand.length) : cand.length))]; }
    else { const cand = pool.length > 1 ? pool.filter(x => x !== cur || same < 1) : pool; s = cand[Math.floor(R() * cand.length)]; }
    const jump = Math.abs(s - cur);
    same = s === cur ? same + 1 : 0; cur = s;
    // после большого скачка в мелодии нота длиннее: нужно время, чтобы долететь
    const len = C.long ? 2 + Math.round(2 * d) + (R() < .4 ? 1 : 0) : legato ? (jump >= 7 || R() < .3 ? 2 : 1) : 1 + (R() < .25 + .25 * d ? 1 : 0);
    const gap = legato ? 0 : Math.max(1, 2 - Math.round(d * 2) * .5);
    walls.push([s, len, gap]);
  }
  walls[walls.length - 1][1] = Math.max(2, walls[walls.length - 1][1]); walls[walls.length - 1][2] = 1;
  return { n: ci * 10 + ti + 1, ch: ci, task: ti + 1, exam, title: exam ? `Экзамен: ${C.title.toLowerCase()}` : `${C.title} · ${ti + 1}`, hint: C.goal, bpm, guide, walls };
}
const BALL_LEVELS = BALL_CHAPTERS.flatMap((_, ci) => Array.from({ length: 10 }, (_, ti) => ballGen(ci, ti)));
// v2: 100 заданий вместо 12 уровней. Старые рекорды уходят в архив (номера уровней теперь значат другое)
const ballState = () => { state.ball ||= { best: {}, plays: [] }; if (state.ball.v !== 2) { state.ballOld = state.ball; state.ball = { v: 2, best: {}, plays: [] }; } return state.ball; };
const PRESETS = [['Простой', 40], ['Средний', 20], ['Сложный', 10]];
const ballTol = () => Math.max(1, Math.min(50, Math.round(state.settings.tol || 40)));
const tolZone = t => t >= 30 ? 'простой' : t >= 15 ? 'средний' : t >= 6 ? 'сложный' : 'экстрим';
// рекорд уровня с учётом ширины окошка: уже окошко = ценнее
const bestTol = (b, n) => b.tol || (BALL_LEVELS.find(l => l.n === n) || {}).tol || 40;
const rank = (stars, pct, tol) => stars >= 1 ? 1e5 + (60 - tol) * 1000 + stars * 100 + pct : pct;
function setTol(v, rerender) { state.settings.tol = Math.max(1, Math.min(50, +v)); save(); if (rerender) render(); }
function tolLabel(t) { return `±${t} центов · ${tolZone(t)}${t <= 5 ? ' (нужен очень ровный голос)' : ''}`; }
function diffSeg() {
  const t = ballTol();
  return `<div class="card sec stack" style="padding:14px"><div class="row between"><span class="small"><b>Точность попадания</b></span><span class="small" id="tolLbl">${tolLabel(t)}</span></div>
    <input type="range" min="1" max="50" step="1" value="${t}" style="width:100%;accent-color:var(--accent)" aria-label="Точность попадания в центах"
      oninput="document.getElementById('tolLbl').textContent=tolLabel(+this.value)" onchange="setTol(this.value,true)">
    <div class="row" style="justify-content:space-between"><span class="tiny muted">±1 строже</span><span class="tiny muted">±50 мягче</span></div>
    <div class="row wrap" style="gap:6px">${PRESETS.map(([n, v]) => `<button class="btn ${t === v ? 'soft' : 'ghost'}" style="min-height:36px;padding:6px 12px;flex:1" onclick="setTol(${v},true)">${n} ±${v}</button>`).join('')}</div></div>`;
}
// закрепление, а не везение: следующее задание - с 2 звёзд (80% стен), новая глава - только после экзамена на 3 звезды (без ударов)
const BALL_NEED = n => (n % 10 === 0 ? 3 : 2);
const ballDone = n => (ballState().best[n]?.stars || 0) >= BALL_NEED(n);
const ballUnlocked = n => n === 1 || ballDone(n - 1);
const ballNextLbl = n => { const l = BALL_LEVELS[n - 1]; return !l ? '' : l.task === 1 ? `Глава ${l.ch + 1}` : l.exam ? 'Экзамен' : `Задание ${l.task}`; };
const ballNextN = () => (BALL_LEVELS.find(l => ballUnlocked(l.n) && !ballDone(l.n)) || BALL_LEVELS[BALL_LEVELS.length - 1]).n;
let ballOpenCh = null;
const ballStarsFor = (pct, lives) => lives <= 0 ? 0 : pct >= 100 ? 3 : pct >= 80 ? 2 : pct >= 60 ? 1 : 0;

function viewBall() {
  const g = ballState(), total = Object.values(g.best).reduce((a, x) => a + x.stars, 0);
  let h = `<h1>Шарик</h1><p class="muted" style="margin:6px 0 0">Шарик катится по дорожке, впереди стены с окнами. Пой ноту, и шарик поднимется на её высоту: чем выше окно, тем выше нота. Сначала отдельные ноты, потом тоннели и мелодии.</p>
    <button class="item sec" style="margin-top:14px" onclick="go('warmup')"><div class="dot rhythm">${doneToday() ? '✓' : '♪'}</div><div class="t"><b>${doneToday() ? 'Распевка сегодня сделана' : 'Сначала распевка'}</b><span class="small muted">${doneToday() ? 'Голос разогрет, можно играть' : `Около ${warmupMin()} мин, чтобы голос не устал и ноты брались легче`}</span></div><span class="muted">›</span></button>
    ${diffSeg()}
    <div class="row sec" style="margin-top:14px;gap:8px"><span class="pill">★ ${total} из ${BALL_LEVELS.length * 3}</span><span class="pill">Пройдено: ${BALL_LEVELS.filter(l => ballDone(l.n)).length} из ${BALL_LEVELS.length}</span></div>`;
  const curCh = Math.floor((ballNextN() - 1) / 10);
  BALL_CHAPTERS.forEach((C, ci) => {
    const lvls = BALL_LEVELS.filter(l => l.ch === ci), done = lvls.filter(l => ballDone(l.n)).length, open = ballUnlocked(ci * 10 + 1), show = ballOpenCh === ci || (ballOpenCh == null && ci === curCh);
    h += `<div class="card sec" style="padding:0;overflow:hidden;${open ? '' : 'opacity:.6'}">
      <button class="row between" style="width:100%;border:0;background:none;padding:14px 16px;text-align:left;color:inherit" onclick="ballOpenCh=${show ? -1 : ci};render()">
        <div><div class="tiny muted">Глава ${ci + 1}${done === 10 ? ' · пройдена ✓' : ''}</div><b>${open ? '' : '🔒 '}${esc(C.title)}</b><div class="small muted">${esc(C.goal)}</div></div>
        <div style="text-align:right;flex:none;margin-left:10px"><b>${done}/10</b><div style="width:64px;height:5px;background:var(--line);border-radius:3px;margin-top:4px"><i style="display:block;height:100%;width:${done * 10}%;background:var(--ok);border-radius:3px"></i></div></div></button>`;
    if (show) {
      h += `<div class="ggrid" style="padding:0 12px 12px">`;
      for (const lv of lvls) {
        const best = g.best[lv.n], o = ballUnlocked(lv.n), ok = ballDone(lv.n);
        h += `<button class="gtile ${o ? '' : 'locked'}" ${o ? `onclick="go('ball-${lv.n}')"` : ''}>
          <span class="gnum">${o ? (lv.exam ? '🎓' : lv.task) : '🔒'}</span><b>${lv.exam ? 'Экзамен' : 'Задание ' + lv.task}</b><span class="gstars">${starStr(best ? best.stars : 0)}</span>
          <span class="tiny muted">${ok ? 'пройдено' : best ? 'нужно ' + BALL_NEED(lv.n) + '★, есть ' + best.stars : o ? (lv.exam ? 'без ударов, 3★' : lv.guide ? 'с подсказкой' : 'без подсказки') : 'закрыто'}</span></button>`;
      }
      h += `</div>`;
    }
    h += `</div>`;
  });
  h += `<p class="tiny muted">10 глав по 10 заданий. 3 жизни. Звёзды: 1 за 60% стен, 2 за 80%, 3 за все стены. Задание засчитано с 2 звёзд, тогда открывается следующее. Последнее задание главы - экзамен: нужно пройти без единого удара, тогда откроется следующая глава. В рекорде запоминается точность: чем она строже, тем ценнее рекорд.</p>
    <button class="item sec" onclick="go('game')"><div class="dot pitch">🎯</div><div class="t"><b>Ещё игра: «Попади в ноту»</b><span class="small muted">Ноты-полосы, 12 уровней</span></div><span class="muted">›</span></button>`;
  return h;
}

let B = null;
function ballStop() {
  if (!B) return;
  B.stopped = true; cancelAnimationFrame(B.raf);
  if (B.stream) B.stream.getTracks().forEach(t => t.stop());
  stopAll(); B = null; busy = false;
}
function viewBallLevel(n) {
  const lv = BALL_LEVELS.find(l => l.n === n);
  if (!lv) return '<div class="empty">Уровень не найден</div>';
  if (!ballUnlocked(n)) return `<button class="back" onclick="go('ball')">${ICON.back} Уровни</button><div class="note">🔒 Сначала пройди ${n % 10 === 1 ? 'экзамен прошлой главы без единого удара (3 звезды)' : 'предыдущее задание на 2 звезды'}.</div>`;
  const best = ballState().best[n];
  afterHooks.push(() => ballSetup(lv)); afterHooks.push(() => { if (camOn()) camStart(); });
  return `<button class="back" onclick="go('ball')">${ICON.back} Все уровни</button>
    <div class="row between"><div><div class="tiny muted">Глава ${lv.ch + 1} «${esc(BALL_CHAPTERS[lv.ch].title)}» · ${lv.exam ? 'экзамен' : 'задание ' + lv.task + ' из 10'} · точность ±${ballTol()} ц</div><h1 style="margin-top:2px">${esc(lv.title)}</h1></div><div style="font-size:22px" id="bstars">${starStr(best ? best.stars : 0)}</div></div>
    <p class="muted" style="margin:4px 0 0">${esc(lv.hint)}. ${lv.exam ? 'Экзамен: нужно пролететь все стены без удара, тогда откроется следующая глава.' : `Чтобы засчитать, нужно 2 звезды (80% стен).${lv.guide ? '' : ' Без подсказки пианино перед стеной.'}`}</p>${octaveHint()}${camToggleHTML()}
    ${diffSeg()}
    <div id="bbest">${ballBestHTML(lv)}</div>
    <div class="gstage sec"><canvas id="bcv"></canvas></div>
    <div id="bctl" class="stack" style="margin-top:12px"></div><div id="bnote"></div><div id="bres"></div>`;
}

function ballBestHTML(lv) {
  const best = ballState().best[lv.n]; if (!best) return '';
  const next = lv.n < BALL_LEVELS.length && ballUnlocked(lv.n + 1);
  return `<div class="card row between wrap" style="margin-top:12px;gap:8px;padding:12px 14px"><div><div class="tiny muted">Твой рекорд сохранён</div><b>${starStr(best.stars)} ${best.pct}% стен при ±${bestTol(best, lv.n)}</b></div>
    ${next ? `<button class="btn soft" style="min-height:40px" onclick="go('ball-${lv.n + 1}')">${ballNextLbl(lv.n + 1)} →</button>` : ''}</div>`;
}
function ballBuild(lv) {
  const b = 60 / lv.bpm; let t = 0; const walls = [];
  lv.walls.forEach(([s, len, gap], i) => {
    // окно для смены ноты: если нота идёт сразу за другой, тоннель начинается чуть позже её начала
    const prev = lv.walls[i - 1];
    const open = prev && prev[2] < .5 && prev[0] !== s ? Math.min(Math.max(.4, .45 * b), len * b * .55) : 0;
    walls.push({ rel: s, t0: t + open, t1: t + len * b, crashed: false, passed: false, inT: 0, outT: 0 });
    t += (len + gap) * b;
  });
  // соседние тоннели без паузы склеиваются визуально
  return { walls, D: t };
}
function ballSetup(lv) {
  const { walls, D } = ballBuild(lv), cv = $('#bcv');
  B = { lv, walls, D, cv, ctx: cv.getContext('2d'), mode: 'idle', y: null, vy: 0, lives: 3, trail: [], parts: [], voice: null, guide: lv.guide };
  ballResize(); ballDraw(-2);
  const takeBtns = `<div class="row wrap"><label class="btn ${MIC_DIRECT ? 'ghost' : ''}" style="flex:1">${ICON.mic} Записать попытку<input type="file" accept="video/*,audio/*" capture="user" class="hidden bfile"></label>
      <label class="btn ghost">${ICON.file} Загрузить запись<input type="file" accept="audio/*,video/*" class="hidden bfile"></label></div>`;
  $('#bctl').innerHTML = (MIC_DIRECT
    ? `<button class="btn block" id="blive">${ICON.play} Играть с микрофоном</button>`
    : `<div class="info small">В этом окне микрофон закрыт, поэтому шарик не может лететь за голосом вживую. Посмотри демо, а попытку запиши видео: шарик пролетит по твоей записи. Вживую игра работает по ссылке в браузере.</div>`) +
    `<div class="row wrap"><button class="btn ghost" id="bdemo">${ICON.play} Демо: как надо</button>
     <label class="check" style="border:0;padding:6px 0;flex:1"><input type="checkbox" id="bguide" ${lv.guide ? 'checked' : ''}><span class="small">Подсказывать ноту перед стеной</span></label></div>
     ${MIC_DIRECT ? '<div class="tiny muted">Лучше в наушниках, тогда подсказки не мешают микрофону. Перед стартом прозвучит первая нота и 3 щелчка.</div><details class="small"><summary class="muted">Нет микрофона? Запиши попытку файлом</summary><div style="margin-top:8px">' + takeBtns + '</div></details>' : takeBtns}`;
  $('#bguide').addEventListener('change', e => B.guide = e.target.checked);
  $('#bdemo').addEventListener('click', () => ballRun('demo'));
  $('#blive')?.addEventListener('click', () => ballLive());
  document.querySelectorAll('.bfile').forEach(inp => inp.addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; e.target.value = ''; ballTake(await f.arrayBuffer()); }));
}
function ballResize() {
  const cv = B.cv, w = cv.parentElement.clientWidth, h = Math.round(Math.min(460, Math.max(300, w * .85))), dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
  B.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); B.W = w; B.H = h;
  const rels = B.walls.map(x => x.rel); B.lo = Math.min(...rels) - 2; B.hi = Math.max(...rels) + 2.5;
  if (B.hi - B.lo < 8) { const m = (B.hi + B.lo) / 2; B.lo = m - 4; B.hi = m + 4; }
  B.floor = h - 46; B.ceil = 26; B.semi = (B.floor - B.ceil) / (B.hi - B.lo);
  B.bx = w * .24; B.r = 10; B.pps = Math.max(110, w * .3) * B.lv.bpm / 60 / 1.6;
  if (B.y == null) B.y = B.floor - B.r;
}
const bY = r => B.floor - (r - B.lo) * B.semi;
const bRel = y => B.lo + (B.floor - y) / B.semi;
function ballGap(w) { return Math.max(1.5, ballTol() / 100 * B.semi); }

// ----- Отрисовка -----
function ballDraw(now) {
  const { ctx, W, H, floor } = B, X = t => B.bx + (t - now) * B.pps;
  // небо
  const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#2B2F5E'); sky.addColorStop(.6, '#C8573A'); sky.addColorStop(1, '#F2B266');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  // солнце и холмы (параллакс)
  ctx.fillStyle = 'rgba(255,224,170,.55)'; ctx.beginPath(); ctx.arc(W * .78, floor - 40, 46, 0, 7); ctx.fill();
  const hills = (k, col, amp, base) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W + 10; x += 10) { const wx = x + now * B.pps * k; ctx.lineTo(x, base - amp * (Math.sin(wx / 90) * .6 + Math.sin(wx / 37) * .25 + .6)); } ctx.lineTo(W, H); ctx.fill(); };
  hills(.15, 'rgba(70,40,60,.45)', 40, floor); hills(.35, 'rgba(60,30,40,.55)', 26, floor + 4);
  // линии нот
  ctx.font = '700 11px Manrope, system-ui'; ctx.textAlign = 'left';
  const targets = [...new Set(B.walls.map(w => w.rel))];
  for (const r of targets) { ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(0, bY(r)); ctx.lineTo(W, bY(r)); ctx.stroke(); ctx.setLineDash([]); }
  // дорога
  ctx.fillStyle = '#3A2A24'; ctx.fillRect(0, floor, W, H - floor);
  ctx.fillStyle = '#5A4136'; ctx.fillRect(0, floor, W, 6);
  ctx.strokeStyle = 'rgba(255,220,180,.5)'; ctx.lineWidth = 3; ctx.setLineDash([18, 16]); ctx.lineDashOffset = (now * B.pps) % 34;
  ctx.beginPath(); ctx.moveTo(0, floor + 22); ctx.lineTo(W, floor + 22); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  // стены
  for (const w of B.walls) {
    const x1 = X(w.t0), x2 = Math.max(X(w.t1), x1 + 16); if (x2 < -20 || x1 > W + 20) continue;
    const gy = bY(w.rel), gh = ballGap(w) + B.r + 3;
    const col = w.crashed ? '#B8443A' : w.passed ? '#3C8A5A' : '#6B4E7A', edge = w.crashed ? '#E8695E' : w.passed ? '#7FD39E' : '#A88BBA';
    ctx.fillStyle = col;
    roundRect(ctx, x1, B.ceil - 30, x2 - x1, gy - gh - (B.ceil - 30), 6); ctx.fill();
    roundRect(ctx, x1, gy + gh, x2 - x1, floor - (gy + gh), 6); ctx.fill();
    ctx.fillStyle = edge; ctx.fillRect(x1, gy - gh - 4, x2 - x1, 4); ctx.fillRect(x1, gy + gh, x2 - x1, 4);
    // мишень: зона, куда должен попасть центр шарика
    const tz = ballGap(w);
    ctx.fillStyle = w.crashed ? 'rgba(255,140,120,.35)' : 'rgba(255,214,130,.38)'; ctx.fillRect(x1, gy - tz, x2 - x1, 2 * tz);
    ctx.fillStyle = 'rgba(255,240,200,.9)'; ctx.fillRect(x1, gy - .75, x2 - x1, 1.5);
    // кирпичики
    ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 1;
    for (let yy = B.ceil; yy < floor; yy += 14) { if (yy > gy - gh - 6 && yy < gy + gh + 4) continue; ctx.beginPath(); ctx.moveTo(x1, yy); ctx.lineTo(x2, yy); ctx.stroke(); }
    // подпись ноты
    ctx.fillStyle = '#fff'; ctx.font = '800 13px Manrope, system-ui'; ctx.textAlign = 'center';
    if (x1 > -10) ctx.fillText(VA.noteName(base() + w.rel), x1 + Math.min(24, (x2 - x1) / 2), gy - gh - 10);
  }
  ctx.textAlign = 'left';
  // линейка высоты слева
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, B.ceil - 6, 30, floor - B.ceil + 6);
  ctx.font = '700 10px Manrope, system-ui'; ctx.fillStyle = 'rgba(255,255,255,.8)';
  for (const r of targets) ctx.fillText(VA.noteName(base() + r).slice(0, 4), 3, bY(r) + 3);
  if (B.voice != null) { ctx.fillStyle = '#FFD27A'; ctx.beginPath(); ctx.moveTo(30, bY(B.voice)); ctx.lineTo(38, bY(B.voice) - 5); ctx.lineTo(38, bY(B.voice) + 5); ctx.fill(); }
  // след шарика
  for (let i = 0; i < B.trail.length; i++) { const p = B.trail[i]; const x = B.bx - (now - p.t) * B.pps; if (x < 0) continue; ctx.fillStyle = `rgba(255,230,190,${.05 + .35 * i / B.trail.length})`; ctx.beginPath(); ctx.arc(x, p.y, B.r * (.4 + .5 * i / B.trail.length), 0, 7); ctx.fill(); }
  // шарик
  const g = ctx.createRadialGradient(B.bx - 4, B.y - 4, 2, B.bx, B.y, B.r);
  g.addColorStop(0, '#FFF6E8'); g.addColorStop(.5, B.hurt > now ? '#FF8A7A' : '#FFD27A'); g.addColorStop(1, B.hurt > now ? '#B8443A' : '#E08A2E');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(B.bx, B.y, B.r, 0, 7); ctx.fill();
  // частицы
  B.parts = B.parts.filter(p => now - p.t < .8);
  for (const p of B.parts) { const a = now - p.t; ctx.fillStyle = p.c; ctx.globalAlpha = 1 - a / .8; ctx.fillRect(p.x + p.vx * a, p.y + p.vy * a + 300 * a * a, 4, 4); }
  ctx.globalAlpha = 1;
  // интерфейс
  ctx.font = '16px system-ui'; ctx.fillText('❤️'.repeat(Math.max(0, B.lives)) + '🤍'.repeat(3 - Math.max(0, B.lives)), W - 84, 22);
  const done = B.walls.filter(w => w.passed || w.crashed).length;
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(40, 12, W - 140, 6); ctx.fillStyle = '#FFD27A'; ctx.fillRect(40, 12, (W - 140) * done / B.walls.length, 6);
  if (now < 0 && B.mode !== 'idle') { ctx.font = '700 48px Lora, serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(String(Math.ceil(-now)), W / 2, H / 2); ctx.textAlign = 'left'; }
  if (B.banner && now - B.banner.t < 1) { ctx.font = '800 17px Manrope, system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = B.banner.good ? '#B9F5CF' : '#FFC2BA'; ctx.globalAlpha = 1 - (now - B.banner.t); ctx.fillText(B.banner.text, W / 2, B.floor + 38); ctx.globalAlpha = 1; ctx.textAlign = 'left'; }
}

// ----- Физика и правила (общие для живой игры, демо и попытки) -----
function ballStep(now, dt, voiceRel) {
  // привязка октавы к ближайшей стене
  const next = B.walls.find(w => now < w.t1 + .1) || B.walls[B.walls.length - 1];
  B.voice = voiceRel == null ? null : octLock(B, voiceRel, next.rel, now >= next.t0 + .1 && now <= next.t1);
  if (B.voice != null) {
    const ty = Math.max(B.ceil, Math.min(B.floor - B.r, bY(B.voice)));
    B.y += (ty - B.y) * Math.min(1, dt * 14); B.vy = 0;
  } else {
    B.vy += 900 * dt; B.y += B.vy * dt;
    if (B.y > B.floor - B.r) { B.y = B.floor - B.r; B.vy = -B.vy * .25; if (Math.abs(B.vy) < 30) B.vy = 0; }
  }
  B.trail.push({ t: now, y: B.y }); if (B.trail.length > 18) B.trail.shift();
  const half = B.r / B.pps; // время, за которое шарик проходит свой радиус
  for (const w of B.walls) {
    if (w.passed || w.crashed) continue;
    if (now >= w.t0 - half && now <= w.t1 + half) {
      const inGap = Math.abs(B.y - bY(w.rel)) <= ballGap(w);
      const grace = Math.min(.22, .3 * (w.t1 - w.t0));
      if (now > w.t0 + grace && now <= w.t1) { if (inGap) w.inT += dt; else w.outT += dt; }
      // промах: долго вне окна, или на выходе из тоннеля внутри меньше половины времени
      const fail = w.outT > .35 || (now > w.t1 && w.inT + w.outT > 0 && w.inT < w.outT);
      if (fail) {
        w.crashed = true; B.lives--; B.hurt = now + .4; B.banner = { t: now, text: 'Бум! ' + (B.lives > 0 ? 'Осталось жизней: ' + B.lives : ''), good: false };
        for (let i = 0; i < 14; i++) B.parts.push({ t: now, x: B.bx, y: B.y, vx: (Math.random() - .8) * 160, vy: (Math.random() - .7) * 200, c: i % 2 ? '#FFD27A' : '#E8695E' });
        if (B.mode !== 'replay') buzz();
      }
    } else if (now > w.t1 + half) {
      w.passed = true;
      for (let i = 0; i < 8; i++) B.parts.push({ t: now, x: B.bx, y: B.y, vx: (Math.random() - .3) * 120, vy: (Math.random() - .5) * 160, c: '#B9F5CF' });
      B.banner = { t: now, text: w.outT < .05 ? 'Чисто!' : 'Пролетел!', good: true };
    }
  }
}
function buzz() { const c = ac(), o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.value = 90; g.gain.setValueAtTime(.12, c.currentTime); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .25); o.connect(g).connect(master); o.start(); o.stop(c.currentTime + .3); }
function ballReset(keepResult) { cancelAnimationFrame(B.raf); stopAll(); B.walls.forEach(w => Object.assign(w, { crashed: false, passed: false, inT: 0, outT: 0 })); B.lives = 3; B.trail = []; B.parts = []; B.voice = null; B.oct = null; B.octBuf = []; B.y = B.floor - B.r; B.vy = 0; B.banner = null; B.devs = null; $('#bnote').innerHTML = ''; if (!keepResult) $('#bres').innerHTML = ''; }
function ballSchedule(t0, withMelody) {
  const b = 60 / B.lv.bpm;
  B.walls.forEach((w, i) => {
    if (withMelody) tone(base() + w.rel, t0 + w.t0, w.t1 - w.t0, .2);
    else if (B.guide && (i === 0 || B.walls[i - 1].t1 < w.t0 - .01)) tone(base() + w.rel, t0 + w.t0 - 1.4 * b, .35, .12);
  });
}
function ballCountIn() {
  const c = ac(), b = 60 / B.lv.bpm, t = c.currentTime + .1;
  stopAll(); tone(base() + B.walls[0].rel, t, 1.1);
  for (let i = 0; i < 3; i++) click(t + 1.4 + i * b, i === 0);
  return t + 1.4 + 3 * b + 1.5 * b; // запас на подлёт к первой стене
}
// демо: автопилот поёт правильные ноты
function ballRun(mode) {
  if (B.mode === 'live') return;
  const c = ac(); ballReset(true); B.mode = mode;
  const t0 = ballCountIn(); ballSchedule(t0, true);
  let last = -9;
  const loop = () => {
    if (!B || B.stopped || B.mode !== mode) return;
    const now = c.currentTime - t0, dt = last < -8 ? 0 : Math.min(.05, now - last); last = now;
    const w = B.walls.find(w => now < w.t1 + .05);
    let v = null; if (w && now > w.t0 - .35) v = w.rel; else if (w && now > -.2) v = null;
    ballStep(now, dt, v); ballDraw(now);
    if (now < B.D + .8) B.raf = requestAnimationFrame(loop); else { B.mode = 'idle'; $('#bnote').innerHTML = `<div class="info small" style="margin-top:10px">Это было демо, на твои результаты оно не влияет.${ballState().best[B.lv.n] ? ' Твой рекорд на этом уровне сохранён.' : ' Теперь твоя очередь!'}</div>`; }
  };
  loop();
}
async function ballLive() {
  if (B.mode === 'live') { ballFinish(true); return; }
  let stream;
  try { stream = await openMic(); }
  catch (e) { $('#bres').innerHTML = '<div class="note" style="margin-top:10px"><b>Нет доступа к микрофону.</b><br>1. Если открыл ссылку из Telegram или другого приложения, нажми «Открыть в Safari» (или скопируй ссылку в Safari).<br>2. В Safari нажми «аА» слева от адреса → «Настройки веб-сайта» → «Микрофон» → «Разрешить», потом обнови страницу.<br>3. Если не помогло: Настройки iPhone → Приложения → Safari → Микрофон → «Спросить» или «Разрешить».</div>'; return; }
  const c = ac(); ballReset(); B.mode = 'live'; B.stream = stream; busy = true;
  const src = c.createMediaStreamSource(stream), an = c.createAnalyser(); an.fftSize = 4096; src.connect(an);
  const buf = new Float32Array(an.fftSize), hist = [];
  const t0 = ballCountIn(); ballSchedule(t0, false);
  camRecStart('#bcv', `${profName() ? profName() + ' · ' : ''}Шарик · уровень ${B.lv.n}`, stream);
  $('#blive').innerHTML = ICON.stop + ' Остановить';
  let last = -9;
  const loop = () => {
    if (!B || B.stopped || B.mode !== 'live') return;
    const now = c.currentTime - t0, dt = last < -8 ? 0 : Math.min(.05, now - last); last = now;
    an.getFloatTimeDomainData(buf);
    hist.push(VA.livePitch(buf, c.sampleRate)); if (hist.length > 3) hist.shift();
    const v = hist.filter(x => x != null);
    ballStep(now, dt, v.length >= 2 ? VA.median(v) - base() : null); ballDraw(now);
    if (B.lives <= 0) { ballFinish(false); return; }
    if (now < B.D + .6) B.raf = requestAnimationFrame(loop); else ballFinish(false);
  };
  loop();
}
function ballFinish(aborted) {
  if (!B) return;
  cancelAnimationFrame(B.raf); if (B.stream) B.stream.getTracks().forEach(t => t.stop()); B.stream = null; afterMic();
  const mode = B.mode; B.mode = 'idle'; busy = false;
  if (mode === 'live') camRecStop(aborted ? '' : `${B.walls.filter(w => w.passed).length} из ${B.walls.length} стен`, aborted);
  const btn = $('#blive'); if (btn) btn.innerHTML = ICON.play + ' Играть ещё раз';
  if (aborted) { ballReset(); ballDraw(-2); return; }
  ballResult(mode === 'replay' ? 'take' : 'live');
}
// попытка записью: шарик летит по спетым нотам
async function ballTake(arrayBuf) {
  ballReset(); busy = true;
  $('#bres').innerHTML = '<p class="muted small">Слушаю попытку...</p>';
  let audio;
  try { audio = await new Promise((ok, bad) => { const p = ac().decodeAudioData(arrayBuf, ok, bad); if (p && p.then) p.then(ok, bad); }); }
  catch (e) { busy = false; $('#bres').innerHTML = '<div class="note" style="margin-top:10px">Не получилось прочитать файл. Подойдут видео с телефона или аудио m4a, mp3, wav.</div>'; return; }
  setTimeout(() => {
    const chs = [], len = Math.min(audio.length, audio.sampleRate * 60);
    for (let k = 0; k < audio.numberOfChannels; k++) chs.push(audio.getChannelData(k).subarray(0, len));
    const a = VA.analyzeSamples(chs, audio.sampleRate); lastAudio = audio;
    if (!a.segs.length) { busy = false; $('#bres').innerHTML = '<div class="note" style="margin-top:10px">Не слышу в записи голоса. Пой громче и ближе к телефону, на «ма» или «ла».</div>'; return; }
    const ev = VA.evaluate(B.walls.map(w => ({ midi: base() + w.rel, beats: (w.t1 - w.t0) * B.lv.bpm / 60 })), a.segs, false, strictOct());
    const sung = ev.notes.map(r => r.dev == null ? null : r.ref - base() + r.dev / 100);
    B.devs = ev.notes.map(r => r.dev);
    const c = ac(), t0 = c.currentTime + .3; B.mode = 'replay'; let last = -9;
    $('#bres').innerHTML = '<p class="muted small" style="margin-top:8px">Шарик летит по твоей записи...</p>';
    const loop = () => {
      if (!B || B.stopped || B.mode !== 'replay') return;
      const now = (c.currentTime - t0) - .5, dt = last < -8 ? 0 : Math.min(.05, now - last); last = now;
      const i = B.walls.findIndex(w => now < w.t1 + .05);
      const v = i >= 0 && now > B.walls[i].t0 - .35 ? sung[i] : null;
      ballStep(now, dt, v); ballDraw(now);
      if (now < B.D + .6 && B.lives > 0) B.raf = requestAnimationFrame(loop); else ballFinish(false);
    };
    loop();
  }, 30);
}
function ballResult(mode) {
  const lv = B.lv, passed = B.walls.filter(w => w.passed).length, total = B.walls.length;
  const pct = Math.round(100 * passed / total), st = ballStarsFor(pct, B.lives);
  const g = ballState(), bm = g.best, prev = bm[lv.n], wasOpen = ballUnlocked(lv.n + 1), tol = ballTol();
  g.plays.push({ lvl: lv.n, pct, stars: st, lives: B.lives, mode, tol, date: nowLocal() }); if (g.plays.length > 300) g.plays.splice(0, g.plays.length - 300);
  const record = !prev || rank(st, pct, tol) > rank(prev.stars, prev.pct, bestTol(prev, lv.n));
  if (record) bm[lv.n] = { pct, stars: st, tol, date: nowLocal() };
  save();
  $('#bstars').innerHTML = starStr(bm[lv.n] ? bm[lv.n].stars : 0); $('#bbest').innerHTML = ballBestHTML(lv);
  const opened = !wasOpen && ballUnlocked(lv.n + 1) && lv.n < BALL_LEVELS.length;
  const need = BALL_NEED(lv.n), last = lv.n === BALL_LEVELS.length;
  const msg = B.lives <= 0 ? 'Шарик разбился. Посмотри демо и попробуй снова.' : st < need ? (lv.exam ? `Экзамен засчитывается только без единого удара (3 звезды). Сейчас ${st}★ - ещё раз, ты близко!` : `Чтобы засчитать задание, нужно 2 звезды (80% стен). Сейчас ${st}★ - закрепи ещё раз.`)
    : opened ? (lv.exam ? `Экзамен сдан! Открыта глава ${lv.ch + 2} «${BALL_CHAPTERS[lv.ch + 1].title}».` : `Засчитано! ${ballNextLbl(lv.n + 1)} открыто.`) : last && st === 3 ? 'Все 100 заданий пройдены. Ты прошёл весь «Шарик»!' : st === 3 ? 'Все стены чисто! Максимум звёзд.' : 'Засчитано. Можно улучшить рекорд или идти дальше.';
  const notesTxt = B.devs ? B.walls.map((w, i) => { const d = B.devs[i], nm = VA.noteName(base() + w.rel); return d == null ? `${nm} ✗` : w.passed ? `${nm} ✓` : `${nm} ${d > 0 ? '↑' : '↓'}${Math.abs(d)}ц`; }).join(' · ') : B.walls.map(w => `${VA.noteName(base() + w.rel)} ${w.passed ? '✓' : w.crashed ? '✗' : '·'}`).join(' · ');
  $('#bres').innerHTML = `<div class="card sec stack" style="text-align:center">
    <div>${starStr(st, true)}</div>
    <div style="font-family:Lora,serif;font-size:32px;font-weight:600">${passed} из ${total} стен</div>
    <div class="small muted">жизней осталось: ${Math.max(0, B.lives)}${record && prev ? ' · новый рекорд!' : ''}</div>
    <div class="small">${notesTxt}</div>
    <div class="${st ? 'info' : 'note'}">${msg}</div>
    <div class="row wrap" style="justify-content:center">${mode === 'take' && lastAudio ? `<button class="btn ghost" onclick="playAudioLast()">${ICON.play} Моя попытка</button>` : ''}
    ${ballUnlocked(lv.n + 1) && lv.n < BALL_LEVELS.length ? `<button class="btn" onclick="go('ball-${lv.n + 1}')">${ballNextLbl(lv.n + 1)} →</button>` : ''}</div></div>`;
  if (opened) toast(`${ballNextLbl(lv.n + 1)} открыто!`);
}
window.addEventListener('resize', () => { if (B && B.mode === 'idle') { ballResize(); ballDraw(-2); } });

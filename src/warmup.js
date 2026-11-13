// ===== Распевка дня: маршрут #warmup =====
// Пианино играет упражнение, ты поёшь вместе с ним; тональность сдвигается по полутону.
// Границы - только замеренный диапазон (state.range): ниже взятого низа и выше верха не ведём.
const WU_STEPS = [
  { id: 'breath', title: 'Дыхание', how: 'Вдох носом на 4 счёта, выдох на «с-с-с» на 6. Плечи не поднимаются, живот мягкий.', kind: 'breath', cycles: 4 },
  { id: 'trill', title: 'Губная трель', how: 'Губы расслаблены, «бррр» на звук. Если трель не идёт, придержи щёки пальцами.', pat: [0, 2, 4, 5, 7, 5, 4, 2, 0], from: 'mid', dir: 1, n: 6 },
  { id: 'hum', title: 'Мычание', how: '«М» с сомкнутыми губами и свободной челюстью. Почувствуй, как щекочет губы и нос.', pat: [0, 4, 7, 4, 0], from: 'mid', dir: 1, n: 5 },
  { id: 'siren', title: 'Сирена', how: 'На «у» скользи снизу вверх и обратно, как сирена. Без нажима, сколько удобно.', kind: 'timer', sec: 30 },
  { id: 'mami', title: 'Ми-мэ-ма-мо-му', how: 'Каждый слог на своей ноте, рот открыт свободно, звук вперёд.', pat: [0, 2, 4, 5, 7, 5, 4, 2, 0], from: 'mid', dir: 1, n: 6 },
  { id: 'low', title: 'Спуск вниз', how: 'Сверху вниз на «а», мягко. Внизу не дави: лучше тише, чем с хрипом.', pat: [7, 5, 4, 2, 0], from: 'low', dir: -1, n: 6 },
];
// тональности упражнения: чистая функция (тест: tests/sim_warmup.py)
function warmupKeys(step, b, range) {
  const span = Math.max(...step.pat) - Math.min(...step.pat);
  const lo = range ? range.lo : b - 2, hi = range ? range.hi : b + 12;
  const fits = k => k + Math.min(...step.pat) >= lo && k + Math.max(...step.pat) <= hi;
  let k = step.from === 'low' ? Math.min(b + 3, hi - span) : Math.max(lo, b - 2);
  const keys = [];
  for (let i = 0; i < 40 && keys.length < step.n; i++, k += step.dir) { if (fits(k)) keys.push(k); else if (keys.length) break; }
  return keys;
}
function warmupPlan() {
  const r = lastRange();
  return WU_STEPS.map(s => s.pat ? { ...s, keys: warmupKeys(s, base(), r) } : s).filter(s => !s.pat || s.keys.length);
}
let WU = null;
const WU_BPM = 110;
function wuStepSec(s) { const b = 60 / WU_BPM; return s.kind === 'breath' ? s.cycles * 10 : s.kind === 'timer' ? s.sec : s.keys.length * ((s.pat.length + 3) * b); }
function warmupStop() { if (!WU) return; clearTimeout(WU.timer); clearInterval(WU.tick); stopAll(); WU.playing = false; }
const warmupMin = () => Math.max(1, Math.round(warmupPlan().reduce((a, s) => a + wuStepSec(s), 0) / 60));
const doneToday = () => (state.warmups || []).some(w => w.date.slice(0, 10) === ymd());
function viewWarmup() {
  warmupStop();
  WU = { i: 0, plan: warmupPlan(), playing: false };
  afterHooks.push(warmupDraw);
  const r = lastRange(), total = warmupMin();
  return `<button class="back" onclick="go('today')">${ICON.back} Сегодня</button><h1>Распевка дня</h1>
    <p class="muted" style="margin:6px 0 0">${WU.plan.length} ${plural(WU.plan.length, 'упражнение', 'упражнения', 'упражнений')}, около ${total} мин. Пианино играет, ты поёшь вместе с ним. Тональность сдвигается по полутону.</p>
    <p class="tiny muted" style="margin:6px 0 0">${r ? `Границы - твой замер ${noteShort(r.lo)} - ${noteShort(r.hi)}: ниже и выше не поведу.` : `Диапазон не замерен, поэтому держусь рядом с ${noteShort(base())}. <a href="#range">Замерить</a>, чтобы распевка шла по твоим границам.`}</p>
    <div id="wubox" class="sec"></div>`;
}
function warmupDraw() {
  const box = $('#wubox'); if (!box || !WU) return;
  if (WU.i >= WU.plan.length) {
    box.innerHTML = `<div class="card stack" style="text-align:center"><div style="font-size:34px">🎶</div><b>Распевка сделана</b><div class="small muted">Голос разогрет, теперь самое время для игры или упражнений.</div>
      <div class="row"><button class="btn" style="flex:1" onclick="go('ball')">К игре</button><button class="btn ghost" style="flex:1" onclick="go('today')">На главную</button></div></div>`;
    return;
  }
  const s = WU.plan[WU.i];
  box.innerHTML = `<div class="row" style="gap:4px;margin-bottom:10px">${WU.plan.map((_, k) => `<i style="flex:1;height:5px;border-radius:3px;background:${k < WU.i ? 'var(--ok)' : k === WU.i ? 'var(--accent)' : 'var(--line)'}"></i>`).join('')}</div>
    <div class="card stack"><div class="tiny muted">Шаг ${WU.i + 1} из ${WU.plan.length}</div><h2 style="margin:0">${s.title}</h2><p class="small" style="margin:0">${s.how}</p>
    ${s.keys ? `<div class="tiny muted">${s.keys.length} ${plural(s.keys.length, 'тональность', 'тональности', 'тональностей')}: от ${noteShort(s.keys[0] + Math.min(...s.pat))} до ${noteShort(s.keys[s.keys.length - 1] + Math.max(...s.pat))}</div>` : ''}
    <div id="wunow" style="text-align:center;font:800 26px Lora,serif;min-height:36px">${WU.playing ? '' : '-'}</div>
    <div class="row"><button class="btn" style="flex:1" id="wuplay" onclick="warmupPlay()">${WU.playing ? ICON.stop + ' Пауза' : ICON.play + ' Начать'}</button><button class="btn ghost" onclick="warmupNext()">Дальше ›</button></div></div>`;
}
function warmupNext() {
  warmupStop(); WU.i++;
  if (WU.i >= WU.plan.length) { (state.warmups ||= []).push({ date: nowLocal(), steps: WU.plan.length }); if (state.warmups.length > 400) state.warmups.shift(); save(); }
  warmupDraw(); if (WU.i < WU.plan.length) setTimeout(warmupPlay, 300);
}
function warmupPlay() {
  if (!WU) return;
  if (WU.playing) { warmupStop(); warmupDraw(); return; }
  const s = WU.plan[WU.i], c = ac(), b = 60 / WU_BPM, t0 = c.currentTime + .15, sp = window.WU_SPEED || 1;
  WU.playing = true; warmupDraw();
  const now = $('#wunow'); const say = t => { if ($('#wunow')) $('#wunow').textContent = t; };
  if (s.kind === 'breath') {
    let k = 0; const total = s.cycles * 10;
    WU.tick = setInterval(() => { const ph = k % 10; say(ph < 4 ? `Вдох ${ph + 1}` : `Выдох «с» ${ph - 3}`); k++; if (k >= total) { warmupNext(); } }, 1000 / sp);
    say('Вдох 1'); return;
  }
  if (s.kind === 'timer') {
    let left = s.sec; say(left + ' с');
    WU.tick = setInterval(() => { left--; say(left + ' с'); if (left <= 0) warmupNext(); }, 1000 / sp);
    return;
  }
  // упражнение по тональностям: аккорд-опора, потом мелодия, пауза на вдох
  let t = t0; const marks = [];
  for (const k of s.keys) {
    marks.push([t - t0, k]);
    [0, 4, 7].forEach(x => tone(k + x, t, b * 1.6, .06));
    t += b * 2;
    s.pat.forEach((x, j) => tone(k + x, t + j * b, (j === s.pat.length - 1 ? 1.8 : .95) * b, .2));
    t += (s.pat.length + 1) * b;
  }
  marks.forEach(([dt, k]) => setTimeout(() => { if (WU && WU.playing) say(noteFull(k)); }, dt * 1000 / sp));
  WU.timer = setTimeout(warmupNext, (t - t0 + .3) * 1000 / sp);
}

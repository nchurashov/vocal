// ===== Распевка дня: маршрут #warmup =====
// Два режима: «Вместе» - поёшь с пианино; «Повтори за мной» - пианино играет фразу, потом тишина,
// ты повторяешь, микрофон слушает только в тишине (пианино в замер не попадает).
// Границы - замеренный диапазон (state.range). В спуске вниз одна тональность «за краем» (на полутон ниже низа):
// если там чисто удержишь новую ноту (правило замера, rangeStep), предложим записать новый низ.
const WU_STEPS = [
  { id: 'breath', title: 'Дыхание', how: 'Вдох носом на 4 счёта, выдох на «с-с-с» на 6. Плечи не поднимаются, живот мягкий.', kind: 'breath', cycles: 4 },
  { id: 'trill', title: 'Губная трель', how: 'Губы расслаблены, «бррр» на звук. Если трель не идёт, придержи щёки пальцами.', pat: [0, 2, 4, 5, 7, 5, 4, 2, 0], from: 'mid', dir: 1, n: 6 },
  { id: 'hum', title: 'Мычание', how: '«М» с сомкнутыми губами и свободной челюстью. Почувствуй, как щекочет губы и нос.', pat: [0, 4, 7, 4, 0], from: 'mid', dir: 1, n: 5 },
  { id: 'siren', title: 'Сирена', how: 'На «у» скользи снизу вверх и обратно, как сирена. Без нажима, сколько удобно.', kind: 'timer', sec: 30 },
  { id: 'break', title: 'Переход в фальцет', how: 'На «у» легко, почти шёпотом голоса. Наверху голос захочет переключиться: не дави и не кричи, дай ему мягко уйти в фальцет и так же мягко вернуться.', pat: [0, 4, 7, 12, 7, 4, 0], from: 'break', dir: 1, n: 6 },
  { id: 'mami', title: 'Ми-мэ-ма-мо-му', how: 'Каждый слог на своей ноте, рот открыт свободно, звук вперёд.', pat: [0, 2, 4, 5, 7, 5, 4, 2, 0], from: 'mid', dir: 1, n: 6 },
  { id: 'low', title: 'Спуск вниз', how: 'Сверху вниз на «а», мягко. Внизу не дави: лучше тише, чем с хрипом.', pat: [7, 5, 4, 2, 0], from: 'low', dir: -1, n: 6, edge: true },
];
// тональности упражнения: чистая функция (тест: tests/sim_warmup.py)
function warmupKeys(step, b, range) {
  const span = Math.max(...step.pat) - Math.min(...step.pat);
  const lo = range ? range.lo : b - 2, hi = range ? range.hi : b + 12;
  const fits = k => k + Math.min(...step.pat) >= lo && k + Math.max(...step.pat) <= hi;
  // переход: верхняя нота фразы проходит через границу грудного голоса (от chestHi-2 до chestHi+3)
  if (step.from === 'break' && !(range && range.chestHi != null && range.chestHi < range.hi)) return [];
  let k = step.from === 'low' ? Math.min(hi - span, range ? lo + step.n - 1 : b + 3) : step.from === 'break' ? range.chestHi - 2 - Math.max(...step.pat) : Math.max(lo, b - 2);
  const keys = [];
  for (let i = 0; i < 40 && keys.length < step.n; i++, k += step.dir) { if (fits(k)) keys.push(k); else if (keys.length) break; }
  // шаг за край: только при замеренном диапазоне и если спуск дошёл до самого низа
  if (step.edge && range && keys.length && keys[keys.length - 1] + Math.min(...step.pat) === lo && lo - 1 >= BASE_MIN - 4) keys.push(keys[keys.length - 1] - 1);
  return keys;
}
// оценка одной тональности по кадрам ответа: какие ноты фразы спеты чисто (±50 центов, не меньше 0.15 с)
function wuScore(pat, key, frames, strict) {
  const notes = [...new Set(pat.map(x => key + x))], got = new Map(notes.map(n => [n, 0]));
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i], m = f.m; if (m == null) continue;
    const dt = Math.min(.1, f.t - frames[i - 1].t);
    let best = null, bd = 9;
    for (const n of notes) { let d = m - n; if (!strict) d -= 12 * Math.round(d / 12); if (Math.abs(d) < Math.abs(bd)) { bd = d; best = n; } }
    if (Math.abs(bd) <= .5) got.set(best, got.get(best) + dt);
  }
  const hit = notes.map(n => got.get(n) >= .15);
  return { notes, hit, n: hit.filter(Boolean).length, ok: hit.filter(Boolean).length >= Math.ceil(notes.length * .8) };
}
function warmupPlan() {
  const r = lastRange();
  return WU_STEPS.map(s => s.pat ? { ...s, keys: warmupKeys(s, base(), r) } : s).filter(s => !s.pat || s.keys.length);
}
let WU = null;
const WU_BPM = 110;
const wuMode = () => MIC_DIRECT && (state.settings.wuMode || 'echo') === 'echo' ? 'echo' : 'along';
function wuKeySec(s, mode) { const b = 60 / WU_BPM; return mode === 'echo' ? (2 + s.pat.length + 1) * b + s.pat.length * b + 1.2 : (s.pat.length + 3) * b; }
function wuStepSec(s, mode = wuMode()) { return s.kind === 'breath' ? s.cycles * 10 : s.kind === 'timer' ? s.sec : s.keys.length * wuKeySec(s, mode); }
const warmupMin = () => Math.max(1, Math.round(warmupPlan().reduce((a, s) => a + wuStepSec(s), 0) / 60));
const doneToday = () => (state.warmups || []).some(w => w.date.slice(0, 10) === ymd());
function warmupStreak() {
  const days = new Set((state.warmups || []).map(w => w.date.slice(0, 10)));
  let n = 0, d = ymd(); if (!days.has(d)) d = addDays(d, -1);
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
// пауза шага: звук и таймеры, микрофон остаётся
function wuPause() { if (!WU) return; clearTimeout(WU.timer); clearInterval(WU.tick); (WU.timers || []).forEach(clearTimeout); WU.timers = []; stopAll(); WU.playing = false; WU.win = null; }
// полная остановка (уход с экрана): ещё и микрофон
function warmupStop() {
  if (!WU) return; wuPause(); cancelAnimationFrame(WU.raf);
  if (WU.stream) { WU.stream.getTracks().forEach(t => t.stop()); WU.stream = null; afterMic(); }
  busy = false;
}
function setWuMode(m) { state.settings.wuMode = m; save(); render(); }
function viewWarmup() {
  warmupStop();
  WU = { i: 0, plan: warmupPlan(), playing: false, res: {}, R: { fr: [], lo: null, hi: null }, timers: [] };
  afterHooks.push(warmupDraw);
  const r = lastRange(), st = warmupStreak();
  return `<button class="back" onclick="go('today')">${ICON.back} Сегодня</button><h1>Распевка дня</h1>
    <p class="muted" style="margin:6px 0 0">${WU.plan.length} ${plural(WU.plan.length, 'упражнение', 'упражнения', 'упражнений')}, около ${warmupMin()} мин. Тональность сдвигается по полутону.${st ? ` Дней подряд: ${st}.` : ''}</p>
    ${MIC_DIRECT ? `<div class="seg sec" style="margin-top:12px"><button class="${wuMode() === 'echo' ? 'on' : ''}" onclick="setWuMode('echo')">Повтори за мной</button><button class="${wuMode() === 'along' ? 'on' : ''}" onclick="setWuMode('along')">Вместе с пианино</button></div>
    <p class="tiny muted" style="margin:6px 0 0">${wuMode() === 'echo' ? 'Пианино играет фразу, потом тишина: повтори её. Микрофон слушает только твой ответ и покажет, какие ноты взяты чисто.' : 'Поёшь одновременно с пианино. Без проверки нот, просто разогрев.'}</p>` : ''}
    <p class="tiny muted" style="margin:6px 0 0">${r ? `Границы - твой замер ${noteShort(r.lo)} - ${noteShort(r.hi)}. В спуске вниз последняя тональность на полутон ниже: попробуй, но не дави.` : `Диапазон не замерен, поэтому держусь рядом с ${noteShort(base())}. <a href="#range">Замерить</a>, чтобы распевка шла по твоим границам.`}</p>
    <div id="wubox" class="sec"></div>`;
}
function wuResultsHTML(s) {
  const rs = WU.res[s.id]; if (!rs || !rs.length) return '';
  return `<div class="row wrap" style="gap:6px">${rs.map(x => `<span class="chip ${x.ok ? 'ok' : x.n ? 'near' : 'bad'}">${noteShort(x.key)}${x.edge ? ' за краем' : ''}: ${x.n}/${x.notes.length}</span>`).join('')}</div>`;
}
function warmupDraw() {
  const box = $('#wubox'); if (!box || !WU) return;
  if (WU.i >= WU.plan.length) {
    const all = Object.values(WU.res).flat(), ok = all.filter(x => x.ok).length, r = lastRange();
    const newLo = r && WU.R.lo != null && WU.R.lo < r.lo ? WU.R.lo : null, newHi = r && WU.R.hi != null && WU.R.hi > r.hi ? WU.R.hi : null;
    box.innerHTML = `<div class="card stack" style="text-align:center"><div style="font-size:34px">🎶</div><b>Распевка сделана</b>
      ${all.length ? `<div class="small">Чисто взято ${ok} из ${all.length} ${plural(all.length, 'тональности', 'тональностей', 'тональностей')}.</div>` : '<div class="small muted">Голос разогрет, теперь самое время для игры или упражнений.</div>'}
      ${newLo != null || newHi != null ? `<div class="note small" style="text-align:left"><b>Новая граница!</b> Ты чисто удержал ${[newLo != null ? noteFull(newLo) + ' (раньше низ был ' + noteShort(r.lo) + ')' : '', newHi != null ? noteFull(newHi) + ' (раньше верх был ' + noteShort(r.hi) + ')' : ''].filter(Boolean).join(' и ')}.
        <div class="row" style="margin-top:8px"><button class="btn" style="flex:1" onclick="wuSaveRange(${newLo ?? r.lo},${newHi ?? r.hi})">Записать в диапазон</button></div></div>` : ''}
      <div class="row"><button class="btn" style="flex:1" onclick="go('ball')">К игре</button><button class="btn ghost" style="flex:1" onclick="go('today')">На главную</button></div></div>`;
    return;
  }
  const s = WU.plan[WU.i];
  box.innerHTML = `<div class="row" style="gap:4px;margin-bottom:10px">${WU.plan.map((_, k) => `<i style="flex:1;height:5px;border-radius:3px;background:${k < WU.i ? 'var(--ok)' : k === WU.i ? 'var(--accent)' : 'var(--line)'}"></i>`).join('')}</div>
    <div class="card stack"><div class="tiny muted">Шаг ${WU.i + 1} из ${WU.plan.length}</div><h2 style="margin:0">${s.title}</h2><p class="small" style="margin:0">${s.how}</p>
    ${s.keys ? `<div class="tiny muted">${s.keys.length} ${plural(s.keys.length, 'тональность', 'тональности', 'тональностей')}: от ${noteShort(s.keys[0] + Math.min(...s.pat))} до ${noteShort(s.keys[s.keys.length - 1] + Math.min(...s.pat))}</div>` : ''}
    <div style="text-align:center"><div id="wunow" style="font:800 26px Lora,serif;min-height:36px">${WU.playing ? '' : '-'}</div><div id="wusub" class="small muted" style="min-height:20px"></div></div>
    <div id="wures">${wuResultsHTML(s)}</div>
    <div class="row"><button class="btn" style="flex:1" id="wuplay" onclick="warmupPlay()">${WU.playing ? ICON.stop + ' Пауза' : ICON.play + ' Начать'}</button><button class="btn ghost" onclick="warmupNext()">Дальше ›</button></div></div>`;
}
function wuSaveRange(lo, hi) {
  (state.range ||= []).push({ date: nowLocal(), lo, hi, from: 'warmup' }); save();
  toast(`Записал: ${noteShort(lo)} - ${noteShort(hi)}`); go('range');
}
function warmupNext() {
  wuPause(); WU.i++;
  if (WU.i >= WU.plan.length) {
    const all = Object.values(WU.res).flat();
    (state.warmups ||= []).push({ date: nowLocal(), steps: WU.plan.length, mode: wuMode(), ...(all.length ? { keys: all.length, clean: all.filter(x => x.ok).length } : {}) });
    if (state.warmups.length > 400) state.warmups.shift(); save();
    warmupStop();
  }
  warmupDraw(); if (WU.i < WU.plan.length) WU.timers.push(setTimeout(warmupPlay, 300));
}
// микрофон для режима «Повтори за мной»: открывается один раз на всю распевку
async function wuEnsureMic() {
  if (WU.stream) return true;
  let stream; try { stream = await openMic(); } catch (e) { toast('Нет доступа к микрофону. Распевка пойдёт без проверки.'); state.settings.wuMode = 'along'; save(); return false; }
  const c = ac(); WU.stream = stream; busy = true;
  const src = c.createMediaStreamSource(stream), an = c.createAnalyser(); an.fftSize = 4096; src.connect(an);
  const buf = new Float32Array(an.fftSize), hist = [];
  const loop = () => {
    if (!WU || !WU.stream) return;
    an.getFloatTimeDomainData(buf);
    hist.push(VA.livePitch(buf, c.sampleRate)); if (hist.length > 3) hist.shift();
    const v = hist.filter(x => x != null), m = v.length >= 2 ? VA.median(v) : null, now = c.currentTime, w = WU.win;
    if (w && now >= w.t0 && now <= w.t1) {
      w.frames.push({ t: now, m });
      rangeStep(WU.R, now, m);
      const sub = $('#wusub'); if (sub) sub.textContent = m == null ? 'Твоя очередь' : 'Слышу ' + noteShort(m);
    }
    WU.raf = requestAnimationFrame(loop);
  };
  loop();
  return true;
}
async function warmupPlay() {
  if (!WU) return;
  if (WU.playing) { wuPause(); warmupDraw(); return; }
  const s = WU.plan[WU.i], sp = window.WU_SPEED || 1;
  if (s.pat && wuMode() === 'echo') await wuEnsureMic();
  const echo = !!(s.pat && wuMode() === 'echo' && WU.stream);
  const c = ac(), b = 60 / WU_BPM, t0 = c.currentTime + .15;
  WU.playing = true; warmupDraw();
  const say = (t, sub = '') => { if ($('#wunow')) $('#wunow').textContent = t; if ($('#wusub')) $('#wusub').textContent = sub; };
  const later = (sec, f) => WU.timers.push(setTimeout(() => { if (WU && WU.playing) f(); }, sec * 1000 / sp));
  if (s.kind === 'breath') {
    let k = 0; const total = s.cycles * 10;
    WU.tick = setInterval(() => { const ph = k % 10; say(ph < 4 ? `Вдох ${ph + 1}` : `Выдох «с» ${ph - 3}`); k++; if (k >= total) warmupNext(); }, 1000 / sp);
    say('Вдох 1'); return;
  }
  if (s.kind === 'timer') {
    let left = s.sec; say(left + ' с');
    WU.tick = setInterval(() => { left--; say(left + ' с'); if (left <= 0) warmupNext(); }, 1000 / sp);
    return;
  }
  // упражнение по тональностям: аккорд-опора, фраза, (в режиме «Повтори» - тишина на ответ)
  WU.res[s.id] = []; let t = t0;
  s.keys.forEach((k, ki) => {
    const edge = s.edge && lastRange() && ki === s.keys.length - 1 && k + Math.min(...s.pat) < lastRange().lo;
    later(t - t0, () => say(noteFull(k + Math.min(...s.pat)), edge ? 'за краем замера: попробуй мягко' : echo ? 'слушай' : 'пой вместе'));
    [0, 4, 7].forEach(x => tone(k + x, t, b * 1.6, .06));
    t += b * 2;
    s.pat.forEach((x, j) => tone(k + x, t + j * b, (j === s.pat.length - 1 ? 1.8 : .95) * b, .2));
    // окно ответа начинается, когда последняя нота пианино (1.8 доли) уже стихла
    t += (s.pat.length + (echo ? 1 : .5)) * b;
    if (echo) {
      const w0 = t, w1 = t + s.pat.length * b + 1.2;
      later(w0 - t0, () => { say(noteFull(k + Math.min(...s.pat)), 'Твоя очередь'); WU.win = { t0: w0, t1: w1, frames: [] }; });
      later(w1 - t0 + .05, () => {
        const w = WU.win; WU.win = null; if (!w) return;
        const sc = wuScore(s.pat, k, w.frames, strictOct());
        WU.res[s.id].push({ key: k + Math.min(...s.pat), edge, ...sc });
        const box = $('#wures'); if (box) box.innerHTML = wuResultsHTML(s);
      });
      t = w1;
    } else t += .5 * b;
  });
  WU.timer = setTimeout(() => { if (WU && WU.playing) warmupNext(); }, (t - t0 + .4) * 1000 / sp);
}

// ===== Замер диапазона: маршрут #range =====
// Засчитываются только ноты, удержанные ровно RANGE_HOLD секунд (разброс не больше полутона)
let RG = null;
const RANGE_HOLD = .8;
function rangeStep(R, now, m) {
  R.fr.push({ t: now, m }); while (R.fr.length && now - R.fr[0].t > RANGE_HOLD) R.fr.shift();
  R.cur = m;
  if (now - R.fr[0].t < RANGE_HOLD - .05) return null;
  const v = R.fr.filter(f => f.m != null).map(f => f.m);
  if (v.length < R.fr.length * .8) return null;
  const md = VA.median(v);
  if (v.some(x => Math.abs(x - md) > .5)) return null;
  const n = Math.round(md);
  if (R.lo == null || n < R.lo) R.lo = n;
  if (R.hi == null || n > R.hi) R.hi = n;
  R.held = n; R.heldT = now; return n;
}
function rangeStop() {
  if (!RG) return;
  cancelAnimationFrame(RG.raf);
  if (RG.stream) { RG.stream.getTracks().forEach(t => t.stop()); RG.stream = null; afterMic(); }
  RG.mode = RG.mode === 'live' ? 'idle' : RG.mode; busy = false;
}
function viewRange() {
  if (!RG || RG.mode === 'live') RG = { mode: 'idle', fr: [] };
  afterHooks.push(rangeDraw);
  const hist = state.range || [];
  let h = `<button class="back" onclick="go('today')">${ICON.back} Сегодня</button><h1>Мой диапазон</h1>
    <p class="muted" style="margin:6px 0 0">Пой на «а». Сначала самую низкую ноту, которую берёшь без хрипа и давления, и подержи секунду. Потом поднимайся ступеньками до самой высокой, где голос ещё звучит свободно, и тоже подержи.</p>
    <p class="tiny muted" style="margin:6px 0 0">Засчитываются только ноты, удержанные ровно ${RANGE_HOLD} с. Случайный писк или хрип не попадёт.</p>
    <div class="card sec stack" id="rgbox"></div>`;
  if (hist.length) {
    const f = hist[0], l = hist[hist.length - 1];
    h += `<div class="sec"><h2>Замеры</h2>`;
    if (hist.length > 1) {
      const dl = f.lo - l.lo, dh = l.hi - f.hi, st = k => k + ' ' + plural(k, 'полутон', 'полутона', 'полутонов');
      const lo = dl > 0 ? 'низ опустился на ' + st(dl) : dl < 0 ? 'низ поднялся на ' + st(-dl) : 'низ тот же';
      const hi = dh > 0 ? 'верх поднялся на ' + st(dh) : dh < 0 ? 'верх опустился на ' + st(-dh) : 'верх тот же';
      h += `<p class="small" style="margin:0 0 10px">С первого замера (${fmtDay(f.date.slice(0, 10)).toLowerCase()}): ${lo}, ${hi}.</p>`;
    }
    h += hist.slice().reverse().slice(0, 12).map(r => `<div class="item" style="cursor:default"><div class="t"><b>${noteShort(r.lo)} - ${noteShort(r.hi)}</b><span class="small muted">${fmtDay(r.date.slice(0, 10))} · ${r.hi - r.lo} ${plural(r.hi - r.lo, 'полутон', 'полутона', 'полутонов')}</span></div></div>`).join('') + '</div>';
  }
  return h;
}
function rangeDraw() {
  const box = $('#rgbox'); if (!box || !RG) return;
  if (RG.mode === 'live') {
    box.innerHTML = `<div style="text-align:center"><div class="tiny muted">Сейчас</div><div id="rgcur" style="font:800 34px Lora,serif;min-height:44px">-</div><div id="rgheld" class="small" style="min-height:20px;color:var(--ok)"></div></div>
      <div class="row" style="justify-content:space-around"><div style="text-align:center"><div class="tiny muted">Низ</div><b id="rglo">-</b></div><div style="text-align:center"><div class="tiny muted">Верх</div><b id="rghi">-</b></div></div>
      <button class="btn block" onclick="rangeDone()">${ICON.stop} Готово</button>`;
    return;
  }
  if (RG.mode === 'result') {
    const lo = RG.lo, hi = RG.hi, span = hi - lo, mid = lo + Math.max(0, Math.round((span - 12) / 2)), top = Math.max(lo, hi - 12);
    box.innerHTML = `<div><div class="tiny muted">Твой диапазон сегодня</div><div style="font:800 26px Lora,serif">${noteShort(lo)} - ${noteShort(hi)}</div><div class="small muted">${noteFull(lo)} - ${noteFull(hi)}, ${span} ${plural(span, 'полутон', 'полутона', 'полутонов')}</div></div>
      ${span < 12 ? `<div class="note small">Меньше октавы. Уровни игр идут на октаву вверх от базовой ноты, так что верх может не взяться. Это нормально, диапазон растёт с распевками.</div>` : ''}
      <div class="small"><b>Где работать?</b> Уровни и упражнения пойдут от выбранной ноты на октаву вверх.</div>
      ${(span >= 12 ? [[mid, false, 'В середине', 'удобно, подойдёт любая октава'], [lo, true, 'Нижний регистр', 'засчитается только эта октава'], [top, true, 'Верхний регистр', 'засчитается только эта октава']]
        : [[lo, false, 'Весь диапазон', 'подойдёт любая октава'], [lo, true, 'Строго в моей октаве', 'октавой выше или ниже не засчитается']])
        .map(([m, st, t, d]) => `<button class="btn ghost block" style="flex-direction:column;align-items:flex-start;gap:2px;text-align:left" onclick="rangeWork(${m},${st})"><span>${t}: от ${noteShort(m)} до ${noteShort(m + 12)}</span><span class="tiny muted" style="font-weight:500">${d}</span></button>`).join('')}
      <button class="btn soft" onclick="rangeStart()">${ICON.mic} Замерить ещё раз</button>`;
    return;
  }
  box.innerHTML = `${RG.err ? `<div class="note small">${RG.err}</div>` : ''}<button class="btn block" onclick="rangeStart()">${ICON.mic} Начать замер</button>
    <div class="tiny muted">Лучше в тишине. Не надо пищать или рычать ради рекорда: важна нота, которую поёшь свободно.</div>`;
}
async function rangeStart() {
  if (!MIC_DIRECT) { RG = { mode: 'idle', fr: [], err: 'Здесь нет живого микрофона. Открой сайт в Safari или Chrome.' }; rangeDraw(); return; }
  let stream;
  try { stream = await openMic(); }
  catch (e) { RG = { mode: 'idle', fr: [], err: '<b>Нет доступа к микрофону.</b> В Safari нажми «аА» слева от адреса → «Настройки веб-сайта» → «Микрофон» → «Разрешить», потом обнови страницу.' }; rangeDraw(); return; }
  const c = ac(); busy = true;
  RG = { mode: 'live', fr: [], stream, lo: null, hi: null };
  rangeDraw();
  const src = c.createMediaStreamSource(stream), an = c.createAnalyser(); an.fftSize = 4096; src.connect(an);
  const buf = new Float32Array(an.fftSize), hist = [];
  const loop = () => {
    if (!RG || RG.mode !== 'live') return;
    an.getFloatTimeDomainData(buf);
    hist.push(VA.livePitch(buf, c.sampleRate)); if (hist.length > 3) hist.shift();
    const v = hist.filter(x => x != null), m = v.length >= 2 ? VA.median(v) : null;
    rangeStep(RG, c.currentTime, m);
    const cur = $('#rgcur'); if (cur) cur.textContent = m == null ? '-' : noteShort(m);
    const hd = $('#rgheld'); if (hd) hd.textContent = RG.held != null && c.currentTime - RG.heldT < .4 ? '✓ ' + noteFull(RG.held) : '';
    if ($('#rglo')) $('#rglo').textContent = RG.lo == null ? '-' : noteShort(RG.lo);
    if ($('#rghi')) $('#rghi').textContent = RG.hi == null ? '-' : noteShort(RG.hi);
    RG.raf = requestAnimationFrame(loop);
  };
  loop();
}
function rangeDone() {
  if (!RG) return;
  const { lo, hi } = RG; rangeStop();
  if (lo == null) { RG = { mode: 'idle', fr: [], err: 'Не услышал ни одной удержанной ноты. Пой громче и держи каждую ноту секунду.' }; rangeDraw(); return; }
  (state.range ||= []).push({ date: nowLocal(), lo, hi }); if (state.range.length > 100) state.range.shift();
  save();
  RG = { mode: 'result', fr: [], lo, hi };
  render();
}
function rangeWork(m, strict) {
  state.settings.base = Math.max(BASE_MIN, Math.min(BASE_MAX, m)); state.settings.strict = strict; state.settings.voiceSet = true; save();
  toast(`Готово: работаем от ${noteShort(base())}${strict ? ', только в этой октаве' : ''}`);
  go('ball');
}

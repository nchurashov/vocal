import { act } from '../core/actions.js';
import { VA } from '../core/analysis.js';
import { MIC_DEAD, MIC_DIRECT, afterMic, base, levelBar, micTap, noteFull, noteShort, openMic, setLevel } from '../core/audio.js';
import { pianoBand, pianoMark, pianoSVG } from '../core/piano.js';
import { afterHooks, go, render } from '../core/router.js';
import { profName, save, state } from '../core/store.js';
import { toast } from '../core/ui.js';
import { $, BASE_MAX, BASE_MIN, ICON, fmtDay, nowLocal, plural, setBusy } from '../core/util.js';
import { camOn, camRecStart, camRecStop, camRecording, camStart, camToggleHTML } from './cam.js';
import { lastRange } from './register.js';

// ===== Замер диапазона: маршрут #range =====
// Засчитываются только ноты, удержанные ровно RANGE_HOLD секунд (разброс не больше полутона)
export let RG = null;
export const RANGE_HOLD = .8;
export function rangeStep(R, now, m) {
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
// куда работать после замера: считаем по грудному голосу (фальцет в уровни не берём)
export function rangeChoices(lo, hi, chestHi) {
  const ch = chestHi == null ? hi : chestHi, span = ch - lo;
  if (span < 12) return [[lo, false, 'Весь диапазон', 'подойдёт любая октава'], [lo, true, 'Строго в моей октаве', 'октавой выше или ниже не засчитается']];
  return [[lo + Math.round((span - 12) / 2), false, 'В середине', 'удобно, подойдёт любая октава'], [lo, true, 'Нижний регистр', 'засчитается только эта октава'],
    [ch - 12, true, 'Верхний регистр', chestHi == null ? 'засчитается только эта октава' : 'до верха грудного голоса, только эта октава']];
}
// отметка перехода: во время замера - «сейчас перешёл в фальцет», после - нажатием на клавишу
export function rangeMarkBreak() {
  if (!RG || RG.hi == null) { toast('Сначала удержи хотя бы одну ноту грудным голосом'); return; }
  RG.chestHi = RG.hi; toast('Отметил: грудной голос до ' + noteShort(RG.hi));
  const el = $('#rgchest'); if (el) el.textContent = noteShort(RG.chestHi);
  RG.bandKey = null;
}
export function rangeSetBreak(m) {
  if (!RG || RG.mode !== 'result') return;
  m = Math.max(RG.lo, Math.min(RG.hi, m));
  RG.chestHi = m >= RG.hi ? null : m;
  const last = lastRange(); if (last && last.lo === RG.lo && last.hi === RG.hi) { if (RG.chestHi == null) delete last.chestHi; else last.chestHi = RG.chestHi; save(); }
  rangeDraw();
}
export function rangeStop() {
  if (!RG) return;
  cancelAnimationFrame(RG.raf);
  if (RG.stream) { RG.stream.getTracks().forEach(t => t.stop()); RG.stream = null; afterMic(); }
  RG.mode = RG.mode === 'live' ? 'idle' : RG.mode; setBusy(false);
}
export function viewRange() {
  if (!RG || RG.mode === 'live') RG = { mode: 'idle', fr: [] };
  afterHooks.push(rangeDraw); afterHooks.push(() => { if (camOn()) camStart(); });
  const hist = state.range || [];
  let h = `<button class="back" ${act('go', 'today')}>${ICON.back} Сегодня</button><h1>Мой диапазон</h1>
    <p class="muted" style="margin:6px 0 0">Пой на «а». Сначала самую низкую ноту, которую берёшь без хрипа и давления, и подержи секунду. Потом поднимайся ступеньками до самой высокой, где голос ещё звучит свободно, и тоже подержи.</p>
    <p class="tiny muted" style="margin:6px 0 0">Засчитываются только ноты, удержанные ровно ${RANGE_HOLD} с. Случайный писк или хрип не попадёт. <a href="#learn">Что значат E2, C4?</a></p>
    ${camToggleHTML()}<div class="card sec stack" id="rgbox"></div>`;
  if (hist.length) {
    const f = hist[0], l = hist[hist.length - 1];
    h += `<div class="sec"><h2>Замеры</h2>`;
    if (hist.length > 1) {
      const dl = f.lo - l.lo, dh = l.hi - f.hi, st = k => k + ' ' + plural(k, 'полутон', 'полутона', 'полутонов');
      const lo = dl > 0 ? 'низ опустился на ' + st(dl) : dl < 0 ? 'низ поднялся на ' + st(-dl) : 'низ тот же';
      const hi = dh > 0 ? 'верх поднялся на ' + st(dh) : dh < 0 ? 'верх опустился на ' + st(-dh) : 'верх тот же';
      h += `<p class="small" style="margin:0 0 10px">С первого замера (${fmtDay(f.date.slice(0, 10)).toLowerCase()}): ${lo}, ${hi}.</p>`;
    }
    h += hist.slice().reverse().slice(0, 12).map(r => `<div class="item" style="cursor:default"><div class="t"><b>${noteShort(r.lo)} - ${noteShort(r.hi)}</b><span class="small muted">${fmtDay(r.date.slice(0, 10))} · ${r.hi - r.lo} ${plural(r.hi - r.lo, 'полутон', 'полутона', 'полутонов')}${r.chestHi != null ? ' · грудной до ' + noteShort(r.chestHi) : ''}${r.from === 'warmup' ? ' · из распевки' : ''}</span></div></div>`).join('') + '</div>';
  }
  return h;
}
export function rangeDraw() {
  const box = $('#rgbox'); if (!box || !RG) return;
  if (RG.mode === 'live') {
    const rec = camRecording();
    box.innerHTML = `${rec ? '<div class="row small" style="justify-content:center;gap:6px;color:var(--bad);font-weight:700"><span class="rec-dot"></span>Идёт запись видео</div>' : ''}
      <button class="btn block" ${act('rangeDone')}>${ICON.stop} ${rec ? 'Готово, остановить запись' : 'Готово'}</button>
      <div style="text-align:center"><div class="tiny muted">Сейчас</div><div id="rgcur" style="font:800 34px Lora,serif;min-height:44px">-</div><div id="rgcurru" class="small muted" style="min-height:20px"></div><div id="rgheld" class="small" style="min-height:20px;color:var(--ok)"></div></div>
      <div class="row" style="gap:8px"><span class="tiny muted" style="flex:none">Микрофон</span><div style="flex:1">${levelBar('rglvl')}</div></div><div id="rgdead" class="small" style="color:var(--bad)"></div>
      <div style="overflow-x:auto">${pianoSVG(36, 83, { id: 'pkrange' })}</div>
      <div class="row" style="justify-content:space-around"><div style="text-align:center"><div class="tiny muted">Низ</div><b id="rglo">-</b></div><div style="text-align:center"><div class="tiny muted">Верх</div><b id="rghi">-</b></div><div style="text-align:center"><div class="tiny muted">Грудной до</div><b id="rgchest">-</b></div></div>
      <button class="btn ghost block" ${act('rangeMarkBreak')}>Перешёл в фальцет</button>
      <div class="tiny muted" style="text-align:center;margin-top:-4px">Нажми, когда голос переключился в фальцет. Можно отметить и после замера.</div>`;
    return;
  }
  if (RG.mode === 'result') {
    const lo = RG.lo, hi = RG.hi, span = hi - lo, ch = RG.chestHi;
    box.innerHTML = `<div><div class="tiny muted">Твой диапазон сегодня</div><div style="font:800 26px Lora,serif">${noteShort(lo)} - ${noteShort(hi)}</div><div class="small muted">${noteFull(lo)} - ${noteFull(hi)}, ${span} ${plural(span, 'полутон', 'полутона', 'полутонов')}</div>
        ${ch != null ? `<div class="small" style="margin-top:4px"><span style="color:var(--accent)">■</span> грудной ${noteShort(lo)} - ${noteShort(ch)} · <span style="color:var(--near)">■</span> фальцет ${noteShort(ch + 1)} - ${noteShort(hi)}</div>` : ''}</div>
      <div style="overflow-x:auto">${pianoSVG(Math.min(36, lo), Math.max(83, hi), { band: [lo, ch ?? hi], band2: ch != null ? [ch + 1, hi] : null, tap: true, onTap: 'rangeSetBreak' })}</div>
      <div class="tiny muted">${ch != null ? 'Не та граница? Нажми на клавишу - последнюю ноту, которую берёшь грудным голосом.' : 'Был фальцет? Нажми на клавишу - последнюю ноту, которую берёшь грудным голосом.'}${ch != null ? ` <a href="#" ${act('rangeNoFalsetto')}>Фальцета не было</a>` : ''}</div>
      ${(ch ?? hi) - lo < 12 ? `<div class="note small">${ch != null ? 'Грудной голос' : 'Диапазон'} меньше октавы. Уровни игр идут на октаву вверх от базовой ноты, так что верх может не взяться. Это нормально, диапазон растёт с распевками.</div>` : ''}
      <div class="small"><b>Где работать?</b> Уровни и упражнения пойдут от выбранной ноты на октаву вверх${ch != null ? ', по грудному голосу' : ''}.</div>
      ${rangeChoices(lo, hi, ch).map(([m, st, t, d]) => `<button class="btn ghost block" style="flex-direction:column;align-items:flex-start;gap:2px;text-align:left" ${act('rangeWork', m,st)}><span>${t}: от ${noteShort(m)} до ${noteShort(m + 12)}</span><span class="tiny muted" style="font-weight:500">${d}</span></button>`).join('')}
      <button class="btn soft" ${act('rangeStart')}>${ICON.mic} Замерить ещё раз</button>`;
    return;
  }
  box.innerHTML = `${RG.err ? `<div class="note small">${RG.err}</div>` : ''}<button class="btn block" ${act('rangeStart')}>${ICON.mic} Начать замер</button>
    <div class="tiny muted">Лучше в тишине. Не надо пищать или рычать ради рекорда: важна нота, которую поёшь свободно.</div>`;
}
export async function rangeStart() {
  if (!MIC_DIRECT) { RG = { mode: 'idle', fr: [], err: 'Здесь нет живого микрофона. Открой сайт в Safari или Chrome.' }; rangeDraw(); return; }
  let stream;
  try { stream = await openMic(); }
  catch (e) { RG = { mode: 'idle', fr: [], err: '<b>Нет доступа к микрофону.</b> В Safari нажми «аА» слева от адреса → «Настройки веб-сайта» → «Микрофон» → «Разрешить», потом обнови страницу.' }; rangeDraw(); return; }
  setBusy(true);
  RG = { mode: 'live', fr: [], stream, lo: null, hi: null };
  const T = micTap(stream), hist = [];
  if (camOn()) camRecStart(() => ({ top: 'Замер диапазона', big: RG && RG.cur != null ? noteShort(RG.cur) : '...', sub: RG && RG.lo != null ? `низ ${noteShort(RG.lo)} · верх ${noteShort(RG.hi)}` : '' }), (profName() ? profName() + ' · ' : '') + 'Мой диапазон', stream);
  rangeDraw();
  // на телефоне блок замера ниже первого экрана: прокручиваем к нему, чтобы «Готово» (и стоп записи) было видно сразу
  const box = $('#rgbox'); if (box) window.scrollTo({ top: Math.max(0, box.getBoundingClientRect().top + window.scrollY - 8), behavior: 'smooth' });
  const loop = () => {
    if (!RG || RG.mode !== 'live') return;
    RG.raf = requestAnimationFrame(loop);
    const buf = T.read(), now = performance.now() / 1000;
    setLevel('rglvl', T.level);
    const dm = $('#rgdead'); if (dm) dm.textContent = T.dead ? MIC_DEAD : '';
    hist.push(VA.livePitch(buf, T.c.sampleRate)); if (hist.length > 3) hist.shift();
    const v = hist.filter(x => x != null), m = v.length >= 2 ? VA.median(v) : null;
    rangeStep(RG, now, m);
    try {
    const cur = $('#rgcur'); if (cur) cur.textContent = m == null ? '-' : noteShort(m);
    const ru = $('#rgcurru'); if (ru) ru.textContent = m == null ? '' : noteFull(m).split(' (')[0];
    pianoMark('pkrange', m); if (RG.lo != null && RG.bandKey !== RG.lo + ':' + RG.hi + ':' + RG.chestHi) { RG.bandKey = RG.lo + ':' + RG.hi + ':' + RG.chestHi; pianoBand('pkrange', RG.lo, RG.hi, RG.chestHi); }
    const hd = $('#rgheld'); if (hd) hd.textContent = RG.held != null && now - RG.heldT < .4 ? '✓ ' + noteFull(RG.held) : '';
    if ($('#rglo')) $('#rglo').textContent = RG.lo == null ? '-' : noteShort(RG.lo);
    if ($('#rghi')) $('#rghi').textContent = RG.hi == null ? '-' : noteShort(RG.hi);
    } catch (e) { }
  };
  loop();
}
export function rangeDone() {
  if (!RG) return;
  const { lo, hi } = RG, chestHi = RG.chestHi != null && RG.chestHi < RG.hi ? RG.chestHi : null;
  if (camRecording()) camRecStop(lo == null ? null : `${noteShort(lo)} - ${noteShort(hi)}`, lo == null);
  rangeStop();
  if (lo == null) { RG = { mode: 'idle', fr: [], err: 'Не услышал ни одной удержанной ноты. Пой громче и держи каждую ноту секунду.' }; rangeDraw(); return; }
  (state.range ||= []).push({ date: nowLocal(), lo, hi, ...(chestHi != null ? { chestHi } : {}) }); if (state.range.length > 100) state.range.shift();
  save();
  RG = { mode: 'result', fr: [], lo, hi, chestHi };
  render();
}
export function rangeWork(m, strict) {
  state.settings.base = Math.max(BASE_MIN, Math.min(BASE_MAX, m)); state.settings.strict = strict; state.settings.voiceSet = true; save();
  toast(`Готово: работаем от ${noteShort(base())}${strict ? ', только в этой октаве' : ''}`);
  go('ball');
}







export function rangeNoFalsetto() { if (RG) rangeSetBreak(RG.hi); }





// установщики для моста window (переходный период, см. main.js)
export function __set_RG(v) { RG = v; }

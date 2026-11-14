import { VA } from '../core/analysis.js';
import { ac, afterMic, click, openMic, stopAll, tone } from '../core/audio.js';
import { profName } from '../core/store.js';
import { toast } from '../core/ui.js';
import { $, ICON, setBusy } from '../core/util.js';
import { camRecStart, camRecStop } from './cam.js';
import { octLock } from './register.js';

// ===== Песня-игра: ноты падают сверху на клавиатуру пианино. Нота коснулась клавиш - пой её. =====
// Голос подсвечивает клавишу (зелёная - попал в падающую ноту) и точкой показывает точную высоту над клавишами.
// Пианино во время игры молчит (иначе микрофон услышит подсказку): только первая нота и отсчёт.
// Засчёт ноты как в «Попади в ноту»: ±50 центов, первые 0.15 с ноты (или 30% короткой) не считаются, окно на 0.12 с позже (голос отстаёт),
// нота спета, если голос был в ней 40% её времени (score = доля / 0.8, засчитано от 0.5). Октава - octLock.
export const SGAME_TOL = 50, SGAME_AHEAD = 2.8, SGAME_LAG = .12;
const BLK = [1, 3, 6, 8, 10], isBlk = m => BLK.includes(((m % 12) + 12) % 12);
const nm = m => VA.noteName(m);
export let GS = null;

// s - песня, sh - сдвиг тональности, tp - темп; onDone(итог) - сохранить результат (songs.js)
export function sgameTimeline(s, sh, tp) {
  const t0 = s.notes[0].t;
  const tl = s.notes.map((n, i) => {
    const start = (n.t - t0) / tp, d = n.d / tp;
    return { i, m: n.m + sh, start, end: start + d * .96, skip: Math.min(.15, d * .3), w: n.w || '', in: 0, tot: 0, done: false, score: 0 };
  });
  return { tl, D: Math.max(...tl.map(n => n.end)) };
}
export function sgameSetup(s, sh, tp, onDone) {
  sgameStop();
  const cv = $('#sgcv'); if (!cv) return;
  const { tl, D } = sgameTimeline(s, sh, tp);
  const ph = []; s.ph.forEach((a, k) => { const b = k + 1 < s.ph.length ? s.ph[k + 1] : s.notes.length; for (let i = a; i < b; i++) ph[i] = k; });
  const lines = s.ph.map((a, k) => s.notes.slice(a, k + 1 < s.ph.length ? s.ph[k + 1] : s.notes.length).map(n => n.w || '').join('').replace(/\s+/g, ' ').trim());
  GS = { s, tl, D, ph, lines, cv, ctx: cv.getContext('2d'), mode: 'idle', voice: null, voiceHit: false, pops: [], combo: 0, maxCombo: 0, onDone, title: s.title };
  sgameResize(); sgameDraw(-1.5);
}
export function sgameResize() {
  const cv = GS.cv, w = cv.parentElement.clientWidth || 360, h = Math.round(Math.max(340, Math.min(560, w * 1.15, (window.innerHeight || 800) - 190))), dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
  GS.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); GS.W = w; GS.H = h; GS.KH = Math.round(Math.min(90, Math.max(64, h * .15)));
  // клавиатура: от ноты ниже самой низкой до ноты выше самой высокой, целыми белыми клавишами
  const ms = GS.tl.map(n => n.m); let lo = Math.min(...ms) - 2, hi = Math.max(...ms) + 2;
  if (isBlk(lo)) lo--; if (isBlk(hi)) hi++;
  const whites = []; for (let m = lo; m <= hi; m++) if (!isBlk(m)) whites.push(m);
  const ww = w / whites.length, bw = ww * .62, key = {};
  whites.forEach((m, k) => { key[m] = { x: k * ww, w: ww, c: k * ww + ww / 2 }; });
  for (let m = lo; m <= hi; m++) if (isBlk(m)) { const x = key[m - 1].x + ww - bw / 2; key[m] = { x, w: bw, c: x + bw / 2, b: true }; }
  Object.assign(GS, { lo, hi, ww, key });
  const css = getComputedStyle(document.documentElement), v = k => css.getPropertyValue(k).trim();
  GS.col = { line: v('--line'), muted: v('--muted'), ink: v('--ink'), accent: v('--accent'), ok: v('--ok'), bad: v('--bad'), near: v('--near'), card: v('--card'), soft: v('--accent-soft') };
}
// точное место голоса над клавишами: между центрами соседних клавиш
function voiceX(v) {
  const a = Math.floor(v), f = v - a, k = GS.key;
  const ca = k[Math.max(GS.lo, Math.min(GS.hi, a))].c, cb = k[Math.max(GS.lo, Math.min(GS.hi, a + 1))].c;
  return ca + (cb - ca) * f;
}
function rr(ctx, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
export function sgameDraw(now) {
  const { ctx, W, H, KH, col, tl, key } = GS, yLine = H - KH, pps = (yLine - 34) / SGAME_AHEAD;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = col.card; ctx.fillRect(0, 0, W, H);
  // дорожки клавиш: чёрные чуть темнее, как на клавиатуре
  for (let m = GS.lo; m <= GS.hi; m++) if (key[m].b) { ctx.globalAlpha = .35; ctx.fillStyle = col.line; ctx.fillRect(key[m].x, 0, key[m].w, yLine); }
  ctx.globalAlpha = 1;
  const act = tl.find(n => now >= n.start && now < n.end);
  // падающие ноты
  ctx.textAlign = 'center';
  for (const n of tl) {
    const yb = yLine - (n.start - now) * pps, yt = yLine - (n.end - now) * pps;
    if (yb < 0 || yt > yLine) continue;
    const k = key[n.m], x = k.x + (k.b ? 1 : 3), w = k.w - (k.b ? 2 : 6), top = Math.max(0, yt), bot = Math.min(yLine, yb);
    let fill = col.accent, a = .8;
    if (n.done) { fill = n.score >= .5 ? col.ok : col.bad; a = .6; } else if (n === act) a = 1;
    ctx.globalAlpha = a; ctx.fillStyle = fill; rr(ctx, x, top, w, Math.max(4, bot - top), Math.min(8, w / 2)); ctx.fill();
    if (n === act && n.tot > 0) { ctx.globalAlpha = .9; ctx.fillStyle = col.ok; const hgt = (bot - top) * Math.min(1, n.in / Math.max(.01, n.end - n.start - n.skip)); rr(ctx, x, bot - hgt, w, hgt, Math.min(8, w / 2)); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (bot - top > 16 && bot > 14) { ctx.fillStyle = '#fff'; ctx.font = `800 ${w < 22 ? 9 : 11}px Manrope, system-ui`; ctx.fillText(n.w ? n.w.trim().slice(0, 6) : nm(n.m), x + w / 2, n === act ? top + 14 : bot - 5); } // у звучащей ноты подпись сверху: снизу точка голоса
  }
  // линия касания
  ctx.globalAlpha = 1; ctx.fillStyle = col.ink; ctx.fillRect(0, yLine - 2, W, 2);
  // клавиатура
  const vk = GS.voice == null ? null : Math.round(GS.voice);
  const lit = (m, base) => m === vk ? (GS.voiceHit ? col.ok : col.accent) : act && act.m === m ? col.soft : base;
  for (let m = GS.lo; m <= GS.hi; m++) if (!key[m].b) {
    ctx.fillStyle = lit(m, '#fff'); ctx.fillRect(key[m].x, yLine, key[m].w, KH); ctx.strokeStyle = col.muted; ctx.lineWidth = .6; ctx.strokeRect(key[m].x + .3, yLine, key[m].w - .6, KH);
    const used = tl.some(n => n.m === m);
    if (used || m % 12 === 0) { ctx.fillStyle = m === vk ? '#fff' : used ? col.ink : col.muted; ctx.font = `${used ? 800 : 600} ${GS.ww < 24 ? 9 : 11}px Manrope, system-ui`; ctx.fillText(nm(m), key[m].c, H - 8); }
  }
  for (let m = GS.lo; m <= GS.hi; m++) if (key[m].b) {
    ctx.fillStyle = lit(m, '#2B231E'); rr(ctx, key[m].x, yLine, key[m].w, KH * .6, 3); ctx.fill();
    if (tl.some(n => n.m === m)) { ctx.fillStyle = '#fff'; ctx.font = '800 8px Manrope, system-ui'; ctx.fillText(nm(m).replace(/[^#]+#/, '#'), key[m].c, yLine + KH * .6 - 5); }
  }
  // точка голоса над клавишами: левее/правее центра клавиши = ниже/выше
  if (GS.voice != null) {
    const x = voiceX(GS.voice);
    ctx.fillStyle = GS.voiceHit ? col.ok : col.accent; ctx.beginPath(); ctx.arc(x, yLine - 9, 7, 0, 7); ctx.fill(); ctx.strokeStyle = col.card; ctx.lineWidth = 2; ctx.stroke();
  }
  // слова текущей строки
  const cur = act || tl.find(n => n.start > now) || tl[tl.length - 1], line = GS.lines[GS.ph[cur.i]];
  ctx.textAlign = 'center'; ctx.fillStyle = col.ink; ctx.font = '700 15px Lora, serif';
  if (line) { let t = line; while (ctx.measureText(t).width > W - 80 && t.length > 4) t = t.slice(0, -2); ctx.globalAlpha = .9; ctx.fillText(t === line ? t : t + '...', W / 2, 22); ctx.globalAlpha = 1; }
  // счёт и всплывашки
  const doneN = tl.filter(n => n.done), acc = doneN.length ? Math.round(100 * doneN.reduce((a, n) => a + n.score, 0) / doneN.length) : 0;
  ctx.textAlign = 'left'; ctx.font = '800 14px Manrope, system-ui'; ctx.fillStyle = col.ink;
  if (GS.mode === 'live') { ctx.fillText(acc + '%', 10, 46); if (GS.combo > 1) { ctx.fillStyle = col.accent; ctx.fillText('×' + GS.combo, 10, 64); } }
  ctx.textAlign = 'center'; ctx.font = '800 16px Manrope, system-ui';
  GS.pops = GS.pops.filter(p => now - p.t < 1 && now >= p.t);
  for (const p of GS.pops) { ctx.globalAlpha = 1 - (now - p.t); ctx.fillStyle = p.good ? col.ok : col.bad; ctx.fillText(p.text, p.x, yLine - 26 - (now - p.t) * 30); }
  ctx.globalAlpha = 1;
  if (now < 0 && GS.mode !== 'idle') { ctx.font = '800 48px Lora, serif'; ctx.fillStyle = col.accent; ctx.fillText(String(Math.ceil(-now)), W / 2, yLine / 2 + 16); }
  if (GS.mode === 'idle' && now < 0) { ctx.font = '600 13px Manrope, system-ui'; ctx.fillStyle = col.muted; ctx.fillText('Нота коснулась клавиш - пой её', W / 2, yLine - 40); }
  ctx.textAlign = 'left';
}
export const sgameNoteScore = n => n.tot > 0 ? Math.min(1, (n.in / n.tot) / .8) : 0;
// шаг живой игры (общий для микрофона и теста sim_songs.py): m - спетая нота MIDI (дробная) или null
export function sgameStep(now, dt, m) {
  const act = GS.tl.find(n => now >= n.start && now < n.end);
  const near = act || GS.tl.find(n => n.start > now) || GS.tl[GS.tl.length - 1];
  GS.voice = m == null ? null : octLock(GS, m, near.m, !!act && now > act.start + .1);
  GS.voiceHit = false;
  // окно засчёта ноты сдвинуто на SGAME_LAG позже: живой голос отстаёт от касания на долю секунды
  for (const n of GS.tl) if (!n.done && now > n.start + n.skip && now < n.end + SGAME_LAG) {
    n.tot += dt;
    if (GS.voice != null && Math.abs(GS.voice - n.m) * 100 <= SGAME_TOL) { n.in += dt; GS.voiceHit = true; }
  }
  for (const n of GS.tl) if (!n.done && now >= n.end + SGAME_LAG) {
    n.done = true; n.score = sgameNoteScore(n);
    const good = n.score >= .5; GS.combo = good ? GS.combo + 1 : 0; GS.maxCombo = Math.max(GS.maxCombo, GS.combo);
    GS.pops.push({ t: now, x: GS.key[n.m].c, good, text: good ? (n.score >= .95 ? 'Идеально!' : 'Есть!') : 'Мимо' });
  }
}
export function sgameReset() {
  cancelAnimationFrame(GS.raf); stopAll();
  GS.tl.forEach(n => Object.assign(n, { in: 0, tot: 0, done: false, score: 0 }));
  Object.assign(GS, { pops: [], combo: 0, maxCombo: 0, voice: null, voiceHit: false, oct: null, octBuf: [] });
}
function countIn() {
  const c = ac(), t = c.currentTime + .1, m0 = GS.tl[0].m;
  stopAll(); [0, 4, 7].forEach(x => tone(m0 + x, t, 1.2, .05)); tone(m0, t, 1.4, .2);
  for (let i = 0; i < 3; i++) click(t + 1.6 + i * .6, i === 0);
  return t + 1.6 + 3 * .6;
}
// поле целиком на экране: сверху место под шапку, снизу - под меню вкладок
function toStage() { const st = GS && GS.cv.parentElement; if (!st) return; const r = st.getBoundingClientRect(); if (r.top < 60 || r.bottom > window.innerHeight - 90) window.scrollTo({ top: window.scrollY + r.top - 64, behavior: 'smooth' }); }
function btns() {
  const b = $('#sgplay'), p = $('#sgprev'), on = GS && GS.mode !== 'idle';
  if (b) b.innerHTML = GS && GS.mode === 'live' ? ICON.stop + ' Стоп' : ICON.play + (GS && GS.res ? ' Ещё раз' : ' Играть');
  if (p) { p.innerHTML = GS && GS.mode === 'preview' ? ICON.stop + ' Стоп' : 'Послушать'; p.disabled = on && GS.mode !== 'preview'; }
}
// послушать: ноты падают, пианино играет их в момент касания; микрофон выключен
export function sgamePreview() {
  if (!GS) return;
  if (GS.mode === 'preview') { sgameReset(); GS.mode = 'idle'; sgameDraw(-1.5); btns(); return; }
  if (GS.mode !== 'idle') return;
  const c = ac(); sgameReset(); GS.mode = 'preview'; toStage();
  const t0 = countIn();
  GS.tl.forEach(n => tone(n.m, t0 + n.start, n.end - n.start));
  btns();
  const loop = () => { if (!GS || GS.mode !== 'preview') return; const now = c.currentTime - t0; sgameDraw(now); if (now < GS.D + .6) GS.raf = requestAnimationFrame(loop); else { GS.mode = 'idle'; sgameDraw(-1.5); btns(); } };
  loop();
}
export async function sgamePlay() {
  if (!GS) return;
  if (GS.mode === 'live') { sgameFinish(true); return; }
  if (GS.mode === 'preview') { sgameReset(); GS.mode = 'idle'; }
  let stream; try { stream = await openMic(); } catch (e) { toast('Нет доступа к микрофону. Можно нажать «Послушать» и подпевать.'); return; }
  if (!GS) { stream.getTracks().forEach(t => t.stop()); afterMic(); return; }
  const c = ac(); sgameReset(); GS.mode = 'live'; GS.stream = stream; GS.res = null; setBusy(true); toStage();
  const an = c.createAnalyser(); an.fftSize = 4096; c.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize), hist = [];
  const t0 = countIn(); let last = c.currentTime - t0;
  camRecStart('#sgcv', `${profName() ? profName() + ' · ' : ''}${GS.title}`, stream);
  btns(); const r = $('#sgres'); if (r) r.innerHTML = '';
  const loop = () => {
    if (!GS || GS.mode !== 'live') return;
    const now = c.currentTime - t0, dt = Math.min(.1, Math.max(0, now - last)); last = now;
    an.getFloatTimeDomainData(buf); hist.push(VA.livePitch(buf, c.sampleRate)); if (hist.length > 3) hist.shift();
    const v = hist.filter(x => x != null); sgameStep(now, dt, v.length >= 2 ? VA.median(v) : null);
    sgameDraw(now);
    if (now < GS.D + .4) GS.raf = requestAnimationFrame(loop); else sgameFinish(false);
  };
  loop();
}
export function sgameFinish(aborted) {
  if (!GS) return;
  cancelAnimationFrame(GS.raf);
  if (GS.stream) { GS.stream.getTracks().forEach(t => t.stop()); GS.stream = null; afterMic(); }
  const wasLive = GS.mode === 'live'; GS.mode = 'idle'; setBusy(false);
  if (!wasLive) { btns(); return; }
  GS.tl.forEach(n => { if (!n.done) { n.done = true; n.score = sgameNoteScore(n); } });
  const pct = Math.round(100 * GS.tl.reduce((a, n) => a + n.score, 0) / GS.tl.length), hits = GS.tl.filter(n => n.score >= .5).length;
  camRecStop(aborted ? '' : pct + '% нот', aborted);
  if (aborted) { sgameReset(); sgameDraw(-1.5); btns(); return; }
  // промахи по нотам: какие ноты чаще всего мимо
  const miss = {}; GS.tl.forEach(n => { if (n.score < .5) miss[nm(n.m)] = (miss[nm(n.m)] || 0) + 1; });
  GS.res = { pct, hits, total: GS.tl.length, maxCombo: GS.maxCombo, hit: GS.tl.map(n => n.score >= .5), miss: Object.entries(miss).sort((a, b) => b[1] - a[1]).slice(0, 4) };
  sgameDraw(GS.D + 1); btns();
  if (GS.onDone) GS.onDone(GS.res);
}
export function sgameStop() {
  if (!GS) return;
  cancelAnimationFrame(GS.raf);
  if (GS.stream) { GS.stream.getTracks().forEach(t => t.stop()); GS.stream = null; afterMic(); setBusy(false); if (GS.mode === 'live') camRecStop('', true); }
  if (GS.mode === 'preview') stopAll();
  GS = null;
}
// установщики для моста window (переходный период, см. main.js)
export function __set_GS(v) { GS = v; }

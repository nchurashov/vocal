import { act } from '../core/actions.js';
import { VA } from '../core/analysis.js';
import { MIC_DIRECT, ac, afterMic, base, noteShort, openMic, stopAll, strictOct, tone } from '../core/audio.js';
import { afterHooks, render } from '../core/router.js';
import { save, state } from '../core/store.js';
import { toast } from '../core/ui.js';
import { $, ICON, esc, nowLocal, plural, setBusy } from '../core/util.js';
import { camOn, camRecStop, camRecording, camSession, camStart, camToggleHTML } from './cam.js';
import { lastRange } from './register.js';
import { sgamePlay, sgamePreview, sgameSetup, sgameStop } from './songgame.js';
import { phraseNotes, phraseWords, songScorer, songTargets } from './songlib.js';
import { shiftText, songById, songRoll, songShiftOf, songTempo, songWin } from './songs.js';

// ===== Песня на пианино (#keys-<id>): фраза на клавишах с линией голоса, «Целиком» по нотам и «Игра» (ноты падают на клавиши, songgame.js).
// Пришло из соседней ветки параллельно с «Шариком» и караоке - сохранено целиком. Режим - settings.skMode, прогресс - тот же state.songs[id].
const prog = id => ((state.songs ||= {})[id] ||= { ph: {}, whole: 0, plays: 0 });
const learned = s => { const p = (state.songs || {})[s.id]; return p ? s.ph.filter((_, k) => (p.ph[k] || 0) >= 80).length : 0; };
const nm = m => VA.noteName(m);
export let SK = null;
export function skStop() {
  sgameStop();
  if (!SK) return;
  (SK.timers || []).forEach(clearTimeout); SK.timers = []; stopAll(); SK.playing = false; SK.win = null; cancelAnimationFrame(SK.raf);
  if (SK.stream) { SK.stream.getTracks().forEach(t => t.stop()); SK.stream = null; afterMic(); }
  setBusy(false);
}
// --- фраза на клавишах: слева клавиатура (строка = полутон), справа ноты фразы полосами по времени,
// поверх - линия твоего голоса. Голос по каждой ноте рисуется в её же столбце: видно, выше или ниже ты пел.
// T - цели (songTargets фразы), o.hit - засчитаны ли цели, o.tr[q] - кадры голоса, пока пел цель q,
// o.j - цель, которую ждём сейчас, o.cur - где голос прямо сейчас, o.play - нота, которую играет пианино
const isBlk = m => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
export function songKeys(notes, T, sh, o = {}) {
  if (!notes.length) return '';
  const tm = T.map(x => x.m + sh), lo = Math.min(...tm) - 2, hi = Math.max(...tm) + 2, RH = hi - lo > 14 ? 13 : 17;
  const W = 360, KW = 50, H = (hi - lo + 1) * RH, t0 = notes[0].t, t1 = Math.max(...notes.map(n => n.t + n.d));
  const px = t => KW + 6 + (t - t0) / (t1 - t0 || 1) * (W - KW - 12), yc = m => (hi - m + .5) * RH;
  const tq = []; T.forEach((g, q) => g.idx.forEach(i => { tq[i] = q; }));
  const cur = o.cur == null ? null : Math.round(o.cur), used = new Set(tm), playM = o.play == null ? null : notes[o.play].m + sh;
  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;background:var(--card);border:1px solid var(--line);border-radius:12px" role="img" aria-label="Ноты фразы на клавишах: ${esc(T.map(g => nm(g.m + sh)).join(' '))}">`;
  for (let m = hi; m >= lo; m--) {
    const y = (hi - m) * RH, lit = m === cur || m === playM;
    if (used.has(m)) s += `<rect x="${KW}" y="${y}" width="${W - KW}" height="${RH}" fill="var(--accent-soft)" opacity=".55"/>`;
    else if (isBlk(m)) s += `<rect x="${KW}" y="${y}" width="${W - KW}" height="${RH}" fill="var(--line)" opacity=".45"/>`;
    s += `<rect x="0" y="${y}" width="${KW}" height="${RH}" fill="${lit && !isBlk(m) ? 'var(--accent)' : '#fff'}" stroke="var(--line)" stroke-width=".8"/>`;
    if (isBlk(m)) s += `<rect x="0" y="${y + 1.5}" width="20" height="${RH - 3}" rx="2" fill="${lit ? 'var(--accent)' : '#2B231E'}"/>`;
    s += `<text x="${KW - 4}" y="${y + RH / 2 + 3.6}" text-anchor="end" font-size="${RH > 14 ? 10.5 : 9.5}" font-weight="${used.has(m) || lit ? 800 : 500}" fill="${lit && !isBlk(m) ? '#fff' : used.has(m) ? '#2B231E' : '#8A7E76'}" font-family="Manrope,system-ui">${nm(m)}</text>`;
  }
  s += `<line x1="${KW}" x2="${KW}" y1="0" y2="${H}" stroke="var(--muted)" stroke-width="1"/>`;
  notes.forEach((n, i) => {
    const q = tq[i], m = n.m + sh, done = o.hit && o.hit[q] != null && (o.final || o.hit[q]);
    const fill = done ? (o.hit[q] ? 'var(--ok)' : 'var(--bad)') : 'var(--accent)';
    const now = (o.j === q && !o.final) || o.play === i;
    s += `<rect x="${(px(n.t) + 1).toFixed(1)}" y="${(yc(m) - RH / 2 + 2.5).toFixed(1)}" width="${Math.max(5, px(n.t + n.d) - px(n.t) - 3).toFixed(1)}" height="${RH - 5}" rx="${(RH - 5) / 2}" fill="${fill}" opacity="${done || now || !o.tr ? .9 : .45}"${now ? ' stroke="var(--ink)" stroke-width="1.5"' : ''}/>`;
  });
  // голос: в столбце своей цели, по порядку кадров; сложен в октаву цели (кроме строгого режима)
  if (o.tr) T.forEach((x, q) => {
    const fr = o.tr[q]; if (!fr || !fr.length) return;
    const a = x.idx[0], b = x.idx[x.idx.length - 1], xa = px(notes[a].t) + 2, xb = Math.max(xa + 8, px(notes[b].t + notes[b].d) - 2);
    const N = Math.min(40, fr.length), pts = [];
    for (let k = 0; k < N; k++) {
      const v = fr.slice(Math.floor(k * fr.length / N), Math.floor((k + 1) * fr.length / N)).filter(m => m != null);
      pts.push(v.length ? Math.max(lo - .4, Math.min(hi + .4, VA.median(v))) : null);
    }
    let d = '', pen = false;
    pts.forEach((m, k) => { if (m == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${(xa + (N > 1 ? k / (N - 1) : .5) * (xb - xa)).toFixed(1)} ${yc(m).toFixed(1)}`; pen = true; });
    if (d) s += `<path d="${d}" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  return s + '</svg>';
}
// подсказка по промахам: «Ре - ниже на полутон», «До - не услышал»
export function songMissText(T, hit, tr, sh) {
  const out = [];
  T.forEach((x, q) => {
    if (hit[q]) return;
    const v = (tr[q] || []).filter(m => m != null), t = x.m + sh;
    if (v.length < 4) { out.push(`${nm(t)} - не услышал`); return; }
    const d = VA.median(v) - t, n = Math.round(Math.abs(d));
    out.push(Math.abs(d) <= .5 ? `${nm(t)} - попал, но мало держал` : `${nm(t)} - ${d > 0 ? 'выше' : 'ниже'} на ${n === 1 ? 'полутон' : n + ' ' + plural(n, 'полутон', 'полутона', 'полутонов')}`);
  });
  return out.slice(0, 3).join(', ') + (out.length > 3 ? '...' : '');
}
export function skPlayNotes(notes, shift, tempo, when) {
  const c = ac(), t0 = when ?? c.currentTime + .1, s0 = notes[0].t;
  for (const n of notes) tone(n.m + shift, t0 + (n.t - s0) / tempo, Math.max(.12, n.d / tempo * .95), .2);
  return t0 + Math.max(...notes.map(n => (n.t - s0 + n.d) / tempo));
}

// --- разучивание
export function viewSongKeys(id) {
  skStop();
  const s = songById(id);
  SK = { s, k: 0, mode: MIC_DIRECT && ['whole', 'game'].includes(state.settings.skMode) ? state.settings.skMode : 'phrase', res: {}, timers: [], tries: 0 };
  const p = (state.songs || {})[s.id]; if (p) { const k = s.ph.findIndex((_, i) => (p.ph[i] || 0) < 80); SK.k = k < 0 ? 0 : k; }
  afterHooks.push(skDraw); afterHooks.push(() => { if (camOn()) camStart(); });
  const sh = songShiftOf(s), ms = s.notes.map(n => n.m), r = lastRange(), tp = songTempo();
  return `<button class="back" ${act('go', `song-${s.id}`)}>${ICON.back} ${esc(s.title)}</button><h1>Пианино</h1>
    <p class="muted" style="margin:6px 0 0">${s.ph.length} ${plural(s.ph.length, 'фраза', 'фразы', 'фраз')} · ${noteShort(Math.min(...ms) + sh)} - ${noteShort(Math.max(...ms) + sh)}${s.by ? ' · ' + esc(s.by) : ''}</p>
    <div class="card sec stack" style="padding:12px 14px">
      <div class="row" style="gap:8px"><span class="small" style="flex:1">Тональность: <b>${shiftText(sh)}</b></span>
        <button class="iconbtn" ${act('skShiftBy', -1)} title="Ниже">−</button><button class="iconbtn" ${act('skShiftBy', 1)} title="Выше">+</button></div>
      <div class="tiny muted" style="margin-top:-6px">${r ? `Подобрал под твой диапазон ${noteShort(songWin()[0])} - ${noteShort(songWin()[1])}.` : `Подобрал рядом с ${noteShort(base())}. <a href="#range">Замерь диапазон</a>, чтобы песня встала точно под голос.`} Неудобно - сдвинь на полутон.</div>
      <div class="seg"><button class="${tp < 1 ? 'on' : ''}" ${act('skSetTempo', .75)}>Медленно</button><button class="${tp >= 1 ? 'on' : ''}" ${act('skSetTempo', 1)}>Как в песне</button></div>
      ${MIC_DIRECT ? `<div class="seg"><button class="${SK.mode === 'phrase' ? 'on' : ''}" ${act('skSetMode', 'phrase')}>По фразам</button><button class="${SK.mode === 'whole' ? 'on' : ''}" ${act('skSetMode', 'whole')}>Целиком</button><button class="${SK.mode === 'game' ? 'on' : ''}" ${act('skSetMode', 'game')}>Игра</button></div>
      <div class="tiny muted" style="margin-top:-6px">${SK.mode === 'phrase' ? 'Пианино играет фразу, потом тишина: повтори. Чисто - идём дальше, нет - ещё раз.' : SK.mode === 'game' ? 'Ноты падают на клавиши пианино. Нота коснулась клавиш - пой её. Голос зажигает клавишу: зелёная - попал.' : 'Пианино даёт первую ноту, дальше поёшь всю песню сам, без подсказки. Микрофон идёт за тобой по нотам.'}</div>` : '<div class="tiny muted">Здесь микрофон закрыт: можно слушать фразы и подпевать. Проверка нот - на сайте или в приложении.</div>'}
    </div>
    ${camToggleHTML()}
    <div id="sgbox" class="sec"></div>
`;
}
export function skShiftBy(d) { const s = SK && SK.s; if (!s) return; prog(s.id).shift = songShiftOf(s) + d; save(); render(); }
export function skSetTempo(v) { state.settings.songTempo = v; save(); render(); }
export function skSetMode(m) { state.settings.skMode = m; save(); render(); }
export function skGoPhrase(k) { if (!SK) return; skPause(); SK.k = k; SK.tries = 0; skDraw(); }
export function skNext() { if (!SK) return; skPause(); SK.tries = 0; if (SK.k < SK.s.ph.length - 1) SK.k++; skDraw(); }
function skPause() { if (!SK) return; (SK.timers || []).forEach(clearTimeout); SK.timers = []; stopAll(); SK.playing = false; SK.win = null; SK.play = null; }
const skLine = (s, notes, sh) => esc(phraseWords(notes)) || notes.map(n => nm(n.m + sh)).join(' ');
function skChips() {
  const s = SK.s, p = (state.songs || {})[s.id] || { ph: {} };
  return `<div class="row wrap" style="gap:6px">${s.ph.map((_, k) => { const v = p.ph[k]; return `<button class="chip ${v >= 80 ? 'ok' : v ? 'near' : ''}" style="border:${k === SK.k && SK.mode === 'phrase' ? '2px solid var(--accent)' : '0'}" ${act('skGoPhrase', k)}>${k + 1}${v >= 80 ? ' ✓' : v ? ' ' + v + '%' : ''}</button>`; }).join('')}</div>`;
}
// клавиши текущей фразы: итог прошлой попытки, живой голос или нота, которую играет пианино
function skKeysNow() {
  const s = SK.s, sh = songShiftOf(s), notes = phraseNotes(s, SK.k), w = SK.win, r = SK.res[SK.k];
  if (w && w.tr) return songKeys(notes, w.T, sh, { hit: w.S.hit, tr: w.tr, j: w.S.j, cur: w.cur });
  if (SK.playing && SK.play != null) return songKeys(notes, songTargets(notes), sh, { play: SK.play });
  return r ? songKeys(notes, songTargets(notes), sh, { hit: r.hit, tr: r.tr, final: true }) : songKeys(notes, songTargets(notes), sh);
}
function skKeysDraw() { const el = $('#sgkeys'); if (el && SK && SK.mode === 'phrase') el.innerHTML = skKeysNow(); }
export function skDraw() {
  const box = $('#sgbox'); if (!box || !SK || !SK.s) return;
  const s = SK.s, sh = songShiftOf(s);
  if (SK.mode === 'game') {
    const p = (state.songs || {})[s.id];
    box.innerHTML = `<div class="card stack" style="padding:10px"><div class="tiny muted">Вся песня, ноты падают сверху${p && p.game ? ` · лучший результат ${p.game}%` : ''}</div>
      <div class="gstage"><canvas id="sgcv"></canvas></div>
      <div class="row"><button class="btn" style="flex:1" id="sgplay" ${act('skGamePlay')}>${ICON.play} Играть</button><button class="btn ghost" id="sgprev" ${act('skGamePreview')}>Послушать</button></div>
      <div class="tiny muted">Пока играешь, пианино молчит: прозвучит только первая нота и отсчёт. Точка над клавишами - твой голос: левее центра клавиши - ниже, правее - выше. Лучше в наушниках.</div>
      <div id="sgres"></div></div>
      <div class="sec">${skChips()}</div>`;
    sgameSetup(s, sh, songTempo(), skGameDone);
    return;
  }
  if (SK.mode === 'whole') {
    const p = (state.songs || {})[s.id], r = SK.res.whole;
    box.innerHTML = `<div class="card stack"><div class="tiny muted">Вся песня${p && p.whole ? ` · лучший результат ${p.whole}%` : ''}</div>
      <div id="sgline" style="font:700 22px Lora,serif;min-height:30px">${SK.playing ? '' : skLine(s, phraseNotes(s, 0), sh)}</div><div id="sgnext" class="small muted" style="min-height:20px"></div>
      <div id="sgnow" class="small muted" style="min-height:20px">${SK.playing ? '' : 'Нажми «Начать»: прозвучит первая нота, и пой.'}</div>
      ${songRoll(s.notes, r ? r.hitNotes : null, sh)}
      ${r ? `<div class="score"><div class="s"><b>${r.pct}%</b><span class="small muted">нот чисто</span></div><div class="s"><b>${r.n}/${r.total}</b><span class="small muted">нот</span></div></div>` : ''}
      <button class="btn block" ${act('skPlay')}>${SK.playing ? ICON.stop + ' Готово' : ICON.play + (r ? ' Ещё раз' : ' Начать')}</button></div>
      <div class="sec">${skChips()}</div>`;
    return;
  }
  const notes = phraseNotes(s, SK.k), r = SK.res[SK.k];
  box.innerHTML = `<div class="card stack"><div class="tiny muted">Фраза ${SK.k + 1} из ${s.ph.length}</div>
    <div style="font:700 22px Lora,serif">${skLine(s, notes, sh)}</div>
    ${phraseWords(notes) ? `<div class="small muted">${notes.map(n => nm(n.m + sh)).join(' ')}</div>` : ''}
    <div id="sgkeys" style="max-width:480px">${skKeysNow()}</div>
    <div class="tiny muted">${r ? 'Зелёные - попал, красные - мимо. Линия - твой голос: выше полосы - поёшь выше, ниже - ниже.' : 'Полосы - ноты фразы на клавишах. Когда поёшь, линия покажет, где твой голос.'}</div>
    <div id="sgnow" class="small" style="min-height:20px">${r ? (r.ok ? `<b style="color:var(--ok)">Чисто: ${r.nn} из ${r.nt} нот</b>` : `<b style="color:var(--near)">${r.nn} из ${r.nt} нот.</b> ${esc(r.miss || '')}`) : ''}</div>
    <div class="row"><button class="btn" style="flex:1" id="sgplay" ${act('skPlay')}>${SK.playing ? ICON.stop + ' Пауза' : ICON.play + (MIC_DIRECT ? (r ? ' Ещё раз' : ' Начать') : ' Послушать')}</button><button class="btn ghost" ${act('skNext')}>Дальше ›</button></div></div>
    <div class="sec">${skChips()}</div>`;
}
// итог песни-игры: лучший результат, фразы засчитываются как в «Целиком» (спета в игре - выучена)
function skGameDone(r) {
  if (!SK || !SK.s) return;
  const s = SK.s, p = prog(s.id); p.plays = (p.plays || 0) + 1; p.last = nowLocal();
  const rec = r.pct > (p.game || 0); p.game = Math.max(p.game || 0, r.pct);
  s.ph.forEach((a, k) => { const b = k + 1 < s.ph.length ? s.ph[k + 1] : s.notes.length; let n = 0; for (let i = a; i < b; i++) if (r.hit[i]) n++; p.ph[k] = Math.max(p.ph[k] || 0, Math.round(100 * n / (b - a))); });
  save();
  const el = $('#sgres'); if (!el) return;
  el.innerHTML = `<div class="stack" style="text-align:center;margin-top:6px"><div style="font:600 34px Lora,serif">${r.pct}%</div>
    <div class="small muted">нот попал: ${r.hits} из ${r.total} · лучшая серия ${r.maxCombo}${rec && r.pct ? ' · новый рекорд!' : ''}</div>
    ${r.miss.length ? `<div class="small">Чаще мимо: ${r.miss.map(([n, k]) => `${n}${k > 1 ? ' ×' + k : ''}`).join(', ')}</div>` : '<div class="small" style="color:var(--ok)"><b>Все ноты чисто!</b></div>'}
    ${r.pct < 50 ? `<div class="note small">Сложно с ходу - включи «Медленно» или разучи трудные места «По фразам».</div>` : ''}</div>`;
  const ch = $('#sgbox .sec'); if (ch) ch.innerHTML = skChips();
}
// микрофон: открывается один раз на всё занятие
export async function skEnsureMic() {
  if (SK.stream) return true;
  let stream; try { stream = await openMic(); } catch (e) { toast('Нет доступа к микрофону. Можно слушать и подпевать без проверки.'); return false; }
  const c = ac(); SK.stream = stream; setBusy(true);
  const an = c.createAnalyser(); an.fftSize = 4096; c.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize), hist = [];
  const loop = () => {
    if (!SK || !SK.stream) return;
    an.getFloatTimeDomainData(buf);
    hist.push(VA.livePitch(buf, c.sampleRate)); if (hist.length > 3) hist.shift();
    const v = hist.filter(x => x != null), m = v.length >= 2 ? VA.median(v) : null;
    skFrame(c.currentTime, m);
    SK.raf = requestAnimationFrame(loop);
  };
  loop();
  return true;
}
// один кадр голоса (живой микрофон или тест): идёт в проверку, только пока открыто окно ответа
export function skFrame(now, m) {
  const w = SK && SK.win; if (!w || now < w.t0 || now > w.t1) return;
  // кадр голоса - в столбец ноты, которую сейчас поёшь (хвост засчитанной - к ней же), сложен в её октаву
  // (или к одной из 2 следующих, если голос ближе к ней, как и проверка); паузы - один разрыв линии
  const j0 = w.S.j, sh = songShiftOf(SK.s), fold = (v, q) => { const t = w.T[q].m + sh; return strictOct() ? v : v - 12 * Math.round((v - t) / 12); };
  const dist = q => m == null || q < 0 || q >= w.T.length ? 99 : Math.abs(fold(m, q) - (w.T[q].m + sh));
  let q = dist(j0 - 1) <= .5 ? j0 - 1 : j0;
  if (q === j0) for (let k = j0 + 1, b = Math.min(1.5, dist(j0)); k < j0 + 3; k++) if (dist(k) < b) { q = k; b = dist(k); } // ближе к следующей ноте - это попытка спеть её
  w.S.push(now, m);
  if (w.tr && q < w.T.length) {
    const col = w.tr[q], v = m == null ? null : fold(m, q);
    if (v != null || (col.length && col[col.length - 1] != null)) col.push(v);
    w.cur = v;
    if (now - (w.drawn || 0) > .08) { w.drawn = now; skKeysDraw(); }
  }
  const el = $('#sgnow'); if (el) el.textContent = m == null ? (SK.mode === 'whole' ? 'Пой' : 'Твоя очередь') : 'Слышу ' + nm(m);
  if (SK.mode === 'whole') skFollow(w);
  if (w.S.j >= w.T.length && !w.early) { w.early = true; skAt(.5, skFinish); } // всё спето - не ждём конца окна
}
// «Целиком»: строчка, на которой сейчас поёшь, по засчитанным нотам
function skFollow(w) {
  const s = SK.s, sh = songShiftOf(s), ni = w.S.j < w.T.length ? w.T[w.S.j].idx[0] : s.notes.length - 1;
  let k = 0; while (k + 1 < s.ph.length && s.ph[k + 1] <= ni) k++;
  if (w.line === k) return; w.line = k;
  const a = $('#sgline'), b = $('#sgnext');
  if (a) a.innerHTML = skLine(s, phraseNotes(s, k), sh);
  if (b) b.innerHTML = k + 1 < s.ph.length ? skLine(s, phraseNotes(s, k + 1), sh) : '';
}
const skAt = (sec, f) => SK.timers.push(setTimeout(() => { if (SK && SK.playing) f(); }, sec * 1000 / (window.SONG_SPEED || 1)));
export const skPanel = () => { const s = SK && SK.s; if (!s) return { big: '' }; const notes = SK.mode === 'whole' ? null : phraseNotes(s, SK.k); return { top: `Песня · ${s.title}`, big: notes ? phraseWords(notes) || notes.map(n => nm(n.m + songShiftOf(s))).join(' ') : ($('#sgline') || {}).textContent || '', sub: ($('#sgnow') || {}).textContent || '' }; };
export async function skPlay() {
  if (!SK || !SK.s) return;
  if (SK.playing) { if (SK.mode === 'whole' && SK.win) { skFinish(); return; } skPause(); skDraw(); return; }
  const s = SK.s, sh = songShiftOf(s), tp = songTempo();
  if (MIC_DIRECT) await skEnsureMic();
  if (camOn() && !camRecording() && SK.stream) await camSession('Песня', skPanel, SK.stream);
  const c = ac(), t0 = c.currentTime + .15;
  SK.playing = true; skDraw();
  const say = t => { const el = $('#sgnow'); if (el) el.textContent = t; };
  if (SK.mode === 'whole') {
    // первая нота (и аккорд-опора), потом окно на всю песню с запасом
    const m0 = s.notes[0].m + sh;
    [0, 4, 7].forEach(x => tone(m0 + x, t0, 1.2, .05)); tone(m0, t0, 1.4, .2);
    const dur = (s.notes[s.notes.length - 1].t + s.notes[s.notes.length - 1].d - s.notes[0].t) / tp;
    const w0 = t0 + 1.7, w1 = w0 + dur * 1.6 + 4, T = songTargets(s.notes, tp);
    say('Первая нота: ' + nm(m0));
    skAt(w0 - t0, () => { SK.win = { t0: w0, t1: w1, T, S: songScorer(T, strictOct(), sh), line: -1 }; say('Пой!'); skFollow(SK.win); });
    skAt(w1 - t0 + .05, skFinish);
    return;
  }
  const notes = phraseNotes(s, SK.k);
  say('Слушай');
  const end = skPlayNotes(notes, sh, tp, t0);
  notes.forEach((n, i) => skAt((n.t - notes[0].t) / tp + .15, () => { SK.play = i; skKeysDraw(); }));
  skAt(end - t0 + .1, () => { SK.play = null; skKeysDraw(); });
  if (!SK.stream) { skAt(end - t0 + .3, () => { SK.playing = false; skDraw(); }); return; }
  const w0 = end + .25, w1 = w0 + (end - t0) * 1.3 + 1.5, T = songTargets(notes, tp);
  skAt(w0 - t0, () => { SK.win = { t0: w0, t1: w1, T, S: songScorer(T, strictOct(), sh), tr: T.map(() => []) }; SK.play = null; say('Твоя очередь'); skKeysDraw(); });
  skAt(w1 - t0 + .05, skFinish);
}
// итог окна ответа: сохраняем лучший результат; по фразам - дальше сам (чисто) или ещё раз (до 3 попыток)
export function skFinish() {
  const w = SK && SK.win; if (!w) return;
  SK.win = null; (SK.timers || []).forEach(clearTimeout); SK.timers = [];
  const s = SK.s, r = w.S.result(), hitNotes = [];
  w.T.forEach((x, q) => x.idx.forEach(i => { hitNotes[i] = r.hit[q]; }));
  const p = prog(s.id); p.plays = (p.plays || 0) + 1; p.last = nowLocal();
  if (SK.mode === 'whole') {
    SK.res.whole = { ...r, hitNotes }; p.whole = Math.max(p.whole || 0, r.pct);
    // по фразам тоже засчитываем: фраза спета в песне целиком - она выучена
    s.ph.forEach((_, k) => { const [a, b] = [s.ph[k], k + 1 < s.ph.length ? s.ph[k + 1] : s.notes.length]; let n = 0; for (let i = a; i < b; i++) if (hitNotes[i]) n++; p.ph[k] = Math.max(p.ph[k] || 0, Math.round(100 * n / (b - a))); });
    save(); SK.playing = false; skDraw();
    if (camRecording()) camRecStop(`${r.pct}% нот`);
    return;
  }
  // цели фразы считаются от её первой ноты: hitNotes уже по нотам фразы
  SK.res[SK.k] = { ...r, hitNotes, nn: hitNotes.filter(Boolean).length, nt: hitNotes.length, tr: w.tr, miss: songMissText(w.T, r.hit, w.tr, songShiftOf(s)) };
  p.ph[SK.k] = Math.max(p.ph[SK.k] || 0, r.pct); save();
  SK.tries++;
  const last = SK.k >= s.ph.length - 1;
  if (r.ok && !last) { SK.k++; SK.tries = 0; SK.playing = true; skDraw(); const el = $('#sgnow'); if (el) el.innerHTML = `<b style="color:var(--ok)">Чисто! Следующая фраза...</b>`; skAt(1.6, () => { SK.playing = false; skPlay(); }); SK.playing = true; return; }
  if (!r.ok && SK.tries < 3) { SK.playing = true; skDraw(); skAt(2.8, () => { SK.playing = false; skPlay(); }); SK.playing = true; return; }
  SK.playing = false; skDraw();
  if (r.ok && last) {
    const el = $('#sgnow'); if (el) el.innerHTML = `<b style="color:var(--ok)">Последняя фраза чисто!</b> Теперь попробуй всю песню: переключи на «Целиком».`;
    if (camRecording()) camRecStop(`${learned(s)} из ${s.ph.length} фраз`);
  }
}

export const skGamePlay = () => sgamePlay();
export const skGamePreview = () => sgamePreview();

// установщики для моста window (переходный период, см. main.js)
export function __set_SK(v) { SK = v; }

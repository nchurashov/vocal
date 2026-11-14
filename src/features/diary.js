import { act } from '../core/actions.js';
import { VA } from '../core/analysis.js';
import { ac, afterMic, micTap, noteFull, noteShort, openMic } from '../core/audio.js';
import { afterHooks, render } from '../core/router.js';
import { profName, save, state } from '../core/store.js';
import { toast } from '../core/ui.js';
import { $, ICON, MONTHS, daysBetween, fmtDay, nowLocal, plural, setBusy, ymd } from '../core/util.js';
import { CAM, CAM_OK, camFrame, camOff, camPending, camRound, camShare, camShow, camStart, camWrap, recCanvas } from './cam.js';
import { recBest } from './voice.js';

// ===== Голос: до и после (#diary) =====
// Видео «до»: ответы на вопросы (субтитры под камерой, впечатываются в видео). Через месяц - «после». Потом видео сравнения для соцсетей.
// Метрики только из микрофона: средняя высота речи (медиана тона) и разброс интонаций (от 10-го до 90-го процентиля).
// Видео хранится в IndexedDB этого браузера (никуда не загружается); метаданные - в state.diary.
// вопросы для живой речи: человек думает и отвечает, а не читает. В «до» и «после» одни и те же - сравнение честное
export const DIARY_Q = ['Как тебя зовут и чем ты занимаешься?', 'Расскажи самый смешной случай за последнее время.', 'Что бы ты делал, если бы завтра был свободный день?', 'Чего ты хочешь от своего голоса?'];
export const DIARY_QSEC = 20;
export const DIARY_MAX = 120;
// --- IndexedDB для видео
export function idb() { return new Promise((ok, bad) => { const r = indexedDB.open('vpb', 1); r.onupgradeneeded = () => r.result.createObjectStore('videos'); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); }); }
export async function idbDo(mode, f) { const db = await idb(); return new Promise((ok, bad) => { const tx = db.transaction('videos', mode), st = tx.objectStore('videos'); const r = f(st); tx.oncomplete = () => ok(r && r.result); tx.onerror = () => bad(tx.error); }); }
export const vidPut = (id, blob) => idbDo('readwrite', st => st.put(blob, id));
export const vidGet = id => idbDo('readonly', st => st.get(id));
export const vidDel = id => idbDo('readwrite', st => st.delete(id));
export const diaryList = () => (state.diary ||= []);
export const dateRu = s => { const [, m, d] = s.slice(0, 10).split('-').map(Number); return d + ' ' + MONTHS[m - 1]; };
export const daysSince = d => daysBetween(d.slice(0, 10), ymd());
// метрика речи по кадрам тона (чистая функция, тест: tests/sim_diary.py)
export function speechStats(ms) {
  const v = ms.filter(m => m != null).sort((a, b) => a - b);
  if (v.length < 120) return null; // меньше ~2 с голоса - не считаем
  const q = p => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];
  return { med: Math.round(q(.5) * 10) / 10, p10: Math.round(q(.1) * 10) / 10, p90: Math.round(q(.9) * 10) / 10 };
}
export let DY = null;
export function diaryStop() {
  if (!DY) return; cancelAnimationFrame(DY.raf); clearInterval(DY.tick);
  if (DY.rec) { DY.rec.stop(); DY.rec = null; }
  if (DY.mic) { DY.mic.getTracks().forEach(t => t.stop()); DY.mic = null; afterMic(); }
  if (DY.playing) { DY.playing.forEach(x => { try { x.pause(); } catch (e) { } }); DY.playing = null; }
  setBusy(false);
}
// подсказка на «Сегодня»
export function diaryTodayItem() {
  if (!CAM_OK) return '';
  const L = diaryList(), last = L[L.length - 1];
  if (!L.length) return `<button class="item" ${act('go', 'diary')}><div class="dot near">🎬</div><div class="t"><b>Запиши голос «до»</b><span class="small muted">Полторы минуты на камеру: ответь на 4 вопроса. Через месяц сравнишь и не узнаешь свой голос</span></div><span class="muted">›</span></button>`;
  const d = daysSince(last.date);
  if (d >= 30) return `<button class="item" ${act('go', 'diary')}><div class="dot near">🎬</div><div class="t"><b>Прошёл месяц: запиши голос «после»</b><span class="small muted">Последнее видео ${fmtDay(last.date.slice(0, 10)).toLowerCase()}. Сравни, как изменился голос</span></div><span class="muted">›</span></button>`;
  return '';
}
export function viewDiary() {
  diaryStop(); DY = { mode: 'idle' };
  afterHooks.push(diaryDraw);
  const L = diaryList();
  return `<button class="back" ${act('go', 'today')}>${ICON.back} Сегодня</button><h1>Голос: до и после</h1>
    <p class="muted" style="margin:6px 0 0">Налей бокал и запиши короткое видео: под камерой по очереди появятся ${DIARY_Q.length} вопроса, просто отвечай своими словами. Занимайся по упражнению в день, а через месяц запиши ещё раз. Сравни и покажи друзьям.</p>
    ${CAM_OK ? '' : '<div class="note sec">Для видео нужна камера и микрофон: открой сайт в Safari или Chrome.</div>'}
    <div id="dybox" class="sec"></div>
    ${L.length >= 2 ? diaryCompareHTML(L[0], L[L.length - 1]) : ''}
    <div class="sec"><h2>Мои записи</h2>${L.length ? L.slice().reverse().map(diaryItemHTML).join('') : '<div class="card small muted">Пока нет записей.</div>'}
    <p class="tiny muted">Видео хранятся только в этом браузере на телефоне. Safari может стереть данные сайта, если долго не заходить, поэтому сохрани важные видео в Фото кнопкой «Поделиться». Приложение с экрана «Домой» так не стирает.</p></div>`;
}
export const pitchTxt = s => s ? `${noteShort(s.med)} (${noteFull(s.med).split(' (')[0].toLowerCase()})` : 'мало речи для замера';
export function diaryItemHTML(e) {
  const idx = diaryList().indexOf(e), first = idx === 0;
  return `<div class="card stack" style="margin-bottom:10px"><div class="row between"><b>${first ? 'До' : 'После'} · ${dateRu(e.date)}</b><span class="tiny muted">${Math.round(e.dur)} с</span></div>
    <div class="small">Средняя высота речи: <b>${pitchTxt(e.stats)}</b>${e.stats ? ` · разброс интонаций ${Math.round(e.stats.p90 - e.stats.p10)} ${plural(Math.round(e.stats.p90 - e.stats.p10), 'полутон', 'полутона', 'полутонов')}` : ''}</div>
    <div class="row wrap" style="gap:8px"><button class="btn ghost" style="flex:1;min-height:40px" ${act('diaryPlay', `${e.id}`)}>${ICON.play} Смотреть</button><button class="btn ghost" style="flex:1;min-height:40px" ${act('diaryShare', `${e.id}`)}>Поделиться</button><button class="btn ghost" style="min-height:40px;color:var(--bad)" ${act('diaryDel', `${e.id}`)}>Удалить</button></div></div>`;
}
export function diaryCompareHTML(a, b) {
  const d = daysBetween(a.date.slice(0, 10), b.date.slice(0, 10));
  let m = '';
  if (a.stats && b.stats) {
    const dp = Math.round(b.stats.med - a.stats.med), ra = Math.round(a.stats.p90 - a.stats.p10), rb = Math.round(b.stats.p90 - b.stats.p10), dr = rb - ra;
    m = `<div class="small">Высота речи: ${noteShort(a.stats.med)} → ${noteShort(b.stats.med)} (${dp === 0 ? 'так же' : (dp < 0 ? 'ниже' : 'выше') + ' на ' + Math.abs(dp) + ' ' + plural(Math.abs(dp), 'полутон', 'полутона', 'полутонов')})</div>
      <div class="small">Разброс интонаций: ${ra} → ${rb} ${plural(rb, 'полутон', 'полутона', 'полутонов')} (${dr === 0 ? 'так же' : dr > 0 ? 'речь живее' : 'речь ровнее'})</div>`;
  }
  const best = typeof recBest === 'function' ? recBest('mpt') : null;
  return `<div class="card sec stack"><h3>Сравнение: ${d} ${plural(d, 'день', 'дня', 'дней')}</h3>${m}${best ? `<div class="small">Длинный звук: лучший ${best.sec.toFixed(1)} с</div>` : ''}
    <button class="btn" ${act('diaryMakeCompare')}>🎬 Собрать видео «до и после»</button><div id="dycmp" class="small muted"></div></div>`;
}
export function diaryDraw() {
  const box = $('#dybox'); if (!box || !DY || !CAM_OK) return;
  const L = diaryList(), next = L.length ? 'после' : 'до';
  if (DY.mode === 'idle') {
    const wait = L.length && daysSince(L[L.length - 1].date) < 30 ? 30 - daysSince(L[L.length - 1].date) : 0;
    box.innerHTML = `<div class="card stack">${wait ? `<div class="small">До видео «после» осталось ${wait} ${plural(wait, 'день', 'дня', 'дней')}. Можно записать и раньше, но за месяц разница заметнее.</div>` : ''}
      <button class="btn" ${act('diaryRec')}>🎥 Записать видео «${next}»</button><div class="tiny muted">Будет нужен доступ к камере и микрофону. Около полутора минут: по 20 секунд на вопрос, можно листать быстрее.</div></div>`;
    return;
  }
  if (DY.mode === 'rec') {
    box.innerHTML = `<div class="card stack"><video id="dyprev" muted playsinline autoplay style="width:100%;max-height:44vh;object-fit:cover;border-radius:14px;transform:scaleX(-1);background:#000"></video>
      <div class="row between"><span class="small"><span class="rec-dot"></span> Запись</span><b id="dyt">0 с</b></div>
      <div class="tiny muted">Вопрос <span id="dyqn">1</span> из ${DIARY_Q.length}. Отвечай как в разговоре, своими словами. Можно задуматься - это тоже часть голоса.</div>
      <div id="dyq" style="font:700 21px Lora,serif;line-height:1.35;min-height:58px">${DIARY_Q[0]}</div>
      <div style="height:5px;background:var(--line);border-radius:3px;overflow:hidden"><i id="dyqbar" style="display:block;height:100%;width:0;background:var(--accent)"></i></div>
      <div class="row"><button class="btn ghost" style="flex:1" ${act('diaryNextQ')}>Следующий вопрос ›</button><button class="btn" style="flex:1" ${act('diaryRecStop')}>${ICON.stop} Готово</button></div></div>`;
    const v = $('#dyprev'); if (v && CAM.stream) { v.srcObject = CAM.stream; v.play().catch(() => { }); }
  }
}
// следующий вопрос; после последнего - конец записи
export function diaryNextQ() {
  if (!DY || DY.mode !== 'rec') return;
  if (DY.q >= DIARY_Q.length - 1) return diaryRecStop();
  DY.q++; DY.qT = performance.now();
  if ($('#dyq')) $('#dyq').textContent = DIARY_Q[DY.q]; if ($('#dyqn')) $('#dyqn').textContent = DY.q + 1;
}
export async function diaryRec() {
  if (!(await camStart(true))) { toast('Нет доступа к камере'); return; }
  let mic; try { mic = await openMic(); } catch (e) { toast('Нет доступа к микрофону'); return; }
  DY = { mode: 'rec', mic, ms: [], t0: performance.now(), q: 0, qT: performance.now() }; setBusy(true);
  $('#campv')?.remove();
  const L = diaryList(), title = `${L.length ? 'после' : 'до'} · ${dateRu(ymd())}`;
  const T = micTap(mic), hist = [];
  DY.rec = recCanvas((g, W, H) => {
    camFrame(g, W, H, (profName() ? profName() + ' · ' : '') + 'голос ' + title, null);
    // субтитр: текущий вопрос над плашкой бренда
    const q = DIARY_Q[DY ? DY.q : 0]; g.font = '700 34px Manrope, system-ui, sans-serif'; g.textAlign = 'center';
    const n = camWrap(g, q, W / 2, 0, W - 80, 44, false), bh = n * 44 + 36, by = H - 96 - bh - 24;
    g.fillStyle = 'rgba(0,0,0,.6)'; camRound(g, 24, by, W - 48, bh, 18); g.fill();
    g.fillStyle = '#fff'; camWrap(g, q, W / 2, by + 50, W - 80, 44); g.textAlign = 'left';
  }, mic);
  diaryDraw();
  const loop = () => {
    if (!DY || DY.mode !== 'rec') return;
    DY.raf = requestAnimationFrame(loop);
    const buf = T.read(); hist.push(VA.livePitch(buf, T.c.sampleRate)); if (hist.length > 3) hist.shift();
    const v = hist.filter(x => x != null); DY.ms.push(v.length >= 2 ? VA.median(v) : null);
    const s = Math.floor((performance.now() - DY.t0) / 1000); const el = $('#dyt'); if (el) el.textContent = s + ' с';
    const qe = (performance.now() - DY.qT) / 1000 * (window.DY_SPEED || 1), bar = $('#dyqbar'); if (bar) bar.style.width = Math.min(100, qe / DIARY_QSEC * 100) + '%';
    if (qe >= DIARY_QSEC) diaryNextQ();
    if (s >= DIARY_MAX) diaryRecStop();
  };
  loop();
}
export async function diaryRecStop() {
  if (!DY || DY.mode !== 'rec') return;
  DY.mode = 'saving'; cancelAnimationFrame(DY.raf); camPending();
  const dur = (performance.now() - DY.t0) / 1000, stats = speechStats(DY.ms), rec = DY.rec; DY.rec = null;
  const { blob, ext } = await rec.stop();
  if (DY.mic) { DY.mic.getTracks().forEach(t => t.stop()); DY.mic = null; afterMic(); }
  camOff(); setBusy(false);
  const id = 'd' + Date.now();
  try { await vidPut(id, blob); } catch (e) { toast('Не получилось сохранить видео в памяти браузера'); }
  diaryList().push({ id, date: nowLocal(), dur: Math.round(dur), stats, ext }); save();
  render();
  diaryPlay(id, true);
}
export async function diaryBlob(id) { try { return await vidGet(id); } catch (e) { return null; } }
export async function diaryPlay(id, fresh) {
  const b = await diaryBlob(id); if (!b) { toast('Видео не найдено: браузер мог его стереть'); return; }
  const e = diaryList().find(x => x.id === id), url = URL.createObjectURL(b);
  CAM.clips.push({ blob: b, url, title: 'Голос', autoSave: !!fresh, date: e ? e.date : nowLocal(), ext: (e && e.ext) || (b.type.includes('mp4') ? 'mp4' : 'webm') });
  camShow(CAM.clips[CAM.clips.length - 1]);
}
export async function diaryShare(id) {
  const b = await diaryBlob(id); if (!b) { toast('Видео не найдено'); return; }
  CAM.clips.push({ blob: b, url: URL.createObjectURL(b), date: nowLocal(), ext: b.type.includes('mp4') ? 'mp4' : 'webm' });
  camShare(CAM.clips.length - 1);
}
export async function diaryDel(id) {
  if (!confirm('Удалить это видео? Его нельзя будет вернуть.')) return;
  try { await vidDel(id); } catch (e) { }
  state.diary = diaryList().filter(x => x.id !== id); save(); render();
}
// видео сравнения: сначала «ДО», потом «ПОСЛЕ», с плашками; звук - декодированная дорожка каждого видео
export async function diaryMakeCompare() {
  const L = diaryList(), a = L[0], b = L[L.length - 1], out = $('#dycmp');
  const [ba, bb] = [await diaryBlob(a.id), await diaryBlob(b.id)];
  if (!ba || !bb) { if (out) out.textContent = 'Одно из видео не найдено: браузер мог его стереть.'; return; }
  if (out) out.textContent = 'Собираю видео, это займёт столько же времени, сколько длятся обе записи...';
  camPending(); if ($('#campend b')) $('#campend b').textContent = 'Собираю «до и после»...';
  const c = ac(), dest = c.createMediaStreamDestination();
  const mk = async blob => { const v = document.createElement('video'); v.src = URL.createObjectURL(blob); v.muted = true; v.setAttribute('playsinline', ''); await new Promise(r => { v.onloadeddata = r; setTimeout(r, 4000); }); let buf = null; try { buf = await c.decodeAudioData(await blob.arrayBuffer()); } catch (e) { } return { v, buf }; };
  const A = await mk(ba), B = await mk(bb);
  const labels = [['ДО', a], ['ПОСЛЕ', b]];
  let cur = 0;
  DY = DY || {}; DY.playing = [A.v, B.v];
  const rec = recCanvas((g, W, H) => {
    const v = cur === 0 ? A.v : B.v;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    if (v.videoWidth) { const s = Math.min(W / v.videoWidth, H / v.videoHeight); g.drawImage(v, (W - v.videoWidth * s) / 2, (H - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s); }
    const [lab, e] = labels[cur];
    g.fillStyle = cur === 0 ? 'rgba(122,110,102,.92)' : 'rgba(60,138,90,.94)'; camRound(g, 24, 96, 280, 120, 18); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = '800 50px Lora, Georgia, serif'; g.fillText(lab, 46, 158);
    g.font = '600 24px Manrope, system-ui, sans-serif'; g.fillText(dateRu(e.date), 48, 196);
  }, dest.stream.getAudioTracks());
  const playOne = (X) => new Promise(res => {
    if (X.buf) { const s = c.createBufferSource(); s.buffer = X.buf; s.connect(dest); s.start(); }
    X.v.currentTime = 0; X.v.play().catch(() => { });
    const len = (X.buf ? X.buf.duration : X.v.duration) || 5; setTimeout(res, len * 1000 + 200);
  });
  await playOne(A); cur = 1; await playOne(B);
  const { blob, ext } = await rec.stop();
  [A.v, B.v].forEach(v => { try { v.pause(); URL.revokeObjectURL(v.src); } catch (e) { } });
  if (out) out.textContent = '';
  const clip = { blob, url: URL.createObjectURL(blob), title: 'До и после', date: nowLocal(), ext };
  CAM.clips.push(clip); camShow(clip);
}











// установщики для моста window (переходный период, см. main.js)
export function __set_DY(v) { DY = v; }

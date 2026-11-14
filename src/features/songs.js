import { act, onChange } from '../core/actions.js';
import { VA } from '../core/analysis.js';
import { MIC_DIRECT, ac, afterMic, base, click, noteShort, openMic, stopAll, strictOct, tone } from '../core/audio.js';
import { afterHooks, go, render } from '../core/router.js';
import { profName, save, state } from '../core/store.js';
import { closeSheet, sheet, toast } from '../core/ui.js';
import { $, ICON, esc, nowLocal, plural, setBusy, uid } from '../core/util.js';
import { BUILTIN_SONGS } from '../data/songs.js';
import { camOn, camRecStart, camRecStop, camRecording, camStart, camToggleHTML } from './cam.js';
import { lastRange } from './register.js';
import { midiCandidates, normalizeSong, parseMidi, phraseNotes, SONG_LATE, songFromMidi, songFromSegs, songGame, songGameResult, songGameStep, songNear, songShift } from './songlib.js';

// ===== Песни: маршруты #songs (список, добавить свою) и #song-<id> (разучивание) =====
// Свои песни - в localStorage 'vocal-songs' (общие для всех профилей), прогресс - у каждого свой: state.songs[id].
// Разучивание по фразам: пианино играет фразу, потом тишина, ты повторяешь; микрофон слушает только в тишине.
// «Целиком»: пианино даёт первую ноту, дальше поёшь всю песню сам, микрофон идёт за тобой по нотам.
const LIB_KEY = 'vocal-songs';
export function songsMine() {
  try { const x = JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); return Array.isArray(x) ? x.map(normalizeSong).filter(Boolean) : []; } catch (e) { return []; }
}
function songsSaveMine(list) {
  try { localStorage.setItem(LIB_KEY, JSON.stringify(list)); return true; } catch (e) { toast('Не хватило места в памяти браузера. Удали какую-нибудь песню.'); return false; }
}
export const songsAll = () => [...BUILTIN_SONGS, ...songsMine()];
export const songById = id => songsAll().find(s => s.id === id) || null;
const prog = id => ((state.songs ||= {})[id] ||= { ph: {}, whole: 0, plays: 0 });
export const songTempo = () => state.settings.songTempo || 1;
// окно голоса: замеренный грудной диапазон или рядом с базой
export function songWin() { const r = lastRange(); return r ? [r.lo, r.chestHi ?? r.hi] : [base() - 5, base() + 12]; }
export function songShiftOf(s) { const p = (state.songs || {})[s.id]; return p && Number.isInteger(p.shift) ? p.shift : songShift(s.notes, songWin()); }
const learned = s => { const p = (state.songs || {})[s.id]; return p ? s.ph.filter((_, k) => (p.ph[k] || 0) >= 80).length : 0; };
const nm = m => VA.noteName(m);
// «на октаву ниже», «+3 полутона», «на октаву ниже и +2 полутона»
export function shiftText(sh) {
  if (!sh) return 'как в оригинале';
  const o = Math.trunc(sh / 12), r = sh - 12 * o, oct = o ? `на ${Math.abs(o) === 1 ? 'октаву' : Math.abs(o) + ' октавы'} ${o < 0 ? 'ниже' : 'выше'}` : '';
  return [oct, r ? (r > 0 ? '+' : '') + r + ' ' + plural(Math.abs(r), 'полутон', 'полутона', 'полутонов') : ''].filter(Boolean).join(' и ');
}

export let SG = null;
export function songStop() {
  if (!SG) return;
  (SG.timers || []).forEach(clearTimeout); SG.timers = []; stopAll(); SG.playing = false; SG.phase = 'idle'; cancelAnimationFrame(SG.raf); SG.mic = null;
  if (SG.stream) { SG.stream.getTracks().forEach(t => t.stop()); SG.stream = null; afterMic(); }
  if (SG.rec && SG.rec.mr && SG.rec.mr.state === 'recording') { SG.rec.cancel = true; SG.rec.mr.stop(); }
  setBusy(false);
}

// --- список песен и добавление своей
export function viewSongs() {
  songStop();
  SG = { draft: SG && SG.draft, timers: [] };
  afterHooks.push(songDraftDraw);
  const item = s => {
    const p = (state.songs || {})[s.id], n = learned(s);
    return `<button class="item" ${act('go', `song-${s.id}`)}><div class="dot pitch">${n === s.ph.length ? '✓' : '🎵'}</div><div class="t"><b>${esc(s.title)}</b><span class="small muted">${s.ph.length} ${plural(s.ph.length, 'фраза', 'фразы', 'фраз')}${n ? ` · выучено ${n}` : ''}${p && p.whole ? ` · целиком ${p.whole}%` : ''}${s.by ? ' · ' + esc(s.by) : ''}</span></div><span class="muted">›</span></button>`;
  };
  const mine = songsMine();
  return `<button class="back" ${act('go', 'today')}>${ICON.back} Сегодня</button><h1>Песни</h1>
    <p class="muted" style="margin:6px 0 0">Разучиваем по фразам: пианино играет кусочек, ты повторяешь, микрофон показывает, какие ноты чисто. Потом поёшь всю песню сам.</p>
    ${mine.length ? `<div class="sec"><h2>Мои песни</h2>${mine.map(item).join('')}</div>` : ''}
    <div class="sec"><h2>Для начала</h2>${BUILTIN_SONGS.map(item).join('')}</div>
    <div class="sec"><h2>Добавить свою</h2><div class="card stack">
      <label class="btn">${ICON.file} Файл MIDI или караоке<input type="file" accept=".mid,.midi,.kar,audio/midi,audio/x-midi" class="hidden" ${onChange('songFile')}></label>
      <div class="tiny muted" style="margin-top:-4px">Поищи в интернете «название песни midi» или «karaoke kar». В караоке-файле (.kar) есть и ноты, и слова.</div>
      <div class="row wrap">${MIC_DIRECT ? `<button class="btn ghost" style="flex:1" id="sgrec" ${act('songRecord')}>${ICON.mic} Напеть в микрофон</button>` : ''}
      <label class="btn ghost" style="flex:1">${ICON.file} Запись голоса<input type="file" accept="audio/*,video/*" class="hidden" ${onChange('songFile')}></label></div>
      <div class="tiny muted" style="margin-top:-4px">Напой песню сам или возьми запись знакомого: один голос, без музыки, на «ля» или со словами. Обычная песня с музыкой (mp3) не подойдёт: голос из неё надёжно не вытащить, и ноты будут врать.</div>
      <div id="sgadd"></div></div></div>`;
}
const stripExt = n => String(n || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim().slice(0, 80);
export async function songFile(input) {
  const f = input.files && input.files[0]; input.value = ''; if (!f) return;
  const box = $('#sgadd'); if (box) box.innerHTML = '<div class="small muted">Читаю файл...</div>';
  const buf = new Uint8Array(await f.arrayBuffer());
  if (buf.length >= 4 && String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) === 'MThd') return songFromMidiBuf(buf, stripExt(f.name));
  return songFromAudioBuf(buf.buffer, stripExt(f.name));
}
export function songFromMidiBuf(buf, name) {
  let mid, cands;
  try { mid = parseMidi(buf); cands = midiCandidates(mid); } catch (e) { songMsg('Не получилось прочитать MIDI-файл. Попробуй другой файл этой песни.'); return; }
  if (!cands.length) { songMsg('В файле не нашёл мелодии: нет дорожки с отдельными нотами.'); return; }
  const tr = mid.tracks.find(t => t.texts.some(x => x.s.startsWith('@T')));
  const t = tr && tr.texts.find(x => x.s.startsWith('@T'));
  SG.draft = { src: 'midi', mid, cands, pick: 0, name: (t && t.s.slice(2).trim().slice(0, 80)) || name, ...songFromMidi(mid, cands[0]) };
  songDraftDraw();
}
export async function songFromAudioBuf(arrayBuf, name) {
  songMsg('Слушаю запись и ищу ноты...'); setBusy(true);
  let audio;
  try { audio = await new Promise((ok, bad) => { const p = ac().decodeAudioData(arrayBuf, ok, bad); if (p && p.then) p.then(ok, bad); }); }
  catch (e) { setBusy(false); songMsg('Не получилось прочитать файл. Подойдут MIDI (.mid, .kar) или запись голоса в m4a, mp3, wav, webm.'); return; }
  await new Promise(r => setTimeout(r, 30));
  const chs = [], len = Math.min(audio.length, audio.sampleRate * 90);
  for (let c = 0; c < audio.numberOfChannels; c++) chs.push(audio.getChannelData(c).subarray(0, len));
  const a = VA.analyzeSamples(chs, audio.sampleRate); setBusy(false);
  const sg = songFromSegs(a.segs);
  if (sg.notes.length < 3) { songMsg('Не слышу в записи нот с понятной высотой. Пой громче и ближе к телефону, без музыки на фоне.'); return; }
  SG.draft = { src: 'voice', name: name || 'Моя песня', ...sg, cut: audio.length > len };
  songDraftDraw();
}
const songMsg = t => { const box = $('#sgadd'); if (box) box.innerHTML = `<div class="note small" style="margin-top:6px">${esc(t)}</div>`; };
export function songDraftDraw() {
  const box = $('#sgadd'), d = SG && SG.draft; if (!box || !d) return;
  const ms = d.notes.map(n => n.m), words = d.notes.some(n => n.w);
  box.innerHTML = `<div class="card stack" style="margin-top:6px;background:var(--bg)">
    <b>Нашёл ${d.notes.length} ${plural(d.notes.length, 'ноту', 'ноты', 'нот')}, ${d.ph.length} ${plural(d.ph.length, 'фразу', 'фразы', 'фраз')}${words ? ' и слова' : ''}</b>
    <div class="small muted">От ${noteShort(Math.min(...ms))} до ${noteShort(Math.max(...ms))}, около ${Math.round(d.notes[d.notes.length - 1].t + d.notes[d.notes.length - 1].d)} с.${d.src === 'voice' && d.tune ? ` Ты пел чуть ${d.tune > 0 ? 'выше' : 'ниже'} обычного строя (${Math.abs(d.tune)} ц), ноты выровнял.` : ''}${d.cut ? ' Взял первые 90 секунд.' : ''}</div>
    ${songRoll(d.notes, null, 0)}
    ${d.cands && d.cands.length > 1 ? `<label class="small">Какая дорожка - мелодия? <select class="inp" ${onChange('songPickTrack')}>${d.cands.map((c, i) => `<option value="${i}" ${i === d.pick ? 'selected' : ''}>${esc(c.name)} · ${c.n} нот · ${noteShort(c.lo)}-${noteShort(c.hi)}</option>`).join('')}</select></label>
      <div class="tiny muted" style="margin-top:-6px">Первой стоит самая похожая на голос. Послушай: если играет не мелодия, выбери другую.</div>` : ''}
    <label class="small">Название<input id="sgtitle" class="inp" maxlength="80" value="${esc(d.name)}"></label>
    ${words ? '' : `<label class="small">Слова (можно пропустить): по строчке на фразу<textarea id="sglyr" class="inp" rows="4" placeholder="Первая строчка&#10;Вторая строчка"></textarea></label>`}
    <div class="row wrap"><button class="btn ghost" style="flex:1" ${act('songPreview')}>${ICON.play} Послушать</button><button class="btn" style="flex:1" ${act('songSave')}>Сохранить</button></div>
    <button class="btn ghost" ${act('songCancel')}>Отмена</button></div>`;
}
export function songPickTrack(v) { const d = SG.draft; if (!d || !d.mid) return; d.pick = +v; Object.assign(d, songFromMidi(d.mid, d.cands[d.pick])); stopAll(); songDraftDraw(); }
export function songPreview() { const d = SG && SG.draft; if (d) playNotes(d.notes.filter(n => n.t < 20), 0, 1); }
export function songCancel() { stopAll(); SG.draft = null; const b = $('#sgadd'); if (b) b.innerHTML = ''; }
export function songSave() {
  const d = SG && SG.draft; if (!d) return;
  const title = ($('#sgtitle') ? $('#sgtitle').value : d.name).trim().slice(0, 80) || 'Моя песня';
  let notes = d.notes.map(n => ({ ...n }));
  const lyr = $('#sglyr') ? $('#sglyr').value.split('\n').map(x => x.trim()).filter(Boolean) : [];
  // слова по строчкам: строчка целиком - на первую ноту фразы (лишние строчки - к последней фразе)
  lyr.forEach((line, k) => { const i = d.ph[Math.min(k, d.ph.length - 1)]; notes[i].w = ((k >= d.ph.length ? notes[i].w + ' / ' : '') + line).slice(0, 120); });
  const s = normalizeSong({ id: 's' + uid(), title, src: d.src, notes, ph: d.ph });
  if (!s) { toast('Слишком мало нот для песни'); return; }
  stopAll();
  if (!songsSaveMine([...songsMine(), s])) return;
  SG.draft = null; go('song-' + s.id);
}
export function songAskDel(id) {
  const s = songById(id); if (!s || s.src === 'builtin') return;
  sheet(`<h2>Удалить «${esc(s.title)}»?</h2><p class="muted">Песня пропадёт из списка у всех профилей на этом телефоне.</p><div class="row"><button class="btn ghost" style="flex:1" ${act('closeSheet')}>Отмена</button><button class="btn" style="flex:1;background:var(--bad)" ${act('songDel', id)}>Удалить</button></div>`);
}
export function songDel(id) { songsSaveMine(songsMine().filter(s => s.id !== id)); if (state.songs) { delete state.songs[id]; save(); } closeSheet(); go('songs'); }
// запись голоса прямо здесь (сайт и приложение)
export async function songRecord() {
  const btn = $('#sgrec');
  if (SG.rec && SG.rec.mr && SG.rec.mr.state === 'recording') { SG.rec.mr.stop(); return; }
  let stream; try { stream = await openMic(); } catch (e) { songMsg('Нет доступа к микрофону. Разреши его в настройках браузера или загрузи готовую запись.'); return; }
  const chunks = [], mr = new MediaRecorder(stream); SG.rec = { mr, cancel: false }; setBusy(true);
  mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  mr.onstop = async () => {
    stream.getTracks().forEach(t => t.stop()); clearInterval(SG.rec.tick); afterMic(); setBusy(false);
    if (btn) btn.innerHTML = ICON.mic + ' Напеть в микрофон';
    if (SG.rec.cancel) return;
    songFromAudioBuf(await new Blob(chunks, { type: mr.mimeType || 'audio/webm' }).arrayBuffer(), 'Моя песня');
  };
  mr.start(); const t0 = Date.now();
  if (btn) btn.innerHTML = ICON.stop + ' Готово';
  songMsg('Запись 0 с. Пой песню целиком или куплет.');
  SG.rec.tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); const m = $('#sgadd .note'); if (m) m.textContent = `Запись ${s} с. Пой песню целиком или куплет.`; if (s >= 90) mr.stop(); }, 250);
}

// --- ноты на экране: полоски по времени и высоте; hit - засчитанные (зелёные) и нет (красные)
export function songRoll(notes, hit, shift) {
  if (!notes.length) return '';
  const W = 640, H = 110, t0 = notes[0].t, t1 = Math.max(...notes.map(n => n.t + n.d)), ms = notes.map(n => n.m);
  const lo = Math.min(...ms) - 1, hi = Math.max(...ms) + 1, x = t => 6 + (t - t0) / (t1 - t0 || 1) * (W - 12), y = m => H - 8 - (m - lo) / (hi - lo || 1) * (H - 16);
  const bars = notes.map((n, i) => `<rect x="${x(n.t).toFixed(1)}" y="${(y(n.m) - 5).toFixed(1)}" width="${Math.max(4, x(n.t + n.d) - x(n.t) - 2).toFixed(1)}" height="10" rx="4" fill="${hit ? (hit[i] ? 'var(--ok)' : 'var(--bad)') : 'var(--accent)'}" opacity="${hit && hit[i] == null ? .3 : .9}"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;background:var(--card);border:1px solid var(--line);border-radius:12px" aria-label="Ноты: ${esc(notes.map(n => noteShort(n.m + shift)).join(' '))}">${bars}</svg>`;
}
function playNotes(notes, shift, tempo, when) {
  const c = ac(), t0 = when ?? c.currentTime + .1, s0 = notes[0].t;
  for (const n of notes) tone(n.m + shift, t0 + (n.t - s0) / tempo, Math.max(.12, n.d / tempo * .95), .2);
  return t0 + Math.max(...notes.map(n => (n.t - s0 + n.d) / tempo));
}

// --- разучивание: караоке-игра на холсте #sgcv
// «Учить по фразам»: «Слушай» (пианино играет фразу, полоски едут) -> «Теперь ты» (без пианино, микрофон считает ноты).
// 80% нот - следующая фраза, меньше - ещё раз (до 3 попыток). «Спеть целиком»: первая нота, отсчёт и вся песня без подсказки.
// Голос - точка со следом, слова внизу с подсветкой слога. Всё рисуется на холсте, поэтому попадает и в видео.
export let SONG_FAKE = null; // только автотесты: (время, SG) -> высота голоса вместо микрофона
export function viewSong(id) {
  songStop();
  const s = songById(id);
  SG = { s, k: 0, mode: state.settings.songMode === 'whole' ? 'whole' : 'phrase', timers: [], tries: 0, phase: 'idle', trail: [], parts: [] };
  const p = (state.songs || {})[s.id]; if (p) { const k = s.ph.findIndex((_, i) => (p.ph[i] || 0) < 80); SG.k = k < 0 ? 0 : k; }
  afterHooks.push(songInit); afterHooks.push(() => { if (camOn()) camStart(); });
  const sh = songShiftOf(s), ms = s.notes.map(n => n.m), r = lastRange(), tp = songTempo(), ph = SG.mode === 'phrase';
  return `<button class="back" ${act('go', 'songs')}>${ICON.back} Песни</button><h1>${esc(s.title)}</h1>
    <p class="muted" style="margin:6px 0 0">${s.ph.length} ${plural(s.ph.length, 'фраза', 'фразы', 'фраз')} · ${noteShort(Math.min(...ms) + sh)} - ${noteShort(Math.max(...ms) + sh)}${p && p.whole ? ` · рекорд ${'★'.repeat(p.stars || 0)}${'☆'.repeat(3 - (p.stars || 0))} ${p.whole}%` : ''}</p>
    <div class="seg sec" style="margin-top:12px"><button class="${ph ? 'on' : ''}" ${act('songSetMode', 'phrase')}>Учить по фразам</button><button class="${ph ? '' : 'on'}" ${act('songSetMode', 'whole')}>Спеть целиком</button></div>
    <div style="margin-top:10px;border-radius:16px;overflow:hidden;background:#1B1838"><canvas id="sgcv" style="display:block;width:100%"></canvas></div>
    <div class="row" style="margin-top:10px"><button class="btn" style="flex:1" id="sgplay" ${act('songPlay')}>${ICON.play} ${ph ? 'Начать' : 'Спеть'}</button>${ph ? `<button class="btn ghost" ${act('songNext')}>Дальше ›</button>` : `<button class="btn ghost" ${act('songListenAll')}>${ICON.play} Послушать</button>`}</div>
    <div id="sgmsg" class="small muted" style="margin-top:8px;min-height:20px">${MIC_DIRECT ? (ph ? 'Сначала послушай фразу, потом спой её сам. Ноты едут справа налево: пой ту, что под белой линией.' : 'Прозвучит первая нота и отсчёт, дальше вся песня без подсказки. Попадаешь - нота зеленеет.') : 'Здесь микрофон закрыт: можно слушать и подпевать. Проверка нот - на сайте или в приложении.'}</div>
    <div id="sgchips" class="sec">${phraseChips()}</div>
    <div class="card sec stack" style="padding:12px 14px">
      <div class="row" style="gap:8px"><span class="small" style="flex:1">Тональность: <b>${shiftText(sh)}</b></span>
        <button class="iconbtn" ${act('songShiftBy', -1)} title="Ниже">−</button><button class="iconbtn" ${act('songShiftBy', 1)} title="Выше">+</button></div>
      <div class="tiny muted" style="margin-top:-6px">${r ? `Подобрал под твой диапазон ${noteShort(songWin()[0])} - ${noteShort(songWin()[1])}.` : `Подобрал рядом с ${noteShort(base())}. <a href="#range">Замерь диапазон</a>, чтобы песня встала точно под голос.`} Неудобно - сдвинь на полутон.</div>
      <div class="seg"><button class="${tp < 1 ? 'on' : ''}" ${act('songSetTempo', .75)}>Медленно</button><button class="${tp >= 1 ? 'on' : ''}" ${act('songSetTempo', 1)}>Как в песне</button></div>
    </div>
    ${camToggleHTML()}
    ${s.src !== 'builtin' ? `<button class="btn ghost block sec" style="color:var(--bad)" ${act('songAskDel', s.id)}>Удалить песню</button>` : ''}`;
}
export function songShiftBy(d) { const s = SG && SG.s; if (!s) return; prog(s.id).shift = songShiftOf(s) + d; save(); render(); }
export function songSetTempo(v) { state.settings.songTempo = v; save(); render(); }
export function songSetMode(m) { state.settings.songMode = m; save(); render(); }
function phraseChips() {
  const s = SG.s, p = (state.songs || {})[s.id] || { ph: {} };
  return `<div class="row wrap" style="gap:6px">${s.ph.map((_, k) => { const v = p.ph[k]; return `<button class="chip ${v >= 80 ? 'ok' : v ? 'near' : ''}" style="border:${k === SG.k && SG.mode === 'phrase' ? '2px solid var(--accent)' : '0'}" ${act('songGoPhrase', k)}>${k + 1}${v >= 80 ? ' ✓' : v ? ' ' + v + '%' : ''}</button>`; }).join('')}</div>`;
}
const chipsDraw = () => { const el = $('#sgchips'); if (el && SG) el.innerHTML = phraseChips(); };
const msg = h => { const el = $('#sgmsg'); if (el) el.innerHTML = h; };
const btn = playing => { const b = $('#sgplay'); if (b) b.innerHTML = playing ? ICON.stop + ' Стоп' : ICON.play + ' ' + (SG.mode === 'phrase' ? (SG.res ? 'Ещё раз' : 'Начать') : (SG.res ? 'Ещё раз' : 'Спеть')); };
// ноты, которые сейчас на сцене: фраза или вся песня
const unitNotes = () => SG.mode === 'phrase' && !SG.unitAll ? phraseNotes(SG.s, SG.k) : SG.s.notes;
const unitOff = () => SG.mode === 'phrase' && !SG.unitAll ? SG.s.ph[SG.k] : 0;
function songScene() { SG.G = songGame(unitNotes(), { tempo: songTempo(), shift: songShiftOf(SG.s), strict: strictOct() }); SG.trail = []; SG.parts = []; SG.voice = null; }
export function songInit() {
  const cv = $('#sgcv'); if (!cv || !SG) return;
  SG.cv = cv; SG.ctx = cv.getContext('2d');
  const w = cv.parentElement.clientWidth, h = Math.round(Math.min(440, Math.max(320, w * .92))), dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px'; SG.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); SG.W = w; SG.H = h;
  songScene(); songDrawFrame(-1.2);
}
export function songGoPhrase(k) { if (!SG) return; songHalt(); SG.mode = 'phrase'; SG.unitAll = false; SG.k = k; SG.tries = 0; SG.res = null; songScene(); songDrawFrame(-1.2); chipsDraw(); btn(false); }
export function songNext() { if (!SG) return; songGoPhrase(Math.min(SG.s.ph.length - 1, SG.k + 1)); }
// остановить показ (микрофон остаётся до ухода с экрана)
function songHalt() { if (!SG) return; cancelAnimationFrame(SG.raf); (SG.timers || []).forEach(clearTimeout); SG.timers = []; stopAll(); SG.phase = 'idle'; SG.playing = false; }
const later = (sec, f) => SG.timers.push(setTimeout(() => { if (SG && SG.playing) f(); }, sec * 1000));
// микрофон: открывается один раз на всё занятие
export async function songEnsureMic() {
  if (SG.stream) return true;
  let stream; try { stream = await openMic(); } catch (e) { toast('Нет доступа к микрофону. Можно слушать и подпевать без проверки.'); return false; }
  const c = ac(); SG.stream = stream; setBusy(true);
  const an = c.createAnalyser(); an.fftSize = 4096; c.createMediaStreamSource(stream).connect(an);
  SG.mic = { an, buf: new Float32Array(an.fftSize), hist: [], c };
  return true;
}
function micPitch() {
  const M = SG.mic; if (!M) return null;
  M.an.getFloatTimeDomainData(M.buf);
  M.hist.push(VA.livePitch(M.buf, M.c.sampleRate)); if (M.hist.length > 3) M.hist.shift();
  const v = M.hist.filter(x => x != null); return v.length >= 2 ? VA.median(v) : null;
}
export async function songPlay() {
  if (!SG || !SG.s) return;
  if (SG.playing) { songHalt(); songScene(); songDrawFrame(-1.2); btn(false); if (camRecording()) camRecStop(SG.mode === 'whole' ? '' : `${learned(SG.s)} из ${SG.s.ph.length} фраз`); return; }
  SG.unitAll = false; SG.tries = 0;
  if (MIC_DIRECT) await songEnsureMic();
  if (camOn() && !camRecording() && SG.stream) camRecStart('#sgcv', `${profName() ? profName() + ' · ' : ''}${SG.s.title}`, SG.stream);
  SG.playing = true; btn(true);
  if (SG.mode === 'whole' && SG.stream) songRunSing(true); else songRunListen(!!SG.stream);
}
export function songListenAll() { if (!SG) return; songHalt(); SG.unitAll = true; SG.playing = true; btn(true); songRunListen(false); }
// «Слушай»: пианино играет, полоски едут, голос не считается (микрофон слышит пианино)
function songRunListen(thenSing) {
  songScene(); SG.phase = 'listen'; msg(SG.unitAll ? 'Слушай всю песню' : `Фраза ${SG.k + 1}: слушай`);
  const c = ac(), t0 = c.currentTime + .8, G = SG.G;
  for (const n of G.N) tone(n.m, t0 + n.t0, Math.max(.12, (n.t1 - n.t0) * .95), .2);
  songLoop(t0, () => {
    if (!thenSing) { SG.playing = false; SG.unitAll = false; btn(false); songScene(); songDrawFrame(-1.2); msg(''); return; }
    songRunSing(false);
  });
}
// «Теперь ты» / «Спеть целиком»: отсчёт, потом считаем ноты
function songRunSing(whole) {
  songScene(); SG.phase = 'sing';
  const c = ac(), b = .5, G = SG.G, first = G.N[0].m;
  let t0;
  if (whole) { t0 = c.currentTime + 2.9; tone(first, c.currentTime + .1, 1.1, .2); [0, 4, 7].forEach(x => tone(first + x, c.currentTime + .1, 1, .05)); for (let i = 0; i < 3; i++) click(t0 - (3 - i) * b, i === 0); msg('Первая нота: ' + nm(first) + '. Пой!'); }
  else { t0 = c.currentTime + 1.4; for (let i = 0; i < 2; i++) click(t0 - (2 - i) * b, i === 0); msg(`Фраза ${SG.k + 1}: теперь ты`); }
  songLoop(t0, songUnitDone);
}
function songLoop(t0, done) {
  const c = ac(), G = SG.G, end = G.D + (SG.phase === 'sing' ? SONG_LATE + .25 : .5);
  const loop = () => {
    if (!SG || !SG.playing) return;
    const now = c.currentTime - t0;
    if (SG.phase === 'sing') {
      const m = SONG_FAKE ? SONG_FAKE(now, SG) : micPitch();
      if (now > -.3) {
        SG.voice = m;
        if (m != null) SG.trail.push({ t: now, m }); if (SG.trail.length > 240) SG.trail.shift();
        for (const e of songGameStep(G, now, m)) if (e.hit) burst(G.N[e.i]);
      }
    }
    songDrawFrame(now);
    if (now >= end) { done(); return; }
    SG.raf = requestAnimationFrame(loop);
  };
  loop();
}
function burst(n) { for (let i = 0; i < 14; i++) SG.parts.push({ t: SG.G.last, m: n.m, x0: n.t1, vx: (Math.random() - .3) * 160, vy: -60 - Math.random() * 140, c: i % 2 ? '#7FE3A4' : '#FFE08A' }); }
// итог фразы/песни: сохраняем лучшее, дальше сами
function songUnitDone() {
  const s = SG.s, G = SG.G; songGameStep(G, G.D + SONG_LATE + 1, null);
  const r = songGameResult(G), p = prog(s.id); p.plays = (p.plays || 0) + 1; p.last = nowLocal();
  SG.res = r; SG.banner = { r, t: performance.now() };
  if (SG.mode === 'whole') {
    if (r.pct > (p.whole || 0)) { p.whole = r.pct; p.stars = r.stars; }
    // спетое целиком засчитывается и фразам
    s.ph.forEach((_, k) => { const [a, b] = [s.ph[k], k + 1 < s.ph.length ? s.ph[k + 1] : s.notes.length]; let n = 0; for (let i = a; i < b; i++) if (r.hit[i]) n++; p.ph[k] = Math.max(p.ph[k] || 0, Math.round(100 * n / (b - a))); });
    save(); chipsDraw(); SG.playing = false; SG.phase = 'done'; btn(false); songDrawFrame(G.D + 1);
    msg(`<b>${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)} ${r.pct}% нот</b>, лучшая серия ${r.best}. ${r.pct >= 90 ? 'Песня спета!' : r.pct >= 50 ? 'Красные ноты - туда стоит вернуться по фразам.' : 'Поучи сначала по фразам.'}`);
    if (camRecording()) camRecStop(`${'★'.repeat(r.stars)} ${r.pct}% нот`);
    return;
  }
  p.ph[SG.k] = Math.max(p.ph[SG.k] || 0, r.pct); save(); chipsDraw();
  SG.tries++; SG.phase = 'done'; songDrawFrame(G.D + 1);
  const last = SG.k >= s.ph.length - 1;
  if (r.ok && !last) { msg(`<b style="color:var(--ok)">Чисто: ${r.n} из ${r.total}!</b> Следующая фраза...`); later(1.8, () => { SG.k++; SG.tries = 0; chipsDraw(); songRunListen(true); }); return; }
  if (!r.ok && SG.tries < 3) { msg(`<b style="color:var(--near)">${r.n} из ${r.total}.</b> Красные ноты мимо. Послушай ещё раз...`); later(1.8, () => songRunListen(true)); return; }
  SG.playing = false; btn(false);
  if (r.ok) { msg(`<b style="color:var(--ok)">Все фразы пройдены!</b> Теперь попробуй «Спеть целиком».`); if (camRecording()) camRecStop(`${learned(s)} из ${s.ph.length} фраз`); }
  else msg(`<b>${r.n} из ${r.total}.</b> Не страшно: можно ещё раз, помедленнее (настройки ниже) или пойти дальше.`);
}

// --- отрисовка сцены
function songDrawFrame(now) {
  const { ctx, W, H, G } = SG; if (!ctx || !G) return;
  const sing = SG.phase === 'sing', N = G.N, ms = N.map(n => n.m);
  let lo = Math.min(...ms) - 2.5, hi = Math.max(...ms) + 2.5; if (hi - lo < 9) { const c = (hi + lo) / 2; lo = c - 4.5; hi = c + 4.5; }
  const top = 44, bot = H - 78, Y = m => top + (hi - m) / (hi - lo) * (bot - top), semi = (bot - top) / (hi - lo);
  const fit = SG.phase === 'done', nx = Math.round(W * .3), pps = Math.max(120, W * .32);
  const X = fit ? t => 40 + t / (G.D || 1) * (W - 56) : t => nx + (t - now) * pps; // на итоге - вся фраза на экране
  // фон: ночная сцена
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1B1838'); bg.addColorStop(1, '#3A2148'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const spot = ctx.createRadialGradient(nx, -40, 10, nx, -40, H * .9); spot.addColorStop(0, 'rgba(255,214,150,.18)'); spot.addColorStop(1, 'rgba(255,214,150,0)'); ctx.fillStyle = spot; ctx.fillRect(0, 0, W, H);
  // линии нот и подписи
  ctx.font = '700 10px Manrope, system-ui'; ctx.textAlign = 'left';
  for (const m of [...new Set(ms)]) { ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.moveTo(30, Y(m)); ctx.lineTo(W, Y(m)); ctx.stroke(); }
  // полоски нот
  const bh = Math.max(10, Math.min(20, semi * .85));
  for (const n of N) {
    const x1 = X(n.t0), x2 = Math.max(x1 + 6, X(n.t1) - 2); if (x2 < 26 || x1 > W + 10) continue;
    const y = Y(n.m) - bh / 2, act = !fit && now >= n.t0 && now <= n.t1;
    let col = 'rgba(255,214,130,.55)';
    if (SG.phase === 'listen' || SG.phase === 'idle') col = act ? '#FFE3A3' : 'rgba(186,170,255,.6)';
    else if (n.hit) col = '#5ED18A'; else if (n.done) col = 'rgba(232,105,94,.55)'; else if (act) col = '#FFD27A';
    ctx.save(); if (act || n.hit) { ctx.shadowColor = n.hit ? '#5ED18A' : '#FFD27A'; ctx.shadowBlur = 14; }
    ctx.fillStyle = col; rrect(ctx, x1, y, x2 - x1, bh, bh / 2); ctx.fill(); ctx.restore();
    // набранное время на ноте
    if (sing && !n.hit && n.got > 0) { ctx.fillStyle = 'rgba(94,209,138,.75)'; rrect(ctx, x1, y, Math.max(bh, (x2 - x1) * Math.min(1, n.got / n.need)), bh, bh / 2); ctx.fill(); }
    const lab = n.w ? n.w.trim().slice(0, 12) : nm(n.m);
    if (x2 - x1 > 18 || (n.w && !fit)) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '700 11px Manrope, system-ui'; ctx.fillText(lab, x1 + 2, y - 5); }
  }
  // линейка нот слева
  ctx.fillStyle = 'rgba(20,16,40,.55)'; ctx.fillRect(0, top - 14, 30, bot - top + 28); ctx.font = '700 10px Manrope, system-ui'; ctx.textAlign = 'left';
  for (const m of [...new Set(ms)]) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillText(nm(m).slice(0, 4), 4, Y(m) + 3); }
  // линия «сейчас»
  const ln = ctx.createLinearGradient(0, top - 10, 0, bot + 10); ln.addColorStop(0, 'rgba(255,255,255,0)'); ln.addColorStop(.5, 'rgba(255,255,255,.75)'); ln.addColorStop(1, 'rgba(255,255,255,0)');
  if (!fit) { ctx.fillStyle = ln; ctx.fillRect(nx - 1, top - 10, 2, bot - top + 20); }
  // голос: след и точка (в октаве ближайшей ноты)
  const near = N.find(n => n.t1 + .2 >= now) || N[N.length - 1];
  const fold = m => { if (G.strict) return m; return m - 12 * Math.round((m - near.m) / 12); };
  if (sing) {
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); let pen = false, pt = null;
    for (const p of SG.trail) { const x = nx - (now - p.t) * pps; if (x < 26) { pen = false; continue; } const y = Math.max(top - 20, Math.min(bot + 20, Y(fold(p.m)))); if (pen && pt && p.t - pt < .12) ctx.lineTo(x, y); else ctx.moveTo(x, y); pen = true; pt = p.t; }
    ctx.stroke();
    if (SG.voice != null) {
      const y = Math.max(top - 20, Math.min(bot + 20, Y(fold(SG.voice)))), on = N.some(n => now >= n.a && now <= n.t1 + SONG_LATE && !n.done && songNear(G, n, SG.voice));
      ctx.save(); ctx.shadowColor = on ? '#5ED18A' : '#fff'; ctx.shadowBlur = 18; ctx.fillStyle = on ? '#7FE3A4' : '#FFFFFF'; ctx.beginPath(); ctx.arc(nx, y, 8, 0, 7); ctx.fill(); ctx.restore();
    }
  }
  // искры попаданий
  SG.parts = SG.parts.filter(p => now - p.t < .9);
  for (const p of SG.parts) { const a = now - p.t; ctx.globalAlpha = Math.max(0, 1 - a / .9); ctx.fillStyle = p.c; ctx.fillRect(X(p.x0) + p.vx * a, Y(p.m) + p.vy * a + 260 * a * a, 4, 4); }
  ctx.globalAlpha = 1;
  // верх: что происходит, прогресс, серия
  ctx.textAlign = 'left'; ctx.font = '800 13px Manrope, system-ui'; ctx.fillStyle = '#fff';
  ctx.fillText(SG.phase === 'listen' ? '🎹 Слушай' : sing ? '🎤 Теперь ты' : SG.mode === 'whole' || SG.unitAll ? 'Вся песня' : `Фраза ${SG.k + 1} из ${SG.s.ph.length}`, 12, 24);
  const done = Math.max(0, Math.min(1, now / G.D));
  if (!fit) { ctx.fillStyle = 'rgba(255,255,255,.18)'; rrect(ctx, W * .42, 16, W * .34, 6, 3); ctx.fill(); ctx.fillStyle = '#FFD27A'; rrect(ctx, W * .42, 16, Math.max(6, W * .34 * done), 6, 3); ctx.fill(); }
  if (sing && G.combo >= 2) { ctx.textAlign = 'right'; ctx.fillStyle = '#7FE3A4'; ctx.fillText(`Серия ${G.combo}`, W - 12, 24); }
  // отсчёт
  if (sing && now < 0) { ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '700 46px Lora, serif'; ctx.fillText(String(Math.ceil(-now / .5)), W / 2, (top + bot) / 2 + 14); }
  // итог
  if (SG.phase === 'done' && SG.banner) {
    const r = SG.banner.r; ctx.textAlign = 'right'; ctx.font = '800 13px Manrope, system-ui'; ctx.fillStyle = '#fff'; const tx = `${r.n} из ${r.total} нот`;
    ctx.fillText(tx, W - 12, 24); ctx.font = '20px system-ui'; ctx.fillStyle = '#FFD27A'; ctx.fillText('★'.repeat(r.stars) + '☆'.repeat(3 - r.stars), W - 20 - ctx.measureText(tx).width * 1.05, 26);
  }
  songLyrics(now, bot);
  ctx.textAlign = 'left';
}
// слова внизу: строчка с текущей нотой, спетое - золотым, текущий слог - белым, дальше - серым; без слов - названия нот
function songLyrics(now, bot) {
  const { ctx, W, H, G, s } = SG, off = unitOff();
  const cur = G.N.findIndex(n => now < n.t1); const gi = (cur < 0 ? G.N.length - 1 : cur) + off;
  let k = 0; while (k + 1 < s.ph.length && s.ph[k + 1] <= gi) k++;
  const words = s.notes.some(n => n.w), sh = songShiftOf(s);
  const line = kk => { const a = s.ph[kk], b = kk + 1 < s.ph.length ? s.ph[kk + 1] : s.notes.length; const out = []; for (let i = a; i < b; i++) { const n = s.notes[i]; out.push({ i, t: words ? (n.w || '') : nm(n.m + sh) + ' ' }); } return out.filter(x => x.t); };
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(0, bot + 18, W, H - bot - 18);
  const toks = line(k); let size = 19; ctx.font = `700 ${size}px Lora, serif`;
  let w = toks.reduce((a, x) => a + ctx.measureText(x.t).width, 0); if (w > W - 24) { size = Math.max(11, Math.floor(size * (W - 24) / w)); ctx.font = `700 ${size}px Lora, serif`; w = toks.reduce((a, x) => a + ctx.measureText(x.t).width, 0); }
  let x = (W - w) / 2; ctx.textAlign = 'left';
  const live = SG.phase !== 'idle' && SG.phase !== 'done';
  for (const tk of toks) { ctx.fillStyle = !live ? 'rgba(255,255,255,.85)' : tk.i < gi ? '#FFD27A' : tk.i === gi && now >= -.2 ? '#FFFFFF' : 'rgba(255,255,255,.45)'; ctx.fillText(tk.t, x, bot + 46); x += ctx.measureText(tk.t).width; }
  if (k + 1 < s.ph.length && (SG.mode === 'whole' || SG.unitAll)) { const nt = line(k + 1).map(x => x.t).join(''); ctx.font = '600 12px Manrope, system-ui'; ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.textAlign = 'center'; ctx.fillText(nt.length > 60 ? nt.slice(0, 58) + '...' : nt, W / 2, bot + 66); }
}
function rrect(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// установщики для моста window (переходный период, см. main.js)
export function __set_SG(v) { SG = v; }
export function __set_SONG_FAKE(v) { SONG_FAKE = v; }

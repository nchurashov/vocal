import { act, onChange } from '../core/actions.js';
import { VA } from '../core/analysis.js';
import { MIC_DIRECT, ac, afterMic, base, noteShort, openMic, stopAll, strictOct, tone } from '../core/audio.js';
import { afterHooks, go, render } from '../core/router.js';
import { save, state } from '../core/store.js';
import { closeSheet, sheet, toast } from '../core/ui.js';
import { $, ICON, esc, nowLocal, plural, setBusy, uid } from '../core/util.js';
import { BUILTIN_SONGS } from '../data/songs.js';
import { camOn, camRecStop, camRecording, camSession, camStart, camToggleHTML } from './cam.js';
import { lastRange } from './register.js';
import { midiCandidates, normalizeSong, parseMidi, phraseNotes, phraseWords, songFromMidi, songFromSegs, songScorer, songShift, songTargets } from './songlib.js';

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
  (SG.timers || []).forEach(clearTimeout); SG.timers = []; stopAll(); SG.playing = false; SG.win = null; cancelAnimationFrame(SG.raf);
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

// --- разучивание
export function viewSong(id) {
  songStop();
  const s = songById(id);
  SG = { s, k: 0, mode: MIC_DIRECT && state.settings.songMode === 'whole' ? 'whole' : 'phrase', res: {}, timers: [], tries: 0 };
  const p = (state.songs || {})[s.id]; if (p) { const k = s.ph.findIndex((_, i) => (p.ph[i] || 0) < 80); SG.k = k < 0 ? 0 : k; }
  afterHooks.push(songDraw); afterHooks.push(() => { if (camOn()) camStart(); });
  const sh = songShiftOf(s), ms = s.notes.map(n => n.m), r = lastRange(), tp = songTempo();
  return `<button class="back" ${act('go', 'songs')}>${ICON.back} Песни</button><h1>${esc(s.title)}</h1>
    <p class="muted" style="margin:6px 0 0">${s.ph.length} ${plural(s.ph.length, 'фраза', 'фразы', 'фраз')} · ${noteShort(Math.min(...ms) + sh)} - ${noteShort(Math.max(...ms) + sh)}${s.by ? ' · ' + esc(s.by) : ''}</p>
    <div class="card sec stack" style="padding:12px 14px">
      <div class="row" style="gap:8px"><span class="small" style="flex:1">Тональность: <b>${shiftText(sh)}</b></span>
        <button class="iconbtn" ${act('songShiftBy', -1)} title="Ниже">−</button><button class="iconbtn" ${act('songShiftBy', 1)} title="Выше">+</button></div>
      <div class="tiny muted" style="margin-top:-6px">${r ? `Подобрал под твой диапазон ${noteShort(songWin()[0])} - ${noteShort(songWin()[1])}.` : `Подобрал рядом с ${noteShort(base())}. <a href="#range">Замерь диапазон</a>, чтобы песня встала точно под голос.`} Неудобно - сдвинь на полутон.</div>
      <div class="seg"><button class="${tp < 1 ? 'on' : ''}" ${act('songSetTempo', .75)}>Медленно</button><button class="${tp >= 1 ? 'on' : ''}" ${act('songSetTempo', 1)}>Как в песне</button></div>
      ${MIC_DIRECT ? `<div class="seg"><button class="${SG.mode === 'phrase' ? 'on' : ''}" ${act('songSetMode', 'phrase')}>По фразам</button><button class="${SG.mode === 'whole' ? 'on' : ''}" ${act('songSetMode', 'whole')}>Целиком</button></div>
      <div class="tiny muted" style="margin-top:-6px">${SG.mode === 'phrase' ? 'Пианино играет фразу, потом тишина: повтори. Чисто - идём дальше, нет - ещё раз.' : 'Пианино даёт первую ноту, дальше поёшь всю песню сам, без подсказки. Микрофон идёт за тобой по нотам.'}</div>` : '<div class="tiny muted">Здесь микрофон закрыт: можно слушать фразы и подпевать. Проверка нот - на сайте или в приложении.</div>'}
    </div>
    ${camToggleHTML()}
    <div id="sgbox" class="sec"></div>
    ${s.src !== 'builtin' ? `<button class="btn ghost block sec" style="color:var(--bad)" ${act('songAskDel', s.id)}>Удалить песню</button>` : ''}`;
}
export function songShiftBy(d) { const s = SG && SG.s; if (!s) return; prog(s.id).shift = songShiftOf(s) + d; save(); render(); }
export function songSetTempo(v) { state.settings.songTempo = v; save(); render(); }
export function songSetMode(m) { state.settings.songMode = m; save(); render(); }
export function songGoPhrase(k) { if (!SG) return; songPause(); SG.k = k; SG.tries = 0; songDraw(); }
export function songNext() { if (!SG) return; songPause(); SG.tries = 0; if (SG.k < SG.s.ph.length - 1) SG.k++; songDraw(); }
function songPause() { if (!SG) return; (SG.timers || []).forEach(clearTimeout); SG.timers = []; stopAll(); SG.playing = false; SG.win = null; }
const lineOf = (s, notes, sh) => esc(phraseWords(notes)) || notes.map(n => nm(n.m + sh)).join(' ');
function phraseChips() {
  const s = SG.s, p = (state.songs || {})[s.id] || { ph: {} };
  return `<div class="row wrap" style="gap:6px">${s.ph.map((_, k) => { const v = p.ph[k]; return `<button class="chip ${v >= 80 ? 'ok' : v ? 'near' : ''}" style="border:${k === SG.k && SG.mode === 'phrase' ? '2px solid var(--accent)' : '0'}" ${act('songGoPhrase', k)}>${k + 1}${v >= 80 ? ' ✓' : v ? ' ' + v + '%' : ''}</button>`; }).join('')}</div>`;
}
export function songDraw() {
  const box = $('#sgbox'); if (!box || !SG || !SG.s) return;
  const s = SG.s, sh = songShiftOf(s);
  if (SG.mode === 'whole') {
    const p = (state.songs || {})[s.id], r = SG.res.whole;
    box.innerHTML = `<div class="card stack"><div class="tiny muted">Вся песня${p && p.whole ? ` · лучший результат ${p.whole}%` : ''}</div>
      <div id="sgline" style="font:700 22px Lora,serif;min-height:30px">${SG.playing ? '' : lineOf(s, phraseNotes(s, 0), sh)}</div><div id="sgnext" class="small muted" style="min-height:20px"></div>
      <div id="sgnow" class="small muted" style="min-height:20px">${SG.playing ? '' : 'Нажми «Начать»: прозвучит первая нота, и пой.'}</div>
      ${songRoll(s.notes, r ? r.hitNotes : null, sh)}
      ${r ? `<div class="score"><div class="s"><b>${r.pct}%</b><span class="small muted">нот чисто</span></div><div class="s"><b>${r.n}/${r.total}</b><span class="small muted">нот</span></div></div>` : ''}
      <button class="btn block" ${act('songPlay')}>${SG.playing ? ICON.stop + ' Готово' : ICON.play + (r ? ' Ещё раз' : ' Начать')}</button></div>
      <div class="sec">${phraseChips()}</div>`;
    return;
  }
  const notes = phraseNotes(s, SG.k), r = SG.res[SG.k];
  box.innerHTML = `<div class="card stack"><div class="tiny muted">Фраза ${SG.k + 1} из ${s.ph.length}</div>
    <div style="font:700 22px Lora,serif">${lineOf(s, notes, sh)}</div>
    ${phraseWords(notes) ? `<div class="small muted">${notes.map(n => nm(n.m + sh)).join(' ')}</div>` : ''}
    ${songRoll(notes, r ? r.hitNotes : null, sh)}
    <div id="sgnow" class="small" style="min-height:20px">${r ? (r.ok ? `<b style="color:var(--ok)">Чисто: ${r.n} из ${r.total}</b>` : `<b style="color:var(--near)">${r.n} из ${r.total}.</b> Красные ноты - мимо или не услышал.`) : ''}</div>
    <div class="row"><button class="btn" style="flex:1" id="sgplay" ${act('songPlay')}>${SG.playing ? ICON.stop + ' Пауза' : ICON.play + (MIC_DIRECT ? (r ? ' Ещё раз' : ' Начать') : ' Послушать')}</button><button class="btn ghost" ${act('songNext')}>Дальше ›</button></div></div>
    <div class="sec">${phraseChips()}</div>`;
}
// микрофон: открывается один раз на всё занятие
export async function songEnsureMic() {
  if (SG.stream) return true;
  let stream; try { stream = await openMic(); } catch (e) { toast('Нет доступа к микрофону. Можно слушать и подпевать без проверки.'); return false; }
  const c = ac(); SG.stream = stream; setBusy(true);
  const an = c.createAnalyser(); an.fftSize = 4096; c.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize), hist = [];
  const loop = () => {
    if (!SG || !SG.stream) return;
    an.getFloatTimeDomainData(buf);
    hist.push(VA.livePitch(buf, c.sampleRate)); if (hist.length > 3) hist.shift();
    const v = hist.filter(x => x != null), m = v.length >= 2 ? VA.median(v) : null;
    songFrame(c.currentTime, m);
    SG.raf = requestAnimationFrame(loop);
  };
  loop();
  return true;
}
// один кадр голоса (живой микрофон или тест): идёт в проверку, только пока открыто окно ответа
export function songFrame(now, m) {
  const w = SG && SG.win; if (!w || now < w.t0 || now > w.t1) return;
  w.S.push(now, m);
  const el = $('#sgnow'); if (el) el.textContent = m == null ? (SG.mode === 'whole' ? 'Пой' : 'Твоя очередь') : 'Слышу ' + nm(m);
  if (SG.mode === 'whole') songFollow(w);
  if (w.S.j >= w.T.length && !w.early) { w.early = true; songAt(.5, songFinish); } // всё спето - не ждём конца окна
}
// «Целиком»: строчка, на которой сейчас поёшь, по засчитанным нотам
function songFollow(w) {
  const s = SG.s, sh = songShiftOf(s), ni = w.S.j < w.T.length ? w.T[w.S.j].idx[0] : s.notes.length - 1;
  let k = 0; while (k + 1 < s.ph.length && s.ph[k + 1] <= ni) k++;
  if (w.line === k) return; w.line = k;
  const a = $('#sgline'), b = $('#sgnext');
  if (a) a.innerHTML = lineOf(s, phraseNotes(s, k), sh);
  if (b) b.innerHTML = k + 1 < s.ph.length ? lineOf(s, phraseNotes(s, k + 1), sh) : '';
}
const songAt = (sec, f) => SG.timers.push(setTimeout(() => { if (SG && SG.playing) f(); }, sec * 1000 / (window.SONG_SPEED || 1)));
export const songPanel = () => { const s = SG && SG.s; if (!s) return { big: '' }; const notes = SG.mode === 'whole' ? null : phraseNotes(s, SG.k); return { top: `Песня · ${s.title}`, big: notes ? phraseWords(notes) || notes.map(n => nm(n.m + songShiftOf(s))).join(' ') : ($('#sgline') || {}).textContent || '', sub: ($('#sgnow') || {}).textContent || '' }; };
export async function songPlay() {
  if (!SG || !SG.s) return;
  if (SG.playing) { if (SG.mode === 'whole' && SG.win) { songFinish(); return; } songPause(); songDraw(); return; }
  const s = SG.s, sh = songShiftOf(s), tp = songTempo();
  if (MIC_DIRECT) await songEnsureMic();
  if (camOn() && !camRecording() && SG.stream) await camSession('Песня', songPanel, SG.stream);
  const c = ac(), t0 = c.currentTime + .15;
  SG.playing = true; songDraw();
  const say = t => { const el = $('#sgnow'); if (el) el.textContent = t; };
  if (SG.mode === 'whole') {
    // первая нота (и аккорд-опора), потом окно на всю песню с запасом
    const m0 = s.notes[0].m + sh;
    [0, 4, 7].forEach(x => tone(m0 + x, t0, 1.2, .05)); tone(m0, t0, 1.4, .2);
    const dur = (s.notes[s.notes.length - 1].t + s.notes[s.notes.length - 1].d - s.notes[0].t) / tp;
    const w0 = t0 + 1.7, w1 = w0 + dur * 1.6 + 4, T = songTargets(s.notes, tp);
    say('Первая нота: ' + nm(m0));
    songAt(w0 - t0, () => { SG.win = { t0: w0, t1: w1, T, S: songScorer(T, strictOct(), sh), line: -1 }; say('Пой!'); songFollow(SG.win); });
    songAt(w1 - t0 + .05, songFinish);
    return;
  }
  const notes = phraseNotes(s, SG.k);
  say('Слушай');
  const end = playNotes(notes, sh, tp, t0);
  if (!SG.stream) { songAt(end - t0 + .3, () => { SG.playing = false; songDraw(); }); return; }
  const w0 = end + .25, w1 = w0 + (end - t0) * 1.3 + 1.5, T = songTargets(notes, tp);
  songAt(w0 - t0, () => { SG.win = { t0: w0, t1: w1, T, S: songScorer(T, strictOct(), sh) }; say('Твоя очередь'); });
  songAt(w1 - t0 + .05, songFinish);
}
// итог окна ответа: сохраняем лучший результат; по фразам - дальше сам (чисто) или ещё раз (до 3 попыток)
export function songFinish() {
  const w = SG && SG.win; if (!w) return;
  SG.win = null; (SG.timers || []).forEach(clearTimeout); SG.timers = [];
  const s = SG.s, r = w.S.result(), hitNotes = [];
  w.T.forEach((x, q) => x.idx.forEach(i => { hitNotes[i] = r.hit[q]; }));
  const p = prog(s.id); p.plays = (p.plays || 0) + 1; p.last = nowLocal();
  if (SG.mode === 'whole') {
    SG.res.whole = { ...r, hitNotes }; p.whole = Math.max(p.whole || 0, r.pct);
    // по фразам тоже засчитываем: фраза спета в песне целиком - она выучена
    s.ph.forEach((_, k) => { const [a, b] = [s.ph[k], k + 1 < s.ph.length ? s.ph[k + 1] : s.notes.length]; let n = 0; for (let i = a; i < b; i++) if (hitNotes[i]) n++; p.ph[k] = Math.max(p.ph[k] || 0, Math.round(100 * n / (b - a))); });
    save(); SG.playing = false; songDraw();
    if (camRecording()) camRecStop(`${r.pct}% нот`);
    return;
  }
  const off = s.ph[SG.k];
  SG.res[SG.k] = { ...r, hitNotes: hitNotes.slice(off) };
  p.ph[SG.k] = Math.max(p.ph[SG.k] || 0, r.pct); save();
  SG.tries++;
  const last = SG.k >= s.ph.length - 1;
  if (r.ok && !last) { SG.k++; SG.tries = 0; SG.playing = true; songDraw(); const el = $('#sgnow'); if (el) el.innerHTML = `<b style="color:var(--ok)">Чисто! Следующая фраза...</b>`; songAt(1.6, () => { SG.playing = false; songPlay(); }); SG.playing = true; return; }
  if (!r.ok && SG.tries < 3) { SG.playing = true; songDraw(); songAt(1.6, () => { SG.playing = false; songPlay(); }); SG.playing = true; return; }
  SG.playing = false; songDraw();
  if (r.ok && last) {
    const el = $('#sgnow'); if (el) el.innerHTML = `<b style="color:var(--ok)">Последняя фраза чисто!</b> Теперь попробуй всю песню: переключи на «Целиком».`;
    if (camRecording()) camRecStop(`${learned(s)} из ${s.ph.length} фраз`);
  }
}

// установщики для моста window (переходный период, см. main.js)
export function __set_SG(v) { SG = v; }

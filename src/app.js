// ===== Утилиты =====
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ymd = (d = new Date()) => { const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };
const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)); };
const daysBetween = (a, b) => { const p = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }; return Math.round((p(b) - p(a)) / 864e5); };
const nowLocal = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return ymd(d) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds()); };
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const fmtDay = key => { const [y, m, d] = key.split('-').map(Number); const t = ymd(); if (key === t) return 'Сегодня'; if (key === addDays(t, -1)) return 'Вчера'; return d + ' ' + MONTHS[m - 1] + (y !== new Date().getFullYear() ? ' ' + y : ''); };
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
const exById = id => EXERCISES.find(e => e.id === id) || MELODIES.find(m => m.id === id);
const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};

// ===== Звук =====
let AC = null, master = null, wave = null, playing = [];
// iPhone: в беззвучном режиме Safari глушит Web Audio. Переводим звук в режим «проигрывание», как у музыки
let iosUnlocked = false;
function unlockIOS() {
  if (iosUnlocked || window.Capacitor || micOn) return; iosUnlocked = true;
  if (!AC) setSession('playback');
  try {
    // для старых iOS: короткий тихий звук через обычный <audio> переключает режим звука
    const a = new Audio('data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    a.setAttribute('playsinline', ''); a.volume = 0.01; const pr = a.play(); if (pr && pr.catch) pr.catch(() => { });
  } catch (e) { }
}
document.addEventListener('pointerdown', unlockIOS, { capture: true });
document.addEventListener('touchend', unlockIOS, { capture: true });
function ac() {
  unlockIOS();
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createDynamicsCompressor(); master.connect(AC.destination);
    const real = new Float32Array([0, 1, .45, .25, .12, .08, .04]), imag = new Float32Array(real.length);
    wave = AC.createPeriodicWave(real, imag);
  }
  if (AC.state !== 'running') {
    const r = AC.resume(); if (r && r.catch) r.catch(() => { });
    // если движок так и не проснулся, к следующему нажатию создаём новый
    clearTimeout(resumeWatch); const dead = AC;
    resumeWatch = setTimeout(() => { if (AC === dead && AC.state !== 'running' && !busy && !micOn) resetAudio(); }, 700);
  }
  return AC;
}
// iOS 26: у сайтов на экране «Домой» звук после сворачивания часто «зависает».
// Закрываем звуковой движок, когда приложение уходит в фон, и создаём новый при следующем нажатии
function setSession(t) { try { if (!window.Capacitor && navigator.audioSession) navigator.audioSession.type = t; } catch (e) { } }
// после микрофона: закрываем движок и только потом возвращаем режим «проигрывание» (менять его на ходу в Safari глушит звук)
function afterMic() { micOn = false; resetAudio(); setSession('playback'); }
// перед микрофоном: закрываем движок, ставим режим «запись и проигрывание» и только потом создаём новый движок.
// Раньше движок в режиме «проигрывание» жил во время записи: iOS его глушил, а сторож через 0.7 с закрывал его прямо под игрой
let micOn = false;
async function openMic() {
  stopAll(); resetAudio(); micOn = true; setSession('play-and-record');
  const c = ac();
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    if (c.state !== 'running') { const r = c.resume(); if (r && r.catch) r.catch(() => { }); }
    return s;
  } catch (e) { afterMic(); throw e; }
}
function resetAudio() { try { if (AC) AC.close(); } catch (e) { } AC = null; master = null; wave = null; noiseBuf = null; iosUnlocked = false; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && !busy && !micOn) resetAudio(); });
window.addEventListener('pageshow', e => { if (e.persisted) resetAudio(); });
let resumeWatch = 0;
function stopAll() { playing.forEach(n => { try { n.stop(); } catch (e) { } }); playing = []; }
function tone(midi, t, dur, vol = .22) {
  const c = ac(), o = c.createOscillator(), g = c.createGain();
  o.setPeriodicWave(wave); o.frequency.value = VA.midiToHz(midi);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .015);
  g.gain.exponentialRampToValueAtTime(vol * .55, t + .25);
  g.gain.setValueAtTime(vol * .55, Math.max(t + .26, t + dur - .08));
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + .02); playing.push(o);
}
function click(t, accent) {
  const c = ac(), o = c.createOscillator(), g = c.createGain();
  o.type = 'square'; o.frequency.value = accent ? 1600 : 1050;
  g.gain.setValueAtTime(accent ? .18 : .11, t); g.gain.exponentialRampToValueAtTime(.0001, t + .04);
  o.connect(g).connect(master); o.start(t); o.stop(t + .05); playing.push(o);
}
let noiseBuf = null;
function clap(t) {
  const c = ac();
  if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate * .2, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 1.2;
  g.gain.setValueAtTime(.55, t); g.gain.exponentialRampToValueAtTime(.001, t + .13);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + .15); playing.push(s);
}
const base = () => state.settings.base;
const strictOct = () => !!state.settings.strict;
// полное имя ноты: «Ля большой октавы (A2)»
const OCT_RU = ['субконтроктавы', 'контроктавы', 'большой октавы', 'малой октавы', 'первой октавы', 'второй октавы', 'третьей октавы'];
const LAT = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function noteFull(m) { m = Math.round(m); const o = Math.floor(m / 12) - 1; return `${VA.noteName(m)} ${OCT_RU[o] || ''} (${LAT[m % 12]}${o})`; }
const noteShort = m => { m = Math.round(m); return LAT[m % 12] + (Math.floor(m / 12) - 1); };
const BASE_MIN = 36, BASE_MAX = 76;
function playNotes(notes, bpm, offset = 0) {
  stopAll(); const c = ac(), b = 60 / bpm; let t = c.currentTime + .08;
  for (const [s, beats] of notes) { tone(base() + s + offset, t, beats * b * .95); t += beats * b; }
  return t - c.currentTime;
}
function playRhythm(ex, withClaps = true) {
  stopAll(); const c = ac(), b = 60 / ex.bpm, t0 = c.currentTime + .1;
  const beats = Math.ceil(Math.max(...ex.onsets) + 1);
  const bars = Math.ceil(beats / 4) * 4;
  for (let i = 0; i < 4 + bars; i++) click(t0 + i * b, i % 4 === 0);
  if (withClaps) ex.onsets.forEach(o => clap(t0 + (4 + o) * b));
  return { t0, b, end: t0 + (4 + bars) * b };
}

// Октава голоса: определяется по первым нотам и дальше не меняется,
// чтобы мужской и женский голос подходили, но нижнее и верхнее До различались
// collect=false: кадр не идёт в определение октавы (например, до первой ноты микрофон слышит подсказку пианино из динамика)
// ===== Высота работы и диапазон =====
function setVoice(m) { state.settings.base = m; state.settings.voiceSet = true; save(); render(); }
function setBase(m) {
  state.settings.base = Math.max(BASE_MIN, Math.min(BASE_MAX, m)); state.settings.voiceSet = true; save(); render();
  if ($('#sheet')) openSettings();
}
function setStrict(on) { state.settings.strict = !!on; save(); render(); if ($('#sheet')) openSettings(); }
const lastRange = () => (state.range || [])[(state.range || []).length - 1];
function rangeWarn() {
  const r = lastRange(); if (!r) return '';
  const lo = base(), hi = base() + 12;
  if (lo < r.lo) return `<div class="tiny" style="color:var(--bad)">Нижняя нота ниже твоего замеренного диапазона (${noteShort(r.lo)} - ${noteShort(r.hi)}). Не дави, пой мягко.</div>`;
  if (hi > r.hi) return `<div class="tiny" style="color:var(--near)">Верх уровней (до ${noteShort(hi)}) выше твоего замеренного диапазона (${noteShort(r.lo)} - ${noteShort(r.hi)}). На самых высоких нотах можно не дотянуть.</div>`;
  return '';
}
// карточка «где работаем»: на экранах игр и в настройках
function registerCard(inSheet) {
  const r = lastRange();
  return `<div class="card ${inSheet ? '' : 'sec'} stack" style="padding:14px;${inSheet ? '' : 'margin-top:10px'}">
    <div class="row between"><b>Где работаем</b>${r ? `<span class="tiny muted">диапазон ${noteShort(r.lo)} - ${noteShort(r.hi)}</span>` : ''}</div>
    <div class="row"><button class="btn ghost" style="min-width:46px;padding:0" aria-label="Ниже на полутон" onclick="setBase(base()-1)">−</button>
      <div style="flex:1;text-align:center"><div style="font-weight:800">${noteFull(base())}</div><div class="tiny muted">уровни идут от неё вверх до ${noteShort(base() + 12)}</div></div>
      <button class="btn ghost" style="min-width:46px;padding:0" aria-label="Выше на полутон" onclick="setBase(base()+1)">+</button></div>
    <div class="row wrap" style="gap:6px"><button class="btn ghost" style="flex:1;min-height:38px;padding:6px 10px" onclick="setBase(base()-12)">Октавой ниже</button><button class="btn ghost" style="flex:1;min-height:38px;padding:6px 10px" onclick="setBase(base()+12)">Октавой выше</button><button class="btn ghost" style="min-height:38px;padding:6px 10px" aria-label="Послушать ноту" onclick="playNotes([[0,2]],80)">${ICON.play}</button></div>
    <label class="check" style="border:0;padding:0"><input type="checkbox" ${strictOct() ? 'checked' : ''} onchange="setStrict(this.checked)"><span class="small"><b>Только в этой октаве.</b> Для работы над регистром: октавой выше или ниже не засчитается.${strictOct() ? '' : ' Сейчас подходит любая октава.'}</span></label>
    ${rangeWarn()}
    <a href="#range" class="small" ${inSheet ? 'onclick="closeSheet()"' : ''}>${r ? 'Замерить диапазон заново' : 'Замерить мой диапазон'}</a></div>`;
}
// подсказка на экранах игр: при первом заходе - выбор голоса, потом - карточка высоты
function octaveHint() {
  if (!state.settings.voiceSet && base() === 48 && !lastRange()) return `<div class="card sec" style="padding:14px;margin-top:10px"><div><b>Какой у тебя голос?</b></div><div class="small muted" style="margin:4px 0 10px">Подсказки зазвучат в твоей высоте. Потом можно поменять или <a href="#range">замерить диапазон</a>.</div>
    <div class="row">${[[48, 'Низкий', 'мужской, от C3'], [60, 'Высокий', 'женский, от C4']].map(([m, t, d]) => `<button class="btn ghost" style="flex:1;flex-direction:column;gap:2px" onclick="setVoice(${m})"><span>${t}</span><span class="tiny muted" style="font-weight:500">${d}</span></button>`).join('')}</div></div>`;
  return registerCard(false);
}
function octLock(S, v, target, collect = true) {
  if (strictOct()) return v;
  if (S.oct == null) {
    if (collect) (S.octBuf ||= []).push(v - target);
    if (S.octBuf.length >= 8) S.oct = 12 * Math.round(VA.median(S.octBuf) / 12);
    return v - 12 * Math.round((v - target) / 12);
  }
  return v - S.oct;
}
// ===== Хранилище =====
const DEFAULT = () => ({ v: 1, settings: { base: 48, latency: 0 }, sessions: [], srs: {}, notes: [], game: { best: {}, plays: [] }, ball: { best: {}, plays: [] } });
let state = DEFAULT();
const store = { mode: 'none', db: null, uid: null, timer: null, chain: Promise.resolve(), lastSessionsJSON: '', lastStateJSON: '' };
try { const raw = localStorage.getItem('vocal-practice'); if (raw) { state = Object.assign(DEFAULT(), JSON.parse(raw)); store.mode = 'local'; } } catch (e) { }
function save() {
  try { localStorage.setItem('vocal-practice', JSON.stringify(state)); if (store.mode === 'none') store.mode = 'local'; } catch (e) { }
  if (!store.db) return;
  clearTimeout(store.timer);
  store.timer = setTimeout(pushDb, 700);
}
function pushDb() {
  const sJSON = JSON.stringify({ sessions: state.sessions });
  const stJSON = JSON.stringify({ v: state.v, settings: state.settings, srs: state.srs, notes: state.notes, game: state.game, ball: state.ball });
  const root = 'data/users/' + store.uid;
  store.chain = store.chain.then(async () => {
    try {
      if (stJSON !== store.lastStateJSON) { await store.db.doc(root + '/state').set(JSON.parse(stJSON)); store.lastStateJSON = stJSON; }
      if (sJSON !== store.lastSessionsJSON) {
        if (sJSON.length > 240000) toast('История почти заполнила хранилище. Скопируй данные в настройках.');
        await store.db.doc(root + '/sessions').set(JSON.parse(sJSON)); store.lastSessionsJSON = sJSON;
      }
      store.mode = 'cloud';
    } catch (e) { store.mode = 'local'; console.warn('db', e); }
    updateSaveBadge();
  });
}
async function initDb() {
  if (!window.claude || !window.claude.use) return;
  try {
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user) return;
    const id = await user.id(); if (!id) return;
    store.db = db; store.uid = id;
    const root = 'data/users/' + id;
    const [a, b] = await Promise.all([db.doc(root + '/state').get(), db.doc(root + '/sessions').get()]);
    if (a.exists || b.exists) {
      const st = a.exists ? a.data() : {}, ss = b.exists ? b.data() : {};
      state = Object.assign(DEFAULT(), JSON.parse(JSON.stringify(st)), { sessions: JSON.parse(JSON.stringify(ss.sessions || [])) });
      state.settings = Object.assign(DEFAULT().settings, state.settings || {});
      state.game ||= { best: {}, plays: [] }; state.ball ||= { best: {}, plays: [] };
      store.lastStateJSON = JSON.stringify({ v: state.v, settings: state.settings, srs: state.srs, notes: state.notes, game: state.game, ball: state.ball });
      store.lastSessionsJSON = JSON.stringify({ sessions: state.sessions });
      try { localStorage.setItem('vocal-practice', JSON.stringify(state)); } catch (e) { }
      store.mode = 'cloud';
      if (!busy) render();
    } else {
      store.mode = 'cloud';
      if (state.sessions.length || state.notes.length) pushDb();
    }
    updateSaveBadge();
  } catch (e) { console.warn('db init', e); }
}
function updateSaveBadge() { const el = $('#savebadge'); if (el) el.textContent = saveText(); }
const saveText = () => store.mode === 'cloud' ? 'Данные сохраняются в твоём аккаунте и доступны с любого устройства.' : store.mode === 'local' ? 'Данные сохраняются только в этом браузере.' : 'Сохранение недоступно: данные пропадут после закрытия.';

// ===== Логика уровней и повторений =====
const NEED_CONF = 3, NEED_DAYS = 2;
function levelInfo(cat) {
  let open = 1, passed = 0; const prog = {};
  for (let L = 1; L <= 3; L++) {
    const conf = state.sessions.filter(s => s.cat === cat && s.level === L && s.rating === 3);
    const days = new Set(conf.map(s => s.date.slice(0, 10))).size;
    prog[L] = { conf: conf.length, days };
    if (conf.length >= NEED_CONF && days >= NEED_DAYS) { passed = L; open = Math.min(3, L + 1); } else break;
  }
  const any = state.sessions.some(s => s.cat === cat);
  return { open, passed, prog: prog[open] || { conf: 0, days: 0 }, any, done3: passed === 3 };
}
function isUnlocked(ex) { return ex.level <= levelInfo(ex.cat).open; }
function srsUpdate(exId, rating) {
  const today = ymd(), cur = state.srs[exId] || { box: 0 };
  let box = cur.box, interval;
  if (rating === 3) { box = Math.min(box + 1, 5); interval = [1, 2, 4, 7, 14, 30][box]; }
  else if (rating === 2) { interval = 2; }
  else { box = 0; interval = 1; }
  state.srs[exId] = { box, due: addDays(today, interval), last: today, lastRating: rating };
  return interval;
}
function dueList() {
  const t = ymd();
  return EXERCISES.filter(e => state.srs[e.id] && state.srs[e.id].due <= t && isUnlocked(e))
    .sort((a, b) => (state.srs[a.id].lastRating - state.srs[b.id].lastRating) || state.srs[a.id].due.localeCompare(state.srs[b.id].due));
}
function freshList() {
  const out = [];
  for (const cat of Object.keys(CATS)) {
    const lv = levelInfo(cat).open;
    const e = EXERCISES.find(x => x.cat === cat && x.level <= lv && !state.srs[x.id]);
    if (e) out.push(e);
  }
  return out;
}
function streak() {
  const days = new Set(state.sessions.map(s => s.date.slice(0, 10)));
  let n = 0, d = ymd(); if (!days.has(d)) d = addDays(d, -1);
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
const suggestRating = score => score >= 80 ? 3 : score >= 50 ? 2 : 1;
function pitchAssessment() {
  const checks = state.sessions.filter(s => s.auto && s.auto.type === 'melody');
  let best = null;
  for (const s of checks) if (s.auto.score >= 80 && (!best || s.level > best.level || (s.level === best.level && s.auto.score > best.auto.score))) best = s;
  return { checks, best };
}

// ===== Рендер: каркас =====
let busy = false; // идёт запись или проверка: не перерисовываем
const TABS = [
  ['today', 'Сегодня', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'],
  ['ball', 'Игра', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="6"/><path d="M7 10v4M5 12h4"/><circle cx="16" cy="11" r=".6" fill="currentColor"/><circle cx="18" cy="13.5" r=".6" fill="currentColor"/></svg>'],
  ['exercises', 'Упражнения', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'],
  ['check', 'Оценка', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/></svg>'],
  ['history', 'История', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/></svg>'],
  ['notes', 'Заметки', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h12l4 4v12H4z"/><path d="M8 10h8M8 14h8M8 18h5"/></svg>'],
];
let route = 'today', exFilter = 'all';
function readHash() {
  const h = location.hash.replace('#', '');
  if (h.startsWith('ex-') && exById(h.slice(3))) return h;
  if (/^(game|ball)-\d+$/.test(h) || h === 'game' || h === 'range') return h;
  return TABS.some(t => t[0] === h) ? h : 'today';
}
function go(r) { if (busy) stopRecordingIfAny(); location.hash = r; }
window.addEventListener('hashchange', () => { route = readHash(); render(); window.scrollTo(0, 0); });
function start() { state.game ||= { best: {}, plays: [] }; state.ball ||= { best: {}, plays: [] }; route = readHash(); render(); initDb(); }

function render() {
  if (typeof gameStop === 'function') gameStop();
  if (typeof ballStop === 'function') ballStop();
  if (typeof rangeStop === 'function') rangeStop();
  stopAll();
  const tabRoute = route.startsWith('ex-') ? 'exercises' : /^(game|ball)/.test(route) ? 'ball' : route;
  $('#tabs').innerHTML = '<div class="tabs-in">' + TABS.map(([k, n, ic]) => `<button class="tab ${tabRoute === k ? 'on' : ''}" onclick="go('${k}')">${ic}<span>${n}</span></button>`).join('') + '</div>';
  const v = $('#view');
  if (route.startsWith('ex-')) v.innerHTML = viewExercise(exById(route.slice(3)));
  else if (route.startsWith('game-')) v.innerHTML = viewGameLevel(+route.slice(5));
  else if (route.startsWith('ball-')) v.innerHTML = viewBallLevel(+route.slice(5));
  else v.innerHTML = ({ ball: viewBall, game: viewGame, today: viewToday, exercises: viewExercises, check: viewCheck, history: viewHistory, notes: viewNotes, range: viewRange })[route]();
  afterRender();
}
let afterHooks = [];
function afterRender() { const h = afterHooks; afterHooks = []; h.forEach(f => f()); }

// ===== Экран: Сегодня =====
function levelCard(cat) {
  const li = levelInfo(cat);
  const assessed = li.passed ? 'Подтверждён уровень ' + li.passed : li.any ? 'Подтверждённого уровня пока нет' : 'Уровень пока не определён';
  const p = li.prog, pct = li.done3 ? 100 : Math.round(100 * (Math.min(p.conf, NEED_CONF) + Math.min(p.days, NEED_DAYS)) / (NEED_CONF + NEED_DAYS));
  const next = li.done3 ? 'Все три уровня подтверждены' : `До ${li.open < 3 ? 'уровня ' + (li.open + 1) : 'подтверждения уровня 3'}: уверенно ${Math.min(p.conf, NEED_CONF)} из ${NEED_CONF}, дней ${Math.min(p.days, NEED_DAYS)} из ${NEED_DAYS}`;
  return `<div class="card lvl"><span class="chip ${cat}">${CATS[cat].name}</span>
    <div class="big">Открыт уровень ${li.open}</div>
    <div class="small muted">${assessed}</div>${cat === 'pitch' && pitchAssessment().best ? `<div class="small">По записи мелодии: уровень ${pitchAssessment().best.level} (${pitchAssessment().best.auto.score}%)</div>` : ''}
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="tiny muted">${next}</div></div>`;
}
function exItem(e, sub) {
  const locked = !isUnlocked(e);
  return `<button class="item ${locked ? 'locked' : ''}" onclick="go('ex-${e.id}')">
    <div class="dot ${e.cat}">${e.level}</div>
    <div class="t"><b>${esc(e.title)}</b><span class="small muted">${sub || esc(CATS[e.cat].name + ' · ' + e.min + ' мин')}</span>
    ${locked ? `<div class="lockline">🔒 Откроется после ${NEED_CONF} уверенных занятий уровня ${e.level - 1} за ${NEED_DAYS}+ дня</div>` : ''}</div>
    <span class="muted">›</span></button>`;
}
function viewToday() {
  const due = dueList(), fresh = freshList(), n7 = state.sessions.filter(s => daysBetween(s.date.slice(0, 10), ymd()) < 7).length, st = streak();
  const d = new Date();
  let h = `<h1>Сегодня</h1><div class="muted">${d.getDate()} ${MONTHS[d.getMonth()]}</div>`;
  if (!state.sessions.length) {
    h += `<div class="card sec stack"><h3>Привет! С чего начнём</h3>
      <p class="small" style="margin:0">Твой уровень пока не определён, и приложение ничего не додумывает. Оно отталкивается только от того, что ты сам отметишь после практики.</p>
      <p class="small" style="margin:0">Выбери любое упражнение уровня 1 или пройди <a href="#check">оценку по мелодии</a>: споёшь короткую мелодию, и запись покажет, какие ноты верные.</p>
      <button class="btn soft" onclick="go('range')">Замерить диапазон и выбрать ноту</button></div>`;
  } else {
    h += `<div class="row sec" style="margin-top:14px;gap:8px"><span class="pill">За 7 дней: ${n7} ${plural(n7, 'занятие', 'занятия', 'занятий')}</span><span class="pill">Дней подряд: ${st}</span></div>`;
  }
  { const g = state.ball || { best: {} }; const nx = BALL_LEVELS.find(l => ballUnlocked(l.n) && !(g.best[l.n]?.stars >= 1)) || BALL_LEVELS[BALL_LEVELS.length - 1];
    h += `<button class="item sec" style="margin-top:18px" onclick="go('ball-${nx.n}')"><div class="dot pitch">🟠</div><div class="t"><b>Шарик: уровень ${nx.n}, «${esc(nx.title)}»</b><span class="small muted">Пой ноту, чтобы пролететь в окно</span></div><span class="muted">›</span></button>`; }
  { const r = lastRange();
    h += `<button class="item" onclick="go('range')"><div class="dot ear">↕</div><div class="t"><b>${r ? 'Мой диапазон: ' + noteShort(r.lo) + ' - ' + noteShort(r.hi) : 'Замерить мой диапазон'}</b><span class="small muted">${r ? 'Последний замер ' + fmtDay(r.date.slice(0, 10)).toLowerCase() + ' · работаем от ' + noteShort(base()) + (strictOct() ? ', строго в октаве' : '') : 'Минута: узнаешь свой низ и верх и выберешь, где работать'}</span></div><span class="muted">›</span></button>`; }
  h += `<div class="sec"><h2>Повторить сегодня</h2>`;
  if (due.length) h += due.map(e => { const s = state.srs[e.id]; return exItem(e, `В прошлый раз: ${RATINGS[s.lastRating].label.toLowerCase()} · ${fmtDay(s.last).toLowerCase()}`); }).join('');
  else h += `<div class="card small muted">${state.sessions.length ? 'На сегодня повторов нет. Можно взять новое упражнение ниже.' : 'Повторы появятся после первых отметок: что не получилось, вернётся раньше, что получилось уверенно, реже.'}</div>`;
  h += `</div>`;
  if (fresh.length) h += `<div class="sec"><h2>Можно попробовать</h2>${fresh.map(e => exItem(e)).join('')}</div>`;
  h += `<div class="sec"><h2>Уровни</h2><div class="grid3">${Object.keys(CATS).map(levelCard).join('')}</div>
    <p class="tiny muted">Следующий уровень открывается только после ${NEED_CONF} отметок «Уверенно» на текущем уровне минимум за ${NEED_DAYS} разных дня.</p></div>`;
  return h;
}

// ===== Экран: Упражнения =====
function viewExercises() {
  let h = `<h1>Упражнения</h1><div class="sec" style="margin-top:14px"><div class="seg">` +
    [['all', 'Все'], ...Object.entries(CATS).map(([k, v]) => [k, v.name])].map(([k, n]) => `<button class="${exFilter === k ? 'on' : ''}" onclick="exFilter='${k}';render()">${n}</button>`).join('') + `</div></div>`;
  for (const L of [1, 2, 3]) {
    const list = EXERCISES.filter(e => e.level === L && (exFilter === 'all' || e.cat === exFilter));
    if (!list.length) continue;
    h += `<div class="sec"><h2>Уровень ${L}</h2>${list.map(e => {
      const s = state.srs[e.id];
      return exItem(e, s ? `${CATS[e.cat].name} · последний раз: ${RATINGS[s.lastRating].label.toLowerCase()}` : null);
    }).join('')}</div>`;
  }
  return h;
}

// ===== Экран упражнения =====
let run = null; // текущее занятие: { ex, auto, rating, crit }
function rollSVG(notes, result) {
  const n = notes.length, W = 640, H = 170, pad = 28;
  const semis = notes.map(x => x[0]);
  const sung = result ? result.notes.map(r => r.sung != null ? r.sung - result.offset - base() : null) : [];
  const all = semis.concat(sung.filter(v => v != null));
  let lo = Math.min(...all) - 1.5, hi = Math.max(...all) + 1.5; if (hi - lo < 8) { const m = (hi + lo) / 2; lo = m - 4; hi = m + 4; }
  const y = s => pad / 2 + (H - pad) * (1 - (s - lo) / (hi - lo));
  const totalBeats = notes.reduce((a, x) => a + x[1], 0);
  let x0 = 8; const bw = (W - 16) / totalBeats;
  let out = `<svg class="roll" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="Ноты мелодии">`;
  for (let s = Math.ceil(lo); s <= Math.floor(hi); s++) out += `<line x1="0" x2="${W}" y1="${y(s)}" y2="${y(s)}" stroke="var(--line)" stroke-width="${s % 12 === 0 ? 1.4 : .6}"/>`;
  notes.forEach(([s, b], i) => {
    const w = b * bw - 6;
    out += `<rect x="${x0}" y="${y(s) - 6}" width="${w}" height="12" rx="6" fill="var(--muted)" opacity=".35"/>`;
    out += `<text x="${x0 + 2}" y="${H + 14}" font-size="17" fill="var(--muted)" font-family="Manrope">${VA.noteName(base() + s)}</text>`;
    if (result) {
      const r = result.notes[i];
      if (r.sung != null) {
        const col = r.status === 'ok' ? 'var(--ok)' : r.status === 'near' ? 'var(--near)' : 'var(--bad)';
        out += `<rect x="${x0 + 4}" y="${y(sung[i]) - 4}" width="${Math.max(8, w - 8)}" height="8" rx="4" fill="${col}"/>`;
      } else out += `<text x="${x0 + w / 2}" y="${y(s) + 5}" font-size="16" text-anchor="middle" fill="var(--bad)" font-weight="800">×</text>`;
    }
    x0 += b * bw;
  });
  return out + '</svg>';
}
function viewExercise(ex) {
  if (!ex) return '<div class="empty">Упражнение не найдено</div>';
  const locked = !isUnlocked(ex);
  run = { ex, auto: null, rating: null, crit: new Set() };
  let h = `<button class="back" onclick="go('exercises')">${ICON.back} Все упражнения</button>
    <div class="row wrap" style="gap:6px"><span class="chip ${ex.cat}">${CATS[ex.cat].name}</span><span class="chip">Уровень ${ex.level}</span><span class="chip">${ex.min} мин</span></div>
    <h1 style="margin-top:10px">${esc(ex.title)}</h1><p class="muted" style="margin:6px 0 0">${esc(ex.goal)}</p>`;
  if (locked) h += `<div class="note sec">🔒 Это упражнение уровня ${ex.level}. Оно откроется после ${NEED_CONF} отметок «Уверенно» на уровне ${ex.level - 1} в разделе «${CATS[ex.cat].name}» за ${NEED_DAYS}+ дня. Можно прочитать, но в план оно пока не попадёт.</div>`;
  h += `<div class="card sec"><h3 style="margin-bottom:12px">Как делать</h3><ol class="steps">${ex.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>`;
  // Пример
  h += `<div class="card sec"><h3>Пример</h3>`;
  if (ex.kind === 'sing') h += `${rollSVG(ex.notes)}<div class="row wrap" style="margin-top:10px"><button class="btn" onclick="playNotes(exById('${ex.id}').notes, exById('${ex.id}').bpm)">${ICON.play} Послушать пример</button><button class="btn ghost" onclick="playNotes([exById('${ex.id}').notes[0]], 60)">Дать первую ноту</button></div>`;
  else if (ex.kind === 'tap') h += `<p class="small muted" style="margin:6px 0 10px">Сначала 4 щелчка отсчёта, потом рисунок: хлопки поверх метронома. Темп ${ex.bpm} ударов в минуту.</p>${rhythmSVG(ex)}<div class="row wrap" style="margin-top:10px"><button class="btn" onclick="playRhythm(exById('${ex.id}'))">${ICON.play} Послушать пример</button><button class="btn ghost" onclick="stopAll()">${ICON.stop} Стоп</button></div>`;
  else h += `<p class="small muted" style="margin:6px 0 10px">Так звучит один вопрос. В тренировке их будет 10.</p><button class="btn" onclick="quizSample('${ex.id}')">${ICON.play} Послушать пример</button>`;
  h += `</div>`;
  // Практика с проверкой
  h += `<div class="card sec" id="practice">${practiceIntro(ex)}</div>`;
  // Самопроверка
  h += `<div class="card sec"><h3>Проверь себя</h3><p class="small muted" style="margin:4px 0 6px">Отметь, что получилось. Это сохранится вместе с занятием.</p>
    ${ex.criteria.map((c, i) => `<label class="check"><input type="checkbox" onchange="toggleCrit(${i},this.checked)"><span>${esc(c)}</span></label>`).join('')}</div>`;
  // Отметка
  h += `<div class="card sec stack" id="ratebox"><h3>Как прошло?</h3><div id="ratehint" class="tiny muted"></div>
    <div class="rate">${[3, 2, 1].map(r => `<button class="r${r}" data-r="${r}" onclick="setRating(${r})"><span>${RATINGS[r].emo}</span>${RATINGS[r].label}</button>`).join('')}</div>
    <textarea id="sessnote" placeholder="Заметка к занятию: что мешало, что помогло (необязательно)"></textarea>
    <button class="btn block" id="savebtn" onclick="saveSession()" disabled>Сохранить занятие</button></div>`;
  const hist = state.sessions.filter(s => s.ex === ex.id).slice(-5).reverse();
  if (hist.length) h += `<div class="sec"><h2>Прошлые занятия</h2>${hist.map(sessionRow).join('')}</div>`;
  return h;
}
function practiceIntro(ex) {
  if (ex.kind === 'quiz') return `<h3>Тренировка с проверкой</h3><p class="small muted" style="margin:4px 0 12px">10 вопросов. После каждого ответа сразу видно, верно или нет.</p>${ex.quiz === 'interval' ? intervalRefs() : ''}<button class="btn block" onclick="startQuiz()">${ICON.play} Начать</button>`;
  if (ex.kind === 'sing') return `<h3>Проверка по записи</h3><p class="small muted" style="margin:4px 0 12px">Спой и запиши себя. Приложение найдёт каждую ноту и покажет, верно она спета, близко или мимо.</p><div id="recbox"></div>`;
  return `<h3>Проверка: отстучи ритм</h3><p class="small muted" style="margin:4px 0 12px">После 4 щелчков отсчёта стучи по кнопке (или пробелом). Хлопков в проверке не будет, только метроном.</p><div id="tapbox"></div>`;
}
function rhythmSVG(ex) {
  const beats = Math.ceil(Math.max(...ex.onsets) + 1), bars = Math.ceil(beats / 4) * 4, W = 640, H = 46, bw = (W - 20) / bars;
  let s = `<svg class="roll" viewBox="0 0 ${W} ${H}">`;
  for (let i = 0; i <= bars; i++) s += `<line x1="${10 + i * bw}" x2="${10 + i * bw}" y1="8" y2="${H - 8}" stroke="var(--line)" stroke-width="${i % 4 === 0 ? 2 : 1}"/>`;
  ex.onsets.forEach(o => s += `<circle cx="${10 + o * bw + 4}" cy="${H / 2}" r="7" fill="var(--rhythm)"/>`);
  return s + '</svg>';
}
function toggleCrit(i, on) { on ? run.crit.add(i) : run.crit.delete(i); }
function setRating(r) {
  run.rating = r;
  document.querySelectorAll('#ratebox .rate button').forEach(b => b.classList.toggle('on', +b.dataset.r === r));
  $('#savebtn').disabled = false;
}
function suggestFromAuto(score, label) {
  const r = suggestRating(score);
  if (run.rating == null) setRating(r);
  $('#ratehint').textContent = `По результату проверки (${label} ${score}%) предлагаю «${RATINGS[r].label}». Поменяй, если чувствуешь иначе.`;
}
function saveSession() {
  if (!run || !run.rating) return;
  const ex = run.ex, note = $('#sessnote').value.trim();
  const s = { id: uid(), ex: ex.id, cat: ex.cat || 'pitch', level: ex.level, date: nowLocal(), rating: run.rating, crit: [...run.crit], critTotal: (ex.criteria || []).length };
  if (note) s.note = note;
  if (run.auto) s.auto = run.auto;
  const before = levelInfo(s.cat).open;
  state.sessions.push(s);
  const days = run.ex.kind ? srsUpdate(ex.id, run.rating) : null;
  save();
  const after = levelInfo(s.cat).open;
  if (after > before) toast(`Открыт уровень ${after} в разделе «${CATS[s.cat].name}». Прогресс зафиксирован!`);
  else toast(days ? `Сохранено. Повторим ${days === 1 ? 'завтра' : 'через ' + days + ' ' + plural(days, 'день', 'дня', 'дней')}.` : 'Сохранено в историю.');
  go(run.ex.kind ? 'today' : 'history');
}

// ===== Слух: квиз =====
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const QUIZ_OPTS = {
  updown: ['Выше', 'Ниже'], samediff: ['Одинаковые', 'Разные'],
  contour: ['Вверх-вверх', 'Вниз-вниз', 'Вверх-вниз', 'Вниз-вверх'],
  interval: ['Терция', 'Квинта', 'Октава'], majmin: ['Мажор', 'Минор'],
};
function makeQ(ex) {
  const b = base() + rnd(0, 7), sp = ex.spread || [2, 4];
  switch (ex.quiz) {
    case 'updown': { const up = Math.random() < .5, d = rnd(sp[0], sp[1]); return { seq: [[b, 1], [b + (up ? d : -d), 1]], ans: up ? 0 : 1 }; }
    case 'samediff': { const same = Math.random() < .5, d = rnd(sp[0], sp[1]) * (Math.random() < .5 ? 1 : -1); return { seq: [[b, 1], [same ? b : b + d, 1]], ans: same ? 0 : 1 }; }
    case 'contour': { const k = rnd(0, 3), s1 = rnd(2, 4), s2 = rnd(2, 4); const d = [[1, 1], [-1, -1], [1, -1], [-1, 1]][k]; const m = b + 2; return { seq: [[m, .8], [m + d[0] * s1, .8], [m + d[0] * s1 + d[1] * s2, .8]], ans: k }; }
    case 'interval': { const k = rnd(0, 2), iv = [4, 7, 12][k]; const lo = base() + rnd(0, 4); return { seq: [[lo, 1], [lo + iv, 1]], ans: k }; }
    case 'majmin': { const k = rnd(0, 1), t = k ? 3 : 4; return { seq: [[b, .5], [b + t, .5], [b + 7, .5]], chord: [b, b + t, b + 7], ans: k }; }
  }
}
function playQ(q, bpm = 80) {
  stopAll(); const c = ac(), bt = 60 / bpm; let t = c.currentTime + .06;
  for (const [m, beats] of q.seq) { tone(m, t, beats * bt * .92); t += beats * bt; }
  if (q.chord) { t += .15; q.chord.forEach(m => tone(m, t, 1.4, .16)); }
}
function quizSample(id) { playQ(makeQ(exById(id))); }
function intervalRefs() {
  return `<div class="row wrap" style="margin-bottom:12px;gap:6px"><span class="small muted">Эталоны:</span>${['Терция', 'Квинта', 'Октава'].map((n, i) => `<button class="btn ghost" style="min-height:38px;padding:6px 12px" onclick="playQ({seq:[[base(),1],[base()+${[4, 7, 12][i]},1]]})">${n}</button>`).join('')}</div>`;
}
let quiz = null;
function startQuiz() { quiz = { i: 0, right: 0, mistakes: [], q: makeQ(run.ex), answered: false }; drawQuiz(); playQ(quiz.q); }
function drawQuiz() {
  const ex = run.ex, opts = QUIZ_OPTS[ex.quiz], el = $('#practice');
  if (quiz.i >= 10) {
    const score = quiz.right * 10;
    run.auto = { type: 'quiz', score, right: quiz.right, total: 10 };
    el.innerHTML = `<h3>Результат</h3><div class="score" style="margin-top:10px"><div class="s"><b>${quiz.right} из 10</b><span class="small muted">верных ответов</span></div></div>
      ${quiz.mistakes.length ? `<p class="small" style="margin:12px 0 4px"><b>Ошибки:</b></p><ul class="notes-list">${quiz.mistakes.map(m => `<li><span class="n">${m.n}</span><span>Ответ «${m.you}», а верно «${m.right}»</span></li>`).join('')}</ul>` : '<p class="small" style="margin:12px 0 0">Без ошибок 👏</p>'}
      <button class="btn ghost block" style="margin-top:12px" onclick="startQuiz()">Пройти ещё раз</button>`;
    suggestFromAuto(score, 'верных ответов');
    return;
  }
  el.innerHTML = `<div class="row between"><h3>Вопрос ${quiz.i + 1} из 10</h3><span class="small muted">Верно: ${quiz.right}</span></div>
    ${ex.quiz === 'interval' ? '<div style="margin-top:10px">' + intervalRefs() + '</div>' : ''}
    <div class="quizq"><button class="btn soft" onclick="playQ(quiz.q)">${ICON.play} Прослушать ещё раз</button></div>
    <div class="answers">${opts.map((o, k) => `<button data-k="${k}" onclick="answerQuiz(${k})">${o}</button>`).join('')}</div><div id="verdict"></div>`;
}
function answerQuiz(k) {
  if (quiz.answered) return; quiz.answered = true;
  const opts = QUIZ_OPTS[run.ex.quiz], ok = k === quiz.q.ans;
  if (ok) quiz.right++; else quiz.mistakes.push({ n: quiz.i + 1, you: opts[k], right: opts[quiz.q.ans] });
  document.querySelectorAll('.answers button').forEach(b => { const kk = +b.dataset.k; if (kk === quiz.q.ans) b.classList.add('right'); else if (kk === k) b.classList.add('wrong'); });
  $('#verdict').innerHTML = `<div class="verdict ${ok ? 'ok' : 'bad'}">${ok ? '✓ Верно' : '✗ Неверно. Правильный ответ: ' + opts[quiz.q.ans]}</div>
    <div class="row" style="margin-top:10px"><button class="btn ghost" onclick="playQ(quiz.q)">${ICON.play} Переслушать</button><button class="btn" style="flex:1" onclick="nextQuiz()">Дальше</button></div>`;
}
function nextQuiz() { quiz.i++; quiz.answered = false; if (quiz.i < 10) { quiz.q = makeQ(run.ex); drawQuiz(); playQ(quiz.q); } else drawQuiz(); }

// ===== Запись и проверка голоса =====
let rec = null;
// Внутри Claude страница открыта в защищённой рамке без микрофона: тогда пишем через камеру/диктофон телефона
const MIC_DIRECT = (() => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return false;
  try { if (window.self !== window.top) return false; } catch (e) { return false; }
  const fp = document.permissionsPolicy || document.featurePolicy;
  return fp && fp.allowsFeature ? fp.allowsFeature('microphone') : true;
})();
function stopRecordingIfAny() { if (rec && rec.mr && rec.mr.state === 'recording') { rec.cancel = true; rec.mr.stop(); } busy = false; }
function recorderUI(box, getRef, opts) {
  // getRef(): {notes,bpm}; opts: {anyKeyToggle, onResult}
  const id = 'r' + uid();
  box.innerHTML = `${opts.anyKeyToggle ? `<label class="check" style="border:0;padding:0 0 12px"><input type="checkbox" id="${id}-any"><span class="small">Я пел в своей тональности, а не от ноты примера (проверятся только расстояния между нотами)</span></label>` : ''}
    ${MIC_DIRECT ? `<div class="row wrap"><button class="btn" id="${id}-mic">${ICON.mic} Записать с микрофона</button>
    <label class="btn ghost">${ICON.file} Загрузить запись<input type="file" accept="audio/*,video/*" class="hidden recfile"></label></div>` :
    `<div class="row wrap"><label class="btn">${ICON.mic} Записать голос<input type="file" accept="video/*,audio/*" capture="user" class="hidden recfile"></label>
    <label class="btn ghost">${ICON.file} Загрузить запись<input type="file" accept="audio/*,video/*" class="hidden recfile"></label></div>
    <div class="tiny muted" style="margin-top:8px">«Записать голос» откроет камеру телефона: сними видео, пока поёшь (можно закрыть объектив пальцем), и нажми «Использовать видео». Из видео я возьму только звук. На компьютере выбери готовую аудиозапись.</div>`}
    <div id="${id}-msg" class="small" style="margin-top:10px"></div><div id="${id}-res"></div>`;
  const msg = $('#' + id + '-msg'), res = $('#' + id + '-res');
  const handleBuffer = async (arrayBuf) => {
    msg.innerHTML = '<span class="muted">Слушаю запись и ищу ноты...</span>';
    let audio;
    try { audio = await new Promise((ok, bad) => { const p = ac().decodeAudioData(arrayBuf, ok, bad); if (p && p.then) p.then(ok, bad); }); }
    catch (e) { msg.innerHTML = '<div class="note">Не получилось прочитать файл. Подойдут записи в форматах m4a, mp3, wav, ogg, webm.</div>'; busy = false; return; }
    setTimeout(() => {
      const chs = []; const maxLen = Math.min(audio.length, audio.sampleRate * 45);
      for (let c = 0; c < audio.numberOfChannels; c++) chs.push(audio.getChannelData(c).subarray(0, maxLen));
      const a = VA.analyzeSamples(chs, audio.sampleRate);
      const ref = getRef();
      const anyKey = opts.anyKeyToggle ? $('#' + id + '-any').checked : false;
      msg.innerHTML = '';
      busy = false;
      if (!a.segs.length) { res.innerHTML = '<div class="note" style="margin-top:10px">Не слышу в записи голоса с понятной высотой. Пой громче и ближе к телефону, на гласную «а» или «ма».</div>'; return; }
      const ev = VA.evaluate(ref.notes.map(([s, b]) => ({ midi: base() + s, beats: b })), a.segs, anyKey, strictOct());
      ev.anyKey = anyKey;
      lastAudio = audio;
      res.innerHTML = resultHTML(ref, ev, audio);
      opts.onResult(ev);
    }, 30);
  };
  box.querySelectorAll('.recfile').forEach(inp => inp.addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return; busy = true;
    handleBuffer(await f.arrayBuffer()); e.target.value = '';
  }));
  $('#' + id + '-mic')?.addEventListener('click', async () => {
    const btn = $('#' + id + '-mic');
    if (rec && rec.mr && rec.mr.state === 'recording') { rec.mr.stop(); return; }
    let stream;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) throw new Error('no');
      stream = await openMic();
    } catch (e) {
      msg.innerHTML = `<div class="note"><b>Нет доступа к микрофону.</b><br>1. Если открыл ссылку из Telegram или другого приложения, нажми «Открыть в Safari» (или скопируй ссылку в Safari).<br>2. В Safari нажми «аА» слева от адреса → «Настройки веб-сайта» → «Микрофон» → «Разрешить», потом обнови страницу.<br>3. Если не помогло: Настройки iPhone → Приложения → Safari → Микрофон → «Спросить» или «Разрешить».</div>`;
      return;
    }
    const chunks = []; const mr = new MediaRecorder(stream); rec = { mr, cancel: false }; busy = true;
    mr.ondataavailable = e => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop()); clearInterval(rec.tick); afterMic();
      btn.innerHTML = ICON.mic + ' Записать с микрофона';
      if (rec.cancel) return;
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      handleBuffer(await blob.arrayBuffer());
    };
    mr.start(); const t0 = Date.now();
    btn.innerHTML = ICON.stop + ' Остановить';
    msg.innerHTML = '<div class="row"><span class="rec-dot"></span><span id="' + id + '-t">Запись 0 с. Пой!</span></div>';
    rec.tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); const el = $('#' + id + '-t'); if (el) el.textContent = 'Запись ' + s + ' с. Пой!'; if (s >= 40) mr.stop(); }, 250);
  });
}
function resultHTML(ref, ev, audio) {
  const n = ev.notes.length;
  const lines = ev.notes.map((r, i) => {
    const nm = VA.noteName(base() + ref.notes[i][0]);
    let t;
    if (r.status === 'missed') t = '<span class="mark missed">✗ не спета</span>';
    else {
      const dir = r.dev > 0 ? 'выше' : 'ниже', ad = Math.abs(r.dev);
      const amount = ad >= 85 ? (Math.round(ad / 100) === 1 ? 'на полтона' : 'на ' + Math.round(ad / 100) + ' полутона') : 'на ' + ad + ' центов';
      if (r.status === 'ok') t = `<span class="mark ok">✓ верно</span> <span class="muted tiny">(${r.dev >= 0 ? '+' : ''}${r.dev} ц)</span>`;
      else if (r.status === 'near') t = `<span class="mark near">≈ близко</span>, чуть ${dir} (${ad} ц)`;
      else t = `<span class="mark off">✗ мимо</span>, ${dir} ${amount}`;
    }
    if (r.rhythm) t += `<span class="muted"> · ${r.rhythm === 'long' ? 'затянута' : 'короче нужного'}</span>`;
    return `<li><span class="n">${i + 1}</span><span><b>${nm}</b>: ${t}</span></li>`;
  }).join('');
  const sung = ev.notes.filter(r => r.dev != null);
  const avg = sung.length ? Math.round(sung.reduce((a, r) => a + r.dev, 0) / sung.length) : 0;
  let tip = '';
  if (ev.anyKey) tip = 'Сравнение по расстояниям между нотами, тональность не учитывалась.';
  else if (Math.abs(avg) > 25 && sung.length >= 2) tip = `В среднем ты поёшь ${avg > 0 ? 'выше' : 'ниже'} примера на ${Math.abs(avg)} центов. ${avg < 0 ? 'Попробуй больше «улыбки» в гласной и активнее дыхание.' : 'Расслабь горло и не дави на верх.'}`;
  if (ev.offset && !ev.anyKey) tip += (tip ? ' ' : '') + `Ты пел на ${ev.offset > 0 ? 'октаву выше' : 'октаву ниже'} примера, это нормально.`;
  const missed = ev.notes.filter(r => r.status === 'missed').length;
  if (missed) tip += (tip ? ' ' : '') + `Не нашёл ${missed} ${plural(missed, 'ноту', 'ноты', 'нот')}: возможно, они слились с соседней или были слишком тихими.`;
  return `<div class="score" style="margin-top:14px"><div class="s"><b>${ev.pitchScore}%</b><span class="small muted">точность нот</span></div>
    ${ev.rhythmScore != null ? `<div class="s"><b>${ev.rhythmScore}%</b><span class="small muted">ритм</span></div>` : ''}
    <div class="s"><b>${ev.ok}/${n}</b><span class="small muted">нот верно</span></div></div>
    ${rollSVG(ref.notes, ev)}
    <div class="tiny muted" style="margin-top:4px">Серым: как надо. Цветом: как спето. Зелёный верно (до 30 ц), жёлтый близко (до 60 ц), красный мимо.</div>
    <ul class="notes-list">${lines}</ul>
    ${tip ? `<div class="info" style="margin-top:10px">${esc(tip)}</div>` : ''}
    <div class="row wrap" style="margin-top:12px"><button class="btn ghost" onclick="playNotes(${JSON.stringify(ref.notes)},${ref.bpm})">${ICON.play} Как надо</button>
    <button class="btn ghost" onclick="playAudioLast()">${ICON.play} Моя запись</button></div>`;
}
let lastAudio = null;
function playAudioLast() { if (!lastAudio) return; stopAll(); const s = ac().createBufferSource(); s.buffer = lastAudio; s.connect(master); s.start(); playing.push(s); }

// ===== Ритм: тап =====
function tapUI(box) {
  const ex = run.ex;
  box.innerHTML = `<button class="tap" id="tapbtn" disabled>Тап</button><div class="row" style="justify-content:center"><button class="btn" id="tapstart">${ICON.play} Начать проверку</button></div><div id="tapmsg" class="small muted" style="text-align:center;margin-top:8px"></div><div id="tapres"></div>`;
  const btn = $('#tapbtn'); let taps = [], live = false, sch = null, perf0 = 0, ctx0 = 0;
  const now = () => ctx0 + (performance.now() - perf0) / 1000;
  const hit = e => { if (!live) return; e.preventDefault(); taps.push(now()); btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 80); };
  btn.addEventListener('pointerdown', hit);
  const key = e => { if (e.code === 'Space' && live) hit(e); };
  document.addEventListener('keydown', key);
  $('#tapstart').addEventListener('click', () => {
    const c = ac(); taps = []; perf0 = performance.now(); ctx0 = c.currentTime;
    sch = playRhythm(ex, false); live = true; btn.disabled = false; busy = true;
    $('#tapstart').disabled = true; $('#tapres').innerHTML = '';
    $('#tapmsg').textContent = 'Слушай отсчёт: раз, два, три, четыре...';
    const startAt = sch.t0 + 4 * sch.b;
    setTimeout(() => { if (live && $('#tapmsg')) $('#tapmsg').textContent = 'Стучи!'; }, (startAt - c.currentTime) * 1000);
    setTimeout(() => {
      if (!document.body.contains(box)) { live = false; busy = false; return; } // ушли со страницы
      live = false; btn.disabled = true; busy = false; $('#tapstart').disabled = false; $('#tapstart').innerHTML = ICON.play + ' Ещё раз';
      $('#tapmsg').textContent = '';
      const lat = (c.outputLatency || c.baseLatency || 0) + (state.settings.latency || 0) / 1000;
      const targets = ex.onsets.map(o => startAt + o * sch.b);
      const ev = VA.evaluateTaps(targets, taps.filter(t => t > startAt - .3), lat);
      $('#tapres').innerHTML = tapResultHTML(ex, ev, sch.b);
      run.auto = { type: 'tap', score: ev.score, meanDev: ev.meanDev, extra: ev.extra };
      suggestFromAuto(ev.score, 'точность ритма');
    }, (sch.end - c.currentTime + .5) * 1000);
  });
}
function tapResultHTML(ex, ev, b) {
  const ok = ev.res.filter(r => r.status === 'ok').length, n = ev.res.length;
  const beats = Math.ceil(Math.max(...ex.onsets) + 1), bars = Math.ceil(beats / 4) * 4, W = 640, H = 60, bw = (W - 20) / bars;
  let svg = `<svg class="roll" viewBox="0 0 ${W} ${H}">`;
  for (let i = 0; i <= bars; i++) svg += `<line x1="${10 + i * bw}" x2="${10 + i * bw}" y1="6" y2="${H - 6}" stroke="var(--line)" stroke-width="${i % 4 === 0 ? 2 : 1}"/>`;
  ev.res.forEach((r, i) => {
    const x = 10 + ex.onsets[i] * bw + 4;
    svg += `<circle cx="${x}" cy="${H / 2}" r="7" fill="none" stroke="var(--muted)" stroke-width="2"/>`;
    if (r.dev != null) { const col = r.status === 'ok' ? 'var(--ok)' : r.status === 'near' ? 'var(--near)' : 'var(--bad)'; svg += `<circle cx="${x + r.dev / 1000 / b * bw}" cy="${H / 2}" r="5" fill="${col}"/>`; }
    else svg += `<text x="${x}" y="${H / 2 + 5}" text-anchor="middle" font-size="15" font-weight="800" fill="var(--bad)">×</text>`;
  });
  svg += '</svg>';
  const missed = ev.res.filter(r => r.status === 'missed').length;
  let tip = Math.abs(ev.meanDev) > 35 ? `В среднем ты ${ev.meanDev < 0 ? 'спешишь' : 'опаздываешь'} на ${Math.abs(ev.meanDev)} мс.` : 'В среднем попадаешь в долю, без спешки и опозданий.';
  if (missed) tip += ` Пропущено: ${missed}.`;
  if (ev.extra) tip += ` Лишних нажатий: ${ev.extra}.`;
  return `<div class="score" style="margin-top:12px"><div class="s"><b>${ev.score}%</b><span class="small muted">точность ритма</span></div><div class="s"><b>${ok}/${n}</b><span class="small muted">точно в долю</span></div></div>
    ${svg}<div class="tiny muted">Кружок: где нужно было. Точка: твоё нажатие. Зелёный до 70 мс, жёлтый до 140 мс.</div>
    <div class="info" style="margin-top:10px">${tip}</div>
    <p class="tiny muted">Если все нажатия смещены одинаково (например, в Bluetooth-наушниках), настрой задержку звука в настройках ⚙.</p>`;
}

// ===== Экран: Оценка по мелодии =====
let melSel = 'm1';
function viewCheck() {
  const { checks, best } = pitchAssessment();
  let h = `<h1>Оценка по мелодии</h1><p class="muted" style="margin:6px 0 0">Спой короткую мелодию, и приложение по записи проверит каждую ноту: верно, близко или мимо.</p>`;
  h += `<div class="card sec">${best ? `<div class="small muted">Твоя оценка интонации по сохранённым проверкам</div><div style="font-family:Lora,serif;font-size:24px;font-weight:600">Уровень ${best.level}</div><div class="small muted">${esc(exById(best.ex).title)}: ${best.auto.score}% · ${fmtDay(best.date.slice(0, 10)).toLowerCase()}</div>` :
    `<div class="small muted">Твоя оценка интонации</div><div style="font-family:Lora,serif;font-size:22px;font-weight:600">Пока не определена</div><div class="small muted">${checks.length ? 'Ни одна сохранённая проверка пока не набрала 80%. Это нормально, это точка старта.' : 'Нет сохранённых проверок. Начни с мелодии 1.'}</div>`}</div>`;
  h += `<div class="sec"><div class="seg">${MELODIES.map(m => `<button class="${melSel === m.id ? 'on' : ''}" onclick="melSel='${m.id}';render()">Уровень ${m.level}</button>`).join('')}</div></div>`;
  const m = exById(melSel);
  run = { ex: m, auto: null, rating: null, crit: new Set() };
  h += `<div class="card sec"><h3>${esc(m.title)}</h3><div class="small muted">${esc(m.desc)} · от ноты ${VA.noteName(base())} (поменять в ⚙)</div>${rollSVG(m.notes)}
    <div class="row wrap" style="margin-top:10px"><button class="btn" onclick="playNotes(exById('${m.id}').notes, exById('${m.id}').bpm)">${ICON.play} Послушать</button><button class="btn ghost" onclick="playNotes([exById('${m.id}').notes[0]], 60)">Первая нота</button></div>
    <ol class="steps" style="margin-top:16px"><li>Послушай мелодию 2 раза.</li><li>Возьми первую ноту и спой всю мелодию на «ма» или «ла», отделяя ноты.</li><li>Запиши или загрузи запись. Чем тише вокруг, тем точнее проверка.</li></ol></div>`;
  h += `<div class="card sec"><h3>Проверка</h3><div id="melrec" style="margin-top:10px"></div></div>`;
  h += `<div class="card sec stack hidden" id="melsave"><h3>Сохранить результат?</h3><div id="melverdict"></div>
    <textarea id="melnote" placeholder="Заметка: как себя чувствовал, что мешало (необязательно)"></textarea>
    <button class="btn block" onclick="saveMelody()">Сохранить в историю</button>
    <div class="tiny muted">Сохраняется только то, что ты сам подтвердишь. Результат пойдёт в историю и в оценку уровня.</div></div>`;
  if (checks.length) h += `<div class="sec"><h2>Прошлые проверки</h2>${checks.slice(-6).reverse().map(sessionRow).join('')}</div>`;
  afterHooks.push(() => recorderUI($('#melrec'), () => exById(melSel), { anyKeyToggle: true, onResult: ev => {
    const m = exById(melSel), sc = ev.pitchScore;
    run.auto = { type: 'melody', score: sc, rhythm: ev.rhythmScore, ok: ev.ok, total: ev.notes.length, anyKey: !!ev.anyKey, marks: ev.notes.map(r => r.status[0]) };
    run.rating = suggestRating(sc);
    const v = sc >= 80 ? `Уверенно для уровня ${m.level}.${m.level < 3 ? ' Можно пробовать мелодию уровня ' + (m.level + 1) + '.' : ''}` :
      sc >= 60 ? `Уровень ${m.level} в работе: основа есть, часть нот плавает. Повтори через день-два.` :
        `Пока сложно для уровня ${m.level}.${m.level > 1 ? ' Вернись к мелодии уровня ' + (m.level - 1) + '.' : ''} Помогут упражнения «Попади в ноту» и «Две соседние ноты».`;
    $('#melverdict').innerHTML = `<div class="info"><b>Оценка по этой записи:</b> ${v}</div><div class="tiny muted" style="margin-top:6px">Одна запись это снимок, а не приговор. Уровень подтверждается результатом от 80%.</div>`;
    $('#melsave').classList.remove('hidden');
  } }));
  return h;
}
function saveMelody() {
  const m = run.ex; if (!run.auto) return;
  const s = { id: uid(), ex: m.id, cat: 'pitch', level: m.level, date: nowLocal(), rating: run.rating, auto: run.auto };
  const note = $('#melnote').value.trim(); if (note) s.note = note;
  const before = levelInfo('pitch').open;
  state.sessions.push(s); save();
  const after = levelInfo('pitch').open;
  toast(after > before ? `Открыт уровень ${after} в разделе «Интонация»!` : 'Проверка сохранена.');
  render();
}

// ===== Экран: История =====
function sessionRow(s) {
  const ex = exById(s.ex), r = RATINGS[s.rating];
  let auto = '';
  if (s.auto) {
    if (s.auto.type === 'quiz') auto = `квиз ${s.auto.right}/${s.auto.total}`;
    else if (s.auto.type === 'tap') auto = `ритм ${s.auto.score}%`;
    else auto = `ноты ${s.auto.score}%` + (s.auto.rhythm != null ? `, ритм ${s.auto.rhythm}%` : '');
  }
  const crit = s.critTotal ? `${s.crit.length}/${s.critTotal} критериев` : '';
  const time = s.date.slice(11, 16);
  return `<div class="item" style="align-items:flex-start"><div class="dot ${s.cat}">${s.level}</div>
    <div class="t"><b>${esc(ex ? ex.title : s.ex)}</b><div class="row wrap" style="gap:6px;margin-top:4px"><span class="chip ${r.cls}">${r.label}</span>${auto ? `<span class="pill">${auto}</span>` : ''}${crit ? `<span class="pill">${crit}</span>` : ''}<span class="tiny muted">${time}</span></div>
    ${s.note ? `<div class="small" style="margin-top:6px">${esc(s.note)}</div>` : ''}</div>
    <button class="iconbtn" style="width:32px;height:32px;border:0" title="Удалить" onclick="askDelete('${s.id}')">×</button></div>`;
}
function viewHistory() {
  let h = `<h1>История</h1>`;
  if (!state.sessions.length) return h + `<div class="empty">Пока пусто. Здесь появятся занятия, которые ты отметишь.</div>`;
  const by = {}; for (const c of Object.keys(CATS)) by[c] = state.sessions.filter(s => s.cat === c).length;
  h += `<div class="row wrap sec" style="margin-top:12px;gap:6px"><span class="pill">Всего: ${state.sessions.length}</span>${Object.keys(CATS).map(c => `<span class="chip ${c}">${CATS[c].name}: ${by[c]}</span>`).join('')}</div>`;
  const groups = {};
  [...state.sessions].reverse().forEach(s => (groups[s.date.slice(0, 10)] ||= []).push(s));
  for (const [d, list] of Object.entries(groups)) h += `<div class="hist-day">${fmtDay(d)}</div><div style="margin-top:8px">${list.map(sessionRow).join('')}</div>`;
  return h;
}
function askDelete(id) {
  sheet(`<h2>Удалить занятие?</h2><p class="muted">Оно пропадёт из истории и перестанет учитываться в уровнях.</p><div class="row"><button class="btn ghost" style="flex:1" onclick="closeSheet()">Отмена</button><button class="btn" style="flex:1;background:var(--bad)" onclick="doDelete('${id}')">Удалить</button></div>`);
}
function doDelete(id) {
  state.sessions = state.sessions.filter(s => s.id !== id);
  // пересобрать интервал повторения по оставшимся занятиям
  state.srs = {};
  for (const s of state.sessions) if (EXERCISES.some(e => e.id === s.ex)) {
    const cur = state.srs[s.ex] || { box: 0 }; let box = cur.box, iv;
    if (s.rating === 3) { box = Math.min(box + 1, 5); iv = [1, 2, 4, 7, 14, 30][box]; } else if (s.rating === 2) iv = 2; else { box = 0; iv = 1; }
    const day = s.date.slice(0, 10); state.srs[s.ex] = { box, due: addDays(day, iv), last: day, lastRating: s.rating };
  }
  save(); closeSheet(); render();
}

// ===== Экран: Заметки =====
let editingNote = null;
function viewNotes() {
  let h = `<h1>Заметки</h1><p class="muted" style="margin:6px 0 0">Наблюдения про голос, советы педагога, песни, которые хочется спеть.</p>
    <div class="card sec stack"><textarea id="notetext" placeholder="Например: на высоких нотах зажимаю челюсть, помогает зевок">${editingNote ? esc(state.notes.find(n => n.id === editingNote)?.text) : ''}</textarea>
    <select id="noteex"><option value="">Без привязки к упражнению</option>${EXERCISES.map(e => `<option value="${e.id}" ${editingNote && state.notes.find(n => n.id === editingNote)?.ex === e.id ? 'selected' : ''}>${esc(CATS[e.cat].name + ': ' + e.title)}</option>`).join('')}</select>
    <div class="row"><button class="btn" style="flex:1" onclick="saveNote()">${editingNote ? 'Сохранить изменения' : 'Добавить заметку'}</button>${editingNote ? '<button class="btn ghost" onclick="editingNote=null;render()">Отмена</button>' : ''}</div></div>`;
  const sessNotes = state.sessions.filter(s => s.note);
  if (!state.notes.length && !sessNotes.length) return h + `<div class="empty">Заметок пока нет.</div>`;
  h += `<div class="sec">${[...state.notes].reverse().map(n => `<div class="card" style="margin-bottom:10px"><div class="row between"><span class="tiny muted">${fmtDay(n.date.slice(0, 10))}${n.ex ? ' · ' + esc(exById(n.ex)?.title || '') : ''}</span>
    <span class="row" style="gap:4px"><button class="back" style="margin:0" onclick="editingNote='${n.id}';render();window.scrollTo(0,0)">Изменить</button><button class="back" style="margin:0;color:var(--bad)" onclick="delNote('${n.id}')">Удалить</button></span></div>
    <div style="white-space:pre-wrap;margin-top:4px">${esc(n.text)}</div></div>`).join('')}</div>`;
  if (sessNotes.length) h += `<div class="sec"><h2>Из занятий</h2>${sessNotes.slice(-10).reverse().map(s => `<div class="card" style="margin-bottom:10px"><div class="tiny muted">${fmtDay(s.date.slice(0, 10))} · ${esc(exById(s.ex)?.title || '')}</div><div style="white-space:pre-wrap;margin-top:4px">${esc(s.note)}</div></div>`).join('')}</div>`;
  return h;
}
function saveNote() {
  const text = $('#notetext').value.trim(), ex = $('#noteex').value; if (!text) return;
  if (editingNote) { const n = state.notes.find(n => n.id === editingNote); if (n) { n.text = text; n.ex = ex || undefined; } editingNote = null; }
  else state.notes.push({ id: uid(), date: nowLocal(), text, ex: ex || undefined });
  save(); render(); toast('Заметка сохранена');
}
function delNote(id) { state.notes = state.notes.filter(n => n.id !== id); save(); render(); }

// ===== Настройки =====
function sheet(html) { closeSheet(); const d = document.createElement('div'); d.className = 'sheet-bg'; d.id = 'sheet'; d.innerHTML = `<div class="sheet stack">${html}</div>`; d.addEventListener('click', e => { if (e.target === d) closeSheet(); }); document.body.appendChild(d); }
function closeSheet() { $('#sheet')?.remove(); }
function openSettings() {
  sheet(`<div class="row between"><h2>Настройки</h2><button class="iconbtn" onclick="closeSheet()">×</button></div>
    <p class="small muted" style="margin:0">От этой ноты строятся упражнения, мелодии и уровни игр. Выбирай ноту, на которой удобно петь «а» без напряжения.</p>${registerCard(true)}
    <div class="card stack"><h3>Задержка звука для ритма</h3><p class="small muted" style="margin:0">Нужна, если ты в Bluetooth-наушниках: звук приходит позже. Сейчас: ${state.settings.latency || 0} мс.</p>
    <button class="tap" id="calbtn" style="width:150px" disabled>Тап</button><div id="calmsg" class="small muted" style="text-align:center"></div>
    <button class="btn ghost" onclick="calibrate()">Настроить: стучи в такт 8 щелчкам</button></div>
    <div class="card stack"><h3>Данные</h3><p class="small muted" style="margin:0" id="savebadge">${saveText()}</p>
    <button class="btn ghost" onclick="copyData()">Скопировать мои данные</button>
    <button class="btn ghost" style="color:var(--bad)" onclick="askReset()">Удалить всё и начать заново</button></div>`);
}
function calibrate() {
  const c = ac(), b = 60 / 90, t0 = c.currentTime + .3, taps = [], perf0 = performance.now(), ctx0 = c.currentTime;
  stopAll(); for (let i = 0; i < 8; i++) click(t0 + i * b, i % 4 === 0);
  const btn = $('#calbtn'); btn.disabled = false; $('#calmsg').textContent = 'Стучи вместе со щелчками';
  btn.onpointerdown = e => { e.preventDefault(); taps.push(ctx0 + (performance.now() - perf0) / 1000); };
  setTimeout(() => {
    btn.disabled = true; btn.onpointerdown = null;
    const lat0 = c.outputLatency || c.baseLatency || 0;
    const devs = taps.map(t => { let best = 9; for (let i = 0; i < 8; i++) { const d = t - lat0 - (t0 + i * b); if (Math.abs(d) < Math.abs(best)) best = d; } return best; }).filter(d => Math.abs(d) < .35);
    if (devs.length < 5) { $('#calmsg').textContent = 'Мало нажатий, попробуй ещё раз.'; return; }
    const ms = Math.round(VA.median(devs) * 1000); state.settings.latency = ms; save();
    $('#calmsg').textContent = `Готово: задержка ${ms} мс. Учту её в проверке ритма.`;
  }, (t0 + 8 * b - c.currentTime + .6) * 1000);
}
async function copyData() { try { await navigator.clipboard.writeText(JSON.stringify(state, null, 1)); toast('Скопировано'); } catch (e) { toast('Не получилось скопировать'); } }
function askReset() { sheet(`<h2>Удалить всё?</h2><p class="muted">История, заметки и уровни будут стёрты. Это нельзя отменить.</p><div class="row"><button class="btn ghost" style="flex:1" onclick="closeSheet()">Отмена</button><button class="btn" style="flex:1;background:var(--bad)" onclick="state=Object.assign(DEFAULT(),{settings:state.settings});save();closeSheet();go('today');render()">Удалить</button></div>`); }
function toast(t) { $('.toast')?.remove(); const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3200); }

// ===== Подключение хуков после рендера упражнения =====
const _viewExercise = viewExercise;
viewExercise = function (ex) {
  const h = _viewExercise(ex);
  if (ex && ex.kind === 'sing') afterHooks.push(() => recorderUI($('#recbox'), () => ex, { anyKeyToggle: false, onResult: ev => {
    run.auto = { type: 'sing', score: ev.pitchScore, rhythm: ev.rhythmScore, ok: ev.ok, total: ev.notes.length };
    suggestFromAuto(ev.pitchScore, 'точность нот');
  } }));
  if (ex && ex.kind === 'tap') afterHooks.push(() => tapUI($('#tapbox')));
  return h;
};


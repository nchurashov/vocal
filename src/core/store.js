import { render } from './router.js';
import { toast } from './ui.js';
import { $, busy } from './util.js';

// ===== Хранилище =====
export const DEFAULT = () => ({ v: 1, settings: { base: 48, latency: 0 }, sessions: [], srs: {}, notes: [], game: { best: {}, plays: [] }, ball: { best: {}, plays: [] } });
export let state = DEFAULT();
export const store = { mode: 'none', db: null, uid: null, timer: null, chain: Promise.resolve(), lastSessionsJSON: '', lastStateJSON: '' };
// Профили: несколько человек на одном телефоне («Кто поёт?»). У каждого свой state в localStorage.
// Первый профиль p1 хранится по старому ключу 'vocal-practice' (совместимость), остальные - 'vocal-practice:<id>'.
// Облако (db артефакта Claude) - только для p1.
export let PROF = { list: [{ id: 'p1', name: '' }], cur: 'p1' };
try { const r = localStorage.getItem('vocal-profiles'); if (r) { const x = JSON.parse(r); if (x && x.list && x.list.length) PROF = x; } } catch (e) { }
export const profKey = id => id === 'p1' ? 'vocal-practice' : 'vocal-practice:' + id;
export const profCur = () => PROF.list.find(p => p.id === PROF.cur) || PROF.list[0];
export const profName = () => (profCur().name || '').trim();
export function profSave() { try { localStorage.setItem('vocal-profiles', JSON.stringify(PROF)); } catch (e) { } }
export function loadState() {
  state = DEFAULT();
  try { const raw = localStorage.getItem(profKey(PROF.cur)); if (raw) { state = Object.assign(DEFAULT(), JSON.parse(raw)); state.settings = Object.assign(DEFAULT().settings, state.settings || {}); store.mode = 'local'; } } catch (e) { }
}
loadState();
export function save() {
  try { localStorage.setItem(profKey(PROF.cur), JSON.stringify(state)); if (store.mode === 'none') store.mode = 'local'; } catch (e) { }
  if (!store.db || PROF.cur !== 'p1') return;
  clearTimeout(store.timer);
  store.timer = setTimeout(pushDb, 700);
}
export function pushDb() {
  const sJSON = JSON.stringify({ sessions: state.sessions });
  const stJSON = JSON.stringify({ v: state.v, settings: state.settings, srs: state.srs, notes: state.notes, game: state.game, ball: state.ball, range: state.range, warmups: state.warmups, voice: state.voice, diary: state.diary });
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
export async function initDb() {
  if (!window.claude || !window.claude.use || PROF.cur !== 'p1') return;
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
      store.lastStateJSON = JSON.stringify({ v: state.v, settings: state.settings, srs: state.srs, notes: state.notes, game: state.game, ball: state.ball, range: state.range, warmups: state.warmups, voice: state.voice, diary: state.diary });
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
export function updateSaveBadge() { const el = $('#savebadge'); if (el) el.textContent = saveText(); }
export const saveText = () => store.mode === 'cloud' ? 'Данные сохраняются в твоём аккаунте и доступны с любого устройства.' : store.mode === 'local' ? 'Данные сохраняются только в этом браузере.' : 'Сохранение недоступно: данные пропадут после закрытия.';






// установщики для моста window (переходный период, см. main.js)
export function __set_state(v) { state = v; }
export function __set_PROF(v) { PROF = v; }

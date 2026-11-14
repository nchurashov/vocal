import { render } from './router.js';
import { toast } from './ui.js';
import { $, BASE_MAX, BASE_MIN, busy } from './util.js';

// ===== Хранилище =====
// STATE_V - версия формата данных. Поменял структуру: подними версию и допиши шаг в MIGRATIONS,
// тогда старый прогресс (из localStorage, облака или файла) перенесётся, а не сломается.
export const STATE_V = 2;
export const DEFAULT = () => ({ v: STATE_V, settings: { base: 48, latency: 0 }, sessions: [], srs: {}, notes: [], game: { best: {}, plays: [] }, ball: { best: {}, plays: [] }, range: [], warmups: [] });
const MIGRATIONS = {
  1: s => s, // v1 -> v2: формат стал версионным; поля, которых не было, добавит DEFAULT
};
// Поля со свободным текстом. Их можно хранить любыми, но выводить на экран ТОЛЬКО через esc().
export const TEXT_KEYS = new Set(['text', 'note']);
// Категории и оценки занятий (совпадают с CATS и RATINGS в data/exercises.js; ядро не импортирует data, сверку делает tests/sim_data.py)
export const SESSION_CATS = ['ear', 'pitch', 'rhythm'], SESSION_RATINGS = [1, 2, 3];
// Любые данные извне (localStorage, облако, импорт файла) проходят здесь: перенос версий и очистка.
// Все поля сохраняются (и будущие тоже), но: строки со знаками разметки < > " ' ` \ вне TEXT_KEYS выкидываются,
// числа только конечные, вложенность и длина списков ограничены. Так чужой файл не вставит код в страницу.
export function normalizeState(raw) {
  const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
  if (!isObj(raw)) throw new Error('Это не данные приложения');
  let s = JSON.parse(JSON.stringify(raw)), v = Number.isInteger(s.v) ? s.v : 1;
  if (v > STATE_V) throw new Error('Данные из более новой версии приложения. Обнови приложение.');
  for (; v < STATE_V; v++) s = MIGRATIONS[v](s);
  delete s.app; delete s.exported; // метки файла экспорта, не данные
  const KEY = /^[\w.-]{1,60}$/, BAD = /[<>"'`\\]/;
  const clean = (x, key, depth) => {
    if (typeof x === 'number') return isFinite(x) ? x : undefined;
    if (typeof x === 'boolean') return x;
    if (typeof x === 'string') return TEXT_KEYS.has(key) ? x.slice(0, 5000) : (x.length <= 200 && !BAD.test(x) ? x : undefined);
    if (depth > 8 || !x || typeof x !== 'object') return undefined;
    if (Array.isArray(x)) return x.slice(-5000).map(e => clean(e, key, depth + 1)).filter(e => e !== undefined);
    const o = {};
    for (const [k, e] of Object.entries(x)) {
      if (!KEY.test(k) || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      const c = clean(e, k, depth + 1); if (c !== undefined) o[k] = c;
    }
    return o;
  };
  const c = clean(s, '', 0), out = DEFAULT();
  for (const [k, e] of Object.entries(c)) {
    const d = out[k];
    if (d === undefined || (Array.isArray(d) ? Array.isArray(e) : isObj(d) ? isObj(e) : typeof d === typeof e)) out[k] = e;
  }
  out.v = STATE_V;
  out.settings = Object.assign(DEFAULT().settings, out.settings);
  const b = out.settings.base; out.settings.base = Number.isInteger(b) && b >= BASE_MIN && b <= BASE_MAX ? b : 48;
  for (const g of ['game', 'ball']) { if (!isObj(out[g].best)) out[g].best = {}; if (!Array.isArray(out[g].plays)) out[g].plays = []; }
  // Записи, по которым строятся уровни и история, без даты/оценки бесполезны и ломают экраны.
  out.sessions = out.sessions.filter(x => isObj(x) && typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x.date) && SESSION_RATINGS.includes(x.rating) && SESSION_CATS.includes(x.cat) && typeof x.id === 'string');
  out.notes = out.notes.filter(x => isObj(x) && typeof x.text === 'string' && typeof x.id === 'string' && typeof x.date === 'string');
  for (const k of ['range', 'warmups']) out[k] = out[k].filter(x => isObj(x) && typeof x.date === 'string');
  return out;
}
// Всё, кроме истории занятий (её храним отдельным документом - она самая большая).
const stateDoc = () => { const { sessions: _sessions, ...rest } = state; return rest; };
// Заменить данные текущего профиля (импорт из файла). Данные уже должны пройти normalizeState.
export function replaceState(next) { state = next; save(); }
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
  try { const raw = localStorage.getItem(profKey(PROF.cur)); if (raw) { state = normalizeState(JSON.parse(raw)); store.mode = 'local'; } }
  catch (e) { console.warn('state', e); try { localStorage.setItem(profKey(PROF.cur) + '-broken', localStorage.getItem(profKey(PROF.cur))); } catch (e2) { } }
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
  const stJSON = JSON.stringify(stateDoc());
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
      state = normalizeState(Object.assign({}, JSON.parse(JSON.stringify(st)), { sessions: JSON.parse(JSON.stringify(ss.sessions || [])) }));
      store.lastStateJSON = JSON.stringify(stateDoc());
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

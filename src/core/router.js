import { stopAll } from './audio.js';
import { initDb, profName, state } from './store.js';
import { $, busy, esc } from './util.js';

// ===== Маршруты и каркас экрана =====
// Ядро не знает про конкретные экраны: их регистрирует main.js (registerRoute / registerPrefix).
// Перед каждой сменой экрана вызываются остановки (beforeRender): игры, микрофон, камера.
export const TABS = [
  ['today', 'Сегодня', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'],
  ['ball', 'Игра', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="6"/><path d="M7 10v4M5 12h4"/><circle cx="16" cy="11" r=".6" fill="currentColor"/><circle cx="18" cy="13.5" r=".6" fill="currentColor"/></svg>'],
  ['exercises', 'Упражнения', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'],
  ['check', 'Оценка', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/></svg>'],
  ['history', 'История', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/></svg>'],
  ['notes', 'Заметки', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h12l4 4v12H4z"/><path d="M8 10h8M8 14h8M8 18h5"/></svg>'],
];
export let route = 'today';
export const ROUTES = {}, PREFIXES = [], BEFORE = [];
export let leaveHook = null;
// name - точное имя (#today), view() -> HTML; tab - какая вкладка снизу подсвечена
export function registerRoute(name, view, tab = name) { ROUTES[name] = { view, tab }; }
// prefix - начало адреса (#ball-12 -> view('12')); valid(rest) - есть ли такой экран
export function registerPrefix(prefix, view, tab, valid = () => true) { PREFIXES.push({ prefix, view, tab, valid }); }
export function beforeRender(fn) { BEFORE.push(fn); }
// что сделать при уходе с экрана во время записи
export function onLeave(fn) { leaveHook = fn; }
export const findPrefix = h => PREFIXES.find(p => h.startsWith(p.prefix) && p.valid(h.slice(p.prefix.length)));
export function readHash() {
  const h = location.hash.replace('#', '');
  return ROUTES[h] || findPrefix(h) ? h : 'today';
}
export function go(r) { if (busy && leaveHook) leaveHook(); location.hash = r; }
window.addEventListener('hashchange', () => { route = readHash(); render(); window.scrollTo(0, 0); });
// Кнопка «Назад» в Android-приложении (вызывает MainActivity.java): закрыть окошко, иначе прошлый экран.
// false = мы на главном экране, приложение сворачивается как обычно.
window.androidBack = () => {
  if ($('#sheet')) { $('#sheet').remove(); return true; }
  if (route === 'today') return false;
  if (busy && leaveHook) leaveHook();
  if (history.length > 1) history.back(); else location.hash = 'today';
  return true;
};
export function start() { state.game ||= { best: {}, plays: [] }; state.ball ||= { best: {}, plays: [] }; route = readHash(); render(); initDb(); }

export function render() {
  BEFORE.forEach(f => f());
  stopAll();
  const p = !ROUTES[route] && findPrefix(route), R = ROUTES[route] || ROUTES.today;
  const tabRoute = p ? p.tab : R.tab;
  { const w = $('#who'); if (w) w.innerHTML = `🎤 ${esc(profName() || 'Кто?')}`; }
  $('#tabs').innerHTML = '<div class="tabs-in">' + TABS.map(([k, n, ic]) => `<button class="tab ${tabRoute === k ? 'on' : ''}" onclick="go('${k}')">${ic}<span>${n}</span></button>`).join('') + '</div>';
  $('#view').innerHTML = p ? p.view(route.slice(p.prefix.length)) : R.view();
  afterRender();
}
export let afterHooks = [];
export function afterRender() { const h = afterHooks; afterHooks = []; h.forEach(f => f()); }






// установщики для моста window (переходный период, см. main.js)
export function __set_route(v) { route = v; }
export function __set_leaveHook(v) { leaveHook = v; }
export function __set_afterHooks(v) { afterHooks = v; }

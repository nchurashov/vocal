import { act } from '../core/actions.js';
import { render } from '../core/router.js';
import { save, state } from '../core/store.js';
import { closeSheet, sheet } from '../core/ui.js';
import { addDays, esc, fmtDay } from '../core/util.js';
import { CATS, EXERCISES, RATINGS, exById } from '../data/exercises.js';

// ===== Экран: История =====
export function sessionRow(s) {
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
    <button class="iconbtn" style="width:32px;height:32px;border:0" title="Удалить" ${act('askDelete', `${s.id}`)}>×</button></div>`;
}
export function viewHistory() {
  let h = `<h1>История</h1>`;
  if (!state.sessions.length) return h + `<div class="empty">Пока пусто. Здесь появятся занятия, которые ты отметишь.</div>`;
  const by = {}; for (const c of Object.keys(CATS)) by[c] = state.sessions.filter(s => s.cat === c).length;
  h += `<div class="row wrap sec" style="margin-top:12px;gap:6px"><span class="pill">Всего: ${state.sessions.length}</span>${Object.keys(CATS).map(c => `<span class="chip ${c}">${CATS[c].name}: ${by[c]}</span>`).join('')}</div>`;
  const groups = {};
  [...state.sessions].reverse().forEach(s => (groups[s.date.slice(0, 10)] ||= []).push(s));
  for (const [d, list] of Object.entries(groups)) h += `<div class="hist-day">${fmtDay(d)}</div><div style="margin-top:8px">${list.map(sessionRow).join('')}</div>`;
  return h;
}
export function askDelete(id) {
  sheet(`<h2>Удалить занятие?</h2><p class="muted">Оно пропадёт из истории и перестанет учитываться в уровнях.</p><div class="row"><button class="btn ghost" style="flex:1" ${act('closeSheet')}>Отмена</button><button class="btn" style="flex:1;background:var(--bad)" ${act('doDelete', `${id}`)}>Удалить</button></div>`);
}
export function doDelete(id) {
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

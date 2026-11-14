import { state } from '../core/store.js';
import { addDays, ymd } from '../core/util.js';
import { CATS, EXERCISES } from '../data/exercises.js';

// ===== Логика уровней и повторений =====
export const NEED_CONF = 3;
export const NEED_DAYS = 2;
export function levelInfo(cat) {
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
export function isUnlocked(ex) { return ex.level <= levelInfo(ex.cat).open; }
export function srsUpdate(exId, rating) {
  const today = ymd(), cur = state.srs[exId] || { box: 0 };
  let box = cur.box, interval;
  if (rating === 3) { box = Math.min(box + 1, 5); interval = [1, 2, 4, 7, 14, 30][box]; }
  else if (rating === 2) { interval = 2; }
  else { box = 0; interval = 1; }
  state.srs[exId] = { box, due: addDays(today, interval), last: today, lastRating: rating };
  return interval;
}
export function dueList() {
  const t = ymd();
  return EXERCISES.filter(e => state.srs[e.id] && state.srs[e.id].due <= t && isUnlocked(e))
    .sort((a, b) => (state.srs[a.id].lastRating - state.srs[b.id].lastRating) || state.srs[a.id].due.localeCompare(state.srs[b.id].due));
}
export function freshList() {
  const out = [];
  for (const cat of Object.keys(CATS)) {
    const lv = levelInfo(cat).open;
    const e = EXERCISES.find(x => x.cat === cat && x.level <= lv && !state.srs[x.id]);
    if (e) out.push(e);
  }
  return out;
}
export function streak() {
  const days = new Set(state.sessions.map(s => s.date.slice(0, 10)));
  let n = 0, d = ymd(); if (!days.has(d)) d = addDays(d, -1);
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
export const suggestRating = score => score >= 80 ? 3 : score >= 50 ? 2 : 1;
export function pitchAssessment() {
  const checks = state.sessions.filter(s => s.auto && s.auto.type === 'melody');
  let best = null;
  for (const s of checks) if (s.auto.score >= 80 && (!best || s.level > best.level || (s.level === best.level && s.auto.score > best.auto.score))) best = s;
  return { checks, best };
}

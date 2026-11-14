import { act } from '../core/actions.js';
import { render } from '../core/router.js';
import { state } from '../core/store.js';
import { CATS, EXERCISES, RATINGS } from '../data/exercises.js';
import { VOICE_SETS } from '../features/voice.js';
import { exItem } from '../screens/today.js';
import { NEED_CONF, NEED_DAYS, catProgress, exPassed, levelInfo } from './logic.js';

// ===== Экран: Упражнения =====
export let exFilter = 'all';
export function viewExercises() {
  let h = `<h1>Упражнения</h1><button class="item sec" style="margin-top:14px" ${act('go', 'voice')}><div class="dot ear">🗣️</div><div class="t"><b>Голос и речь</b><span class="small muted">${VOICE_SETS.length} комплексов: зажимы, дыхание, резонанс, дикция, карандаш, плавная речь, низкий голос, диапазон</span></div><span class="muted">›</span></button><div class="sec" style="margin-top:14px"><div class="seg">` +
    [['all', 'Все'], ...Object.entries(CATS).map(([k, v]) => [k, v.name])].map(([k, n]) => `<button class="${exFilter === k ? 'on' : ''}" ${act('setExFilter', k)}>${n}</button>`).join('') + `</div></div>`;
  // прогресс: сколько упражнений пройдено (хоть раз «Уверенно») и что нужно для следующего уровня
  const cats = exFilter === 'all' ? Object.keys(CATS) : [exFilter], all = catProgress(exFilter === 'all' ? null : exFilter);
  h += `<div class="card sec stack" style="gap:10px"><div class="row between"><b>Пройдено ${all.done} из ${all.total}</b><span class="small muted">${Math.round(100 * all.done / all.total)}%</span></div><div class="bar"><i style="width:${100 * all.done / all.total}%"></i></div>
    ${cats.map(c => { const p = catProgress(c), li = levelInfo(c), pr = li.prog;
      const lv = li.done3 ? 'все уровни подтверждены' : `открыт уровень ${li.open}${li.open < 3 ? `, до ${li.open + 1}: уверенно ${Math.min(pr.conf, NEED_CONF)}/${NEED_CONF}, дней ${Math.min(pr.days, NEED_DAYS)}/${NEED_DAYS}` : ''}`;
      return `<div class="small"><span class="chip ${c}">${CATS[c].name}</span> ${p.done} из ${p.total} <span class="muted">· ${lv}</span></div>`; }).join('')}</div>`;
  for (const L of [1, 2, 3]) {
    const list = EXERCISES.filter(e => e.level === L && (exFilter === 'all' || e.cat === exFilter));
    if (!list.length) continue;
    const dn = list.filter(e => exPassed(e.id)).length;
    h += `<div class="sec"><h2>Уровень ${L} <span class="small muted" style="font-weight:600">${dn ? `✓ ${dn} из ${list.length}` : ''}</span></h2>${list.map(e => {
      const s = state.srs[e.id];
      return exItem(e, s ? `${CATS[e.cat].name} · последний раз: ${RATINGS[s.lastRating].label.toLowerCase()}` : null);
    }).join('')}</div>`;
  }
  return h;
}







export function setExFilter(k) { exFilter = k; render(); }





// установщики для моста window (переходный период, см. main.js)
export function __set_exFilter(v) { exFilter = v; }

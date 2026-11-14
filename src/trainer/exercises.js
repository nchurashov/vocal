import { state } from '../core/store.js';
import { CATS, EXERCISES, RATINGS } from '../data/exercises.js';
import { VOICE_SETS } from '../features/voice.js';
import { exItem } from '../screens/today.js';

// ===== Экран: Упражнения =====
export let exFilter = 'all';
export function viewExercises() {
  let h = `<h1>Упражнения</h1><button class="item sec" style="margin-top:14px" onclick="go('voice')"><div class="dot ear">🗣️</div><div class="t"><b>Голос и речь</b><span class="small muted">${VOICE_SETS.length} комплексов: зажимы, дыхание, резонанс, дикция, карандаш, плавная речь, низкий голос, диапазон</span></div><span class="muted">›</span></button><div class="sec" style="margin-top:14px"><div class="seg">` +
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






// установщики для моста window (переходный период, см. main.js)
export function __set_exFilter(v) { exFilter = v; }

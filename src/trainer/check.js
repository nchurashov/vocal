import { VA } from '../core/analysis.js';
import { base } from '../core/audio.js';
import { afterHooks, render } from '../core/router.js';
import { save, state } from '../core/store.js';
import { toast } from '../core/ui.js';
import { $, ICON, esc, fmtDay, nowLocal, uid } from '../core/util.js';
import { MELODIES, exById } from '../data/exercises.js';
import { sessionRow } from '../screens/history.js';
import { rollSVG, run, setRun } from './exercise.js';
import { levelInfo, pitchAssessment, suggestRating } from './logic.js';
import { recorderUI } from './recorder.js';

// ===== Экран: Оценка по мелодии =====
export let melSel = 'm1';
export function viewCheck() {
  const { checks, best } = pitchAssessment();
  let h = `<h1>Оценка по мелодии</h1><p class="muted" style="margin:6px 0 0">Спой короткую мелодию, и приложение по записи проверит каждую ноту: верно, близко или мимо.</p>`;
  h += `<div class="card sec">${best ? `<div class="small muted">Твоя оценка интонации по сохранённым проверкам</div><div style="font-family:Lora,serif;font-size:24px;font-weight:600">Уровень ${best.level}</div><div class="small muted">${esc(exById(best.ex).title)}: ${best.auto.score}% · ${fmtDay(best.date.slice(0, 10)).toLowerCase()}</div>` :
    `<div class="small muted">Твоя оценка интонации</div><div style="font-family:Lora,serif;font-size:22px;font-weight:600">Пока не определена</div><div class="small muted">${checks.length ? 'Ни одна сохранённая проверка пока не набрала 80%. Это нормально, это точка старта.' : 'Нет сохранённых проверок. Начни с мелодии 1.'}</div>`}</div>`;
  h += `<div class="sec"><div class="seg">${MELODIES.map(m => `<button class="${melSel === m.id ? 'on' : ''}" onclick="melSel='${m.id}';render()">Уровень ${m.level}</button>`).join('')}</div></div>`;
  const m = exById(melSel);
  setRun({ ex: m, auto: null, rating: null, crit: new Set() });
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
export function saveMelody() {
  const m = run.ex; if (!run.auto) return;
  const s = { id: uid(), ex: m.id, cat: 'pitch', level: m.level, date: nowLocal(), rating: run.rating, auto: run.auto };
  const note = $('#melnote').value.trim(); if (note) s.note = note;
  const before = levelInfo('pitch').open;
  state.sessions.push(s); save();
  const after = levelInfo('pitch').open;
  toast(after > before ? `Открыт уровень ${after} в разделе «Интонация»!` : 'Проверка сохранена.');
  render();
}






// установщики для моста window (переходный период, см. main.js)
export function __set_melSel(v) { melSel = v; }

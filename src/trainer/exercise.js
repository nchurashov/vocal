import { VA } from '../core/analysis.js';
import { ac, base, stopAll, tone } from '../core/audio.js';
import { afterHooks, go } from '../core/router.js';
import { save, state } from '../core/store.js';
import { toast } from '../core/ui.js';
import { $, ICON, esc, nowLocal, plural, uid } from '../core/util.js';
import { CATS, RATINGS, exById } from '../data/exercises.js';
import { sessionRow } from '../screens/history.js';
import { NEED_CONF, NEED_DAYS, isUnlocked, levelInfo, srsUpdate, suggestRating } from './logic.js';
import { recorderUI } from './recorder.js';
import { tapUI } from './tap.js';

// ===== Экран упражнения =====
// текущее занятие: { ex, auto, rating, crit }
export let run = null;
export function setRun(v) { run = v; }
export function rollSVG(notes, result) {
  const W = 640, H = 170, pad = 28;
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
export function viewExerciseBase(ex) {
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
export function practiceIntro(ex) {
  if (ex.kind === 'quiz') return `<h3>Тренировка с проверкой</h3><p class="small muted" style="margin:4px 0 12px">10 вопросов. После каждого ответа сразу видно, верно или нет.</p>${ex.quiz === 'interval' ? intervalRefs() : ''}<button class="btn block" onclick="startQuiz()">${ICON.play} Начать</button>`;
  if (ex.kind === 'sing') return `<h3>Проверка по записи</h3><p class="small muted" style="margin:4px 0 12px">Спой и запиши себя. Приложение найдёт каждую ноту и покажет, верно она спета, близко или мимо.</p><div id="recbox"></div>`;
  return `<h3>Проверка: отстучи ритм</h3><p class="small muted" style="margin:4px 0 12px">После 4 щелчков отсчёта стучи по кнопке (или пробелом). Хлопков в проверке не будет, только метроном.</p><div id="tapbox"></div>`;
}
export function rhythmSVG(ex) {
  const beats = Math.ceil(Math.max(...ex.onsets) + 1), bars = Math.ceil(beats / 4) * 4, W = 640, H = 46, bw = (W - 20) / bars;
  let s = `<svg class="roll" viewBox="0 0 ${W} ${H}">`;
  for (let i = 0; i <= bars; i++) s += `<line x1="${10 + i * bw}" x2="${10 + i * bw}" y1="8" y2="${H - 8}" stroke="var(--line)" stroke-width="${i % 4 === 0 ? 2 : 1}"/>`;
  ex.onsets.forEach(o => s += `<circle cx="${10 + o * bw + 4}" cy="${H / 2}" r="7" fill="var(--rhythm)"/>`);
  return s + '</svg>';
}
export function toggleCrit(i, on) { on ? run.crit.add(i) : run.crit.delete(i); }
export function setRating(r) {
  run.rating = r;
  document.querySelectorAll('#ratebox .rate button').forEach(b => b.classList.toggle('on', +b.dataset.r === r));
  $('#savebtn').disabled = false;
}
export function suggestFromAuto(score, label) {
  const r = suggestRating(score);
  if (run.rating == null) setRating(r);
  $('#ratehint').textContent = `По результату проверки (${label} ${score}%) предлагаю «${RATINGS[r].label}». Поменяй, если чувствуешь иначе.`;
}
export function saveSession() {
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
export const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const QUIZ_OPTS = {
  updown: ['Выше', 'Ниже'], samediff: ['Одинаковые', 'Разные'],
  contour: ['Вверх-вверх', 'Вниз-вниз', 'Вверх-вниз', 'Вниз-вверх'],
  interval: ['Терция', 'Квинта', 'Октава'], majmin: ['Мажор', 'Минор'],
};
export function makeQ(ex) {
  const b = base() + rnd(0, 7), sp = ex.spread || [2, 4];
  switch (ex.quiz) {
    case 'updown': { const up = Math.random() < .5, d = rnd(sp[0], sp[1]); return { seq: [[b, 1], [b + (up ? d : -d), 1]], ans: up ? 0 : 1 }; }
    case 'samediff': { const same = Math.random() < .5, d = rnd(sp[0], sp[1]) * (Math.random() < .5 ? 1 : -1); return { seq: [[b, 1], [same ? b : b + d, 1]], ans: same ? 0 : 1 }; }
    case 'contour': { const k = rnd(0, 3), s1 = rnd(2, 4), s2 = rnd(2, 4); const d = [[1, 1], [-1, -1], [1, -1], [-1, 1]][k]; const m = b + 2; return { seq: [[m, .8], [m + d[0] * s1, .8], [m + d[0] * s1 + d[1] * s2, .8]], ans: k }; }
    case 'interval': { const k = rnd(0, 2), iv = [4, 7, 12][k]; const lo = base() + rnd(0, 4); return { seq: [[lo, 1], [lo + iv, 1]], ans: k }; }
    case 'majmin': { const k = rnd(0, 1), t = k ? 3 : 4; return { seq: [[b, .5], [b + t, .5], [b + 7, .5]], chord: [b, b + t, b + 7], ans: k }; }
  }
}
export function playQ(q, bpm = 80) {
  stopAll(); const c = ac(), bt = 60 / bpm; let t = c.currentTime + .06;
  for (const [m, beats] of q.seq) { tone(m, t, beats * bt * .92); t += beats * bt; }
  if (q.chord) { t += .15; q.chord.forEach(m => tone(m, t, 1.4, .16)); }
}
export function quizSample(id) { playQ(makeQ(exById(id))); }
export function intervalRefs() {
  return `<div class="row wrap" style="margin-bottom:12px;gap:6px"><span class="small muted">Эталоны:</span>${['Терция', 'Квинта', 'Октава'].map((n, i) => `<button class="btn ghost" style="min-height:38px;padding:6px 12px" onclick="playQ({seq:[[base(),1],[base()+${[4, 7, 12][i]},1]]})">${n}</button>`).join('')}</div>`;
}
export let quiz = null;
export function startQuiz() { quiz = { i: 0, right: 0, mistakes: [], q: makeQ(run.ex), answered: false }; drawQuiz(); playQ(quiz.q); }
export function drawQuiz() {
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
export function answerQuiz(k) {
  if (quiz.answered) return; quiz.answered = true;
  const opts = QUIZ_OPTS[run.ex.quiz], ok = k === quiz.q.ans;
  if (ok) quiz.right++; else quiz.mistakes.push({ n: quiz.i + 1, you: opts[k], right: opts[quiz.q.ans] });
  document.querySelectorAll('.answers button').forEach(b => { const kk = +b.dataset.k; if (kk === quiz.q.ans) b.classList.add('right'); else if (kk === k) b.classList.add('wrong'); });
  $('#verdict').innerHTML = `<div class="verdict ${ok ? 'ok' : 'bad'}">${ok ? '✓ Верно' : '✗ Неверно. Правильный ответ: ' + opts[quiz.q.ans]}</div>
    <div class="row" style="margin-top:10px"><button class="btn ghost" onclick="playQ(quiz.q)">${ICON.play} Переслушать</button><button class="btn" style="flex:1" onclick="nextQuiz()">Дальше</button></div>`;
}
export function nextQuiz() { quiz.i++; quiz.answered = false; if (quiz.i < 10) { quiz.q = makeQ(run.ex); drawQuiz(); playQ(quiz.q); } else drawQuiz(); }

// ===== Подключение хуков после рендера упражнения =====
export function viewExercise(ex) {
  const h = viewExerciseBase(ex);
  if (ex && ex.kind === 'sing') afterHooks.push(() => recorderUI($('#recbox'), () => ex, { anyKeyToggle: false, onResult: ev => {
    run.auto = { type: 'sing', score: ev.pitchScore, rhythm: ev.rhythmScore, ok: ev.ok, total: ev.notes.length };
    suggestFromAuto(ev.pitchScore, 'точность нот');
  } }));
  if (ex && ex.kind === 'tap') afterHooks.push(() => tapUI($('#tapbox')));
  return h;
};






// установщики для моста window (переходный период, см. main.js)
export function __set_run(v) { run = v; }
export function __set_quiz(v) { quiz = v; }

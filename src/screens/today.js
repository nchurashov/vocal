import { act } from '../core/actions.js';
import { base, noteShort, strictOct } from '../core/audio.js';
import { profName, state } from '../core/store.js';
import { MONTHS, daysBetween, esc, fmtDay, plural, ymd } from '../core/util.js';
import { CATS, RATINGS } from '../data/exercises.js';
import { BALL_CHAPTERS, BALL_LEVELS, ballDone, ballNextN } from '../features/ball.js';
import { diaryTodayItem } from '../features/diary.js';
import { learnTodayItem } from '../features/learn.js';
import { lastRange } from '../features/register.js';
import { songsAll } from '../features/songs.js';
import { setMin, voiceDoneToday, voiceNext } from '../features/voice.js';
import { doneToday, warmupMin } from '../features/warmup.js';
import { NEED_CONF, NEED_DAYS, dueList, freshList, isUnlocked, levelInfo, pitchAssessment, streak } from '../trainer/logic.js';

// ===== Экран: Сегодня =====
export function levelCard(cat) {
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
export function exItem(e, sub) {
  const locked = !isUnlocked(e);
  return `<button class="item ${locked ? 'locked' : ''}" ${act('go', `ex-${e.id}`)}>
    <div class="dot ${e.cat}">${e.level}</div>
    <div class="t"><b>${esc(e.title)}</b><span class="small muted">${sub || esc(CATS[e.cat].name + ' · ' + e.min + ' мин')}</span>
    ${locked ? `<div class="lockline">🔒 Откроется после ${NEED_CONF} уверенных занятий уровня ${e.level - 1} за ${NEED_DAYS}+ дня</div>` : ''}</div>
    <span class="muted">›</span></button>`;
}
export function viewToday() {
  const due = dueList(), fresh = freshList(), n7 = state.sessions.filter(s => daysBetween(s.date.slice(0, 10), ymd()) < 7).length, st = streak();
  const d = new Date();
  let h = `<h1>Сегодня</h1><div class="muted">${d.getDate()} ${MONTHS[d.getMonth()]}</div>
    <p class="small" style="margin:8px 0 0">🍷 ${profName() ? esc(profName()) + ', налей' : 'Налей'} бокал и включи одно упражнение в день. Через месяц ты не узнаешь свой голос.</p>`;
  if (!profName()) h += `<div class="card sec stack" style="padding:14px"><b>Как тебя зовут?</b><div class="row"><input id="tdname" class="inp" style="flex:1" maxlength="30" placeholder="Имя"><button class="btn" ${act('profRenameFrom', '#tdname')}>Готово</button></div><div class="tiny muted">Имя появится в твоих видео. Если телефон передают друзьям, у каждого может быть свой профиль: нажми 🎤 вверху.</div></div>`;
  if (!state.sessions.length) {
    h += `<div class="card sec stack"><h3>Привет! С чего начнём</h3>
      <p class="small" style="margin:0">Твой уровень пока не определён, и приложение ничего не додумывает. Оно отталкивается только от того, что ты сам отметишь после практики.</p>
      <p class="small" style="margin:0">Выбери любое упражнение уровня 1 или пройди <a href="#check">оценку по мелодии</a>: споёшь короткую мелодию, и запись покажет, какие ноты верные.</p>
      <button class="btn soft" ${act('go', 'range')}>Замерить диапазон и выбрать ноту</button></div>`;
  } else {
    h += `<div class="row sec" style="margin-top:14px;gap:8px"><span class="pill">За 7 дней: ${n7} ${plural(n7, 'занятие', 'занятия', 'занятий')}</span><span class="pill">Дней подряд: ${st}</span></div>`;
  }
  h += `<button class="item sec" style="margin-top:18px" ${act('go', 'warmup')}><div class="dot rhythm">${doneToday() ? '✓' : '♪'}</div><div class="t"><b>Распевка дня${doneToday() ? ': сделана' : ''}</b><span class="small muted">${doneToday() ? 'Можно повторить или сразу петь' : `Около ${warmupMin()} мин: дыхание, трель, мычание, гаммы, спуск вниз`}</span></div><span class="muted">›</span></button>`;
  h += diaryTodayItem();
  { const nx = voiceNext(), dn = voiceDoneToday();
    h += `<button class="item" ${act('go', `voice-${nx.id}`)}><div class="dot ear">${dn ? '✓' : nx.icon}</div><div class="t"><b>Голос и речь${dn ? ': сделано' : ''}: ${nx.title}</b><span class="small muted">${dn ? 'Можно ещё один комплекс' : setMin(nx) + ' мин · дыхание, дикция, плавная речь, сильный голос'}</span></div><span class="muted">›</span></button>`; }
  { const nx = BALL_LEVELS[ballNextN() - 1], done = BALL_LEVELS.filter(l => ballDone(l.n)).length;
    h += `<button class="item" ${act('go', `ball-${nx.n}`)}><div class="dot pitch">🟠</div><div class="t"><b>Шарик: глава ${nx.ch + 1}, ${nx.exam ? 'экзамен' : 'задание ' + nx.task}</b><span class="small muted">${esc(BALL_CHAPTERS[nx.ch].title)} · пройдено ${done} из ${BALL_LEVELS.length}</span></div><span class="muted">›</span></button>`; }
  { const mine = songsAll().filter(x => x.src !== 'builtin').length;
    h += `<button class="item" ${act('go', 'songs')}><div class="dot rhythm">🎵</div><div class="t"><b>Разучить песню</b><span class="small muted">${mine ? 'Моих песен: ' + mine + ' · ' : ''}Своя из MIDI или караоке, или напой сам. По фразам, потом целиком</span></div><span class="muted">›</span></button>`; }
  { const r = lastRange();
    h += `<button class="item" ${act('go', 'range')}><div class="dot ear">↕</div><div class="t"><b>${r ? 'Мой диапазон: ' + noteShort(r.lo) + ' - ' + noteShort(r.hi) : 'Замерить мой диапазон'}</b><span class="small muted">${r ? 'Последний замер ' + fmtDay(r.date.slice(0, 10)).toLowerCase() + ' · работаем от ' + noteShort(base()) + (strictOct() ? ', строго в октаве' : '') : 'Минута: узнаешь свой низ и верх и выберешь, где работать'}</span></div><span class="muted">›</span></button>`; }
  h += learnTodayItem();
  h += `<div class="sec"><h2>Повторить сегодня</h2>`;
  if (due.length) h += due.map(e => { const s = state.srs[e.id]; return exItem(e, `В прошлый раз: ${RATINGS[s.lastRating].label.toLowerCase()} · ${fmtDay(s.last).toLowerCase()}`); }).join('');
  else h += `<div class="card small muted">${state.sessions.length ? 'На сегодня повторов нет. Можно взять новое упражнение ниже.' : 'Повторы появятся после первых отметок: что не получилось, вернётся раньше, что получилось уверенно, реже.'}</div>`;
  h += `</div>`;
  if (fresh.length) h += `<div class="sec"><h2>Можно попробовать</h2>${fresh.map(e => exItem(e)).join('')}</div>`;
  h += `<div class="sec"><h2>Уровни</h2><div class="grid3">${Object.keys(CATS).map(levelCard).join('')}</div>
    <p class="tiny muted">Следующий уровень открывается только после ${NEED_CONF} отметок «Уверенно» на текущем уровне минимум за ${NEED_DAYS} разных дня.</p></div>`;
  return h;
}

import { act } from '../core/actions.js';
import { base, noteShort } from '../core/audio.js';
import { afterHooks, render } from '../core/router.js';
import { save, state } from '../core/store.js';
import { toast } from '../core/ui.js';
import { $, ICON, esc, nowLocal, plural } from '../core/util.js';
import { B, ballSetup, ballTol, diffSeg, rank } from './ball.js';
import { camOn, camStart, camToggleHTML } from './cam.js';
import { starStr } from './game.js';
import { octaveHint } from './register.js';
import { phraseNotes } from './songlib.js';
import { shiftText, songById, songShiftOf, songWin } from './songs.js';

// ===== Песня в «Шарике»: каждая песня - своя глава. Стены идут по нотам мелодии, ты ведёшь шарик голосом.
// Задания: каждая фраза отдельно (пианино сначала играет её), потом фразы парами по памяти, в конце вся песня.
// Маршруты: #song-<id> (задания песни), #sball-<id>-<N> (задание). Прогресс - state.songs[id].ball[N] = {stars, pct, tol, date}.
// Засчитано с 2 звёзд (80% стен) - открывается следующее задание. Правила стен и звёзд - общие с «Шариком» (ballStep).
export const SB_NEED = 2;
// ноты -> стены «Шарика» [полутон от базы, длина, пауза, слог] при bpm 60 (доля = секунда).
// Быстрые песни замедляем целиком (ритм сохраняется): короткие ноты (четверть самых коротких) - около 0.8 с, не больше чем в 3 раза.
// Совсем короткие - не короче 0.75 с: иначе тоннель (за вычетом окна на смену ноты) слишком короткий для честной проверки
export function songWalls(notes, rel) {
  const ds = notes.map(n => n.d).sort((a, b) => a - b), q = ds[Math.floor(ds.length / 4)];
  const k = Math.max(1, Math.min(3, .8 / q));
  return notes.map((n, i) => {
    const len = Math.max(.75, n.d * k), nx = notes[i + 1];
    const gap = nx ? Math.max(0, (nx.t - n.t) * k - len) : 1;
    const w = n.w && n.w.trim().length <= 12 ? n.w.trim() : '';
    return [n.m + rel, +len.toFixed(3), +gap.toFixed(3), ...(w ? [w] : [])];
  });
}
export function songLevels(s) {
  const P = s.ph.length, rel = songShiftOf(s) - base(), out = [];
  const add = (title, notes, o) => out.push({ n: out.length + 1, song: s.id, title, bpm: 60, walls: songWalls(notes, rel), ...o });
  const range = (a, b) => s.notes.slice(s.ph[a], b + 1 < P ? s.ph[b + 1] : s.notes.length);
  for (let k = 0; k < P; k++) add(`Фраза ${k + 1}`, phraseNotes(s, k), { preview: true, guide: true, hint: 'Сначала пианино сыграет фразу, потом пой её сам: шарик полетит за голосом' });
  if (P > 1) for (let k = 0; k < P; k += 2) { const a = Math.min(k, P - 2); add(`Фразы ${a + 1}-${a + 2}`, range(a, a + 1), { preview: false, guide: false, hint: 'По памяти: прозвучит только первая нота' }); }
  add('Вся песня', s.notes, { preview: false, guide: false, exam: true, hint: 'Вся песня по памяти, от первой ноты' });
  return out;
}
const sbProg = id => (((state.songs ||= {})[id] ||= { ph: {}, whole: 0, plays: 0 }).ball ||= {});
const sbBest = (id, n) => (((state.songs || {})[id] || {}).ball || {})[n];
export const sbDone = (id, n) => ((sbBest(id, n) || {}).stars || 0) >= SB_NEED;
export const sbUnlocked = (id, n) => n === 1 || sbDone(id, n - 1);
export const sbCount = s => songLevels(s).filter(l => sbDone(s.id, l.n)).length;
export const sbNextN = s => { const L = songLevels(s), l = L.find(x => !sbDone(s.id, x.n)); return (l || L[L.length - 1]).n; };

// --- экран песни: задания главой, как в «Шарике»
export function viewSongLevels(id) {
  const s = songById(id), L = songLevels(s), ms = s.notes.map(n => n.m), sh = songShiftOf(s);
  const stars = L.reduce((a, l) => a + ((sbBest(id, l.n) || {}).stars || 0), 0), done = L.filter(l => sbDone(id, l.n)).length;
  let h = `<button class="back" ${act('go', 'songs')}>${ICON.back} Песни</button><h1>${esc(s.title)}</h1>
    <p class="muted" style="margin:6px 0 0">${s.ph.length} ${plural(s.ph.length, 'фраза', 'фразы', 'фраз')} · ${noteShort(Math.min(...ms) + sh)} - ${noteShort(Math.max(...ms) + sh)}${s.by ? ' · ' + esc(s.by) : ''}</p>
    <p class="small" style="margin:8px 0 0">Песня как глава «Шарика»: стены стоят по нотам мелодии. Сначала каждая фраза с подсказкой пианино, потом по памяти, в конце вся песня. Так мелодия и запоминается.</p>
    <div class="row sec" style="margin-top:12px;gap:8px"><span class="pill">★ ${stars} из ${L.length * 3}</span><span class="pill">Пройдено: ${done} из ${L.length}</span></div>
    <div class="ggrid sec" style="margin-top:12px">`;
  for (const lv of L) {
    const best = sbBest(id, lv.n), o = sbUnlocked(id, lv.n), ok = sbDone(id, lv.n);
    h += `<button class="gtile ${o ? '' : 'locked'}" ${o ? act('go', `sball-${id}-${lv.n}`) : ''}>
      <span class="gnum">${o ? (lv.exam ? '🎓' : lv.n) : '🔒'}</span><b>${esc(lv.title)}</b><span class="gstars">${starStr(best ? best.stars : 0)}</span>
      <span class="tiny muted">${ok ? 'пройдено' : best ? 'нужно 2★, есть ' + best.stars : o ? (lv.preview ? 'с подсказкой' : 'по памяти') : 'закрыто'}</span></button>`;
  }
  h += `</div><p class="tiny muted">3 жизни. Звёзды: 1 за 60% стен, 2 за 80%, 3 за все. Задание засчитано с 2 звёзд, тогда открывается следующее.</p>
    <div class="card sec stack" style="padding:12px 14px">
      <div class="row" style="gap:8px"><span class="small" style="flex:1">Тональность: <b>${shiftText(sh)}</b></span>
        <button class="iconbtn" ${act('sbShift', id, -1)} title="Ниже">−</button><button class="iconbtn" ${act('sbShift', id, 1)} title="Выше">+</button></div>
      <div class="tiny muted" style="margin-top:-6px">Подобрал под твой голос (${noteShort(songWin()[0])} - ${noteShort(songWin()[1])}). Неудобно - сдвинь на полутон.</div></div>
    <button class="item sec" ${act('go', `karaoke-${id}`)}><div class="dot rhythm">🎤</div><div class="t"><b>Караоке${s.notes.some(n => n.w) ? ' со словами' : ''}</b><span class="small muted">Спеть вместе с пианино, повторять по фразам или целиком, ноты-полоски едут под слова</span></div><span class="muted">›</span></button>
    ${s.src !== 'builtin' ? `<button class="btn ghost block sec" style="color:var(--bad)" ${act('songAskDel', s.id)}>Удалить песню</button>` : ''}`;
  return h;
}
export function sbShift(id, d) { const s = songById(id); if (!s) return; const p = ((state.songs ||= {})[id] ||= { ph: {}, whole: 0, plays: 0 }); p.shift = songShiftOf(s) + d; save(); render(); }

// --- задание песни: тот же экран и движок, что у «Шарика»
export function sbParse(rest) { const m = /^(.+)-(\d+)$/.exec(rest); if (!m) return null; const s = songById(m[1]); if (!s) return null; const lv = songLevels(s).find(l => l.n === +m[2]); return lv ? { s, lv } : null; }
export function viewSongBall(rest) {
  const { s, lv } = sbParse(rest), id = s.id, L = songLevels(s);
  if (!sbUnlocked(id, lv.n)) return `<button class="back" ${act('go', `song-${id}`)}>${ICON.back} ${esc(s.title)}</button><div class="note">🔒 Сначала пройди предыдущее задание на 2 звезды.</div>`;
  lv.camTitle = `${s.title} · ${lv.title}`;
  lv.onResult = r => sbResult(s, lv, L.length, r);
  const best = sbBest(id, lv.n);
  afterHooks.push(() => ballSetup(lv)); afterHooks.push(() => { if (camOn()) camStart(); });
  return `<button class="back" ${act('go', `song-${id}`)}>${ICON.back} ${esc(s.title)}</button>
    <div class="row between"><div><div class="tiny muted">«${esc(s.title)}» · задание ${lv.n} из ${L.length} · точность ±${ballTol()} ц</div><h1 style="margin-top:2px">${esc(lv.title)}</h1></div><div style="font-size:22px" id="bstars">${starStr(best ? best.stars : 0)}</div></div>
    <p class="muted" style="margin:4px 0 0">${esc(lv.hint)}. Чтобы засчитать, нужно 2 звезды (80% стен).</p>${octaveHint()}${camToggleHTML()}
    ${diffSeg()}
    <div id="bbest">${sbBestHTML(s, lv, L.length)}</div>
    <div class="gstage sec"><canvas id="bcv"></canvas></div>
    <div id="bctl" class="stack" style="margin-top:12px"></div><div id="bnote"></div><div id="bres"></div>`;
}
function sbNextBtn(s, lv, total) {
  return lv.n < total && sbUnlocked(s.id, lv.n + 1) ? `<button class="btn" ${act('go', `sball-${s.id}-${lv.n + 1}`)}>Задание ${lv.n + 1} →</button>`
    : lv.n === total && sbDone(s.id, lv.n) ? `<button class="btn" ${act('go', `karaoke-${s.id}`)}>🎤 Спеть в караоке</button>` : '';
}
function sbBestHTML(s, lv, total) {
  const best = sbBest(s.id, lv.n); if (!best) return '';
  return `<div class="card row between wrap" style="margin-top:12px;gap:8px;padding:12px 14px"><div><div class="tiny muted">Твой рекорд сохранён</div><b>${starStr(best.stars)} ${best.pct}% стен при ±${best.tol || 40}</b></div>${sbNextBtn(s, lv, total)}</div>`;
}
function sbResult(s, lv, total, r) {
  const bm = sbProg(s.id), prev = bm[lv.n], tol = ballTol(), wasOpen = sbUnlocked(s.id, lv.n + 1);
  const record = !prev || rank(r.stars, r.pct, tol) > rank(prev.stars, prev.pct, prev.tol || 40);
  if (record) bm[lv.n] = { pct: r.pct, stars: r.stars, tol, date: nowLocal() };
  save();
  $('#bstars').innerHTML = starStr(bm[lv.n].stars); $('#bbest').innerHTML = sbBestHTML(s, lv, total);
  const opened = !wasOpen && lv.n < total && sbUnlocked(s.id, lv.n + 1);
  const msg = r.lives <= 0 ? 'Шарик разбился. Посмотри демо, послушай мелодию и попробуй снова.' : r.stars < SB_NEED ? `Чтобы засчитать, нужно 2 звезды (80% стен). Сейчас ${r.stars}★ - ещё раз, мелодия запоминается с повтором.`
    : lv.n === total ? `Песня пройдена! Ты спел «${esc(s.title)}» по памяти.` : opened ? `Засчитано! Задание ${lv.n + 1} открыто.` : r.stars === 3 ? 'Все стены чисто!' : 'Засчитано. Можно улучшить рекорд или идти дальше.';
  const notesTxt = B.walls.map(w => `${w.word ? esc(w.word) + ' ' : ''}${noteShort(base() + w.rel)} ${w.passed ? '✓' : w.crashed ? '✗' : '·'}`).join(' · ');
  $('#bres').innerHTML = `<div class="card sec stack" style="text-align:center">
    <div>${starStr(r.stars, true)}</div>
    <div style="font-family:Lora,serif;font-size:32px;font-weight:600">${r.passed} из ${r.total} стен</div>
    <div class="small muted">жизней осталось: ${Math.max(0, r.lives)}${record && prev ? ' · новый рекорд!' : ''}</div>
    <div class="small">${notesTxt}</div>
    <div class="${r.stars ? 'info' : 'note'}">${msg}</div>
    <div class="row wrap" style="justify-content:center">${sbNextBtn(s, lv, total)}</div></div>`;
  if (opened) toast(`Задание ${lv.n + 1} открыто!`);
}

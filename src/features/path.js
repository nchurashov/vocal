import { act } from '../core/actions.js';
import { go, render } from '../core/router.js';
import { save, state } from '../core/store.js';
import { closeSheet, sheet } from '../core/ui.js';
import { esc } from '../core/util.js';
import { ballDone } from './ball.js';
import { lastRange } from './register.js';
import { sbDone } from './songball.js';
import { songById } from './songs.js';
import { sbTotal } from './songlib.js';

// ===== Путь «С нуля»: для тех, кто не умеет петь. Карточка на «Сегодня» показывает один следующий шаг.
// Шаг отмечается сделанным только по настоящим данным: замер, звёзды «Шарика», пройденная распевка, спетая песня.
// Порядок: попасть в одну ноту -> разогреть голос -> первая песня вместе с пианино -> шаги между нотами -> песня сам.
const STAR = 'b-twinkle';
const sp = () => (state.songs || {})[STAR] || { ph: {} };
const nDone = (a, b) => { let n = 0; for (let i = a; i <= b; i++) if (ballDone(i)) n++; return n; };
const firstOpen = (a, b) => { for (let i = a; i <= b; i++) if (!ballDone(i)) return i; return b; };
// песня в «Шарике»: задания 1..P - фразы с подсказкой, дальше по памяти и вся песня
const P = () => { const s = songById(STAR); return s ? s.ph.length : 1; };
const sbN = (a, b) => { let n = 0; for (let i = a; i <= b; i++) if (sbDone(STAR, i)) n++; return n; };
const sbFirst = (a, b) => { for (let i = a; i <= b; i++) if (!sbDone(STAR, i)) return i; return b; };
export const PATH = [
  { id: 'range', icon: '↕', title: 'Замерь свой диапазон', why: 'Одна минута: приложение узнает, где твоему голосу удобно, и подстроит под него ноты.',
    done: () => !!lastRange(), to: () => 'range' },
  { id: 'note', icon: '🟠', title: 'Шарик: повтори одну ноту', why: 'Главный навык пения: услышал ноту - повторил её голосом. Первые 3 задания, от 2 звёзд.',
    done: () => nDone(1, 3) === 3, prog: () => `${nDone(1, 3)} из 3`, to: () => 'ball-' + firstOpen(1, 3) },
  { id: 'warmup', icon: '♪', title: 'Распевка', why: 'Дыхание, мычание и гаммы разогревают голос, ноты потом берутся легче. Дальше - перед каждым пением.',
    done: () => (state.warmups || []).length > 0, to: () => 'warmup' },
  { id: 'along', icon: '🎹', title: 'Первая песня вместе с пианино', why: '«Маленькая звёздочка»: пианино играет, ты поёшь вместе с ним. Спой так два раза.',
    done: () => (sp().along || 0) >= 2, prog: () => `${Math.min(2, sp().along || 0)} из 2`, to: () => ['karaoke-' + STAR, 'along'] },
  { id: 'note10', icon: '🟠', title: 'Шарик: вся глава «Одна нота»', why: 'Одна нота от всех ступеней и экзамен главы без ударов.',
    done: () => ballDone(10), prog: () => `${nDone(1, 10)} из 10`, to: () => 'ball-' + firstOpen(1, 10) },
  { id: 'step', icon: '🟠', title: 'Шарик: шаг на соседнюю ноту', why: 'Глава «Секунда», первые 3 задания. Из таких шагов состоит любая мелодия.',
    done: () => nDone(11, 13) === 3, prog: () => `${nDone(11, 13)} из 3`, to: () => 'ball-' + firstOpen(11, 13) },
  { id: 'phrase', icon: '🎵', title: '«Звёздочка» в Шарике: по фразе', why: 'Стены по нотам песни. Пианино играет фразу, потом ты ведёшь шарик сам. Каждая фраза на 2 звезды.',
    done: () => sbN(1, P()) === P(), prog: () => `${sbN(1, P())} из ${P()}`, to: () => 'sball-' + STAR + '-' + sbFirst(1, P()) },
  { id: 'whole', icon: '⭐', title: '«Звёздочка» по памяти', why: 'Фразы парами без подсказки, потом вся песня целиком. Так мелодия запоминается.',
    done: () => sbDone(STAR, sbTotal(P())), prog: () => `${sbN(P() + 1, sbTotal(P()))} из ${sbTotal(P()) - P()}`, to: () => 'sball-' + STAR + '-' + sbFirst(P() + 1, sbTotal(P())) },
];
export const pathNext = () => PATH.findIndex(s => !s.done());
export function pathGo(i) {
  const st = PATH[i]; if (!st) return;
  closeSheet();
  const t = st.to();
  if (Array.isArray(t)) { state.settings.songMode = t[1]; save(); go(t[0]); } else go(t);
}
export function pathHide(v) { state.settings.pathHide = !!v; save(); closeSheet(); render(); }
const stepItem = (st, i, cur) => {
  const ok = st.done(), pr = st.prog ? st.prog() : '';
  return `<button class="item" ${act('pathGo', i)} style="${i === cur ? 'border:2px solid var(--accent)' : ''}"><div class="dot ${ok ? 'ear' : 'pitch'}">${ok ? '✓' : i + 1}</div><div class="t"><b>${esc(st.title)}</b><span class="small muted">${esc(st.why)}${pr ? ' · ' + esc(pr) : ''}</span></div><span class="muted">›</span></button>`;
};
export function pathAll() {
  const cur = pathNext();
  sheet(`<h2>Путь с нуля</h2>
    <p class="small" style="margin:0">Петь - это навык, ему учатся: услышать ноту и попасть в неё голосом. Идём от одной ноты к песне, по 10-15 минут в день. Шаг отмечается сам, когда микрофон его засчитал.</p>
    <div class="stack" style="gap:6px">${PATH.map((st, i) => stepItem(st, i, cur)).join('')}</div>
    <button class="btn ghost" ${act('pathHide', 1)}>Я уже пою - скрыть путь</button>
    <button class="btn" ${act('closeSheet')}>Закрыть</button>`);
}
// карточка на «Сегодня»
export function pathCard() {
  if (state.settings.pathHide) return '';
  const i = pathNext(), n = PATH.filter(s => s.done()).length;
  if (i < 0) return `<div class="card sec stack" style="padding:14px"><b>Путь с нуля пройден 🎉</b>
    <div class="small muted">Ты спел первую песню сам. Дальше: «Ода к радости», главы «Шарика» по порядку и своя песня.</div>
    <div class="row"><button class="btn ghost" style="flex:1" ${act('go', 'songs')}>Песни</button><button class="btn ghost" style="flex:1" ${act('pathHide', 1)}>Скрыть</button></div></div>`;
  const st = PATH[i], pr = st.prog ? st.prog() : '';
  return `<div class="card sec stack" style="padding:14px">
    <div class="row" style="gap:8px"><div style="flex:1"><b>Путь с нуля</b><div class="tiny muted">Сделано ${n} из ${PATH.length} · следующий шаг</div></div><button class="btn ghost" style="padding:6px 12px" ${act('pathAll')}>Весь путь</button></div>
    <div class="bar"><i style="width:${Math.round(100 * n / PATH.length)}%"></i></div>
    <button class="item" style="margin:0" ${act('pathGo', i)}><div class="dot pitch">${st.icon}</div><div class="t"><b>${esc(st.title)}</b><span class="small muted">${esc(st.why)}${pr ? ' · ' + esc(pr) : ''}</span></div><span class="muted">›</span></button></div>`;
}

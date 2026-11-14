import { act } from '../core/actions.js';
import { noteShort } from '../core/audio.js';
import { pianoSVG } from '../core/piano.js';
import { ICON } from '../core/util.js';
import { lastRange } from './register.js';

export const VOICES = [['Бас', 40, 64], ['Баритон', 45, 69], ['Тенор', 48, 72], ['Альт', 53, 77], ['Меццо-сопрано', 57, 81], ['Сопрано', 60, 84]];
export function viewLearn() {
  const r = lastRange();
  const names = [['До', 'C'], ['Ре', 'D'], ['Ми', 'E'], ['Фа', 'F'], ['Соль', 'G'], ['Ля', 'A'], ['Си', 'B']];
  const vrow = ([n, lo, hi, col]) => { const L = 36, H = 84, w = 100 / (H - L + 1); return `<div class="row" style="gap:8px;margin-top:6px"><span class="small" style="width:108px;flex:none">${n}</span><div style="flex:1;position:relative;height:14px;background:var(--line);border-radius:7px"><i style="position:absolute;left:${(lo - L) * w}%;width:${(hi - lo + 1) * w}%;top:0;bottom:0;border-radius:7px;background:${col || 'var(--ear)'};opacity:.8"></i></div><span class="tiny muted" style="width:62px;flex:none;text-align:right">${noteShort(lo)}-${noteShort(hi)}</span></div>`; };
  return `<button class="back" ${act('back')}>${ICON.back} Назад</button><h1>Как устроены ноты</h1>
    <p class="muted" style="margin:6px 0 0">Коротко: что значат До, C4 и E2 и где это на пианино. Нажимай на клавиши, они звучат.</p>
    <div class="card sec stack"><div id="pkname" class="small" style="min-height:22px;text-align:center">Нажми на клавишу</div>
      <div style="overflow-x:auto">${pianoSVG(36, 83, { tap: true, octaves: true, band: r ? [r.lo, r.chestHi ?? r.hi] : null, band2: r && r.chestHi != null && r.chestHi < r.hi ? [r.chestHi + 1, r.hi] : null, id: 'pklearn' })}</div>
      ${r ? `<div class="tiny muted">Цветом отмечен твой замеренный диапазон ${noteShort(r.lo)} - ${noteShort(r.hi)}${r.chestHi != null && r.chestHi < r.hi ? `: грудной до ${noteShort(r.chestHi)}, выше - фальцет` : ''}.</div>` : ''}</div>
    <div class="card sec stack"><h3>7 нот</h3>
      <p class="small" style="margin:0">Белые клавиши - это 7 нот, которые повторяются по кругу. У них два названия: русское и латинское (буквы).</p>
      <div class="row wrap" style="gap:6px">${names.map(([ru, en]) => `<span class="pill" style="padding:6px 10px"><b>${en}</b> = ${ru}</span>`).join('')}</div>
      <p class="small" style="margin:0">После Си снова идёт До, только выше. Расстояние от До до следующего До называется <b>октава</b>.</p></div>
    <div class="card sec stack"><h3>Чёрные клавиши и полутоны</h3>
      <p class="small" style="margin:0">Соседние клавиши (белая и чёрная рядом) отличаются на <b>полутон</b> - это самый маленький шаг в музыке. В октаве 12 полутонов.</p>
      <p class="small" style="margin:0">Чёрная клавиша называется по соседней белой со значком: <b>#</b> (диез) - на полутон выше. Например, C# = До-диез, между До и Ре.</p>
      <p class="small" style="margin:0">Полутон делится на 100 <b>центов</b>. Когда в игре написано «точность ±40 центов», это значит: можно промахнуться меньше чем на половину полутона.</p></div>
    <div class="card sec stack"><h3>Что значит цифра: C4, E2</h3>
      <p class="small" style="margin:0">Цифра - это номер октавы, то есть насколько высоко. Буква - нота, цифра - этаж.</p>
      <div class="stack" style="gap:0">${[[2, 'большая октава', 'низкие мужские ноты'], [3, 'малая октава', 'обычная речь мужчин'], [4, 'первая октава', 'середина пианино, обычная речь женщин'], [5, 'вторая октава', 'высокие женские ноты']].map(([n, ru, d]) => `<div class="row small" style="gap:8px;padding:4px 0"><b style="width:28px">${n}</b><span style="flex:1"><b>${ru}</b> <span class="muted">- ${d}</span></span></div>`).join('')}</div>
      <p class="small" style="margin:0"><b>C4</b> = До первой октавы, «центральное до» в середине клавиатуры. <b>E2</b> = Ми большой октавы, очень низкая нота. <b>G5</b> = Соль второй октавы, очень высокая.</p></div>
    <div class="card sec stack"><h3>Грудной голос и фальцет</h3>
      <p class="small" style="margin:0"><b>Грудной голос</b> - обычный, плотный, как в разговоре. <b>Фальцет</b> - лёгкий, «воздушный» верх, на котором у мужчин можно взять очень высокие ноты.</p>
      <p class="small" style="margin:0">Место, где голос сам хочет переключиться, называют <b>переходом</b>. У многих там «ломается» звук. Шов становится мягче от упражнений на переход: в распевке это шаг «Переход в фальцет», он появится, когда отметишь переход в замере.</p></div>
    <div class="card sec stack"><h3>Голоса</h3>
      <p class="small" style="margin:0">Примерные удобные диапазоны певческих голосов. У каждого по-своему, и диапазон растёт с тренировкой.</p>
      <div>${VOICES.map(vrow).join('')}${r ? (r.chestHi != null && r.chestHi < r.hi ? vrow(['Твой грудной', r.lo, r.chestHi, 'var(--accent)']) + vrow(['Твой фальцет', r.chestHi + 1, r.hi, 'var(--near)']) : vrow(['Твой замер', r.lo, r.hi, 'var(--accent)'])) : ''}</div>
      ${r ? '' : '<a href="#range" class="small">Замерить свой диапазон</a>'}</div>`;
}

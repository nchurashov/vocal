import { act, onChange } from '../core/actions.js';
import { VA } from '../core/analysis.js';
import { base, noteFull, noteShort, strictOct } from '../core/audio.js';
import { pianoSVG } from '../core/piano.js';
import { go, render } from '../core/router.js';
import { save, state } from '../core/store.js';
import { closeSheet } from '../core/ui.js';
import { $, BASE_MAX, BASE_MIN, ICON } from '../core/util.js';
import { openSettings } from '../screens/settings.js';

// ===== Высота работы и диапазон =====
export function setVoice(m) { state.settings.base = m; state.settings.voiceSet = true; save(); render(); }
export function setBase(m) {
  state.settings.base = Math.max(BASE_MIN, Math.min(BASE_MAX, m)); state.settings.voiceSet = true; save(); render();
  if ($('#sheet')) openSettings();
}
export function setStrict(on) { state.settings.strict = !!on; save(); render(); if ($('#sheet')) openSettings(); }
export const lastRange = () => (state.range || [])[(state.range || []).length - 1];
export function rangeWarn() {
  const r = lastRange(); if (!r) return '';
  const lo = base(), hi = base() + 12;
  if (lo < r.lo) return `<div class="tiny" style="color:var(--bad)">Нижняя нота ниже твоего замеренного диапазона (${noteShort(r.lo)} - ${noteShort(r.hi)}). Не дави, пой мягко.</div>`;
  if (r.chestHi != null && hi > r.chestHi && hi <= r.hi) return `<div class="tiny" style="color:var(--near)">Верх уровней (до ${noteShort(hi)}) выше твоего грудного голоса (до ${noteShort(r.chestHi)}): эти ноты придётся петь фальцетом.</div>`;
  if (hi > r.hi) return `<div class="tiny" style="color:var(--near)">Верх уровней (до ${noteShort(hi)}) выше твоего замеренного диапазона (${noteShort(r.lo)} - ${noteShort(r.hi)}). На самых высоких нотах можно не дотянуть.</div>`;
  return '';
}
// карточка «где работаем»: на экранах игр и в настройках
export function registerCard(inSheet) {
  const r = lastRange();
  return `<div class="card ${inSheet ? '' : 'sec'} stack" style="padding:14px;${inSheet ? '' : 'margin-top:10px'}">
    <div class="row between"><b>Где работаем</b>${r ? `<span class="tiny muted">диапазон ${noteShort(r.lo)} - ${noteShort(r.hi)}${r.chestHi != null ? ', грудной до ' + noteShort(r.chestHi) : ''}</span>` : ''}</div>
    <div class="row"><button class="btn ghost" style="min-width:46px;padding:0" aria-label="Ниже на полутон" ${act('stepBase', -1)}>−</button>
      <div style="flex:1;text-align:center"><div style="font-weight:800">${noteFull(base())}</div><div class="tiny muted">уровни идут от неё вверх до ${noteShort(base() + 12)}</div></div>
      <button class="btn ghost" style="min-width:46px;padding:0" aria-label="Выше на полутон" ${act('stepBase', 1)}>+</button></div>
    <div style="overflow-x:auto">${pianoSVG(Math.min(36, base()), Math.max(83, base() + 12), { band: [base(), base() + 12], cur: r ? null : null })}</div>
    <div class="row wrap" style="gap:6px"><button class="btn ghost" style="flex:1;min-height:38px;padding:6px 10px" ${act('stepBase', -12)}>Октавой ниже</button><button class="btn ghost" style="flex:1;min-height:38px;padding:6px 10px" ${act('stepBase', 12)}>Октавой выше</button><button class="btn ghost" style="min-height:38px;padding:6px 10px" aria-label="Послушать ноту" ${act('playNotes', [[0,2]],80)}>${ICON.play}</button></div>
    <label class="check" style="border:0;padding:0"><input type="checkbox" ${strictOct() ? 'checked' : ''} ${onChange('setStrict')}><span class="small"><b>Только в этой октаве.</b> Для работы над регистром: октавой выше или ниже не засчитается.${strictOct() ? '' : ' Сейчас подходит любая октава.'}</span></label>
    ${rangeWarn()}
    <div class="row wrap small" style="gap:14px"><a href="#range" ${inSheet ? act('goCloseSheet', 'range') : ''}>${r ? 'Замерить диапазон заново' : 'Замерить мой диапазон'}</a><a href="#learn" ${inSheet ? act('goCloseSheet', 'learn') : ''}>Как читать ноты</a></div></div>`;
}
// подсказка на экранах игр: при первом заходе - выбор голоса, потом - карточка высоты
export function octaveHint() {
  if (!state.settings.voiceSet && base() === 48 && !lastRange()) return `<div class="card sec" style="padding:14px;margin-top:10px"><div><b>Какой у тебя голос?</b></div><div class="small muted" style="margin:4px 0 10px">Подсказки зазвучат в твоей высоте. Потом можно поменять или <a href="#range">замерить диапазон</a>.</div>
    <div class="row">${[[48, 'Низкий', 'мужской, от C3'], [60, 'Высокий', 'женский, от C4']].map(([m, t, d]) => `<button class="btn ghost" style="flex:1;flex-direction:column;gap:2px" ${act('setVoice', m)}><span>${t}</span><span class="tiny muted" style="font-weight:500">${d}</span></button>`).join('')}</div></div>`;
  return registerCard(false);
}
export function octLock(S, v, target, collect = true) {
  if (strictOct()) return v;
  if (S.oct == null) {
    if (collect) (S.octBuf ||= []).push(v - target);
    if (S.octBuf.length >= 8) S.oct = 12 * Math.round(VA.median(S.octBuf) / 12);
    return v - 12 * Math.round((v - target) / 12);
  }
  return v - S.oct;
}

export function stepBase(d) { setBase(base() + d); }
// ссылка из окна настроек: закрыть окно и перейти
export function goCloseSheet(r) { closeSheet(); go(r); }

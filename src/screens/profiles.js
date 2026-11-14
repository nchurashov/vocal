import { act } from '../core/actions.js';
import { go, render } from '../core/router.js';
import { PROF, loadState, profCur, profKey, profName, profSave, save } from '../core/store.js';
import { closeSheet, sheet, toast } from '../core/ui.js';
import { $, busy, esc } from '../core/util.js';
import { vidDel } from '../features/diary.js';

// ===== Окно «Кто поёт?»: профили на одном телефоне (данные профилей - core/store.js) =====
export function profSwitch(id) {
  if (busy || !PROF.list.some(p => p.id === id)) return;
  save(); PROF.cur = id; profSave(); loadState(); closeSheet();
  toast(profName() ? 'Привет, ' + profName() + '!' : 'Профиль переключён');
  if (location.hash === '#today') render(); else go('today');
}
export function profAdd(name) {
  name = (name || '').trim().slice(0, 30); if (!name) return;
  const id = 'p' + Date.now().toString(36); PROF.list.push({ id, name }); profSave(); profSwitch(id);
}
export function profRename(name) { profCur().name = (name || '').trim().slice(0, 30); profSave(); render(); if ($('#sheet')) openProfiles(); }
export async function profDel(id) {
  if (PROF.list.length < 2 || !confirm('Удалить профиль «' + (PROF.list.find(p => p.id === id).name || 'без имени') + '» со всем прогрессом и видео?')) return;
  try { const st = JSON.parse(localStorage.getItem(profKey(id)) || '{}'); for (const d of st.diary || []) { try { await vidDel(d.id); } catch (e) { } } } catch (e) { }
  try { localStorage.removeItem(profKey(id)); } catch (e) { }
  PROF.list = PROF.list.filter(p => p.id !== id); if (PROF.cur === id) { PROF.cur = PROF.list[0].id; loadState(); }
  profSave(); closeSheet(); render(); openProfiles();
}
export function openProfiles() {
  sheet(`<div class="row between"><h2>Кто поёт?</h2><button class="iconbtn" ${act('closeSheet')}>×</button></div>
    <p class="small muted" style="margin:0">У каждого свой прогресс, рекорды, диапазон и видео. Удобно, когда телефон передают по кругу.</p>
    ${PROF.list.map(p => `<div class="row" style="gap:8px"><button class="item" style="flex:1;margin:0" ${act('profSwitch', `${p.id}`)}><div class="dot ${p.id === PROF.cur ? 'pitch' : 'ear'}">${p.id === PROF.cur ? '✓' : '🎤'}</div><div class="t"><b>${esc(p.name || 'Без имени')}</b><span class="small muted">${p.id === PROF.cur ? 'сейчас поёт' : 'переключиться'}</span></div></button>${PROF.list.length > 1 ? `<button class="iconbtn" aria-label="Удалить профиль" ${act('profDel', `${p.id}`)}>🗑</button>` : ''}</div>`).join('')}
    <div class="card stack"><b>Моё имя</b><div class="row"><input id="pfname" class="inp" style="flex:1" maxlength="30" placeholder="Как тебя зовут?" value="${esc(profName())}"><button class="btn" ${act('profRenameFrom', '#pfname')}>Сохранить</button></div></div>
    <div class="card stack"><b>Новый человек</b><div class="row"><input id="pfnew" class="inp" style="flex:1" maxlength="30" placeholder="Имя"><button class="btn" ${act('profAddFrom', '#pfnew')}>Добавить</button></div></div>
    <div class="tiny muted">Всё хранится только на этом телефоне. Вход с синхронизацией между устройствами появится позже.</div>`);
}

export function profRenameFrom(sel) { const el = $(sel); if (el) profRename(el.value); }
export function profAddFrom(sel) { const el = $(sel); if (el) profAdd(el.value); }

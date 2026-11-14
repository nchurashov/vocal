import { act } from '../core/actions.js';
import { render } from '../core/router.js';
import { save, state } from '../core/store.js';
import { toast } from '../core/ui.js';
import { $, esc, fmtDay, nowLocal, uid } from '../core/util.js';
import { CATS, EXERCISES, exById } from '../data/exercises.js';

// ===== Экран: Заметки =====
export let editingNote = null;
export function viewNotes() {
  let h = `<h1>Заметки</h1><p class="muted" style="margin:6px 0 0">Наблюдения про голос, советы педагога, песни, которые хочется спеть.</p>
    <div class="card sec stack"><textarea id="notetext" placeholder="Например: на высоких нотах зажимаю челюсть, помогает зевок">${editingNote ? esc(state.notes.find(n => n.id === editingNote)?.text) : ''}</textarea>
    <select id="noteex"><option value="">Без привязки к упражнению</option>${EXERCISES.map(e => `<option value="${e.id}" ${editingNote && state.notes.find(n => n.id === editingNote)?.ex === e.id ? 'selected' : ''}>${esc(CATS[e.cat].name + ': ' + e.title)}</option>`).join('')}</select>
    <div class="row"><button class="btn" style="flex:1" ${act('saveNote')}>${editingNote ? 'Сохранить изменения' : 'Добавить заметку'}</button>${editingNote ? `<button class="btn ghost" ${act('editNote', null)}>Отмена</button>` : ''}</div></div>`;
  const sessNotes = state.sessions.filter(s => s.note);
  if (!state.notes.length && !sessNotes.length) return h + `<div class="empty">Заметок пока нет.</div>`;
  h += `<div class="sec">${[...state.notes].reverse().map(n => `<div class="card" style="margin-bottom:10px"><div class="row between"><span class="tiny muted">${fmtDay(n.date.slice(0, 10))}${n.ex ? ' · ' + esc(exById(n.ex)?.title || '') : ''}</span>
    <span class="row" style="gap:4px"><button class="back" style="margin:0" ${act('editNote', n.id)}>Изменить</button><button class="back" style="margin:0;color:var(--bad)" ${act('delNote', `${n.id}`)}>Удалить</button></span></div>
    <div style="white-space:pre-wrap;margin-top:4px">${esc(n.text)}</div></div>`).join('')}</div>`;
  if (sessNotes.length) h += `<div class="sec"><h2>Из занятий</h2>${sessNotes.slice(-10).reverse().map(s => `<div class="card" style="margin-bottom:10px"><div class="tiny muted">${fmtDay(s.date.slice(0, 10))} · ${esc(exById(s.ex)?.title || '')}</div><div style="white-space:pre-wrap;margin-top:4px">${esc(s.note)}</div></div>`).join('')}</div>`;
  return h;
}
export function saveNote() {
  const text = $('#notetext').value.trim(), ex = $('#noteex').value; if (!text) return;
  if (editingNote) { const n = state.notes.find(n => n.id === editingNote); if (n) { n.text = text; n.ex = ex || undefined; } editingNote = null; }
  else state.notes.push({ id: uid(), date: nowLocal(), text, ex: ex || undefined });
  save(); render(); toast('Заметка сохранена');
}
export function delNote(id) { state.notes = state.notes.filter(n => n.id !== id); save(); render(); }







export function editNote(id) { editingNote = id; render(); if (id) window.scrollTo(0, 0); }





// установщики для моста window (переходный период, см. main.js)
export function __set_editingNote(v) { editingNote = v; }

import { act, onChange } from '../core/actions.js';
import { VA } from '../core/analysis.js';
import { ac, click, stopAll } from '../core/audio.js';
import { go, render } from '../core/router.js';
import { normalizeState, replaceState, resetProgress, save, saveText, state } from '../core/store.js';
import { closeSheet, sheet, toast } from '../core/ui.js';
import { $, nowLocal, ymd } from '../core/util.js';
import { registerCard } from '../features/register.js';

// ===== Настройки =====
export function openSettings() {
  sheet(`<div class="row between"><h2>Настройки</h2><button class="iconbtn" ${act('closeSheet')}>×</button></div>
    <p class="small muted" style="margin:0">От этой ноты строятся упражнения, мелодии и уровни игр. Выбирай ноту, на которой удобно петь «а» без напряжения.</p>${registerCard(true)}
    <div class="card stack"><h3>Задержка звука для ритма</h3><p class="small muted" style="margin:0">Нужна, если ты в Bluetooth-наушниках: звук приходит позже. Сейчас: ${state.settings.latency || 0} мс.</p>
    <button class="tap" id="calbtn" style="width:150px" disabled>Тап</button><div id="calmsg" class="small muted" style="text-align:center"></div>
    <button class="btn ghost" ${act('calibrate')}>Настроить: стучи в такт 8 щелчкам</button></div>
    <div class="card stack"><h3>Данные</h3><p class="small muted" style="margin:0" id="savebadge">${saveText()}</p>
    <p class="small muted" style="margin:0">Сохрани прогресс в файл, чтобы не потерять его при удалении приложения или перенести на другое устройство. Сохраняется прогресс того, кто сейчас поёт.</p>
    <button class="btn ghost" ${act('exportData')}>Сохранить прогресс в файл</button>
    <label class="btn ghost" style="text-align:center">Загрузить прогресс из файла<input type="file" accept=".json,application/json" style="display:none" ${onChange('importFile')}></label>
    <button class="btn ghost" ${act('copyData')}>Скопировать мои данные</button>
    <button class="btn ghost" style="color:var(--bad)" ${act('askReset')}>Удалить всё и начать заново</button></div>`);
}
export function calibrate() {
  const c = ac(), b = 60 / 90, t0 = c.currentTime + .3, taps = [], perf0 = performance.now(), ctx0 = c.currentTime;
  stopAll(); for (let i = 0; i < 8; i++) click(t0 + i * b, i % 4 === 0);
  const btn = $('#calbtn'); btn.disabled = false; $('#calmsg').textContent = 'Стучи вместе со щелчками';
  btn.onpointerdown = e => { e.preventDefault(); taps.push(ctx0 + (performance.now() - perf0) / 1000); };
  setTimeout(() => {
    btn.disabled = true; btn.onpointerdown = null;
    const lat0 = c.outputLatency || c.baseLatency || 0;
    const devs = taps.map(t => { let best = 9; for (let i = 0; i < 8; i++) { const d = t - lat0 - (t0 + i * b); if (Math.abs(d) < Math.abs(best)) best = d; } return best; }).filter(d => Math.abs(d) < .35);
    if (devs.length < 5) { $('#calmsg').textContent = 'Мало нажатий, попробуй ещё раз.'; return; }
    const ms = Math.round(VA.median(devs) * 1000); state.settings.latency = ms; save();
    $('#calmsg').textContent = `Готово: задержка ${ms} мс. Учту её в проверке ритма.`;
  }, (t0 + 8 * b - c.currentTime + .6) * 1000);
}
// ===== Экспорт и импорт прогресса (файл .json; при загрузке всё проходит normalizeState) =====
export const exportJSON = () => JSON.stringify({ app: 'vocal', exported: nowLocal(), ...state }, null, 1);
export async function exportData() {
  const name = `vocal-${ymd()}.json`, text = exportJSON();
  try {
    const file = new File([text], name, { type: 'application/json' });
    // На iPhone и в приложении - системное меню «Поделиться»: «Сохранить в Файлы», AirDrop, почта.
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Прогресс Вокала' }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  try {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Файл сохранён: ' + name);
  } catch (e) { copyData(); }
}
export const importSummary = s => `занятий: ${s.sessions.length}, заметок: ${s.notes.length}, замеров диапазона: ${s.range.length}, распевок: ${s.warmups.length}`;
export let pendingImport = null;
export async function importFile(input) {
  const f = input.files && input.files[0]; input.value = ''; if (!f) return;
  if (f.size > 5e6) { toast('Файл слишком большой для прогресса'); return; }
  let data;
  try {
    const raw = JSON.parse(await f.text());
    if (!raw || (raw.app !== 'vocal' && !Array.isArray(raw.sessions))) throw new Error('Это не файл прогресса Вокала');
    data = normalizeState(raw);
  } catch (e) { toast(e instanceof SyntaxError ? 'Файл повреждён или это не прогресс' : e.message); return; }
  pendingImport = data;
  sheet(`<h2>Загрузить прогресс?</h2><p class="muted">В файле: ${importSummary(data)}.</p>
    <p class="muted">Сейчас: ${importSummary(state)}. Текущие данные заменятся данными из файла.</p>
    <div class="row"><button class="btn ghost" style="flex:1" ${act('cancelImport')}>Отмена</button><button class="btn" style="flex:1" ${act('applyImport')}>Загрузить</button></div>`);
}
export function cancelImport() { pendingImport = null; closeSheet(); }
export function applyImport() {
  if (!pendingImport) return;
  replaceState(pendingImport); pendingImport = null; closeSheet(); render(); toast('Прогресс загружен');
}
export async function copyData() { try { await navigator.clipboard.writeText(exportJSON()); toast('Скопировано'); } catch (e) { toast('Не получилось скопировать'); } }
export function askReset() { sheet(`<h2>Удалить всё?</h2><p class="muted">История, заметки и уровни будут стёрты. Это нельзя отменить.</p><div class="row"><button class="btn ghost" style="flex:1" ${act('closeSheet')}>Отмена</button><button class="btn" style="flex:1;background:var(--bad)" ${act('resetAll')}>Удалить</button></div>`); }

export function resetAll() { resetProgress(); closeSheet(); go('today'); render(); }


// установщики для моста window (переходный период, см. main.js)
export function __set_pendingImport(v) { pendingImport = v; }

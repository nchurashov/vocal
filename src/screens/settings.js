import { VA } from '../core/analysis.js';
import { ac, click, stopAll } from '../core/audio.js';
import { save, saveText, state } from '../core/store.js';
import { sheet, toast } from '../core/ui.js';
import { $ } from '../core/util.js';
import { registerCard } from '../features/register.js';

// ===== Настройки =====
export function openSettings() {
  sheet(`<div class="row between"><h2>Настройки</h2><button class="iconbtn" onclick="closeSheet()">×</button></div>
    <p class="small muted" style="margin:0">От этой ноты строятся упражнения, мелодии и уровни игр. Выбирай ноту, на которой удобно петь «а» без напряжения.</p>${registerCard(true)}
    <div class="card stack"><h3>Задержка звука для ритма</h3><p class="small muted" style="margin:0">Нужна, если ты в Bluetooth-наушниках: звук приходит позже. Сейчас: ${state.settings.latency || 0} мс.</p>
    <button class="tap" id="calbtn" style="width:150px" disabled>Тап</button><div id="calmsg" class="small muted" style="text-align:center"></div>
    <button class="btn ghost" onclick="calibrate()">Настроить: стучи в такт 8 щелчкам</button></div>
    <div class="card stack"><h3>Данные</h3><p class="small muted" style="margin:0" id="savebadge">${saveText()}</p>
    <button class="btn ghost" onclick="copyData()">Скопировать мои данные</button>
    <button class="btn ghost" style="color:var(--bad)" onclick="askReset()">Удалить всё и начать заново</button></div>`);
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
export async function copyData() { try { await navigator.clipboard.writeText(JSON.stringify(state, null, 1)); toast('Скопировано'); } catch (e) { toast('Не получилось скопировать'); } }
export function askReset() { sheet(`<h2>Удалить всё?</h2><p class="muted">История, заметки и уровни будут стёрты. Это нельзя отменить.</p><div class="row"><button class="btn ghost" style="flex:1" onclick="closeSheet()">Отмена</button><button class="btn" style="flex:1;background:var(--bad)" onclick="state=Object.assign(DEFAULT(),{settings:state.settings});save();closeSheet();go('today');render()">Удалить</button></div>`); }

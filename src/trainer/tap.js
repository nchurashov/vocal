import { VA } from '../core/analysis.js';
import { ac, playRhythm } from '../core/audio.js';
import { state } from '../core/store.js';
import { $, ICON, setBusy } from '../core/util.js';
import { run, suggestFromAuto } from './exercise.js';

// ===== Ритм: тап =====
export function tapUI(box) {
  const ex = run.ex;
  box.innerHTML = `<button class="tap" id="tapbtn" disabled>Тап</button><div class="row" style="justify-content:center"><button class="btn" id="tapstart">${ICON.play} Начать проверку</button></div><div id="tapmsg" class="small muted" style="text-align:center;margin-top:8px"></div><div id="tapres"></div>`;
  const btn = $('#tapbtn'); let taps = [], live = false, sch = null, perf0 = 0, ctx0 = 0;
  const now = () => ctx0 + (performance.now() - perf0) / 1000;
  const hit = e => { if (!live) return; e.preventDefault(); taps.push(now()); btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 80); };
  btn.addEventListener('pointerdown', hit);
  const key = e => { if (e.code === 'Space' && live) hit(e); };
  document.addEventListener('keydown', key);
  $('#tapstart').addEventListener('click', () => {
    const c = ac(); taps = []; perf0 = performance.now(); ctx0 = c.currentTime;
    sch = playRhythm(ex, false); live = true; btn.disabled = false; setBusy(true);
    $('#tapstart').disabled = true; $('#tapres').innerHTML = '';
    $('#tapmsg').textContent = 'Слушай отсчёт: раз, два, три, четыре...';
    const startAt = sch.t0 + 4 * sch.b;
    setTimeout(() => { if (live && $('#tapmsg')) $('#tapmsg').textContent = 'Стучи!'; }, (startAt - c.currentTime) * 1000);
    setTimeout(() => {
      if (!document.body.contains(box)) { live = false; setBusy(false); return; } // ушли со страницы
      live = false; btn.disabled = true; setBusy(false); $('#tapstart').disabled = false; $('#tapstart').innerHTML = ICON.play + ' Ещё раз';
      $('#tapmsg').textContent = '';
      const lat = (c.outputLatency || c.baseLatency || 0) + (state.settings.latency || 0) / 1000;
      const targets = ex.onsets.map(o => startAt + o * sch.b);
      const ev = VA.evaluateTaps(targets, taps.filter(t => t > startAt - .3), lat);
      $('#tapres').innerHTML = tapResultHTML(ex, ev, sch.b);
      run.auto = { type: 'tap', score: ev.score, meanDev: ev.meanDev, extra: ev.extra };
      suggestFromAuto(ev.score, 'точность ритма');
    }, (sch.end - c.currentTime + .5) * 1000);
  });
}
export function tapResultHTML(ex, ev, b) {
  const ok = ev.res.filter(r => r.status === 'ok').length, n = ev.res.length;
  const beats = Math.ceil(Math.max(...ex.onsets) + 1), bars = Math.ceil(beats / 4) * 4, W = 640, H = 60, bw = (W - 20) / bars;
  let svg = `<svg class="roll" viewBox="0 0 ${W} ${H}">`;
  for (let i = 0; i <= bars; i++) svg += `<line x1="${10 + i * bw}" x2="${10 + i * bw}" y1="6" y2="${H - 6}" stroke="var(--line)" stroke-width="${i % 4 === 0 ? 2 : 1}"/>`;
  ev.res.forEach((r, i) => {
    const x = 10 + ex.onsets[i] * bw + 4;
    svg += `<circle cx="${x}" cy="${H / 2}" r="7" fill="none" stroke="var(--muted)" stroke-width="2"/>`;
    if (r.dev != null) { const col = r.status === 'ok' ? 'var(--ok)' : r.status === 'near' ? 'var(--near)' : 'var(--bad)'; svg += `<circle cx="${x + r.dev / 1000 / b * bw}" cy="${H / 2}" r="5" fill="${col}"/>`; }
    else svg += `<text x="${x}" y="${H / 2 + 5}" text-anchor="middle" font-size="15" font-weight="800" fill="var(--bad)">×</text>`;
  });
  svg += '</svg>';
  const missed = ev.res.filter(r => r.status === 'missed').length;
  let tip = Math.abs(ev.meanDev) > 35 ? `В среднем ты ${ev.meanDev < 0 ? 'спешишь' : 'опаздываешь'} на ${Math.abs(ev.meanDev)} мс.` : 'В среднем попадаешь в долю, без спешки и опозданий.';
  if (missed) tip += ` Пропущено: ${missed}.`;
  if (ev.extra) tip += ` Лишних нажатий: ${ev.extra}.`;
  return `<div class="score" style="margin-top:12px"><div class="s"><b>${ev.score}%</b><span class="small muted">точность ритма</span></div><div class="s"><b>${ok}/${n}</b><span class="small muted">точно в долю</span></div></div>
    ${svg}<div class="tiny muted">Кружок: где нужно было. Точка: твоё нажатие. Зелёный до 70 мс, жёлтый до 140 мс.</div>
    <div class="info" style="margin-top:10px">${tip}</div>
    <p class="tiny muted">Если все нажатия смещены одинаково (например, в Bluetooth-наушниках), настрой задержку звука в настройках ⚙.</p>`;
}

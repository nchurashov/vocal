import { act } from './actions.js';
import { ac, noteFull, noteShort, tone } from './audio.js';
import { $, busy } from './util.js';

// ===== Клавиатура пианино (SVG) и страница «Как устроены ноты» (#learn) =====
export const PC_BLACK = [1, 3, 6, 8, 10];
export const isBlack = m => PC_BLACK.includes(((m % 12) + 12) % 12);
export const OCT_NOM = ['субконтроктава', 'контроктава', 'большая октава', 'малая октава', 'первая октава', 'вторая октава', 'третья октава'];
// from/to - midi; o.band=[lo,hi] подсветка диапазона, o.cur - текущая нота, o.tap - клавиши играют по нажатию, o.id - id для живого обновления
export function pianoSVG(from, to, o = {}) {
  from = from - (((from % 12) + 12) % 12); to = to + 11 - (((to % 12) + 12) % 12); // целые октавы C..B
  const WW = 10, WH = 50, BW = 6.2, BH = 31;
  const whites = []; for (let m = from; m <= to; m++) if (!isBlack(m)) whites.push(m);
  const W = whites.length * WW, x = {}; whites.forEach((m, i) => x[m] = i * WW);
  const inBand = m => o.band && m >= o.band[0] && m <= o.band[1], inBand2 = m => o.band2 && m >= o.band2[0] && m <= o.band2[1];
  const cls = m => `pk ${isBlack(m) ? 'pk-b' : 'pk-w'}${inBand(m) ? ' pk-in' : inBand2(m) ? ' pk-in2' : ''}${o.cur != null && Math.round(o.cur) === m ? ' pk-cur' : ''}`;
  const tapAttr = m => o.tap ? ` ${act(o.onTap || 'pianoTap', m)} style="cursor:pointer"` : '';
  let s = `<svg ${o.id ? `id="${o.id}"` : ''} viewBox="-0.5 -0.5 ${W + 1} ${WH + (o.octaves ? 26 : 14)}" style="width:100%;display:block" role="img" aria-label="Клавиатура пианино">`;
  for (const m of whites) s += `<rect data-m="${m}" class="${cls(m)}" x="${x[m]}" y="0" width="${WW}" height="${WH}" rx="1.2"${tapAttr(m)}><title>${noteFull(m)}</title></rect>`;
  for (let m = from; m <= to; m++) if (isBlack(m)) s += `<rect data-m="${m}" class="${cls(m)}" x="${x[m - 1] + WW - BW / 2}" y="0" width="${BW}" height="${BH}" rx="1"${tapAttr(m)}><title>${noteFull(m)}</title></rect>`;
  for (const m of whites) if (m % 12 === 0) s += `<text x="${x[m] + WW / 2}" y="${WH + 9}" text-anchor="middle" class="pk-lbl">${noteShort(m)}</text>`;
  if (o.octaves) for (let m = from; m <= to; m += 12) { const oc = Math.floor(m / 12) - 1; s += `<text x="${x[m] + 3.5 * WW}" y="${WH + 21}" text-anchor="middle" class="pk-oct">${OCT_NOM[oc] || ''}</text>`; if (m > from) s += `<line x1="${x[m]}" x2="${x[m]}" y1="${WH + 13}" y2="${WH + 24}" class="pk-sep"/>`; }
  return s + '</svg>';
}
// живое обновление текущей ноты без перерисовки
export function pianoMark(id, m) {
  const svg = document.getElementById(id); if (!svg) return;
  const r = m == null ? null : Math.round(m);
  if (svg.dataset.cur == String(r)) return;
  svg.querySelectorAll('.pk-cur').forEach(k => k.classList.remove('pk-cur'));
  if (r != null) svg.querySelector(`[data-m="${r}"]`)?.classList.add('pk-cur');
  svg.dataset.cur = String(r);
}
// chestHi: верх грудного голоса; выше него до hi - фальцет (второй цвет)
export function pianoBand(id, lo, hi, chestHi) {
  const svg = document.getElementById(id); if (!svg) return;
  const ch = chestHi == null ? hi : chestHi;
  svg.querySelectorAll('[data-m]').forEach(k => { const m = +k.dataset.m; k.classList.toggle('pk-in', lo != null && m >= lo && m <= ch); k.classList.toggle('pk-in2', lo != null && m > ch && m <= hi); });
}
export function pianoTap(m) {
  if (busy) return;
  const c = ac(); tone(m, c.currentTime + .02, .9);
  const out = $('#pkname'); if (out) out.innerHTML = `<b>${noteFull(m)}</b><span class="muted"> · ${noteShort(m)}</span>`;
  document.querySelectorAll('#pklearn .pk-cur').forEach(k => k.classList.remove('pk-cur'));
  document.querySelector(`#pklearn [data-m="${m}"]`)?.classList.add('pk-cur');
}

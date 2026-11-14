import { toast } from './ui.js';
import { busy } from './util.js';

// ===== Новая версия сайта =====
// GitHub Pages отдаёт страницу с кэшем на 10 минут, а иконка на экране «Домой» держит старую версию ещё дольше.
// При запуске и при возврате в приложение сверяем отпечаток сборки (meta vpb-build, его пишет build.py) с сервером в обход кэша.
// Новая версия: сразу после запуска - перезагружаем; позже - при следующей смене экрана, и никогда во время пения (busy).
// В приложениях (Capacitor) и в тестах (file://) не проверяем: там версия своя.
const mine = () => (document.querySelector('meta[name="vpb-build"]') || {}).content || '';
const T0 = Date.now();
let fresh = '';
export async function checkUpdate() {
  if (window.Capacitor || !/^https?:$/.test(location.protocol) || !mine() || fresh) return;
  try {
    const r = await fetch(location.pathname + '?nocache=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const m = (await r.text()).match(/name="vpb-build" content="([^"]+)"/);
    if (m && m[1] !== mine()) fresh = m[1];
  } catch (e) { return; }
  if (fresh && Date.now() - T0 < 15000) applyUpdate();
}
export function applyUpdate() {
  if (!fresh || busy) return;
  const v = fresh; fresh = '';
  toast('Есть новая версия, обновляю...');
  // новый адрес (?b=) - браузер точно не возьмёт страницу из кэша; экран (#...) сохраняется
  setTimeout(() => location.replace(location.pathname + '?b=' + encodeURIComponent(v) + location.hash), 500);
}
export function updateWatch() {
  checkUpdate();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
}

import { act, onChange } from '../core/actions.js';
import { MIC_DIRECT, afterMic, openMic } from '../core/audio.js';
import { profName, save, state } from '../core/store.js';
import { sheet, toast } from '../core/ui.js';
import { $, busy, nowLocal } from '../core/util.js';

// ===== Камера: снять себя во время уровня и поделиться видео =====
// Видео 9:16 (720x1280): сверху фронтальная камера (зеркально) на 2/3, снизу игра на 1/3, внизу плашка с адресом сайта.
// Звук - копия дорожки микрофона игры (голос и пианино из динамика). После финиша ещё 2.5 с крупный итог - для реакции.
// Видео живёт только в памяти телефона; наружу уходит, только если человек сам нажмёт «Поделиться» или «Сохранить».
export const CAM = { stream: null, video: null, rec: null, clips: [] };
export const CAM_OK = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder && HTMLCanvasElement.prototype.captureStream) && MIC_DIRECT;
export const camOn = () => CAM_OK && !!state.settings.cam;
// звук для видео: свой отдельный движок, его дорожка начинается с нуля вместе с видео.
// Копия дорожки микрофона на iOS несёт отметки времени от включения телефона - видео получалось длиной в сотни часов.
export function camAudio(micStream) {
  if (!micStream || !micStream.getAudioTracks().length) return { tracks: [], close() { } };
  try {
    const x = new (window.AudioContext || window.webkitAudioContext)(), dest = x.createMediaStreamDestination();
    x.createMediaStreamSource(micStream).connect(dest);
    if (x.state !== 'running') { const r = x.resume(); if (r && r.catch) r.catch(() => { }); }
    return { tracks: dest.stream.getAudioTracks(), close() { try { x.close(); } catch (e) { } } };
  } catch (e) { return { tracks: [], close() { } }; }
}
export function camMime() {
  for (const m of ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}
// переключатель на экранах уровней
export function camToggleHTML() {
  if (!CAM_OK) return '';
  return `<label class="check sec" style="margin-top:10px;padding:10px 12px"><input type="checkbox" ${camOn() ? 'checked' : ''} ${onChange('camSet')}><span class="small"><b>🎥 Снимать себя на видео.</b> Камера пишет тебя, пока поёшь, а снизу - игру или упражнение. Потом можно посмотреть и отправить друзьям. Видео остаётся только у тебя в телефоне.</span></label>
    <div id="camerr" class="small" style="color:var(--bad)"></div>`;
}
export async function camSet(on) { state.settings.cam = !!on; save(); if (on) await camStart(); else camOff(); }
export async function camStart(force) {
  if ((!camOn() && !force) || CAM.stream) return !!CAM.stream;
  try {
    CAM.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } }, audio: false });
  } catch (e) {
    const el = $('#camerr'); if (el) el.textContent = 'Нет доступа к камере. В Safari: «аА» слева от адреса → «Настройки веб-сайта» → «Камера» → «Разрешить».';
    return false;
  }
  // живое превью в углу: видно себя и браузер не «усыпляет» поток
  let v = $('#campv');
  if (!v) { v = document.createElement('video'); v.id = 'campv'; v.className = 'campv'; v.muted = true; v.setAttribute('playsinline', ''); v.setAttribute('autoplay', ''); document.body.appendChild(v); }
  v.srcObject = CAM.stream; try { await v.play(); } catch (e) { }
  CAM.video = v;
  return true;
}
// камеру выключаем при уходе с экрана (render) и по переключателю; идущая запись сначала дописывается
export function camOff() {
  if (CAM.rec && CAM.rec.state !== 'finished') camRecStop(null, true);
  if (CAM.stream) CAM.stream.getTracks().forEach(t => t.stop());
  CAM.stream = null; $('#campv')?.remove(); CAM.video = null;
  if (CAM.mic) { CAM.mic.getTracks().forEach(t => t.stop()); CAM.mic = null; afterMic(); }
}
export const camRecording = () => !!(CAM.rec && CAM.rec.state === 'rec');
// запись: canvasSel - селектор холста игры ИЛИ функция-карточка () => ({ top, big, sub }) для упражнений;
// title - подпись сверху, micStream - поток микрофона
export function camRecStart(canvasSel, title, micStream) {
  if (!camOn() || !CAM.stream || !CAM.video || (CAM.rec && CAM.rec.state === 'rec')) return;
  const W = 720, H = 1280, out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d'), vs = out.captureStream(30);
  const tracks = [...vs.getVideoTracks()];
  const au = camAudio(micStream); tracks.push(...au.tracks);
  const ms = new MediaStream(tracks), mime = camMime(), chunks = [];
  let mr; try { mr = new MediaRecorder(ms, mime ? { mimeType: mime, videoBitsPerSecond: 1600000 } : undefined); } catch (e) { return; }
  const R = CAM.rec = { state: 'rec', mr, out, g, tracks, title, canvasSel, outro: null, t0: performance.now(), mime: mr.mimeType || mime || 'video/webm' };
  mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  mr.onstop = () => {
    R.state = 'finished'; cancelAnimationFrame(R.raf); tracks.forEach(t => t.stop()); au.close();
    if (CAM.mic && !busy) { CAM.mic.getTracks().forEach(t => t.stop()); CAM.mic = null; afterMic(); }
    if (!chunks.length || R.discard) return;
    const blob = new Blob(chunks, { type: R.mime.split(';')[0] });
    const clip = { blob, url: URL.createObjectURL(blob), title: R.title, outro: R.outro, date: nowLocal(), ext: R.mime.includes('mp4') ? 'mp4' : 'webm' };
    CAM.clips.push(clip); if (CAM.clips.length > 5) URL.revokeObjectURL(CAM.clips.shift().url);
    camShow(clip);
  };
  const draw = () => {
    if (R.state === 'finished') return;
    R.raf = requestAnimationFrame(draw);
    // камера сверху на 2/3, игра снизу на 1/3 (над плашкой бренда)
    const area = H - 96, camH = Math.round(area * .67);
    camFrame(g, W, H, R.title, R.outro, camH);
    if (typeof R.canvasSel === 'function') { let pc = null; try { pc = R.canvasSel(); } catch (e) { } camPanel(g, W, camH + 10, area - camH - 20, pc || {}); g.textAlign = 'left'; return; }
    const cv = R.canvasSel && document.querySelector(R.canvasSel);
    if (cv && cv.width) {
      const gy = camH + 10, gh = area - gy - 10, s = Math.min((W - 20) / cv.width, gh / cv.height), dw = cv.width * s, dh = cv.height * s, x = (W - dw) / 2, y = gy + (gh - dh) / 2;
      g.save(); camRound(g, x, y, dw, dh, 14); g.clip(); g.drawImage(cv, x, y, dw, dh); g.restore();
    }
    g.textAlign = 'left';
  };
  draw();
  mr.start(); // одним куском: так Safari правильно пишет длительность mp4
}
// стоп: outro - крупный итог на 2.5 с перед концом видео
export function camRecStop(outro, now) {
  const R = CAM.rec; if (!R || R.state !== 'rec') return;
  R.state = 'stopping'; R.outro = outro || null;
  if (outro && !now) camPending();
  const end = () => { try { R.mr.stop(); } catch (e) { R.state = 'finished'; } };
  if (now || !outro) end(); else setTimeout(end, 2500);
}
// карточка упражнения в нижней трети видео: подпись шага, крупный текст (нота, слог, скороговорка), строка под ним
export function camPanel(g, W, y, h, p) {
  g.fillStyle = '#FAF6F0'; camRound(g, 16, y, W - 32, h, 22); g.fill();
  g.textAlign = 'center'; g.fillStyle = '#7A6E66'; g.font = '700 26px Manrope, system-ui, sans-serif';
  if (p.top) g.fillText(String(p.top).slice(0, 40), W / 2, y + 46);
  const big = String(p.big || '').trim();
  if (big) {
    let fs = big.length > 60 ? 34 : big.length > 28 ? 42 : big.length > 12 ? 58 : 84, n;
    for (; fs >= 26; fs -= 4) { g.font = `800 ${fs}px Lora, Georgia, serif`; n = camWrap(g, big, W / 2, 0, W - 80, fs * 1.18, false); if (n * fs * 1.18 <= h - 120) break; }
    g.fillStyle = '#2B231E'; const lh = fs * 1.18, top = y + 70 + (h - 120 - n * lh) / 2 + fs * .9;
    camWrap(g, big, W / 2, top, W - 80, lh);
  }
  if (p.sub) { g.fillStyle = '#C8573A'; g.font = '700 26px Manrope, system-ui, sans-serif'; g.fillText(String(p.sub).slice(0, 48), W / 2, y + h - 24); }
}
// микрофон для записи в упражнениях (там, где своего нет): открывается один раз на сессию, закрывается в camOff
export async function camMic() {
  if (CAM.mic && CAM.mic.getAudioTracks().some(t => t.readyState === 'live')) return CAM.mic;
  try { CAM.mic = await openMic(); } catch (e) { CAM.mic = null; }
  return CAM.mic;
}
// начать запись сессии упражнения, если включена камера: panel - функция карточки
export async function camSession(title, panel, mic) {
  if (!camOn() || camRecording()) return false;
  if (!CAM.stream && !(await camStart())) return false;
  const m = mic || await camMic(); if (!m) return false;
  camRecStart(panel, (profName() ? profName() + ' · ' : '') + title, m);
  return camRecording();
}
export function camRound(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
// общий кадр: камера на весь экран (зеркально), подпись сверху, плашка бренда снизу, крупный итог (outro)
// camH - высота области камеры (по умолчанию весь кадр над плашкой)
export function camFrame(g, W, H, title, outro, camH = H - 96) {
  g.fillStyle = '#1B1714'; g.fillRect(0, 0, W, H);
  const v = CAM.video;
  if (v && v.videoWidth) {
    const s = Math.max(W / v.videoWidth, camH / v.videoHeight), dw = v.videoWidth * s, dh = v.videoHeight * s;
    g.save(); g.beginPath(); g.rect(0, 0, W, camH); g.clip(); g.translate(W, 0); g.scale(-1, 1); g.drawImage(v, (W - dw) / 2, (camH - dh) / 2, dw, dh); g.restore();
  }
  g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 0, W, 70);
  g.fillStyle = '#fff'; g.font = '700 30px Manrope, system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(title, 24, 46);
  g.fillStyle = '#C8573A'; g.fillRect(0, H - 96, W, 96);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '800 36px Lora, Georgia, serif'; g.fillText('Вокал под бокал 🍷', W / 2, H - 52);
  g.font = '600 22px Manrope, system-ui, sans-serif'; g.fillText('nchurashov.github.io/vocal', W / 2, H - 18);
  if (outro) {
    const oy = Math.round(camH / 2 - 85);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, oy, W, 170);
    g.fillStyle = '#FFD27A'; g.font = '800 64px Lora, Georgia, serif'; g.fillText(outro, W / 2, oy + 108);
  }
  g.textAlign = 'left';
}
// перенос текста по словам на холсте; возвращает число строк
export function camWrap(g, text, x, y, maxW, lh, draw = true) {
  const words = text.split(' '); let line = '', n = 0;
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { if (draw) g.fillText(line, x, y + n * lh); n++; line = w; } else line = t; }
  if (line) { if (draw) g.fillText(line, x, y + n * lh); n++; }
  return n;
}
// окно видео открывается сразу после финиша, пока файл дописывается (итог 2.5 с + сборка файла)
export function camPending() {
  sheet(`<div class="row between"><h2>Твоё видео</h2><button class="iconbtn" ${act('closeSheet')}>×</button></div>
    <div id="campend" style="aspect-ratio:9/16;max-height:60vh;margin:0 auto;border-radius:14px;background:#1B1714;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:20px">
      <div class="spin"></div><b>Видео дописывается...</b><span class="small" style="opacity:.75">Ещё пара секунд: в конце видео твой итог.</span></div>`);
}
// iPhone-приложение: сохранить сразу в Фото (плагин @capacitor-community/media)
export const camNative = () => !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Media);
export async function camSaveNative(clip) {
  if (!camNative()) return false;
  try {
    const data = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(clip.blob); });
    await window.Capacitor.Plugins.Media.saveVideo({ path: data });
    clip.saved = true; const el = $('#camsaved'); if (el) el.innerHTML = '✓ Сохранено в Фото';
    return true;
  } catch (e) { const el = $('#camsaved'); if (el) el.textContent = 'Не получилось сохранить в Фото. Разреши доступ: Настройки iPhone → Вокал под бокал → Фото.'; return false; }
}
export function camShow(clip) {
  const i = CAM.clips.indexOf(clip), nat = camNative();
  sheet(`<div class="row between"><h2>Твоё видео</h2><button class="iconbtn" ${act('closeSheet')}>×</button></div>
    <video src="${clip.url}" controls playsinline preload="metadata" style="width:100%;max-height:60vh;border-radius:14px;background:#000"></video>
    ${nat ? `<div id="camsaved" class="small" style="text-align:center;color:var(--ok)">${clip.saved ? '✓ Сохранено в Фото' : 'Сохраняю в Фото...'}</div>
      <div class="row"><button class="btn" style="flex:1" ${act('camShare', i)}>Отправить</button></div>`
    : `<div class="row"><button class="btn" style="flex:1" ${act('camShare', i)}>📥 В Фото</button><button class="btn ghost" style="flex:1" ${act('camShare', i)}>Отправить</button></div>
      <div class="tiny muted">На iPhone откроется меню: выбери «Сохранить видео», и оно окажется в Фото. Сразу без меню сохраняет только приложение «Вокал под бокал».</div>`}
    <div class="tiny muted">Видео есть только у тебя в телефоне. Если не сохранить, после закрытия страницы оно пропадёт.</div>`);
  if (nat && !clip.saved && clip.autoSave !== false) camSaveNative(clip);
}
export async function camShare(i) {
  const c = CAM.clips[i]; if (!c) return;
  const file = c.file || (c.file = new File([c.blob], `vocal-pod-bokal.${c.ext}`, { type: c.blob.type }));
  const text = 'Вокал под бокал: попробуй попасть в ноты голосом https://nchurashov.github.io/vocal/';
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Вокал под бокал', text }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = c.url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  toast('Видео сохраняется в загрузки');
}

// общий рекордер холста: draw(g, W, H) на каждом кадре, audioTracks - дорожки звука. stop() -> Promise<{blob, ext}>
// audio: массив дорожек или поток микрофона (MediaStream) - тогда звук идёт через camAudio
export function recCanvas(draw, audio = [], W = 720, H = 1280) {
  const au = audio instanceof MediaStream ? camAudio(audio) : { tracks: audio, close() { } }, audioTracks = au.tracks;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d'), vs = out.captureStream(30), tracks = [...vs.getVideoTracks(), ...audioTracks];
  const mime = camMime(), chunks = [];
  const mr = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime, videoBitsPerSecond: 1600000 } : undefined);
  const real = mr.mimeType || mime || 'video/webm';
  let raf = 0, alive = true;
  const loop = () => { if (!alive) return; raf = requestAnimationFrame(loop); draw(g, W, H); };
  mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise(res => { mr.onstop = () => { alive = false; cancelAnimationFrame(raf); tracks.forEach(t => t.stop()); au.close(); res({ blob: new Blob(chunks, { type: real.split(';')[0] }), ext: real.includes('mp4') ? 'mp4' : 'webm' }); }; });
  loop(); mr.start();
  return { stop: () => { try { mr.stop(); } catch (e) { } return done; }, done };
}

// ===== Камера: снять себя во время уровня и поделиться видео =====
// Видео 9:16 (720x1280): сверху фронтальная камера (зеркально) на 2/3, снизу игра на 1/3, внизу плашка с адресом сайта.
// Звук - копия дорожки микрофона игры (голос и пианино из динамика). После финиша ещё 2.5 с крупный итог - для реакции.
// Видео живёт только в памяти телефона; наружу уходит, только если человек сам нажмёт «Поделиться» или «Сохранить».
const CAM = { stream: null, video: null, rec: null, clips: [] };
const CAM_OK = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder && HTMLCanvasElement.prototype.captureStream) && MIC_DIRECT;
const camOn = () => CAM_OK && !!state.settings.cam;
function camMime() {
  for (const m of ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}
// переключатель на экранах уровней
function camToggleHTML() {
  if (!CAM_OK) return '';
  return `<label class="check sec" style="margin-top:10px;padding:10px 12px"><input type="checkbox" ${camOn() ? 'checked' : ''} onchange="camSet(this.checked)"><span class="small"><b>🎥 Снимать себя на видео.</b> Камера пишет тебя, пока играешь, и снизу саму игру. Потом можно посмотреть и отправить друзьям. Видео остаётся только у тебя в телефоне.</span></label>
    <div id="camerr" class="small" style="color:var(--bad)"></div>`;
}
async function camSet(on) { state.settings.cam = !!on; save(); if (on) await camStart(); else camOff(); }
async function camStart(force) {
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
function camOff() {
  if (CAM.rec && CAM.rec.state !== 'finished') camRecStop(null, true);
  if (CAM.stream) CAM.stream.getTracks().forEach(t => t.stop());
  CAM.stream = null; $('#campv')?.remove(); CAM.video = null;
}
// запись: canvasSel - холст игры, title - подпись сверху, micStream - поток микрофона игры
function camRecStart(canvasSel, title, micStream) {
  if (!camOn() || !CAM.stream || !CAM.video || (CAM.rec && CAM.rec.state === 'rec')) return;
  const W = 720, H = 1280, out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d'), vs = out.captureStream(30);
  const tracks = [...vs.getVideoTracks()];
  if (micStream) micStream.getAudioTracks().forEach(t => { try { tracks.push(t.clone()); } catch (e) { } });
  const ms = new MediaStream(tracks), mime = camMime(), chunks = [];
  let mr; try { mr = new MediaRecorder(ms, mime ? { mimeType: mime, videoBitsPerSecond: 2500000 } : undefined); } catch (e) { return; }
  const R = CAM.rec = { state: 'rec', mr, out, g, tracks, title, canvasSel, outro: null, t0: performance.now(), mime: mr.mimeType || mime || 'video/webm' };
  mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  mr.onstop = () => {
    R.state = 'finished'; cancelAnimationFrame(R.raf); tracks.forEach(t => t.stop());
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
    const cv = R.canvasSel && document.querySelector(R.canvasSel);
    if (cv && cv.width) {
      const gy = camH + 10, gh = area - gy - 10, s = Math.min((W - 20) / cv.width, gh / cv.height), dw = cv.width * s, dh = cv.height * s, x = (W - dw) / 2, y = gy + (gh - dh) / 2;
      g.save(); camRound(g, x, y, dw, dh, 14); g.clip(); g.drawImage(cv, x, y, dw, dh); g.restore();
    }
    g.textAlign = 'left';
  };
  draw();
  mr.start(500);
}
// стоп: outro - крупный итог на 2.5 с перед концом видео
function camRecStop(outro, now) {
  const R = CAM.rec; if (!R || R.state !== 'rec') return;
  R.state = 'stopping'; R.outro = outro || null;
  const end = () => { try { R.mr.stop(); } catch (e) { R.state = 'finished'; } };
  if (now || !outro) end(); else setTimeout(end, 2500);
}
function camRound(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
// общий кадр: камера на весь экран (зеркально), подпись сверху, плашка бренда снизу, крупный итог (outro)
// camH - высота области камеры (по умолчанию весь кадр над плашкой)
function camFrame(g, W, H, title, outro, camH = H - 96) {
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
function camWrap(g, text, x, y, maxW, lh, draw = true) {
  const words = text.split(' '); let line = '', n = 0;
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { if (draw) g.fillText(line, x, y + n * lh); n++; line = w; } else line = t; }
  if (line) { if (draw) g.fillText(line, x, y + n * lh); n++; }
  return n;
}
function camShow(clip) {
  sheet(`<div class="row between"><h2>Твоё видео</h2><button class="iconbtn" onclick="closeSheet()">×</button></div>
    <video src="${clip.url}" controls playsinline style="width:100%;max-height:60vh;border-radius:14px;background:#000"></video>
    <div class="row"><button class="btn" style="flex:1" onclick="camShare(${CAM.clips.indexOf(clip)})">Поделиться</button><a class="btn ghost" style="flex:1" href="${clip.url}" download="vocal-${clip.date.replace(/[:T]/g, '-')}.${clip.ext}">Сохранить</a></div>
    <div class="tiny muted">Видео есть только у тебя в телефоне. Сохрани или отправь его, пока не закрыл страницу: после закрытия оно пропадёт. В видео попадает звук с микрофона.</div>`);
}
async function camShare(i) {
  const c = CAM.clips[i]; if (!c) return;
  const file = new File([c.blob], `vocal.${c.ext}`, { type: c.blob.type });
  const text = 'Вокал под бокал: попробуй попасть в ноты голосом https://nchurashov.github.io/vocal/';
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Вокал под бокал', text }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = c.url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  toast('Видео сохраняется в загрузки');
}

// общий рекордер холста: draw(g, W, H) на каждом кадре, audioTracks - дорожки звука. stop() -> Promise<{blob, ext}>
function recCanvas(draw, audioTracks = [], W = 720, H = 1280) {
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d'), vs = out.captureStream(30), tracks = [...vs.getVideoTracks(), ...audioTracks];
  const mime = camMime(), chunks = [];
  const mr = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime, videoBitsPerSecond: 2500000 } : undefined);
  const real = mr.mimeType || mime || 'video/webm';
  let raf = 0, alive = true;
  const loop = () => { if (!alive) return; raf = requestAnimationFrame(loop); draw(g, W, H); };
  mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise(res => { mr.onstop = () => { alive = false; cancelAnimationFrame(raf); tracks.forEach(t => t.stop()); res({ blob: new Blob(chunks, { type: real.split(';')[0] }), ext: real.includes('mp4') ? 'mp4' : 'webm' }); }; });
  loop(); mr.start(500);
  return { stop: () => { try { mr.stop(); } catch (e) { } return done; }, done };
}

// ===== Камера: снять себя во время уровня и поделиться видео =====
// Видео 9:16 (720x1280): сверху фронтальная камера (зеркально), снизу холст игры, внизу подпись с адресом сайта.
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
async function camStart() {
  if (!camOn() || CAM.stream) return !!CAM.stream;
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
    g.fillStyle = '#1B1714'; g.fillRect(0, 0, W, H);
    // камера: верх 720x760, обрезка по центру, зеркально
    const v = CAM.video, camH = 760;
    if (v && v.videoWidth) {
      const s = Math.max(W / v.videoWidth, camH / v.videoHeight), dw = v.videoWidth * s, dh = v.videoHeight * s;
      g.save(); g.beginPath(); g.rect(0, 0, W, camH); g.clip(); g.translate(W, 0); g.scale(-1, 1); g.drawImage(v, (W - dw) / 2, (camH - dh) / 2, dw, dh); g.restore();
    }
    // игра: низ, вписать по ширине
    const cv = document.querySelector(R.canvasSel), gy = camH + 12, gh = H - gy - 92;
    if (cv && cv.width) { const s = Math.min((W - 24) / cv.width, gh / cv.height), dw = cv.width * s, dh = cv.height * s; g.drawImage(cv, (W - dw) / 2, gy + (gh - dh) / 2, dw, dh); }
    // подписи
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, W, 64);
    g.fillStyle = '#fff'; g.font = '700 30px Manrope, system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(R.title, 24, 43);
    g.fillStyle = '#C8573A'; g.fillRect(0, H - 80, W, 80);
    g.fillStyle = '#fff'; g.font = '800 30px Manrope, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('Вокал · попади в ноту голосом', W / 2, H - 44);
    g.font = '600 22px Manrope, system-ui, sans-serif'; g.fillText('nchurashov.github.io/vocal', W / 2, H - 14);
    if (R.outro) {
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, camH - 190, W, 170);
      g.fillStyle = '#FFD27A'; g.font = '800 64px Lora, Georgia, serif'; g.fillText(R.outro, W / 2, camH - 90);
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
function camShow(clip) {
  sheet(`<div class="row between"><h2>Твоё видео</h2><button class="iconbtn" onclick="closeSheet()">×</button></div>
    <video src="${clip.url}" controls playsinline style="width:100%;max-height:60vh;border-radius:14px;background:#000"></video>
    <div class="row"><button class="btn" style="flex:1" onclick="camShare(${CAM.clips.indexOf(clip)})">Поделиться</button><a class="btn ghost" style="flex:1" href="${clip.url}" download="vocal-${clip.date.replace(/[:T]/g, '-')}.${clip.ext}">Сохранить</a></div>
    <div class="tiny muted">Видео есть только у тебя в телефоне. Сохрани или отправь его, пока не закрыл страницу: после закрытия оно пропадёт. В видео попадает звук с микрофона.</div>`);
}
async function camShare(i) {
  const c = CAM.clips[i]; if (!c) return;
  const file = new File([c.blob], `vocal.${c.ext}`, { type: c.blob.type });
  const text = 'Попробуй попасть в ноты голосом: https://nchurashov.github.io/vocal/';
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Вокал', text }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = c.url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  toast('Видео сохраняется в загрузки');
}

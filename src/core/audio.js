import { VA } from './analysis.js';
import { state } from './store.js';
import { busy } from './util.js';

// ===== Звук =====
export let AC = null;
export let master = null;
export let wave = null;
export let playing = [];
// iPhone: в беззвучном режиме Safari глушит Web Audio. Переводим звук в режим «проигрывание», как у музыки
export let iosUnlocked = false;
export function unlockIOS() {
  if (iosUnlocked || window.Capacitor || micOn) return; iosUnlocked = true;
  if (!AC) setSession('playback');
  try {
    // для старых iOS: короткий тихий звук через обычный <audio> переключает режим звука
    const a = new Audio('data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    a.setAttribute('playsinline', ''); a.volume = 0.01; const pr = a.play(); if (pr && pr.catch) pr.catch(() => { });
  } catch (e) { }
}
document.addEventListener('pointerdown', unlockIOS, { capture: true });
document.addEventListener('touchend', unlockIOS, { capture: true });
export function ac() {
  unlockIOS();
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createDynamicsCompressor(); master.connect(AC.destination);
    const real = new Float32Array([0, 1, .45, .25, .12, .08, .04]), imag = new Float32Array(real.length);
    wave = AC.createPeriodicWave(real, imag);
  }
  if (AC.state !== 'running') {
    const r = AC.resume(); if (r && r.catch) r.catch(() => { });
    // если движок так и не проснулся, к следующему нажатию создаём новый
    clearTimeout(resumeWatch); const dead = AC;
    resumeWatch = setTimeout(() => { if (AC === dead && AC.state !== 'running' && !busy && !micOn) resetAudio(); }, 700);
  }
  return AC;
}
// iOS 26: у сайтов на экране «Домой» звук после сворачивания часто «зависает».
// Закрываем звуковой движок, когда приложение уходит в фон, и создаём новый при следующем нажатии
export function setSession(t) { try { if (!window.Capacitor && navigator.audioSession) navigator.audioSession.type = t; } catch (e) { } }
// после микрофона: закрываем движок и только потом возвращаем режим «проигрывание» (менять его на ходу в Safari глушит звук)
export function afterMic() { micOn = false; resetAudio(); setSession('playback'); }
// перед микрофоном: закрываем движок, ставим режим «запись и проигрывание» и только потом создаём новый движок.
// Раньше движок в режиме «проигрывание» жил во время записи: iOS его глушил, а сторож через 0.7 с закрывал его прямо под игрой
export let micOn = false;
export async function openMic() {
  stopAll(); resetAudio(); micOn = true; setSession('play-and-record');
  const c = ac();
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    // наушники (AirPods) переключают микрофон на другую частоту: движок с прежней частотой получает от Safari тишину
    let sr = 0; try { sr = s.getAudioTracks()[0].getSettings().sampleRate || 0; } catch (e) { }
    if (sr && AC && Math.abs(AC.sampleRate - sr) > 1) { resetAudio(); ac(); }
    const c2 = AC || c; if (c2.state !== 'running') { const r = c2.resume(); if (r && r.catch) r.catch(() => { }); }
    return s;
  } catch (e) { afterMic(); throw e; }
}
// микрофон для замеров без пианино (диапазон, длинный звук): уровень громкости и сторож тишины.
// Если 1.5 с подряд ровный ноль - один раз пересоздаём движок; если и после этого ноль - dead (показываем подсказку).
export function micTap(stream, fft = 4096) {
  const T = { zero: 0, rebuilt: false, dead: false, level: 0 };
  T.build = () => { T.c = ac(); T.an = T.c.createAnalyser(); T.an.fftSize = fft; T.c.createMediaStreamSource(stream).connect(T.an); T.buf = new Float32Array(fft); };
  T.build();
  T.read = () => {
    T.an.getFloatTimeDomainData(T.buf);
    let mx = 0, e = 0; for (let i = 0; i < T.buf.length; i++) { const v = T.buf[i]; e += v * v; if (v > mx) mx = v; else if (-v > mx) mx = -v; }
    T.level = Math.sqrt(e / T.buf.length);
    if (mx === 0) { if (++T.zero > 90) { if (!T.rebuilt) { T.rebuilt = true; T.zero = 0; resetAudio(); T.build(); const r = T.c.resume(); if (r && r.catch) r.catch(() => { }); } else T.dead = true; } }
    else { T.zero = 0; T.dead = false; }
    return T.buf;
  };
  return T;
}
export const MIC_DEAD = 'Микрофон включён, но звук не приходит. Если подключены AirPods или другие наушники, отключи их или выбери микрофон телефона. Потом нажми «Готово» и начни заново.';
export function levelBar(id) { return `<div style="height:6px;background:var(--line);border-radius:3px;overflow:hidden" title="Громкость микрофона"><i id="${id}" style="display:block;height:100%;width:0;background:var(--ok);transition:width .08s"></i></div>`; }
export function setLevel(id, lv) { const el = document.getElementById(id); if (el) el.style.width = Math.min(100, Math.round(Math.sqrt(lv) * 260)) + '%'; }
export function resetAudio() { try { if (AC) AC.close(); } catch (e) { } AC = null; master = null; wave = null; noiseBuf = null; iosUnlocked = false; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && !busy && !micOn) resetAudio(); });
window.addEventListener('pageshow', e => { if (e.persisted) resetAudio(); });
export let resumeWatch = 0;
export function stopAll() { playing.forEach(n => { try { n.stop(); } catch (e) { } }); playing = []; }
export function tone(midi, t, dur, vol = .22) {
  const c = ac(), o = c.createOscillator(), g = c.createGain();
  o.setPeriodicWave(wave); o.frequency.value = VA.midiToHz(midi);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .015);
  g.gain.exponentialRampToValueAtTime(vol * .55, t + .25);
  g.gain.setValueAtTime(vol * .55, Math.max(t + .26, t + dur - .08));
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + .02); playing.push(o);
}
export function click(t, accent) {
  const c = ac(), o = c.createOscillator(), g = c.createGain();
  o.type = 'square'; o.frequency.value = accent ? 1600 : 1050;
  g.gain.setValueAtTime(accent ? .18 : .11, t); g.gain.exponentialRampToValueAtTime(.0001, t + .04);
  o.connect(g).connect(master); o.start(t); o.stop(t + .05); playing.push(o);
}
export let noiseBuf = null;
export function clap(t) {
  const c = ac();
  if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate * .2, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 1.2;
  g.gain.setValueAtTime(.55, t); g.gain.exponentialRampToValueAtTime(.001, t + .13);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + .15); playing.push(s);
}
export const base = () => state.settings.base;
export const strictOct = () => !!state.settings.strict;
// полное имя ноты: «Ля большой октавы (A2)»
export const OCT_RU = ['субконтроктавы', 'контроктавы', 'большой октавы', 'малой октавы', 'первой октавы', 'второй октавы', 'третьей октавы'];
export const LAT = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function noteFull(m) { m = Math.round(m); const o = Math.floor(m / 12) - 1; return `${VA.noteName(m)} ${OCT_RU[o] || ''} (${LAT[m % 12]}${o})`; }
export const noteShort = m => { m = Math.round(m); return LAT[m % 12] + (Math.floor(m / 12) - 1); };
export function playNotes(notes, bpm, offset = 0) {
  stopAll(); const c = ac(), b = 60 / bpm; let t = c.currentTime + .08;
  for (const [s, beats] of notes) { tone(base() + s + offset, t, beats * b * .95); t += beats * b; }
  return t - c.currentTime;
}
export function playRhythm(ex, withClaps = true) {
  stopAll(); const c = ac(), b = 60 / ex.bpm, t0 = c.currentTime + .1;
  const beats = Math.ceil(Math.max(...ex.onsets) + 1);
  const bars = Math.ceil(beats / 4) * 4;
  for (let i = 0; i < 4 + bars; i++) click(t0 + i * b, i % 4 === 0);
  if (withClaps) ex.onsets.forEach(o => clap(t0 + (4 + o) * b));
  return { t0, b, end: t0 + (4 + bars) * b };
}

// Октава голоса: определяется по первым нотам и дальше не меняется,
// чтобы мужской и женский голос подходили, но нижнее и верхнее До различались
// collect=false: кадр не идёт в определение октавы (например, до первой ноты микрофон слышит подсказку пианино из динамика)
// Внутри Claude страница открыта в защищённой рамке без микрофона: тогда пишем через камеру/диктофон телефона
export const MIC_DIRECT = (() => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return false;
  try { if (window.self !== window.top) return false; } catch (e) { return false; }
  const fp = document.permissionsPolicy || document.featurePolicy;
  return fp && fp.allowsFeature ? fp.allowsFeature('microphone') : true;
})();











// установщики для моста window (переходный период, см. main.js)
export function __set_AC(v) { AC = v; }
export function __set_master(v) { master = v; }
export function __set_wave(v) { wave = v; }
export function __set_playing(v) { playing = v; }
export function __set_iosUnlocked(v) { iosUnlocked = v; }
export function __set_micOn(v) { micOn = v; }
export function __set_resumeWatch(v) { resumeWatch = v; }
export function __set_noiseBuf(v) { noiseBuf = v; }

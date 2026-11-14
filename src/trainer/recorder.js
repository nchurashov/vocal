import { VA } from '../core/analysis.js';
import { MIC_DIRECT, ac, afterMic, base, master, openMic, playing, stopAll, strictOct } from '../core/audio.js';
import { profName } from '../core/store.js';
import { $, ICON, esc, plural, setBusy, uid } from '../core/util.js';
import { camOn, camRecStart, camRecStop, camRecording, camStart, camToggleHTML } from '../features/cam.js';
import { rollSVG } from './exercise.js';

// ===== Запись и проверка голоса =====
export let rec = null;
export function stopRecordingIfAny() { if (rec && rec.mr && rec.mr.state === 'recording') { rec.cancel = true; rec.mr.stop(); } setBusy(false); }
export function recorderUI(box, getRef, opts) {
  // getRef(): {notes,bpm}; opts: {anyKeyToggle, onResult}
  const id = 'r' + uid();
  if (MIC_DIRECT && camOn()) camStart();
  box.innerHTML = `${MIC_DIRECT && typeof camToggleHTML === 'function' ? camToggleHTML() : ''}${opts.anyKeyToggle ? `<label class="check" style="border:0;padding:0 0 12px"><input type="checkbox" id="${id}-any"><span class="small">Я пел в своей тональности, а не от ноты примера (проверятся только расстояния между нотами)</span></label>` : ''}
    ${MIC_DIRECT ? `<div class="row wrap"><button class="btn" id="${id}-mic">${ICON.mic} Записать с микрофона</button>
    <label class="btn ghost">${ICON.file} Загрузить запись<input type="file" accept="audio/*,video/*" class="hidden recfile"></label></div>` :
    `<div class="row wrap"><label class="btn">${ICON.mic} Записать голос<input type="file" accept="video/*,audio/*" capture="user" class="hidden recfile"></label>
    <label class="btn ghost">${ICON.file} Загрузить запись<input type="file" accept="audio/*,video/*" class="hidden recfile"></label></div>
    <div class="tiny muted" style="margin-top:8px">«Записать голос» откроет камеру телефона: сними видео, пока поёшь (можно закрыть объектив пальцем), и нажми «Использовать видео». Из видео я возьму только звук. На компьютере выбери готовую аудиозапись.</div>`}
    <div id="${id}-msg" class="small" style="margin-top:10px"></div><div id="${id}-res"></div>`;
  const msg = $('#' + id + '-msg'), res = $('#' + id + '-res');
  const handleBuffer = async (arrayBuf) => {
    msg.innerHTML = '<span class="muted">Слушаю запись и ищу ноты...</span>';
    let audio;
    try { audio = await new Promise((ok, bad) => { const p = ac().decodeAudioData(arrayBuf, ok, bad); if (p && p.then) p.then(ok, bad); }); }
    catch (e) { if (camRecording()) camRecStop(null, true); msg.innerHTML = '<div class="note">Не получилось прочитать файл. Подойдут записи в форматах m4a, mp3, wav, ogg, webm.</div>'; setBusy(false); return; }
    setTimeout(() => {
      const chs = []; const maxLen = Math.min(audio.length, audio.sampleRate * 45);
      for (let c = 0; c < audio.numberOfChannels; c++) chs.push(audio.getChannelData(c).subarray(0, maxLen));
      const a = VA.analyzeSamples(chs, audio.sampleRate);
      const ref = getRef();
      const anyKey = opts.anyKeyToggle ? $('#' + id + '-any').checked : false;
      msg.innerHTML = '';
      setBusy(false);
      if (!a.segs.length) { if (camRecording()) camRecStop(null, true); res.innerHTML = '<div class="note" style="margin-top:10px">Не слышу в записи голоса с понятной высотой. Пой громче и ближе к телефону, на гласную «а» или «ма».</div>'; return; }
      const ev = VA.evaluate(ref.notes.map(([s, b]) => ({ midi: base() + s, beats: b })), a.segs, anyKey, strictOct());
      ev.anyKey = anyKey;
      if (camRecording()) camRecStop(ev.pitchScore + '% нот');
      lastAudio = audio;
      res.innerHTML = resultHTML(ref, ev, audio);
      opts.onResult(ev);
    }, 30);
  };
  box.querySelectorAll('.recfile').forEach(inp => inp.addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return; setBusy(true);
    handleBuffer(await f.arrayBuffer()); e.target.value = '';
  }));
  $('#' + id + '-mic')?.addEventListener('click', async () => {
    const btn = $('#' + id + '-mic');
    if (rec && rec.mr && rec.mr.state === 'recording') { rec.mr.stop(); return; }
    let stream;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) throw new Error('no');
      stream = await openMic();
    } catch (e) {
      msg.innerHTML = `<div class="note"><b>Нет доступа к микрофону.</b><br>1. Если открыл ссылку из Telegram или другого приложения, нажми «Открыть в Safari» (или скопируй ссылку в Safari).<br>2. В Safari нажми «аА» слева от адреса → «Настройки веб-сайта» → «Микрофон» → «Разрешить», потом обнови страницу.<br>3. Если не помогло: Настройки iPhone → Приложения → Safari → Микрофон → «Спросить» или «Разрешить».</div>`;
      return;
    }
    const chunks = []; const mr = new MediaRecorder(stream); rec = { mr, cancel: false }; setBusy(true);
    if (camOn()) { const ref = getRef(); camRecStart(() => ({ top: ref.title || 'Пою мелодию', big: (ref.notes || []).map(([x]) => VA.noteName(base() + x)).join(' '), sub: 'Запись...' }), (profName() ? profName() + ' · ' : '') + (ref.title || 'Оценка'), stream); }
    mr.ondataavailable = e => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop()); clearInterval(rec.tick); afterMic();
      btn.innerHTML = ICON.mic + ' Записать с микрофона';
      if (rec.cancel) { if (camRecording()) camRecStop(null, true); return; }
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      handleBuffer(await blob.arrayBuffer());
    };
    mr.start(); const t0 = Date.now();
    btn.innerHTML = ICON.stop + ' Остановить';
    msg.innerHTML = '<div class="row"><span class="rec-dot"></span><span id="' + id + '-t">Запись 0 с. Пой!</span></div>';
    rec.tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); const el = $('#' + id + '-t'); if (el) el.textContent = 'Запись ' + s + ' с. Пой!'; if (s >= 40) mr.stop(); }, 250);
  });
}
export function resultHTML(ref, ev, audio) {
  const n = ev.notes.length;
  const lines = ev.notes.map((r, i) => {
    const nm = VA.noteName(base() + ref.notes[i][0]);
    let t;
    if (r.status === 'missed') t = '<span class="mark missed">✗ не спета</span>';
    else {
      const dir = r.dev > 0 ? 'выше' : 'ниже', ad = Math.abs(r.dev);
      const amount = ad >= 85 ? (Math.round(ad / 100) === 1 ? 'на полтона' : 'на ' + Math.round(ad / 100) + ' полутона') : 'на ' + ad + ' центов';
      if (r.status === 'ok') t = `<span class="mark ok">✓ верно</span> <span class="muted tiny">(${r.dev >= 0 ? '+' : ''}${r.dev} ц)</span>`;
      else if (r.status === 'near') t = `<span class="mark near">≈ близко</span>, чуть ${dir} (${ad} ц)`;
      else t = `<span class="mark off">✗ мимо</span>, ${dir} ${amount}`;
    }
    if (r.rhythm) t += `<span class="muted"> · ${r.rhythm === 'long' ? 'затянута' : 'короче нужного'}</span>`;
    return `<li><span class="n">${i + 1}</span><span><b>${nm}</b>: ${t}</span></li>`;
  }).join('');
  const sung = ev.notes.filter(r => r.dev != null);
  const avg = sung.length ? Math.round(sung.reduce((a, r) => a + r.dev, 0) / sung.length) : 0;
  let tip = '';
  if (ev.anyKey) tip = 'Сравнение по расстояниям между нотами, тональность не учитывалась.';
  else if (Math.abs(avg) > 25 && sung.length >= 2) tip = `В среднем ты поёшь ${avg > 0 ? 'выше' : 'ниже'} примера на ${Math.abs(avg)} центов. ${avg < 0 ? 'Попробуй больше «улыбки» в гласной и активнее дыхание.' : 'Расслабь горло и не дави на верх.'}`;
  if (ev.offset && !ev.anyKey) tip += (tip ? ' ' : '') + `Ты пел на ${ev.offset > 0 ? 'октаву выше' : 'октаву ниже'} примера, это нормально.`;
  const missed = ev.notes.filter(r => r.status === 'missed').length;
  if (missed) tip += (tip ? ' ' : '') + `Не нашёл ${missed} ${plural(missed, 'ноту', 'ноты', 'нот')}: возможно, они слились с соседней или были слишком тихими.`;
  return `<div class="score" style="margin-top:14px"><div class="s"><b>${ev.pitchScore}%</b><span class="small muted">точность нот</span></div>
    ${ev.rhythmScore != null ? `<div class="s"><b>${ev.rhythmScore}%</b><span class="small muted">ритм</span></div>` : ''}
    <div class="s"><b>${ev.ok}/${n}</b><span class="small muted">нот верно</span></div></div>
    ${rollSVG(ref.notes, ev)}
    <div class="tiny muted" style="margin-top:4px">Серым: как надо. Цветом: как спето. Зелёный верно (до 30 ц), жёлтый близко (до 60 ц), красный мимо.</div>
    <ul class="notes-list">${lines}</ul>
    ${tip ? `<div class="info" style="margin-top:10px">${esc(tip)}</div>` : ''}
    <div class="row wrap" style="margin-top:12px"><button class="btn ghost" onclick="playNotes(${JSON.stringify(ref.notes)},${ref.bpm})">${ICON.play} Как надо</button>
    <button class="btn ghost" onclick="playAudioLast()">${ICON.play} Моя запись</button></div>`;
}
export let lastAudio = null;
export function setLastAudio(v) { lastAudio = v; }
export function playAudioLast() { if (!lastAudio) return; stopAll(); const s = ac().createBufferSource(); s.buffer = lastAudio; s.connect(master); s.start(); playing.push(s); }






// установщики для моста window (переходный период, см. main.js)
export function __set_rec(v) { rec = v; }
export function __set_lastAudio(v) { lastAudio = v; }

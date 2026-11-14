// Песни: разбор MIDI/караоке, ноты из записи голоса, фразы, тональность, честность проверки пения.
// Запуск: node tests/test_songs.js
const { VA } = require('../src/core/analysis.js'), { synth, sr } = require('./synth.js');
const L = require('../src/features/songlib.js'), { BUILTIN_SONGS } = require('../src/data/songs.js');
let fail = 0;
const check = (name, cond, info) => { console.log((cond ? 'OK   ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!cond) fail++; };

// --- маленький писатель MIDI для теста
const vlq = n => { const o = [n & 0x7f]; while ((n >>= 7)) o.unshift((n & 0x7f) | 0x80); return o; };
const cp1251 = s => [...s].map(c => { const k = c.charCodeAt(0); return k >= 0x410 && k <= 0x44f ? k - 0x410 + 0xc0 : k === 0x451 ? 0xb8 : k; });
function track(events) { // events: [tick, bytes]
  events.sort((a, b) => a[0] - b[0]); let last = 0; const out = [];
  for (const [t, bytes] of events) { out.push(...vlq(t - last), ...bytes); last = t; }
  out.push(0, 0xff, 0x2f, 0);
  return [0x4d, 0x54, 0x72, 0x6b, out.length >> 24 & 255, out.length >> 16 & 255, out.length >> 8 & 255, out.length & 255, ...out];
}
const meta = (type, bytes) => [0xff, type, ...vlq(bytes.length), ...bytes];
function midiFile(tracks, div = 96) { return new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, div >> 8, div & 255, ...tracks.flat()]); }

// мелодия: 3 строки по 4 ноты (четверти), слоги в cp1251, строки начинаются с «/»
const MEL = [[60, 'Во '], [62, 'по'], [64, 'ле '], [65, 'бе'], [67, '/рё'], [65, 'за '], [64, 'сто'], [62, 'я'], [60, '/ла '], [64, 'лю'], [62, 'ли '], [60, 'ли']];
const Q = 96;
const tempoTr = track([[0, meta(0x51, [0x07, 0xa1, 0x20])], [Q * 4, meta(0x51, [0x03, 0xd0, 0x90])]]); // 120 bpm, потом 240 bpm
const melEv = [[0, meta(0x03, [...'Melody'].map(c => c.charCodeAt(0)))]];
MEL.forEach(([m], i) => { melEv.push([i * Q, [0x90, m, 90]]); melEv.push([i * Q + Q - 8, [0x80, m, 0]]); });
const wordsEv = [[0, meta(0x01, [...'@TБерёза'].flatMap(c => cp1251(c)))]];
MEL.forEach(([, w], i) => wordsEv.push([i * Q, meta(0x01, cp1251(w))]));
// аккомпанемент: аккорды (3 ноты разом) на канале 2 и ударные на канале 10
const accEv = [];
for (let i = 0; i < 12; i += 2) for (const m of [48, 52, 55]) { accEv.push([i * Q, [0x91, m, 70]]); accEv.push([i * Q + 2 * Q - 4, [0x81, m, 0]]); }
for (let i = 0; i < 12; i++) { accEv.push([i * Q, [0x99, 36, 100]]); accEv.push([i * Q + 10, [0x89, 36, 0]]); }
const file = midiFile([tempoTr, track(accEv), track(melEv), track(wordsEv)]);

// файл для теста интерфейса (sim_songs.py)
{ const fs = require('fs'), path = require('path'), out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'test.kar'), file); }
const mid = L.parseMidi(file), cands = L.midiCandidates(mid);
check('MIDI: дорожка мелодии выбрана первой', cands[0] && mid.tracks[cands[0].i].name === 'Melody', cands.map(c => c.name + ':' + c.score.toFixed(1)).join(' '));
check('MIDI: ударные не считаются мелодией', !cands.some(c => c.ch === 9));
const song = L.songFromMidi(mid, cands[0]);
check('MIDI: все 12 нот', song.notes.length === 12 && song.notes.every((n, i) => n.m === MEL[i][0]), song.notes.map(n => n.m).join(','));
check('MIDI: темп 120 -> 240 учтён', Math.abs(song.notes[3].t - 1.5) < .01 && Math.abs(song.notes[5].t - 2.25) < .01, song.notes.map(n => n.t).join(','));
check('караоке: слова в cp1251 прочитаны', L.phraseWords(song.notes) === 'Во поле берёза стояла люли ли', L.phraseWords(song.notes));
check('караоке: фразы по строкам', JSON.stringify(song.ph) === '[0,4,8]', JSON.stringify(song.ph));
check('караоке: название из @T', mid.tracks.some(t => t.texts.some(x => x.s === '@TБерёза')));
check('караоке: UTF-8 тоже читается', L.decodeText(new TextEncoder().encode('Ёлка')) === 'Ёлка');
let threw = false; try { L.parseMidi(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])); } catch (e) { threw = true; }
check('не MIDI - понятная ошибка', threw);
// битый файл (обрезан) не вешает и не падает
let ok = true; try { L.parseMidi(file.slice(0, 120)); } catch (e) { ok = String(e).length > 0; }
check('обрезанный MIDI не ломает разбор', ok);
const mono = L.monophonic([{ m: 60, t: 0, d: 1 }, { m: 64, t: 0, d: 1 }, { m: 67, t: .01, d: 1 }, { m: 62, t: .5, d: .5 }]);
check('аккорд -> верхняя нота, наложение обрезано', mono.length === 2 && mono[0].m === 67 && Math.abs(mono[0].d - .5) < .02, JSON.stringify(mono));

// --- запись голоса: строй на 30 центов ниже, скольжения, вибрато (synth). Ноты должны совпасть с задуманными
const want = [57, 57, 64, 64, 66, 66, 64, 62, 62, 61, 61, 59, 59, 57];
const x = synth(want.map((m, i) => ({ midi: m - .3, dur: i % 7 === 6 ? .9 : .42, gap: i % 7 === 6 ? .45 : .06 })));
const v = L.songFromSegs(VA.analyzeSamples([x], sr).segs);
check('голос: ноты из записи совпали', JSON.stringify(v.notes.map(n => n.m)) === JSON.stringify(want), v.notes.map(n => n.m).join(','));
check('голос: строй -30 ц найден', Math.abs(v.tune + 30) <= 8, v.tune + ' ц');
check('голос: две фразы по паузе', JSON.stringify(v.ph) === '[0,7]', JSON.stringify(v.ph));

// --- фразы: длинная без пауз режется, короткий хвост приклеивается
const long = Array.from({ length: 30 }, (_, i) => ({ m: 60 + i % 5, t: i * .4, d: .38 }));
const lp = L.splitPhrases(long);
check('длинная фраза режется на куски до 12 нот', lp.every((s, k) => (k + 1 < lp.length ? lp[k + 1] : 30) - s <= 12) && lp.length >= 3, JSON.stringify(lp));

// --- тональность
const tw = BUILTIN_SONGS[0].notes;
check('тональность: низкий голос - на октаву вниз', L.songShift(tw, [43, 64]) === -12, L.songShift(tw, [43, 64]));
check('тональность: высокий голос - как есть', L.songShift(tw, [57, 79]) === 0);
const sh = L.songShift(tw, [50, 59]);
check('тональность: узкое окно - сдвиг по полутону в середину', sh + 60 >= 50 && sh + 69 <= 59, sh);

// --- честность караоке-игры: имитация живого голоса в такт (каждая фраза встроенных песен и каждая песня целиком)
// певец: опоздание lat (с), скольжение glide, вибрато vib (полутона), сдвиг shift, ноты wrong - на тритон мимо
function sing(notes, o) {
  const fr = [], s0 = notes[0].t, tp = o.tempo || 1; let prev = null;
  const ons = notes.map((n, i) => ({ m: (o.wrong && o.wrong.includes(i) ? n.m + 6 : n.m), t0: (n.t - s0) / tp, t1: (n.t - s0 + n.d) / tp }));
  const end = ons[ons.length - 1].t1 + .6;
  for (let t = -.5; t < end; t += 1 / 60) {
    let m = null;
    for (const n of ons) if (t >= n.t0 + o.lat && t < n.t1 + o.lat - .04) {
      const k = Math.min(1, (t - n.t0 - o.lat) / o.glide), from = prev == null ? n.m : prev;
      m = from + (n.m - from) * k + o.vib * Math.sin(t * 2 * Math.PI * 5.5) + o.shift;
      if (t >= n.t1 + o.lat - .06) prev = n.m;
      break;
    }
    if (o.drone != null) m = o.drone + .1 * Math.sin(t * 30);
    fr.push({ t, m: o.silent ? null : m });
  }
  return fr;
}
const FAIR = { 'вовремя': {}, 'опоздание 0.25 с': { lat: .25 }, 'раньше на 0.08 с': { lat: -.08 }, 'октавой ниже': { shift: -12 }, 'октавой выше': { shift: 12 }, 'вибрато ±30 ц': { vib: .3 }, 'медленный темп': { tempo: .75 } };
const UNFAIR = { 'фальшь +0.7 полутона': { shift: .7 }, 'тишина': { silent: true }, 'одна нота на всё': { droneFirst: true }, 'две ноты из трёх мимо': { wrongMost: true }, 'опоздал на целую секунду': { lat: 1 } };
const units = [];
for (const s of BUILTIN_SONGS) { for (let k = 0; k < s.ph.length; k++) units.push([`${s.title}, фраза ${k + 1}`, L.phraseNotes(s, k)]); units.push([`${s.title} целиком`, s.notes]); }
units.push(['караоке-файл целиком', song.notes]);
let fairBad = 0, unfairBad = 0;
for (const [name, notes] of units) {
  for (const [nm, o0] of Object.entries(FAIR)) {
    const o = { lat: .12, glide: .07, vib: .12, shift: 0, ...o0 };
    const r = L.songGameFrames(notes, sing(notes, o), { tempo: o.tempo || 1 });
    if (r.pct < 90) { fairBad++; check(`${name}, ${nm}: честный певец должен взять 90%+`, false, `${r.n}/${r.total}`); }
  }
  for (const [nm, o0] of Object.entries(UNFAIR)) {
    const o = { lat: .12, glide: .07, vib: .1, shift: 0, ...o0 };
    if (o0.droneFirst) { const cnt = {}; notes.forEach(n => cnt[n.m % 12] = (cnt[n.m % 12] || 0) + 1); o.drone = +Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0] + 60; }
    if (o0.wrongMost) o.wrong = notes.map((_, i) => i).filter(i => i % 3 !== 0);
    const r = L.songGameFrames(notes, sing(notes, o), {});
    if (r.ok) { unfairBad++; check(`${name}, ${nm}: не должен пройти`, false, `${r.n}/${r.total}`); }
  }
  const r = L.songGameFrames(notes, sing(notes, { lat: .12, glide: .07, vib: .1, shift: -12 }), { strict: true });
  if (r.n) check(`${name}: строго в октаве, октавой ниже не засчитывается`, false, `${r.n}/${r.total}`);
}
check(`честность игры: ${units.length} кусков, по ${Object.keys(FAIR).length} честных и ${Object.keys(UNFAIR).length} нечестных певцов`, !fairBad && !unfairBad);
// сдвиг тональности: засчитывается песня в новой тональности, а не в старой
{ const notes = L.phraseNotes(BUILTIN_SONGS[1], 0);
  check('сдвиг +3: спетое в новой тональности засчитано', L.songGameFrames(notes, sing(notes, { lat: .1, glide: .07, vib: .1, shift: 3 }), { shift: 3 }).ok);
  check('сдвиг +3: спетое в старой тональности - нет', !L.songGameFrames(notes, sing(notes, { lat: .1, glide: .07, vib: .1, shift: 0 }), { shift: 3 }).ok); }
// звёзды и серия
{ const notes = BUILTIN_SONGS[0].notes, r = L.songGameFrames(notes, sing(notes, { lat: .1, glide: .07, vib: .1, shift: 0 }), {});
  check('чисто всю песню: 3 звезды и серия на все ноты', r.stars === 3 && r.best === notes.length, `${r.stars}★ серия ${r.best}`); }

// --- чужой файл песни: без разметки и кода
const bad = L.normalizeSong({ id: '<img>', title: 'x', notes: [] });
check('песня с плохим id отброшена', bad === null);
const ns = L.normalizeSong({ id: 'sx1', title: '<b>Т</b>', notes: [{ m: 60, t: 0, d: 1, w: 'a'.repeat(500) }, { m: 'x', t: 0, d: 1 }, { m: 62, t: 1, d: 1 }, { m: 64, t: 2, d: 1 }], ph: [5, 0], evil: 'alert(1)' });
check('песня из файла: мусорные ноты выкинуты, слог обрезан, лишних полей нет', ns && ns.notes.length === 3 && ns.notes[0].w.length === 120 && !('evil' in ns) && JSON.stringify(ns.ph) === '[0]', JSON.stringify(ns));
process.exit(fail ? 1 : 0);

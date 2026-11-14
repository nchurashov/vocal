import { VA } from '../core/analysis.js';

// ===== Песни: чистые функции без экрана (тест: tests/test_songs.js, tests/sim_songs.py) =====
// Песня: { id, title, src: 'builtin'|'midi'|'voice', notes: [{ m, t, d, w? }], ph: [индексы нот, с которых начинаются фразы] }
// m - нота MIDI, t и d - начало и длина в секундах, w - слог (если есть слова).

// --- разбор MIDI и караоке (.mid, .kar)
const vlq = (b, p) => { let v = 0, c; do { c = b[p.i++]; v = (v << 7) | (c & 0x7f); } while (c & 0x80 && p.i < b.length); return v; };
const str4 = (b, i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
// русские караоке-файлы обычно в cp1251, новые - в UTF-8
export function decodeText(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { }
  try { return new TextDecoder('windows-1251').decode(bytes); } catch (e) { return String.fromCharCode(...bytes); }
}
export function parseMidi(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.length < 14 || str4(b, 0) !== 'MThd') throw new Error('Это не MIDI-файл');
  if (b.length > 3e6) throw new Error('Файл слишком большой');
  const hl = (b[4] << 24) | (b[5] << 16) | (b[6] << 8) | b[7], ntr = (b[10] << 8) | b[11], div = (b[12] << 8) | b[13];
  let pos = 8 + hl;
  const tracks = [], tempos = [];
  for (let k = 0; k < ntr && pos + 8 <= b.length; k++) {
    if (str4(b, pos) !== 'MTrk') break;
    const len = (b[pos + 4] << 24) | (b[pos + 5] << 16) | (b[pos + 6] << 8) | b[pos + 7], end = Math.min(b.length, pos + 8 + len);
    const p = { i: pos + 8 }, tr = { name: '', notes: [], texts: [] }, open = new Map();
    let tick = 0, run = 0, guard = 0;
    while (p.i < end && guard++ < 400000) {
      tick += vlq(b, p);
      let st = b[p.i];
      if (st & 0x80) { p.i++; if (st < 0xf0) run = st; } else if (run) st = run; else break;
      if (st === 0xff) {
        const type = b[p.i++], l = vlq(b, p), data = b.subarray(p.i, p.i + l); p.i += l;
        if (type === 0x51 && l === 3) tempos.push({ tick, us: (data[0] << 16) | (data[1] << 8) | data[2] });
        else if (type === 0x03 && !tr.name) tr.name = decodeText(data).trim().slice(0, 40);
        else if (type === 0x01 || type === 0x05) tr.texts.push({ tick, type, s: decodeText(data) });
        else if (type === 0x2f) break;
      } else if (st === 0xf0 || st === 0xf7) { p.i += vlq(b, p); }
      else {
        const hi = st & 0xf0, ch = st & 0x0f;
        if (hi === 0xc0 || hi === 0xd0) { p.i += 1; continue; }
        const d1 = b[p.i++], d2 = b[p.i++];
        if (hi !== 0x90 && hi !== 0x80) continue;
        const key = ch * 128 + d1;
        if (hi === 0x90 && d2 > 0) { if (!open.has(key)) open.set(key, []); open.get(key).push(tick); }
        else { const q = open.get(key); if (q && q.length) tr.notes.push({ m: d1, ch, t0: q.shift(), t1: tick }); }
      }
    }
    tracks.push(tr); pos = end;
  }
  // такты -> секунды по карте темпа (общей для всех дорожек)
  tempos.sort((x, y) => x.tick - y.tick);
  let toSec;
  if (div & 0x8000) { const fps = 256 - (div >> 8), tpf = div & 0xff; toSec = tk => tk / (fps * tpf); }
  else {
    const map = [{ tick: 0, us: 500000, sec: 0 }];
    for (const x of tempos) { const l = map[map.length - 1]; const sec = l.sec + (x.tick - l.tick) * l.us / 1e6 / div; if (x.tick === l.tick) { l.us = x.us; } else map.push({ tick: x.tick, us: x.us, sec }); }
    toSec = tk => { let l = map[0]; for (const x of map) { if (x.tick <= tk) l = x; else break; } return l.sec + (tk - l.tick) * l.us / 1e6 / div; };
  }
  for (const tr of tracks) {
    tr.notes = tr.notes.map(n => ({ m: n.m, ch: n.ch, t: toSec(n.t0), d: Math.max(.02, toSec(n.t1) - toSec(n.t0)) })).sort((x, y) => x.t - y.t || y.m - x.m);
    tr.texts = tr.texts.map(x => ({ t: toSec(x.tick), type: x.type, s: x.s }));
  }
  return { tracks };
}
// слова караоке: события lyric (0x05) или текст (0x01) без служебных @-строк. «/» и «\» - начало новой строки
export function midiLyrics(mid) {
  const all = mid.tracks.flatMap(tr => tr.texts);
  const ly = all.filter(x => x.type === 0x05 && x.s.trim()), tx = all.filter(x => x.type === 0x01 && !x.s.startsWith('@') && x.s.trim());
  const use = ly.length >= 10 ? ly : tx.length >= 10 ? tx : [];
  return use.sort((x, y) => x.t - y.t).map(x => ({ t: x.t, br: /^[/\\]/.test(x.s) || /^[\r\n]/.test(x.s), s: x.s.replace(/[/\\\r\n]/g, '') }));
}
// одна мелодия из дорожки: из аккорда - верхняя нота, предыдущая нота кончается, когда началась следующая
export function monophonic(notes) {
  const out = [];
  for (const n of [...notes].sort((x, y) => x.t - y.t || y.m - x.m)) {
    const l = out[out.length - 1];
    if (l && n.t - l.t < .03) { if (n.m > l.m) { l.m = n.m; l.d = n.d; } continue; } // та же доля (аккорд): оставляем верхнюю
    if (l && l.t + l.d > n.t) l.d = n.t - l.t;
    out.push({ m: n.m, t: n.t, d: n.d });
  }
  return out.filter(n => n.d >= .06);
}
// дорожки, похожие на мелодию (кроме ударных): [{ i, ch, name, n, lo, hi, score }], лучшая первой
export function midiCandidates(mid, lyrics = midiLyrics(mid)) {
  const c = [];
  mid.tracks.forEach((tr, i) => {
    const chans = [...new Set(tr.notes.map(n => n.ch))].filter(ch => ch !== 9);
    for (const ch of chans) {
      const raw = tr.notes.filter(n => n.ch === ch); if (raw.length < 8) continue;
      const mono = monophonic(raw); if (mono.length < 8) continue;
      const ms = mono.map(n => n.m), med = VA.median(ms), chord = 1 - mono.length / raw.length;
      let score = -Math.abs(med - 66) / 6 - chord * 4;
      if (/melod|vocal|voice|lead|sing|solo|мелод|вокал|голос/i.test(tr.name)) score += 3;
      if (lyrics.length) { const on = mono.map(n => n.t); const hit = lyrics.filter(l => on.some(t => Math.abs(t - l.t) < .08)).length; score += 8 * hit / lyrics.length; }
      c.push({ i, ch, name: tr.name || `Дорожка ${i + 1}`, n: mono.length, lo: Math.min(...ms), hi: Math.max(...ms), score });
    }
  });
  return c.sort((x, y) => y.score - x.score);
}
export function songFromMidi(mid, cand) {
  const lyrics = midiLyrics(mid);
  let notes = monophonic(mid.tracks[cand.i].notes.filter(n => n.ch === cand.ch));
  const t0 = notes.length ? notes[0].t : 0;
  // слоги к нотам: к ближайшей свободной ноте в пределах 0.25 с
  const breaks = new Set();
  let j = 0;
  for (const l of lyrics) {
    while (j < notes.length - 1 && notes[j].t < l.t - .25) j++;
    let best = -1, bd = .25;
    for (let k = j; k < notes.length && notes[k].t < l.t + .25; k++) if (notes[k].w == null && Math.abs(notes[k].t - l.t) < bd) { bd = Math.abs(notes[k].t - l.t); best = k; }
    if (best < 0) continue;
    notes[best].w = l.s.slice(0, 24); if (l.br) breaks.add(best);
  }
  notes = notes.map(n => ({ m: n.m, t: +(n.t - t0).toFixed(3), d: +n.d.toFixed(3), ...(n.w != null ? { w: n.w } : {}) }));
  return { notes, ph: splitPhrases(notes, breaks.size >= 2 ? [...breaks] : null) };
}

// --- песня из записи голоса (без музыки): ноты по сегментам analyzeSamples
export function songFromSegs(segs) {
  const s = segs.filter(x => x.end - x.start >= .1 && isFinite(x.pitch));
  if (!s.length) return { notes: [], ph: [], tune: 0 };
  // строй певца: средний сдвиг от ровных нот (чтобы «чуть ниже 440» не раскидало ноты по соседним)
  let cx = 0, cy = 0; for (const x of s) { const a = 2 * Math.PI * (x.pitch - Math.round(x.pitch)); cx += Math.cos(a); cy += Math.sin(a); }
  const tune = Math.atan2(cy, cx) / (2 * Math.PI);
  const notes = [];
  for (const x of s) {
    const m = Math.round(x.pitch - tune), l = notes[notes.length - 1];
    if (l && l.m === m && x.start - (l.t + l.d) < .025) { l.d = x.end - l.t; continue; } // одна нота, разрезанная дрожанием (без паузы между)
    notes.push({ m, t: x.start, d: x.end - x.start });
  }
  const t0 = notes[0].t;
  const out = notes.filter(n => n.d >= .12).map(n => ({ m: n.m, t: +(n.t - t0).toFixed(3), d: +n.d.toFixed(3) }));
  return { notes: out, ph: splitPhrases(out), tune: Math.round(tune * 100) };
}

// --- фразы: по строкам слов, иначе по паузам; длинные режем по самой большой паузе или длинной ноте
export function splitPhrases(notes, starts) {
  if (!notes.length) return [];
  let ph;
  if (starts) ph = [...new Set([0, ...starts])].filter(i => i >= 0 && i < notes.length).sort((a, b) => a - b);
  else {
    const md = VA.median(notes.map(n => n.d)), need = Math.max(.3, md * .9);
    ph = [0];
    for (let i = 1; i < notes.length; i++) if (notes[i].t - (notes[i - 1].t + notes[i - 1].d) >= need) ph.push(i);
  }
  // короткие (меньше 3 нот) приклеиваем к предыдущей
  ph = ph.filter((s, k) => k === 0 || s - ph[k - 1] >= 3);
  if (ph.length > 1 && notes.length - ph[ph.length - 1] < 3) ph.pop();
  // длинные (больше 12 нот) делим
  const out = [];
  const cut = (a, b) => {
    if (b - a <= 12) { out.push(a); return; }
    let best = a + 6, bv = -1;
    for (let i = a + 4; i <= b - 4; i++) { const v = notes[i].t - notes[i - 1].t; if (v > bv) { bv = v; best = i; } }
    cut(a, best); cut(best, b);
  };
  ph.forEach((s, k) => cut(s, k + 1 < ph.length ? ph[k + 1] : notes.length));
  return out;
}
export const phraseRange = (song, k) => [song.ph[k], k + 1 < song.ph.length ? song.ph[k + 1] : song.notes.length];
export const phraseNotes = (song, k) => { const [a, b] = phraseRange(song, k); return song.notes.slice(a, b); };
// текст фразы: слоги вместе, если слов нет - пусто
export const phraseWords = notes => notes.map(n => n.w || '').join('').replace(/\s+/g, ' ').trim();

// --- тональность: целиком в окно голоса [lo, hi]. Сначала пробуем сдвиг на октаву (тональность та же), иначе по полутону к середине
export function songShift(notes, win) {
  const ms = notes.map(n => n.m), lo = Math.min(...ms), hi = Math.max(...ms), mid = (win[0] + win[1]) / 2;
  const oct = [-36, -24, -12, 0, 12, 24, 36].filter(s => lo + s >= win[0] && hi + s <= win[1]).sort((a, b) => Math.abs(lo + hi + 2 * a - 2 * mid) - Math.abs(lo + hi + 2 * b - 2 * mid));
  if (oct.length) return oct[0];
  return Math.round(mid - (lo + hi) / 2);
}

// --- проверка пения по порядку нот (живой голос: кадры { t, m } раз в ~1/60 с)
// Одинаковые ноты подряд сливаются в одну цель (живьём их не разделить). Нота засчитана, если
// голос в пределах ±50 центов (без строгого режима - в любой октаве) набрал нужное время.
// Пропустил ноту - можно петь следующую: смотрим на 2 ноты вперёд, пропущенная не засчитывается.
export function songTargets(notes, tempo = 1) {
  const T = [];
  notes.forEach((n, i) => { const l = T[T.length - 1]; if (l && l.m === n.m) { l.d += n.d / tempo; l.idx.push(i); } else T.push({ m: n.m, d: n.d / tempo, idx: [i] }); });
  for (const x of T) x.need = Math.min(.3, Math.max(.12, x.d * .35));
  return T;
}
export function songScorer(targets, strict, shift = 0) {
  const S = { j: 0, hit: targets.map(() => false), acc: targets.map(() => 0), lastT: null };
  S.push = (t, m) => {
    const dt = S.lastT == null ? 0 : Math.min(.1, Math.max(0, t - S.lastT)); S.lastT = t;
    if (m == null || S.j >= targets.length) return S;
    const near = k => { let d = m - (targets[k].m + shift); if (!strict) d -= 12 * Math.round(d / 12); return Math.abs(d) <= .5; };
    // ещё тянешь только что засчитанную ноту: это не шаг вперёд (иначе в «ля-си-ля» хвост первой «ля» засчитал бы третью)
    const tail = S.j > 0 && near(S.j - 1);
    for (let k = S.j; k < Math.min(targets.length, tail ? S.j + 1 : S.j + 3); k++) {
      if (!near(k)) continue;
      S.acc[k] += dt;
      if (S.acc[k] >= targets[k].need) { S.hit[k] = true; S.j = k + 1; for (let q = k + 1; q < targets.length; q++) S.acc[q] = 0; }
      break;
    }
    return S;
  };
  S.result = () => { const n = S.hit.filter(Boolean).length; return { hit: S.hit, n, total: targets.length, ok: n >= Math.ceil(targets.length * .8), pct: Math.round(100 * n / targets.length) }; };
  return S;
}
export function scoreSung(notes, frames, strict, shift = 0, tempo = 1) {
  const S = songScorer(songTargets(notes, tempo), strict, shift);
  for (const f of frames) S.push(f.t, f.m);
  return S.result();
}

// --- проверка песни, пришедшей извне (localStorage, файл): только числа и короткий текст, вывод слов - через esc()
export function normalizeSong(x) {
  if (!x || typeof x !== 'object' || !Array.isArray(x.notes)) return null;
  const id = typeof x.id === 'string' && /^[\w-]{1,40}$/.test(x.id) ? x.id : null; if (!id) return null;
  const notes = [];
  for (const n of x.notes.slice(0, 3000)) {
    if (!n || !Number.isInteger(n.m) || n.m < 24 || n.m > 100 || !isFinite(n.t) || !isFinite(n.d) || n.t < 0 || n.d <= 0 || n.d > 30) continue;
    notes.push({ m: n.m, t: +n.t, d: +n.d, ...(typeof n.w === 'string' && n.w ? { w: n.w.slice(0, 120) } : {}) });
  }
  if (notes.length < 3) return null;
  let ph = Array.isArray(x.ph) ? [...new Set(x.ph.filter(i => Number.isInteger(i) && i >= 0 && i < notes.length))].sort((a, b) => a - b) : [];
  if (ph[0] !== 0) ph = splitPhrases(notes);
  return { id, title: (typeof x.title === 'string' ? x.title : 'Песня').trim().slice(0, 80) || 'Песня', src: ['builtin', 'midi', 'voice'].includes(x.src) ? x.src : 'midi', notes, ph };
}

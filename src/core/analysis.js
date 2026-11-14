
// ===== Анализ записи: высота тона, ноты, сравнение с эталоном =====
export const VA = (() => {
  const A4 = 440;
  const hzToMidi = f => 69 + 12 * Math.log2(f / A4);
  const midiToHz = m => A4 * Math.pow(2, (m - 69) / 12);
  const median = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

  function toMono(chs) {
    if (chs.length === 1) return chs[0];
    const n = chs[0].length, y = new Float32Array(n);
    for (const c of chs) for (let i = 0; i < n; i++) y[i] += c[i] / chs.length;
    return y;
  }

  function decimate(x, sr) {
    const factor = Math.max(1, Math.round(sr / 11025));
    if (factor === 1) return { x, sr };
    const N = 31, h = new Float32Array(N), fc = 0.45 / factor; let sum = 0;
    for (let i = 0; i < N; i++) {
      const m = i - (N - 1) / 2;
      const s = m === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * m) / (Math.PI * m);
      h[i] = s * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (N - 1))); sum += h[i];
    }
    for (let i = 0; i < N; i++) h[i] /= sum;
    const len = Math.floor(x.length / factor), y = new Float32Array(len);
    for (let o = 0; o < len; o++) {
      const c = o * factor; let acc = 0;
      for (let k = 0; k < N; k++) { const idx = c + k - 15; if (idx >= 0 && idx < x.length) acc += h[k] * x[idx]; }
      y[o] = acc;
    }
    return { x: y, sr: sr / factor };
  }

  // YIN по одному кадру
  function yinFrame(x, off, W, sr, d, cm) {
    const tMin = Math.floor(sr / 1000), tMax = Math.ceil(sr / 65);
    for (let t = 1; t <= tMax; t++) {
      let s = 0;
      for (let i = 0; i < W; i++) { const v = x[off + i] - x[off + i + t]; s += v * v; }
      d[t] = s;
    }
    let run = 0; cm[0] = 1;
    for (let t = 1; t <= tMax; t++) { run += d[t]; cm[t] = run > 0 ? d[t] * t / run : 1; }
    let tau = -1;
    for (let t = tMin; t <= tMax; t++) {
      if (cm[t] < 0.15) { while (t + 1 <= tMax && cm[t + 1] < cm[t]) t++; tau = t; break; }
    }
    if (tau < 0) {
      let best = 1, bt = -1;
      for (let t = tMin; t <= tMax; t++) if (cm[t] < best) { best = cm[t]; bt = t; }
      if (best < 0.3) tau = bt; else return null;
    }
    let bt = tau;
    if (tau > tMin && tau < tMax) {
      const a = cm[tau - 1], b = cm[tau], c = cm[tau + 1], den = a - 2 * b + c;
      if (den !== 0) bt = tau + 0.5 * (a - c) / den;
    }
    return { f: sr / bt, conf: 1 - cm[tau] };
  }

  function track(x, sr) {
    const W = Math.round(sr * 0.046), hop = Math.round(sr * 0.01), tMax = Math.ceil(sr / 65);
    const d = new Float32Array(tMax + 2), cm = new Float32Array(tMax + 2);
    const frames = [];
    for (let off = 0; off + W + tMax + 1 < x.length; off += hop) {
      let e = 0; for (let i = 0; i < W; i++) e += x[off + i] * x[off + i];
      const rms = Math.sqrt(e / W);
      frames.push({ t: (off + W / 2) / sr, rms, off });
    }
    if (!frames.length) return frames;
    const gate = Math.max(0.15 * pct(frames.map(f => f.rms), 0.95), 1e-4);
    for (const f of frames) {
      f.midi = null;
      if (f.rms < gate) continue;
      const p = yinFrame(x, f.off, W, sr, d, cm);
      if (p && p.conf > 0.75 && p.f >= 65 && p.f <= 1000) f.midi = hzToMidi(p.f);
    }
    // медианный фильтр против октавных скачков
    const raw = frames.map(f => f.midi);
    for (let i = 0; i < frames.length; i++) {
      if (raw[i] == null) continue;
      const w = []; for (let k = -2; k <= 2; k++) { const v = raw[i + k]; if (v != null) w.push(v); }
      if (w.length >= 3) frames[i].midi = median(w);
    }
    return frames;
  }

  function segment(frames) {
    let segs = [], cur = null, gap = 0, jump = 0;
    const close = (s) => { if (s && s.frames.length) segs.push(s); };
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      if (f.midi == null) { gap++; if (cur && gap > 4) { close(cur); cur = null; } continue; }
      gap = 0;
      if (!cur) { cur = { frames: [f] }; jump = 0; continue; }
      const body = cur.frames.slice(0, Math.max(1, cur.frames.length - jump)).slice(-40).map(z => z.midi);
      const ref = median(body);
      if (Math.abs(f.midi - ref) > 0.55) {
        jump++;
        if (jump >= 6) {
          const moved = cur.frames.splice(cur.frames.length - 5, 5);
          close(cur); cur = { frames: [...moved, f] }; jump = 0;
          continue;
        }
      } else jump = 0;
      cur.frames.push(f);
    }
    close(cur);
    // разрез по провалу громкости (повтор той же ноты)
    const out = [];
    for (const s of segs) {
      const r = s.frames.map(z => z.rms);
      const sm = r.map((_, i) => { let a = 0, n = 0; for (let k = -2; k <= 2; k++) if (r[i + k] != null) { a += r[i + k]; n++; } return a / n; });
      let start = 0;
      for (let i = 10; i < sm.length - 10; i++) {
        if (sm[i] <= sm[i - 1] && sm[i] <= sm[i + 1]) {
          const before = Math.max(...sm.slice(start, i)), after = Math.max(...sm.slice(i + 1));
          if (sm[i] < 0.45 * Math.min(before, after) && i - start >= 10) {
            out.push({ frames: s.frames.slice(start, i) }); start = i + 1;
          }
        }
      }
      out.push({ frames: s.frames.slice(start) });
    }
    return out.map(s => {
      const n = s.frames.length, a = Math.floor(n * 0.15), b = Math.max(a + 1, Math.ceil(n * 0.85));
      const core = s.frames.slice(a, b).map(z => z.midi);
      const pitch = median(core);
      const sd = Math.sqrt(core.reduce((acc, v) => acc + (v - pitch) ** 2, 0) / core.length);
      return { start: s.frames[0].t, end: s.frames[n - 1].t + 0.01, pitch, wobble: sd * 100 };
    }).filter(s => s.end - s.start >= 0.09);
  }

  // Выравнивание эталона и спетых нот (глобальное, с пропусками)
  function alignWith(ref, segs, o) {
    const n = ref.length, m = segs.length, GAP_REF = 2.5, GAP_SEG = 1.0;
    const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
    const B = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));
    for (let i = 1; i <= n; i++) { D[i][0] = i * GAP_REF; B[i][0] = 1; }
    for (let j = 1; j <= m; j++) { D[0][j] = j * GAP_SEG; B[0][j] = 2; }
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
      const c = Math.min(Math.abs(segs[j - 1].pitch - o - ref[i - 1]), 4);
      let best = D[i - 1][j - 1] + c, bb = 0;
      if (D[i - 1][j] + GAP_REF < best) { best = D[i - 1][j] + GAP_REF; bb = 1; }
      if (D[i][j - 1] + GAP_SEG < best) { best = D[i][j - 1] + GAP_SEG; bb = 2; }
      D[i][j] = best; B[i][j] = bb;
    }
    const pairs = new Array(n).fill(-1), extra = [];
    let i = n, j = m;
    while (i > 0 || j > 0) {
      const b = B[i][j];
      if (i > 0 && j > 0 && b === 0) { pairs[i - 1] = j - 1; i--; j--; }
      else if (i > 0 && (j === 0 || b === 1)) { i--; }
      else { extra.push(j - 1); j--; }
    }
    return { cost: D[n][m], pairs, extra };
  }

  function align(ref, segs, anyKey, strict) {
    let cands;
    if (strict && !anyKey) cands = [0];
    else if (anyKey) { cands = []; for (const s of segs) for (const r of ref) cands.push(s.pitch - r); }
    else cands = [-24, -12, 0, 12, 24];
    if (!cands.length) cands = [0];
    let best = null;
    for (const o of cands) { const a = alignWith(ref, segs, o); if (!best || a.cost < best.cost) best = { ...a, o }; }
    if (anyKey) {
      const diffs = best.pairs.map((j, i) => j >= 0 ? segs[j].pitch - ref[i] : null).filter(v => v != null && Math.abs(v - best.o) < 1);
      if (diffs.length) { const o = median(diffs); best = { ...alignWith(ref, segs, o), o }; }
    }
    return best;
  }

  const NOTE_NAMES = ['До', 'До#', 'Ре', 'Ре#', 'Ми', 'Фа', 'Фа#', 'Соль', 'Соль#', 'Ля', 'Ля#', 'Си'];
  const noteName = m => { const r = Math.round(m); return NOTE_NAMES[((r % 12) + 12) % 12]; };

  // ref: [{midi, beats}], segs: результат segment()
  // strict: октава засчитывается только та, что задана (работа над регистром)
  function evaluate(ref, segs, anyKey, strict) {
    const refM = ref.map(r => r.midi);
    const a = align(refM, segs, anyKey, strict);
    const notes = ref.map((r, i) => {
      const j = a.pairs[i];
      if (j < 0) return { i, ref: r.midi, status: 'missed' };
      const s = segs[j], dev = Math.round((s.pitch - a.o - r.midi) * 100);
      const ad = Math.abs(dev);
      return { i, ref: r.midi, seg: j, sung: s.pitch, dev, status: ad <= 30 ? 'ok' : ad <= 60 ? 'near' : 'off', wobble: Math.round(s.wobble) };
    });
    const ok = notes.filter(n => n.status === 'ok').length, near = notes.filter(n => n.status === 'near').length;
    const pitchScore = Math.round(100 * (ok + 0.5 * near) / ref.length);
    // ритм: пропорции между соседними спетыми нотами
    const rr = [];
    let onset = 0; const refOn = ref.map(r => { const v = onset; onset += r.beats; return v; });
    for (let i = 0; i < ref.length - 1; i++) {
      const j1 = a.pairs[i], j2 = a.pairs[i + 1];
      if (j1 >= 0 && j2 >= 0) rr.push({ i, ratio: (segs[j2].start - segs[j1].start) / (refOn[i + 1] - refOn[i]) });
    }
    let rhythmScore = null;
    if (rr.length >= 2) {
      const tempo = median(rr.map(x => x.ratio));
      let good = 0;
      for (const x of rr) {
        const nrm = x.ratio / tempo; x.norm = nrm;
        if (nrm >= 0.67 && nrm <= 1.5) good++;
        else notes[x.i].rhythm = nrm > 1.5 ? 'long' : 'short';
      }
      rhythmScore = Math.round(100 * good / rr.length);
    }
    return { notes, pitchScore, rhythmScore, offset: a.o, extra: a.extra.length, segCount: segs.length, ok, near };
  }

  function analyzeSamples(chs, sr) {
    const mono = toMono(chs);
    const d = decimate(mono, sr);
    const frames = track(d.x, d.sr);
    const segs = segment(frames);
    return { frames, segs, duration: mono.length / sr };
  }

  // Ритм: цели и нажатия в секундах
  function evaluateTaps(targets, taps, latency = 0) {
    const used = new Set();
    const res = targets.map(t => {
      let best = -1, bd = 1e9;
      taps.forEach((x, k) => { if (used.has(k)) return; const dd = Math.abs(x - latency - t); if (dd < bd) { bd = dd; best = k; } });
      if (best >= 0 && bd <= 0.25) { used.add(best); const dev = Math.round((taps[best] - latency - t) * 1000); const ad = Math.abs(dev); return { t, dev, status: ad <= 70 ? 'ok' : ad <= 140 ? 'near' : 'off' }; }
      return { t, status: 'missed' };
    });
    const ok = res.filter(r => r.status === 'ok').length, near = res.filter(r => r.status === 'near').length;
    const hit = res.filter(r => r.dev != null);
    const meanDev = hit.length ? Math.round(hit.reduce((a, r) => a + r.dev, 0) / hit.length) : 0;
    return { res, score: Math.round(100 * (ok + 0.5 * near) / targets.length), extra: taps.length - used.size, meanDev };
  }

  function livePitch(buf, sr) {
    let e = 0; for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
    if (Math.sqrt(e / buf.length) < 0.008) return null;
    const d = decimate(buf, sr), W = Math.round(d.sr * 0.046), tMax = Math.ceil(d.sr / 65);
    if (d.x.length < W + tMax + 2) return null;
    const off = d.x.length - W - tMax - 2;
    const p = yinFrame(d.x, off, W, d.sr, new Float32Array(tMax + 2), new Float32Array(tMax + 2));
    return p && p.conf > 0.8 && p.f >= 65 && p.f <= 1000 ? hzToMidi(p.f) : null;
  }

  return { livePitch, hzToMidi, midiToHz, median, noteName, analyzeSamples, segment, track, evaluate, evaluateTaps, align };
})();

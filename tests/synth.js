// Синтез «голоса» для тестов: гармоники, вибрато, скольжение между нотами, шум. Пишет WAV в tests/out/
const fs = require('fs'), path = require('path');
const VA = require('../src/analysis.js');
const sr = 44100, OUT = path.join(__dirname, 'out');
function synth(notes) { // notes: [{midi, dur, gap}]
  const total = notes.reduce((a, n) => a + n.dur + (n.gap || 0), 0) + 0.5;
  const x = new Float32Array(Math.ceil(total * sr)); let t = 0.25, ph = 0, prevF = null;
  for (const n of notes) {
    const N = Math.floor(n.dur * sr), f0 = VA.midiToHz(n.midi);
    for (let i = 0; i < N; i++) {
      const tt = i / sr; let f = f0 * Math.pow(2, (20 * Math.sin(2 * Math.PI * 5.5 * tt)) / 1200);
      if (prevF && tt < 0.06 && !n.gap) f = prevF + (f - prevF) * (tt / 0.06);
      ph += 2 * Math.PI * f / sr;
      const env = Math.min(1, tt / 0.03, (n.dur - tt) / 0.03);
      let s = 0; [1, .6, .4, .25, .15, .1].forEach((a, k) => s += a * Math.sin((k + 1) * ph));
      x[Math.floor(t * sr) + i] += 0.2 * env * s;
    }
    t += n.dur + (n.gap || 0); prevF = f0;
  }
  for (let i = 0; i < x.length; i++) x[i] += (Math.random() - .5) * .01;
  return x;
}
function wav(x, f) {
  const n = x.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(f, b);
}
module.exports = { synth, wav, sr };
if (require.main === module) {
  fs.mkdirSync(OUT, { recursive: true });
  // мелодия m2 от C3, нота 4 выше на 80 центов, нота 8 ниже на 40
  const m2 = [[0, 1], [4, 1], [2, 1], [5, 1], [4, 1], [7, 2], [5, 1], [4, 1], [2, 1], [0, 2]];
  wav(synth(m2.map(([s, b], i) => ({ midi: 48 + s + (i === 3 ? .8 : 0) + (i === 7 ? -.4 : 0), dur: b * .68, gap: .04 }))), path.join(OUT, 'sing.wav'));
  console.log('tests/out/sing.wav готов');
}

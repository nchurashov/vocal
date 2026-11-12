// Юнит-тест распознавания нот: node tests/test_analysis.js
const VA = require('../src/analysis.js'), { synth, sr } = require('./synth.js');
const base = 48, semis = [0, 2, 4, 5, 7, 5, 4, 2, 0], ref = semis.map(s => ({ midi: base + s, beats: 1 }));
let fail = 0;
const check = (name, cond, info) => { console.log((cond ? 'OK   ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!cond) fail++; };
const run = (notes, anyKey) => VA.evaluate(ref, VA.analyzeSamples([synth(notes)], sr).segs, anyKey);
let ev = run(semis.map(s => ({ midi: base + s, dur: .5 })), false);
check('чистое пение', ev.pitchScore === 100, ev.pitchScore + '%');
ev = run(semis.map(s => ({ midi: base + 12 + s, dur: .5 })), false);
check('октавой выше засчитывается', ev.pitchScore === 100, ev.pitchScore + '%');
ev = run(semis.map((s, i) => ({ midi: base + 3 + s + (i === 3 ? .7 : 0), dur: i === 4 ? 1 : .5 })).filter((_, i) => i !== 6), true);
check('фальшь +70ц найдена', ev.notes[3].status === 'off' && ev.notes[3].dev > 50, 'dev ' + ev.notes[3].dev);
check('пропуск ноты найден', ev.notes[6].status === 'missed');
const r = VA.evaluateTaps([0, .5, 1, 1.5], [.03, .62, 1.2], 0);
check('ритм: пропуск и опоздание', r.res[3].status === 'missed' && r.res[1].status === 'near');
process.exit(fail ? 1 : 0);

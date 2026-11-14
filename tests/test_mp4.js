// MP4 от MediaRecorder: находим замёрзший хвост (кадры кончились, звук идёт) и обрезаем без перекодирования.
// Запуск: node tests/test_mp4.js. Файлы в tests/fixtures - крошечные синтетические (64x64, синус):
// frozen_tail.mp4 - последний кадр растянут на 4 с, как делает iPhone; short_video.mp4 - картинка 2 с, звук 6 с,
// смещения данных от начала файла (base-data-offset); ok.mp4 - нормальная запись.
const fs = require('fs'), path = require('path');
const { mp4Parse, mp4Frozen, mp4Trim } = require('../src/core/mp4.js');
const F = n => new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', n)));
let fail = 0;
const check = (name, cond, info) => { console.log((cond ? 'OK   ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!cond) fail++; };
const ends = P => Object.fromEntries(P.tr.map(t => [t.kind, t.next / t.ts]));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

check('нормальная запись не трогается', mp4Frozen(F('ok.mp4')) === null);
for (const [name, want] of [['frozen_tail.mp4', 2.12], ['short_video.mp4', 2]]) {
  const u = F(name), fz = mp4Frozen(u);
  check(`${name}: обрыв найден`, fz && Math.abs(fz.cut - want) < .05 && fz.total > 6, JSON.stringify(fz));
  if (!fz) continue;
  const t = mp4Trim(u, fz.cut);
  check(`${name}: обрезка получилась`, !!t);
  if (!t) continue;
  const A = mp4Parse(u), B = mp4Parse(t), e = ends(B);
  check(`${name}: видео до обрыва`, Math.abs(e.vide - fz.cut) < .02, e.vide.toFixed(3));
  check(`${name}: звук не дольше картинки`, e.soun <= fz.cut + .2 && e.soun > fz.cut - .3, e.soun.toFixed(3));
  check(`${name}: после обрезки хвоста нет`, mp4Frozen(t) === null);
  // все оставшиеся кадры и куски звука - те же байты, что в исходнике
  let okData = true;
  for (const k of ['vide', 'soun']) {
    const a = A.tr.find(x => x.kind === k).smp, b = B.tr.find(x => x.kind === k).smp;
    b.forEach((x, i) => { if (!same(t.subarray(x.at, x.at + x.z), u.subarray(a[i].at, a[i].at + a[i].z)) || x.t !== a[i].t) okData = false; });
  }
  check(`${name}: данные кадров и звука не испорчены`, okData);
}
check('не mp4 - не падаем', mp4Frozen(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8])) === null && mp4Trim(new Uint8Array(20), 1) === null);
check('обрезанный файл - не падаем', mp4Frozen(F('ok.mp4').subarray(0, 3000)) === null);
if (fail) { console.log(fail + ' ошибок'); process.exit(1); }
console.log('mp4: всё хорошо');

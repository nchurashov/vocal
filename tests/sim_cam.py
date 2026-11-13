#!/usr/bin/env python3
"""Камера: запись видео уровня (9:16, mp4/webm, со звуком микрофона и итогом в конце) в обеих играх.
Запуск: python3 tests/sim_cam.py  (нужен playwright и Chrome; путь к Chrome: env CHROME)"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'index.html')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
WAV = os.path.join(ROOT, 'tests', 'out', 'sing.wav')
CHECK = """async () => { const c = CAM.clips[CAM.clips.length - 1]; if (!c) return null;
  const v = document.createElement('video'); v.src = c.url; v.muted = true;
  await new Promise(r => { v.onloadedmetadata = r; setTimeout(r, 3000); });
  let peak = 0; try { const b = await new AudioContext().decodeAudioData(await c.blob.arrayBuffer()); const d = b.getChannelData(0); for (let i = 0; i < d.length; i += 50) peak = Math.max(peak, Math.abs(d[i])); } catch (e) { peak = -1; }
  return { w: v.videoWidth, h: v.videoHeight, dur: v.duration, peak, sheet: !!document.querySelector('#sheet video') }; }"""
fails = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME, args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={WAV}', '--autoplay-policy=no-user-gesture-required'])
    pg = br.new_page(viewport={'width': 390, 'height': 844}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#ball-1'); pg.evaluate("state.settings.voiceSet = true; state.settings.cam = false; save()")
    for route, btn, fin in [('ball-1', '#blive', 'ballFinish(false)'), ('game-1', '#glive', 'gameFinish(false)')]:
        pg.goto(URL + '#' + route); pg.reload(); pg.wait_for_timeout(600)
        if not pg.evaluate("CAM_OK"): fails.append('CAM_OK = false в Chrome'); break
        if pg.evaluate("!!CAM.stream"): fails.append(f'{route}: камера включилась без галочки')
        if not pg.evaluate("document.querySelector('.check input[onchange^=camSet]').checked === false"): fails.append(f'{route}: галочка камеры включена по умолчанию')
        pg.click('text=Снимать себя'); pg.wait_for_timeout(1200)
        pg.click(btn); pg.wait_for_timeout(5000); pg.evaluate(fin); pg.wait_for_timeout(3500)
        r = pg.evaluate(CHECK)
        if not r: fails.append(f'{route}: видео не записалось'); continue
        if (r['w'], r['h']) != (720, 1280): fails.append(f'{route}: размер {r["w"]}x{r["h"]}, ждали 720x1280')
        if not (r['dur'] > 5): fails.append(f'{route}: длина {r["dur"]} с (ждали игру + 2.5 с итога)')
        if not (r['peak'] > .01): fails.append(f'{route}: в видео нет звука микрофона (пик {r["peak"]})')
        if not r['sheet']: fails.append(f'{route}: не открылся просмотр видео')
        pg.evaluate("closeSheet(); state.settings.cam = false; save()")
    pg.goto(URL + '#today'); pg.wait_for_timeout(300)
    if pg.evaluate("!!CAM.stream || !!document.getElementById('campv')"): fails.append('камера не выключилась при уходе с уровня')
    if errs: fails.append('ошибки: ' + '; '.join(errs))
    br.close()
print('\n'.join(fails) if fails else 'OK: видео уровня пишется в обеих играх (9:16, со звуком и итогом)')
sys.exit(1 if fails else 0)

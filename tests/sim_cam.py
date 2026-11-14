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
  return { w: v.videoWidth, h: v.videoHeight, dur: v.duration, size: c.blob.size, peak, sheet: !!document.querySelector('#sheet video') }; }"""
fails = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME, args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={WAV}', '--autoplay-policy=no-user-gesture-required'])
    pg = br.new_page(bypass_csp=True, viewport={'width': 390, 'height': 844}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#ball-1'); pg.evaluate("state.settings.voiceSet = true; state.settings.cam = false; save()")
    for route, btn, fin in [('ball-1', '#blive', 'ballFinish(false)'), ('game-1', '#glive', 'gameFinish(false)')]:
        pg.goto(URL + '#' + route); pg.reload(); pg.wait_for_timeout(600)
        if not pg.evaluate("CAM_OK"): fails.append('CAM_OK = false в Chrome'); break
        if pg.evaluate("!!CAM.stream"): fails.append(f'{route}: камера включилась без галочки')
        if not pg.evaluate("document.querySelector('.check input[data-change=camSet]').checked === false"): fails.append(f'{route}: галочка камеры включена по умолчанию')
        pg.click('text=Снимать себя'); pg.wait_for_timeout(1200)
        pg.click(btn); pg.wait_for_timeout(5000); pg.evaluate(fin); pg.wait_for_timeout(200)
        if 'дописывается' not in pg.inner_text('#sheet'): fails.append(f'{route}: окно «Видео дописывается» не открылось сразу')
        pg.wait_for_timeout(3300)
        r = pg.evaluate(CHECK)
        if not r: fails.append(f'{route}: видео не записалось'); continue
        if (r['w'], r['h']) != (720, 1280): fails.append(f'{route}: размер {r["w"]}x{r["h"]}, ждали 720x1280')
        if not (5 < r['dur'] < 60): fails.append(f'{route}: длина {r["dur"]} с (ждали игру + 2.5 с итога, не больше минуты)')
        if r.get('size', 0) > 15e6: fails.append(f'{route}: файл {r["size"]} байт - слишком большой')
        if not (r['peak'] > .01): fails.append(f'{route}: в видео нет звука микрофона (пик {r["peak"]})')
        if not r['sheet']: fails.append(f'{route}: не открылся просмотр видео')
        pg.evaluate("closeSheet(); state.settings.cam = false; save()")
    # iPhone-приложение: подставной плагин Media - видео сохраняется в Фото сразу и один раз
    pg.goto(URL + '#ball-1'); pg.reload(); pg.wait_for_timeout(500)
    pg.evaluate("window._saves = 0; window.Capacitor = { Plugins: { Media: { saveVideo: async o => { if (!/^data:video/.test(o.path)) throw new Error('bad'); window._saves++; } } } }")
    pg.click('text=Снимать себя'); pg.wait_for_timeout(1200); pg.click('#blive'); pg.wait_for_timeout(4000); pg.evaluate('ballFinish(false)'); pg.wait_for_timeout(4500)
    if pg.evaluate('window._saves') != 1 or 'Сохранено в Фото' not in pg.inner_text('#sheet'): fails.append(f'приложение: сохранений в Фото {pg.evaluate("window._saves")}, ждали 1')
    pg.evaluate("camShow(CAM.clips[CAM.clips.length - 1])"); pg.wait_for_timeout(500)
    if pg.evaluate('window._saves') != 1: fails.append('повторный просмотр сохранил видео в Фото второй раз')
    pg.evaluate("closeSheet(); delete window.Capacitor; state.settings.cam = false; save()")
    # ошибка камеры не мешает игре стартовать
    pg.goto(URL + '#ball-1'); pg.reload(); pg.wait_for_timeout(500)
    pg.evaluate("state.settings.cam = true; save()"); pg.reload(); pg.wait_for_timeout(1200)
    pg.evaluate("() => { HTMLCanvasElement.prototype.captureStream = () => { throw new Error('сломано') } }")
    pg.click('#blive'); pg.wait_for_timeout(1500)
    if not pg.evaluate("B.mode === 'live' && !camRecording() && document.querySelector('#blive').textContent.includes('Остановить') && B.raf > 0"): fails.append('ошибка камеры не дала запустить игру')
    pg.evaluate('ballFinish(false)'); pg.reload(); pg.wait_for_timeout(500); errs.clear()
    pg.evaluate("state.settings.cam = false; save()")
    # камера в упражнениях: распевка, «Голос и речь», упражнение с записью, замер диапазона
    pg.evaluate("state.settings.cam = true; state.settings.wuMode = 'along'; window.WU_SPEED = 40; window.VS_SPEED = 60; save()")
    def clips(): return pg.evaluate("CAM.clips.length ? CAM.clips[CAM.clips.length - 1].url : ''")
    def checked(name, before):
        pg.wait_for_function("(b) => CAM.clips.length && CAM.clips[CAM.clips.length - 1].url !== b", arg=before, timeout=60000)
        r = pg.evaluate(CHECK); pg.evaluate("closeSheet()")
        if not r or (r['w'], r['h']) != (720, 1280) or not (1 < r['dur'] < 120): fails.append(f'{name}: видео {r}')
    n0 = clips(); pg.goto(URL + '#warmup'); pg.reload(); pg.evaluate('window.WU_SPEED = 40'); pg.wait_for_timeout(1200); pg.click('#wuplay')
    pg.wait_for_function("document.body.innerText.includes('Распевка сделана')", timeout=60000); checked('распевка', n0)
    n0 = clips(); pg.goto(URL + '#voice-relax'); pg.reload(); pg.evaluate('window.VS_SPEED = 60'); pg.wait_for_timeout(1200)
    for _ in range(20):
        if pg.evaluate("VS.i >= VS.set.steps.length"): break
        i0 = pg.evaluate("VS.i"); pg.click('#vsplay'); pg.wait_for_function(f"VS.i !== {i0}", timeout=20000)
    checked('голос и речь', n0)
    exid = pg.evaluate("EXERCISES.find(e => e.kind === 'sing').id")
    n0 = clips(); pg.goto(URL + '#ex-' + exid); pg.reload(); pg.wait_for_timeout(1200)
    pg.click('text=Записать с микрофона'); pg.wait_for_timeout(4000); pg.click('text=Остановить'); checked('упражнение с записью', n0)
    n0 = clips(); pg.goto(URL + '#range'); pg.reload(); pg.wait_for_timeout(1200); pg.click('text=Начать замер'); pg.wait_for_timeout(1500)
    # поток камеры остановился посреди записи: камеру не переоткрываем (на iPhone это сбивало микрофон), запись идёт, в отчёте отмечено
    pg.evaluate("CAM.stream.getVideoTracks().forEach(t => t.stop())"); pg.wait_for_timeout(4500)
    r = pg.evaluate("({ rec: camRecording(), ev: CAM.rec.d.ev.join(' | '), mic: RG.stream.getAudioTracks().every(t => t.readyState === 'live') })")
    if not (r['rec'] and r['mic'] and 'камер' in r['ev']): fails.append(f'замер: после остановки камеры {r}')
    # кадры анимации перестали приходить: видео всё равно рисуется (по таймеру)
    pg.evaluate("window._raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0; window._d0 = CAM.rec.drawAt"); pg.wait_for_timeout(1000)
    if not pg.evaluate("CAM.rec.drawAt - window._d0 > 700"): fails.append('замер: без кадров анимации видео перестало рисоваться')
    pg.evaluate("() => { window.requestAnimationFrame = window._raf }"); pg.wait_for_timeout(500)
    pg.click('text=Готово'); pg.wait_for_function("(b) => CAM.clips.length && CAM.clips[CAM.clips.length - 1].url !== b", arg=n0, timeout=20000)
    if 'Для отладки' not in pg.inner_text('#sheet'): fails.append('замер: в окне видео нет отчёта для отладки')
    checked('замер диапазона', n0)
    pg.evaluate("state.settings.cam = false; save()")
    pg.goto(URL + '#today'); pg.wait_for_timeout(300)
    if pg.evaluate("!!CAM.stream || !!document.getElementById('campv')"): fails.append('камера не выключилась при уходе с уровня')
    if errs: fails.append('ошибки: ' + '; '.join(errs))
    br.close()
print('\n'.join(fails) if fails else 'OK: видео уровня пишется в обеих играх (9:16, со звуком и итогом)')
sys.exit(1 if fails else 0)

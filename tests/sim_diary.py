#!/usr/bin/env python3
"""Голос: до и после - метрики речи (speechStats), запись двух видео, хранение в IndexedDB и видео сравнения.
Запуск: python3 tests/sim_diary.py  (нужен playwright и Chrome; путь к Chrome: env CHROME)"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'index.html')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
WAV = os.path.join(ROOT, 'tests', 'out', 'sing.wav')
fails = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME, args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={WAV}', '--autoplay-policy=no-user-gesture-required'])
    pg = br.new_page(bypass_csp=True, viewport={'width': 390, 'height': 844}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#today'); pg.wait_for_timeout(300)
    # метрики: мало речи -> null; речь вокруг A2 с интонацией ±3 полутона
    st = pg.evaluate("[speechStats(Array(100).fill(45)), speechStats(Array.from({length: 600}, (_, i) => i % 5 === 0 ? null : 45 + 3 * Math.sin(i / 9)))]")
    if st[0] is not None: fails.append(f'speechStats посчитал по 100 кадрам: {st[0]}')
    s = st[1] or {}
    if not s or abs(s['med'] - 45) > .5 or not (4 <= s['p90'] - s['p10'] <= 6.5): fails.append(f'speechStats: {s}')
    if 'Запиши голос «до»' not in pg.inner_text('body'): fails.append('на «Сегодня» нет приглашения записать «до»')
    pg.evaluate("state.diary = []; save()")
    for k in range(2):
        pg.goto(URL + '#diary'); pg.reload(); pg.wait_for_timeout(400)
        pg.click('text=Записать видео'); pg.wait_for_timeout(2500)
        if k == 0:
            q0 = pg.inner_text('#dyq'); pg.click('text=Следующий вопрос'); pg.wait_for_timeout(300)
            if pg.inner_text('#dyq') == q0 or pg.evaluate("DY.q") != 1: fails.append('вопрос не переключился')
        pg.wait_for_timeout(2000); pg.click('text=Готово'); pg.wait_for_timeout(2500)
        pg.evaluate("closeSheet()")
        if k == 0: pg.evaluate("state.diary[0].date = '2026-10-13T10:00:00'; save()")
    d = pg.evaluate("state.diary")
    if len(d) != 2 or not all(x.get('stats') for x in d): fails.append(f'записи дневника: {d}')
    ok = pg.evaluate("Promise.all(state.diary.map(x => vidGet(x.id))).then(bs => bs.map(b => b ? b.size : 0))")
    if not all(x > 10000 for x in ok): fails.append(f'видео не сохранились в IndexedDB: {ok}')
    pg.goto(URL + '#today'); pg.reload(); pg.wait_for_timeout(300)
    if 'запиши голос «после»' in pg.inner_text('body').lower(): fails.append('напоминание «после» показано, хотя последнее видео сегодня')
    pg.goto(URL + '#diary'); pg.reload(); pg.wait_for_timeout(400)
    if 'Сравнение' not in pg.inner_text('body'): fails.append('нет блока сравнения')
    pg.click('text=Собрать видео'); pg.wait_for_function("document.querySelector('#sheet video')", timeout=40000)
    r = pg.evaluate("""async () => { const c = CAM.clips[CAM.clips.length - 1]; const v = document.createElement('video'); v.src = c.url; await new Promise(r => { v.onloadedmetadata = r; setTimeout(r, 3000); }); return [c.title, v.videoWidth, v.videoHeight, v.duration]; }""")
    if r[0] != 'До и после' or (r[1], r[2]) != (720, 1280) or not r[3] > 6: fails.append(f'видео сравнения: {r}')
    # напоминание через месяц
    pg.evaluate("state.diary.forEach(x => x.date = '2026-09-01T10:00:00'); save()"); pg.goto(URL + '#today'); pg.reload(); pg.wait_for_timeout(300)
    if 'Прошёл месяц' not in pg.inner_text('body'): fails.append('нет напоминания «Прошёл месяц»')
    if errs: fails.append('ошибки: ' + '; '.join(errs))
    br.close()
print('\n'.join(fails) if fails else 'OK: до и после - метрики, хранение, видео сравнения, напоминание')
sys.exit(1 if fails else 0)

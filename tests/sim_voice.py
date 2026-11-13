#!/usr/bin/env python3
"""Голос и речь: секундомер замеров (phonStep) честный, все комплексы проходятся до конца и сохраняются.
Запуск: python3 tests/sim_voice.py  (нужен playwright и Chrome; путь к Chrome: env CHROME)"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'index.html')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
# сценарий: [[звучит?, длительность с], ...] -> секунды замера
PH = """(parts => { const P = { start: null, last: 0, sec: 0, done: false }; let t = 0;
  for (const [a, d] of parts) { const end = t + d; for (; t < end; t += 1/60) phonStep(P, t, a); }
  return [Math.round(P.sec * 10) / 10, P.done]; })"""
CASES = [('ровный звук 10 с', [[0, 1], [1, 10], [0, 1]], 10, True), ('короткие провалы до 0.4 с не обрывают', [[1, 4], [0, .4], [1, 4], [0, 1]], 8.4, True),
         ('пауза 1 с обрывает', [[1, 3], [0, 1], [1, 5]], 3, True), ('тишина', [[0, 5]], 0, False)]
fails = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME); pg = br.new_page(viewport={'width': 390, 'height': 844})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#voice'); pg.wait_for_timeout(300)
    for name, parts, sec, done in CASES:
        r = pg.evaluate(PH, parts)
        if abs(r[0] - sec) > .1 or r[1] != done: fails.append(f'секундомер «{name}»: {r}, ждали {sec} с, done={done}')
    bad = pg.evaluate("VOICE_SETS.flatMap(s => s.steps.filter(x => !x.t || !x.how || /[—]/.test(x.t + x.how) || !(stepSec(x) > 0)).map(x => s.id + ': ' + x.t))")
    if bad: fails.append(f'пустые шаги или длинные тире: {bad}')
    # полный проход каждого комплекса на ускорении (замеры пропускаем кнопкой «Дальше»)
    pg.evaluate("window.VS_SPEED = 60; state.voice = { done: [], rec: { mpt: [], exhale: [] } }; save()")
    for sid in pg.evaluate("VOICE_SETS.map(s => s.id)"):
        pg.goto(f'{URL}#voice-{sid}'); pg.wait_for_timeout(200)
        for guard in range(60):
            st = pg.evaluate("VS && VS.i < VS.set.steps.length ? VS.set.steps[VS.i].kind || 'timer' : 'end'")
            if st == 'end': break
            i0 = pg.evaluate("VS.i")
            if st in ('mpt', 'exhale'): pg.click('text=Дальше')
            else: pg.click('#vsplay')
            if st != 'text':
                try: pg.wait_for_function(f"VS.i !== {i0}", timeout=15000)
                except Exception: fails.append(f'{sid}: шаг {i0} ({st}) не закончился сам'); pg.click('text=Дальше')
        if 'сделан' not in pg.inner_text('#vsbox'): fails.append(f'{sid}: нет экрана «сделан»')
    n = pg.evaluate("state.voice.done.length")
    total = pg.evaluate('VOICE_SETS.length')
    if n != total: fails.append(f'сохранено комплексов: {n}, ждали {total}')
    pg.goto(URL + '#today'); pg.wait_for_timeout(300)
    if 'Голос и речь: сделано' not in pg.inner_text('body'): fails.append('на «Сегодня» нет отметки «Голос и речь: сделано»')
    if errs: fails.append('ошибки: ' + '; '.join(errs))
    br.close()
print('\n'.join(fails) if fails else 'OK: «Голос и речь» - замеры честные, все комплексы проходятся')
sys.exit(1 if fails else 0)

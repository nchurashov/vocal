#!/usr/bin/env python3
"""Дымовой тест интерфейса: упражнения (квиз, запись с фейкового микрофона, ритм), сохранение в историю.
Перед запуском: node tests/synth.js (создаёт tests/out/sing.wav). Запуск: python3 tests/smoke_ui.py"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'index.html'); WAV = os.path.join(ROOT, 'tests', 'out', 'sing.wav')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
errs, bad = [], []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={WAV}', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 390, 'height': 844})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#today'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(300)
    for ex in ['h1', 'p1', 'r1']:
        pg.goto(f'{URL}#ex-{ex}'); pg.wait_for_timeout(300); pg.click('text=Послушать пример')
        if ex == 'h1':
            pg.click('text=Начать'); pg.click('.answers button >> nth=0'); pg.click('text=Дальше')
            if not pg.locator('text=Вопрос 2 из 10').count(): bad.append('квиз не перешёл ко 2 вопросу')
        if ex == 'p1':
            pg.click('text=Записать с микрофона'); pg.wait_for_timeout(3500); pg.click('text=Остановить'); pg.wait_for_timeout(2500)
            if '%' not in pg.locator('#practice').inner_text(): bad.append('запись не дала результата')
        if ex == 'r1':
            pg.click('text=Начать проверку'); pg.wait_for_timeout(400)
        pg.locator('.rate button >> nth=0').click(); pg.click('text=Сохранить занятие'); pg.wait_for_timeout(300)
        # после «Уверенно» не выкидывает на «Сегодня», а предлагает следующее упражнение того же раздела
        if '✓ Пройдено' not in pg.locator('#sheet').inner_text(): bad.append(f'{ex}: нет окна «Пройдено» после сохранения')
        nxt = pg.evaluate("(() => { const b = [...document.querySelectorAll('#sheet [data-action]')].find(b => b.textContent.includes('Дальше')); return b && JSON.parse(b.dataset.args || '[]')[0]; })()")
        if ex == 'h1':
            pg.locator('#sheet button', has_text='Дальше').click(); pg.wait_for_timeout(300)
            if pg.locator('#sheet').count() or not pg.url.endswith('#' + str(nxt)) or nxt == 'ex-h1': bad.append(f'«Дальше» не открыло следующее упражнение: {pg.url} / {nxt}')
            if pg.evaluate("location.hash") == '#ex-h1': bad.append('«Дальше» осталось на том же упражнении')
        else: pg.locator('#sheet button', has_text='Сегодня').click(); pg.wait_for_timeout(300)
    # «Не вышло»: окно предлагает «Ещё раз» первым, упражнение не помечается пройденным
    pg.goto(f'{URL}#ex-r2'); pg.wait_for_timeout(300)
    pg.locator('.rate button >> nth=2').click(); pg.click('text=Сохранить занятие'); pg.wait_for_timeout(300)
    if '✓ Пройдено' in pg.locator('#sheet').inner_text(): bad.append('«Не вышло» показало «Пройдено»')
    pg.locator('#sheet .btn.block >> nth=0').click(); pg.wait_for_timeout(300)
    if pg.locator('#sheet').count() or pg.evaluate('location.hash') != '#ex-r2' or not pg.locator('#savebtn').count(): bad.append('«Ещё раз» не открыло упражнение заново')
    pg.locator('.rate button >> nth=2').click(); pg.click('text=Сохранить занятие'); pg.wait_for_timeout(300)
    pg.evaluate("location.hash = 'exercises'"); pg.wait_for_timeout(300)  # ушли жестом «Назад»/по ссылке - окошко не должно висеть
    if pg.locator('#sheet').count(): bad.append('окно после сохранения осталось на другом экране')
    if pg.locator('.dot.done').count() != 3: bad.append(f'галочек «Пройдено» не 3: {pg.locator(".dot.done").count()}')
    if 'Пройдено 3 из' not in pg.inner_text('main' if pg.locator('main').count() else 'body'): bad.append('нет счётчика «Пройдено 3 из N»')
    pg.goto(URL + '#history'); pg.wait_for_timeout(300)
    if pg.locator('.item').count() != 5: bad.append('в истории не 5 занятий')
    # текст шагов называет те же ноты, что подписаны на графике примера (база не До - не «до, ре, до»)
    pg.evaluate("(() => { const s = JSON.parse(localStorage.getItem('vocal-practice')); s.settings.base = 46; localStorage.setItem('vocal-practice', JSON.stringify(s)); })()")
    for ex in ['p2', 'p4']:
        pg.goto(f'{URL}#{ex}'); pg.reload(); pg.goto(f'{URL}#ex-{ex}'); pg.wait_for_timeout(300)
        step = pg.inner_text('.steps li >> nth=0').lower()
        labels = pg.evaluate("[...document.querySelectorAll('svg.roll text')].map(t => t.textContent.toLowerCase()).join(', ')")
        if '{' in step or labels not in step: bad.append(f'{ex}: в шагах не те ноты, что в примере: «{step}» / {labels}')
    for r in ['ball', 'ball-1', 'game', 'game-1', 'check', 'notes', 'exercises']:
        pg.goto(f'{URL}#{r}'); pg.wait_for_timeout(200)
    b.close()
print('\n'.join(bad + errs) or 'OK: интерфейс без ошибок')
sys.exit(1 if bad or errs else 0)

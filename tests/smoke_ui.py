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
    pg.goto(URL + '#history'); pg.wait_for_timeout(300)
    if pg.locator('.item').count() != 3: bad.append('в истории не 3 занятия')
    for r in ['ball', 'ball-1', 'game', 'game-1', 'check', 'notes', 'exercises']:
        pg.goto(f'{URL}#{r}'); pg.wait_for_timeout(200)
    b.close()
print('\n'.join(bad + errs) or 'OK: интерфейс без ошибок')
sys.exit(1 if bad or errs else 0)

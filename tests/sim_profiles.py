#!/usr/bin/env python3
"""Профили «Кто поёт?»: у каждого свой прогресс, переключение, имя, сохранение после перезагрузки, удаление.
Старые данные (ключ 'vocal-practice') становятся первым профилем.
Запуск: python3 tests/sim_profiles.py  (нужен playwright и Chrome; путь к Chrome: env CHROME)"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'index.html')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
fails = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME); pg = br.new_page(bypass_csp=True, viewport={'width': 390, 'height': 844})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#today'); pg.evaluate("localStorage.clear()")
    # старые данные без профилей
    pg.evaluate("localStorage.setItem('vocal-practice', JSON.stringify({ v: 1, settings: { base: 43, latency: 0 }, sessions: [], srs: {}, notes: [], game: { best: {}, plays: [] }, ball: { best: { 1: { pct: 100, stars: 3, tol: 40 } }, plays: [] } }))")
    pg.reload(); pg.wait_for_timeout(300)
    if pg.evaluate("[base(), (state.ballOld || state.ball).best[1] && (state.ballOld || state.ball).best[1].stars]") != [43, 3]: fails.append('старые данные не открылись в первом профиле')
    if 'Как тебя зовут?' not in pg.inner_text('body'): fails.append('нет вопроса про имя')
    pg.fill('#tdname', 'Кит'); pg.click('text=Готово'); pg.wait_for_timeout(200)
    if pg.inner_text('#who').strip() != '🎤 Кит': fails.append(f'в шапке не имя: {pg.inner_text("#who")}')
    # новый профиль
    pg.click('#who'); pg.fill('#pfnew', 'Аня'); pg.click('#sheet >> text=Добавить'); pg.wait_for_timeout(300)
    if pg.evaluate("[profName(), base(), !!(state.ballOld || state.ball).best[1]]") != ['Аня', 48, False]: fails.append(f'новый профиль не чистый')
    pg.evaluate("state.settings.base = 60; save()")
    pg.reload(); pg.wait_for_timeout(300)
    if pg.evaluate("[profName(), base()]") != ['Аня', 60]: fails.append('после перезагрузки потерялся профиль Ани')
    # обратно к Киту
    pg.click('#who'); pg.click('#sheet >> text=Кит'); pg.wait_for_timeout(300)
    if pg.evaluate("[profName(), base(), (state.ballOld || state.ball).best[1].stars]") != ['Кит', 43, 3]: fails.append('данные Кита смешались с Аней')
    if pg.evaluate("localStorage.getItem('vocal-practice') && JSON.parse(localStorage.getItem('vocal-practice')).settings.base") != 43: fails.append('первый профиль не на старом ключе')
    # удаление Ани
    pg.on('dialog', lambda d: d.accept())
    aid = pg.evaluate("PROF.list.find(p => p.name === 'Аня').id")
    pg.evaluate(f"profDel('{aid}')"); pg.wait_for_timeout(300)
    if pg.evaluate("[PROF.list.length, localStorage.getItem(profKey('" + aid + "'))]") != [1, None]: fails.append('профиль Ани не удалился')
    if errs: fails.append('ошибки: ' + '; '.join(errs))
    br.close()
print('\n'.join(fails) if fails else 'OK: профили - у каждого свой прогресс, имя, переключение, удаление')
sys.exit(1 if fails else 0)

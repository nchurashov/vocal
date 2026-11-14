#!/usr/bin/env python3
"""Путь «С нуля» на «Сегодня»: шаги отмечаются только по настоящим данным (замер, звёзды «Шарика», распевка, песня),
следующий шаг ведёт на нужный экран, «С пианино» открывает песню в этом режиме, путь можно скрыть и вернуть.
Запуск: python3 tests/sim_path.py  (нужен playwright и Chrome; путь к Chrome: env CHROME)"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'index.html')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
fails = []
def card(pg): return pg.inner_text('.card:has-text("Путь с нуля")') if pg.query_selector('.card:has-text("Путь с нуля")') else ''
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME)
    pg = br.new_page(bypass_csp=True, viewport={'width': 390, 'height': 844})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('https://fonts.*/**', lambda r: r.abort())
    pg.goto(URL + '#today'); pg.wait_for_timeout(300)
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(300)
    c = card(pg)
    if 'Сделано 0 из 8' not in c or 'Замерь свой диапазон' not in c: fails.append('новичок: первый шаг не «Замерь диапазон»: ' + c[:150])
    pg.click('.card:has-text("Путь с нуля") .item'); pg.wait_for_timeout(300)
    if pg.evaluate('location.hash') != '#range': fails.append('шаг 1 не ведёт на замер')
    # каждый шаг - только по данным
    steps = [
        ("state.range = [{date: '2026-11-01T10:00:00', lo: 45, hi: 67}]", 'Шарик: повтори одну ноту', '#ball-1'),
        ("ballState().best[1] = {stars: 2}; ballState().best[2] = {stars: 3}", 'Шарик: повтори одну ноту', '#ball-3'),
        ("ballState().best[3] = {stars: 2}", 'Распевка', '#warmup'),
        ("state.warmups = [{date: '2026-11-02T10:00:00', steps: 6}]", 'Первая песня вместе с пианино', '#karaoke-b-twinkle'),
        ("state.songs = {'b-twinkle': {ph: {}, along: 2}}", 'Шарик: вся глава', '#ball-4'),
        ("for (let n = 4; n <= 9; n++) ballState().best[n] = {stars: 2}; ballState().best[10] = {stars: 2}", 'Шарик: вся глава', '#ball-10'),  # экзамен - только 3 звезды
        ("ballState().best[10] = {stars: 3}", 'шаг на соседнюю ноту', '#ball-11'),
        ("for (let n = 11; n <= 13; n++) ballState().best[n] = {stars: 2}", 'в Шарике: по фразе', '#sball-b-twinkle-1'),
        ("state.songs['b-twinkle'].ball = {1: {stars: 2}, 2: {stars: 3}}", 'в Шарике: по фразе', '#sball-b-twinkle-3'),
        ("state.songs['b-twinkle'].ph = {0: 90, 1: 85, 2: 80, 3: 100, 4: 95, 5: 80}", 'в Шарике: по фразе', '#sball-b-twinkle-3'),  # караоке не засчитывает фразы «Шарика»
        ("for (let n = 3; n <= 6; n++) state.songs['b-twinkle'].ball[n] = {stars: 2}", 'по памяти', '#sball-b-twinkle-7'),
        ("for (let n = 7; n <= 9; n++) state.songs['b-twinkle'].ball[n] = {stars: 2}", 'по памяти', '#sball-b-twinkle-10'),
    ]
    for i, (js, want, hash) in enumerate(steps):
        pg.goto(URL + '#today'); pg.wait_for_timeout(150)
        pg.evaluate(js + "; save()"); pg.evaluate("render()"); pg.wait_for_timeout(150)
        c = card(pg)
        if want not in c: fails.append(f'после «{js[:50]}» следующий шаг не «{want}»: ' + c[:160]); continue
        pg.click('.card:has-text("Путь с нуля") .item'); pg.wait_for_timeout(300)
        if pg.evaluate('location.hash') != hash: fails.append(f'шаг «{want}» ведёт на {pg.evaluate("location.hash")}, а не {hash}')
        if want == 'Первая песня вместе с пианино' and pg.evaluate("SG.mode") != 'along': fails.append('песня открылась не в режиме «С пианино»')
    # вся песня на 1 звезду - ещё нет, на 2 - путь пройден
    pg.goto(URL + '#today'); pg.wait_for_timeout(150)
    pg.evaluate("state.songs['b-twinkle'].ball[10] = {stars: 1}; save(); render()"); pg.wait_for_timeout(150)
    if 'Сделано 7 из 8' not in card(pg): fails.append('вся песня на 1★ засчитана как пройдено: ' + card(pg)[:100])
    pg.evaluate("state.songs['b-twinkle'].ball[10] = {stars: 2}; save(); render()"); pg.wait_for_timeout(150)
    if 'пройден' not in card(pg): fails.append('после всех шагов нет «Путь пройден»')
    # весь путь в окошке, скрыть и вернуть
    pg.evaluate("state.songs['b-twinkle'].ball[10] = {stars: 0}; save(); render()"); pg.wait_for_timeout(150)
    pg.click('text=Весь путь'); pg.wait_for_timeout(200)
    if pg.evaluate("document.querySelectorAll('#sheet .item').length") != 8: fails.append('в «Весь путь» не 8 шагов')
    pg.click('text=Я уже пою'); pg.wait_for_timeout(200)
    if card(pg) or not pg.evaluate("state.settings.pathHide"): fails.append('путь не скрылся')
    pg.click('text=Показать путь'); pg.wait_for_timeout(200)
    if 'Путь с нуля' not in card(pg): fails.append('путь не вернулся')
    # у другого профиля свой путь (пустой)
    pg.evaluate("localStorage.setItem('vocal-practice:p2', JSON.stringify({})); localStorage.setItem('vocal-profiles', JSON.stringify({cur: 'p2', list: [{id: 'p1', name: 'А'}, {id: 'p2', name: 'Б'}]}))")
    pg.reload(); pg.wait_for_timeout(300)
    if pg.evaluate("profName()") == 'Б' and 'Сделано 0 из 8' not in card(pg): fails.append('у нового профиля путь не с нуля: ' + card(pg)[:100])
    if errs: fails.append('ошибки на странице: ' + '; '.join(errs[:5]))
    br.close()
print('\n'.join(fails) if fails else 'OK: путь «С нуля» - шаги только по данным, ведут на нужные экраны, скрывается')
sys.exit(1 if fails else 0)

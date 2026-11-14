#!/usr/bin/env python3
"""Песня в «Шарике»: честность на всех заданиях встроенных песен и своей песни из караоке-файла
(живые певцы проходят, фальшь и молчание - нет), задания по порядку, прогресс, пианино перед фразой не засчитывается.
Нужен tests/out/test.kar (node tests/test_songs.js). Запуск: python3 tests/sim_songball.py (нужен playwright и Chrome; env CHROME)"""
import os, sys, json
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'index.html')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sim_ball_sim import SIM  # тот же имитатор голоса, что в sim_ball
FAIR = {'вовремя': [.12, .08, .15, 0, -99, 0], 'опоздание 0.2с': [.2, .12, .2, 0, -99, 0], 'раньше 0.1с': [-.1, .08, .15, 0, -99, 0],
        'октавой выше': [.12, .08, .15, 12, -99, 0], 'октавой ниже, динамик слышен': [.12, .08, .15, -12, -99, 0, 1]}
fails = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME); pg = br.new_page(bypass_csp=True, viewport={'width': 390, 'height': 844})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('https://fonts.*/**', lambda r: r.abort())
    pg.goto(URL + '#songs'); pg.wait_for_timeout(300)
    pg.evaluate("localStorage.removeItem('vocal-songs'); state.songs = {}; save()")
    # своя песня из караоке-файла (в ней слоги)
    pg.set_input_files('input[accept^=".mid"]', os.path.join(ROOT, 'tests', 'out', 'test.kar')); pg.wait_for_timeout(500)
    pg.click('#sgadd button:has-text("Сохранить")'); pg.wait_for_timeout(400)
    kid = pg.evaluate("location.hash.slice(6)")
    if not pg.evaluate(f"!!songById('{kid}')"): fails.append('после сохранения не открылись задания своей песни: ' + kid)
    songs = ['b-twinkle', 'b-ode', kid]
    tot = {s: pg.evaluate(f"songLevels(songById('{s}')).length") for s in songs}
    if tot['b-twinkle'] != 10 or tot['b-ode'] != 7: fails.append(f'число заданий: {tot}')
    # все задания открыты, честность на ±40 и ±20
    for tol in [40, 20]:
        pg.evaluate(f"state.settings.tol = {tol}; for (const id of {json.dumps(songs)}) {{ const L = songLevels(songById(id)); state.songs[id] = {{ ph: {{}}, ball: Object.fromEntries(L.map(l => [l.n, {{ stars: 3, pct: 100 }}])) }}; }} save()")
        for s in songs:
            for n in range(1, tot[s] + 1):
                pg.goto(f'{URL}#sball-{s}-{n}'); pg.wait_for_timeout(80)
                if not pg.evaluate("!!(B && B.lv && B.lv.song)"): fails.append(f'{s} №{n}: задание не открылось'); continue
                for name, a in FAIR.items():
                    r = pg.evaluate(SIM, a)
                    if 'X' in r: fails.append(f'±{tol} {s} №{n} {name}: {r} (честный певец разбился)')
                r = pg.evaluate(SIM, [.12, .08, .1, .7, -99, 0])
                if r.count('X') < len(r) * .7: fails.append(f'±{tol} {s} №{n} фальшь 0.7 полутона прошла: {r}')
                r = pg.evaluate(SIM, [99, .08, 0, 0, -99, 0])
                if 'P' in r: fails.append(f'±{tol} {s} №{n}: молчание пролетело стены: {r}')
    pg.evaluate("state.settings.tol = 40; save()")
    # подсказка: фраза звучит до отсчёта, и в это время голос не засчитывается
    pg.goto(URL + '#sball-b-twinkle-1'); pg.wait_for_timeout(150)
    pre = pg.evaluate("(() => { const t0 = ballCountIn(); const left = t0 - ac().currentTime; stopAll(); return [B.pre, left]; })()")
    if pre[0] is None or pre[0] > -6 or pre[1] < 11: fails.append(f'фраза с подсказкой: пианино не играет фразу до отсчёта {pre}')
    pg.goto(URL + '#sball-b-twinkle-7'); pg.wait_for_timeout(150)
    if pg.evaluate("(() => { ballCountIn(); stopAll(); return B.pre; })()") is not None: fails.append('по памяти: пианино не должно играть фразу')
    # слоги караоке - на стенах
    pg.goto(f'{URL}#sball-{kid}-1'); pg.wait_for_timeout(150)
    if not pg.evaluate("B.walls.some(w => w.word)"): fails.append('слоги песни не дошли до стен')
    # прогресс и порядок: с нуля открыто только первое; 2 звезды открывают следующее
    pg.evaluate("state.songs = {}; save()")
    pg.goto(URL + '#song-b-twinkle'); pg.wait_for_timeout(200)
    if pg.evaluate("document.querySelectorAll('.gtile:not(.locked)').length") != 1: fails.append('с нуля открыто не одно задание')
    pg.goto(URL + '#sball-b-twinkle-2'); pg.wait_for_timeout(150)
    if '🔒' not in pg.inner_text('body'): fails.append('закрытое задание открылось по ссылке')
    pg.goto(URL + '#sball-b-twinkle-1'); pg.wait_for_timeout(150)
    r = pg.evaluate(SIM, [.12, .08, .15, 0, -99, 0]); pg.evaluate("ballResult('live')")
    b = pg.evaluate("state.songs['b-twinkle'].ball[1]")
    if not b or b['stars'] != 3: fails.append(f'результат не сохранился: {b}')
    if 'Задание 2 открыто' not in pg.inner_text('#bres'): fails.append('нет «Задание 2 открыто»: ' + pg.inner_text('#bres')[:200])
    if pg.evaluate("Object.keys(state.ball.best || {}).length"): fails.append('песня записалась в рекорды обычного «Шарика»')
    pg.goto(URL + '#sball-b-twinkle-2'); pg.wait_for_timeout(150)
    pg.evaluate(SIM, [.12, .08, .1, .7, -99, 0]); pg.evaluate("ballResult('live')")
    if pg.evaluate("sbUnlocked('b-twinkle', 3)"): fails.append('фальшь открыла следующее задание')
    pg.goto(URL + '#songs'); pg.wait_for_timeout(200)
    if 'пройдено 1 из 10' not in pg.inner_text('body'): fails.append('в списке песен нет «пройдено 1 из 10»')
    pg.goto(URL + '#ball'); pg.wait_for_timeout(200)
    if 'Песни в «Шарике»' not in pg.inner_text('body'): fails.append('на экране «Шарика» нет песен')
    pg.goto(URL + '#song-b-twinkle'); pg.wait_for_timeout(200); pg.click('text=Караоке'); pg.wait_for_timeout(300)
    if pg.evaluate("location.hash") != '#karaoke-b-twinkle': fails.append('кнопка «Караоке» не ведёт в караоке')
    if errs: fails.append('ошибки на странице: ' + '; '.join(errs[:5]))
    br.close()
print('\n'.join(fails) if fails else 'OK: песни в «Шарике» честные на всех заданиях, задания по порядку, подсказка не засчитывается')
sys.exit(1 if fails else 0)

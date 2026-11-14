#!/usr/bin/env python3
"""Теория (#learn): все уроки и страницы интервалов открываются без ошибок под строгой CSP,
кнопки со звуком играют, цифры посчитаны верно (интервалы на белых клавишах, центы), квиз работает,
из глав «Шарика» есть ссылка на теорию.
Запуск: python3 tests/sim_learn.py  (нужен playwright и Chrome; путь к Chrome: env CHROME)"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'index.html')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
LESSONS = ['notes', 'sound', 'intervals', 'origin', 'scale', 'voice', 'method']
fails, errs = [], []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME, args=['--autoplay-policy=no-user-gesture-required'])
    # 1. интерфейс со строгой CSP: всё открывается, кнопки звука нажимаются без ошибок
    pg = br.new_page(viewport={'width': 390, 'height': 844})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'warning' and 'нет действия' in m.text else None)
    pg.goto(URL + '#learn'); pg.wait_for_timeout(300)
    if pg.locator('.ivtile').count() != 13: fails.append('на странице теории не 13 интервалов')
    if pg.locator('#view .item').count() != len(LESSONS): fails.append('в списке не все уроки')
    for l in LESSONS:
        pg.goto(f'{URL}#learn-{l}'); pg.wait_for_timeout(150)
        if 'Урок' not in pg.locator('#view').inner_text(): fails.append(f'урок {l} не открылся')
        for k in range(pg.locator('.lp').count()):
            pg.locator('.lp').nth(k).click()
        pg.wait_for_timeout(100)
    for s in range(13):
        pg.goto(f'{URL}#learn-iv-{s}'); pg.wait_for_timeout(120)
        t = pg.locator('#view').inner_text()
        if 'Как спеть' not in t: fails.append(f'интервал {s} не открылся')
        for k in range(pg.locator('.lp').count()):
            pg.locator('.lp').nth(k).click()
    pg.goto(URL + '#learn-iv-13'); pg.wait_for_timeout(120)
    if 'Сегодня' not in pg.locator('#tabs').inner_text() or pg.locator('text=Как спеть').count(): fails.append('несуществующий интервал не ушёл на главную')
    # квиз: 3 вопроса, ответ подсвечивается, счёт растёт
    pg.goto(URL + '#learn-intervals'); pg.wait_for_timeout(150)
    pg.click('#lq >> text=Начать')
    for q in range(3):
        if pg.locator('#lq .answers button').count() != 4: fails.append('в квизе не 4 варианта'); break
        pg.locator('#lq .answers button').nth(0).click()
        if not pg.locator('#lq .answers .right').count(): fails.append('квиз не показал верный ответ')
        pg.click('#lq >> text=Дальше')
    if 'Вопрос 4' not in pg.locator('#lq').inner_text(): fails.append('квиз не дошёл до 4 вопроса')
    # клавиатура в уроке про ноты звучит и подписывает ноту
    pg.goto(URL + '#learn-notes'); pg.wait_for_timeout(150)
    pg.locator('#pklearn [data-m="60"]').click()
    if 'C4' not in pg.locator('#pkname').inner_text(): fails.append('клавиша C4 не подписалась')
    # из «Шарика» есть ссылки на теорию: в списке глав и на экране задания
    pg.goto(URL + '#ball'); pg.wait_for_timeout(200)
    if not pg.locator('a[href^="#learn-"]').count(): fails.append('в главах «Шарика» нет ссылки на теорию')
    pg.goto(URL + '#ball-11'); pg.wait_for_timeout(200)
    pg.goto(URL + '#ball-1'); pg.wait_for_timeout(200)
    if not pg.locator('a[href="#learn-iv-0"]').count(): fails.append('в задании «Одна нота» нет ссылки на приму')
    # 2. логика и цифры (страница без CSP, чтобы читать функции)
    pt = br.new_page(bypass_csp=True)
    pt.goto(URL + '#learn'); pt.wait_for_timeout(200)
    chk = pt.evaluate("""() => ({
      m3: whitePairs(3), tt: whitePairs(6), b3: whitePairs(4),
      quart: DEG_NAME.map((_, d) => ivShort(3, whiteIv(d, 3))), fifth: DEG_NAME.map((_, d) => ivShort(4, whiteIv(d, 4))),
      third: DEG_NAME.map((_, d) => ivShort(2, whiteIv(d, 2))),
      ks: IV.map(v => v.s).join(','), inv: IV.map(v => IV[12 - v.s].k).join(','),
      p5: Math.round(1200 * Math.log2(IV[7].r[0] / IV[7].r[1])), b3c: Math.round(1200 * Math.log2(IV[4].r[0] / IV[4].r[1])),
      theory: BALL_CHAPTERS.map(C => ballTheory(C)[0]), valid: ['notes', 'iv-0', 'iv-12', 'iv-13', 'iv-x', 'nope'].map(learnValid),
    })""")
    if chk['m3'] != ['ре-фа', 'ми-соль', 'ля-до', 'си-ре']: fails.append(f'малые терции на белых: {chk["m3"]}')
    if chk['tt'] != ['фа-си', 'си-фа']: fails.append(f'тритон на белых: {chk["tt"]}')
    if chk['b3'] != ['до-ми', 'фа-ля', 'соль-си']: fails.append(f'большие терции на белых: {chk["b3"]}')
    if chk['third'] != ['б3', 'м3', 'м3', 'б3', 'б3', 'м3', 'м3']: fails.append(f'терции по ступеням: {chk["third"]}')
    if chk['quart'] != ['ч4', 'ч4', 'ч4', 'ув4', 'ч4', 'ч4', 'ч4']: fails.append(f'кварты по ступеням: {chk["quart"]}')
    if chk['fifth'] != ['ч5', 'ч5', 'ч5', 'ч5', 'ч5', 'ч5', 'ум5']: fails.append(f'квинты по ступеням: {chk["fifth"]}')
    if chk['ks'] != ','.join(map(str, range(13))): fails.append('интервалы не по порядку полутонов')
    if chk['inv'] != 'ч8,б7,м7,б6,м6,ч5,тт,ч4,б3,м3,б2,м2,ч1': fails.append(f'обращения: {chk["inv"]}')
    if chk['p5'] != 702 or chk['b3c'] != 386: fails.append(f'центы чистого строя: квинта {chk["p5"]}, б. терция {chk["b3c"]}')
    want = ['learn-iv-0', 'learn-iv-2', 'learn-iv-4', 'learn-iv-5', 'learn-iv-7', 'learn-scale', 'learn-scale', 'learn-iv-9', 'learn-intervals', 'learn-iv-12']
    if chk['theory'] != want: fails.append(f'ссылки глав на теорию: {chk["theory"]}')
    if chk['valid'] != [True, True, True, False, False, False]: fails.append(f'проверка адресов: {chk["valid"]}')
    br.close()
print('\n'.join(fails + errs) or 'OK: теория - 7 уроков, 13 интервалов, звук, квиз, цифры и ссылки из «Шарика»')
sys.exit(1 if fails or errs else 0)

#!/usr/bin/env python3
"""Теория (#learn): 10 разделов, по одному к каждой главе «Шарика».
- новый человек видит открытым только 1-й раздел, остальные закрыты (и по прямой ссылке тоже), интервалы - вместе со своим разделом;
- прочитанное запоминается; на «Сегодня» и в главе предлагается новый раздел;
- сдан экзамен главы -> в итоге предложен раздел к новой главе, он открылся;
- «Открыть все разделы» открывает всё; все разделы и интервалы открываются под строгой CSP, кнопки звука играют, квиз только из открытого;
- цифры посчитаны верно (интервалы на белых клавишах, обращения, центы), разделы совпадают с главами.
Запуск: python3 tests/sim_learn.py  (нужен playwright и Chrome; путь к Chrome: env CHROME)"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'index.html')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
IDS = ['note', 'step', 'third', 'fourth', 'fifth', 'scale', 'chord', 'leap', 'melody', 'octave']
SIM = """(() => { ballReset(true); const lv=B.lv, b=60/lv.bpm, ons=[]; let t=0;
  lv.walls.forEach(([s,len,gap])=>{ons.push({s,t0:t,t1:t+len*b}); t+=(len+gap)*b;});
  let now=-1.5; const dt=1/60, h=[];
  while(now < B.D+.6){ let v=null; for(const o of ons) if(now>=o.t0-.18&&now<o.t1+.12){v=o.s;break;}
    h.push(v); ballStep(now, dt, h.length>6?h[h.length-6]:null); now+=dt; }
  ballResult('live'); return B.walls.every(w=>w.passed); })()"""
fails, errs = [], []
def body(pg): return pg.locator('#view').inner_text()
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME, args=['--autoplay-policy=no-user-gesture-required'])
    # 1. строгая CSP: новый человек
    pg = br.new_page(viewport={'width': 390, 'height': 844})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'warning' and 'нет действия' in m.text else None)
    pg.goto(URL + '#today'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(300)
    if 'Нота и унисон' not in body(pg) or 'новое' not in body(pg): fails.append('на «Сегодня» не предложен 1-й раздел теории')
    pg.goto(URL + '#learn'); pg.wait_for_timeout(200)
    if pg.locator('#view button.item').count() != 1 or pg.locator('#view .item.locked').count() != 9: fails.append('новому человеку открыт не ровно 1 раздел из 10')
    if 'Открыто: 1 из 10' not in body(pg): fails.append('счётчик открытых разделов')
    if pg.locator('.ivgrid button.ivtile').count() != 1: fails.append('новому человеку открыт не только интервал «прима»')
    for r in ['learn-step', 'learn-octave', 'learn-iv-7', 'learn-intervals']:
        pg.goto(f'{URL}#{r}'); pg.wait_for_timeout(120)
        if 'пока закрыт' not in body(pg): fails.append(f'{r} открылся без главы')
    pg.goto(URL + '#ball-1'); pg.wait_for_timeout(200)
    if not pg.locator('.thnew').count(): fails.append('в 1-й главе не предложен новый раздел теории')
    pg.goto(URL + '#learn-note'); pg.wait_for_timeout(200)
    if 'Нота и унисон' not in body(pg): fails.append('1-й раздел не открылся')
    pg.locator('#pklearn [data-m="60"]').click()
    if 'C4' not in pg.locator('#pkname').inner_text(): fails.append('клавиша C4 не подписалась')
    if not pg.evaluate("!!state.learn.read.note"): fails.append('прочитанный раздел не запомнился')
    pg.goto(URL + '#ball-1'); pg.wait_for_timeout(200)
    if pg.locator('.thnew').count() or not pg.locator('a[href="#learn-note"]').count(): fails.append('после чтения в главе осталась плашка «новое»')
    pg.goto(URL + '#today'); pg.wait_for_timeout(200)
    if 'Прочитано 1 из 10' not in body(pg): fails.append('на «Сегодня» нет прогресса теории после чтения')
    # 2. сдан экзамен 1-й главы -> раздел 2 предложен в итоге и открыт
    pg.evaluate("state.ball = { v: 3, best: {}, plays: [] }; for (let i = 1; i <= 9; i++) state.ball.best[i] = { pct: 100, stars: 3, tol: 40 }; save()")
    pg.goto(URL + '#ball-10'); pg.wait_for_timeout(300)
    if not pg.evaluate(SIM): fails.append('экзамен 1-й главы не пройден на чистом голосе')
    if 'Шаг: полутон и тон' not in pg.locator('#bres').inner_text(): fails.append('после экзамена не предложен раздел к новой главе')
    pg.locator('#bres .thnew').click(); pg.wait_for_timeout(200)
    if 'Раздел 2 из 10' not in body(pg): fails.append('раздел 2 не открылся после экзамена')
    pg.goto(URL + '#learn'); pg.wait_for_timeout(150)
    if 'Открыто: 2 из 10' not in body(pg): fails.append('после экзамена открыто не 2 раздела')
    # 3. открыть всё: все разделы и интервалы, кнопки звука, квиз
    pg.click('text=Открыть все разделы'); pg.wait_for_timeout(150)
    if pg.locator('#view .item.locked').count() or pg.locator('.ivgrid button.ivtile').count() != 13: fails.append('«Открыть все разделы» открыл не всё')
    for i, sid in enumerate(IDS):
        pg.goto(f'{URL}#learn-{sid}'); pg.wait_for_timeout(120)
        if f'Раздел {i + 1} из 10' not in body(pg): fails.append(f'раздел {sid} не открылся')
        for k in range(pg.locator('.lp').count()): pg.locator('.lp').nth(k).click()
    for s in range(13):
        pg.goto(f'{URL}#learn-iv-{s}'); pg.wait_for_timeout(100)
        if 'Как спеть' not in body(pg): fails.append(f'интервал {s} не открылся')
        for k in range(pg.locator('.lp').count()): pg.locator('.lp').nth(k).click()
    pg.goto(URL + '#learn-iv-13'); pg.wait_for_timeout(120)
    if pg.locator('text=Как спеть').count(): fails.append('несуществующий интервал открылся')
    pg.goto(URL + '#learn-third'); pg.wait_for_timeout(150)
    pg.click('#lq >> text=Начать')
    for q in range(3):
        if pg.locator('#lq .answers button').count() != 4: fails.append('в квизе не 4 варианта'); break
        pg.locator('#lq .answers button').nth(0).click()
        if not pg.locator('#lq .answers .right').count(): fails.append('квиз не показал верный ответ')
        pg.click('#lq >> text=Дальше')
    if 'Вопрос 4' not in pg.locator('#lq').inner_text(): fails.append('квиз не дошёл до 4 вопроса')
    # 4. логика и цифры (без CSP, чтобы читать функции)
    pt = br.new_page(bypass_csp=True)
    pt.goto(URL + '#learn'); pt.evaluate('localStorage.clear()'); pt.reload(); pt.wait_for_timeout(200)
    chk = pt.evaluate("""() => {
      const r = { m3: whitePairs(3), tt: whitePairs(6), b3: whitePairs(4),
        quart: DEG_NAME.map((_, d) => ivShort(3, whiteIv(d, 3))), fifth: DEG_NAME.map((_, d) => ivShort(4, whiteIv(d, 4))),
        third: DEG_NAME.map((_, d) => ivShort(2, whiteIv(d, 2))), ks: IV.map(v => v.s).join(','), inv: IV.map(v => IV[12 - v.s].k).join(','),
        p5: Math.round(1200 * Math.log2(IV[7].r[0] / IV[7].r[1])), b3c: Math.round(1200 * Math.log2(IV[4].r[0] / IV[4].r[1])),
        ids: SECTIONS().map(x => x.id), body: SECTION_IDS, theory: BALL_CHAPTERS.map(C => ballTheory(C)[0]),
        ivs: SECTIONS().flatMap(x => x.ivs).sort((a, b) => a - b).join(','),
        valid: ['note', 'notes', 'intervals', 'iv-0', 'iv-12', 'iv-13', 'iv-x', 'nope'].map(learnValid) };
      LQ = null; learnQuiz(); r.pool1 = IV.filter(v => ivOpen(v.s)).length; r.q1 = LQ.opts; return r; }""")
    if chk['m3'] != ['ре-фа', 'ми-соль', 'ля-до', 'си-ре']: fails.append(f'малые терции на белых: {chk["m3"]}')
    if chk['tt'] != ['фа-си', 'си-фа']: fails.append(f'тритон на белых: {chk["tt"]}')
    if chk['b3'] != ['до-ми', 'фа-ля', 'соль-си']: fails.append(f'большие терции на белых: {chk["b3"]}')
    if chk['third'] != ['б3', 'м3', 'м3', 'б3', 'б3', 'м3', 'м3']: fails.append(f'терции по ступеням: {chk["third"]}')
    if chk['quart'] != ['ч4', 'ч4', 'ч4', 'ув4', 'ч4', 'ч4', 'ч4']: fails.append(f'кварты по ступеням: {chk["quart"]}')
    if chk['fifth'] != ['ч5', 'ч5', 'ч5', 'ч5', 'ч5', 'ч5', 'ум5']: fails.append(f'квинты по ступеням: {chk["fifth"]}')
    if chk['ks'] != ','.join(map(str, range(13))): fails.append('интервалы не по порядку полутонов')
    if chk['inv'] != 'ч8,б7,м7,б6,м6,ч5,тт,ч4,б3,м3,б2,м2,ч1': fails.append(f'обращения: {chk["inv"]}')
    if chk['p5'] != 702 or chk['b3c'] != 386: fails.append(f'центы чистого строя: квинта {chk["p5"]}, б. терция {chk["b3c"]}')
    if chk['ids'] != IDS or sorted(chk['body']) != sorted(IDS): fails.append(f'разделы не совпадают с главами: {chk["ids"]} / {chk["body"]}')
    if chk['theory'] != ['learn-' + x for x in IDS]: fails.append(f'ссылки глав на теорию: {chk["theory"]}')
    if chk['ivs'] != ','.join(map(str, range(13))): fails.append(f'каждый интервал ровно в одном разделе: {chk["ivs"]}')
    if chk['valid'] != [True, True, True, True, True, False, False, False]: fails.append(f'проверка адресов: {chk["valid"]}')
    if chk['pool1'] != 1 or chk['q1'] != [0]: fails.append(f'квиз взял закрытые интервалы: {chk["q1"]}')
    br.close()
print('\n'.join(fails + errs) or 'OK: теория - 10 разделов по главам, открытие по «Шарику», прочитанное, звук, квиз, цифры')
sys.exit(1 if fails or errs else 0)

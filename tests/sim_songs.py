#!/usr/bin/env python3
"""Песни в интерфейсе: разучивание по фразам и целиком с имитацией живого голоса в реальном времени,
загрузка караоке-файла и записи голоса, удаление, вредный файл песни не выполняется.
Нужны tests/out/test.kar (node tests/test_songs.js) и tests/out/sing.wav (node tests/synth.js).
Запуск: python3 tests/sim_songs.py  (нужен playwright и Chrome; путь к Chrome: env CHROME)"""
import os, sys, wave
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'index.html')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
OUT = os.path.join(ROOT, 'tests', 'out')
SIL = os.path.join(OUT, 'silence.wav')
with wave.open(SIL, 'wb') as w:  # микрофон молчит: голос подаём имитацией, чтобы знать, что спето
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(44100); w.writeframes(b'\0\0' * 44100 * 2)
# певец: по часам звукового движка идёт по нотам окна ответа (как живой: опоздание 0.15 с, вибрато), bad - фальшь 0.7 полутона
SINGER = """window.__sing = 'good'; (function loop() {
  const w = SG && SG.win;
  if (w && window.__sing !== 'off') { const c = ac(), now = c.currentTime, sh = songShiftOf(SG.s), tp = songTempo();
    let rel = now - w.t0 - .15, m = null;
    for (const x of w.T) { if (rel < x.d * .95) { m = rel >= 0 ? x.m + sh + .12 * Math.sin(now * 35) + (window.__sing === 'bad' ? .7 : 0) : null; break; } rel -= x.d; }
    songFrame(now, m); }
  requestAnimationFrame(loop); })()"""
fails = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME, args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={SIL}', '--autoplay-policy=no-user-gesture-required'])
    pg = br.new_page(bypass_csp=True, viewport={'width': 390, 'height': 844})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#today'); pg.wait_for_timeout(300)
    pg.evaluate("localStorage.removeItem('vocal-songs'); state.songs = {}; state.settings.songMode = 'phrase'; state.settings.songTempo = 1; save()")
    pg.click('text=Разучить песню'); pg.wait_for_timeout(300)
    if pg.evaluate('location.hash') != '#songs': fails.append('с «Сегодня» не открылись песни')
    body = pg.inner_text('body')
    for t in ['Маленькая звёздочка', 'Ода к радости', 'Файл MIDI или караоке', 'Напеть в микрофон']:
        if t not in body: fails.append(f'в списке песен нет «{t}»')
    # --- по фразам: чисто -> сам идёт дальше; фальшь -> повтор, фраза не засчитана
    pg.click('text=Маленькая звёздочка'); pg.wait_for_timeout(300)
    pg.evaluate(SINGER)
    pg.click('#sgplay')
    try: pg.wait_for_function("(state.songs['b-twinkle']||{ph:{}}).ph[1] >= 80", timeout=40000)
    except Exception: fails.append('по фразам: чистый певец не прошёл 2 фразы подряд: ' + str(pg.evaluate("JSON.stringify(state.songs['b-twinkle'])")))
    pg.evaluate("window.__sing = 'bad'")
    k = pg.evaluate('SG.k')
    try:
        pg.wait_for_function(f"SG.tries >= 1 && SG.k === {k}", timeout=30000)
        if pg.evaluate(f"(state.songs['b-twinkle'].ph[{k}] || 0) >= 80"): fails.append('по фразам: фальшь 0.7 полутона засчитана')
    except Exception: fails.append('по фразам: после фальши фраза не повторилась (k=%s, %s)' % (pg.evaluate('SG.k'), pg.evaluate('SG.tries')))
    if 'Слышу' not in pg.inner_text('#sgbox') and 'Твоя очередь' not in pg.inner_text('#sgbox') and 'Слушай' not in pg.inner_text('#sgbox'): pass
    pg.goto(URL + '#songs'); pg.wait_for_timeout(400)
    if pg.evaluate('!!(SG && SG.stream) || busy'): fails.append('микрофон не закрылся при уходе с песни')
    if 'выучено 2' not in pg.inner_text('body'): fails.append('в списке не видно прогресса «выучено 2»')
    # --- целиком: первая нота, дальше всю песню сам; засчитываются и фразы
    pg.evaluate("state.settings.songMode = 'whole'; save()")
    pg.goto(URL + '#song-b-ode'); pg.wait_for_timeout(300)
    pg.evaluate(SINGER)
    pg.click('#sgbox button:has-text("Начать")')
    try: pg.wait_for_function("(state.songs['b-ode']||{}).whole >= 90", timeout=45000)
    except Exception: fails.append('целиком: чистый певец не прошёл Оду: ' + str(pg.evaluate("JSON.stringify(state.songs['b-ode'])")))
    if pg.evaluate("Object.values(state.songs['b-ode'].ph).filter(v => v >= 80).length") != 4: fails.append('целиком: фразы не отметились выученными')
    if '% ' not in pg.inner_text('#sgbox') and 'нот чисто' not in pg.inner_text('#sgbox'): fails.append('целиком: нет итога на экране')
    # фальшивый певец целиком: «Готово» раньше времени, результат низкий
    pg.evaluate("window.__sing = 'bad'; state.songs['b-ode'].whole = 0"); pg.click('#sgbox button:has-text("Ещё раз")'); pg.wait_for_timeout(6000)
    pg.click('#sgbox button:has-text("Готово")'); pg.wait_for_timeout(300)
    if pg.evaluate("state.songs['b-ode'].whole") > 20: fails.append('целиком: фальшь дала высокий результат %s%%' % pg.evaluate("state.songs['b-ode'].whole"))
    pg.evaluate("window.__sing = 'off'; state.settings.songMode = 'phrase'; save()")
    # --- тональность: под низкий голос октавой ниже, кнопки сдвигают
    pg.evaluate("state.range = [{date: '2026-11-01T10:00:00', lo: 40, hi: 64}]; save()")
    pg.goto(URL + '#song-b-twinkle'); pg.wait_for_timeout(300)
    if pg.evaluate("songShiftOf(songById('b-twinkle'))") != -12: fails.append('тональность под диапазон E2-E4 должна быть на октаву ниже')
    pg.click('button[title="Выше"]'); pg.wait_for_timeout(200)
    if pg.evaluate("state.songs['b-twinkle'].shift") != -11: fails.append('кнопка «Выше» не сдвинула на полутон')
    # --- своя песня из караоке-файла: ноты, фразы, слова, название
    pg.goto(URL + '#songs'); pg.wait_for_timeout(300)
    pg.set_input_files('input[accept^=".mid"]', os.path.join(OUT, 'test.kar')); pg.wait_for_timeout(500)
    t = pg.inner_text('#sgadd')
    if 'Нашёл 12 нот, 3 фразы и слова' not in t: fails.append('караоке: черновик не тот: ' + t[:120])
    if pg.input_value('#sgtitle') != 'Берёза': fails.append('караоке: название не из файла: ' + pg.input_value('#sgtitle'))
    pg.click('#sgadd button:has-text("Сохранить")'); pg.wait_for_timeout(400)
    if not pg.evaluate("location.hash.startsWith('#song-s')"): fails.append('после сохранения не открылась песня')
    if 'Во поле' not in pg.inner_text('#sgbox'): fails.append('караоке: слова фразы не показаны')
    kid = pg.evaluate("SG.s.id")
    # --- своя песня из записи голоса (без музыки)
    pg.goto(URL + '#songs'); pg.wait_for_timeout(300)
    pg.set_input_files('input[accept="audio/*,video/*"]', os.path.join(OUT, 'sing.wav'))
    try: pg.wait_for_function("document.querySelector('#sgadd') && /Нашёл \\d+ нот/.test(document.querySelector('#sgadd').innerText)", timeout=15000)
    except Exception: fails.append('голос: запись не разобралась: ' + pg.inner_text('#sgadd')[:120])
    n = pg.evaluate("SG.draft ? SG.draft.notes.length : 0")
    if not 8 <= n <= 11: fails.append(f'голос: в записи 10 нот, нашёл {n}')
    pg.fill('#sglyr', 'Первая строчка'); pg.click('#sgadd button:has-text("Сохранить")'); pg.wait_for_timeout(400)
    if 'Первая строчка' not in pg.inner_text('#sgbox'): fails.append('голос: введённые слова не показаны')
    vid = pg.evaluate("SG.s.id")
    # песни общие для профилей, прогресс - у каждого свой
    if pg.evaluate("songsMine().length") != 2: fails.append('своих песен должно быть 2')
    # удаление
    pg.click('text=Удалить песню'); pg.click('#sheet button:has-text("Удалить")'); pg.wait_for_timeout(300)
    if pg.evaluate(f"!!songById('{vid}')"): fails.append('песня не удалилась')
    if not pg.evaluate(f"!!songById('{kid}')"): fails.append('удалилась не та песня')
    # --- вредный файл песен в памяти: код не выполняется, разметка не вставляется
    pg.evaluate("""localStorage.setItem('vocal-songs', JSON.stringify([{id: 'sevil', title: '<img src=x onerror="window.__pwn=1">', notes: [{m:60,t:0,d:1,w:'<b onclick=1>я</b>'},{m:62,t:1,d:1},{m:64,t:2,d:1}], ph:[0]}, {id: '"><script>', title: 'x', notes: []}]))""")
    pg.goto(URL + '#songs'); pg.wait_for_timeout(300); pg.goto(URL + '#song-sevil'); pg.wait_for_timeout(500)
    if pg.evaluate('window.__pwn') or pg.evaluate("!!document.querySelector('img[src=x], b[onclick]')"): fails.append('вредное название песни выполнилось или вставилось как разметка')
    if '<img' not in pg.inner_text('body'): fails.append('вредное название должно показаться как текст')
    # прогресс песен переживает перезагрузку и проверку данных
    pg.reload(); pg.wait_for_timeout(300)
    if pg.evaluate("(state.songs['b-twinkle'].ph[0] || 0) < 80"): fails.append('прогресс песни потерялся после перезагрузки')
    if errs: fails.append('ошибки на странице: ' + '; '.join(errs[:5]))
    br.close()
print('\n'.join(fails) if fails else 'OK: песни учатся по фразам и целиком честно, караоке и запись голоса загружаются, вредный файл не выполняется')
sys.exit(1 if fails else 0)

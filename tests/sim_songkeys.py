#!/usr/bin/env python3
"""Песня на пианино (#keys-<id>, songkeys.js + songgame.js): фраза на клавишах с линией голоса, «Целиком» и игра (ноты падают на клавиши)
с имитацией живого голоса; тональность и окно голоса.
Нужны tests/out/test.kar (node tests/test_songs.js) и tests/out/sing.wav (node tests/synth.js).
Запуск: python3 tests/sim_songkeys.py  (нужен playwright и Chrome; путь к Chrome: env CHROME)"""
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
  const w = SK && SK.win;
  if (w && window.__sing !== 'off') { const c = ac(), now = c.currentTime, sh = songShiftOf(SK.s), tp = songTempo();
    let rel = now - w.t0 - .15, m = null;
    for (const x of w.T) { if (rel < x.d * .95) { m = rel >= 0 ? x.m + sh + .12 * Math.sin(now * 35) + (window.__sing === 'bad' ? .7 : 0) : null; break; } rel -= x.d; }
    skFrame(now, m); }
  requestAnimationFrame(loop); })()"""
# песня-игра (ноты падают на клавиши): шаг игры sgameStep на имитации живого голоса, как в sim_game.py
# [опоздание с, скольжение с, вибрато, сдвиг всей мелодии, каждая 4-я нота мимо на, пианино из динамика перед стартом]
GSIM = """(([lat, glide, vib, shift, wrong, leak]) => {
  sgameReset(); GS.mode = 'live';
  const ons = GS.tl.map(n => ({ s: n.m + (n.i % 4 === 1 ? wrong : 0), t0: n.start, t1: n.end }));
  let now = -2; const dt = 1/60, h = [];
  while (now < GS.D + .4) { let v = null;
    for (let i = 0; i < ons.length; i++) { const o = ons[i], n = ons[i+1], end = n && n.t0 - o.t1 < .1 ? n.t0 : o.t1;
      if (now >= o.t0 + lat && now < end + lat) { const p = i > 0 && o.t0 - ons[i-1].t1 < .1 ? ons[i-1].s : o.s, k = Math.min(1, Math.max(0, (now - (o.t0 + lat)) / glide));
        v = p + (o.s - p) * k + vib * Math.sin(now * 2 * Math.PI * 5.5) + shift; break; } }
    if (v == null && leak && now < 0 && now > -1.8) v = ons[0].s;
    h.push(v); sgameStep(now, dt, h.length > 6 ? h[h.length - 6] : null); now += dt; }
  sgameFinish(false); return GS.res.pct; })"""
GFAIR = {'вовремя': [.08, .06, .15, 0, 0, 0], 'опоздание 0.15с': [.15, .1, .2, 0, 0, 0], 'раньше 0.1с': [-.1, .06, .15, 0, 0, 0],
         'октавой выше, динамик слышен': [.08, .06, .15, 12, 0, 1], 'октавой ниже': [.08, .06, .15, -12, 0, 0]}
fails = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME, args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={SIL}', '--autoplay-policy=no-user-gesture-required'])
    pg = br.new_page(bypass_csp=True, viewport={'width': 390, 'height': 844})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('https://fonts.*/**', lambda r: r.abort())
    pg.goto(URL + '#today'); pg.wait_for_timeout(300)
    pg.evaluate("localStorage.removeItem('vocal-songs'); state.songs = {}; state.settings.skMode = 'phrase'; state.settings.songTempo = 1; save()")
    pg.goto(URL + '#song-b-twinkle'); pg.wait_for_timeout(300)
    # --- по фразам: чисто -> сам идёт дальше; фальшь -> повтор, фраза не засчитана
    pg.click('b:text-is("Пианино")'); pg.wait_for_timeout(300)
    if pg.evaluate('location.hash') != '#keys-b-twinkle': fails.append('кнопка «Пианино» не открыла песню на пианино')
    pg.evaluate(SINGER)
    pg.click('#sgplay')
    try: pg.wait_for_function("(state.songs['b-twinkle']||{ph:{}}).ph[1] >= 80", timeout=40000)
    except Exception: fails.append('по фразам: чистый певец не прошёл 2 фразы подряд: ' + str(pg.evaluate("JSON.stringify(state.songs['b-twinkle'])")))
    pg.evaluate("window.__sing = 'bad'")
    k = pg.evaluate('SK.k')
    try:
        pg.wait_for_function(f"SK.tries >= 1 && SK.k === {k}", timeout=30000)
        if pg.evaluate(f"(state.songs['b-twinkle'].ph[{k}] || 0) >= 80"): fails.append('по фразам: фальшь 0.7 полутона засчитана')
        # итог фразы не первой: цвет у каждой ноты фразы (раньше индексы сдвигались и все ноты были бледными), линия голоса и подсказка
        pg.wait_for_function(f"SK.tries >= 2 && SK.k === {k}", timeout=30000)  # первая попытка могла начаться до фальши, смотрим вторую
        if not pg.evaluate(f"SK.res[{k}].hitNotes.length === phraseNotes(SK.s, {k}).length && SK.res[{k}].hitNotes.every(v => typeof v === 'boolean') && SK.res[{k}].hitNotes.filter(Boolean).length < 4"): fails.append('по фразам: итог не разложен по нотам фразы: ' + str(pg.evaluate(f"JSON.stringify(SK.res[{k}].hitNotes)")))
        if not pg.evaluate(f"SK.res[{k}].tr.some(c => c.filter(v => v != null).length > 5)"): fails.append('по фразам: голос не записан по нотам для клавиш')
        if 'выше на' not in pg.evaluate(f"SK.res[{k}].miss"): fails.append('по фразам: нет подсказки «выше на»: ' + pg.evaluate(f"SK.res[{k}].miss"))
        svg = pg.evaluate("songKeys(phraseNotes(SK.s, %d), songTargets(phraseNotes(SK.s, %d)), 0, {hit: SK.res[%d].hit, tr: SK.res[%d].tr, final: true})" % (k, k, k, k))
        if 'var(--bad)' not in svg or '<path' not in svg or 'Ля' not in svg: fails.append('клавиши фразы: нет красных нот, линии голоса или подписей клавиш')
    except Exception: fails.append('по фразам: после фальши фраза не повторилась (k=%s, %s)' % (pg.evaluate('SK.k'), pg.evaluate('SK.tries')))
    if 'Слышу' not in pg.inner_text('#sgbox') and 'Твоя очередь' not in pg.inner_text('#sgbox') and 'Слушай' not in pg.inner_text('#sgbox'): pass
    pg.goto(URL + '#songs'); pg.wait_for_timeout(400)
    if pg.evaluate('!!(SK && SK.stream) || busy'): fails.append('микрофон не закрылся при уходе с песни')
    # --- целиком: первая нота, дальше всю песню сам; засчитываются и фразы
    pg.evaluate("state.settings.skMode = 'whole'; save()")
    pg.goto(URL + '#keys-b-ode'); pg.wait_for_timeout(300)
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
    pg.evaluate("window.__sing = 'off'; state.settings.skMode = 'phrase'; save()")
    # --- игра: ноты падают на клавиши; честность на всех встроенных песнях и в медленном темпе
    for tp in (1, .75):
        pg.evaluate(f"state.settings.skMode = 'game'; state.settings.songTempo = {tp}; save()")
        for sid in pg.evaluate("BUILTIN_SONGS.map(s => s.id)"):
            pg.goto(URL + '#keys-' + sid); pg.wait_for_timeout(250)
            if not pg.evaluate("!!document.querySelector('#sgcv') && GS && GS.tl.length === SK.s.notes.length"): fails.append(f'игра {sid}: нет поля с падающими нотами'); continue
            for name, a in GFAIR.items():
                acc = pg.evaluate(GSIM, a)
                if acc < 85: fails.append(f'игра {sid} темп {tp} {name}: {acc}% (честный певец не прошёл)')
            acc = pg.evaluate(GSIM, [.08, .06, .1, 1, 0, 0])
            if acc >= 20: fails.append(f'игра {sid}: на полутон мимо дало {acc}%')
            acc = pg.evaluate(GSIM, [.08, .06, .15, 0, 2, 0])
            if not 60 <= acc <= 85: fails.append(f'игра {sid}: каждая 4-я нота мимо дала {acc}% (ждали около 75%)')
    pg.evaluate("state.settings.songTempo = 1; save()"); pg.goto(URL + '#keys-b-twinkle'); pg.wait_for_timeout(300)
    pg.evaluate(GSIM, GFAIR['вовремя'])
    if pg.evaluate("(state.songs['b-twinkle'] || {}).game") != 100: fails.append('игра: лучший результат не сохранился')
    if 'нот попал' not in pg.inner_text('#sgres'): fails.append('игра: нет итога под полем')
    pg.evaluate(GSIM, [.08, .06, .15, 0, 2, 0])
    if 'Чаще мимо' not in pg.inner_text('#sgres'): fails.append('игра: не показано, какие ноты мимо')
    # живой запуск с микрофоном и остановка: микрофон закрывается, игра сбрасывается
    pg.click('#sgplay'); pg.wait_for_timeout(1500)
    if pg.evaluate("GS.mode") != 'live': fails.append('игра: «Играть» не запустило живую игру')
    pg.click('#sgplay'); pg.wait_for_timeout(300)
    if pg.evaluate("GS.mode !== 'idle' || !!GS.stream || busy"): fails.append('игра: «Стоп» не закрыл микрофон')
    pg.click('#sgprev'); pg.wait_for_timeout(800)
    if pg.evaluate("GS.mode") != 'preview': fails.append('игра: «Послушать» не запустилось')
    pg.goto(URL + '#songs'); pg.wait_for_timeout(300)
    if pg.evaluate("!!GS"): fails.append('игра не остановилась при уходе с экрана')
    pg.evaluate("state.settings.skMode = 'phrase'; save()")
    # --- тональность: под низкий голос октавой ниже, кнопки сдвигают
    pg.evaluate("state.range = [{date: '2026-11-01T10:00:00', lo: 40, hi: 64}]; save()")
    pg.goto(URL + '#keys-b-twinkle'); pg.wait_for_timeout(300)
    if pg.evaluate("state.range.push({date: '2026-11-02T10:00:00', lo: 50, hi: 79, chestHi: 50}); const w = songWin(); state.range.pop(); w[1]") != 79: fails.append('случайный «фальцет» в самом низу замера сжал окно песни в одну ноту')
    if pg.evaluate("songShiftOf(songById('b-twinkle'))") != -12: fails.append('тональность под диапазон E2-E4 должна быть на октаву ниже')
    pg.click('button[title="Выше"]'); pg.wait_for_timeout(200)
    if pg.evaluate("state.songs['b-twinkle'].shift") != -11: fails.append('кнопка «Выше» не сдвинула на полутон')
    if errs: fails.append('ошибки на странице: ' + '; '.join(errs[:5]))
    br.close()
print('\n'.join(fails) if fails else 'OK: песня на пианино - фразы на клавишах, целиком и игра честные, тональность')
sys.exit(1 if fails else 0)

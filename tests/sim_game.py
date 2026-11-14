#!/usr/bin/env python3
"""Честность игры «Попади в ноту»: имитация живого голоса на всех 12 уровнях.
Живые певцы (опоздание, скольжение, вибрато, октава, пианино из динамика) должны проходить, чужая нота - нет.
Запуск: python3 tests/sim_game.py  (нужен playwright и Chrome; путь к Chrome: env CHROME)"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'index.html')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
# голос: [опоздание с, скольжение с, вибрато полутонов, сдвиг всей мелодии, заменить ноту from, на to, в паузах слышно пианино]
SIM = """(([lat, glide, vib, shift, subFrom, subTo, leak]) => {
  gameReset(); G.mode = 'live';
  const ons = G.tl.map(n => ({ s: n.rel === subFrom ? subTo : n.rel, t0: n.start, t1: n.end }));
  let now = -2; const dt = 1/60, h = [];
  while (now < G.D + .4) { let v = null;
    for (let i = 0; i < ons.length; i++) { const o = ons[i], n = ons[i+1], end = n && n.t0 - o.t1 < .1 ? n.t0 : o.t1;
      if (now >= o.t0 + lat && now < end + lat) { const p = i > 0 && o.t0 - ons[i-1].t1 < .1 ? ons[i-1].s : o.s, k = Math.min(1, Math.max(0, (now - (o.t0 + lat)) / glide));
        v = p + (o.s - p) * k + vib * Math.sin(now * 2 * Math.PI * 5.5) + shift; break; } }
    if (v == null && leak && now < 0 && now > -1.8) v = ons[0].s;   // подсказка первой ноты из динамика перед стартом
    h.push(v); gameStep(now, dt, h.length > 6 ? h[h.length - 6] : null); now += dt; }
  G.tl.forEach(n => { if (!n.done) { n.done = true; n.score = noteScore(n); } });
  G.mode = 'idle';
  return Math.round(100 * G.tl.reduce((a, n) => a + n.score, 0) / G.tl.length); })"""
FAIR = {'вовремя': [.08, .06, .15, 0, -99, 0, 0], 'опоздание 0.15с': [.15, .1, .2, 0, -99, 0, 0], 'раньше 0.1с': [-.1, .06, .15, 0, -99, 0, 0],
        'октавой выше': [.08, .06, .15, 12, -99, 0, 0], 'октавой ниже': [.08, .06, .15, -12, -99, 0, 0],
        'октавой выше, динамик слышен': [.08, .06, .15, 12, -99, 0, 1]}
fails, rows = [], []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME); pg = br.new_page(bypass_csp=True, viewport={'width': 390, 'height': 844})
    pg.goto(URL + '#game'); pg.wait_for_timeout(300)
    pg.evaluate("state.game.best={};for(let i=1;i<=12;i++)state.game.best[i]={acc:100,stars:3};save()")
    for n in range(1, 13):
        pg.goto(f'{URL}#game-{n}'); pg.wait_for_timeout(150)
        row = []
        for name, a in FAIR.items():
            acc = pg.evaluate(SIM, a); row.append(acc)
            if acc < 85: fails.append(f'ур.{n} {name}: {acc}% (честный певец не получил 3 звезды)')
        acc = pg.evaluate(SIM, [.08, .06, .1, 1, -99, 0, 0]); row.append(acc)
        if acc >= 50: fails.append(f'ур.{n} на полутон мимо: {acc}% (фальшь прошла)')
        if n in (11, 12):
            acc = pg.evaluate(SIM, [.08, .06, .15, 0, 12, 0, 0]); row.append(acc)
            full = pg.evaluate(SIM, FAIR['вовремя'])
            if acc >= full - 5: fails.append(f'ур.{n}: нижнее До вместо верхнего не снизило счёт ({acc}%)')
        rows.append(f'ур.{n}: ' + ' '.join(map(str, row)))
    # работа над нижним регистром: база G2, строго в октаве
    pg.evaluate("state.settings.base=43;state.settings.strict=true;save()")
    for n in (1, 6, 12):
        pg.goto(f'{URL}#game-{n}'); pg.wait_for_timeout(150)
        ok = pg.evaluate(SIM, FAIR['вовремя']); up = pg.evaluate(SIM, FAIR['октавой выше'])
        rows.append(f'строго, ур.{n}: в октаве {ok}, октавой выше {up}')
        if ok < 85: fails.append(f'строго ур.{n}: певец в нужной октаве {ok}%')
        if up >= 50: fails.append(f'строго ур.{n}: октавой выше прошло {up}%')
    pg.evaluate("state.settings.base=48;state.settings.strict=false;save()")
    br.close()
if '-v' in sys.argv: print('\n'.join(rows))
print('\n'.join(fails) if fails else 'OK: «Попади в ноту» честная на всех 12 уровнях')
sys.exit(1 if fails else 0)

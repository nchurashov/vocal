#!/usr/bin/env python3
"""Замер диапазона: засчитываются только удержанные ноты (rangeStep).
Запуск: python3 tests/sim_range.py  (нужен playwright и Chrome; путь к Chrome: env CHROME)"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'index.html')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
# сценарий: [[нота | null, длительность с, вибрато полутонов], ...] -> {lo, hi}
SIM = """(parts => { const R = { fr: [], lo: null, hi: null }; let t = 0; const dt = 1/60;
  for (const [m, d, vib] of parts) { const end = t + d; for (; t < end; t += dt) rangeStep(R, t, m == null ? null : m + (vib || 0) * Math.sin(t * 2 * Math.PI * 5.5)); }
  return { lo: R.lo, hi: R.hi }; })"""
CASES = [
    ('низ и верх с вибрато', [[43, 1.2, .3], [None, .3], [50, 1, .2], [57, 1, .2], [64, 1.2, .3]], 43, 64),
    ('короткий писк и хрип не считаются', [[48, 1.2, .2], [72, .3, 0], [36, .4, 0], [55, 1.1, .2]], 48, 55),
    ('скольжение не считается', [[50, 1, .1]] + [[50 + k * .5, .05, 0] for k in range(1, 30)] + [[52, 1, .1]], 50, 52),
    ('тишина', [[None, 3]], None, None),
]
fails = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME); pg = br.new_page()
    pg.goto(URL + '#range'); pg.wait_for_timeout(300)
    for name, parts, lo, hi in CASES:
        r = pg.evaluate(SIM, parts)
        if r['lo'] != lo or r['hi'] != hi: fails.append(f'{name}: {r}, ждали {lo}-{hi}')
    # выбор высоты по грудному голосу и отметка перехода
    ch = pg.evaluate("rangeChoices(40, 79, 64).map(x => x[0])")
    if ch != [46, 40, 52]: fails.append(f'выбор по грудному голосу E2-E4: ждали [46, 40, 52], а не {ch}')
    nf = pg.evaluate("rangeChoices(40, 79, null).map(x => x[0])")
    if nf != [54, 40, 67]: fails.append(f'выбор без фальцета: {nf}')
    mk = pg.evaluate("(() => { RG = { mode: 'live', fr: [], lo: 40, hi: 64 }; rangeMarkBreak(); const a = RG.chestHi; RG.hi = 79; RG.mode = 'result'; state.range = [{ date: '2026-11-13T10:00:00', lo: 40, hi: 79 }]; rangeSetBreak(62); const b = [RG.chestHi, state.range[0].chestHi]; rangeSetBreak(79); return [a, ...b, RG.chestHi, 'chestHi' in state.range[0]]; })()")
    if mk != [64, 62, 62, None, False]: fails.append(f'отметка перехода: {mk}')
    # клавиатура и страница «Как устроены ноты»
    keys = pg.evaluate("(() => { const d = document.createElement('div'); d.innerHTML = pianoSVG(36, 83, {band:[40,52]}); return [d.querySelectorAll('[data-m]').length, d.querySelectorAll('.pk-b').length, d.querySelectorAll('.pk-in').length]; })()")
    if keys != [48, 20, 13]: fails.append(f'клавиатура C2-B5: ждали 48 клавиш, 20 чёрных, 13 в диапазоне, а не {keys}')
    names = pg.evaluate("[noteFull(40), noteFull(60), noteShort(79)]")
    if names != ['Ми большой октавы (E2)', 'До первой октавы (C4)', 'G5']: fails.append(f'имена нот: {names}')
    pg.goto(URL + '#learn'); pg.wait_for_timeout(300)
    if 'Как устроены ноты' not in pg.inner_text('body'): fails.append('страница #learn не открылась')
    br.close()
print('\n'.join(fails) if fails else 'OK: замер диапазона честный')
sys.exit(1 if fails else 0)

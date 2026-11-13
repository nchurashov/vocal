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
    br.close()
print('\n'.join(fails) if fails else 'OK: замер диапазона честный')
sys.exit(1 if fails else 0)

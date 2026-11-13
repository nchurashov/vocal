#!/usr/bin/env python3
"""Распевка: тональности не выходят за замеренный диапазон, весь проход доходит до конца и сохраняется.
Запуск: python3 tests/sim_warmup.py  (нужен playwright и Chrome; путь к Chrome: env CHROME)"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'index.html')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
CHECK = """(([b, lo, hi]) => { const r = lo == null ? null : { lo, hi }, bad = [];
  const L = r ? lo : b - 2, H = r ? hi : b + 12;
  for (const s of WU_STEPS.filter(s => s.pat)) { const ks = warmupKeys(s, b, r);
    for (const k of ks) if (k + Math.min(...s.pat) < L || k + Math.max(...s.pat) > H) bad.push(s.id + ' ' + k);
    if (ks.length === 0 && (H - L) >= 12) bad.push(s.id + ': пусто'); }
  return bad; })"""
fails = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME); pg = br.new_page(viewport={'width': 390, 'height': 844})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#today'); pg.wait_for_timeout(300)
    for case in [[48, None, None], [60, None, None], [43, 43, 64], [48, 45, 62], [55, 50, 60], [36, 36, 50]]:
        bad = pg.evaluate(CHECK, case)
        if bad: fails.append(f'база {case[0]}, диапазон {case[1]}-{case[2]}: вне границ {bad}')
    # нижний регистр: спуск доходит до замеренного низа
    low = pg.evaluate("warmupKeys(WU_STEPS.find(s=>s.id==='low'), 43, {lo:43, hi:64})")
    if not low or low[-1] != 43: fails.append(f'спуск вниз не доходит до низа диапазона: {low}')
    # полный проход на ускорении
    pg.evaluate("window.WU_SPEED=40; state.warmups=[]; save()")
    pg.goto(URL + '#warmup'); pg.wait_for_timeout(300)
    pg.click('#wuplay')
    pg.wait_for_function("document.body.innerText.includes('Распевка сделана')", timeout=60000)
    n = pg.evaluate("(state.warmups||[]).length")
    if n != 1: fails.append(f'распевка не сохранилась: {n}')
    pg.goto(URL + '#today'); pg.wait_for_timeout(300)
    if 'Распевка дня: сделана' not in pg.inner_text('body'): fails.append('на экране «Сегодня» нет отметки о распевке')
    if errs: fails.append('ошибки: ' + '; '.join(errs))
    br.close()
print('\n'.join(fails) if fails else 'OK: распевка в границах диапазона, проход сохраняется')
sys.exit(1 if fails else 0)

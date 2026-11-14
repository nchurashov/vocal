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
    ks.forEach((k, i) => { const edge = s.edge && r && i === ks.length - 1 && k + Math.min(...s.pat) === L - 1;
      if (!edge && (k + Math.min(...s.pat) < L || k + Math.max(...s.pat) > H)) bad.push(s.id + ' ' + k); });
    if (ks.length === 0 && s.from !== 'break' && (H - L) >= 12) bad.push(s.id + ': пусто'); }
  return bad; })"""
fails = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME); pg = br.new_page(bypass_csp=True, viewport={'width': 390, 'height': 844})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#today'); pg.wait_for_timeout(300)
    for case in [[48, None, None], [60, None, None], [43, 43, 64], [48, 45, 62], [55, 50, 60], [36, 36, 50]]:
        bad = pg.evaluate(CHECK, case)
        if bad: fails.append(f'база {case[0]}, диапазон {case[1]}-{case[2]}: вне границ {bad}')
    # нижний регистр: спуск доходит до замеренного низа
    low = pg.evaluate("warmupKeys(WU_STEPS.find(s=>s.id==='low'), 43, {lo:43, hi:64})")
    if not low or low[-2] != 43 or low[-1] != 42: fails.append(f'спуск вниз: ждали ...43, 42 (шаг за край), а не {low}')
    # переход в фальцет: только при отмеченной границе, верх фразы пересекает её
    brk = pg.evaluate("warmupKeys(WU_STEPS.find(s=>s.id==='break'), 43, {lo:40, hi:79, chestHi:64})")
    tops = [k + 12 for k in brk]
    if not brk or min(tops) > 64 or max(tops) <= 64: fails.append(f'переход: верх фразы должен пересекать грудной верх 64, а он {tops}')
    if pg.evaluate("warmupKeys(WU_STEPS.find(s=>s.id==='break'), 43, {lo:40, hi:79})"): fails.append('переход появился без отметки фальцета')
    if pg.evaluate("warmupKeys(WU_STEPS.find(s=>s.id==='break'), 48, null)"): fails.append('переход появился без замера')
    wide = pg.evaluate("warmupKeys(WU_STEPS.find(s=>s.id==='low'), 50, {lo:40, hi:79})")
    if wide[-2] != 40 or wide[-1] != 39: fails.append(f'спуск при широком диапазоне должен дойти до низа 40 и шагнуть за край: {wide}')
    nolow = pg.evaluate("warmupKeys(WU_STEPS.find(s=>s.id==='low'), 48, null)")
    if min(nolow) < 46: fails.append(f'без замера спуск ушёл ниже базы-2: {nolow}')
    # оценка ответа: чистое пение, октава, чужая тональность
    SC = """(([shift, strict, wrong]) => { const pat = [0,2,4,5,7,5,4,2,0], k = 50, fr = []; let t = 0;
      pat.forEach(x => { for (let i = 0; i < 20; i++, t += 1/60) fr.push({ t, m: k + x + shift + (wrong || 0) + .15 * Math.sin(t * 35) }); });
      return wuScore(pat, k, fr, strict); })"""
    for name, a, want in [('чисто', [0, False, 0], True), ('октавой выше', [12, False, 0], True), ('октавой выше строго', [12, True, 0], False), ('на полутон выше', [0, False, 1], False)]:
        r = pg.evaluate(SC, a)
        if r['ok'] != want: fails.append(f'оценка ответа «{name}»: {r["n"]}/{len(r["notes"])}, ждали ok={want}')
    # полный проход на ускорении
    pg.evaluate("window.WU_SPEED=40; state.warmups=[]; state.settings.wuMode='along'; save()")
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

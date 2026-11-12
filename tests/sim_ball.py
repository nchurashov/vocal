#!/usr/bin/env python3
"""Честность игры «Шарик»: имитация живого голоса на всех уровнях.
Живые певцы (опоздание, скольжение, вибрато, октава) должны проходить, фальшь - разбиваться.
Запуск: python3 tests/sim_ball.py  (нужен playwright и Chrome; путь к Chrome: env CHROME)"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'index.html')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
# голос: [опоздание с, скольжение с, вибрато полутонов, сдвиг всей мелодии, заменить ноту from, на to]
SIM = """(([lat, glide, vib, shift, subFrom, subTo]) => {
  ballReset(true); const lv=B.lv, b=60/lv.bpm, ons=[]; let t=0;
  lv.walls.forEach(([s,len,gap])=>{ons.push({s:(s===subFrom?subTo:s),t0:t,t1:t+len*b}); t+=(len+gap)*b;});
  let now=-1.5; const dt=1/60, h=[];
  while(now < B.D+.6){ let v=null;
    for(let i=0;i<ons.length;i++){const o=ons[i],n=ons[i+1],end=n&&n.t0-o.t1<.01?n.t0:o.t1;
      if(now>=o.t0-.3+lat&&now<end+lat){const from=(i>0&&ons[i-1].t1>=o.t0-.01)?ons[i-1].s:o.s,k=Math.min(1,Math.max(0,(now-(o.t0+lat))/glide));
        v=from+(o.s-from)*k+vib*Math.sin(now*2*Math.PI*5.5)+shift;break;}}
    h.push(v); ballStep(now, dt, h.length>6?h[h.length-6]:null); now+=dt; }
  return B.walls.map(w=>w.passed?'P':w.crashed?'X':'.').join(''); })"""
FAIR = {'вовремя': [.12, .08, .15, 0, -99, 0], 'опоздание 0.2с': [.2, .12, .2, 0, -99, 0], 'раньше 0.1с': [-.1, .08, .15, 0, -99, 0],
        'октавой выше': [.12, .08, .15, 12, -99, 0], 'октавой ниже': [.12, .08, .15, -12, -99, 0]}
fails = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME); pg = br.new_page(viewport={'width': 390, 'height': 844})
    pg.goto(URL + '#ball'); pg.wait_for_timeout(300)
    for tol in [40, 20]:
        pg.evaluate(f"state.settings.tol={tol};state.ball.best={{}};for(let i=1;i<=12;i++)state.ball.best[i]={{pct:100,stars:3}};save()")
        for n in range(1, 13):
            pg.goto(f'{URL}#ball-{n}'); pg.wait_for_timeout(100)
            for name, a in FAIR.items():
                r = pg.evaluate(SIM, a)
                if 'X' in r: fails.append(f'±{tol} ур.{n} {name}: {r} (честный певец разбился)')
            r = pg.evaluate(SIM, [.12, .08, .1, .7, -99, 0])
            if r.count('X') < len(r) * .7: fails.append(f'±{tol} ур.{n} фальшь 0.7 полутона прошла: {r}')
    pg.evaluate("state.settings.tol=40;save()")
    for n in (11, 12):
        pg.goto(f'{URL}#ball-{n}'); pg.wait_for_timeout(100)
        r = pg.evaluate(SIM, [.12, .08, .15, 0, 12, 0])
        if 'X' not in r: fails.append(f'ур.{n}: нижнее До вместо верхнего прошло: {r}')
    br.close()
print('\n'.join(fails) if fails else 'OK: все уровни честные (±40 и ±20)')
sys.exit(1 if fails else 0)

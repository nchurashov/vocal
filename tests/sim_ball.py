#!/usr/bin/env python3
"""Честность игры «Шарик»: имитация живого голоса на всех уровнях.
Живые певцы (опоздание, скольжение, вибрато, октава) должны проходить, фальшь - разбиваться.
Запуск: python3 tests/sim_ball.py  (нужен playwright и Chrome; путь к Chrome: env CHROME)"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'index.html')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
# голос: [опоздание с, скольжение с, вибрато полутонов, сдвиг всей мелодии, заменить ноту from, на to, в паузах микрофон слышит подсказку пианино]
SIM = """(([lat, glide, vib, shift, subFrom, subTo, leak]) => {
  ballReset(true); const lv=B.lv, b=60/lv.bpm, ons=[]; let t=0;
  lv.walls.forEach(([s,len,gap])=>{ons.push({s:(s===subFrom?subTo:s),t0:t,t1:t+len*b}); t+=(len+gap)*b;});
  let now=-1.5; const dt=1/60, h=[];
  while(now < B.D+.6){ let v=null;
    for(let i=0;i<ons.length;i++){const o=ons[i],n=ons[i+1],end=n&&n.t0-o.t1<.01?n.t0:o.t1;
      if(now>=o.t0-.3+lat&&now<end+lat){const from=(i>0&&ons[i-1].t1>=o.t0-.01)?ons[i-1].s:o.s,k=Math.min(1,Math.max(0,(now-(o.t0+lat))/glide));
        v=from+(o.s-from)*k+vib*Math.sin(now*2*Math.PI*5.5)+shift;break;}}
    if(v==null&&leak){const nx=ons.find(o=>o.t0>now);if(nx&&nx.t0-now<1.6&&nx.t0-now>.9)v=nx.s;}
    h.push(v); ballStep(now, dt, h.length>6?h[h.length-6]:null); now+=dt; }
  return B.walls.map(w=>w.passed?'P':w.crashed?'X':'.').join(''); })"""
FAIR = {'вовремя': [.12, .08, .15, 0, -99, 0], 'опоздание 0.2с': [.2, .12, .2, 0, -99, 0], 'раньше 0.1с': [-.1, .08, .15, 0, -99, 0],
        'октавой выше': [.12, .08, .15, 12, -99, 0], 'октавой ниже': [.12, .08, .15, -12, -99, 0],
        'октавой выше, динамик слышен': [.12, .08, .15, 12, -99, 0, 1]}
fails = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME); pg = br.new_page(bypass_csp=True, viewport={'width': 390, 'height': 844})
    pg.goto(URL + '#ball'); pg.wait_for_timeout(300)
    for tol in [40, 20]:
        pg.evaluate(f"state.settings.tol={tol};state.ball.best={{}};for(let i=1;i<=100;i++)state.ball.best[i]={{pct:100,stars:3}};state.ball.v=3;save()")
        for n in range(1, 101):
            pg.goto(f'{URL}#ball-{n}'); pg.wait_for_timeout(100)
            for name, a in FAIR.items():
                r = pg.evaluate(SIM, a)
                if 'X' in r: fails.append(f'±{tol} ур.{n} {name}: {r} (честный певец разбился)')
            r = pg.evaluate(SIM, [.12, .08, .1, .7, -99, 0])
            if r.count('X') < len(r) * .7: fails.append(f'±{tol} ур.{n} фальшь 0.7 полутона прошла: {r}')
    pg.evaluate("state.settings.tol=40;save()")
    for n in pg.evaluate("BALL_LEVELS.filter(l => l.walls.some(w => w[0] === 12) && l.walls.some(w => w[0] === 0)).map(l => l.n)"):
        pg.goto(f'{URL}#ball-{n}'); pg.wait_for_timeout(100)
        r = pg.evaluate(SIM, [.12, .08, .15, 0, 12, 0])
        if 'X' not in r: fails.append(f'ур.{n}: нижнее До вместо верхнего прошло: {r}')
    # строго в октаве (нижний регистр): октавой выше разбивается, в нужной октаве проходит
    pg.evaluate("state.settings.base=43;state.settings.strict=true;save()")
    for n in (1, 7, 12):
        pg.goto(f'{URL}#ball-{n}'); pg.wait_for_timeout(100)
        r = pg.evaluate(SIM, [.12, .08, .15, 0, -99, 0])
        if 'X' in r: fails.append(f'строго ур.{n}: певец в нужной октаве разбился: {r}')
        r = pg.evaluate(SIM, [.12, .08, .15, 12, -99, 0])
        if r.count('X') < len(r) * .7: fails.append(f'строго ур.{n}: октавой выше прошло: {r}')
    pg.evaluate("state.settings.base=48;state.settings.strict=false;save()")
    # окно голоса: все ноты заданий внутри; при широком грудном диапазоне октава идёт от всех 7 нот (до...си)
    w = pg.evaluate("(() => { state.range = []; ballRebuild(); const W = ballWindow(); return [W, BALL_LEVELS.flatMap(l => l.walls.map(x => x[0])).filter(r => r < W[0] || r > W[1]).length]; })()")
    if w[1]: fails.append(f'ноты вне окна голоса {w[0]}: {w[1]}')
    oc = pg.evaluate("(() => { state.settings.base = 48; state.range = [{ date: '2026-11-13T10:00:00', lo: 40, hi: 79, chestHi: 64 }]; save(); ballRebuild(); return [ballWindow(), BALL_LEVELS.filter(l => l.ch === 9 && l.task <= 7).map(l => l.from)]; })()")
    if oc[1] != ['от до', 'от ре', 'от ми', 'от фа', 'от соль', 'от ля', 'от си']: fails.append(f'октава при окне {oc[0]}: {oc[1]}')
    for n in range(91, 101):
        pg.goto(f'{URL}#ball-{n}'); pg.wait_for_timeout(100)
        r = pg.evaluate(SIM, [.12, .08, .15, 0, -99, 0])
        if 'X' in r: fails.append(f'широкое окно, ур.{n}: честный певец разбился: {r}')
    pg.evaluate("state.range = []; save(); ballRebuild()")
    # правила: задание засчитывается с 2★, экзамен (каждое 10-е) - только с 3★; старые 12 уровней уходят в архив
    rules = pg.evaluate("""(() => { const out = [];
      state.ball = { best: { 1: { stars: 3, pct: 100 } }, plays: [] }; ballState(); out.push(!!state.ballOld, Object.keys(state.ball.best).length);
      state.ball.best = { 1: { stars: 1 } }; out.push(ballUnlocked(2));
      state.ball.best = { 1: { stars: 2 } }; out.push(ballUnlocked(2));
      state.ball.best = {}; for (let i = 1; i <= 9; i++) state.ball.best[i] = { stars: 2 }; state.ball.best[10] = { stars: 2 }; out.push(ballUnlocked(10), ballUnlocked(11));
      state.ball.best[10] = { stars: 3 }; out.push(ballUnlocked(11), BALL_LEVELS.length, BALL_LEVELS.filter(l => l.exam).length);
      return out; })()""")
    if rules != [True, 0, False, True, True, False, True, 100, 10]: fails.append(f'правила открытия: {rules}')
    br.close()
print('\n'.join(fails) if fails else 'OK: все 100 заданий честные (±40 и ±20)')
sys.exit(1 if fails else 0)

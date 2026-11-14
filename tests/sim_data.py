#!/usr/bin/env python3
"""Данные: экспорт -> импорт без потерь, перенос старого формата v1, испорченный или чужой файл
не ломает приложение и не вставляет код в страницу.
Запуск: python3 tests/sim_data.py  (нужен playwright и Chrome; путь к Chrome: env CHROME)"""
import os, json
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'index.html')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
OUT = os.path.join(ROOT, 'tests', 'out'); os.makedirs(OUT, exist_ok=True)
fails = []
def check(ok, msg):
    print(('OK   ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)

V1 = {'v': 1, 'settings': {'base': 43, 'latency': 20, 'tol': 20, 'strict': True},
      'sessions': [{'id': 'abc123', 'ex': 'p1', 'cat': 'pitch', 'level': 1, 'date': '2026-11-01T10:00:00', 'rating': 3, 'crit': [0, 1], 'critTotal': 3, 'note': 'хорошо'}],
      'srs': {'p1': {'box': 1, 'due': '2026-11-03', 'last': '2026-11-01', 'lastRating': 3}},
      'notes': [{'id': 'n1', 'date': '2026-11-01T10:00:00', 'text': 'зевок помогает'}],
      'game': {'best': {'1': {'acc': 90, 'stars': 2}}, 'plays': []},
      'ball': {'best': {'1': {'pct': 100, 'stars': 3, 'tol': 20}}, 'plays': []},
      'range': [{'date': '2026-11-01T10:00:00', 'lo': 43, 'hi': 64}]}
EVIL = {'app': 'vocal', 'v': 2,
        'sessions': [{'id': "x');window.HACKED=1;('", 'ex': 'p1', 'cat': 'pitch', 'level': 1, 'date': '2026-11-01T10:00:00', 'rating': 3},
                     {'id': 'ok1', 'ex': 'p1', 'cat': '<img src=x onerror=window.HACKED=2>', 'level': 1, 'date': '2026-11-01T10:00:00', 'rating': 3},
                     {'id': 'ok2', 'ex': 'p1', 'cat': 'pitch', 'level': '<b>', 'date': '2026-11-01T10:00:00', 'rating': 3,
                      'note': '<img src=x onerror=window.HACKED=3>', 'auto': {'type': 'sing', 'score': '<img src=x onerror=window.HACKED=4>'}}],
        'notes': [{'id': 'n1', 'date': '2026-11-01T10:00:00', 'text': '<script>window.HACKED=5</script>'}],
        'settings': {'base': 9999}, 'range': 'мусор', 'game': None,
        'voice': {'done': [{'date': '2026-11-01T10:00:00', 'id': 'v1'}]}, '__proto__': {'polluted': 1}}

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME); pg = br.new_page(bypass_csp=True, viewport={'width': 390, 'height': 844})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    # 1. Старый формат v1 из localStorage переносится без потерь
    pg.goto(URL + '#today'); pg.evaluate('(d) => localStorage.setItem("vocal-practice", JSON.stringify(d))', V1); pg.reload(); pg.wait_for_timeout(300)
    st = pg.evaluate('state')
    check(st['v'] == pg.evaluate('STATE_V') == 4 and st['songs'] == {} and st['learn'] == {'read': {}}, 'v1 переведён в текущую версию (v4), прогресс песен и теории - пустой')
    check(len(st['sessions']) == 1 and st['sessions'][0]['note'] == 'хорошо', 'занятие и его заметка сохранились')
    check(st['settings'] == {'base': 43, 'latency': 20, 'tol': 20, 'strict': True}, 'настройки сохранились')
    check(st['range'] == V1['range'] and st['warmups'] == [], 'диапазон на месте, распевки - пустой список')
    bb = (st.get('ballOld') or st['ball'])['best']
    check(bb['1']['tol'] == 20 and st['game']['best']['1']['acc'] == 90, 'рекорды игр на месте')
    # 2. Экспорт -> импорт даёт то же самое
    exp = pg.evaluate('exportJSON()'); path = os.path.join(OUT, 'export.json'); open(path, 'w', encoding='utf-8').write(exp)
    check(json.loads(exp)['app'] == 'vocal', 'в экспорте есть метка приложения')
    pg.evaluate('localStorage.clear(); state = DEFAULT(); save()'); pg.goto(URL + '#today'); pg.wait_for_timeout(200)
    pg.evaluate('openSettings()'); pg.set_input_files('#sheet input[type=file]', path); pg.wait_for_timeout(300)
    check('занятий: 1' in pg.inner_text('#sheet'), 'перед загрузкой показано, что в файле')
    pg.click('#sheet button:has-text("Загрузить")'); pg.wait_for_timeout(200)
    got = pg.evaluate('state'); diff = [k for k in set(got) | set(st) if got.get(k) != st.get(k)]
    check(not diff, 'после импорта данные совпадают с экспортом' + (': ' + json.dumps({k: [st.get(k), got.get(k)] for k in diff}, ensure_ascii=False)[:600] if diff else ''))
    check(pg.evaluate('JSON.parse(localStorage.getItem("vocal-practice")).sessions.length') == 1, 'импорт записан в хранилище')
    # 3. Вредный файл: ничего не выполняется, мусор отброшен
    evil = os.path.join(OUT, 'evil.json'); json.dump(EVIL, open(evil, 'w'))
    pg.evaluate('openSettings()'); pg.set_input_files('#sheet input[type=file]', evil); pg.wait_for_timeout(300)
    pg.click('#sheet button:has-text("Загрузить")'); pg.wait_for_timeout(200)
    for r in ['history', 'notes', 'today', 'ball', 'game', 'exercises']:
        pg.goto(URL + '#' + r); pg.wait_for_timeout(150)
    st = pg.evaluate('state')
    check(pg.evaluate('window.HACKED') is None, 'код из файла не выполнился')
    check([s['id'] for s in st['sessions']] == ['ok2'], 'занятия с плохим id и неизвестной категорией отброшены')
    check('level' not in st['sessions'][0] and 'score' not in st['sessions'][0]['auto'], 'поля неверного типа выкинуты')
    check(st['settings']['base'] == 48 and st['range'] == [], 'плохие настройки и диапазон заменены на обычные')
    check(st.get('voice', {}).get('done', [{}])[0].get('id') == 'v1', 'новые разделы данных (voice) не теряются')
    check(pg.evaluate('({}).polluted') is None, 'прототип объектов не испорчен')
    # 4. Чужой и битый файл: отказ, данные не тронуты
    before = pg.evaluate('JSON.stringify(state)')
    for name, body in [('junk.json', '{не json'), ('other.json', '{"hello": 1}'), ('future.json', '{"app":"vocal","v":99}')]:
        f = os.path.join(OUT, name); open(f, 'w').write(body)
        pg.evaluate('openSettings()'); pg.set_input_files('#sheet input[type=file]', f); pg.wait_for_timeout(300)
        check(not pg.is_visible('#sheet button:has-text("Загрузить")') and pg.evaluate('JSON.stringify(state)') == before, f'{name}: отказ, данные целы')
    # 5. Битые данные в localStorage: приложение открывается с нуля, старое сохранено отдельно
    pg.evaluate('localStorage.setItem("vocal-practice", "{битое")'); pg.reload(); pg.wait_for_timeout(300)
    check(pg.evaluate('state.sessions.length') == 0 and pg.evaluate('localStorage.getItem("vocal-practice-broken")') == '{битое', 'битое хранилище не роняет приложение и не теряется')
    check(pg.evaluate('JSON.stringify(Object.keys(CATS).sort())==JSON.stringify([...SESSION_CATS].sort()) && JSON.stringify(Object.keys(RATINGS).map(Number).sort())==JSON.stringify([...SESSION_RATINGS].sort())'), 'категории и оценки в store совпадают с data/exercises.js')
    check(not errs, 'нет ошибок на странице' + (': ' + '; '.join(errs) if errs else ''))
    br.close()
print('FAIL' if fails else 'OK: данные переносятся, импорт безопасный')
raise SystemExit(1 if fails else 0)

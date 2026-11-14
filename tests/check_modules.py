#!/usr/bin/env python3
"""Порядок загрузки модулей: грузим src/main.js как настоящие ES-модули (без сборщика) по http.
В сборке esbuild превращает const в var, и ошибка порядка (модуль читает значение другого модуля,
которое ещё не вычислено) тихо даёт undefined. Нативные модули в этом случае падают с ReferenceError - ловим здесь.
Запуск: python3 tests/check_modules.py  (нужен playwright и Chrome; путь к Chrome: env CHROME)"""
import os, sys, threading, http.server, functools
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
html = open(os.path.join(ROOT, 'www', 'index.html'), encoding='utf-8').read()  # без CSP: она запретила бы загрузчик модулей
shell = html[:html.index('<script>')] + '<script type="module" src="/src/main.js"></script></body></html>'
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.split('?')[0] in ('/', '/dev.html'):
            b = shell.encode('utf-8'); self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b); return
        return super().do_GET()
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{srv.server_address[1]}/dev.html'
fails = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME, args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
    pg = br.new_page(viewport={'width': 390, 'height': 844}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e) + ' | ' + (e.stack or '')[:400].replace(chr(10), ' ')))
    pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text))
    pg.on('response', lambda r: r.status >= 400 and not r.url.endswith('/favicon.ico') and errs.append(f'{r.status} {r.url}'))
    for r in ['today', 'ball', 'ball-1', 'game-1', 'exercises', 'ex-h1', 'check', 'history', 'notes', 'range', 'warmup', 'learn', 'voice', 'voice-pencil', 'diary']:
        pg.goto(url + '#' + r); pg.wait_for_timeout(250)
        if not pg.inner_text('#view').strip(): fails.append(f'#{r}: пустой экран')
    v = pg.evaluate("[typeof CAM_OK, typeof MIC_DIRECT, typeof state, typeof BALL_LEVELS]")
    if 'undefined' in v: fails.append(f'значения не вычислены при загрузке: {v}')
    if errs: fails.append('ошибки:\n  ' + '\n  '.join(sorted(set(errs))[:20]))
    # CSP собранной страницы: наш скрипт работает, подброшенный onclick браузер не выполняет
    pg2 = br.new_page(); e2 = []; pg2.on('pageerror', lambda e: e2.append(str(e)))
    pg2.goto('file://' + os.path.join(ROOT, 'index.html') + '#today'); pg2.wait_for_timeout(500)
    r = pg2.evaluate("(() => { const b = document.createElement('button'); b.setAttribute('onclick', 'window.__hacked = 1'); document.body.appendChild(b); b.click(); return [window.__hacked === undefined, document.querySelectorAll('#view *').length > 5, !!document.querySelector('meta[http-equiv=Content-Security-Policy]')]; })()")
    if r != [True, True, True]: fails.append(f'CSP: чужой onclick заблокирован / страница работает / политика есть = {r}')
    if e2: fails.append('ошибки на собранной странице: ' + '; '.join(e2[:5]))
    br.close()
srv.shutdown()
print('\n'.join(fails) if fails else 'OK: модули грузятся в правильном порядке, CSP блокирует чужие скрипты')
sys.exit(1 if fails else 0)

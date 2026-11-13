#!/usr/bin/env python3
"""Статические проверки кода (быстрые, без браузера):
- собранный JS синтаксически верен (node --check);
- нет опасных приёмов: eval, new Function, document.write, setTimeout со строкой;
- нет внешних скриптов, кроме шрифтов Google (никаких сторонних библиотек без решения);
- в текстах нет длинного тире (правило Кита: только дефис);
- нет случайно закоммиченных ключей и паролей.
Запуск: python3 tests/check_code.py"""
import os, re, subprocess, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fails = []
src = {f: open(os.path.join(ROOT, 'src', f), encoding='utf-8').read() for f in os.listdir(os.path.join(ROOT, 'src')) if f.endswith(('.js', '.css'))}
html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
# 1. синтаксис собранного JS
js = html[html.index('<script>') + 8:html.rindex('</script>')]
with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as t: t.write(js); tmp = t.name
r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
if r.returncode: fails.append('синтаксис index.html: ' + r.stderr.strip().splitlines()[-1])
os.unlink(tmp)
# 2. опасные приёмы
for f, s in src.items():
    for pat, why in [(r'\beval\s*\(', 'eval'), (r'new\s+Function\s*\(', 'new Function'), (r'document\.write', 'document.write'), (r'setTimeout\s*\(\s*[\'"`]', 'setTimeout со строкой')]:
        for m in re.finditer(pat, s): fails.append(f'{f}:{s[:m.start()].count(chr(10)) + 1}: {why}')
# 3. внешние скрипты
for m in re.finditer(r'<script[^>]+src=|import\s*\(\s*[\'"]https?:', html): fails.append('внешний скрипт в index.html: ' + html[m.start():m.start() + 80])
for m in re.finditer(r'https?://[^\s\'"`)]+', html):
    u = m.group(0)
    if not re.match(r'https://(fonts\.googleapis\.com|fonts\.gstatic\.com|nchurashov\.github\.io)', u): fails.append('внешний адрес: ' + u)
# 4. длинное тире в текстах
for f, s in src.items():
    for i, line in enumerate(s.splitlines(), 1):
        if '—' in line: fails.append(f'{f}:{i}: длинное тире')
# 5. ключи и пароли
for f, s in src.items():
    if re.search(r'(api[_-]?key|secret|password|token)\s*[:=]\s*[\'"][^\'"]{8,}', s, re.I): fails.append(f'{f}: похоже на ключ или пароль в коде')
print('\n'.join(fails) if fails else 'OK: код без опасных приёмов, внешних скриптов и длинных тире')
sys.exit(1 if fails else 0)

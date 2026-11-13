#!/usr/bin/env python3
"""Собирает src/* в один index.html (корень = GitHub Pages) и копирует в www/ для iOS."""
import os, shutil
R = os.path.dirname(os.path.abspath(__file__)); S = lambda f: open(os.path.join(R, 'src', f), encoding='utf-8').read()
css = S('app.css'); js = '\n'.join(S(f) for f in ['analysis.js', 'data.js', 'app.js', 'game.js', 'ball.js', 'range.js', 'warmup.js'])
html = f'''<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Вокал: ежедневная практика</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@500;600&family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>{css}
.app{{padding-top:max(16px,env(safe-area-inset-top))}}</style></head>
<body><div class="app"><header class="top"><div class="brand"><div class="logo"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2"/></svg></div><b>Вокал</b></div>
<button class="iconbtn" aria-label="Настройки" onclick="openSettings()" id="gear"></button></header>
<main id="view"></main></div><nav class="tabs" id="tabs"></nav>
<script>{js}
document.getElementById('gear').innerHTML = ICON.gear;
start();
</script></body></html>'''
open(os.path.join(R, 'index.html'), 'w', encoding='utf-8').write(html)
os.makedirs(os.path.join(R, 'www'), exist_ok=True); shutil.copy(os.path.join(R, 'index.html'), os.path.join(R, 'www', 'index.html'))
print('index.html:', len(html), 'байт')

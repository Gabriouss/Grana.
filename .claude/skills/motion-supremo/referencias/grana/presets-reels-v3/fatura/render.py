"""Render deterministico da cena v3.
python render.py stills t1 t2 ...   -> provas/qNN_t.jpg
python render.py video [fps_captura] -> saida/video-sem-audio.mp4 (60 fps, mistura de quadros = motion blur)
"""
import sys, subprocess, pathlib
from playwright.sync_api import sync_playwright
B = pathlib.Path(r'E:/Grana-temporarios/reels-fatura-v3')
URL = 'http://127.0.0.1:8765/projeto/index.html'
DUR = 19.75
mode = sys.argv[1]
with sync_playwright() as p:
    br = p.chromium.launch(headless=True, args=['--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'])
    pg = br.new_page(viewport={'width': 1080, 'height': 1920}, device_scale_factor=1)
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
    pg.goto(URL, wait_until='networkidle')
    pg.wait_for_function('window.__ready===true', timeout=60000)
    if erros: print('ERROS', erros)
    if mode == 'stills':
        out = B / 'provas'; out.mkdir(exist_ok=True)
        for f in out.glob('*.jpg'): f.unlink()
        for i, t in enumerate(map(float, sys.argv[2:])):
            pg.evaluate('(t)=>window.renderAt(t)', t)
            pg.screenshot(path=str(out / f'q{i:02}_{t:05.2f}s.jpg'), type='jpeg', quality=88)
        print('ok', len(sys.argv) - 2)
    else:
        cap = int(sys.argv[2]) if len(sys.argv) > 2 else 120
        n = round(DUR * cap)
        (B / 'saida').mkdir(exist_ok=True)
        blend = cap // 60
        vf = f'tmix=frames={blend}:weights=' + "'" + ' '.join(['1'] * blend) + "'" + f',fps=60' if blend > 1 else 'fps=60'
        ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'image2pipe', '-framerate', str(cap), '-c:v', 'mjpeg', '-i', '-',
                               '-vf', vf + ',format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-r', '60',
                               str(B / 'saida' / 'video-sem-audio.mp4')], stdin=subprocess.PIPE)
        for i in range(n):
            pg.evaluate('(t)=>window.renderAt(t)', i / cap)
            ff.stdin.write(pg.screenshot(type='jpeg', quality=95))
            if i % 240 == 0: print(f'{i}/{n}', flush=True)
        ff.stdin.close(); ff.wait()
        print('fim', ff.returncode, erros[:5])
    br.close()

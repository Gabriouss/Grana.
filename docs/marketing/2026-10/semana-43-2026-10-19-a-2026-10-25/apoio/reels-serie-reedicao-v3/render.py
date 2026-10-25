"""Série Reels: python render.py <n> stills t1 t2 ... | video | mix | checar
Cena: serie/v.html?n=<n> (função pura do tempo). Vídeo: captura 120 q/s misturada em pares -> 60 fps."""
import sys, subprocess, json, pathlib
from playwright.sync_api import sync_playwright
B = pathlib.Path(r'E:/Grana-temporarios/reels-fatura-v3')
FX = r'C:/Users/user/.local/share/editonny/engine/assets/sfx/'
n, mode = sys.argv[1], sys.argv[2]
OUT = B / 'saida' / f'v{n}'; OUT.mkdir(parents=True, exist_ok=True)
def pagina(p):
    br = p.chromium.launch(headless=True, args=['--use-angle=d3d11', '--disable-background-timer-throttling'])
    pg = br.new_page(viewport={'width': 1080, 'height': 1920})
    erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(f'http://127.0.0.1:8765/serie/v.html?n={n}', wait_until='networkidle'); pg.wait_for_function('window.__ready===true', timeout=60000)
    if erros: print('ERROS', erros)
    return br, pg
def ln(src):
    e = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(src), '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return json.loads(e[e.rindex('{'):e.rindex('}') + 1])
with sync_playwright() as p:
    br, pg = pagina(p)
    cfg = pg.evaluate('({dur:window.DUR,voz:window.VOZ,trilha:window.TRILHA,sfx:window.SFX})')
    if mode == 'stills':
        pv = B / 'provas' / f'v{n}'; pv.mkdir(parents=True, exist_ok=True)
        for f in pv.glob('*.jpg'): f.unlink()
        for i, t in enumerate(map(float, sys.argv[3:])):
            pg.evaluate('(t)=>window.renderAt(t)', t); pg.screenshot(path=str(pv / f'q{i:02}_{t:05.2f}s.jpg'), type='jpeg', quality=88)
        from PIL import Image
        fs = sorted(pv.glob('q*.jpg')); c = 8; r = (len(fs) + c - 1) // c
        S = Image.new('RGB', (c * 240, r * 427))
        for i, f in enumerate(fs): S.paste(Image.open(f).resize((240, 427)), ((i % c) * 240, (i // c) * 427))
        S.save(pv / 'folha.jpg', quality=90); print('ok', len(fs))
    elif mode == 'video':
        cap = 120; total = round(cfg['dur'] * cap)
        ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'image2pipe', '-framerate', str(cap), '-c:v', 'mjpeg', '-i', '-',
            '-vf', "tmix=frames=2:weights='1 1',fps=60,format=yuv420p", '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-r', '60', str(OUT / 'video.mp4')], stdin=subprocess.PIPE)
        for i in range(total):
            pg.evaluate('(t)=>window.renderAt(t)', i / cap); ff.stdin.write(pg.screenshot(type='jpeg', quality=95))
        ff.stdin.close(); ff.wait(); print('video', ff.returncode)
    elif mode == 'mix':
        DUR = cfg['dur']; ev = cfg['sfx']; pre = OUT / 'mix.wav'
        cmd = ['ffmpeg', '-y', '-v', 'error', '-i', cfg['voz'], '-ss', str(cfg['trilha']['inicio']), '-i', cfg['trilha']['arquivo']]
        for f, _, _ in ev: cmd += ['-i', FX + f if not f.startswith('E:') else f]
        gv = -14 - float(ln(cfg['voz'])['input_i'])
        fc = (f'[0:a]aformat=sample_rates=48000:channel_layouts=stereo,volume={gv:.2f}dB,asplit=2[voz][key];'
              f'[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=-6dB,afade=t=out:st={DUR - 1.2}:d=1.2[mus];'
              '[mus][key]sidechaincompress=threshold=0.03:ratio=5:attack=15:release=250[bed];')
        for j, (_, t, g) in enumerate(ev):
            d = round(t * 1000); fc += f'[{j + 2}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume={g},adelay={d}|{d}[e{j}];'
        fc += '[voz][bed]' + ''.join(f'[e{j}]' for j in range(len(ev))) + f'amix=inputs={len(ev) + 2}:duration=longest:normalize=0,apad,atrim=duration={DUR}[m]'
        subprocess.run(cmd + ['-filter_complex', fc, '-map', '[m]', '-ar', '48000', '-c:a', 'pcm_f32le', str(pre)], check=True)
        q = ln(pre)
        af = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={q['input_i']}:measured_TP={q['input_tp']}:measured_LRA={q['input_lra']}"
              f":measured_thresh={q['input_thresh']}:offset={q['target_offset']}:linear=true")
        fim = OUT / 'final.mp4'
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(OUT / 'video.mp4'), '-i', str(pre), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', af,
                        '-ar', '48000', '-ac', '2', '-c:a', 'aac', '-b:a', '256k', '-t', str(DUR), '-movflags', '+faststart', str(fim)], check=True)
        m = ln(fim); print('final', fim, m['input_i'], m['input_tp'])
    br.close()

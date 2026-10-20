"""Reels 'Conheça o Granabô' com as gravações reais do celular nas duas cenas do app.
Usa o montar.py do repositório; troca só a tela do celular. Saída: granabo-reels-real.mp4"""
import os, sys, subprocess, glob
REPO = r'E:\GranaPonto\docs\marketing\reels-granabo'
sys.path.insert(0, REPO); os.chdir(REPO)
import montar as M
from PIL import Image
AQUI = os.path.dirname(os.path.abspath(__file__))
SEG = os.path.join(AQUI, 'seg'); CEL = os.path.join(AQUI, '..', 'capturas-app', 'celular')
w, h = M.TX1 - M.TX0, M.TY1 - M.TY0
FPS = M.FPS
# (clipe, início na cena, fim na cena, início na fonte, fim na fonte)  -- tempos da cena (sem o ATRASO)
PLANO = {
 'consulta': ('granachat-consulta', [(7.0, 8.4, 0.0, 0.0), (8.4, 10.8, 2.0, 13.2), (10.8, 11.3, 14.0, 14.5), (11.3, 13.8, 18.3, 20.8)]),
 'registro': ('granachat-registro', [(13.4, 15.4, 4.0, 11.5), (15.4, 15.9, 12.0, 12.5), (15.9, 18.7, 18.2, 21.0)]),
}
def prepara():
    for nome, (clipe, trechos) in PLANO.items():
        for i, (a, b, s0, s1) in enumerate(trechos):
            d = os.path.join(SEG, f'{nome}{i}'); 
            if glob.glob(d + '/*.png'): continue
            os.makedirs(d, exist_ok=True)
            n = round((b - a) * FPS)
            # cobre a tela do mockup (corte central) a partir do 1080x2388
            vf = f'setpts=PTS-STARTPTS,fps={FPS},scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}'
            if s1 > s0:
                vf = f'setpts=(PTS-STARTPTS)*{(b-a)/(s1-s0):.5f},fps={FPS},scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}'
                cmd = ['ffmpeg','-y','-loglevel','error','-ss',str(s0),'-t',str(s1-s0),'-i',os.path.join(CEL,clipe+'.mp4'),'-vf',vf,'-frames:v',str(n),'-an',d+'/%04d.png']
            else:
                cmd = ['ffmpeg','-y','-loglevel','error','-ss',str(s0),'-i',os.path.join(CEL,clipe+'.mp4'),'-frames:v','1','-vf',f'scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}',d+'/0001.png']
            subprocess.run(cmd, check=True)
prepara()
def frame_cena(t, nome):
    trechos = PLANO[nome][1]
    for i, (a, b, s0, s1) in enumerate(trechos):
        if a <= t < b or (i == len(trechos) - 1 and t >= b):
            arq = sorted(glob.glob(os.path.join(SEG, f'{nome}{i}', '*.png')))
            k = min(len(arq) - 1, max(0, int((t - a) * FPS))) if s1 > s0 else 0
            return Image.open(arq[k]).convert('RGBA')
    return Image.open(sorted(glob.glob(os.path.join(SEG, f'{nome}0', '*.png')))[0]).convert('RGBA')
_orig_tela, _orig_cel = M.tela, M.celular
def celular(fr, t, rotulo, sub, **kw):
    if rotulo.startswith('CENA'):
        nome = 'consulta' if 'Consulta' in sub else 'registro'
        im = frame_cena(t, nome)
        # cantos arredondados do vidro
        from PIL import ImageDraw
        m = Image.new('L', (w*3, h*3), 0); ImageDraw.Draw(m).rounded_rectangle([0,0,w*3,h*3], 40*3, fill=255)
        im.putalpha(m.resize((w, h), Image.LANCZOS))
        M.tela = lambda r, s: im
        M._telas.clear()
        try: return _orig_cel(fr, t, rotulo, sub, **kw)
        finally: M.tela = _orig_tela
    return _orig_cel(fr, t, rotulo, sub, **kw)
M.celular = celular
if __name__ == '__main__':
    M.garantir_quadros()
    saida = os.path.join(AQUI, 'granabo-reels-real.mp4')
    plim = os.path.join(REPO, '..', 'identidade-sonora', 'plim-sucesso.wav')
    cmd = ['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{M.W}x{M.H}','-r',str(FPS),'-i','-','-i',plim,
           '-filter_complex','[1:a]adelay=16900|16900,apad,atrim=0:25,volume=0.6[a]','-map','0:v','-map','[a]','-c:v','libx264','-pix_fmt','yuv420p','-crf','20','-c:a','aac','-b:a','192k','-movflags','+faststart',saida]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(int(M.DUR * FPS)):
        p.stdin.write(M.quadro(i / FPS).convert('RGB').tobytes())
        if i % 60 == 0: print('quadro', i, flush=True)
    p.stdin.close(); p.wait(); print('ok', saida)

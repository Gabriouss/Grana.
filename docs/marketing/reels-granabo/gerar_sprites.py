"""Renderiza as poses do Granabô (W3 + boca L3) em PNG com fundo transparente.

Saída em sprites/ (fora do git): giro de perfil para frente, piscada, olhos felizes.
Uso: python gerar_sprites.py   (usa todos os núcleos; ~5 min)
"""
import os, sys
from multiprocessing import Pool
AQUI = os.path.dirname(os.path.abspath(__file__))
MASCOTE = os.path.join(AQUI, '..', '..', 'mascote')
sys.path.insert(0, MASCOTE)
import numpy as np
from PIL import Image

SS = 2           # supersampling para borda suave
LADO = 700       # sprite final 700x700; esfera com ~636 px de diâmetro
S = 1.1

def base():
    src = open(os.path.join(MASCOTE, 'gerar_comparativo.py')).read().split('N=520')[0]
    g = {'__file__': os.path.join(MASCOTE, 'gerar_comparativo.py')}
    exec(src, g)
    return g['L3']

def poses():
    L3 = base()
    out = []
    # giro: 31 quadros de -90° a 0°, ease-in-out; olhos acendem no fim
    for i in range(31):
        t = i / 30; e = t * t * (3 - 2 * t)
        glow = min(1, max(0, (t - 0.7) / 0.3))
        out.append((f'giro-{i:02d}', dict(L3, glow=glow), -90 + 90 * e))
    # piscada: altura do olho 0,13 -> 0,02 -> 0,13
    for i, h in enumerate([0.09, 0.04, 0.02]):
        out.append((f'piscada-{i}', dict(L3, eye_h=h), 0))
    out.append(('frente', L3, 0))
    feliz = dict(L3, shape='happy', eye_h=0.11, eye_w=0.11)
    out.append(('feliz', feliz, 0))
    return out

def render_um(args):
    nome, V, deg = args
    destino = os.path.join(AQUI, 'sprites', nome + '.png')
    if os.path.exists(destino):
        return nome
    import granabo_modelo as gm
    img, al = gm.render(V, N=LADO * SS, S=S, deg=deg)
    rgba = np.dstack([img, al])
    im = Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA').resize((LADO, LADO), Image.LANCZOS)
    im.save(destino)
    return nome

if __name__ == '__main__':
    os.makedirs(os.path.join(AQUI, 'sprites'), exist_ok=True)
    with Pool() as p:
        for n in p.imap_unordered(render_um, poses()):
            print('ok', n, flush=True)

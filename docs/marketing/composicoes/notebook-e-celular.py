"""Compõe notebook + celular lado a lado, com fundo transparente.

Fontes: notebook-3q-fonte.webp e celular-3q-fonte.webp (mockups com a tela do
Grana. aplicada, fundo transparente). Saída: notebook-e-celular.png.
Os parâmetros de posição ficam no topo para ajuste fino.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__))
nb = Image.open(os.path.join(AQUI, 'notebook-3q-fonte.webp')).convert('RGBA')
ce = Image.open(os.path.join(AQUI, 'celular-3q-fonte.webp')).convert('RGBA')
nb = nb.crop(nb.getbbox()); ce = ce.crop(ce.getbbox())

ESC_CEL = 0.53          # celular em relação ao tamanho original
CEL_X = 0.84            # centro do celular, em fração da largura do notebook
CEL_BASE = 0.98         # base do celular, em fração da altura do notebook
ce = ce.resize((round(ce.width * ESC_CEL), round(ce.height * ESC_CEL)), Image.LANCZOS)

PAD = 80
W = max(nb.width, round(nb.width * CEL_X + ce.width / 2)) + 2 * PAD
H = max(nb.height, round(nb.height * CEL_BASE)) + 2 * PAD + 40
tela = Image.new('RGBA', (W, H), (0, 0, 0, 0))
nx, ny = PAD, PAD + 40
cx = round(nx + nb.width * CEL_X - ce.width / 2)
cy = round(ny + nb.height * CEL_BASE - ce.height)

def sombra(poligono, blur, opac):
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon(poligono, fill=int(255 * opac))
    m = m.filter(ImageFilter.GaussianBlur(blur))
    s = Image.new('RGBA', (W, H), (0, 0, 0, 255)); s.putalpha(m); return s

# sombra do notebook na mesa: contorno da base, achatado e desfocado
a = np.array(nb)[..., 3]
ys, xs = np.where(a > 20)
base = []
for x in range(xs.min(), xs.max() + 1, 8):
    col = ys[xs == x]
    if len(col): base.append((nx + x, ny + col.max()))
pts = [(x, y + 6) for x, y in base] + [(x, y - 40) for x, y in reversed(base)]
tela.alpha_composite(sombra(pts, 22, 0.55))
tela.alpha_composite(sombra(pts, 6, 0.35))
tela.alpha_composite(nb, (nx, ny))

# sombra de contato do celular, e a sombra que ele joga sobre o notebook atrás
b = cy + ce.height
tela.alpha_composite(sombra([(cx + ce.width * 0.05, b - 8), (cx + ce.width * 0.95, b - 18),
                             (cx + ce.width * 0.95, b + 6), (cx + ce.width * 0.05, b + 16)], 14, 0.6))
tela.alpha_composite(sombra([(cx - 40, cy + 80), (cx + ce.width * 0.3, cy + 60),
                             (cx + ce.width * 0.3, b - 20), (cx - 60, b - 10)], 40, 0.35))
tela.alpha_composite(ce, (cx, cy))

tela = tela.crop(tela.getbbox())
tela.save(os.path.join(AQUI, 'notebook-e-celular.png'))
print('ok', tela.size)

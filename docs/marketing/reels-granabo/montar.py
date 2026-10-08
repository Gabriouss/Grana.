"""Monta a prévia do Reels "Conheça o Granabô" (1080x1920, 30 fps, 24 s).

Segue docs/marketing/roteiro-reels-granabo-apresentacao.md e os números do
guia-de-estilo-de-video.md. As duas cenas do app (consulta e registro) ainda
não foram gravadas: aparecem como tela marcada "CENA A GRAVAR NA M1".

Uso: python gerar_sprites.py && python montar.py
Saída: granabo-reels-previa.mp4
"""
import os, math, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
W, H, FPS, DUR = 1080, 1920, 30, 24.0
BASE = (239, 255, 254)       # #EFFFFE
DEST = (173, 251, 227)       # #ADFBE3
FONTE = os.path.join(RAIZ, 'assets', 'fonts', 'NeueMachina-Light.otf')
SPR = os.path.join(AQUI, 'sprites')

def easeout(t): t = min(1, max(0, t)); return 1 - (1 - t) ** 3
def easeio(t): t = min(1, max(0, t)); return t * t * (3 - 2 * t)
def lin(t): return min(1, max(0, t))

# ---------- fundo ----------
def fundo():
    y = np.linspace(0, 1, H)[:, None]; x = np.linspace(0, 1, W)[None, :]
    top = np.array([2, 19, 25]); mid = np.array([2, 23, 33])
    base = top + (mid - top) * np.clip(y / 0.5, 0, 1)[..., None]
    d = np.sqrt(((x - 0.5) * W) ** 2 + ((y - 0.93) * H) ** 2)
    g = np.exp(-(d / 620) ** 2)[..., None]
    img = base * (1 - g) + np.array([11, 74, 90]) * g
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert('RGBA')
BG = fundo()

# ---------- texto ----------
def layout(texto, tam, largura, track):
    f = ImageFont.truetype(FONTE, tam)
    palavras = texto.split()
    def larg(p): return sum(f.getlength(c) + track for c in p) - track
    esp = f.getlength(' ') + track
    linhas, atual, w = [], [], 0
    for p in palavras:
        lp = larg(p.strip('*'))
        if atual and w + esp + lp > largura:
            linhas.append(atual); atual, w = [], 0
        atual.append(p); w += (esp if w else 0) + lp
    linhas.append(atual)
    return f, linhas, larg, esp

def desenha_texto(fr, texto, tam, entra, passo, dur_p, sobe, x0, y0, centro=False,
                  sai=None, sai_dur=0.4, sai_sobe=0, t=0, entrelinha=None, largura=800, track=None):
    track = tam * 0.05 if track is None else track
    f, linhas, larg, esp = layout(texto, tam, largura, track)
    lh = entrelinha or tam * 1.25
    camada = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(camada)
    k = 0
    a_sai, dy_sai = 1, 0
    if sai is not None and t > sai:
        q = lin((t - sai) / sai_dur); a_sai = 1 - q; dy_sai = -sai_sobe * q
    for i, linha in enumerate(linhas):
        wl = sum(larg(p.strip('*')) for p in linha) + esp * (len(linha) - 1)
        x = (W - wl) / 2 if centro else x0
        y = y0 + i * lh
        for p in linha:
            dest = p.startswith('*'); p = p.strip('*')
            q = easeout((t - (entra + k * passo)) / dur_p)
            a = q * a_sai
            if a > 0.01:
                cor = DEST if dest else BASE
                xx = x
                for c in p:
                    d.text((xx, y + sobe * (1 - q) + dy_sai), c, font=f, fill=cor + (int(255 * a),))
                    xx += f.getlength(c) + track
            x += larg(p) + esp; k += 1
    fr.alpha_composite(camada)

# ---------- mascote ----------
_cache = {}
def sprite(nome):
    if nome not in _cache: _cache[nome] = Image.open(os.path.join(SPR, nome + '.png')).convert('RGBA')
    return _cache[nome]

def cola_mascote(fr, nome, cx, cy, escala=1.0, alfa=1.0, sombra=True, chao=None):
    sp = sprite(nome)
    if escala != 1.0:
        n = max(2, int(sp.width * escala)); sp = sp.resize((n, n), Image.LANCZOS)
    if alfa < 1:
        a = sp.getchannel('A').point(lambda v: int(v * alfa)); sp = sp.copy(); sp.putalpha(a)
    if sombra and alfa > 0.02:
        chao = chao or 900 + 380
        r = 318 * escala
        dist = max(0, chao - (cy + r))
        op = alfa * max(0, 0.5 - dist / 900)
        sh = Image.new('L', (W, H), 0)
        ImageDraw.Draw(sh).ellipse([cx - r * 0.75, chao - 16 * escala, cx + r * 0.75, chao + 16 * escala], fill=int(255 * op))
        sh = sh.filter(ImageFilter.GaussianBlur(14))
        preto = Image.new('RGBA', (W, H), (0, 6, 9, 255)); preto.putalpha(sh)
        fr.alpha_composite(preto)
    fr.alpha_composite(sp, (int(cx - sp.width / 2), int(cy - sp.height / 2)))

# ---------- celular (marcador da cena real) ----------
CEL = dict(x=223, y=300, w=634, h=1400, r=92, borda=22)
def celular(fr, t, rotulo, sub, dy=0, escala=1.0, alfa=1.0, botao_brilho=0.0):
    w, h = CEL['w'] * escala, CEL['h'] * escala
    x = W / 2 - w / 2; y = CEL['y'] + dy - (h - CEL['h']) / 2 * 0  # topo parado no push-in
    c = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(c)
    # sombra
    sh = Image.new('L', (W, H), 0); ImageDraw.Draw(sh).rounded_rectangle([x - 10, y + 30, x + w + 10, y + h + 40], CEL['r'], fill=150)
    sh = sh.filter(ImageFilter.GaussianBlur(40)); s = Image.new('RGBA', (W, H), (0, 0, 0, 255)); s.putalpha(sh)
    c.alpha_composite(s)
    d.rounded_rectangle([x, y, x + w, y + h], CEL['r'] * escala, fill=(7, 11, 13, 255), outline=(40, 52, 56, 255), width=3)
    b = CEL['borda'] * escala
    d.rounded_rectangle([x + b, y + b, x + w - b, y + h - b], (CEL['r'] - 20) * escala, fill=(10, 30, 37, 255))
    d.ellipse([W / 2 - 9, y + b + 18, W / 2 + 9, y + b + 36], fill=(0, 0, 0, 255))
    # barra de abas com o disco do Granabô
    by = y + h - b - 90 * escala
    d.rectangle([x + b, by, x + w - b, y + h - b - 40], fill=(5, 22, 28, 255))
    bx, bcy, br = W / 2, by + 10 * escala, 44 * escala
    d.ellipse([bx - br, bcy - br, bx + br, bcy + br], fill=(174, 255, 227, 255))
    f1 = ImageFont.truetype(FONTE, int(40 * escala)); f2 = ImageFont.truetype(FONTE, int(28 * escala))
    d.text((W / 2, y + h * 0.42), rotulo, font=f1, fill=DEST + (255,), anchor='mm', align='center')
    d.multiline_text((W / 2, y + h * 0.52), sub, font=f2, fill=(150, 190, 190, 255), anchor='ma', align='center', spacing=14)
    if alfa < 1:
        a = c.getchannel('A').point(lambda v: int(v * alfa)); c.putalpha(a)
    fr.alpha_composite(c)
    return bx, bcy

LOGO = Image.open(os.path.join(AQUI, 'logo-gradiente-1200.png')).convert('RGBA')
LOGO = LOGO.crop(LOGO.getbbox()); LOGO = LOGO.resize((600, int(LOGO.height * 600 / LOGO.width)), Image.LANCZOS)

# ---------- linha do tempo ----------
def quadro(t):
    fr = BG.copy()
    # 1. bloco de abertura
    if t < 4.1:
        desenha_texto(fr, 'Tem dúvida sobre o seu *dinheiro?* Pergunte para quem anota *tudo.*',
                      82, entra=0.2, passo=0.133, dur_p=0.267, sobe=19, x0=84, y0=960 - 2.5 * 103,
                      entrelinha=103, sai=3.6, sai_sobe=44, t=t, largura=880)
    # 2-4. mascote: entrada, giro, piscada, flutuação, vai para o botão
    if 3.9 <= t < 8.4:
        cx, cy, esc, alfa = 540, 900, 1.0, 1.0
        if t < 4.43:
            cy = 2300 + (840 - 2300) * easeout((t - 3.9) / 0.53)
        elif t < 4.8:
            cy = 840 + 60 * easeio((t - 4.43) / 0.37)
        nome = 'giro-00'
        if t >= 4.8: nome = 'giro-%02d' % min(30, int((t - 4.8) * FPS))
        if t >= 5.85:
            nome = 'frente'
            k = int((t - 5.95) * FPS)
            if 0 <= k < 5: nome = ['piscada-0', 'piscada-1', 'piscada-2', 'piscada-1', 'piscada-0'][k]
        if 6.2 <= t < 7.6: cy = 900 - 8 * math.sin((t - 6.2) / 1.4 * 2 * math.pi)
        if t >= 7.6:
            q = easeio((t - 7.6) / 0.8)
            alvo_x, alvo_y = 540, 300 + 1400 - 22 - 80   # disco da barra, celular já assentado
            cx = 540 + (alvo_x - 540) * q
            cy = 900 + (alvo_y - 900) * q - 120 * math.sin(math.pi * q)
            esc = 1 + (0.14 - 1) * q
            alfa = 1 - lin((t - 8.15) / 0.25)
        if t >= 7.6:
            dyc = 1300 * (1 - easeout((t - 7.6) / 0.6))
            celular(fr, t, 'CENA A GRAVAR NA M1', 'Consulta ao Granabô\n"quanto eu gastei em\nAlimentação esse mês?"\nresposta: R$ 103,05', dy=dyc)
        cola_mascote(fr, nome, cx, cy, esc, alfa, sombra=t < 7.8)
    # título 1
    if 5.8 <= t < 8.0:
        desenha_texto(fr, 'Esse é o *Granabô.*', 59, entra=5.8, passo=0.07, dur_p=0.25, sobe=12,
                      x0=0, y0=130, centro=True, sai=7.6, sai_dur=0.33, t=t, largura=1000)
    # 5. consulta
    if 8.4 <= t < 13.7:
        esc = 1 + 0.07 * easeout((t - 8.4) / 5.0)
        celular(fr, t, 'CENA A GRAVAR NA M1', 'Consulta ao Granabô\n"quanto eu gastei em\nAlimentação esse mês?"\nresposta: R$ 103,05', escala=esc)
        desenha_texto(fr, 'Pergunte o que *quiser.*', 59, entra=8.4, passo=0.07, dur_p=0.25, sobe=12,
                      x0=0, y0=130, centro=True, sai=13.4, sai_dur=0.33, t=t, largura=1000)
    # 6. registro (dissolve 13,4–13,7)
    if 13.4 <= t < 18.6:
        a = lin((t - 13.4) / 0.27) * (1 - lin((t - 18.2) / 0.4))
        celular(fr, t, 'CENA A GRAVAR NA M1', 'Registro pelo Granabô\n"gastei 23,90 no mercado"\nlançamento salvo', escala=1.07, alfa=a)
        if t >= 13.7:
            desenha_texto(fr, 'Ou só conte o *gasto.*', 59, entra=13.7, passo=0.07, dur_p=0.25, sobe=12,
                          x0=0, y0=130, centro=True, sai=18.2, sai_dur=0.4, t=t, largura=1000)
    # 7. volta do mascote, feliz
    if 18.6 <= t < 21.9:
        cy = 900
        if t < 19.13: cy = 2300 + (840 - 2300) * easeout((t - 18.6) / 0.53)
        elif t < 19.5: cy = 840 + 60 * easeio((t - 19.13) / 0.37)
        else: cy = 900 - 8 * math.sin((t - 19.5) / 1.4 * 2 * math.pi)
        alfa = 1 - lin((t - 21.5) / 0.4)
        q = lin((t - 19.6) / 0.2)
        cola_mascote(fr, 'frente', 540, cy, 1, alfa * (1 - q))
        if q > 0: cola_mascote(fr, 'feliz', 540, cy, 1, alfa * q, sombra=False)
        desenha_texto(fr, 'Ele cuida das *contas.* Você vive.', 59, entra=19.3, passo=0.07, dur_p=0.25, sobe=12,
                      x0=0, y0=130, centro=True, sai=21.5, sai_dur=0.4, t=t, largura=1000, entrelinha=76)
    # 8. fecho
    if t >= 21.9:
        a = easeout((t - 21.9) / 0.47)
        lg = LOGO.copy(); lg.putalpha(lg.getchannel('A').point(lambda v: int(v * a)))
        fr.alpha_composite(lg, (240, 960 - lg.height // 2))
    return fr

if __name__ == '__main__':
    saida = os.path.join(AQUI, 'granabo-reels-previa.mp4')
    plim = os.path.join(AQUI, '..', 'identidade-sonora', 'plim-sucesso.wav')
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
           '-i', plim, '-filter_complex', '[1:a]adelay=16000|16000,apad,atrim=0:24,volume=0.6[a]',
           '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-c:a', 'aac', '-b:a', '192k',
           '-movflags', '+faststart', saida]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(int(DUR * FPS)):
        p.stdin.write(quadro(i / FPS).convert('RGB').tobytes())
        if i % 60 == 0: print('quadro', i, flush=True)
    p.stdin.close(); p.wait(); print('ok', saida)

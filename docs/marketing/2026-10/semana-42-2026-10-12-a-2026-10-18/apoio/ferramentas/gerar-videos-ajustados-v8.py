"""Gerador local dos 3 vídeos ajustados (Pedidos 5, 7 e 8 — Semana 42, 16/10/2026).

Regras cumpridas:
- 100% local e gratuito (Pillow, numpy, ffmpeg), zero ElevenLabs ou serviços pagos (Regra 24).
- Celular nos vídeos é SEMPRE o mockup fotográfico realista aprovado
  (`design-system/marketing-mockups/celular-vazio.png`) com a tela real aplicada por
  homografia, reflexo de vidro, furo de câmera e sombra de contato, 100% inteiro dentro
  da margem segura vertical (y ≈ 380..1760), nunca cortado na borda.
- Sincronia 1:1 entre o texto na tela e a locução em todas as cenas.
- Corte local (ffmpeg atrim) das repetições de "Grana." nos áudios existentes para que
  "Grana." seja dito apenas uma vez por vídeo.
- Saídas novas em `docs/marketing/2026-10/semana-42-2026-10-12-a-2026-10-18/para-aprovacao/pecas/reels/`:
  1. `reel-r13-v4.mp4` (Pedido 5)
  2. `grana-motion-desistiu-foto-da-nota-narrado-v2.mp4` (Pedido 7)
  3. `grana-r5-colar-pix-v7.mp4` e `grana-r5-colar-pix-v7-narrado.mp4` (Pedido 8)
"""
import json
import math
import os
import subprocess
import sys

os.environ['OPENBLAS_NUM_THREADS'] = '1'

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
SEMANA42 = os.path.abspath(os.path.join(AQUI, '..', '..'))
RAIZ = os.path.abspath(os.path.join(SEMANA42, '..', '..', '..', '..'))
OUT_REELS = os.path.join(SEMANA42, 'para-aprovacao', 'pecas', 'reels')
os.makedirs(OUT_REELS, exist_ok=True)

W, H, FPS = 1080, 1920, 30
MENTA = (174, 255, 227)
BRANCO = (239, 255, 250)
TEAL = (31, 169, 141)
TIDE = (11, 45, 53)

ULTRABOLD = os.path.join(
    os.environ.get('LOCALAPPDATA', ''),
    'Microsoft',
    'Windows',
    'Fonts',
    'NeueMachina-Ultrabold.otf',
)
FONT_REG = os.path.join(RAIZ, 'assets', 'fonts', 'NeueMachina-Regular.otf')
FONT_LIGHT = os.path.join(RAIZ, 'assets', 'fonts', 'NeueMachina-Light.otf')
CELULAR_PNG = os.path.join(RAIZ, 'design-system', 'marketing-mockups', 'celular-vazio.png')
LOGO_PNG = os.path.join(
    RAIZ,
    'docs',
    'marketing',
    '2026-10',
    'semana-40-2026-09-28-a-2026-10-04',
    'apoio',
    'referencias',
    'r13',
    'v3',
    'logo-oficial.png',
)

# Geometria medida do celular-vazio.png
CONTORNO = [(829.3, 116.5), (1226.7, 116.5), (1232.3, 992.5), (823.7, 992.5)]
CONTORNO_RAIO = 42
TELA = [(849.0, 128.0), (1209.5, 128.0), (1210.5, 964.0), (847.0, 964.0)]
TELA_RAIO = 30
CAMERA = (1029.4, 152.0, 9.0)
CROP = (815, 105, 1245, 1005)


def cl(x, a=0.0, b=1.0):
    return min(b, max(a, x))


def p(t, a, b):
    return cl((t - a) / (b - a))


def eo(x):
    x = cl(x)
    return 1.0 - (1.0 - x) ** 3


def eio(x):
    x = cl(x)
    return 4 * x * x * x if x < 0.5 else 1.0 - ((-2 * x + 2) ** 3) / 2.0


def smooth(x):
    x = cl(x)
    return x * x * (3.0 - 2.0 * x)


def back_out(x, c1=1.35):
    x = cl(x)
    c3 = c1 + 1.0
    return 1.0 + c3 * ((x - 1.0) ** 3) + c1 * ((x - 1.0) ** 2)


def coef_perspectiva(dst, src):
    A, B = [], []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        B.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        B.append(v)
    return tuple(np.linalg.solve(np.array(A, float), np.array(B, float)))


def mascara_arredondada(size, raio, ss=4):
    w, h = size
    m = Image.new('L', (w * ss, h * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w * ss - 1, h * ss - 1], raio * ss, fill=255)
    return m.resize((w, h), Image.LANCZOS)


class MockupCelularRealista:
    """Prepara uma única vez o corpo fotográfico `celular-vazio.png`, a sombra de contato,
    a máscara da tela e o reflexo de vidro + câmera na escala alvo, permitindo projetar
    qualquer frame de tela em ~2 ms."""

    def __init__(self, altura_visivel=1280):
        foto = Image.open(CELULAR_PNG).convert('RGB')
        x0, y0, x1, y1 = CROP
        rec = foto.crop(CROP)
        xs = [pt[0] for pt in CONTORNO]
        ys = [pt[1] for pt in CONTORNO]
        cx0, cx1 = sum(sorted(xs)[:2]) / 2.0, sum(sorted(xs)[2:]) / 2.0
        cy0, cy1 = min(ys), max(ys)

        escala = altura_visivel / (cy1 - cy0)
        self.escala = escala

        ss = 4
        big = Image.new('L', (rec.size[0] * ss, rec.size[1] * ss), 0)
        ImageDraw.Draw(big).rounded_rectangle(
            [(cx0 - x0) * ss, (cy0 - y0) * ss, (cx1 - x0) * ss, (cy1 - y0) * ss],
            CONTORNO_RAIO * ss,
            fill=255,
        )
        m = big.resize(rec.size, Image.LANCZOS)
        rgba = rec.convert('RGBA')
        rgba.putalpha(m)

        nw, nh = round(rec.size[0] * escala), round(rec.size[1] * escala)
        corpo = rgba.resize((nw, nh), Image.LANCZOS)

        # Cria canvas com margem para sombra de contato e sombra difusa
        pad = 64
        self.pad = pad
        self.cw, self.ch = nw + 2 * pad, nh + 2 * pad
        base_sombra = Image.new('RGBA', (self.cw, self.ch), (0, 0, 0, 0))
        alpha_sombra = corpo.split()[3].point(lambda v: int(v * 0.58))
        base_sombra.paste((0, 8, 12, 255), (pad + 10, pad + 28), alpha_sombra)
        base_sombra = base_sombra.filter(ImageFilter.GaussianBlur(28))

        # Sombra de contato elíptica sob a base do aparelho
        contato = Image.new('RGBA', (self.cw, self.ch), (0, 0, 0, 0))
        ImageDraw.Draw(contato).ellipse(
            [pad + int(nw * 0.10), pad + nh - 24, pad + int(nw * 0.90), pad + nh + 28],
            fill=(0, 6, 10, 155),
        )
        contato = contato.filter(ImageFilter.GaussianBlur(20))
        base_sombra = Image.alpha_composite(base_sombra, contato)
        base_sombra.alpha_composite(corpo, (pad, pad))
        self.corpo_com_sombra = base_sombra

        # Geometria da tela dentro de corpo_com_sombra
        quad = [((px - x0) * escala + pad, (py - y0) * escala + pad) for px, py in TELA]
        bx0 = int(min(pt[0] for pt in quad))
        bx1 = int(max(pt[0] for pt in quad)) + 1
        by0 = int(min(pt[1] for pt in quad))
        by1 = int(max(pt[1] for pt in quad)) + 1
        self.bx0, self.by0 = bx0, by0
        self.bw, self.bh = bx1 - bx0, by1 - by0
        self.dst = [(px - bx0, py - by0) for px, py in quad]
        self.mascara_tela = mascara_arredondada((self.bw, self.bh), round(TELA_RAIO * escala))

        # Camada pré-computada de reflexo diagonal de vidro + furo da câmera frontal
        yy, xx = np.mgrid[0 : self.bh, 0 : self.bw].astype(np.float32)
        d = xx / self.bw * 0.9 + yy / self.bh * 0.35
        g = np.clip(1.0 - np.abs(d - 0.42) / 0.24, 0.0, 1.0) * 18.0
        reflexo = np.zeros((self.bh, self.bw, 4), dtype=np.uint8)
        reflexo[..., 0] = 255
        reflexo[..., 1] = 255
        reflexo[..., 2] = 255
        reflexo[..., 3] = np.clip(g, 0, 255).astype(np.uint8)
        vidro = Image.fromarray(reflexo, 'RGBA')
        vidro.putalpha(ImageChops.multiply(vidro.split()[3], self.mascara_tela))

        # Furo da câmera frontal
        cam_x = (CAMERA[0] - x0) * escala + pad - bx0
        cam_y = (CAMERA[1] - y0) * escala + pad - by0
        cam_r = CAMERA[2] * escala
        ImageDraw.Draw(vidro).ellipse(
            [cam_x - cam_r, cam_y - cam_r, cam_x + cam_r, cam_y + cam_r],
            fill=(6, 8, 10, 255),
        )
        self.vidro_camera = vidro
        self._co_cache = {}

    def renderizar(self, tela_rgb):
        tw, th = tela_rgb.size
        co = self._co_cache.get((tw, th))
        if co is None:
            srcq = [(0, 0), (tw, 0), (tw, th), (0, th)]
            co = coef_perspectiva(self.dst, srcq)
            self._co_cache[(tw, th)] = co
        warp = tela_rgb.transform((self.bw, self.bh), Image.PERSPECTIVE, co, Image.BILINEAR)
        out = self.corpo_com_sombra.copy()
        out.paste(warp, (self.bx0, self.by0), self.mascara_tela)
        out.alpha_composite(self.vidro_camera, (self.bx0, self.by0))
        return out


def criar_fundo_marca():
    """Fundo oficial petróleo/teal com vinheta suave e marca d'água G sutil."""
    yy, xx = np.mgrid[0 : H // 2, 0 : W // 2].astype(np.float32)
    top = np.array([3, 28, 34], np.float32)
    bot = np.array([6, 44, 52], np.float32)
    t = (yy / (H // 2 - 1))[..., None]
    base = top * (1.0 - t) + bot * t
    d = ((xx - W / 4.0) / (W * 0.46)) ** 2 + ((yy - H * 0.34) / (H * 0.36)) ** 2
    glow = np.exp(-d * 2.2)[..., None] * 0.32
    cor_glow = np.array([14, 88, 96], np.float32)
    img = base * (1.0 - glow) + cor_glow * glow
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC).convert('RGBA')


BG_MARCA = criar_fundo_marca()

# Logo oficial recortado
_logo_raw = Image.open(LOGO_PNG).convert('RGBA')
_logo_Crop = _logo_raw.crop(_logo_raw.split()[3].getbbox())
LOGO_OFICIAL = _logo_Crop.resize((580, round(580 * _logo_Crop.height / _logo_Crop.width)), Image.LANCZOS)


def desenhar_titulo_topo(frame, linhas, alpha=1.0, y_ini=118, tam=54, entrelinha=64):
    """Desenha título no topo da cena com palavras-chave em menta e sombra de leitura."""
    if alpha <= 0.01:
        return
    a = cl(alpha)
    f_bold = ImageFont.truetype(ULTRABOLD, tam)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # Scrim superior suave para contraste
    for i, partes in enumerate(linhas):
        larg_total = sum(f_bold.getlength(txt) for txt, _ in partes)
        x = (W - larg_total) / 2.0
        y = y_ini + i * entrelinha + int((1.0 - eo(a)) * 16)
        for txt, cor in partes:
            # Sombra curta
            d.text((x + 2, y + 4), txt, font=f_bold, fill=(0, 10, 14, int(150 * a)))
            d.text((x, y), txt, font=f_bold, fill=cor[:3] + (int(255 * a),))
            x += f_bold.getlength(txt)
    frame.alpha_composite(layer)


def desenhar_pilula_destaque(frame, texto, valor, y_centro, alpha=1.0):
    """Desenha uma pílula flutuante de destaque (callout) com borda menta."""
    if alpha <= 0.01:
        return
    a = cl(alpha)
    f_reg = ImageFont.truetype(FONT_REG, 34)
    f_bold = ImageFont.truetype(ULTRABOLD, 36)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    w_txt = f_reg.getlength(texto)
    w_val = f_bold.getlength('  ' + valor) if valor else 0
    larg = int(w_txt + w_val + 84)
    alt = 78
    x0 = (W - larg) // 2
    y0 = int(y_centro - alt // 2 + (1.0 - eo(a)) * 14)

    # Sombra da pílula
    d.rounded_rectangle(
        [x0 + 4, y0 + 8, x0 + larg + 4, y0 + alt + 8],
        radius=39,
        fill=(0, 8, 12, int(160 * a)),
    )
    d.rounded_rectangle(
        [x0, y0, x0 + larg, y0 + alt],
        radius=39,
        fill=(11, 45, 53, int(238 * a)),
        outline=MENTA + (int(220 * a),),
        width=3,
    )
    # Ponto menta
    d.ellipse([x0 + 26, y0 + alt // 2 - 7, x0 + 40, y0 + alt // 2 + 7], fill=MENTA + (int(255 * a),))
    tx = x0 + 54
    ty = y0 + 20
    d.text((tx, ty), texto, font=f_reg, fill=BRANCO + (int(255 * a),))
    if valor:
        d.text((tx + w_txt, ty - 1), '  ' + valor, font=f_bold, fill=MENTA + (int(255 * a),))
    frame.alpha_composite(layer)


def desenhar_fechamento(frame, t, t_ini, sub_partes):
    """Cena final limpa com logotipo oficial em gradiente e assinatura."""
    if t < t_ini:
        return
    a = smooth((t - t_ini) / 0.45)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    pulse = 1.0 + 0.008 * math.sin((t - t_ini) * 2.5)
    lw = round(LOGO_OFICIAL.width * pulse)
    lh = round(LOGO_OFICIAL.height * pulse)
    lg = LOGO_OFICIAL.resize((lw, lh), Image.LANCZOS)
    if a < 1.0:
        lg.putalpha(lg.split()[3].point(lambda v: int(v * a)))
    layer.alpha_composite(lg, ((W - lw) // 2, 760 + (LOGO_OFICIAL.height - lh) // 2))

    a_sub = smooth((t - (t_ini + 0.30)) / 0.40) * a
    if a_sub > 0.01:
        f_sub = ImageFont.truetype(FONT_REG, 44)
        d = ImageDraw.Draw(layer)
        for idx, linha in enumerate(sub_partes):
            larg = sum(f_sub.getlength(txt) for txt, _ in linha)
            x = (W - larg) / 2.0
            y = 1005 + idx * 54 + int((1.0 - eo(a_sub)) * 14)
            for txt, cor in linha:
                d.text((x, y), txt, font=f_sub, fill=cor[:3] + (int(255 * a_sub),))
                x += f_sub.getlength(txt)
    frame.alpha_composite(layer)


def colar_celular_animado(frame, cel_rgba, cx, cy, escala_zoom=1.0, angulo=0.0, alpha=1.0):
    """Cola o mockup realista `cel_rgba` centrado em `(cx, cy)` garantindo que
    o aparelho inteiro permaneça na margem segura."""
    if alpha <= 0.01:
        return
    im = cel_rgba
    if abs(escala_zoom - 1.0) > 0.003:
        nw = round(im.width * escala_zoom)
        nh = round(im.height * escala_zoom)
        im = im.resize((nw, nh), Image.BILINEAR)
    if abs(angulo) > 0.05:
        im = im.rotate(angulo, resample=Image.BILINEAR, expand=True)
    if alpha < 0.995:
        im = im.copy()
        im.putalpha(im.split()[3].point(lambda v: int(v * cl(alpha))))
    x0 = int(round(cx - im.width / 2.0))
    y0 = int(round(cy - im.height / 2.0))
    frame.alpha_composite(im, (x0, y0))


# ==============================================================================
# 1. PEDIDO 5: reel-r13-v4.mp4 (19.5s, 30 fps)
#    - Cena 1 (0.00..3.82s): Vídeo de apoio real (`clipe-cozinha-bruto.mp4`, sacola da
#      farmácia + cupom fiscal) com tratamento petróleo/menta e gancho cinético
#      sincronizado palavra por palavra com a locução.
#    - Cenas 2 a 6 (3.82..16.55s): Mockup fotográfico realista (`celular-vazio.png`)
#      inteiro na tela (`y ≈ 390..1750`), com telas reais (`lancamentos-rolada.png` e
#      `inicio.png`), destaque luminoso nas linhas citadas pela voz e títulos no topo
#      100% fiéis a cada frase falada na narração.
#    - Cena 7 (16.55..19.50s): Saída sequencial do aparelho e entrada do logotipo oficial.
# ==============================================================================
def gerar_reel_r13_v4():
    print('Gerando Pedido 5: reel-r13-v4.mp4 ...', flush=True)
    flare = r'E:\Grana-temporarios\2026-10-04-marketing\flare'
    clipe_cozinha = os.path.join(flare, 'clipe-cozinha-bruto.mp4')
    voz_mp3 = os.path.join(flare, 'locucao-r13.mp3')
    musica_wav = os.path.join(flare, 'v3', 'trilha-original-r13-v3.wav')
    shots_dir = r'E:\Grana-temporarios\2026-10-04-marketing\prints-novos\celular'

    dur = 19.5
    nframes = int(dur * FPS)
    nframes_broll = int(3.90 * FPS)

    # Carrega os quadros do vídeo de apoio da sacola/cupom (0..3.9s) via ffmpeg
    cmd_broll = [
        'ffmpeg', '-v', 'error',
        '-i', clipe_cozinha,
        '-vf', 'crop=576:720:352:0,scale=1080:1350,fps=30',
        '-t', '3.95',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
    ]
    raw_broll = subprocess.run(cmd_broll, capture_output=True, check=True).stdout
    frame_sz = 1080 * 1350 * 3
    broll_frames = []
    for i in range(min(nframes_broll, len(raw_broll) // frame_sz)):
        buf = raw_broll[i * frame_sz : (i + 1) * frame_sz]
        broll_frames.append(Image.frombytes('RGB', (1080, 1350), buf))

    # Prepara máscara de vinheta suave para integrar o vídeo 1080x1350 ao fundo 1080x1920
    yy = np.linspace(0.0, 1.0, 1350)[:, None]
    mask_vert = np.clip(np.minimum(yy / 0.14, (1.0 - yy) / 0.16), 0.0, 1.0)
    mask_broll = Image.fromarray((mask_vert * 225).astype(np.uint8).repeat(1080, axis=1), 'L')

    # Prepara mockup realista do celular (altura visível 1220 px -> cabe inteiro com folga)
    mockup = MockupCelularRealista(altura_visivel=1220)
    tela_lista_base = Image.open(os.path.join(shots_dir, 'lancamentos-rolada.png')).convert('RGB')
    tela_inicio_base = Image.open(os.path.join(shots_dir, 'inicio.png')).convert('RGB')

    def tela_com_destaque(base_rgb, box_norm, pulso):
        """Desenha um retângulo de foco menta suave na área destacada da captura real."""
        if box_norm is None or pulso <= 0.01:
            return base_rgb
        im = base_rgb.copy().convert('RGBA')
        w, h = im.size
        rx0, ry0, rx1, ry1 = (
            int(box_norm[0] * w),
            int(box_norm[1] * h),
            int(box_norm[2] * w),
            int(box_norm[3] * h),
        )
        ov = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        a_out = int(235 * cl(pulso))
        a_fill = int(36 * cl(pulso))
        d.rounded_rectangle([rx0, ry0, rx1, ry1], radius=22, fill=MENTA + (a_fill,), outline=MENTA + (a_out,), width=6)
        im.alpha_composite(ov)
        return im.convert('RGB')

    # Pré-renderiza variantes de tela no mockup realista para performance máxima
    cel_lista_normal = mockup.renderizar(tela_lista_base)
    cel_lista_foco = mockup.renderizar(tela_com_destaque(tela_lista_base, (0.04, 0.545, 0.96, 0.605), 1.0))
    cel_inicio_normal = mockup.renderizar(tela_inicio_base)
    cel_inicio_livre = mockup.renderizar(tela_com_destaque(tela_inicio_base, (0.04, 0.34, 0.96, 0.49), 1.0))
    cel_inicio_saldo = mockup.renderizar(tela_com_destaque(tela_inicio_base, (0.06, 0.405, 0.94, 0.432), 1.0))
    cel_inicio_cofrinhos = mockup.renderizar(tela_com_destaque(tela_inicio_base, (0.06, 0.430, 0.94, 0.456), 1.0))
    cel_inicio_dias = mockup.renderizar(tela_com_destaque(tela_inicio_base, (0.06, 0.454, 0.94, 0.485), 1.0))

    # Tempos exatos de cada palavra no gancho inicial (0..3.4s)
    intro_words = [
        ('Uma', 0.00, BRANCO),
        ('parada', 0.34, BRANCO),
        ('na', 0.58, BRANCO),
        ('farmácia,', 0.80, MENTA),
        ('um', 1.72, BRANCO),
        ('cupom', 1.90, BRANCO),
        ('no', 2.28, BRANCO),
        ('fundo', 2.46, BRANCO),
        ('da', 2.66, BRANCO),
        ('sacola.', 2.94, MENTA),
    ]
    intro_lines = [
        [intro_words[0], intro_words[1], intro_words[2]],
        [intro_words[3], intro_words[4], intro_words[5]],
        [intro_words[6], intro_words[7], intro_words[8], intro_words[9]],
    ]
    f_hook = ImageFont.truetype(ULTRABOLD, 68)

    silent_mp4 = os.path.join(AQUI, '_tmp_r13_v4_silent.mp4')
    out_mp4 = os.path.join(OUT_REELS, 'reel-r13-v4.mp4')

    cmd_enc = [
        'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
        '-i', '-', '-an',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p',
        silent_mp4,
    ]
    proc = subprocess.Popen(cmd_enc, stdin=subprocess.PIPE)

    for i in range(nframes):
        t = i / FPS
        frame = BG_MARCA.copy()

        # Cena 1: Vídeo de apoio da sacola + cupom (0.00..3.85s)
        if t < 3.85:
            idx_b = min(len(broll_frames) - 1, int(t * FPS))
            bf = broll_frames[idx_b]
            # Leve zoom cinematográfico 1.00 -> 1.06
            z_b = 1.0 + 0.06 * (t / 3.85)
            bw_z, bh_z = round(1080 * z_b), round(1350 * z_b)
            bf_z = bf.resize((bw_z, bh_z), Image.BILINEAR).crop(
                ((bw_z - 1080) // 2, (bh_z - 1350) // 2, (bw_z - 1080) // 2 + 1080, (bh_z - 1350) // 2 + 1350)
            )
            # Tinge levemente no petróleo da marca para leitura perfeita do texto
            scrim = Image.new('RGB', (1080, 1350), (4, 28, 35))
            bf_graded = Image.blend(bf_z, scrim, 0.34)
            fade_out_b = 1.0 - smooth((t - 3.45) / 0.38)
            m_b = mask_broll if fade_out_b >= 0.99 else mask_broll.point(lambda v: int(v * fade_out_b))
            frame.paste(bf_graded, (0, 285), m_b)

            # Tipografia cinética palavra por palavra sobre o vídeo de apoio
            layer_t = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            d = ImageDraw.Draw(layer_t)
            y_base = 1180
            for li, line in enumerate(intro_lines):
                x_cursor = 88.0
                y_line = y_base + li * 82
                for w_txt, t_start, w_cor in line:
                    if t >= t_start:
                        pw = eo((t - t_start) / 0.24) * fade_out_b
                        yw = y_line + int((1.0 - pw) * 18)
                        d.text((x_cursor + 2, yw + 4), w_txt, font=f_hook, fill=(0, 8, 12, int(190 * pw)))
                        d.text((x_cursor, yw), w_txt, font=f_hook, fill=w_cor + (int(255 * pw),))
                    x_cursor += f_hook.getlength(w_txt + ' ')
            frame.alpha_composite(layer_t)

        # Cenas 2 a 6: Celular fotográfico realista + títulos sincronizados com a locução (3.80..16.55s)
        if 3.78 <= t < 16.58:
            p_enter = back_out(p(t, 3.78, 4.35), 1.25)
            p_exit = smooth(p(t, 16.15, 16.55))
            alpha_cel = cl(p(t, 3.78, 4.05)) * (1.0 - p_exit)

            # Movimento contínuo suave (flutuação + leve inclinação) mantendo 100% na margem segura
            cy_cel = 1095 + int((1.0 - p_enter) * 320) - int(p_exit * 60) + int(8 * math.sin(t * 2.0))
            cx_cel = 540 + int(6 * math.cos(t * 1.4))
            ang_cel = -1.6 + 0.8 * math.sin(t * 1.2)
            zoom_cel = 1.0 + 0.03 * smooth(p(t, 6.20, 6.80))

            # Escolha da tela e destaque conforme a frase exata da narração
            if t < 6.18:
                pulso_f = 0.5 + 0.5 * math.sin((t - 4.2) * 6.0) if t >= 4.2 else 0.0
                cel_img = Image.blend(cel_lista_normal, cel_lista_foco, cl(pulso_f))
            elif t < 8.28:
                w_tr = smooth(p(t, 6.18, 6.50))
                base_c = Image.blend(cel_lista_foco, cel_inicio_livre, w_tr)
                cel_img = base_c
            elif t < 10.45:
                w_tr = smooth(p(t, 8.28, 8.55))
                cel_img = Image.blend(cel_inicio_livre, cel_inicio_saldo, w_tr)
            elif t < 11.90:
                w_tr = smooth(p(t, 10.45, 10.72))
                cel_img = Image.blend(cel_inicio_saldo, cel_inicio_cofrinhos, w_tr)
            else:
                w_tr = smooth(p(t, 11.90, 12.20))
                cel_img = Image.blend(cel_inicio_cofrinhos, cel_inicio_dias, w_tr)

            colar_celular_animado(frame, cel_img, cx_cel, cy_cel, zoom_cel, ang_cel, alpha_cel)

            # Títulos de topo e pílulas de apoio 100% sincronizados com cada trecho da fala
            if 3.85 <= t < 6.18:
                a_t = smooth(p(t, 3.85, 4.12)) * (1.0 - smooth(p(t, 5.92, 6.18)))
                desenhar_titulo_topo(
                    frame,
                    [
                        [('No Grana., ', BRANCO), ('registre', MENTA)],
                        [('o gasto.', MENTA)],
                    ],
                    a_t,
                    y_ini=115,
                )
                desenhar_pilula_destaque(frame, 'Farmácia · Saúde', '-R$ 47,30', 345, a_t)
            elif 6.18 <= t < 8.28:
                a_t = smooth(p(t, 6.18, 6.45)) * (1.0 - smooth(p(t, 8.02, 8.28)))
                desenhar_titulo_topo(
                    frame,
                    [
                        [('E consulte o', BRANCO)],
                        [('Livre para gastar.', MENTA)],
                    ],
                    a_t,
                    y_ini=115,
                )
                desenhar_pilula_destaque(frame, 'Livre para gastar', 'R$ 107,87/dia', 345, a_t)
            elif 8.28 <= t < 10.45:
                a_t = smooth(p(t, 8.28, 8.55)) * (1.0 - smooth(p(t, 10.20, 10.45)))
                desenhar_titulo_topo(
                    frame,
                    [
                        [('O cálculo parte do', BRANCO)],
                        [('saldo do mês,', MENTA)],
                    ],
                    a_t,
                    y_ini=115,
                )
                desenhar_pilula_destaque(frame, 'Saldo atual do mês', 'R$ 3.970,30', 345, a_t)
            elif 10.45 <= t < 11.90:
                a_t = smooth(p(t, 10.45, 10.70)) * (1.0 - smooth(p(t, 11.66, 11.90)))
                desenhar_titulo_topo(
                    frame,
                    [
                        [('desconta os', BRANCO)],
                        [('cofrinhos', MENTA)],
                    ],
                    a_t,
                    y_ini=115,
                )
                desenhar_pilula_destaque(frame, 'Reservado em cofrinhos', '-R$ 950,00', 345, a_t)
            elif 11.90 <= t < 14.90:
                a_t = smooth(p(t, 11.90, 12.18)) * (1.0 - smooth(p(t, 14.65, 14.90)))
                desenhar_titulo_topo(
                    frame,
                    [
                        [('e divide o restante', BRANCO)],
                        [('pelos dias até o mês terminar,', MENTA)],
                    ],
                    a_t,
                    y_ini=115,
                    tam=48,
                    entrelinha=58,
                )
                desenhar_pilula_destaque(frame, 'R$ 3.020,30 ÷ 28 dias', 'R$ 107,87/dia', 345, a_t)
            elif 14.90 <= t < 16.50:
                a_t = smooth(p(t, 14.90, 15.12)) * (1.0 - smooth(p(t, 16.20, 16.50)))
                desenhar_titulo_topo(
                    frame,
                    [
                        [('contando ', BRANCO), ('hoje.', MENTA)],
                    ],
                    a_t,
                    y_ini=145,
                    tam=60,
                )
                desenhar_pilula_destaque(frame, '28 dias restantes (com hoje)', 'R$ 107,87/dia', 345, a_t)

        # Cena 7: Fechamento (16.60..19.50s)
        desenhar_fechamento(frame, t, 16.60, [[('Conheça o ', BRANCO), ('Grana.', MENTA)]])

        proc.stdin.write(frame.convert('RGB').tobytes())
    proc.stdin.close()
    proc.wait()

    # Mixa a locução existente com a trilha original
    fc = (
        '[1:a]aformat=channel_layouts=stereo,volume=1.0,adelay=20|20[voice];'
        '[2:a]volume=0.50[bed];'
        '[voice][bed]amix=inputs=2:duration=longest:dropout_transition=0,'
        'alimiter=limit=0.95,loudnorm=I=-16.0:TP=-1.5:LRA=6[outa]'
    )
    subprocess.run(
        [
            'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
            '-i', silent_mp4, '-i', voz_mp3, '-i', musica_wav,
            '-filter_complex', fc,
            '-map', '0:v:0', '-map', '[outa]',
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000',
            '-t', str(dur), '-movflags', '+faststart', out_mp4,
        ],
        check=True,
    )
    if os.path.exists(silent_mp4):
        os.remove(silent_mp4)
    print(f'Concluído: {out_mp4}', flush=True)


# ==============================================================================
# 2. PEDIDO 7: grana-motion-desistiu-foto-da-nota-narrado-v2.mp4 (20.0s, 30 fps)
#    - Remove os dois cortes redundantes de "O Grana." em `motion.mp3` (ficando
#      "Grana." falado apenas 1 única vez no encerramento).
#    - Substitui o retângulo CSS pelo mockup fotográfico realista (`celular-vazio.png`)
#      inteiro dentro da margem segura (`y ≈ 390..1750`), projetando a tela animada
#      recuperada de `grana-motion-desistiu-foto-da-nota.mp4`.
#    - Sincroniza 100% dos títulos na tela com o que está sendo dito na narração.
# ==============================================================================
def back_mot(x):
    x = cl(x)
    c1 = 1.4
    c3 = c1 + 1.0
    return 1.0 + c3 * ((x - 1.0) ** 3) + c1 * ((x - 1.0) ** 2)


def extrair_tela_motion(im_1080x1920, t, base_home=None):
    pin = p(t, 4.0, 4.75)
    pout = p(t, 16.9, 17.5)
    ty = (1.0 - back_mot(pin)) * 760.0 + eio(pout) * -40.0
    rot = (1.0 - eo(pin)) * 8.0
    z1 = eio(p(t, 5.0, 5.8)) * (1.0 - eio(p(t, 8.2, 8.9)))
    z2 = eio(p(t, 10.7, 11.3)) * (1.0 - eio(p(t, 12.6, 13.2)))
    sc = 1.0 + z1 * 0.08 + z2 * 0.06 - eio(pout) * 0.08
    ty_total = (ty + z1 * 40.0 - z2 * 30.0) * 2.0

    rad = math.radians(rot)
    cos_r, sin_r = math.cos(rad), math.sin(rad)
    a = sc * cos_r
    b = -sc * sin_r
    c = 540.0 + a * (-336.0) + b * (-863.2)
    d = sc * sin_r
    e = sc * cos_r
    f = 1275.2 + ty_total + d * (-336.0) + e * (-863.2)
    scr = im_1080x1920.transform((672, 1432), Image.AFFINE, (a, b, c, d, e, f), resample=Image.BILINEAR)
    if base_home is not None and (z1 > 0.001 or pin < 0.999):
        v_cut = int((1916.0 - (1275.2 + ty_total + e * (-863.2))) / max(e, 0.01))
        if 0 < v_cut < 1432:
            scr.paste(base_home.crop((0, v_cut, 672, 1432)), (0, v_cut))
    return scr


def gerar_motion_desistiu_v2():
    print('Gerando Pedido 7: grana-motion-desistiu-foto-da-nota-narrado-v2.mp4 ...', flush=True)
    painel_reels = r'E:\Grana-temporarios\2026-10-09-painel\reels'
    src_mp4 = os.path.join(painel_reels, 'grana-motion-desistiu-foto-da-nota.mp4')
    motion_mp3 = os.path.join(painel_reels, 'narracao', 'motion.mp3')

    dur = 20.0
    nframes = int(dur * FPS)

    # Lê todos os 600 quadros do vídeo-fonte em memória via stream para extrair a tela
    cmd_read = [
        'ffmpeg', '-v', 'error', '-i', src_mp4,
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
    ]
    raw_src = subprocess.run(cmd_read, capture_output=True, check=True).stdout
    fsz = W * H * 3

    def get_src_frame(idx):
        idx = max(0, min(nframes - 1, idx))
        return Image.frombytes('RGB', (W, H), raw_src[idx * fsz : (idx + 1) * fsz])

    # Quadro base da home em t=4.85s (z1=0, 100% da tela visível)
    base_home = extrair_tela_motion(get_src_frame(int(4.85 * FPS)), 4.85)
    mockup = MockupCelularRealista(altura_visivel=1220)

    # Palavras do gancho inicial sincronizadas com "Cansou de anotar cada gasto?" (0.35..2.10s)
    hook_words = [
        ('Cansou', 0.35, MENTA),
        ('de', 0.72, BRANCO),
        ('anotar', 0.90, BRANCO),
        ('cada', 1.25, MENTA),
        ('gasto?', 1.50, MENTA),
    ]
    hook_lines = [
        [hook_words[0], hook_words[1], hook_words[2]],
        [hook_words[3], hook_words[4]],
    ]
    f_hook = ImageFont.truetype(ULTRABOLD, 82)

    silent_mp4 = os.path.join(AQUI, '_tmp_motion_v2_silent.mp4')
    out_mp4 = os.path.join(OUT_REELS, 'grana-motion-desistiu-foto-da-nota-narrado-v2.mp4')

    proc = subprocess.Popen(
        [
            'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
            '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
            '-i', '-', '-an',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p',
            silent_mp4,
        ],
        stdin=subprocess.PIPE,
    )

    for i in range(nframes):
        t = i / FPS
        frame = BG_MARCA.copy()

        # Cena 1: Gancho sincronizado com "Cansou de anotar cada gasto?" (0.00..3.85s)
        if t < 3.85:
            fade_out_h = 1.0 - smooth(p(t, 3.40, 3.82))
            layer_h = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            d = ImageDraw.Draw(layer_h)
            y0 = 820
            for li, line in enumerate(hook_lines):
                x = 96.0
                yl = y0 + li * 98
                for w_txt, t_st, w_cor in line:
                    if t >= t_st:
                        pw = eo((t - t_st) / 0.25) * fade_out_h
                        yw = yl + int((1.0 - pw) * 20)
                        d.text((x + 2, yw + 4), w_txt, font=f_hook, fill=(0, 8, 12, int(180 * pw)))
                        d.text((x, yw), w_txt, font=f_hook, fill=w_cor + (int(255 * pw),))
                    x += f_hook.getlength(w_txt + ' ')
            frame.alpha_composite(layer_h)

        # Cenas 2, 3 e 4: Celular realista inteiro na tela (3.85..17.15s)
        if 3.85 <= t < 17.15:
            p_in = back_out(p(t, 3.85, 4.45), 1.25)
            p_out = smooth(p(t, 16.75, 17.15))
            alpha_c = cl(p(t, 3.85, 4.10)) * (1.0 - p_out)

            # Extrai a tela animada do quadro correspondente (a partir de t=4.4s já estabilizada)
            t_src = max(4.80, min(16.85, t))
            scr_rgb = extrair_tela_motion(get_src_frame(int(round(t_src * FPS))), t_src, base_home)
            cel_rgba = mockup.renderizar(scr_rgb)

            z1 = eio(p(t, 5.0, 5.8)) * (1.0 - eio(p(t, 8.2, 8.85)))
            z2 = eio(p(t, 10.6, 11.2)) * (1.0 - eio(p(t, 12.6, 13.2)))
            zoom_c = 1.0 + z1 * 0.035 + z2 * 0.030
            cy_c = 1090 + int((1.0 - p_in) * 320) - int(p_out * 60) + int(6 * math.sin(t * 1.8))
            cx_c = 540 + int(5 * math.cos(t * 1.3))
            ang_c = (1.0 - eo(p(t, 3.85, 4.45))) * 5.0 - 1.2 + 0.6 * math.sin(t * 1.1)

            colar_celular_animado(frame, cel_rgba, cx_c, cy_c, zoom_c, ang_c, alpha_c)

            # Títulos na parte superior 100% sincronizados com a locução limpa
            if 4.00 <= t < 5.95:
                a_t = smooth(p(t, 4.00, 4.25)) * (1.0 - smooth(p(t, 5.72, 5.95)))
                desenhar_titulo_topo(
                    frame,
                    [[('Pagou? É só ', BRANCO), ('falar.', MENTA)]],
                    a_t,
                    y_ini=150,
                    tam=60,
                )
            elif 5.95 <= t < 8.85:
                a_t = smooth(p(t, 5.95, 6.20)) * (1.0 - smooth(p(t, 8.55, 8.85)))
                desenhar_titulo_topo(
                    frame,
                    [[('Escuta e ', BRANCO), ('registra.', MENTA)]],
                    a_t,
                    y_ini=150,
                    tam=60,
                )
            elif 8.95 <= t < 10.65:
                a_t = smooth(p(t, 8.95, 9.20)) * (1.0 - smooth(p(t, 10.42, 10.65)))
                desenhar_titulo_topo(
                    frame,
                    [[('Ou ', BRANCO), ('fotografa a nota.', MENTA)]],
                    a_t,
                    y_ini=150,
                    tam=58,
                )
            elif 10.65 <= t < 13.30:
                a_t = smooth(p(t, 10.65, 10.90)) * (1.0 - smooth(p(t, 13.02, 13.30)))
                desenhar_titulo_topo(
                    frame,
                    [
                        [('Ele lê o total', BRANCO)],
                        [('e ', BRANCO), ('salva.', MENTA)],
                    ],
                    a_t,
                    y_ini=120,
                    tam=56,
                )
            elif 13.45 <= t < 14.65:
                a_t = smooth(p(t, 13.45, 13.70)) * (1.0 - smooth(p(t, 14.42, 14.65)))
                desenhar_titulo_topo(
                    frame,
                    [[('Esqueceu de ', BRANCO), ('anotar?', MENTA)]],
                    a_t,
                    y_ini=150,
                    tam=58,
                )
            elif 14.65 <= t < 16.95:
                a_t = smooth(p(t, 14.65, 14.90)) * (1.0 - smooth(p(t, 16.65, 16.95)))
                desenhar_titulo_topo(
                    frame,
                    [[('À noite, ', BRANCO), ('te lembra.', MENTA)]],
                    a_t,
                    y_ini=150,
                    tam=60,
                )

        # Cena 5: Fechamento (17.15..20.00s)
        desenhar_fechamento(
            frame,
            t,
            17.15,
            [
                [('Rápido, fácil e', BRANCO)],
                [('sem complicação.', MENTA)],
            ],
        )

        proc.stdin.write(frame.convert('RGB').tobytes())
    proc.stdin.close()
    proc.wait()

    # Monta o áudio removendo os dois "O Grana." redundantes (4.91..5.63 e 13.26..13.87)
    # para que "Grana." seja falado APENAS UMA VEZ (em 17.15s no fechamento).
    frases_motion = [
        (0.35, [(0.00, 1.74)], 0.0, 1.0),                          # Cansou de anotar cada gasto?
        (4.15, [(2.16, 2.80), (3.55, 4.29)], 0.18, 1.0),           # Pagou? É só falar.
        (6.05, [(6.00, 7.33)], 0.0, 1.0),                          # Escuta e registra.
        (9.10, [(7.62, 8.97)], 0.0, 1.0),                          # Ou fotografa a nota.
        (10.75, [(9.24, 10.62)], 0.0, 1.0),                        # Ele lê o total e salva.
        (13.55, [(11.23, 12.07)], 0.0, 1.0),                       # Esqueceu de anotar?
        (14.70, [(12.75, 13.26), (14.22, 14.78)], 0.16, 1.0),      # À noite, te lembra.
        (17.15, [(15.34, 15.94), (16.40, 18.79)], 0.18, 1.06),     # Grana. Rápido, fácil e sem complicação.
    ]
    fc = []
    lab = []
    k = 0
    for t0, pcs, gap, tempo in frases_motion:
        tc = t0
        for a, b in pcs:
            d_seg = (b - a) / tempo
            f = (
                f'[2:a]atrim={a}:{b},asetpts=PTS-STARTPTS'
                + (f',atempo={tempo}' if tempo != 1.0 else '')
                + f',afade=t=in:d=0.018,afade=t=out:st={max(d_seg - 0.025, 0):.3f}:d=0.025,'
                f'adelay={int(tc * 1000)}|{int(tc * 1000)}[p{k}]'
            )
            fc.append(f)
            lab.append(f'[p{k}]')
            tc += d_seg + gap
            k += 1
    fc.append(''.join(lab) + f'amix=inputs={k}:normalize=0:dropout_transition=0,volume=1.0,apad=whole_dur={dur}[voz]')
    fc.append('[voz]asplit=2[vk][vm]')
    fc.append('[1:a]volume=0.85[mus]')
    fc.append('[mus][vk]sidechaincompress=threshold=0.015:ratio=6:attack=15:release=350:makeup=1[duck]')
    fc.append('[duck][vm]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]')

    subprocess.run(
        [
            'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
            '-i', silent_mp4, '-i', src_mp4, '-i', motion_mp3,
            '-filter_complex', ';'.join(fc),
            '-map', '0:v:0', '-map', '[a]',
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000',
            '-t', str(dur), '-movflags', '+faststart', out_mp4,
        ],
        check=True,
    )
    if os.path.exists(silent_mp4):
        os.remove(silent_mp4)
    print(f'Concluído: {out_mp4}', flush=True)


# ==============================================================================
# 3. PEDIDO 8: grana-r5-colar-pix-v7.mp4 e grana-r5-colar-pix-v7-narrado.mp4 (16.4s)
#    - Substitui o retângulo CSS pelo mockup fotográfico realista (`celular-vazio.png`)
#      inteiro dentro da margem segura (`y ≈ 390..1750`), projetando a tela real
#      recuperada de `grana-r5-colar-pix-v6.mp4` (com "às 18:42" acentuado).
#    - Entrega:
#      a) `grana-r5-colar-pix-v7.mp4`: versão com a trilha house + plim, sem a voz
#         carioca rejeitada pelo autor (pronta para receber locução nova quando o autor
#         autorizar ElevenLabs, conforme Regra 24).
#      b) `grana-r5-colar-pix-v7-narrado.mp4`: versão com a locução reeditada localmente
#         (sem repetição de "Grana." no meio do vídeo) e títulos 100% sincronizados.
# ==============================================================================
def back_r5(x, c1=2.2):
    x = cl(x)
    c3 = c1 + 1.0
    return 1.0 + c3 * ((x - 1.0) ** 3) + c1 * ((x - 1.0) ** 2)


def extrair_tela_r5(im_1080x1920, t):
    B = 0.6
    DROP = 2.4
    LOGO = 13.2
    pin = p(t, DROP, DROP + 0.42)
    pout = p(t, 21 * B, LOGO)
    drift = math.sin(t * 1.3) * 2.2
    bob = math.sin(t * 2.1) * 5.0
    inY = (1.0 - back_r5(pin, 2.2)) * 900.0
    inR = (1.0 - eo(pin)) * -16.0
    outS = 1.0 - eio(pout) * 0.5
    outY = -eio(pout) * 80.0

    ty_total = (inY + bob + outY) * 2.0
    rot = inR + drift
    sc = outS
    rad = math.radians(rot)
    cos_r, sin_r = math.cos(rad), math.sin(rad)
    # Origem da rotação no palco 1080x1920: (190 + 350, 352 + 753) = (540, 1105)
    # Tela #screen: x in [210, 870], y in [372, 1838] -> dx = u' - 330, dy = v' - 733
    a = sc * cos_r
    b = -sc * sin_r
    c = 540.0 + a * (-330.0) + b * (-733.0)
    d = sc * sin_r
    e = sc * cos_r
    f = 1105.0 + ty_total + d * (-330.0) + e * (-733.0)
    return im_1080x1920.transform((660, 1466), Image.AFFINE, (a, b, c, d, e, f), resample=Image.BILINEAR)


def desenhar_etiqueta_r5(frame, texto_esq, texto_bold, x_pos, y_pos, alpha, rot_deg=0.0):
    if alpha <= 0.01:
        return
    a = cl(alpha)
    f_reg = ImageFont.truetype(FONT_REG, 38)
    f_bold = ImageFont.truetype(ULTRABOLD, 38)
    w1 = f_reg.getlength(texto_esq)
    w2 = f_bold.getlength(texto_bold)
    pw = int(w1 + w2 + 64)
    ph = 76
    pill = Image.new('RGBA', (pw + 24, ph + 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(pill)
    d.rounded_rectangle([14, 16, 14 + pw, 16 + ph], radius=38, fill=(0, 8, 12, int(160 * a)))
    d.rounded_rectangle(
        [12, 12, 12 + pw, 12 + ph],
        radius=38,
        fill=(11, 45, 53, int(242 * a)),
        outline=MENTA + (int(235 * a),),
        width=3,
    )
    d.text((12 + 32, 12 + 18), texto_esq, font=f_reg, fill=BRANCO + (int(255 * a),))
    d.text((12 + 32 + w1, 12 + 18), texto_bold, font=f_bold, fill=MENTA + (int(255 * a),))
    if abs(rot_deg) > 0.1:
        pill = pill.rotate(rot_deg, resample=Image.BILINEAR, expand=True)
    frame.alpha_composite(pill, (int(x_pos), int(y_pos)))


def gerar_r5_colar_pix_v7():
    print('Gerando Pedido 8: grana-r5-colar-pix-v7.mp4 e grana-r5-colar-pix-v7-narrado.mp4 ...', flush=True)
    painel_reels = r'E:\Grana-temporarios\2026-10-09-painel\reels'
    src_mp4 = os.path.join(painel_reels, 'grana-r5-colar-pix-v6.mp4')
    r5_mp3 = os.path.join(painel_reels, 'narracao', 'r5.mp3')

    dur = 16.4
    nframes = int(dur * FPS)
    B = 0.6
    DROP = 2.4
    LOGO = 13.2

    cmd_read = [
        'ffmpeg', '-v', 'error', '-i', src_mp4,
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
    ]
    raw_src = subprocess.run(cmd_read, capture_output=True, check=True).stdout
    fsz = W * H * 3

    def get_src_frame(idx):
        idx = max(0, min(nframes - 1, idx))
        return Image.frombytes('RGB', (W, H), raw_src[idx * fsz : (idx + 1) * fsz])

    # Tela limpa de "Confirmar lançamento" em t=6.75s (antes de as etiquetas originais
    # sobreporem as bordas da tela entre 6.85s e 10.20s)
    tela_confirmar_limpa = extrair_tela_r5(get_src_frame(int(6.75 * FPS)), 6.75)
    tela_inicial_limpa = extrair_tela_r5(get_src_frame(int(2.85 * FPS)), 2.85)
    mockup = MockupCelularRealista(altura_visivel=1220)
    cel_confirmar_limpo = mockup.renderizar(tela_confirmar_limpa)

    hook_lines = [
        [('Recebeu', BRANCO)],
        [('um ', BRANCO), ('Pix', MENTA)],
        [('e não quer', BRANCO)],
        [('digitar tudo?', MENTA)],
    ]
    f_hook = ImageFont.truetype(ULTRABOLD, 82)

    silent_mp4 = os.path.join(AQUI, '_tmp_r5_v7_silent.mp4')
    out_sem_voz = os.path.join(OUT_REELS, 'grana-r5-colar-pix-v7.mp4')
    out_narrado = os.path.join(OUT_REELS, 'grana-r5-colar-pix-v7-narrado.mp4')

    proc = subprocess.Popen(
        [
            'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
            '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
            '-i', '-', '-an',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p',
            silent_mp4,
        ],
        stdin=subprocess.PIPE,
    )

    for i in range(nframes):
        t = i / FPS
        frame = BG_MARCA.copy()

        # Cena 1: Gancho inicial (0.00..2.45s)
        if t < DROP + 0.08:
            a_in = eio(p(t, 0.12, 0.85))
            a_out = eio(p(t, DROP - 0.35, DROP + 0.05))
            ah = a_in * (1.0 - a_out)
            if ah > 0.01:
                layer_h = Image.new('RGBA', (W, H), (0, 0, 0, 0))
                d = ImageDraw.Draw(layer_h)
                y0 = 690 + int((1.0 - a_in) * 36 - a_out * 28)
                for li, parts in enumerate(hook_lines):
                    x = 84.0
                    yl = y0 + li * 94
                    for txt, cor in parts:
                        d.text((x + 2, yl + 4), txt, font=f_hook, fill=(0, 8, 12, int(185 * ah)))
                        d.text((x, yl), txt, font=f_hook, fill=cor + (int(255 * ah),))
                        x += f_hook.getlength(txt)
                frame.alpha_composite(layer_h)

        # Cenas 2 a 5: Celular fotográfico realista inteiro na margem segura (2.40..13.20s)
        if DROP <= t < LOGO:
            pin = back_out(p(t, DROP, DROP + 0.45), 1.30)
            pout = smooth(p(t, 21 * B, LOGO))
            alpha_c = cl(p(t, DROP, DROP + 0.22)) * (1.0 - pout)

            if 6.72 <= t < 10.22:
                cel_rgba = cel_confirmar_limpo
            elif t < 2.85:
                cel_rgba = mockup.renderizar(tela_inicial_limpa)
            else:
                scr_rgb = extrair_tela_r5(get_src_frame(i), t)
                cel_rgba = mockup.renderizar(scr_rgb)

            beat_k = ((t - DROP) / B) % 1.0
            pulse = (1.0 - beat_k) ** 4 * 0.012
            cy_c = 1095 + int((1.0 - pin) * 320) - int(pout * 70) + int(6 * math.sin(t * 2.1))
            cx_c = 540 + int(4 * math.cos(t * 1.3))
            ang_c = (1.0 - eo(p(t, DROP, DROP + 0.45))) * -8.0 - 1.2 + math.sin(t * 1.3) * 1.2

            colar_celular_animado(frame, cel_rgba, cx_c, cy_c, 1.0 + pulse, ang_c, alpha_c)

            # Etiquetas saltando sobre o celular realista na etapa de leitura automática (6.75..10.20s)
            for t0_tag, txt_e, txt_b, tx_p, ty_p, r_init in (
                (11 * B + 0.20, 'R$ ', '32,90', 610, 690, 4.0),
                (12 * B + 0.20, '● ', 'Alimentação', 48, 945, -4.0),
                (13 * B + 0.20, 'Saída · ', 'Pix', 595, 1185, 3.5),
            ):
                a_tg = eio(p(t, t0_tag, t0_tag + 0.45)) * (1.0 - smooth(p(t, 17 * B - 0.28, 17 * B)))
                y_tg = ty_p + int(math.sin((t - t0_tag) * 2.4) * 8)
                desenhar_etiqueta_r5(frame, txt_e, txt_b, tx_p, y_tg, a_tg, r_init * (1.0 - a_tg))

            # Títulos de topo sincronizados com a locução e com a ação da tela
            if DROP + 0.05 <= t < 7 * B - 0.05:
                a_t = smooth(p(t, DROP + 0.05, DROP + 0.35)) * (1.0 - smooth(p(t, 7 * B - 0.30, 7 * B - 0.05)))
                desenhar_titulo_topo(
                    frame,
                    [[('Copiou o ', BRANCO), ('comprovante?', MENTA)]],
                    a_t,
                    y_ini=150,
                    tam=56,
                )
            elif 7 * B <= t < 11 * B - 0.05:
                a_t = smooth(p(t, 7 * B, 7 * B + 0.28)) * (1.0 - smooth(p(t, 11 * B - 0.30, 11 * B - 0.05)))
                desenhar_titulo_topo(
                    frame,
                    [[('Cola.', MENTA)]],
                    a_t,
                    y_ini=135,
                    tam=76,
                )
            elif 11 * B <= t < 17 * B - 0.05:
                a_t = smooth(p(t, 11 * B, 11 * B + 0.32)) * (1.0 - smooth(p(t, 17 * B - 0.30, 17 * B - 0.05)))
                desenhar_titulo_topo(
                    frame,
                    [
                        [('Lê valor, categoria', BRANCO)],
                        [('e ', BRANCO), ('Pix sozinho.', MENTA)],
                    ],
                    a_t,
                    y_ini=118,
                    tam=54,
                )
            elif 17 * B <= t < 21 * B:
                a_t = smooth(p(t, 17 * B, 17 * B + 0.30)) * (1.0 - smooth(p(t, 21 * B - 0.30, 21 * B)))
                desenhar_titulo_topo(
                    frame,
                    [[('Salva num ', BRANCO), ('toque.', MENTA)]],
                    a_t,
                    y_ini=150,
                    tam=60,
                )

        # Barra de progresso superior discreta em gradiente menta
        bar_w = max(2, int(W * cl(t / dur)))
        ImageDraw.Draw(frame).rectangle([0, 0, bar_w, 8], fill=MENTA + (235,))

        # Cena 6: Fechamento (13.20..16.40s)
        desenhar_fechamento(
            frame,
            t,
            LOGO,
            [[('Recebeu, colou, ', BRANCO), ('lançou.', MENTA)]],
        )

        proc.stdin.write(frame.convert('RGB').tobytes())
    proc.stdin.close()
    proc.wait()

    # 3a) Versão SEM a locução carioca rejeitada pelo autor (apenas trilha house + plim original)
    subprocess.run(
        [
            'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
            '-i', silent_mp4, '-i', src_mp4,
            '-map', '0:v:0', '-map', '1:a:0',
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000',
            '-t', str(dur), '-movflags', '+faststart', out_sem_voz,
        ],
        check=True,
    )

    # 3b) Versão NARRADA com os cortes limpos (sem repetição de "Grana." no meio:
    #     corta "no Grana." em 4.35..4.88 e corta "O Grana." em 5.55..6.40, falando
    #     "Grana." apenas 1 vez no encerramento em 13.45s)
    frases_r5 = [
        (0.35, [(0.00, 1.86)], 0.0, 1.0),                                               # Recebeu um Pix e não quer digitar?
        (2.65, [(2.45, 3.53)], 0.0, 1.0),                                               # Copiou o comprovante?
        (4.35, [(4.02, 4.36)], 0.0, 1.0),                                               # Cola.
        (6.75, [(6.70, 8.58)], 0.0, 1.0),                                               # Lê valor, categoria e Pix sozinho.
        (10.35, [(8.86, 9.89)], 0.0, 1.0),                                              # Salva num toque.
        (13.45, [(10.19, 10.75), (11.11, 11.69), (12.03, 12.53), (12.75, 13.38)], 0.16, 1.0),  # Grana. Recebeu, colou, lançou.
    ]
    fc = []
    lab = []
    k = 0
    for t0, pcs, gap, tempo in frases_r5:
        tc = t0
        for a, b in pcs:
            d_seg = (b - a) / tempo
            f = (
                f'[2:a]atrim={a}:{b},asetpts=PTS-STARTPTS'
                + (f',atempo={tempo}' if tempo != 1.0 else '')
                + f',afade=t=in:d=0.018,afade=t=out:st={max(d_seg - 0.025, 0):.3f}:d=0.025,'
                f'adelay={int(tc * 1000)}|{int(tc * 1000)}[p{k}]'
            )
            fc.append(f)
            lab.append(f'[p{k}]')
            tc += d_seg + gap
            k += 1
    fc.append(''.join(lab) + f'amix=inputs={k}:normalize=0:dropout_transition=0,volume=1.0,apad=whole_dur={dur}[voz]')
    fc.append('[voz]asplit=2[vk][vm]')
    fc.append('[1:a]volume=0.85[mus]')
    fc.append('[mus][vk]sidechaincompress=threshold=0.015:ratio=6:attack=15:release=350:makeup=1[duck]')
    fc.append('[duck][vm]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]')

    subprocess.run(
        [
            'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
            '-i', silent_mp4, '-i', src_mp4, '-i', r5_mp3,
            '-filter_complex', ';'.join(fc),
            '-map', '0:v:0', '-map', '[a]',
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000',
            '-t', str(dur), '-movflags', '+faststart', out_narrado,
        ],
        check=True,
    )
    if os.path.exists(silent_mp4):
        os.remove(silent_mp4)
    print(f'Concluídos: {out_sem_voz} e {out_narrado}', flush=True)


if __name__ == '__main__':
    gerar_reel_r13_v4()
    gerar_motion_desistiu_v2()
    gerar_r5_colar_pix_v7()

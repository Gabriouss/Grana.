"""Capas de Reel 1080x1920 no sistema visual dos estáticos 3:4 (11/10/2026).

Segue apoio/referencias/guia-de-design-estatico-feed-3x4.md (regra 26 do
AGENTS.md). Todo o conteúdo fica na área segura central de 1080x1440 (y 240 a
1680), que é o recorte da grade do perfil; o painel e o fundo continuam até a
borda de 1920 para a capa inteira não parecer um cartão solto.

Uso:  python -I gerar-capas-reels.py <pasta de saída>
Requer: Pillow, numpy e a NeueMachina-Ultrabold instalada no Windows do usuário
(não versionada: fonte licenciada, repositório público).
"""
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), *(['..'] * 6)))
P = lambda *p: os.path.join(RAIZ, *p)

ULTRABOLD = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'Windows', 'Fonts', 'NeueMachina-Ultrabold.otf')
REGULAR = P('assets', 'fonts', 'NeueMachina-Regular.otf')
SIMBOLO = P('design-system', 'marca', 'simbolo-menta-sem-ponto.svg')
LOGO = P('docs', 'marketing', '2026-10', 'semana-40-2026-09-28-a-2026-10-04', 'apoio', 'referencias', 'r13', 'v3', 'logo-oficial.png')
CELULAR = P('design-system', 'marketing-mockups', 'celular-vazio.png')
ICONES = P('docs', 'marketing', 'arsenal', 'icones')
MOTION = P('docs', 'marketing', 'motion-desistiu')
TELAS = P('docs', 'marketing', '2026-10', 'semana-41-2026-10-05-a-2026-10-11', 'apoio', 'capturas-fonte')
# Telas tiradas do próprio motion "desistiu" (#screen do index.html), no instante
# de cada cena: 7.4 s = voz com a transcrição completa; 11.4 s = nota fiscal lida,
# com valor e "Salvar lançamento". A tela é renderizada já na proporção da tela do
# celular vazio (≈ 0,433), para nada ser cortado nas laterais pelo encaixe; o
# conteúdo de 412 px de largura do motion é reduzido, nunca recortado.
TELAS_MOTION = {'tela-voz-padaria.png': '7.4', 'tela-foto-da-nota.png': '11.4'}


def renderizar_telas():
    faltam = {n: t for n, t in TELAS_MOTION.items() if not os.path.exists(os.path.join(TELAS, n))}
    if not faltam:
        return
    from playwright.sync_api import sync_playwright
    os.makedirs(TELAS, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--allow-file-access-from-files'])
        pg = b.new_page(viewport={'width': 540, 'height': 960}, device_scale_factor=4)
        pg.goto('file:///' + os.path.join(MOTION, 'index.html').replace(os.sep, '/'))
        pg.wait_for_timeout(800)
        pg.evaluate('document.fonts.ready')
        tw = CEL_TELA[1][0] - CEL_TELA[0][0]
        th = CEL_TELA[3][1] - CEL_TELA[0][1]
        alt = 716
        larg = round(alt * tw / th)
        esc = larg / 412
        pg.evaluate(f"""() => {{
            const s = document.getElementById('screen'); s.style.width = '{larg}px'; s.style.height = '{alt}px';
            const d = document.getElementById('dp'); d.style.transform = 'scale({esc:.5f})'; d.style.height = '{alt / esc:.1f}px';
        }}""")
        for nome, t in faltam.items():
            pg.evaluate(f'anim({t})')
            pg.locator('#screen').screenshot(path=os.path.join(TELAS, nome))
        b.close()

W, H = 1080, 1920
OY = (H - 1440) // 2          # topo da área segura 3:4
MENTA = (135, 249, 204)
BRANCO = (255, 255, 255)
ICONE_MENTA = (126, 255, 227)  # tom medido na série (o arquivo do arsenal é #AEFFE3)

# Celular vazio: contorno, tela e câmera medidos em scripts/compor-mockup-multiplataforma.mjs.
CEL_CONTORNO = [(829.3, 116.5), (1226.7, 116.5), (1232.3, 992.5), (823.7, 992.5)]
CEL_RAIO = 42
CEL_TELA = [(849, 128), (1209.5, 128), (1210.5, 964), (847, 964)]
CEL_TELA_RAIO = 30
CEL_CAMERA = (1029.4, 152, 9)


# ---------------------------------------------------------------- geometria
def homografia(src, dst):
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    _, _, vt = np.linalg.svd(np.array(A, float))
    return vt[-1].reshape(3, 3) / vt[-1][-1]


def ret_arredondado(w, h, r, escala=4):
    m = Image.new('L', (w * escala, h * escala), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w * escala - 1, h * escala - 1], r * escala, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def g_poligono():
    d = re.search(r' d="([^"]+)"', open(SIMBOLO, encoding='utf-8').read()).group(1)
    tok = re.findall(r'[MmCcLlHhVvZz]|-?\d*\.?\d+(?:e-?\d+)?', d)
    pts, i, cur, cmd, ini = [], 0, np.zeros(2), None, None

    def nums(n):
        nonlocal i
        v = [float(t) for t in tok[i:i + n]]
        i += n
        return v
    while i < len(tok):
        if re.match(r'[A-Za-z]', tok[i]):
            cmd = tok[i]
            i += 1
        if cmd in 'Zz':
            pts.append(ini.copy())
            continue
        if cmd == 'M':
            cur = np.array(nums(2))
            ini = cur.copy()
            pts.append(cur.copy())
            cmd = 'L'
        elif cmd in 'Cc':
            v = np.array(nums(6)).reshape(3, 2) + (cur if cmd == 'c' else 0)
            for s in np.linspace(0, 1, 24)[1:]:
                pts.append((1 - s) ** 3 * cur + 3 * (1 - s) ** 2 * s * v[0] + 3 * (1 - s) * s * s * v[1] + s ** 3 * v[2])
            cur = v[2]
        elif cmd in 'Ll':
            v = np.array(nums(2))
            cur = v + cur if cmd == 'l' else v
            pts.append(cur.copy())
        elif cmd in 'Hh':
            v = nums(1)[0]
            cur = np.array([cur[0] + v if cmd == 'h' else v, cur[1]])
            pts.append(cur.copy())
        elif cmd in 'Vv':
            v = nums(1)[0]
            cur = np.array([cur[0], cur[1] + v if cmd == 'v' else v])
            pts.append(cur.copy())
    return np.array(pts) - 229.78   # centrado; raio externo 229,78


G_PTS = g_poligono()


def mascara_g(cx, cy, r, rot, espelho=False, escala=3):
    pts = G_PTS * ([-1, 1] if espelho else [1, 1])
    c, s = np.cos(np.radians(rot)), np.sin(np.radians(rot))
    pts = pts @ np.array([[c, -s], [s, c]]).T * (r / 229.78) + [cx, cy]
    m = Image.new('L', (W * escala, H * escala), 0)
    ImageDraw.Draw(m).polygon([tuple(p * escala) for p in pts], fill=255)
    return m.resize((W, H), Image.LANCZOS)


# ---------------------------------------------------------------- fundo
def degrade(topo_esq, topo_dir, base_esq, base_dir):
    y = np.linspace(0, 1, H)[:, None, None]
    x = np.linspace(0, 1, W)[None, :, None]
    te, td, be, bd = (np.array(c, float) for c in (topo_esq, topo_dir, base_esq, base_dir))
    return (te * (1 - x) * (1 - y) + td * x * (1 - y) + be * (1 - x) * y + bd * x * y)


def fundo(luz_da_direita, g):
    """Moldura + painel (luz de cima) + G. Retorna imagem e cobertura do G."""
    if luz_da_direita:
        moldura = degrade((0, 50, 56), (0, 66, 70), (0, 34, 42), (0, 46, 54))
        painel = degrade((0, 40, 46), (0, 86, 81), (0, 26, 34), (0, 56, 58))
    else:
        moldura = degrade((0, 66, 70), (0, 50, 56), (0, 46, 54), (0, 34, 42))
        painel = degrade((0, 86, 81), (0, 60, 61), (0, 52, 54), (0, 30, 38))
    # Tom do G: deslocamento pequeno sobre o próprio painel (guia, seção 4: 3 a 14 níveis).
    tom_g = painel + np.array([0, g['delta'], g['delta'] * 0.85])
    mg = np.asarray(mascara_g(g['cx'], g['cy'], g['r'], g['rot'], g.get('espelho', False)), float)[..., None] / 255
    mp = np.asarray(ret_arredondado(1034, H - 42, 29), float) / 255
    mpainel = np.zeros((H, W, 1))
    mpainel[21:H - 21, 23:1057, 0] = mp
    painel_g = painel * (1 - mg) + tom_g * mg
    img = moldura * (1 - mpainel) + painel_g * mpainel
    # Cobertura medida dentro do painel da área segura, como na série (41 a 43%).
    seg = mg[OY + 21:OY + 1419, 23:1057, 0]
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)), seg.mean()


# ---------------------------------------------------------------- aparelho
def celular_com_tela(tela_png, recorte_topo=0.0):
    foto = Image.open(CELULAR).convert('RGB')
    xs = [p[0] for p in CEL_CONTORNO]
    ys = [p[1] for p in CEL_CONTORNO]
    x0, y0, x1, y1 = int(min(xs)), int(min(ys)), int(max(xs)) + 1, int(max(ys)) + 1
    cel = foto.crop((x0, y0, x1, y1)).convert('RGBA')
    Lc, Ac = x1 - x0, y1 - y0
    # contorno do corpo: retificado, arredondado e devolvido ao espaço da foto
    Hc = homografia([(x - x0, y - y0) for x, y in CEL_CONTORNO], [(0, 0), (Lc, 0), (Lc, Ac), (0, Ac)])
    m = ret_arredondado(Lc, Ac, CEL_RAIO)
    m = m.transform((Lc, Ac), Image.PERSPECTIVE, list(Hc.flatten()[:8]), Image.BICUBIC)
    cel.putalpha(m)

    # tela real por homografia, cortando as laterais para caber na proporção
    tela = Image.open(tela_png).convert('RGB')
    tw = CEL_TELA[1][0] - CEL_TELA[0][0]
    th = CEL_TELA[3][1] - CEL_TELA[0][1]
    alvo = tw / th
    sw, sh = tela.size
    topo = int(sh * recorte_topo)
    util_h = sh - topo
    util_w = util_h * alvo
    if util_w > sw:
        util_w = sw
        util_h = sw / alvo
    lado = (sw - util_w) / 2
    tela = tela.crop((int(lado), topo, int(lado + util_w), int(topo + util_h)))
    escala = 3
    TW, TH = int(tw * escala), int(th * escala)
    tela = tela.resize((TW, TH), Image.LANCZOS)
    mt = ret_arredondado(TW, TH, CEL_TELA_RAIO * escala)
    # reflexo diagonal de vidro (~8%) e vinheta leve, como manda o README dos mockups
    yy, xx = np.mgrid[0:TH, 0:TW]
    brilho = np.clip(1 - np.abs((xx / TW + yy / TH) - 0.55) * 3, 0, 1) * 0.08
    vinheta = 1 - 0.10 * (np.hypot((xx / TW - 0.5) * 2, (yy / TH - 0.5) * 2) / 1.41) ** 2
    a = np.asarray(tela, float) * vinheta[..., None] + 255 * brilho[..., None]
    tela = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGBA')
    tela.putalpha(mt)
    dst = [(x - x0, y - y0) for x, y in CEL_TELA]
    Ht = homografia(dst, [(0, 0), (TW, 0), (TW, TH), (0, TH)])
    tela = tela.transform((Lc, Ac), Image.PERSPECTIVE, list(Ht.flatten()[:8]), Image.BICUBIC)
    cel.alpha_composite(tela)
    # câmera por cima
    cx, cy, cr = CEL_CAMERA
    ImageDraw.Draw(cel).ellipse([cx - x0 - cr, cy - y0 - cr, cx - x0 + cr, cy - y0 + cr], fill=(6, 8, 10, 255))
    return cel


def colar_celular(base, cel, centro, altura, inclinacao):
    esc = altura / cel.height
    cel = cel.resize((int(cel.width * esc), int(cel.height * esc)), Image.LANCZOS)
    cel = cel.rotate(inclinacao, resample=Image.BICUBIC, expand=True)
    x = int(centro[0] - cel.width / 2)
    y = int(centro[1] - cel.height / 2)
    # sombra projetada difusa + sombra de contato (guia, seção 8: 12 a 14 níveis abaixo)
    a = np.asarray(cel.split()[-1], float)
    sombra = Image.new('L', base.size, 0)
    sombra.paste(Image.fromarray((a * 0.55).astype(np.uint8)), (x + 18, y + 34))
    sombra = sombra.filter(ImageFilter.GaussianBlur(38))
    contato = Image.new('L', base.size, 0)
    ImageDraw.Draw(contato).ellipse([x + cel.width * 0.12, y + cel.height - 30, x + cel.width * 0.88, y + cel.height + 40], fill=120)
    contato = contato.filter(ImageFilter.GaussianBlur(30))
    escuro = Image.new('RGBA', base.size, (0, 10, 14, 255))
    base = Image.composite(escuro, base, sombra)
    base = Image.composite(escuro, base, contato)
    base.alpha_composite(cel, (x, y))
    return base, (x, y, x + cel.width, y + cel.height)


# ---------------------------------------------------------------- ícones
def icone(base, nome, centro, diametro, rot, desfoque=6):
    im = Image.open(os.path.join(ICONES, f'{nome}-menta.png')).convert('RGBA')
    a = np.asarray(im, float)
    circulo = (a[..., 1] > 200) & (a[..., 3] > 0)
    a[circulo, 0], a[circulo, 1], a[circulo, 2] = ICONE_MENTA
    im = Image.fromarray(a.astype(np.uint8))
    im = im.resize((diametro, diametro), Image.LANCZOS).rotate(-rot, resample=Image.BICUBIC)
    pad = desfoque * 4
    tela = Image.new('RGBA', (diametro + 2 * pad, diametro + 2 * pad), (0, 0, 0, 0))
    tela.alpha_composite(im, (pad, pad))
    tela = tela.filter(ImageFilter.GaussianBlur(desfoque))
    base.alpha_composite(tela, (int(centro[0] - diametro / 2 - pad), int(centro[1] - diametro / 2 - pad)))


# ---------------------------------------------------------------- texto
def fonte(caminho, px):
    return ImageFont.truetype(caminho, px)


def largura(txt, f, tracking):
    if not txt:
        return 0
    return sum(f.getlength(c) for c in txt) + f.size * tracking * (len(txt) - 1)


def escrever(d, linhas, f, x, y, entrelinha, tracking=0.0, alinhar='esq'):
    """linhas: lista de listas de (texto, cor). y é a linha de base da 1ª linha."""
    for i, partes in enumerate(linhas):
        total = sum(largura(t, f, tracking) for t, _ in partes) + f.size * tracking * max(0, len(partes) - 1) * 0
        cx = x - total if alinhar == 'dir' else x
        for t, cor in partes:
            for c in t:
                d.text((cx, y + i * entrelinha), c, font=f, fill=cor, anchor='ls')
                cx += f.getlength(c) + f.size * tracking
    return y + (len(linhas) - 1) * entrelinha


def fixos(base):
    """Logotipo em gradiente e RÁPIDO / FÁCIL / PRÁTICO na área segura (guia, seção 2)."""
    logo = Image.open(LOGO).convert('RGBA')
    logo = logo.crop(logo.getbbox())
    logo = logo.resize((125, round(125 * logo.height / logo.width)), Image.LANCZOS)
    base.alpha_composite(logo, (85, OY + 63))
    d = ImageDraw.Draw(base)
    f = fonte(REGULAR, 15)
    escrever(d, [[('RÁPIDO', MENTA)]], f, 998, OY + 88, 0, 1.0, 'dir')
    escrever(d, [[('FÁCIL', MENTA)]], f, 84, OY + 1366, 0, 1.0)
    escrever(d, [[('PRÁTICO', MENTA)]], f, 998, OY + 1366, 0, 1.0, 'dir')


# ---------------------------------------------------------------- peças
def ajustar_g(luz, g, alvo=0.42):
    """Escala o G até cobrir ~42% do painel da área segura (constante da série)."""
    for _ in range(12):
        img, cob = fundo(luz, g)
        if abs(cob - alvo) < 0.008:
            break
        g['r'] *= (alvo / max(cob, 0.05)) ** 0.5
    return img, cob


def capa_v8(saida):
    # Arquétipo C: celular à esquerda, texto à direita alinhado à direita.
    g = dict(cx=800, cy=OY + 940, r=790, rot=3, delta=13)
    base, cob = ajustar_g(True, g)
    base = base.convert('RGBA')
    icone(base, 'voz', (24, OY + 214), 138, -15)
    icone(base, 'cafe', (1040, OY + 1150), 266, 15)
    cel = celular_com_tela(os.path.join(TELAS, 'tela-voz-padaria.png'))
    base, caixa = colar_celular(base, cel, (362, OY + 742), 930, 5)
    d = ImageDraw.Draw(base)
    h1 = fonte(ULTRABOLD, 72)
    h2 = fonte(REGULAR, 31)
    ass = fonte(REGULAR, 24)
    y = escrever(d, [[('Fala o', MENTA)], [('gasto.', MENTA)], [('Pronto.', BRANCO)]], h1, 958, OY + 587, 72, 0, 'dir')
    y = escrever(d, [[('Pagou o pão?', BRANCO)], [('Diz o valor e o', BRANCO)], [('Grana. anota.', BRANCO)]], h2, 958, y + 19 + 22 + 22, 37, 0.05, 'dir')
    escrever(d, [[('O Grana. te ajuda!', MENTA)]], ass, 958, y + 80 + 17, 0, 0.05, 'dir')
    fixos(base)
    base.convert('RGB').save(saida)
    return cob, caixa


def capa_desistiu(saida):
    # Arquétipo A: texto à esquerda, celular à direita.
    g = dict(cx=540, cy=OY + 658, r=569, rot=210, espelho=True, delta=-8)
    base, cob = ajustar_g(False, g)
    base = base.convert('RGBA')
    icone(base, 'qr-code-nota', (1030, OY + 300), 150, 10)
    icone(base, 'lembrete', (40, OY + 1180), 270, -15)
    cel = celular_com_tela(os.path.join(TELAS, 'tela-foto-da-nota.png'))
    base, caixa = colar_celular(base, cel, (822, OY + 925), 770, -3)
    d = ImageDraw.Draw(base)
    h1 = fonte(ULTRABOLD, 72)
    h2 = fonte(REGULAR, 31)
    ass = fonte(REGULAR, 24)
    y = escrever(d, [[('Já desistiu', MENTA)], [('de controlar', MENTA)], [('seus gastos?', MENTA)]], h1, 120, OY + 425, 72, 0)
    y = escrever(d, [[('Anotar tudo cansa.', BRANCO)], [('Fotografa a nota', MENTA)], [('e pronto.', MENTA)]], h2, 120, y + 41 + 22 + 22, 37, 0.05)
    escrever(d, [[('O Grana. te ajuda!', MENTA)]], ass, 120, y + 80 + 17, 0, 0.05)
    fixos(base)
    base.convert('RGB').save(saida)
    return cob, caixa


if __name__ == '__main__':
    destino = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(destino, exist_ok=True)
    renderizar_telas()
    for nome, f in (('grana-reels-v8-pop-capa-1080x1920.png', capa_v8),
                    ('grana-motion-desistiu-foto-da-nota-capa-1080x1920.png', capa_desistiu)):
        cob, caixa = f(os.path.join(destino, nome))
        print(f'{nome}: G cobre {cob:.0%} do painel; celular em {caixa}')

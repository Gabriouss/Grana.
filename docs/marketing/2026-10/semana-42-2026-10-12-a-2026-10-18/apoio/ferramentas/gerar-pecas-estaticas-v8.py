"""Gerador das peças estáticas ajustadas (Semana 42 — 16/10/2026).

Atende aos pedidos estáticos da fila do painel (1, 2, 3, 4 e 6 de ajustes-pecas-novos-16-10.md):
- Pedido 1 (C01 card): para-aprovacao/pecas/lumen-v8/card.png (1080x1440)
- Pedidos 2, 3, 4 (C14 carrossel): para-aprovacao/pecas/lumen-v8/carrossel-1..5.png (1080x1440)
- Pedido 6 (Capa Reel narrado): para-aprovacao/pecas/reels/grana-motion-desistiu-foto-da-nota-narrado-capa-v2.png (1080x1920)

Segue integralmente:
- docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11/apoio/referencias/guia-de-design-estatico-feed-3x4.md
- docs/marketing/GUIA-DE-PRODUCAO-DE-CRIATIVOS.md
- Regras 21, 23, 24, 25 e 26 do AGENTS.md (100% local via Pillow/numpy, custo zero).
"""
import importlib.util
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__))
SEMANA42 = os.path.abspath(os.path.join(AQUI, '..', '..'))
CAPAS_PY = os.path.abspath(
    os.path.join(
        SEMANA42,
        '..',
        'semana-41-2026-10-05-a-2026-10-11',
        'apoio',
        'ferramentas',
        'gerar-capas-reels.py',
    )
)

spec = importlib.util.spec_from_file_location('capas', CAPAS_PY)
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)

MENTA, BRANCO = c.MENTA, c.BRANCO
CAPT_OUTUBRO = c.P(
    'docs',
    'marketing',
    '2026-10',
    'semana-40-2026-09-28-a-2026-10-04',
    'apoio',
    'capturas-fonte',
    'outubro',
)
CAPT_SEMANA41 = c.P(
    'docs',
    'marketing',
    '2026-10',
    'semana-41-2026-10-05-a-2026-10-11',
    'apoio',
    'capturas-fonte',
)
NOTEBOOK = c.P('public', 'notebook', 'notebook.webp')
TELA_NB = [(471.8, 56.5), (1384.5, 16.1), (1338.2, 699.3), (425.5, 650.1)]


def tela_celular_sem_corte_lateral(tela_png, pad_lateral_ratio=0.006):
    """Encaixa a captura real no mockup de celular preservando 100% da largura
    da interface (sem cortar laterais) e adicionando respiro interno na cor de
    fundo da própria captura para que os cantos arredondados nunca cortem texto
    ou ícones."""
    foto = Image.open(c.CELULAR).convert('RGB')
    xs = [p[0] for p in c.CEL_CONTORNO]
    ys = [p[1] for p in c.CEL_CONTORNO]
    x0, y0, x1, y1 = int(min(xs)), int(min(ys)), int(max(xs)) + 1, int(max(ys)) + 1
    cel = foto.crop((x0, y0, x1, y1)).convert('RGBA')
    Lc, Ac = x1 - x0, y1 - y0
    Hc = c.homografia(
        [(x - x0, y - y0) for x, y in c.CEL_CONTORNO],
        [(0, 0), (Lc, 0), (Lc, Ac), (0, Ac)],
    )
    m = c.ret_arredondado(Lc, Ac, c.CEL_RAIO)
    m = m.transform((Lc, Ac), Image.PERSPECTIVE, list(Hc.flatten()[:8]), Image.BICUBIC)
    cel.putalpha(m)

    tela_orig = Image.open(tela_png).convert('RGB')
    sw, sh = tela_orig.size
    tw = c.CEL_TELA[1][0] - c.CEL_TELA[0][0]
    th = c.CEL_TELA[3][1] - c.CEL_TELA[0][1]
    alvo = tw / th

    # Preserva 100% da largura sw com respiro lateral e ajusta a altura pelo alvo
    pad_x = int(round(sw * pad_lateral_ratio))
    novo_w = sw + 2 * pad_x
    novo_h = int(round(novo_w / alvo))
    if novo_h < sh + 2 * pad_x:
        novo_h = sh + 2 * pad_x
        novo_w = int(round(novo_h * alvo))
        pad_x = (novo_w - sw) // 2
    pad_y = (novo_h - sh) // 2

    arr_orig = np.asarray(tela_orig)
    cor_topo = tuple(int(v) for v in np.median(arr_orig[0:4, :, :], axis=(0, 1)))
    cor_base = tuple(int(v) for v in np.median(arr_orig[-4:, :, :], axis=(0, 1)))

    canvas_tela = Image.new('RGB', (novo_w, novo_h), cor_topo)
    if pad_y > 0:
        faixa_base = Image.new('RGB', (novo_w, novo_h - (pad_y + sh)), cor_base)
        canvas_tela.paste(faixa_base, (0, pad_y + sh))
    canvas_tela.paste(tela_orig, (pad_x, pad_y))

    escala = 3
    TW, TH = int(tw * escala), int(th * escala)
    tela = canvas_tela.resize((TW, TH), Image.LANCZOS)
    mt = c.ret_arredondado(TW, TH, c.CEL_TELA_RAIO * escala)

    yy, xx = np.mgrid[0:TH, 0:TW]
    brilho = np.clip(1 - np.abs((xx / TW + yy / TH) - 0.55) * 3, 0, 1) * 0.08
    vinheta = 1 - 0.10 * (np.hypot((xx / TW - 0.5) * 2, (yy / TH - 0.5) * 2) / 1.41) ** 2
    a = np.asarray(tela, float) * vinheta[..., None] + 255 * brilho[..., None]
    tela = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGBA')
    tela.putalpha(mt)

    dst = [(x - x0, y - y0) for x, y in c.CEL_TELA]
    Ht = c.homografia(dst, [(0, 0), (TW, 0), (TW, TH), (0, TH)])
    tela = tela.transform((Lc, Ac), Image.PERSPECTIVE, list(Ht.flatten()[:8]), Image.BICUBIC)
    cel.alpha_composite(tela)

    cx, cy, cr = c.CEL_CAMERA
    ImageDraw.Draw(cel).ellipse(
        [cx - x0 - cr, cy - y0 - cr, cx - x0 + cr, cy - y0 + cr],
        fill=(6, 8, 10, 255),
    )
    return cel


def notebook_com_tela(web_png):
    nb = Image.open(NOTEBOOK).convert('RGBA')
    tela_orig = Image.open(web_png).convert('RGB')
    sw, sh = tela_orig.size
    arr = np.asarray(tela_orig)
    cor_fundo = tuple(int(v) for v in np.median(arr[0:4, 0:20, :], axis=(0, 1)))
    pad_x = int(round(sw * 0.012))
    pad_y = int(round(sh * 0.016))
    TW, TH = sw + 2 * pad_x, sh + 2 * pad_y
    tela = Image.new('RGB', (TW, TH), cor_fundo)
    tela.paste(tela_orig, (pad_x, pad_y))

    m = c.ret_arredondado(TW, TH, 14)
    tela = tela.convert('RGBA')
    tela.putalpha(m)
    Ht = c.homografia(TELA_NB, [(0, 0), (TW, 0), (TW, TH), (0, TH)])
    tela = tela.transform(nb.size, Image.PERSPECTIVE, list(Ht.flatten()[:8]), Image.BICUBIC)
    nb.alpha_composite(tela)
    return nb


def celular_mascara(cel, W, H, centro, altura, incl):
    esc = altura / cel.height
    r = cel.resize((int(cel.width * esc), int(cel.height * esc)), Image.LANCZOS).rotate(
        incl, resample=Image.BICUBIC, expand=True
    )
    m = Image.new('L', (W, H), 0)
    m.paste(r.split()[-1], (int(centro[0] - r.width / 2), int(centro[1] - r.height / 2)))
    return m


def compor_peca(cfg, saida, W=1080, H=1440, OY=0):
    c.W = W
    c.H = H
    c.OY = OY

    g = dict(cfg['g'])
    base, cob = c.ajustar_g(cfg.get('luz_direita', False), g)
    base = base.convert('RGBA')
    mascara_ap = Image.new('L', (W, H), 0)
    caixas = []

    # 1. Ícones de fundo (antes dos aparelhos para nunca cobrir print nem texto)
    for ic in cfg['icones']:
        c.icone(base, ic['nome'], ic['centro'], ic['d'], ic['rot'], desfoque=ic.get('desfoque', 6))

    # 2. Aparelhos (de trás para a frente)
    for ap in cfg['aparelhos']:
        if ap['tipo'] == 'notebook':
            nb = notebook_com_tela(ap['tela'])
            nb = nb.crop(nb.getbbox())
            esc = ap['largura'] / nb.width
            nb = nb.resize((ap['largura'], int(nb.height * esc)), Image.LANCZOS)
            x, y = int(ap['centro'][0] - nb.width / 2), int(ap['centro'][1] - nb.height / 2)
            a = np.asarray(nb.split()[-1], float)
            sombra = Image.new('L', base.size, 0)
            sombra.paste(Image.fromarray((a * 0.5).astype(np.uint8)), (x + 14, y + 30))
            sombra = sombra.filter(ImageFilter.GaussianBlur(34))
            contato = Image.new('L', base.size, 0)
            ImageDraw.Draw(contato).ellipse(
                [x + nb.width * 0.1, y + nb.height - 26, x + nb.width * 0.92, y + nb.height + 34],
                fill=130,
            )
            contato = contato.filter(ImageFilter.GaussianBlur(26))
            escuro = Image.new('RGBA', base.size, (0, 10, 14, 255))
            base = Image.composite(escuro, base, sombra)
            base = Image.composite(escuro, base, contato)
            base.alpha_composite(nb, (x, y))
            caixas.append(('notebook', (x, y, x + nb.width, y + nb.height)))
            mascara_ap.paste(nb.split()[-1], (x, y), nb.split()[-1])
        else:
            cel = tela_celular_sem_corte_lateral(ap['tela'])
            base, caixa = c.colar_celular(base, cel, ap['centro'], ap['altura'], ap['incl'])
            caixas.append(('celular', caixa))
            mascara_ap = Image.composite(
                Image.new('L', (W, H), 255),
                mascara_ap,
                celular_mascara(cel, W, H, ap['centro'], ap['altura'], ap['incl']),
            )

    # 3. Tipografia (H1 Ultrabold 72 px, H2 Regular 31 px, Assinatura Regular 24 px)
    d = ImageDraw.Draw(base)
    h1 = c.fonte(c.ULTRABOLD, 72)
    h2 = c.fonte(c.REGULAR, 31)
    ass = c.fonte(c.REGULAR, 24)
    t = cfg['texto']
    x, al = t['x'], t.get('alinhar', 'esq')
    entre = t.get('entrelinha', 72)
    h1_h2 = t.get('h1_h2', 44)

    y_fim_h1 = c.escrever(d, t['h1'], h1, x, t['y'], entre, 0, al)
    y_ini_h2 = y_fim_h1 + h1_h2 + 22
    y_fim_h2 = c.escrever(d, t['h2'], h2, x, y_ini_h2, 37, 0.05, al)
    yb = y_fim_h2 + 80 + 17
    c.escrever(d, [[(t['sig'], MENTA)]], ass, x, yb, 0, 0.05, al)

    # 4. Fixos (Logotipo gradiente + RÁPIDO / FÁCIL / PRÁTICO)
    c.fixos(base)

    # 5. Medição de colisão entre texto e aparelhos e largura das linhas
    tm = Image.new('L', (W, H), 0)
    td = ImageDraw.Draw(tm)
    caixas_texto = []
    for blocos, fonte_, y_base, ent, trk in (
        (t['h1'], h1, t['y'], entre, 0),
        (t['h2'], h2, y_ini_h2, 37, 0.05),
        ([[(t['sig'], MENTA)]], ass, yb, 0, 0.05),
    ):
        for i, partes in enumerate(blocos):
            larg = sum(c.largura(p, fonte_, trk) for p, _ in partes)
            x0 = x - larg if al == 'dir' else x
            top = y_base + i * ent - fonte_.size * 0.78
            bot = y_base + i * ent + fonte_.size * 0.22
            td.rectangle([x0, top, x0 + larg, bot], fill=255)
            caixas_texto.append((round(x0), round(top), round(x0 + larg), round(bot)))

    # Inclui tambem logo e selos fixos (RAPIDO, FACIL, PRATICO) na mascara de colisao
    for fx0, fy0, fx1, fy1 in (
        (85, OY + 63, 210, OY + 102),
        (850, OY + 72, 998, OY + 92),
        (84, OY + 1348, 200, OY + 1370),
        (845, OY + 1348, 998, OY + 1370),
    ):
        td.rectangle([fx0, fy0, fx1, fy1], fill=255)

    colide = (
        np.asarray(
            Image.composite(
                Image.new('L', (W, H), 255),
                Image.new('L', (W, H), 0),
                Image.fromarray(np.minimum(np.asarray(tm), np.asarray(mascara_ap))),
            )
        ).sum()
        / 255
    )

    # Margem mínima de cada aparelho até o painel (x: 23..1057, y: OY+21..OY+1419)
    margens_painel = []
    for tipo_ap, (ax0, ay0, ax1, ay1) in caixas:
        m_esq = ax0 - 23
        m_dir = 1057 - ax1
        m_topo = ay0 - (OY + 21)
        m_base = (OY + 1419) - ay1
        margens_painel.append(
            dict(
                tipo=tipo_ap,
                caixa=(ax0, ay0, ax1, ay1),
                proporcao_altura=round((ay1 - ay0) / 1440.0, 4),
                margem_min_px=min(m_esq, m_dir, m_topo, m_base),
                margens=dict(esq=m_esq, dir=m_dir, topo=m_topo, base=m_base),
            )
        )

    os.makedirs(os.path.dirname(saida), exist_ok=True)
    out = base.convert('RGB')
    out.save(saida)

    return dict(
        arquivo=os.path.relpath(saida, c.RAIZ).replace(os.sep, '/'),
        dimensoes=out.size,
        cobertura_g=round(float(cob), 4),
        delta_g=g['delta'],
        colisao_texto_aparelho_px=int(colide),
        assinatura_y=int(yb),
        aparelhos=margens_painel,
        texto_bbox=(
            min(b[0] for b in caixas_texto),
            min(b[1] for b in caixas_texto),
            max(b[2] for b in caixas_texto),
            max(b[3] for b in caixas_texto),
        ),
    )


def tela_outubro(nome):
    return os.path.join(CAPT_OUTUBRO, 'celular', nome + '.png')


L, R = 120, 958

# ----------------------------------------------------------------
# 1. Pedido 1: Card estático C01 (lumen-v8/card.png, 1080x1440)
#    Sem citar cofrinhos na copy, design 3:4 oficial, Arquétipo A.
#    Celular com altura=955 (~67.2% da altura do painel, ~480 px de largura)
#    para leitura direta dos números e rótulos no feed sem zoom.
# ----------------------------------------------------------------
CFG_CARD = dict(
    g=dict(cx=540, cy=665, r=570, rot=205, espelho=True, delta=-8),
    luz_direita=False,
    aparelhos=[
        dict(
            tipo='celular',
            tela=tela_outubro('inicio'),
            centro=(766, 850),
            altura=955,
            incl=-1.5,
        )
    ],
    icones=[
        dict(nome='calendario', centro=(1028, 250), d=144, rot=10),
        dict(nome='carteira', centro=(42, 1185), d=264, rot=-15),
    ],
    texto=dict(
        x=L,
        y=225,
        entrelinha=72,
        h1_h2=40,
        h1=[
            [('Quanto dá', MENTA)],
            [('pra gastar', MENTA)],
            [('hoje?', MENTA)],
        ],
        h2=[
            [('Veja na hora', BRANCO)],
            [('quanto cabe no', BRANCO)],
            [('seu dia deste mês.', MENTA)],
        ],
        sig='O Grana. te ajuda!',
    ),
)

# ----------------------------------------------------------------
# 2. Pedidos 2, 3 e 4: Carrossel C14 (lumen-v8/carrossel-1..5.png, 1080x1440)
#    Sequência de arquétipos sem repetição vizinha: A -> C -> A -> B -> C.
#    Celular ampliado para 66.5%-67.2% da altura (altura=920..955 nos slides de celular único,
#    altura=860 no slide duplo com notebook) conforme pedido do autor em 16/10.
#    Copy dos slides 1 e 2 100% fiel à Regra 20 (saldo e Livre para gastar usam
#    só o mês vigente; compras no Pix/débito saem do caixa e dividem pelos dias).
# ----------------------------------------------------------------
CFG_CARROSSEL = {
    1: dict(  # Arquétipo A: texto à esquerda, celular grande à direita (topo p/ direita)
        g=dict(cx=340, cy=960, r=700, rot=38, delta=-8),
        luz_direita=False,
        aparelhos=[
            dict(
                tipo='celular',
                tela=tela_outubro('inicio'),
                centro=(766, 850),
                altura=955,
                incl=-1.5,
            )
        ],
        icones=[
            dict(nome='calendario', centro=(1028, 250), d=146, rot=12),
            dict(nome='cartao', centro=(48, 1180), d=256, rot=-18),
        ],
        texto=dict(
            x=L,
            y=215,
            entrelinha=74,
            h1_h2=38,
            h1=[
                [('Olhar só', MENTA)],
                [('o saldo', MENTA)],
                [('engana', BRANCO)],
                [('o seu mês.', BRANCO)],
            ],
            h2=[
                [('R$ 800 no dia 5', BRANCO)],
                [('não valem o mesmo', BRANCO)],
                [('que no dia 25.', MENTA)],
            ],
            sig='Arrasta pro lado!',
        ),
    ),
    2: dict(  # Arquétipo C: celular grande à esquerda (topo p/ esquerda), texto à direita
        g=dict(cx=810, cy=945, r=780, rot=195, espelho=True, delta=12),
        luz_direita=True,
        aparelhos=[
            dict(
                tipo='celular',
                tela=tela_outubro('lancamentos'),
                centro=(322, 852),
                altura=920,
                incl=5.8,
            )
        ],
        icones=[
            dict(nome='tempo', centro=(28, 225), d=142, rot=-15),
            dict(nome='calendario', centro=(1040, 1155), d=262, rot=15),
        ],
        texto=dict(
            x=R,
            y=195,
            alinhar='dir',
            entrelinha=72,
            h1_h2=34,
            h1=[
                [('Quantos dias', MENTA)],
                [('faltam até', MENTA)],
                [('virar o mês?', MENTA)],
            ],
            h2=[
                [('Cada saída no Pix', BRANCO)],
                [('ou no débito muda', BRANCO)],
                [('o ritmo do resto.', MENTA)],
            ],
            sig='Arrasta pro lado!',
        ),
    ),
    3: dict(  # Arquétipo A: texto à esquerda, celular grande à direita (topo p/ direita)
        g=dict(cx=560, cy=880, r=720, rot=165, delta=-7),
        luz_direita=False,
        aparelhos=[
            dict(
                tipo='celular',
                tela=tela_outubro('inicio'),
                centro=(766, 850),
                altura=955,
                incl=-1.5,
            )
        ],
        icones=[
            dict(nome='seguranca', centro=(1028, 250), d=148, rot=10),
            dict(nome='carteira', centro=(44, 1165), d=258, rot=-15),
        ],
        texto=dict(
            x=L,
            y=215,
            entrelinha=74,
            h1_h2=38,
            h1=[
                [('Quanto cabe', MENTA)],
                [('no seu dia,', MENTA)],
                [('calculado', BRANCO)],
                [('na hora.', BRANCO)],
            ],
            h2=[
                [('O Grana. divide', BRANCO)],
                [('o saldo do mês', BRANCO)],
                [('pelos dias restantes.', MENTA)],
            ],
            sig='Arrasta pro lado!',
        ),
    ),
    4: dict(  # Arquétipo B: texto em cima, notebook + celular grande embaixo
        g=dict(cx=24, cy=650, r=820, rot=0, delta=-12),
        luz_direita=True,
        aparelhos=[
            dict(
                tipo='notebook',
                tela=os.path.join(CAPT_OUTUBRO, 'web', 'inicio.png'),
                centro=(420, 1048),
                largura=730,
            ),
            dict(
                tipo='celular',
                tela=tela_outubro('credito'),
                centro=(798, 902),
                altura=860,
                incl=-1.5,
            ),
        ],
        icones=[
            dict(nome='cafe', centro=(1032, 245), d=148, rot=12),
            dict(nome='computador', centro=(55, 885), d=252, rot=-15),
        ],
        texto=dict(
            x=L,
            y=200,
            entrelinha=70,
            h1_h2=32,
            h1=[
                [('Bateu a dúvida', MENTA)],
                [('antes de gastar?', MENTA)],
            ],
            h2=[
                [('Confira no celular', BRANCO)],
                [('ou no computador se', BRANCO)],
                [('cabe no seu dia.', MENTA)],
            ],
            sig='Arrasta pro lado!',
        ),
    ),
    5: dict(  # Arquétipo C: celular grande à esquerda (topo p/ esquerda), texto à direita
        g=dict(cx=795, cy=935, r=785, rot=-25, delta=13),
        luz_direita=True,
        aparelhos=[
            dict(
                tipo='celular',
                tela=tela_outubro('graficos'),
                centro=(322, 852),
                altura=920,
                incl=5.8,
            )
        ],
        icones=[
            dict(nome='graficos', centro=(26, 220), d=140, rot=-15),
            dict(nome='dinheiro', centro=(1040, 1150), d=266, rot=15),
        ],
        texto=dict(
            x=R,
            y=195,
            alinhar='dir',
            entrelinha=74,
            h1_h2=34,
            h1=[
                [('O seu mês', MENTA)],
                [('inteiro claro,', MENTA)],
                [('do começo', BRANCO)],
                [('ao fim.', BRANCO)],
            ],
            h2=[
                [('Organize os gastos', BRANCO)],
                [('no app e na web por', BRANCO)],
                [('menos de R$ 0,37/dia.', MENTA)],
            ],
            sig='Comece agora no link da bio.',
        ),
    ),
}

# ----------------------------------------------------------------
# 3. Pedido 6: Capa de Reel 1080x1920 (OY = 240, área segura central 3:4)
#    para-aprovacao/pecas/reels/grana-motion-desistiu-foto-da-nota-narrado-capa-v2.png
#    Celular com altura=955 (~67.2% da área segura 3:4) para leitura nítida da nota fiscal.
# ----------------------------------------------------------------
OY_REEL = 240
CFG_CAPA_DESISTIU_NARRADO = dict(
    g=dict(cx=540, cy=OY_REEL + 658, r=569, rot=210, espelho=True, delta=-8),
    luz_direita=False,
    aparelhos=[
        dict(
            tipo='celular',
            tela=os.path.join(CAPT_SEMANA41, 'tela-nota-fotografada.png'),
            centro=(766, OY_REEL + 850),
            altura=955,
            incl=-1.5,
        )
    ],
    icones=[
        dict(nome='qr-code-nota', centro=(1030, OY_REEL + 245), d=148, rot=10),
        dict(nome='lembrete', centro=(42, OY_REEL + 1180), d=268, rot=-15),
    ],
    texto=dict(
        x=L,
        y=OY_REEL + 195,
        entrelinha=72,
        h1_h2=38,
        h1=[
            [('Já desistiu', MENTA)],
            [('de anotar', MENTA)],
            [('seus gastos?', MENTA)],
        ],
        h2=[
            [('Fotografe a nota,', BRANCO)],
            [('confira o valor', BRANCO)],
            [('e salve na hora.', MENTA)],
        ],
        sig='O Grana. te ajuda!',
    ),
)

# ----------------------------------------------------------------
# 4. Capas 1080x1920 para os Reels ajustados dos Pedidos 5 e 8
#    - reel-r13-v4-capa.png (Pedido 5)
#    - grana-r5-colar-pix-v7-capa.png (Pedido 8)
# ----------------------------------------------------------------
CFG_CAPA_R13_V4 = dict(
    g=dict(cx=540, cy=OY_REEL + 665, r=570, rot=200, espelho=True, delta=-8),
    luz_direita=False,
    aparelhos=[
        dict(
            tipo='celular',
            tela=tela_outubro('inicio'),
            centro=(766, OY_REEL + 850),
            altura=955,
            incl=-1.5,
        )
    ],
    icones=[
        dict(nome='calendario', centro=(1028, OY_REEL + 245), d=146, rot=10),
        dict(nome='carteira', centro=(42, OY_REEL + 1180), d=264, rot=-15),
    ],
    texto=dict(
        x=L,
        y=OY_REEL + 195,
        entrelinha=72,
        h1_h2=38,
        h1=[
            [('Passou na', MENTA)],
            [('farmácia', MENTA)],
            [('hoje?', MENTA)],
        ],
        h2=[
            [('Registre o gasto e', BRANCO)],
            [('veja na hora quanto', BRANCO)],
            [('resta para o seu dia.', MENTA)],
        ],
        sig='O Grana. te ajuda!',
    ),
)

CFG_CAPA_R5_V7 = dict(
    g=dict(cx=800, cy=OY_REEL + 940, r=780, rot=195, espelho=True, delta=12),
    luz_direita=True,
    aparelhos=[
        dict(
            tipo='celular',
            tela=os.path.join(CAPT_SEMANA41, 'tela-colar-pix.png'),
            centro=(322, OY_REEL + 852),
            altura=920,
            incl=5.8,
        )
    ],
    icones=[
        dict(nome='dinheiro', centro=(28, OY_REEL + 225), d=144, rot=-15),
        dict(nome='seguranca', centro=(1040, OY_REEL + 1155), d=262, rot=15),
    ],
    texto=dict(
        x=R,
        y=OY_REEL + 195,
        alinhar='dir',
        entrelinha=72,
        h1_h2=36,
        h1=[
            [('Recebeu', MENTA)],
            [('um Pix?', MENTA)],
            [('Só colar.', BRANCO)],
        ],
        h2=[
            [('Copie o comprovante', BRANCO)],
            [('e salve o gasto', BRANCO)],
            [('num toque.', MENTA)],
        ],
        sig='O Grana. te ajuda!',
    ),
)


def main():
    pasta_lumen_v8 = os.path.join(SEMANA42, 'para-aprovacao', 'pecas', 'lumen-v8')
    pasta_reels = os.path.join(SEMANA42, 'para-aprovacao', 'pecas', 'reels')

    relatorio_metricas = []

    # 1. Card C01
    m_card = compor_peca(
        CFG_CARD,
        os.path.join(pasta_lumen_v8, 'card.png'),
        W=1080,
        H=1440,
        OY=0,
    )
    relatorio_metricas.append(m_card)

    # 2. Carrossel C14 (slides 1..5)
    for idx, cfg_slide in CFG_CARROSSEL.items():
        m_slide = compor_peca(
            cfg_slide,
            os.path.join(pasta_lumen_v8, f'carrossel-{idx}.png'),
            W=1080,
            H=1440,
            OY=0,
        )
        relatorio_metricas.append(m_slide)

    # 3. Capa Reel narrado 1080x1920 (Pedido 6)
    m_capa = compor_peca(
        CFG_CAPA_DESISTIU_NARRADO,
        os.path.join(
            pasta_reels,
            'grana-motion-desistiu-foto-da-nota-narrado-capa-v2.png',
        ),
        W=1080,
        H=1920,
        OY=OY_REEL,
    )
    relatorio_metricas.append(m_capa)

    # 4. Capas dos Reels ajustados (Pedidos 5 e 8)
    m_capa_r13 = compor_peca(
        CFG_CAPA_R13_V4,
        os.path.join(pasta_reels, 'reel-r13-v4-capa.png'),
        W=1080,
        H=1920,
        OY=OY_REEL,
    )
    relatorio_metricas.append(m_capa_r13)

    m_capa_r5 = compor_peca(
        CFG_CAPA_R5_V7,
        os.path.join(pasta_reels, 'grana-r5-colar-pix-v7-capa.png'),
        W=1080,
        H=1920,
        OY=OY_REEL,
    )
    relatorio_metricas.append(m_capa_r5)

    for item in relatorio_metricas:
        print(json.dumps(item, ensure_ascii=False))


if __name__ == '__main__':
    main()


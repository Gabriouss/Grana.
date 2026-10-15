"""Carrossel de feed 1080x1440 no sistema visual dos estáticos 3:4 (guia de 11/10/2026).

Segue apoio/referencias/guia-de-design-estatico-feed-3x4.md (regra 26 do AGENTS.md)
e reaproveita o núcleo de gerar-capas-reels.py (G de fundo, degradê, celular por
homografia, ícones do arsenal, fixos), com a tela em 1080x1440 (OY = 0).

Uso:  python -I gerar-carrossel-feed-3x4.py <pasta de saída>
Requer: Pillow, numpy e a NeueMachina-Ultrabold instalada no Windows do usuário
(não versionada: fonte licenciada, repositório público).
"""
import importlib.util
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__))
CAPAS = os.path.join(AQUI, '..', '..', '..', 'semana-41-2026-10-05-a-2026-10-11', 'apoio', 'ferramentas', 'gerar-capas-reels.py')
spec = importlib.util.spec_from_file_location('capas', CAPAS)
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
c.H = 1440
c.OY = 0
W, H = 1080, 1440
MENTA, BRANCO = c.MENTA, c.BRANCO

CAPT = c.P('docs', 'marketing', '2026-10', 'semana-40-2026-09-28-a-2026-10-04', 'apoio', 'capturas-fonte', 'outubro')
NOTEBOOK = c.P('public', 'notebook', 'notebook.webp')
# Tela do notebook do herói (public/notebook/notebook.webp), medida em scripts/compor-mockup-multiplataforma.mjs.
TELA_NB = [(471.8, 56.5), (1384.5, 16.1), (1338.2, 699.3), (425.5, 650.1)]


def notebook_com_tela(web_png):
    nb = Image.open(NOTEBOOK).convert('RGBA')
    tela = Image.open(web_png).convert('RGB')
    TW, TH = tela.size
    m = c.ret_arredondado(TW, TH, 14)
    tela = tela.convert('RGBA')
    tela.putalpha(m)
    Ht = c.homografia(TELA_NB, [(0, 0), (TW, 0), (TW, TH), (0, TH)])
    tela = tela.transform(nb.size, Image.PERSPECTIVE, list(Ht.flatten()[:8]), Image.BICUBIC)
    nb.alpha_composite(tela)
    return nb


def celular_mascara(cel, centro, altura, incl):
    esc = altura / cel.height
    r = cel.resize((int(cel.width * esc), int(cel.height * esc)), Image.LANCZOS).rotate(incl, resample=Image.BICUBIC, expand=True)
    m = Image.new('L', (W, H), 0)
    m.paste(r.split()[-1], (int(centro[0] - r.width / 2), int(centro[1] - r.height / 2)))
    return m


def texto_mascara(h1, h2, sig, spec_):
    """Máscara das caixas de texto (por linha), para conferir colisão com aparelho e ícones."""
    return None


def compor(cfg, saida):
    g = dict(cfg['g'])
    base, cob = c.ajustar_g(cfg.get('luz_direita', False), g)
    base = base.convert('RGBA')
    mascara_ap = Image.new('L', (W, H), 0)
    caixas = []
    # aparelhos (de trás para a frente)
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
            ImageDraw.Draw(contato).ellipse([x + nb.width * 0.1, y + nb.height - 26, x + nb.width * 0.92, y + nb.height + 34], fill=130)
            contato = contato.filter(ImageFilter.GaussianBlur(26))
            escuro = Image.new('RGBA', base.size, (0, 10, 14, 255))
            base = Image.composite(escuro, base, sombra)
            base = Image.composite(escuro, base, contato)
            base.alpha_composite(nb, (x, y))
            caixas.append(('notebook', (x, y, x + nb.width, y + nb.height)))
            mascara_ap.paste(nb.split()[-1], (x, y), nb.split()[-1])
        else:
            cel = c.celular_com_tela(ap['tela'])
            base, caixa = c.colar_celular(base, cel, ap['centro'], ap['altura'], ap['incl'])
            caixas.append(('celular', caixa))
            mascara_ap = Image.composite(Image.new('L', (W, H), 255), mascara_ap, celular_mascara(cel, ap['centro'], ap['altura'], ap['incl']))
    # ícones
    for ic in cfg['icones']:
        c.icone(base, ic['nome'], ic['centro'], ic['d'], ic['rot'])
    d = ImageDraw.Draw(base)
    h1, h2, ass = c.fonte(c.ULTRABOLD, 72), c.fonte(c.REGULAR, 31), c.fonte(c.REGULAR, 24)
    t = cfg['texto']
    x, al = t['x'], t.get('alinhar', 'esq')
    entre = t.get('entrelinha', 72)
    y = c.escrever(d, t['h1'], h1, x, t['y'], entre, 0, al)
    y = c.escrever(d, t['h2'], h2, x, y + t.get('h1_h2', 44) + 22, 37, 0.05, al)
    yb = y + 80 + 17
    c.escrever(d, [[(t['sig'], MENTA)]], ass, x, yb, 0, 0.05, al)
    c.fixos(base)
    # conferência: texto contra aparelho
    tm = Image.new('L', (W, H), 0)
    td = ImageDraw.Draw(tm)
    yy = t['y']
    for blocos, fonte_, ent, trk in ((t['h1'], h1, entre, 0), (t['h2'], h2, 37, 0.05), ([[(t['sig'], MENTA)]], ass, 0, 0.05)):
        if blocos is t['h2']:
            yy = t['y'] + (len(t['h1']) - 1) * entre + t.get('h1_h2', 44) + 22
        if blocos is not t['h1'] and blocos is not t['h2']:
            yy = yb
        for i, partes in enumerate(blocos):
            larg = sum(c.largura(p, fonte_, trk) for p, _ in partes) + fonte_.size * trk * max(0, len(partes) - 1) * 0
            x0 = x - larg if al == 'dir' else x
            top = yy + i * ent - fonte_.size * 0.8
            td.rectangle([x0, top, x0 + larg, yy + i * ent + fonte_.size * 0.25], fill=255)
    colide = np.asarray(Image.composite(Image.new('L', (W, H), 255), Image.new('L', (W, H), 0), Image.fromarray(np.minimum(np.asarray(tm), np.asarray(mascara_ap))))).sum() / 255
    out = base.convert('RGB')
    out.save(saida)
    return cob, caixas, int(colide), yb


def tela(nome):
    return os.path.join(CAPT, 'celular', nome + '.png')


L, R = 120, 958
SLIDES = {
    1: dict(  # gancho: texto à esquerda, celular embaixo à direita (inclinado para fora)
        g=dict(cx=300, cy=1000, r=700, rot=40, delta=-8), luz_direita=False,
        aparelhos=[dict(tipo='celular', tela=tela('credito'), centro=(810, 975), altura=730, incl=5)],
        icones=[dict(nome='calendario', centro=(1040, 330), d=230, rot=15),
                dict(nome='cartao', centro=(50, 1160), d=250, rot=-20)],
        texto=dict(x=L, y=307, h1=[[('Saldo alto', MENTA)], [('engana.', MENTA)], [('Ainda vem', BRANCO)], [('conta por aí.', BRANCO)]], entrelinha=79,
                   h2=[[('Parece que sobra, mas o que', BRANCO)], [('já tem data para vencer', BRANCO)], [('ainda sai do seu mês.', MENTA)]],
                   sig='Arrasta pro lado!')),
    2: dict(  # pergunta: texto à direita, celular embaixo à esquerda
        g=dict(cx=1000, cy=1050, r=700, rot=200, espelho=True, delta=12), luz_direita=True,
        aparelhos=[dict(tipo='celular', tela=tela('contas'), centro=(270, 975), altura=730, incl=-5)],
        icones=[dict(nome='tempo', centro=(40, 360), d=210, rot=-10),
                dict(nome='calendario', centro=(1040, 1150), d=250, rot=15)],
        texto=dict(x=R, y=307, alinhar='dir', h1=[[('Quantos dias', MENTA)], [('ainda faltam', MENTA)], [('até o salário?', MENTA)]], entrelinha=79,
                   h2=[[('Dividido pelos dias que', BRANCO)], [('restam, cada gasto', BRANCO)], [('pesa diferente.', MENTA)]],
                   sig='Arrasta pro lado!')),
    3: dict(  # solução: texto à esquerda, celular grande ao centro-direita
        g=dict(cx=800, cy=900, r=700, rot=170, delta=-6), luz_direita=False,
        aparelhos=[dict(tipo='celular', tela=tela('inicio'), centro=(810, 975), altura=730, incl=4)],
        icones=[dict(nome='carteira', centro=(40, 1000), d=250, rot=-15),
                dict(nome='seguranca', centro=(1040, 350), d=150, rot=10)],
        texto=dict(x=L, y=307, h1=[[('Um valor seguro', MENTA)], [('por dia, na palma', MENTA)], [('da sua mão.', BRANCO)]], entrelinha=72,
                   h2=[[('O Grana. tira o que você', BRANCO)], [('guardou e divide o resto', BRANCO)], [('pelos dias que faltam.', MENTA)]],
                   sig='Arrasta pro lado!')),
    4: dict(  # uso no dia a dia: notebook embaixo + celular na frente (arquétipo B)
        g=dict(cx=22, cy=700, r=800, rot=0, delta=-12), luz_direita=True,
        aparelhos=[dict(tipo='notebook', tela=os.path.join(CAPT, 'web', 'inicio.png'), centro=(480, 1062), largura=850),
                   dict(tipo='celular', tela=tela('lancamentos'), centro=(840, 1050), altura=480, incl=3)],
        icones=[dict(nome='cafe', centro=(1040, 420), d=210, rot=12),
                dict(nome='computador', centro=(60, 840), d=250, rot=-15)],
        texto=dict(x=L, y=307, h1=[[('Aquele café', MENTA)], [('ou delivery,', MENTA)], [('sem peso no bolso.', BRANCO)]], entrelinha=79,
                   h2=[[('Bateu a dúvida antes de gastar?', BRANCO)], [('Uma olhada de três segundos', BRANCO)], [('mostra se cabe no dia.', MENTA)]],
                   sig='Arrasta pro lado!')),
    5: dict(  # fechamento: texto à direita, celular embaixo à esquerda
        g=dict(cx=800, cy=950, r=780, rot=-30, delta=14), luz_direita=True,
        aparelhos=[dict(tipo='celular', tela=tela('graficos'), centro=(270, 975), altura=730, incl=-5)],
        icones=[dict(nome='graficos', centro=(40, 360), d=170, rot=-15),
                dict(nome='dinheiro', centro=(1040, 1130), d=260, rot=15)],
        texto=dict(x=R, y=307, alinhar='dir', h1=[[('Termine o mês', MENTA)], [('com', BRANCO)], [('tranquilidade.', BRANCO)]], entrelinha=79,
                   h2=[[('Controle financeiro simples', BRANCO)], [('de verdade, por menos de', BRANCO)], [('R$ 0,37 por dia.', MENTA)]],
                   sig='Comece agora no link da bio.')),
}

if __name__ == '__main__':
    destino = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(destino, exist_ok=True)
    c.renderizar_telas = lambda: None
    for n, cfg in SLIDES.items():
        cob, caixas, colide, yb = compor(cfg, os.path.join(destino, f'carrossel-{n}.png'))
        print(f'carrossel-{n}: G {cob:.0%}; aparelhos {caixas}; texto sobre aparelho: {colide} px; assinatura y={yb}')

"""Capa 1080x1920 do Reels "Pra onde foi o dinheiro do mês" (21/10/2026), versão 2.

A primeira versão (arquétipo C, celular com a lista de Lançamentos) foi recusada pelo autor:
"Não gostei dessa capa, vamos tentar fazer algo no estilo das referências [...] adaptado para o
Grana. com nosso estilo visual". A referência era um anúncio de outro app com título centrado e
cartões de interface soltos, inclinados e sobrepostos, mais uma etiqueta de notificação.

No Grana. isso é o arquétipo E, jeito 3, do guia-de-design-estatico-feed-3x4.md (seção 10b):
cartões recortados de print real do app, girados de 3° a 8°, sobre o fundo escuro da série (painel,
G, logotipo em gradiente, RÁPIDO/FÁCIL/PRÁTICO), sem o fundo claro quadriculado da referência.
O título fica centrado, como na referência.

Uso:  python -I gerar-capa-reels-fim-do-mes.py <pasta-dos-quadros> <saida.png>
A pasta tem os quadros 1080x2388 das gravações do celular (conta de teste), em E:/Grana-temporarios:
  credito.png      credito.mp4 em 1,0 s
  inicio.png       lancar-por-voz.mp4 em 0,8 s
  lancamentos.png  lancamentos.mp4 em 0,5 s
"""
import importlib.util
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, *(['..'] * 6)))
spec = importlib.util.spec_from_file_location('capas', os.path.join(
    RAIZ, 'docs', 'marketing', '2026-10', 'semana-41-2026-10-05-a-2026-10-11', 'apoio', 'ferramentas', 'gerar-capas-reels.py'))
C = importlib.util.module_from_spec(spec)
spec.loader.exec_module(C)
OY = C.OY

# Caixas dos cartões nos quadros 1080x2388, medidas pela borda de cada cartão contra o fundo da tela.
CARTAO_CREDITO = ('credito.png', (34, 474, 544, 812))       # Cartão Principal, fatura e barra do limite
LIVRE = ('inicio.png', (34, 737, 1046, 1123))               # Livre para gastar e o que sai dele
RESUMO = ('lancamentos.png', (34, 473, 1046, 590))          # Entradas, Saídas e Saldo do mês
LINHA = ('lancamentos.png', (43, 1136, 1037, 1246))         # Farmácia, vira a etiqueta
RAIO_APP = 26                                               # canto dos cartões no app, em px do quadro


def cartao(quadros, fonte_caixa, largura, raio=RAIO_APP):
    arq, caixa = fonte_caixa
    im = Image.open(os.path.join(quadros, arq)).convert('RGBA').crop(caixa)
    esc = largura / im.width
    im = im.resize((largura, round(im.height * esc)), Image.LANCZOS)
    m = C.ret_arredondado(im.width, im.height, max(6, round(raio * esc)))
    im.putalpha(m)
    return im


def etiqueta(quadros, largura):
    """A linha real do lançamento numa pílula com borda menta, como a notificação da referência.
    O nome e o valor vêm da mesma linha; o vão entre eles encolhe, como na linha do app numa tela
    mais estreita, para o texto continuar legível no tamanho da capa."""
    arq, (x0, y0, x1, y1) = LINHA
    im = Image.open(os.path.join(quadros, arq)).convert('RGBA')
    nome = im.crop((x0, y0, 420, y1))
    valor = im.crop((860, y0, x1, y1))
    vao, borda = 40, 28
    esc = (largura - 2 * borda) / (nome.width + vao + valor.width)
    nome = nome.resize((round(nome.width * esc), round(nome.height * esc)), Image.LANCZOS)
    valor = valor.resize((round(valor.width * esc), round(valor.height * esc)), Image.LANCZOS)
    h = nome.height + 24
    fundo_cor = tuple(int(v) for v in np.asarray(im)[y0 + 4, 640][:3])
    pilula = Image.new('RGBA', (largura, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(pilula)
    d.rounded_rectangle([0, 0, largura - 1, h - 1], radius=h // 2, fill=fundo_cor + (255,), outline=C.MENTA + (255,), width=2)
    pilula.alpha_composite(nome, (borda, 12))
    pilula.alpha_composite(valor, (largura - borda - valor.width, 12))
    return pilula


def colar(base, im, centro, rot):
    im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    x = int(centro[0] - im.width / 2)
    y = int(centro[1] - im.height / 2)
    a = np.asarray(im.split()[-1], float)
    sombra = Image.new('L', base.size, 0)
    sombra.paste(Image.fromarray((a * 0.6).astype(np.uint8)), (x + 10, y + 26))
    sombra = sombra.filter(ImageFilter.GaussianBlur(26))
    escuro = Image.new('RGBA', base.size, (0, 10, 14, 255))
    base = Image.composite(escuro, base, sombra)
    base.alpha_composite(im, (x, y))
    return base, (x, y, x + im.width, y + im.height)


def capa(quadros, saida):
    g = dict(cx=540, cy=OY + 860, r=640, rot=200, espelho=True, delta=-8)
    base, cob = C.ajustar_g(False, g)
    base = base.convert('RGBA')
    C.icone(base, 'dinheiro', (1042, OY + 470), 150, 12)
    C.icone(base, 'cartao', (30, OY + 940), 220, -15)

    caixas = {}
    base, caixas['credito'] = colar(base, cartao(quadros, CARTAO_CREDITO, 450), (310, OY + 585), 6)
    base, caixas['livre'] = colar(base, cartao(quadros, LIVRE, 780), (612, OY + 950), -3)
    base, caixas['resumo'] = colar(base, cartao(quadros, RESUMO, 700), (470, OY + 1215), 4)
    base, caixas['etiqueta'] = colar(base, etiqueta(quadros, 500), (735, OY + 470), -3)

    d = ImageDraw.Draw(base)
    h1 = C.fonte(C.ULTRABOLD, 72)
    linhas = [[('Pra onde foi o', C.BRANCO)], [('dinheiro do mês?', C.MENTA)]]
    for i, partes in enumerate(linhas):
        w = sum(C.largura(t, h1, 0) for t, _ in partes)
        C.escrever(d, [partes], h1, 540 - w / 2, OY + 258 + i * 79, 0)
    C.fixos(base)
    base.convert('RGB').save(saida)
    return cob, caixas


if __name__ == '__main__':
    cob, caixas = capa(sys.argv[1], sys.argv[2])
    print(f'G cobre {cob:.0%} do painel; caixas {caixas}')

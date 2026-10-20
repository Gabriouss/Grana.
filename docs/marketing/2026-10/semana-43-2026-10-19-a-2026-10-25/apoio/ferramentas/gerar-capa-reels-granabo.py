"""Capa 1080x1920 do Reels "Conheça o Granabô" (19/10/2026).

Usa o gerador das capas aprovadas da semana 41 (gerar-capas-reels.py), no sistema do
guia-de-design-estatico-feed-3x4.md (regra 26): arquétipo A, texto à esquerda e
celular à direita, com a resposta real do Granabô gravada no celular do autor (conta
de teste). O mascote entra ao lado do texto, renderizado do modelo 3D (reels-granabo/sprites).

Uso:  python -I gerar-capa-reels-granabo.py <tela.png> <saida.png>
A tela é um quadro de granachat-consulta.mp4 (1080x2388), em E:/Grana-temporarios.
"""
import importlib.util
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, *(['..'] * 6)))
spec = importlib.util.spec_from_file_location('capas', os.path.join(
    RAIZ, 'docs', 'marketing', '2026-10', 'semana-41-2026-10-05-a-2026-10-11', 'apoio', 'ferramentas', 'gerar-capas-reels.py'))
C = importlib.util.module_from_spec(spec)
spec.loader.exec_module(C)
MASCOTE = os.path.join(RAIZ, 'docs', 'marketing', 'reels-granabo', 'sprites', 'feliz.png')
OY = C.OY


def preparar_tela(tela):
    """Tira a barra de status (cronômetro do gravador) e completa embaixo com a cor do rodapé,
    para a gravação (0,452) caber na proporção da tela do mockup (0,433) sem cortar as laterais."""
    im = Image.open(tela).convert('RGB')
    barra = round(im.height * 0.045)
    alvo_h = round(im.width / ((C.CEL_TELA[1][0] - C.CEL_TELA[0][0]) / (C.CEL_TELA[3][1] - C.CEL_TELA[0][1])))
    nova = Image.new('RGB', (im.width, alvo_h), im.getpixel((im.width // 2, im.height - 4)))
    nova.paste(im.crop((0, barra, im.width, im.height)), (0, 0))
    saida = os.path.splitext(tela)[0] + '-mockup.png'
    nova.save(saida)
    return saida


def capa(tela, saida):
    g = dict(cx=540, cy=OY + 700, r=600, rot=200, espelho=True, delta=-8)
    base, cob = C.ajustar_g(False, g)
    base = base.convert('RGBA')
    C.icone(base, 'granabo', (1032, OY + 300), 150, 10)
    C.icone(base, 'mercado', (30, OY + 1090), 240, -15)
    cel = C.celular_com_tela(preparar_tela(tela))
    base, caixa = C.colar_celular(base, cel, (812, OY + 905), 800, -3)

    # mascote ao lado do texto, com sombra de contato
    m = Image.open(MASCOTE).convert('RGBA')
    m = m.crop(m.getbbox()).resize((330, 338), Image.LANCZOS)
    mx, my = 175, OY + 800
    sombra = Image.new('L', base.size, 0)
    ImageDraw.Draw(sombra).ellipse([mx + 40, my + 318, mx + 290, my + 358], fill=130)
    sombra = sombra.filter(ImageFilter.GaussianBlur(16))
    base = Image.composite(Image.new('RGBA', base.size, (0, 10, 14, 255)), base, sombra)
    base.alpha_composite(m, (mx, my))

    d = ImageDraw.Draw(base)
    h1 = C.fonte(C.ULTRABOLD, 72)
    h2 = C.fonte(C.REGULAR, 31)
    ass = C.fonte(C.REGULAR, 24)
    y = C.escrever(d, [[('Conheça o', C.MENTA)], [('Granabô.', C.MENTA)]], h1, 120, OY + 400, 72, 0)
    y = C.escrever(d, [[('Pergunte quanto gastou', C.BRANCO)], [('ou só conte o gasto.', C.MENTA)]], h2, 120, y + 41 + 22 + 22, 37, 0.05)
    C.escrever(d, [[('O Grana. te ajuda!', C.MENTA)]], ass, 120, y + 80 + 17, 0, 0.05)
    C.fixos(base)
    base.convert('RGB').save(saida)
    return cob, caixa


if __name__ == '__main__':
    cob, caixa = capa(sys.argv[1], sys.argv[2])
    print(f'G cobre {cob:.0%} do painel; celular em {caixa}')

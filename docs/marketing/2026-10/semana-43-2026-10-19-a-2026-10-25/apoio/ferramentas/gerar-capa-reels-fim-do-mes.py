"""Capa 1080x1920 do Reels "Pra onde foi o dinheiro do mês" (21/10/2026).

Usa o gerador das capas aprovadas da semana 41 (gerar-capas-reels.py), no sistema do
guia-de-design-estatico-feed-3x4.md (regra 26). Arquétipo C (celular à esquerda, texto à
direita), para não repetir a capa anterior, do Granabô, que é arquétipo A. A tela é a lista
real de Lançamentos gravada no celular do autor (conta de teste).

Uso:  python -I gerar-capa-reels-fim-do-mes.py <tela.png> <saida.png>
A tela é um quadro de lancamentos.mp4 (1080x2388), em E:/Grana-temporarios.
"""
import importlib.util
import os
import sys

from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, *(['..'] * 6)))
spec = importlib.util.spec_from_file_location('capas', os.path.join(
    RAIZ, 'docs', 'marketing', '2026-10', 'semana-41-2026-10-05-a-2026-10-11', 'apoio', 'ferramentas', 'gerar-capas-reels.py'))
C = importlib.util.module_from_spec(spec)
spec.loader.exec_module(C)
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
    g = dict(cx=800, cy=OY + 940, r=790, rot=3, delta=13)
    base, cob = C.ajustar_g(True, g)
    base = base.convert('RGBA')
    C.icone(base, 'dinheiro', (40, OY + 230), 150, -12)
    C.icone(base, 'cartao', (1040, OY + 1160), 260, 14)
    cel = C.celular_com_tela(preparar_tela(tela))
    base, caixa = C.colar_celular(base, cel, (362, OY + 742), 930, 5)
    d = ImageDraw.Draw(base)
    h1 = C.fonte(C.ULTRABOLD, 72)
    h2 = C.fonte(C.REGULAR, 31)
    y = C.escrever(d, [[('Cadê o', C.BRANCO)], [('dinheiro', C.BRANCO)], [('do mês?', C.MENTA)]], h1, 958, OY + 587, 72, 0, 'dir')
    C.escrever(d, [[('Pix, almoço, parcela.', C.BRANCO)], [('No Grana., anotar', C.MENTA)], [('leva segundos.', C.MENTA)]], h2, 958, y + 19 + 22 + 22, 37, 0.05, 'dir')
    C.fixos(base)
    base.convert('RGB').save(saida)
    return cob, caixa


if __name__ == '__main__':
    cob, caixa = capa(sys.argv[1], sys.argv[2])
    print(f'G cobre {cob:.0%} do painel; celular em {caixa}')

"""Extrai os quadros do mascote (renderizados no Blender) dos WebP versionados.

Os quadros finais do Reels estão em quadros/A_0117.webp e quadros/B_0558.webp,
WebP animado sem perda e com alfa; o número no nome é o primeiro quadro do
trecho. Esta rotina devolve cada um como PNG em blender/ (A_0117.png ...),
que é o que montar.py lê. Não sobrescreve o que já existe.

Uso: python extrair_quadros.py
"""
import glob, os, re
from PIL import Image, ImageSequence

AQUI = os.path.dirname(os.path.abspath(__file__))


def extrair(destino=None):
    destino = destino or os.path.join(AQUI, 'blender')
    os.makedirs(destino, exist_ok=True)
    novos = 0
    for arq in sorted(glob.glob(os.path.join(AQUI, 'quadros', '*_*.webp'))):
        nome = os.path.basename(arq)
        m = re.match(r'^([A-Z])_(\d+)\.webp$', nome)
        if not m:
            continue
        trecho, inicio = m.group(1), int(m.group(2))
        with Image.open(arq) as im:
            for i, quadro in enumerate(ImageSequence.Iterator(im)):
                saida = os.path.join(destino, f'{trecho}_{inicio + i:04d}.png')
                if not os.path.exists(saida):
                    quadro.convert('RGBA').save(saida)
                    novos += 1
    return novos


if __name__ == '__main__':
    print('quadros extraídos:', extrair())

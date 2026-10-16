"""Extrai os quadros do mascote (renderizados no Blender) dos WebP versionados.

Os quadros finais do Reels estão em quadros/A_0117-0252.webp e quadros/B_0558-0657.webp,
WebP animado sem perda e com alfa; os números no nome são o primeiro e o último quadro
do trecho. O WebP funde quadros idênticos seguidos (a cauda parada), então os
que faltam são repetições do último. Esta rotina devolve cada um como PNG em blender/ (A_0117.png ...),
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
        m = re.match(r'^([A-Z])_(\d+)-(\d+)\.webp$', nome)
        if not m:
            continue
        trecho, inicio, fim = m.group(1), int(m.group(2)), int(m.group(3))
        with Image.open(arq) as im:
            quadros = [q.convert('RGBA') for q in ImageSequence.Iterator(im)]
        quadros += [quadros[-1]] * (fim - inicio + 1 - len(quadros))
        for i, quadro in enumerate(quadros):
            saida = os.path.join(destino, f'{trecho}_{inicio + i:04d}.png')
            if not os.path.exists(saida):
                quadro.save(saida)
                novos += 1
    return novos


if __name__ == '__main__':
    print('quadros extraídos:', extrair())

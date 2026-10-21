"""Mede uma peça de design (PNG/JPG) e devolve números que viram regra de estilo.

Uso:
  python -I medir_peca.py <imagem> [<imagem> ...] --saida <pasta>

Para cada imagem grava, na pasta de saída:
  <nome>.medidas.json   formato, paleta, luz do fundo, moldura, margens e blocos de conteúdo
  <nome>.prancha.png    a peça com grade de 10%, réguas em px e as caixas dos blocos achados
E imprime um resumo em texto. Nada aqui substitui olhar a prancha: os números orientam a leitura.
"""
import argparse, json, os, sys
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def hexa(c):
    return '#%02X%02X%02X' % tuple(int(v) for v in c[:3])


def paleta(img, n=12):
    q = img.convert('RGB').quantize(colors=n, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[: n * 3]
    contagem = sorted(q.getcolors(), reverse=True)
    total = sum(c for c, _ in contagem)
    return [{'cor': hexa(pal[i * 3:i * 3 + 3]), 'parte': round(c / total * 100, 1)} for c, i in contagem if c / total >= 0.003]


def luz(arr):
    """Luminância média em faixas de 10% nas quatro bordas do miolo (sem a moldura)."""
    h, w = arr.shape[:2]
    l = arr[..., :3] @ np.array([0.2126, 0.7152, 0.0722])
    m = int(min(h, w) * 0.05)
    cima, baixo = l[m:m + h // 10, m:w - m].mean(), l[h - m - h // 10:h - m, m:w - m].mean()
    esq, dir_ = l[m:h - m, m:m + w // 10].mean(), l[m:h - m, w - m - w // 10:w - m].mean()
    return {'cima': round(cima, 1), 'baixo': round(baixo, 1), 'esquerda': round(esq, 1), 'direita': round(dir_, 1),
            'vertical': 'luz de cima' if cima > baixo + 3 else 'luz de baixo' if baixo > cima + 3 else 'plana',
            'horizontal': 'luz da esquerda' if esq > dir_ + 3 else 'luz da direita' if dir_ > esq + 3 else 'plana'}


def moldura(arr, limiar=4):
    """Espessura da faixa uniforme em cada borda (px), andando para dentro até a cor mudar."""
    h, w = arr.shape[:2]
    a = arr[..., :3].astype(int)
    def anda(linhas):
        ref = linhas[0].mean(axis=0)
        for i, ln in enumerate(linhas):
            if np.abs(ln.mean(axis=0) - ref).max() > limiar:
                return i
        return 0
    return {'cima': anda([a[y, w // 4:3 * w // 4] for y in range(h // 4)]),
            'baixo': anda([a[h - 1 - y, w // 4:3 * w // 4] for y in range(h // 4)]),
            'esquerda': anda([a[h // 4:3 * h // 4, x] for x in range(w // 4)]),
            'direita': anda([a[h // 4:3 * h // 4, w - 1 - x] for x in range(w // 4)])}


def blocos(img, arr, limiar=28):
    """Acha o que se destaca do fundo: compara a peça com ela mesma muito desfocada."""
    h, w = arr.shape[:2]
    fundo = np.asarray(img.convert('RGB').filter(ImageFilter.GaussianBlur(max(h, w) / 25)), dtype=int)
    dif = np.abs(arr[..., :3].astype(int) - fundo).max(axis=2) > limiar
    m = Image.fromarray((dif * 255).astype('uint8')).filter(ImageFilter.MaxFilter(15))
    mask = np.asarray(m) > 0
    linhas = mask.mean(axis=1) > 0.004
    faixas, ini = [], None
    for y, v in enumerate(list(linhas) + [False]):
        if v and ini is None: ini = y
        if not v and ini is not None:
            if y - ini >= 8:
                cols = np.where(mask[ini:y].any(axis=0))[0]
                faixas.append({'y': [ini, y], 'x': [int(cols.min()), int(cols.max())], 'altura': y - ini})
            ini = None
    ys, xs = np.where(mask)
    caixa = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())] if len(xs) else None
    margens = {'esquerda': caixa[0], 'cima': caixa[1], 'direita': w - 1 - caixa[2], 'baixo': h - 1 - caixa[3]} if caixa else None
    return faixas, caixa, margens, round(float(dif.mean()) * 100, 1)


def prancha(img, faixas, caminho):
    p = img.convert('RGB').copy()
    d = ImageDraw.Draw(p)
    w, h = p.size
    for i in range(1, 10):
        d.line([(w * i // 10, 0), (w * i // 10, h)], fill=(255, 0, 255), width=1)
        d.line([(0, h * i // 10), (w, h * i // 10)], fill=(255, 0, 255), width=1)
        d.text((w * i // 10 + 3, 3), str(w * i // 10), fill=(255, 0, 255))
        d.text((3, h * i // 10 + 3), str(h * i // 10), fill=(255, 0, 255))
    for f in faixas:
        d.rectangle([f['x'][0], f['y'][0], f['x'][1], f['y'][1]], outline=(255, 200, 0), width=2)
        d.text((f['x'][1] + 4, f['y'][0]), f"{f['x'][0]},{f['y'][0]} {f['x'][1] - f['x'][0]}x{f['altura']}", fill=(255, 200, 0))
    p.save(caminho)


def medir(caminho, saida):
    img = Image.open(caminho)
    arr = np.asarray(img.convert('RGBA'))
    w, h = img.size
    from math import gcd
    g = gcd(w, h)
    faixas, caixa, margens, densidade = blocos(img, arr)
    r = {'arquivo': os.path.basename(caminho), 'tamanho': [w, h], 'proporcao': f'{w // g}:{h // g}',
         'paleta': paleta(img), 'luz': luz(arr.astype(float)), 'moldura_px': moldura(arr),
         'conteudo': {'caixa': caixa, 'margens_px': margens, 'pixels_que_destacam_pct': densidade, 'faixas': faixas}}
    base = os.path.join(saida, os.path.splitext(os.path.basename(caminho))[0])
    json.dump(r, open(base + '.medidas.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    prancha(img, faixas, base + '.prancha.png')
    return r


def resumo(r):
    print(f"\n== {r['arquivo']}  {r['tamanho'][0]}x{r['tamanho'][1]} ({r['proporcao']})")
    print('paleta:', ', '.join(f"{p['cor']} {p['parte']}%" for p in r['paleta'][:8]))
    l = r['luz']; print(f"luz: {l['vertical']}, {l['horizontal']} (cima {l['cima']} baixo {l['baixo']} esq {l['esquerda']} dir {l['direita']})")
    print('moldura px:', r['moldura_px'])
    c = r['conteudo']; print('margens do conteúdo px:', c['margens_px'], '| destaque', c['pixels_que_destacam_pct'], '%')
    for f in c['faixas']:
        print(f"  faixa y {f['y'][0]}-{f['y'][1]} (alt {f['altura']}) x {f['x'][0]}-{f['x'][1]}")


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('imagens', nargs='+')
    ap.add_argument('--saida', required=True)
    a = ap.parse_args()
    os.makedirs(a.saida, exist_ok=True)
    for c in a.imagens:
        resumo(medir(c, a.saida))

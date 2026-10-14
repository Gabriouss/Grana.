"""Confere uma peça nova contra as referências do estilo.

Uso:
  python -I comparar.py --refs <ref1.png> [<ref2.png> ...] --nova <peca.png> --saida <pasta>

Mede tudo com medir_peca.py e diz, item a item, se a peça nova cai dentro da faixa que as
referências formam (mínimo e máximo de cada número). Com uma referência só, a faixa ganha
uma folga de 3% do lado da imagem. "FORA" é sinal para olhar, não veredito: o guia escrito manda.
"""
import argparse, os, sys
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from medir_peca import medir


def rgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)])


def fora_da_paleta(img_path, cores, dist=40):
    a = np.asarray(Image.open(img_path).convert('RGB').resize((270, 360)), dtype=int).reshape(-1, 3)
    p = np.array([rgb(c) for c in cores])
    d = np.sqrt(((a[:, None, :] - p[None, :, :]) ** 2).sum(axis=2)).min(axis=1)
    return round(float((d > dist).mean()) * 100, 1)


def faixa(valores, folga):
    return min(valores) - folga, max(valores) + folga


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--refs', nargs='+', required=True)
    ap.add_argument('--nova', required=True)
    ap.add_argument('--saida', required=True)
    a = ap.parse_args()
    os.makedirs(a.saida, exist_ok=True)
    refs = [medir(r, a.saida) for r in a.refs]
    nova = medir(a.nova, a.saida)
    w = nova['tamanho'][0]
    folga = 0 if len(refs) > 1 else round(w * 0.03)
    linhas = []

    def item(nome, valor, vals, f=folga):
        lo, hi = faixa(vals, f)
        ok = lo <= valor <= hi
        linhas.append(f"{'ok  ' if ok else 'FORA'} {nome}: {valor} (referências {lo:g} a {hi:g})")

    props = {r['proporcao'] for r in refs}
    linhas.append(f"{'ok  ' if nova['proporcao'] in props else 'FORA'} proporção: {nova['proporcao']} (referências {', '.join(sorted(props))})")
    for lado in ('cima', 'baixo', 'esquerda', 'direita'):
        item(f'moldura {lado} px', nova['moldura_px'][lado], [r['moldura_px'][lado] for r in refs], f=max(2, folga // 10))
    if nova['conteudo']['margens_px'] and all(r['conteudo']['margens_px'] for r in refs):
        for lado in ('cima', 'baixo', 'esquerda', 'direita'):
            item(f'margem do conteúdo {lado} px', nova['conteudo']['margens_px'][lado], [r['conteudo']['margens_px'][lado] for r in refs])
    item('pixels que destacam do fundo %', nova['conteudo']['pixels_que_destacam_pct'], [r['conteudo']['pixels_que_destacam_pct'] for r in refs], f=3)
    item('blocos de conteúdo', len(nova['conteudo']['faixas']), [len(r['conteudo']['faixas']) for r in refs], f=1)
    luzes = {r['luz']['vertical'] for r in refs}
    linhas.append(f"{'ok  ' if nova['luz']['vertical'] in luzes else 'FORA'} luz: {nova['luz']['vertical']} (referências: {', '.join(sorted(luzes))})")
    cores = sorted({p['cor'] for r in refs for p in r['paleta']})
    pct = fora_da_paleta(a.nova, cores)
    linhas.append(f"{'ok  ' if pct <= 8 else 'FORA'} pixels fora da paleta das referências: {pct}% (aceitável até 8%; print de app e foto puxam para cima)")
    txt = '\n'.join(linhas)
    print(txt)
    open(os.path.join(a.saida, 'comparacao.txt'), 'w', encoding='utf-8').write(txt + '\n')
    print(f"\nPranchas e medidas em {a.saida}. Olhe as pranchas lado a lado antes de concluir.")


if __name__ == '__main__':
    main()

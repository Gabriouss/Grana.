"""Carrossel "Olhar só o saldo engana o seu mês" v9 (Semana 42, 18/10/2026).

Pedido do autor sobre a v8: "celular na página 4 maior que o notebook tá estranho" (proporções realistas) e "os textos ainda estão muito lá
pra cima". Reaproveita o compositor e as configurações da v8 (gerar-pecas-estaticas-v8.py) e só muda:
  1. Página 4: proporção realista. Notebook grande, celular à frente com cerca de 58% da altura da tampa.
     Os dois inteiros, com margem segura.
  2. Nas 5 telas, o bloco de texto (título, apoio e "Arrasta pro lado!") desce para o centro óptico.
A copy não muda. Local (Pillow/numpy), sem ElevenLabs, dados fictícios.

Saída: para-aprovacao/pecas/lumen-v8/Olhar só o saldo engana o seu mês-1..5.png (mesmo caminho da v8, que foi
para historico/).
"""
import copy
import importlib.util
import json
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('v8', os.path.join(AQUI, 'gerar-pecas-estaticas-v8.py'))
v8 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v8)

SEMANA42 = v8.SEMANA42
PASTA = os.path.join(SEMANA42, 'para-aprovacao', 'pecas', 'lumen-v8')
TITULO = 'Olhar só o saldo engana o seu mês'

# y inicial do título (v8: 215, 195, 215, 200, 195). Nas telas 2 e 5 (texto à direita, celular à esquerda) o limite é a colisão com o celular.
Y_TEXTO = {1: 395, 2: 225, 3: 335, 4: 300, 5: 285}

CFG = copy.deepcopy(v8.CFG_CARROSSEL)
for idx, y in Y_TEXTO.items():
    CFG[idx]['texto']['y'] = y

# Página 4: escala real entre os aparelhos. Notebook de 13-14" com a tampa ocupando ~75% da altura da imagem;
# o celular de 6,5" fica à frente, na base do notebook, com ~58% da altura da tampa (a ordem do autor pede 50% a 60%).
nb, cel = CFG[4]['aparelhos']
nb['largura'] = 900
nb['centro'] = (520, 1000)
cel['altura'] = 262
cel['centro'] = (835, 1135)


def main():
    relatorio = []
    for idx in sorted(CFG):
        m = v8.compor_peca(CFG[idx], os.path.join(PASTA, f'{TITULO}-{idx}.png'), W=1080, H=1440, OY=0)
        relatorio.append(m)
        print(json.dumps(m, ensure_ascii=False))
    return relatorio


if __name__ == '__main__':
    main()

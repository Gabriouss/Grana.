"""Destaques do perfil (Conheça, Recursos, Planos, Segurança), Stories 1080x1920, e as quatro capas.

Pedido do autor em 21/10/2026: copiar a estrutura dos destaques de um perfil de outro app de
finanças, adaptada às funções do Grana. e ao sistema visual dele. Decisões do autor na mesma
conversa:
  - nada de banco nas peças ("proibido"); a Segurança fala só do que o app faz;
  - Planos só com os planos que existem (mensal e anual), e os preços podem aparecer;
  - a linha de luz da referência vira o gradiente oficial da marca;
  - mesclar celular em mockup com cartões de função recortados de print real (arquétipo E);
  - sem o G no fundo;
  - cada story alterna entre tema escuro e tema claro, começando pelo escuro.

Do guia de design estático (regra 26) ficam: moldura e painel com luz de cima, logotipo em
gradiente, rótulos nos cantos, Neue Machina (H1 Ultrabold 72, H2 Regular 31), margem do texto
em x 120, aparelho inteiro com margem e sombra, print real por homografia.

As telas vêm dos quadros das gravações do celular do autor de 19/10/2026 (conta de teste, dado
fictício), extraídos a cada 1,5 s para a pasta passada como argumento:
  ffmpeg -i <video>.mp4 -vf fps=1/1.5 <pasta>/<video>-%02d.png
As gravações ficam em E:/Grana-temporarios/2026-10-19-agendamento-meta/capturas-app/celular.

Uso:  python -I gerar-destaques.py <pasta-dos-quadros> <pasta-de-saida>
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

W, H = 1080, 1920
ARSENAL = os.path.join(RAIZ, 'docs', 'marketing', 'arsenal')
GRANABO = os.path.join(RAIZ, 'assets', 'granabo', 'granabo-feliz.png')
SIMBOLO_GRADIENTE = os.path.join(RAIZ, 'design-system', 'marca', 'simbolo-gradiente.svg')
GRAD_DE, GRAD_ATE = np.array((176, 247, 201), float), np.array((34, 161, 193), float)   # #b0f7c9 → #22a1c1
PERIGO = (224, 138, 125)                                                                # #e08a7d

TEMAS = {
    'escuro': dict(
        moldura=((0, 50, 56), (0, 66, 70), (0, 34, 42), (0, 46, 54)),
        painel=((0, 78, 76), (0, 56, 60), (0, 30, 38), (0, 22, 30)),
        t1=(255, 255, 255), t2=C.MENTA, corpo=(255, 255, 255), suave=(166, 217, 206), rotulo=C.MENTA,
        cartao=(6, 40, 48), borda=(135, 249, 204, 70), sombra=(0, 8, 12), sombra_forca=0.6, brilho=1.0),
    'claro': dict(
        moldura=((206, 236, 226), (216, 241, 233), (190, 226, 215), (200, 231, 221)),
        painel=((250, 254, 252), (241, 251, 247), (233, 247, 242), (224, 242, 236)),
        t1=(8, 56, 75), t2=(31, 169, 141), corpo=(8, 56, 75), suave=(58, 98, 108), rotulo=(31, 140, 120),
        cartao=(255, 255, 255), borda=(8, 56, 75, 36), sombra=(40, 90, 90), sombra_forca=0.32, brilho=0.7),
}


# ---------------------------------------------------------------- fundo e marca
def fundo(tema, luz_da_direita=False):
    t = TEMAS[tema]
    m, p = t['moldura'], t['painel']
    if luz_da_direita:
        m = (m[1], m[0], m[3], m[2])
        p = (p[1], p[0], p[3], p[2])
    moldura, painel = C.degrade(*m), C.degrade(*p)
    mp = np.asarray(C.ret_arredondado(1034, H - 42, 29), float) / 255
    mascara = np.zeros((H, W, 1))
    mascara[21:H - 21, 23:1057, 0] = mp
    img = moldura * (1 - mascara) + painel * mascara
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert('RGBA')


def linha_gradiente(base, y, tema):
    """A linha de luz da referência, no gradiente oficial: some nas pontas e brilha em volta."""
    camada = np.zeros((H, W, 4))
    x = np.arange(W)
    cor = GRAD_DE[None, :] * (1 - x[:, None] / W) + GRAD_ATE[None, :] * (x[:, None] / W)
    ponta = np.clip(np.minimum(x - 23, 1057 - x) / 160, 0, 1)
    camada[y - 1:y + 2, :, :3] = cor[None]
    camada[y - 1:y + 2, :, 3] = 255 * ponta[None]
    nucleo = Image.fromarray(camada.astype(np.uint8), 'RGBA')
    f = TEMAS[tema]['brilho']
    for raio, forca in ((40, 0.55), (12, 0.9)):
        brilho = nucleo.filter(ImageFilter.GaussianBlur(raio))
        a = np.asarray(brilho, float)
        a[..., 3] = np.clip(a[..., 3] * forca * f * (6 if raio == 40 else 3), 0, 255)
        base.alpha_composite(Image.fromarray(a.astype(np.uint8), 'RGBA'))
    base.alpha_composite(nucleo)


def marca(base, tema, rotulo):
    """Logotipo em gradiente no topo e o nome do destaque à direita. Embaixo fica livre: no Story,
    a parte de baixo é da interface do Instagram."""
    t = TEMAS[tema]
    logo = Image.open(C.LOGO).convert('RGBA')
    logo = logo.crop(logo.getbbox())
    logo = logo.resize((150, round(150 * logo.height / logo.width)), Image.LANCZOS)
    base.alpha_composite(logo, (85, 196))
    d = ImageDraw.Draw(base)
    f = C.fonte(C.REGULAR, 17)
    C.escrever(d, [[(rotulo.upper(), t['rotulo'])]], f, 998, 196 + logo.height - 4, 0, 1.0, 'dir')


# ---------------------------------------------------------------- texto
def bloco(base, tema, y_topo, h1=(), h2=(), x=120, alinhar='esq', tam_h1=88, tam_h2=36):
    """H1 (lista de linhas de (texto, 't1'|'t2')) e H2 em seguida. Devolve a base da última linha.
    y_topo é o topo das maiúsculas da primeira linha do H1 (ou do H2, se não houver H1)."""
    t = TEMAS[tema]
    d = ImageDraw.Draw(base)
    y = y_topo
    for fonte_px, linhas, entre, track, cap in ((tam_h1, h1, round(tam_h1 * 1.08), 0.0, round(tam_h1 * 0.72)),
                                                (tam_h2, h2, 46, 0.02, 26)):
        if not linhas:
            continue
        arquivo = C.ULTRABOLD if linhas is h1 else C.REGULAR
        f = C.fonte(arquivo, fonte_px)
        # Título que passaria da margem (x 958, ou 90 a 990 centrado) encolhe junto com a entrelinha.
        limite = {'esq': 958 - x, 'dir': x - 122, 'centro': 860}[alinhar]
        maior = max(sum(C.largura(txt, f, track) for txt, _ in partes) for partes in linhas)
        if maior > limite:
            fonte_px = int(fonte_px * limite / maior)
            f = C.fonte(arquivo, fonte_px)
            entre = round(fonte_px * (1.08 if linhas is h1 else 46 / 36))
            cap = round(fonte_px * 0.72)
        if y != y_topo:
            y += 44
        base_linha = y + cap
        for i, partes in enumerate(linhas):
            partes = [(txt, t[c]) for txt, c in partes]
            larg = sum(C.largura(txt, f, track) for txt, _ in partes)
            x0 = {'esq': x, 'dir': x - larg, 'centro': x - larg / 2}[alinhar]
            C.escrever(d, [partes], f, x0, base_linha + i * entre, 0, track)
        y = base_linha + (len(linhas) - 1) * entre
    return y


# ---------------------------------------------------------------- telas e cartões
def quadro(nome):
    return Image.open(os.path.join(QUADROS, nome + '.png')).convert('RGB')


def tela_para_celular(nome, corte_topo):
    """Tira a barra de status (com o cronômetro do gravador) e completa o topo com a cor de fundo
    do app até a proporção da tela do celular vazio, sem cortar as laterais."""
    im = quadro(nome)
    im = im.crop((0, corte_topo, im.width, im.height))
    tw = C.CEL_TELA[1][0] - C.CEL_TELA[0][0]
    th = C.CEL_TELA[3][1] - C.CEL_TELA[0][1]
    alt = round(im.width * th / tw)
    cor = tuple(int(v) for v in np.asarray(im)[8, im.width // 2])
    tela = Image.new('RGB', (im.width, alt), cor)
    tela.paste(im, (0, alt - im.height))
    caminho = os.path.join(TMP, f'{nome}-tela.png')
    tela.save(caminho)
    return caminho


def celular(base, tema, nome, centro, altura, inclinacao, corte_topo=100):
    cel = C.celular_com_tela(tela_para_celular(nome, corte_topo))
    esc = altura / cel.height
    cel = cel.resize((round(cel.width * esc), round(cel.height * esc)), Image.LANCZOS)
    return colar(base, tema, cel, centro, inclinacao, sombra=38)


def cartao(nome, caixa, largura, raio=26):
    im = quadro(nome).convert('RGBA').crop(caixa)
    esc = largura / im.width
    im = im.resize((largura, round(im.height * esc)), Image.LANCZOS)
    im.putalpha(C.ret_arredondado(im.width, im.height, max(6, round(raio * esc))))
    return im


def colar(base, tema, im, centro, rot=0, sombra=26, desfoque=0):
    t = TEMAS[tema]
    if desfoque:
        pad = desfoque * 3
        tela = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
        tela.alpha_composite(im, (pad, pad))
        im = tela.filter(ImageFilter.GaussianBlur(desfoque))
    im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    x, y = int(centro[0] - im.width / 2), int(centro[1] - im.height / 2)
    if sombra:
        a = np.asarray(im.split()[-1], float) * t['sombra_forca']
        s = Image.new('L', base.size, 0)
        s.paste(Image.fromarray(a.astype(np.uint8)), (x + 10, y + sombra))
        s = s.filter(ImageFilter.GaussianBlur(sombra))
        base = Image.composite(Image.new('RGBA', base.size, t['sombra'] + (255,)), base, s)
    base.alpha_composite(im, (x, y))
    return base


LINHA_0, PASSO = 1060, 129      # centro da 1ª linha da lista de Lançamentos e o passo entre linhas


def linha_lancamento(k, largura):
    c = LINHA_0 + k * PASSO
    return cartao('navegacao-abas-03', (33, c - 60, 1053, c + 60), largura, 20)


# Caixas medidas nos quadros 1080x2388 (borda do cartão contra o fundo da tela).
BOTOES = (28, 470, 1052, 700)            # Lançar por voz, Fotografar nota, Colar comprovante, Importar extrato
LIVRE = (34, 737, 1046, 1123)            # Livre para gastar e o que sai dele
COFRINHOS = (34, 1222, 1046, 1595)       # três cofrinhos com meta e prazo
COMPROMISSO = (34, 1633, 1046, 2000)     # Comprometimento futuro (sem o botão +)
RESUMO = (34, 473, 1046, 590)            # Entradas, Saídas e Saldo do mês
CHAT = (38, 222, 1051, 1575)             # Granabô respondendo "Quanto gastei com mercado?"
CARTOES = (34, 474, 1046, 812)           # Cartão Principal e Cartão Horizonte


# ---------------------------------------------------------------- elementos de marca (não são tela do app)
def caixa_marca(tema, w, h, raio=30):
    t = TEMAS[tema]
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle([1, 1, w - 2, h - 2], raio, fill=t['cartao'] + (255,), outline=t['borda'], width=2)
    return im


def marcador(d, cx, cy, tema, ok=True):
    t = TEMAS[tema]
    cor = t['t2'] if ok else PERIGO
    d.ellipse([cx - 19, cy - 19, cx + 19, cy + 19], fill=cor + (46,), outline=cor + (255,), width=2)
    if ok:
        d.line([(cx - 9, cy + 1), (cx - 3, cy + 8), (cx + 10, cy - 7)], fill=cor + (255,), width=4, joint='curve')
    else:
        d.line([(cx - 7, cy - 7), (cx + 7, cy + 7)], fill=cor + (255,), width=4)
        d.line([(cx - 7, cy + 7), (cx + 7, cy - 7)], fill=cor + (255,), width=4)


def lista(tema, w, titulo, itens, ok=True, alto=74):
    """Cartão com rótulo em caixa alta e itens com marcador (certo ou proibido)."""
    t = TEMAS[tema]
    h = 96 + alto * len(itens) + 18
    im = caixa_marca(tema, w, h)
    d = ImageDraw.Draw(im)
    rot = C.fonte(C.REGULAR, 17)
    C.escrever(d, [[(titulo.upper(), t['t2'] if ok else PERIGO)]], rot, 44, 62, 0, 0.5)
    f = C.fonte(C.REGULAR, 31)
    for i, item in enumerate(itens):
        y = 96 + i * alto + alto // 2
        marcador(d, 64, y, tema, ok)
        C.escrever(d, [[(item, t['corpo'])]], f, 104, y + 11, 0, 0.01)
    return im


def pilula(tema, texto, tam=24, cheia=False):
    t = TEMAS[tema]
    f = C.fonte(C.REGULAR, tam)
    w = round(C.largura(texto, f, 0.02)) + 64 + (34 if not cheia else 0)
    h = tam + 34
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if cheia:
        d.rounded_rectangle([0, 0, w - 1, h - 1], h // 2, fill=t['t2'] + (255,))
        C.escrever(d, [[(texto, (4, 33, 40) if tema == 'escuro' else (255, 255, 255))]], f, 32, h / 2 + tam * 0.36, 0, 0.02)
    else:
        d.rounded_rectangle([1, 1, w - 2, h - 2], h // 2, fill=t['cartao'] + (255,), outline=t['t2'] + (150,), width=2)
        marcador(d, 34, h // 2, tema)
        C.escrever(d, [[(texto, t['corpo'])]], f, 64, h / 2 + tam * 0.36, 0, 0.02)
    return im


def fileira(base, tema, pilulas, y, gap=18, x_centro=540):
    """Pílulas centradas, quebrando em mais linhas quando não cabem entre x 90 e 990."""
    linhas, atual, larg = [], [], 0
    for p in pilulas:
        if atual and larg + gap + p.width > 900:
            linhas.append(atual)
            atual, larg = [], 0
        larg += (gap if atual else 0) + p.width
        atual.append(p)
    linhas.append(atual)
    for linha in linhas:
        total = sum(p.width for p in linha) + gap * (len(linha) - 1)
        x = x_centro - total / 2
        for p in linha:
            base.alpha_composite(p, (int(x), int(y)))
            x += p.width + gap
        y += linha[0].height + gap
    return y


def notificacao(nome, largura):
    im = Image.open(os.path.join(ARSENAL, 'notificacoes', nome + '.png')).convert('RGBA')
    im = im.crop(im.getbbox())
    return im.resize((largura, round(im.height * largura / im.width)), Image.LANCZOS)


def granabo(altura):
    im = Image.open(GRANABO).convert('RGBA')
    im = im.crop(im.getbbox())
    return im.resize((round(im.width * altura / im.height), altura), Image.LANCZOS)


def preco(base, tema, valor, sufixo, cx, y_base, tam=150):
    """'R$' pequeno, valor grande em Ultrabold e o período ao lado, centrados em cx."""
    t = TEMAS[tema]
    d = ImageDraw.Draw(base)
    fv, fr, fs = C.fonte(C.ULTRABOLD, tam), C.fonte(C.REGULAR, round(tam * 0.32)), C.fonte(C.REGULAR, 34)
    w = C.largura('R$', fr, 0) + 14 + C.largura(valor, fv, 0) + 16 + C.largura(sufixo, fs, 0)
    x = cx - w / 2
    C.escrever(d, [[('R$', t['t1'])]], fr, x, y_base, 0)
    x += C.largura('R$', fr, 0) + 14
    C.escrever(d, [[(valor, t['t2'])]], fv, x, y_base, 0)
    x += C.largura(valor, fv, 0) + 16
    C.escrever(d, [[(sufixo, t['suave'])]], fs, x, y_base, 0)


# ---------------------------------------------------------------- CONHEÇA
# Textos na voz do Grana. (design-system/TOM_DE_VOZ.md): conversa, leveza, sem culpa. Da
# referência ficou só a sequência dos stories; nenhuma frase foi aproveitada (autor, 21/10/2026).
def conheca_1(tema):
    b = fundo(tema)
    bloco(b, tema, 330, [[('O mês acabou', 't1')], [('e o dinheiro', 't1')], [('sumiu de novo?', 't2')]])
    linha_gradiente(b, 1040, tema)
    b = colar(b, tema, cartao('navegacao-abas-03', RESUMO, 960), (540, 1000), -3)
    b = colar(b, tema, linha_lancamento(2, 780), (600, 1210), 4)
    bloco(b, tema, 1440, h2=[[('Calma, acontece com muita gente.', 't1')], [('Arrasta pro lado!', 't2')]])
    return b


def conheca_2(tema):
    b = fundo(tema, True)
    linha_gradiente(b, 960, tema)
    for k, (cx, cy, rot, larg, blur) in enumerate(((430, 440, -6, 720, 5), (680, 600, 5, 700, 0), (400, 770, 3, 720, 0),
                                                   (690, 930, -4, 660, 6))):
        b = colar(b, tema, linha_lancamento((0, 6, 2, 3)[k], larg), (cx, cy), rot, desfoque=blur)
    bloco(b, tema, 1130, [[('O café, o Pix,', 't1')], [('a parcela...', 't1')], [('somou e sumiu.', 't2')]],
          [[('Gasto pequeno não avisa', 't1')], [('quando vira gasto grande.', 't1')]])
    return b


def conheca_3(tema):
    b = fundo(tema)
    bloco(b, tema, 320, [[('Falou, colou,', 't1')], [('fotografou.', 't1')], [('Tá anotado.', 't2')]],
          [[('Por voz, colando o Pix, pela foto', 't1')], [('da nota ou pelo extrato.', 't1')]])
    linha_gradiente(b, 1260, tema)
    return celular(b, tema, 'lancar-por-voz-01', (560, 1275), 940, -4, corte_topo=0)


def conheca_4(tema):
    b = fundo(tema, True)
    bloco(b, tema, 330, [[('Quanto dá', 't1')], [('pra gastar hoje?', 't1')], [('Tá aqui.', 't2')]])
    linha_gradiente(b, 1020, tema)
    b = colar(b, tema, cartao('lancar-por-voz-01', LIVRE, 960), (540, 1020), 0)
    bloco(b, tema, 1350, h2=[[('O Livre para gastar já tira o que', 't1')], [('você guardou nos cofrinhos e o', 't1')],
                             [('crédito que ainda não foi pago.', 't2')]])
    return b


def conheca_5(tema):
    b = fundo(tema)
    bloco(b, tema, 330, [[('Bateu a dúvida?', 't1')], [('Pergunta pro', 't2')], [('Granabô ali.', 't2')]])
    linha_gradiente(b, 1080, tema)
    b = colar(b, tema, cartao('granachat-consulta-13', CHAT, 640), (480, 1075), -3)
    b = colar(b, tema, granabo(270), (900, 1440), 0, sombra=20)
    bloco(b, tema, 1560, h2=[[('Ele olha os seus lançamentos', 't1')], [('e responde na hora.', 't2')]])
    return b


def conheca_6(tema):
    b = fundo(tema, True)
    logo = Image.open(C.LOGO).convert('RGBA')
    logo = logo.crop(logo.getbbox())
    logo = logo.resize((560, round(560 * logo.height / logo.width)), Image.LANCZOS)
    linha_gradiente(b, 860, tema)
    b.alpha_composite(logo, (540 - logo.width // 2, 860 - logo.height // 2))
    bloco(b, tema, 1100, [[('Seu dinheiro,', 't1')], [('sem mistério.', 't2')]], x=540, alinhar='centro')
    bloco(b, tema, 1390, h2=[[('Assine em granaponto.com.br', 't1')]], x=540, alinhar='centro')
    return b


# ---------------------------------------------------------------- RECURSOS
def recursos_1(tema):
    b = fundo(tema)
    bloco(b, tema, 320, [[('Bora conhecer', 't1')], [('o Grana. por dentro?', 't2')]])
    linha_gradiente(b, 760, tema)
    b = colar(b, tema, cartao('lancar-por-voz-01', BOTOES, 960), (540, 760), 0)
    nomes = ['Livre para gastar', 'Cofrinhos e metas', 'Crédito e faturas', 'Contas a pagar', 'Gráficos', 'Granabô', 'Desafios']
    fileira(b, tema, [pilula(tema, n, 30) for n in nomes], 1030)
    bloco(b, tema, 1500, h2=[[('Um recurso por story.', 't1')], [('Arrasta pro lado!', 't2')]])
    return b


def recursos_2(tema):
    b = fundo(tema, True)
    bloco(b, tema, 320, [[('Gastou?', 't1')], [('É só falar.', 't2')]])
    linha_gradiente(b, 800, tema)
    b = colar(b, tema, cartao('lancar-por-voz-02', BOTOES, 960), (540, 800), -3)
    b = colar(b, tema, notificacao('gasto-salvo-padaria', 920), (560, 1090), 2)
    bloco(b, tema, 1360, h2=[[('Toca no microfone do app ou no', 't1')], [('widget da tela inicial do Android.', 't1')],
                             [('Nem precisa abrir o app.', 't2')]])
    return b


def recursos_3(tema):
    b = fundo(tema)
    bloco(b, tema, 320, [[('Caiu um Pix?', 't1')], [('Copia e cola.', 't2')]],
          [[('O Grana. pega valor, nome e data', 't1')], [('e deixa tudo pronto pra você', 't1')], [('conferir antes de salvar.', 't1')]])
    linha_gradiente(b, 1240, tema)
    return celular(b, tema, 'colar-pix-08', (560, 1270), 960, 4)


def recursos_4(tema):
    b = fundo(tema, True)
    bloco(b, tema, 320, [[('Fatura sem susto', 't1')], [('no fim do mês.', 't2')]],
          [[('Cada cartão com a fatura do ciclo,', 't1')], [('o limite usado e o vencimento.', 't1')]])
    linha_gradiente(b, 1200, tema)
    return celular(b, tema, 'navegacao-abas-05', (520, 1215), 1020, -4)


def recursos_5(tema):
    b = fundo(tema)
    bloco(b, tema, 320, [[('Aquela viagem', 't1')], [('começa aqui.', 't2')]])
    linha_gradiente(b, 900, tema)
    b = colar(b, tema, cartao('lancar-por-voz-01', COFRINHOS, 940), (540, 830), -3)
    b = colar(b, tema, cartao('lancar-por-voz-01', COMPROMISSO, 880), (560, 1240), 3)
    bloco(b, tema, 1520, h2=[[('Cofrinhos com meta e prazo, e uma', 't1')], [('espiada nos próximos meses.', 't2')]])
    return b


def recursos_6(tema):
    b = fundo(tema, True)
    bloco(b, tema, 320, [[('Pra onde foi', 't1')], [('cada real?', 't2')]],
          [[('Gráficos por categoria e a evolução', 't1')], [('mês a mês, sem abrir planilha.', 't1')]])
    linha_gradiente(b, 1200, tema)
    return celular(b, tema, 'navegacao-abas-09', (560, 1215), 1020, 4)


# ---------------------------------------------------------------- PLANOS
# Preços da nota "Preço Vigente e Parcelamento - Cakto" (vault), conferidos em 21/10/2026:
# R$ 9,90/mês e R$ 97,90/ano; 12 x 9,90 = 118,80; 118,80 − 97,90 = 20,90; 97,90 ÷ 12 = 8,16.
# Garantia de 7 dias; Pix ou cartão. Sem período de teste: nenhum "grátis" nas peças.
def barra(tema, w, h, rotulo, valor, sufixo, cheia):
    t = TEMAS[tema]
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if cheia:
        g = np.linspace(0, 1, h)[:, None]
        cor = GRAD_DE * (1 - g) + GRAD_ATE * g
        arr = np.zeros((h, w, 4), np.uint8)
        arr[..., :3] = cor[:, None, :]
        arr[..., 3] = 255
        im = Image.fromarray(arr, 'RGBA')
        im.putalpha(C.ret_arredondado(w, h, 30))
        d = ImageDraw.Draw(im)
        tinta, tinta2 = (4, 40, 48), (8, 56, 75)
    else:
        d.rounded_rectangle([1, 1, w - 2, h - 2], 30, fill=t['cartao'] + (255,), outline=t['borda'], width=2)
        tinta, tinta2 = t['t2'], t['suave']
    C.escrever(d, [[(rotulo.upper(), tinta2)]], C.fonte(C.REGULAR, 17), w / 2 - C.largura(rotulo.upper(), C.fonte(C.REGULAR, 17), 0.5) / 2, 56, 0, 0.5)
    fv = C.fonte(C.ULTRABOLD, 54)
    C.escrever(d, [[(valor, tinta)]], fv, w / 2 - C.largura(valor, fv, 0) / 2, 128, 0)
    fs = C.fonte(C.REGULAR, 22)
    C.escrever(d, [[(sufixo, tinta2)]], fs, w / 2 - C.largura(sufixo, fs, 0.02) / 2, 168, 0, 0.02)
    return im


def planos_1(tema):
    b = fundo(tema)
    bloco(b, tema, 320, [[('Menos de', 't1')], [('R$ 0,37 por dia', 't2')], [('pra ter tudo.', 't2')]])
    y = 1150
    linha_gradiente(b, y, tema)
    b.alpha_composite(barra(tema, 360, 330, 'Mensal', 'R$ 9,90', 'por mês', False), (140, y - 330))
    b.alpha_composite(barra(tema, 360, 500, 'Anual', 'R$ 97,90', 'por ano', True), (580, y - 500))
    bloco(b, tema, 1250, h2=[[('Nos dois planos vem tudo liberado.', 't1')], [('Muda só o jeito de pagar.', 't1')]])
    fileira(b, tema, [pilula(tema, 'Pix ou cartão'), pilula(tema, '7 dias de garantia')], 1450)
    return b


ITENS_PLANO = ['Lançar por voz e pelo widget', 'Colar Pix e fotografar nota', 'Livre para gastar',
               'Cofrinhos, metas e faturas', 'Granabô e gráficos']


def rotulo_central(b, tema, txt, y):
    d = ImageDraw.Draw(b)
    rot = C.fonte(C.REGULAR, 19)
    C.escrever(d, [[(txt, TEMAS[tema]['t2'])]], rot, 540 - C.largura(txt, rot, 0.5) / 2, y, 0, 0.5)


def planos_2(tema):
    b = fundo(tema, True)
    rotulo_central(b, tema, 'PLANO MENSAL', 380)
    preco(b, tema, '9,90', 'por mês', 540, 560)
    linha_gradiente(b, 680, tema)
    b = colar(b, tema, lista(tema, 900, 'Tudo isso incluso', ITENS_PLANO), (540, 990), 0)
    bloco(b, tema, 1340, [[('No seu ritmo,', 't1')], [('um mês por vez.', 't2')]],
          [[('Pra quem prefere começar', 't1')], [('sem fechar o ano todo.', 't1')]])
    return b


def planos_3(tema):
    b = fundo(tema)
    rotulo_central(b, tema, 'PLANO ANUAL', 380)
    preco(b, tema, '97,90', 'por ano', 540, 560, 140)
    linha_gradiente(b, 680, tema)
    cx = caixa_marca(tema, 840, 300)
    dc = ImageDraw.Draw(cx)
    t = TEMAS[tema]
    C.escrever(dc, [[('SAI POR', t['suave'])]], C.fonte(C.REGULAR, 17), 50, 70, 0, 0.5)
    C.escrever(dc, [[('R$ 8,16', t['t2'])]], C.fonte(C.ULTRABOLD, 64), 50, 150, 0)
    C.escrever(dc, [[('por mês', t['suave'])]], C.fonte(C.REGULAR, 24), 50, 190, 0, 0.02)
    C.escrever(dc, [[('FICA NO SEU BOLSO', t['suave'])]], C.fonte(C.REGULAR, 17), 460, 70, 0, 0.5)
    C.escrever(dc, [[('R$ 20,90', t['t2'])]], C.fonte(C.ULTRABOLD, 64), 460, 150, 0)
    C.escrever(dc, [[('no ano', t['suave'])]], C.fonte(C.REGULAR, 24), 460, 190, 0, 0.02)
    C.escrever(dc, [[('Comparado a 12 meses do plano mensal.', t['suave'])]], C.fonte(C.REGULAR, 22), 50, 258, 0, 0.02)
    b = colar(b, tema, cx, (540, 900), 0)
    bloco(b, tema, 1180, [[('Fechou o ano?', 't1')], [('Paga menos.', 't2')]],
          [[('Pra quem já decidiu que este', 't1')], [('é o ano de cuidar do dinheiro.', 't1')]])
    return b


def comparacao(tema, w):
    t = TEMAS[tema]
    h = 330
    im = caixa_marca(tema, w, h)
    d = ImageDraw.Draw(im)
    rot, val = C.fonte(C.REGULAR, 17), C.fonte(C.REGULAR, 30)
    trilho = w - 100
    for i, (nome, valor, frac, cheia) in enumerate((('12 MESES DO MENSAL', 'R$ 118,80', 1.0, False),
                                                   ('PLANO ANUAL', 'R$ 97,90', 97.90 / 118.80, True))):
        y = 70 + i * 130
        C.escrever(d, [[(nome, t['suave'])]], rot, 50, y, 0, 0.5)
        C.escrever(d, [[(valor, t['t2'] if cheia else t['corpo'])]], val, w - 50 - C.largura(valor, val, 0), y + 4, 0)
        d.rounded_rectangle([50, y + 28, 50 + trilho, y + 46], 9, fill=t['borda'])
        if cheia:
            x = np.linspace(0, 1, round(trilho * frac))[None, :, None]
            arr = np.zeros((18, x.shape[1], 4), np.uint8)
            arr[..., :3] = (GRAD_DE * (1 - x) + GRAD_ATE * x)[0][None].repeat(18, 0)
            arr[..., 3] = 255
            barra_im = Image.fromarray(arr, 'RGBA')
            barra_im.putalpha(C.ret_arredondado(barra_im.width, 18, 9))
            im.alpha_composite(barra_im, (50, y + 28))
        else:
            d.rounded_rectangle([50, y + 28, 50 + round(trilho * frac), y + 46], 9, fill=t['suave'] + (255,))
    return im


def planos_4(tema):
    b = fundo(tema, True)
    bloco(b, tema, 320, [[('Faz a conta', 't1')], [('com a gente.', 't2')]])
    linha_gradiente(b, 820, tema)
    b = colar(b, tema, comparacao(tema, 860), (540, 820), 0)
    bloco(b, tema, 1100, h2=[[('No anual, cada mês sai por', 't1')], [('R$ 8,16 em vez de R$ 9,90.', 't2')]])
    fileira(b, tema, [pilula(tema, 'Pix ou cartão'), pilula(tema, '7 dias de garantia')], 1300)
    return b


def pergunta(tema, w, texto, plano, destaque):
    t = TEMAS[tema]
    h = 116
    im = caixa_marca(tema, w, h, 28)
    d = ImageDraw.Draw(im)
    C.escrever(d, [[(texto, t['corpo'])]], C.fonte(C.REGULAR, 28), 40, h / 2 + 10, 0, 0.01)
    p = pilula(tema, plano, 22, cheia=destaque) if destaque else None
    if p is None:
        f = C.fonte(C.REGULAR, 22)
        pw = round(C.largura(plano, f, 0.02)) + 56
        p = Image.new('RGBA', (pw, 56), (0, 0, 0, 0))
        ImageDraw.Draw(p).rounded_rectangle([1, 1, pw - 2, 54], 27, outline=t['t2'] + (200,), width=2)
        C.escrever(ImageDraw.Draw(p), [[(plano, t['t2'])]], f, 28, 36, 0, 0.02)
    im.alpha_composite(p, (w - 36 - p.width, (h - p.height) // 2))
    return im


def planos_5(tema):
    b = fundo(tema)
    bloco(b, tema, 320, [[('E aí, qual', 't1')], [('combina com você?', 't2')]])
    linha_gradiente(b, 900, tema)
    b = colar(b, tema, pergunta(tema, 900, 'Quer ir no seu ritmo, mês a mês?', 'Mensal', False), (540, 790), 0, sombra=16)
    b = colar(b, tema, pergunta(tema, 900, 'Quer pagar menos e garantir o ano?', 'Anual', True), (540, 1020), 0, sombra=16)
    bloco(b, tema, 1260, h2=[[('Assine em granaponto.com.br', 't1')], [('e lança o primeiro gasto hoje.', 't2')]], x=540, alinhar='centro')
    return b


# ---------------------------------------------------------------- SEGURANÇA
# Nada de banco (autor, 21/10/2026). Só o que o app faz, com os nomes das opções como estão no
# Perfil: "Bloqueio por biometria", "Ocultar valores", "Bloquear captura de tela" (Android),
# "Baixar meus dados" e "Excluir conta e dados"; senha conferida contra vazamentos (lib/pwned.ts).
def seguranca_1(tema):
    b = fundo(tema)
    bloco(b, tema, 330, [[('Só você vê', 't1')], [('os seus números.', 't2')]])
    linha_gradiente(b, 1000, tema)
    b = colar(b, tema, cartao('lancar-por-voz-01', LIVRE, 820), (540, 1000), -3, desfoque=9)
    p = pilula(tema, 'Valores escondidos num toque', 26, cheia=True)
    b = colar(b, tema, p, (560, 1000), 3, sombra=14)
    bloco(b, tema, 1300, h2=[[('Cuidar do dinheiro passa por cuidar', 't1')], [('dos seus dados. Arrasta que', 't1')],
                             [('a gente mostra como.', 't2')]])
    return b


def seguranca_2(tema):
    b = fundo(tema, True)
    bloco(b, tema, 320, [[('O Grana. anota.', 't1')], [('Quem mexe no', 't2')], [('dinheiro é você.', 't2')]])
    linha_gradiente(b, 1000, tema)
    b = colar(b, tema, lista(tema, 900, 'No Grana. você', ['Anota o que gastou e recebeu', 'Vê quanto dá pra gastar',
                                                           'Acompanha cada fatura']), (540, 880), 0)
    b = colar(b, tema, lista(tema, 900, 'O Grana. não', ['Faz Pix nem pagamentos', 'Movimenta o seu dinheiro'],
                             ok=False), (540, 1220), 0)
    bloco(b, tema, 1460, h2=[[('Ele organiza e faz as contas.', 't1')], [('A decisão é sempre sua.', 't2')]])
    return b


def seguranca_3(tema):
    b = fundo(tema)
    bloco(b, tema, 320, [[('Trancado', 't1')], [('do seu jeito.', 't2')]])
    linha_gradiente(b, 900, tema)
    b = colar(b, tema, lista(tema, 920, 'Pra ligar quando quiser', ['Bloqueio por biometria', 'Ocultar valores com um toque',
                                                                    'Bloquear captura de tela', 'Senha conferida contra vazamentos'],
                             alto=84), (540, 900), 0)
    bloco(b, tema, 1260, h2=[[('O bloqueio de captura de tela', 't1')], [('funciona no Android.', 't2')]])
    return b


def acao(tema, w, titulo, sub, perigo=False):
    t = TEMAS[tema]
    h = 130
    im = caixa_marca(tema, w, h, 26)
    d = ImageDraw.Draw(im)
    cor = PERIGO if perigo else t['t2']
    d.ellipse([34, 37, 90, 93], fill=cor + (40,), outline=cor + (255,), width=2)
    if perigo:
        d.line([(52, 55), (72, 75)], fill=cor + (255,), width=4)
        d.line([(52, 75), (72, 55)], fill=cor + (255,), width=4)
    else:
        d.line([(62, 50), (62, 76)], fill=cor + (255,), width=4)
        d.line([(52, 67), (62, 77), (72, 67)], fill=cor + (255,), width=4, joint='curve')
    C.escrever(d, [[(titulo, t['corpo'])]], C.fonte(C.REGULAR, 31), 116, 60, 0, 0.01)
    C.escrever(d, [[(sub, t['suave'])]], C.fonte(C.REGULAR, 22), 116, 98, 0, 0.02)
    d.line([(w - 60, 52), (w - 46, 65), (w - 60, 78)], fill=t['suave'] + (255,), width=3)
    return im


def seguranca_4(tema):
    b = fundo(tema, True)
    bloco(b, tema, 320, [[('Quer levar', 't1')], [('seus dados?', 't1')], [('Fica à vontade.', 't2')]],
          [[('No Perfil dá pra baixar uma cópia', 't1')], [('ou excluir a conta quando quiser.', 't1')]])
    linha_gradiente(b, 1080, tema)
    b = colar(b, tema, acao(tema, 900, 'Baixar meus dados', 'Uma cópia de tudo que você registrou'), (540, 1000), 0, sombra=16)
    b = colar(b, tema, acao(tema, 900, 'Excluir conta e dados', 'Apaga a conta e o que está nela', True), (540, 1170), 0, sombra=16)
    return b


def seguranca_5(tema):
    b = fundo(tema)
    bloco(b, tema, 330, [[('Organizado', 't1')], [('e protegido.', 't2')]], x=540, alinhar='centro')
    linha_gradiente(b, 880, tema)
    selo = Image.open(os.path.join(ARSENAL, 'icones', 'seguranca-gradiente.png')).convert('RGBA').resize((220, 220), Image.LANCZOS)
    b = colar(b, tema, selo, (540, 880), 0, sombra=20)
    fileira(b, tema, [pilula(tema, n) for n in ('Não movimenta dinheiro', 'Só você acessa', 'Biometria',
                                                  'Valores escondidos', 'Exclua quando quiser')], 1090)
    bloco(b, tema, 1440, h2=[[('Saiba mais em granaponto.com.br', 't1')]], x=540, alinhar='centro')
    return b


DESTAQUES = {
    'Conheça': [conheca_1, conheca_2, conheca_3, conheca_4, conheca_5, conheca_6],
    'Recursos': [recursos_1, recursos_2, recursos_3, recursos_4, recursos_5, recursos_6],
    'Planos': [planos_1, planos_2, planos_3, planos_4, planos_5],
    'Segurança': [seguranca_1, seguranca_2, seguranca_3, seguranca_4, seguranca_5],
}


# ---------------------------------------------------------------- capas dos destaques
def simbolo_gradiente(lado):
    destino = os.path.join(TMP, 'simbolo-gradiente.png')
    if not os.path.exists(destino):
        from playwright.sync_api import sync_playwright
        svg = open(SIMBOLO_GRADIENTE, encoding='utf-8').read()
        with sync_playwright() as p:
            nav = p.chromium.launch()
            pg = nav.new_page(viewport={'width': 1024, 'height': 1024})
            pg.set_content(f'<html><body style="margin:0;background:transparent">'
                           f'<div style="width:1024px;height:1024px">{svg.replace("<svg", "<svg width=1024 height=1024", 1)}</div></body></html>')
            pg.locator('div').screenshot(path=destino, omit_background=True)
            nav.close()
    im = Image.open(destino).convert('RGBA')
    im = im.crop(im.getbbox())
    return im.resize((lado, round(im.height * lado / im.width)), Image.LANCZOS)


def capa(icone):
    """Capa de destaque: o Instagram mostra só o círculo central, então o símbolo fica no meio,
    num disco com borda em gradiente sobre o fundo escuro da série."""
    b = fundo('escuro')
    disco = np.zeros((H, W, 4))
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.hypot(xx - 540, yy - 960)
    anel = np.clip(1 - np.abs(r - 330) / 3, 0, 1)
    t = np.clip((xx - 210) / 660, 0, 1)[..., None]
    disco[..., :3] = GRAD_DE * (1 - t) + GRAD_ATE * t
    disco[..., 3] = anel * 255
    anel_im = Image.fromarray(disco.astype(np.uint8), 'RGBA')
    brilho = anel_im.filter(ImageFilter.GaussianBlur(26))
    a = np.asarray(brilho, float)
    a[..., 3] = np.clip(a[..., 3] * 3, 0, 255)
    b.alpha_composite(Image.fromarray(a.astype(np.uint8), 'RGBA'))
    b.alpha_composite(anel_im)
    if icone == 'marca':
        im = simbolo_gradiente(330)
    else:
        im = Image.open(os.path.join(ARSENAL, 'icones', f'{icone}-simbolo-menta.png')).convert('RGBA').resize((400, 400), Image.LANCZOS)
    b.alpha_composite(im, (540 - im.width // 2, 960 - im.height // 2))
    return b


CAPAS = {'Conheça': 'marca', 'Recursos': 'voz', 'Planos': 'dinheiro', 'Segurança': 'seguranca'}


if __name__ == '__main__':
    QUADROS, SAIDA = sys.argv[1], sys.argv[2]
    TMP = os.path.join(QUADROS, '_tmp')
    os.makedirs(TMP, exist_ok=True)
    os.makedirs(SAIDA, exist_ok=True)
    for nome, funcoes in DESTAQUES.items():
        for i, f in enumerate(funcoes):
            tema = 'escuro' if i % 2 == 0 else 'claro'
            peca = f(tema)
            marca(peca, tema, nome)
            peca.convert('RGB').save(os.path.join(SAIDA, f'Destaque {nome}-{i + 1}.png'))
            print(f'Destaque {nome}-{i + 1}.png ({tema})')
        capa(CAPAS[nome]).convert('RGB').save(os.path.join(SAIDA, f'Capa do destaque {nome}.png'))
        print(f'Capa do destaque {nome}.png')

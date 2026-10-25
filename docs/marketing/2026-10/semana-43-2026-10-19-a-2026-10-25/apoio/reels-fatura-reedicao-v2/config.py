"""V2, espelho do anúncio 1411261674499683 da Tino (fatura sempre maior / parcelas esquecidas).
Todos os números da dor saem da tela real de credito.mp4: as quatro compras da fatura de outubro somam o
"Total das faturas" de R$ 722,85 que o app mostra."""
TITULO = 'Fatura e parcelas'
ARQUIVO = 'reel-tino-v2-fatura-e-parcelas.mp4'
# pausas inseridas antes da palavra k (só silêncio; a voz não é esticada): fim do gancho, subida do celular, CTA
PAUSAS = {9: .25, 20: .45, 51: .45}
DESTAQUE = ['fatura', 'parcelas', 'esquece', 'parcelada', 'parcela', 'cartão', 'pagar', 'livre', 'dia', 'vencimento']
JUNTOS = [('saiba', 'mais'), ('a', 'pagar'), ('livre', 'do', 'dia')]
TRILHA = {'bpm': 98, 'semente': 202, 'prog': ['Em', 'C', 'G', 'D'], 'groove': 'house', 'pluck': (.5, 2, 3.25),
          'motivo': [(12, 0), (7, 1), (10, 2), (12, 3)]}


def cel(txt):
    return ''.join(f'<span class="c{" n" if ch.isdigit() else ""}">{"&nbsp;" if ch == " " else ch}</span>' for ch in txt)


COMPRAS = [('c1', 'Fone de ouvido', '1/3', 'Cartão Principal · 04 out', 'R$ 120,00'),
           ('c2', 'Jantar com amigos', '', 'Cartão Principal · 03 out', 'R$ 112,00'),
           ('c3', 'Livraria', '', 'Cartão Principal · 02 out', 'R$ 74,90'),
           ('c4', 'Notebook de trabalho', '1/3', 'Cartão Horizonte · 19 out', 'R$ 415,95')]
DOR_CSS = '#ctot{background:linear-gradient(180deg,#123F4B 0%,#0B2E38 100%);box-shadow:0 24px 60px rgba(0,0,0,.42),0 0 0 2px rgba(173,251,227,.45) inset}'
DOR_HTML = '<div id="dor">' + ''.join(
    f'<div class="card" id="{i}" style="left:90px;top:{570 + n * 148}px;width:900px;height:132px">'
    f'<div style="position:absolute;left:36px;top:18px"><div class="t1" style="font-size:36px">{nome}{f"<span class=tag>{tag}</span>" if tag else ""}</div>'
    f'<div class="t2">{sub}</div></div><div class="v" style="position:absolute;right:36px;top:34px">{val}</div></div>'
    for n, (i, nome, tag, sub, val) in enumerate(COMPRAS)) + (
    '<div class="card" id="ctot" style="left:90px;top:1210px;width:900px;height:150px">'
    '<div class="t2" style="position:absolute;left:36px;top:22px;font-size:34px">Total das faturas</div>'
    f'<div class="v" style="position:absolute;left:36px;top:66px;font-size:64px;line-height:72px;color:#ADFBE3"><span class="flap">{cel("R$ 722,85")}</span></div></div>'
    '</div>')
DOR_JS = r"""
var t0 = T(13) - .1;
['#c1', '#c2', '#c3', '#c4'].forEach(function (c, i) {
  // E05: queda escalonada com giro
  tl.fromTo(c, { opacity: 0, y: -300, rotation: -8 }, { opacity: 1, y: 0, rotation: 0, duration: .35, ease: 'back.out(1.4)' }, t0 + i * .12);
});
tl.fromTo('#ctot', { opacity: 0, scale: .95, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: .32, ease: 'back.out(1.7)' }, T(16) - .05);
tl.fromTo('#ctot .flap', {clipPath:'inset(0 100% 0 0)'}, {clipPath:'inset(0 0% 0 0)', duration:.38, ease:'power2.out'}, T(16));
// as parcelas que a gente esquece acendem
tl.fromTo('#dor .tag', { scale: 1, boxShadow: '0 0 0 rgba(173,251,227,0)' }, { scale: 1.18, boxShadow: '0 0 28px rgba(173,251,227,.9)', duration: .16, yoyo: true, repeat: 1, ease: 'power2.out' }, T(17));
// a dor não fica parada esperando a saída: aproximação lenta do grupo e respiro do total (trava 4)
tl.to('#dor', { scale: 1.05, y: -24, duration: T(20) - .62 - T(16), ease: 'sine.inOut', transformOrigin: '50% 60%' }, T(16));
tl.fromTo('#ctot', { boxShadow: '0 24px 60px rgba(0,0,0,.42),0 0 0 2px rgba(173,251,227,.45) inset' }, { boxShadow: '0 24px 60px rgba(0,0,0,.42),0 0 0 4px rgba(173,251,227,.95) inset', duration: .35, yoyo: true, repeat: 1, ease: 'sine.inOut', immediateRender: false }, T(17) + .4);
tl.to('#dor .card', { opacity: 0, y: -60, filter: 'blur(10px)', duration: .3, ease: 'power2.in', stagger: .04 }, T(20) - .62);
"""


def montar(T, E):
    sobe = T(20) - .25
    troca = T(40) - .02
    desce = T(51) - .4
    logo = E(58) + .25
    dur = round(logo + 1.9, 2)
    tA0 = sobe - .1
    vira = T(28) - .25                 # toque no cartão Horizonte (credito.mp4 3,35 s) cai antes de "em qual parcela"
    lista = 3.3 - .8
    pecas_a = [('tocar', 'credito', .8, 3.3), ('congelar', 'credito', 3.3, round(vira - (tA0 + lista), 3)),
               ('tocar', 'credito', 3.3, 5.6), ('congelar', 'credito', 5.6, round(troca - (vira + 2.3) + .2, 3))]
    return {
        'dur': dur, 'logo': logo,
        'gancho': {'linhas': [[0, 1, 2], [3, 4, 5, 6], [7, 8]], 'hi': [4], 'ul': 4, 'top': 560, 'sai': T(9) - .2},
        'pilula': {'rot': 'Fatura atual · Cartão Horizonte', 'val': 'R$ 415,95', 'a': T(3), 'b': T(9) - .2, 'top': 1330},
        'icones': [
            {'id': 'i1', 'arq': 'cartao-gradiente.png', 'x': 720, 'y': 300, 'w': 260, 'a': 0, 'b': T(9) - .2, 'dy': [40, -36], 'rot': [-10, 4], 'op': .9},
            {'id': 'i2', 'arq': 'calendario-petroleo.png', 'x': 100, 'y': 1120, 'w': 150, 'blur': 5, 'a': .05, 'b': T(9) - .2, 'dy': [30, -30], 'rot': [0, 0], 'op': .5},
            {'id': 'i3', 'arq': 'recibo-gradiente.png', 'x': 800, 'y': 1150, 'w': 160, 'blur': 2, 'a': .1, 'b': T(9) - .2, 'dy': [50, -40], 'rot': [8, -4], 'op': .8},
            {'id': 'i4', 'arq': 'graficos-petroleo.png', 'x': 120, 'y': 420, 'w': 150, 'blur': 6, 'a': desce + .2, 'b': logo - .2, 'dy': [40, -30], 'rot': [0, 0], 'op': .45}],
        'telas': [{'id': 'tA', 'ini': tA0, 'fim': troca, 'pecas': pecas_a},
                  {'id': 'tB', 'ini': troca - .1, 'fim': desce + .45, 'pecas': [('congelar', 'metas-cofrinhos', 1.0, round(desce + .6 - troca, 3))]}],
        'pops': [{'id': 'p1', 'tela': 'tA', 'caixa': (0, 650, 611, 62), 'a': T(25) - .05, 'b': min(E(26) + .25, vira - .05)},
                 {'id': 'p2', 'tela': 'tA', 'caixa': (0, 700, 611, 68), 'a': T(29) - .05, 'b': E(32) + .15},
                 {'id': 'p3', 'tela': 'tA', 'caixa': (9, 421, 593, 222), 'a': T(35) - .05, 'b': troca - .2},
                 {'id': 'p4', 'tela': 'tB', 'caixa': (9, 362, 593, 225), 'a': T(43) - .05, 'b': E(46) + .1},
                 {'id': 'p5', 'tela': 'tB', 'caixa': (14, 512, 584, 32), 'a': T(47) - .05, 'b': desce - .1}],
        'celular': {'sobe': [{'tela': 'tA', 't': sobe}], 'desce': [desce], 'trocas': [{'t': troca, 'de': 'tA', 'para': 'tB'}],
                    'zooms': [[T(24) - .3, E(26) + .1], [T(43) - .4, desce - .5]], 'brilhos': [sobe + .7, troca + .3],
                    'deriva': [[sobe + .8, 2.2, 3]]},
        'karaoke': [(9, 50)], 'cortes': [desce], 'quebras': [40],
        'cta': {'c1': [51, 52], 'btn': 53, 'seta': 54, 'c2': [55, 56, 57, 58], 'sai': logo - .15},
        'efeitos': [('whoosh', 0, .35), ('whoosh', T(13) - .15, .4)] + [('tic', T(13) - .1 + i * .12 + .25, .25) for i in range(4)] + [
            ('whoosh-curto', sobe, .55), ('tic', T(25) - .05, .45), ('tic', T(29) - .05, .45), ('tic', T(35) - .05, .45),
            ('whoosh-curto', troca - .1, .5), ('tic', T(43) - .05, .45), ('tic', T(47) - .05, .45),
            ('whoosh-curto', desce, .5), ('plim', T(53), .5), ('whoosh', logo - .15, .35)],
        'cortes_trilha': {'gancho': T(9) - .1, 'cta': desce + .3, 'logo': logo, 'viradas': [sobe, troca]},
    }


# Variante pedida em 25/10: locucao existente, nova montagem e trilha.
ARQUIVO = 'Fatura e parcelas - reedicao v2.mp4'
PAUSAS = {9: .08, 20: .12, 51: .12}
TRILHA = dict(TRILHA, bpm=108, semente=1025, prog=['Em', 'G', 'D', 'C'], motivo=[(12,0),(10,1),(7,2),(14,3)])
_original = montar
def montar(T, E):
    p = _original(T, E)
    p['gancho'].update(linhas=[[0,1],[2,3,4],[5,6],[7,8]], top=530, fonte=(88,108), hi=[1,4], ul=4)
    p['pilula']['rot'] = 'Fatura atual do Cartão Horizonte'
    p['pilula']['a'] = T(4)
    p['pilula']['top'] = 1110
    p['icones'] = [p['icones'][0]]
    p['icones'][0].update(x=735,y=300,w=210,dy=[12,-12],rot=[-4,2],op=.8)
    p['cta']['c2'] = [55,56,57,58]
    p['logo'] = E(58) + .32
    p['dur'] = round(p['logo'] + 1.65,2)
    return p

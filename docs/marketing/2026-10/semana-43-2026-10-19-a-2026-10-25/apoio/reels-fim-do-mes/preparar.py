"""Prepara o Reels "Fim do mês" (21/10/2026) para a Editonny: áudio mixado, cut.mp4, transcrição deslocada
e as telas do app recortadas. Parte do modelo aprovado reels-granabo-v3 (semana 43).

Uso: python preparar.py [audio] [telas]
"""
import os, sys, json, subprocess
AQ = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(AQ)
EDIT = os.path.join(BASE, 'edit'); ASSETS = os.path.join(BASE, 'projeto', 'assets', 'granabo')
os.makedirs(os.path.join(EDIT, 'transcripts'), exist_ok=True)
CEL = r'E:\Grana-temporarios\2026-10-19-agendamento-meta\capturas-app\celular'
FUNDO = r'E:\Grana-temporarios\2026-10-19-agendamento-meta\reels-granabo\v3\midia\fundo.png'
PLIM = r'E:\GranaPonto\docs\marketing\identidade-sonora\plim-sucesso.wav'
AUD = os.path.join(BASE, 'audio')
NARR = os.path.join(AUD, 'narracao-v3.wav')     # v3 e v4: narração nova no eleven_v4 (take h3), pausas de até 0,3 s (montar-v3.py)
TR = os.path.join(AUD, 'edit-v3', 'transcripts', 'narracao-v3.json')
DUR, FPS, P = 39.8, 30, 0.30                     # P: a narração começa 0,3 s depois do primeiro quadro
# v4: as batidas (trocas, eventos dentro das telas e o plim) vêm de montar-v4.py, presas à palavra falada.
TEMPOS = json.load(open(os.path.join(EDIT, 'tempos-v4.json'), encoding='utf-8'))
T_PLIM = TEMPOS['T']['plim']                     # "Valor,": o formulário preenchido assenta na tela
def run(c): subprocess.run(c, check=True)

def audio():
    fl = [f'[1:a]adelay={int(P*1000)}|{int(P*1000)},apad,atrim=0:{DUR},asplit=2[voz][sc]',
          f'[2:a]atrim=0:{DUR},volume=0.35[mu]',
          '[mu][sc]sidechaincompress=threshold=0.03:ratio=4:attack=30:release=400[mud]',
          f'[3:a]adelay={int(T_PLIM*1000)}|{int(T_PLIM*1000)},volume=0.5,apad,atrim=0:{DUR}[pl]',
          '[voz][mud][pl]amix=inputs=3:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]']
    run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-framerate', str(FPS), '-i', FUNDO,
         '-i', NARR, '-i', os.path.join(AUD, 'musica-fim-do-mes.wav'), '-i', PLIM,
         '-filter_complex', ';'.join(fl), '-map', '0:v', '-map', '[a]', '-t', str(DUR),
         '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-b:a', '192k', os.path.join(EDIT, 'cut.mp4')])
    json.dump({'duration': DUR, 'fps': FPS, 'width': 1080, 'height': 1920,
               'segments': [{'source': 'fundo+narracao', 'in': 0, 'out': DUR, 'out_start': 0, 'out_end': DUR}]},
              open(os.path.join(EDIT, 'cut_timeline.json'), 'w'), indent=1)
    tr = json.load(open(TR, encoding='utf-8'))
    ws = tr.get('words') or [w for s in tr['segments'] for w in s['words']]
    out = [{'text': (w.get('text') or w.get('word')).strip(), 'start': round(w['start'] + P, 3), 'end': round(w['end'] + P, 3)} for w in ws]
    json.dump({'language': 'pt', 'words': out}, open(os.path.join(EDIT, 'transcripts', 'cut.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return out

# telas: nome -> (clipe, [(início na fonte, fim na fonte, batida, peso)]). Esperas cortadas, rolagem acelerada.
# Um trecho com batida (chave de TEMPOS['T']) termina exatamente nela; os trechos sem batida dividem o tempo até a
# próxima batida (ou até o fim da tela) pelo peso, que por padrão é a duração na fonte.
# Eventos medidos quadro a quadro nas gravações de 19/10 (60 fps):
# - lancar-por-voz: "Ouvindo…" acende em 2,063 s, "Transcrevendo…" em 6,094 s; o Expo Go recarrega (tela branca)
#   em 6,826 s, então a gravação só vai até 6,80 s.
# - colar-pix: janela aberta em 3,9 s, menu "Colar" em 5,8 s, texto colado em 6,40 s, formulário entra em 10,31 s.
TELAS = {'voz':     ('lancar-por-voz',   [(0.0, 2.063, 'voz_ouvindo'), (2.063, 6.094, 'voz_transcreve'), (6.094, 6.80, None)]),
         'pix':     ('colar-pix',        [(3.4, 5.8, 'pix_menu'), (5.8, 6.40, 'pix_cola'), (6.40, 7.2, None), (9.6, 10.31, 'pix_form'),
                                          (10.31, 13.2, None)]),
         'credito': ('credito',          [(0.0, 2.5, None, 1.55), (2.5, 8.5, None, 3.44)]),
         'lista':   ('lancamentos',      [(0.5, 6.5, None)]),
         'grafico': ('graficos-periodo', [(6.0, 11.0, None)])}


def trechos_no_video(nome):
    """(início na fonte, fim na fonte, duração no vídeo) de cada trecho, a partir das batidas de tempos-v4.json."""
    ini, dur = TEMPOS['telas'][nome]
    out, grupo, t = [], [], ini
    for tr in TELAS[nome][1] + [(None, None, 'fim')]:
        a, b, batida = tr[:3]
        if a is not None:
            grupo.append((a, b, tr[3] if len(tr) > 3 else b - a))
        if batida is None:
            continue
        ate = ini + dur if batida == 'fim' else TEMPOS['T'][batida]
        peso = sum(p for _, _, p in grupo)
        assert ate > t and peso > 0, (nome, batida, t, ate)
        out += [(x, y, (ate - t) * p / peso) for x, y, p in grupo]
        grupo, t = [], ate
    return out
SW, SH = 900, 2070      # proporção da tela útil do aparelho, igual ao modelo

def telas():
    for nome, (clipe, _) in TELAS.items():
        trechos = trechos_no_video(nome)
        print(nome, [(a, b, round(d, 3)) for a, b, d in trechos])
        # a gravação de tela tem quadro variável: sem o fps=60 antes do corte, trecho de tela parada termina no
        # último quadro gravado e encurta (na v4, o Pix saía 0,23 s curto e o formulário entrava antes de "Valor,")
        fl = []
        for i, (a, b, d) in enumerate(trechos):
            fl.append(f'[0:v]fps=60,trim={a}:{b},setpts=(PTS-STARTPTS)*{d/(b-a):.5f},fps={FPS},scale={SW}:{SH}:force_original_aspect_ratio=increase,crop={SW}:{SH},setsar=1,trim=duration={d},setpts=PTS-STARTPTS[v{i}]')
        fl.append(''.join(f'[v{i}]' for i in range(len(trechos))) + f'concat=n={len(trechos)}:v=1:a=0[v]')
        run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(CEL, clipe + '.mp4'), '-filter_complex', ';'.join(fl),
             '-map', '[v]', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-g', '15', os.path.join(ASSETS, f'tela-{nome}.mp4')])
    # Início parada, com o "Livre para gastar" (quadro de 0,8 s da gravação da voz, antes do toque)
    run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', '0.8', '-i', os.path.join(CEL, 'lancar-por-voz.mp4'), '-frames:v', '1',
         '-vf', f'scale={SW}:{SH}:force_original_aspect_ratio=increase,crop={SW}:{SH}', '-q:v', '2', os.path.join(ASSETS, 'tela-inicio.jpg')])

if __name__ == '__main__':
    passos = sys.argv[1:] or ['audio', 'telas']
    if 'audio' in passos: print(' '.join(f"{w['text']}@{w['start']}" for w in audio()))
    if 'telas' in passos: telas(); print('telas ok')

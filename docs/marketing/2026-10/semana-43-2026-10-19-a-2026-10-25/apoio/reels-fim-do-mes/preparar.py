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
NARR = os.path.join(AUD, 'narracao-v3.wav')     # v3: narração nova no eleven_v4 (take h3), pausas de até 0,3 s (montar-v3.py)
TR = os.path.join(AUD, 'edit-v3', 'transcripts', 'narracao-v3.json')
DUR, FPS, P = 39.8, 30, 0.30                     # P: a narração começa 0,3 s depois do primeiro quadro
T_PLIM = 17.24                                   # "Valor," : o formulário já está preenchido na tela
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

# telas: nome -> (clipe, [(início na fonte, fim na fonte, duração no vídeo)]). Esperas cortadas, rolagem acelerada.
# A gravação da voz termina com o Expo Go recarregando (tela branca): só vai até "Transcrevendo..." (6,6 s; a tela branca começa em 6,8 s).
TELAS = {'voz':     ('lancar-por-voz',   [(0.0, 1.9, 2.34), (1.9, 6.6, 2.76)]),
         'pix':     ('colar-pix',        [(3.4, 4.6, 1.06), (5.6, 7.0, 0.95), (9.6, 10.4, 0.64), (10.9, 13.0, 2.28)]),
         'credito': ('credito',          [(0.0, 2.5, 1.55), (2.5, 8.5, 3.44)]),
         'lista':   ('lancamentos',      [(0.5, 6.5, 2.69)]),
         'grafico': ('graficos-periodo', [(6.0, 11.0, 2.6)])}
# v3: cada tela dura exatamente o tempo entre as trocas da cena (edit/tempos-v3.json).
SW, SH = 900, 2070      # proporção da tela útil do aparelho, igual ao modelo

def telas():
    for nome, (clipe, trechos) in TELAS.items():
        fl = []
        for i, (a, b, d) in enumerate(trechos):
            fl.append(f'[0:v]trim={a}:{b},setpts=(PTS-STARTPTS)*{d/(b-a):.5f},fps={FPS},scale={SW}:{SH}:force_original_aspect_ratio=increase,crop={SW}:{SH},setsar=1,trim=duration={d},setpts=PTS-STARTPTS[v{i}]')
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

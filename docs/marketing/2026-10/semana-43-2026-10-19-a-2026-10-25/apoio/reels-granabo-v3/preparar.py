"""Prepara a edição v3 do Reels do Granabô para a Editonny: áudio mixado, cut.mp4, transcrição deslocada,
camadas do mascote (WebM com alfa) e telas do app recortadas.

Uso: python preparar.py [audio] [telas] [mascote]
"""
import os, sys, json, subprocess, math, shutil
REPO = r'E:\GranaPonto\docs\marketing\reels-granabo'
sys.path.insert(0, REPO); os.chdir(REPO)
import montar as M
from PIL import Image
AQ = os.path.dirname(os.path.abspath(__file__))
EDIT = os.path.join(AQ, 'edit'); MID = os.path.join(AQ, 'midia')
os.makedirs(os.path.join(EDIT, 'transcripts'), exist_ok=True); os.makedirs(MID, exist_ok=True)
CEL = os.path.join(AQ, '..', '..', 'capturas-app', 'celular')
AUD = os.path.join(AQ, '..', 'audio')
DUR, FPS = 17.6, 30
def run(c): subprocess.run(c, check=True)

# narração: (início na fonte, fim na fonte, posição no vídeo). Cortes nos silêncios medidos.
NARR = [(0.00, 1.45, 0.30), (1.55, 3.45, 1.85), (3.50, 5.00, 4.20), (5.00, 6.27, 6.00), (6.27, 7.64, 9.70), (7.64, 10.08, 13.55)]
PLIM = 11.3   # confirmação do lançamento aparece na tela

def audio():
    # entradas: 0 fundo (imagem), 1 narração, 2 música, 3 plim
    fl = []
    for i, (a, b, p) in enumerate(NARR):
        fl.append(f'[1:a]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st={b-a-0.03:.3f}:d=0.03,adelay={int(p*1000)}|{int(p*1000)}[n{i}]')
    fl.append(''.join(f'[n{i}]' for i in range(len(NARR))) + f'amix=inputs={len(NARR)}:normalize=0,apad,atrim=0:{DUR},asplit=2[voz][sc]')
    fl.append(f'[2:a]atrim=0:{DUR},afade=t=out:st={DUR-2.2}:d=2.2,volume=0.35[mu]')
    fl.append('[mu][sc]sidechaincompress=threshold=0.03:ratio=4:attack=30:release=400[mud]')
    fl.append(f'[3:a]adelay={int(PLIM*1000)}|{int(PLIM*1000)},volume=0.5,apad,atrim=0:{DUR}[pl]')
    fl.append('[voz][mud][pl]amix=inputs=3:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]')
    BG = os.path.join(MID, 'fundo.png'); M.BG.convert('RGB').save(BG)
    run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-framerate', str(FPS), '-i', BG,
         '-i', os.path.join(AUD, 'narracao.mp3'), '-i', os.path.join(AUD, 'musica-pop.wav'),
         '-i', os.path.join(REPO, '..', 'identidade-sonora', 'plim-sucesso.wav'),
         '-filter_complex', ';'.join(fl), '-map', '0:v', '-map', '[a]', '-t', str(DUR),
         '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-b:a', '192k', os.path.join(EDIT, 'cut.mp4')])
    json.dump({'duration': DUR, 'fps': FPS, 'width': 1080, 'height': 1920,
               'segments': [{'source': 'fundo+narracao', 'in': 0, 'out': DUR, 'out_start': 0, 'out_end': DUR}]},
              open(os.path.join(EDIT, 'cut_timeline.json'), 'w'), indent=1)
    # transcrição local da narração (Whisper, editonny transcribe), deslocada para a posição de cada trecho
    tr = json.load(open(os.path.join(AQ, '..', 'edit', 'transcripts', 'narracao.json'), encoding='utf-8'))
    ws = tr.get('words') or [w for s in tr['segments'] for w in s['words']]
    out = []
    for w in ws:
        t = (w.get('text') or w.get('word')).strip()
        for a, b, p in NARR:
            if a <= w['start'] < b:
                out.append({'text': t, 'start': round(w['start'] - a + p, 3), 'end': round(min(w['end'], b) - a + p, 3)}); break
    out[-1]['text'] = 'vive.'   # o Whisper pôs "vive!"; a frase da arte termina em ponto
    json.dump({'language': 'pt', 'words': out}, open(os.path.join(EDIT, 'transcripts', 'cut.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return out

# camadas do mascote: mesmos quadros do Blender e o mesmo movimento do montar.py, em fundo transparente
def mascote(nome, t0, t1, fn):
    d = os.path.join(MID, nome); os.makedirs(d, exist_ok=True)
    for i in range(round((t1 - t0) * FPS)):
        fr = Image.new('RGBA', (1080, 1920), (0, 0, 0, 0)); fn(fr, t0 + i / FPS)
        fr.save(os.path.join(d, f'{i:04d}.png'))
    run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(d, '%04d.png'),
         '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '3M', '-auto-alt-ref', '0', os.path.join(MID, nome + '.webm')])
    shutil.rmtree(d)

def entrada(fr, t):
    cx, cy = 540, 900
    if t < 4.43: cy = 2300 + (840 - 2300) * M.easeout((t - 3.9) / 0.53)
    elif t < 4.8: cy = 840 + 60 * M.easeio((t - 4.43) / 0.37)
    nome = 'giro-00'
    if t >= 4.8: nome = 'giro-%02d' % min(30, int((t - 4.8) * FPS))
    if t >= 5.85:
        nome = 'frente'; k = int((t - 5.95) * FPS)
        if 0 <= k < 5: nome = ['piscada-0', 'piscada-1', 'piscada-2', 'piscada-1', 'piscada-0'][k]
    if t >= 6.2 and M.quadro_blender(t) is None: cy = 900 - 6 * math.sin((t - 6.2) / 3.0 * 2 * math.pi)
    M.cola_mascote(fr, nome, cx, cy, 1.0, 1.0, sombra=True, t=t)

def volta(fr, t):
    cy = 900
    if t < 19.13: cy = 2300 + (840 - 2300) * M.easeout((t - 18.6) / 0.53)
    elif t < 19.5: cy = 840 + 60 * M.easeio((t - 19.13) / 0.37)
    elif M.quadro_blender(t) is None: cy = 900 - 6 * math.sin((t - 19.5) / 3.0 * 2 * math.pi)
    if M.quadro_blender(t) is not None:
        M.cola_mascote(fr, 'frente', 540, cy, 1, 1, t=t)
    else:
        q = M.lin((t - 19.6) / 0.2)
        M.cola_mascote(fr, 'frente', 540, cy, 1, 1 - q, sombra=q < 0.5)
        if q > 0: M.cola_mascote(fr, 'feliz', 540, cy, 1, q, sombra=q >= 0.5)

# telas: (clipe, [(início na fonte, fim na fonte, duração no vídeo)]). Digitação acelerada, espera cortada.
TELAS = {'consulta': ('granachat-consulta', [(2.0, 13.2, 1.6), (14.0, 14.3, 0.3), (18.3, 20.3, 2.0)]),
         'registro': ('granachat-registro', [(4.0, 11.5, 1.3), (12.0, 12.3, 0.3), (18.2, 20.4, 2.2)])}
SW, SH = 900, 2070      # proporção da tela útil do aparelho (365x839)

def telas():
    for nome, (clipe, trechos) in TELAS.items():
        fl = []
        for i, (a, b, d) in enumerate(trechos):
            fl.append(f'[0:v]trim={a}:{b},setpts=(PTS-STARTPTS)*{d/(b-a):.5f},fps={FPS},scale={SW}:{SH}:force_original_aspect_ratio=increase,crop={SW}:{SH},setsar=1,trim=duration={d},setpts=PTS-STARTPTS[v{i}]')
        fl.append(''.join(f'[v{i}]' for i in range(len(trechos))) + f'concat=n={len(trechos)}:v=1:a=0[v]')
        run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(CEL, clipe + '.mp4'), '-filter_complex', ';'.join(fl),
             '-map', '[v]', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-g', '15', os.path.join(MID, f'tela-{nome}.mp4')])

if __name__ == '__main__':
    passos = sys.argv[1:] or ['audio', 'telas', 'mascote']
    if 'audio' in passos: print(' '.join(f"{w['text']}@{w['start']}" for w in audio()))
    if 'telas' in passos: telas(); print('telas ok')
    if 'mascote' in passos:
        M.garantir_quadros()
        mascote('mascote-entrada', 3.9, 6.9, entrada); mascote('mascote-volta', 18.6, 21.0, volta); print('mascote ok')

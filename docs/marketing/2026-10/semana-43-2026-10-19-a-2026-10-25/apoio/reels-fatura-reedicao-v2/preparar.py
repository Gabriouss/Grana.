"""Reedicao local, sem geracao paga; fontes da montagem Tino preservadas."""
from pathlib import Path
import hashlib
import json
import shutil

SRC = Path('E:/Grana-temporarios/2026-10-24-tino-videos/trabalho')
ROOT = Path(__file__).parent
WORK = ROOT / 'trabalho'
WORK.mkdir(parents=True, exist_ok=True)
for name in ['motor', 'base']:
    shutil.copytree(SRC / name, WORK / name, dirs_exist_ok=True)
for name in ['alinhar.py', 'textos.py']:
    shutil.copy2(SRC / name, WORK / name)
motor = WORK / 'motor/reel.py'
motor.write_text(motor.read_text(encoding='utf8').replace(
    "'-ar', str(SR), '-c:a', 'aac'", "'-ar', str(SR), '-ac', '2', '-c:a', 'aac'"), encoding='utf8')
for folder in ['v2', 'narracoes/brutos/_transcricoes', 'narracoes/palavras']:
    (WORK / folder).mkdir(parents=True, exist_ok=True)
for name in ['v2-take1.mp3', 'v2-take2.mp3']:
    shutil.copy2(SRC / 'narracoes/brutos' / name, WORK / 'narracoes/brutos' / name)
    transcription = name.replace('.mp3', '.json')
    shutil.copy2(SRC / 'narracoes/brutos/_transcricoes' / transcription,
                 WORK / 'narracoes/brutos/_transcricoes' / transcription)
for name in ['analisar_e_editar.py']:
    shutil.copy2(SRC / 'narracoes' / name, WORK / 'narracoes' / name)
shutil.copy2(SRC / 'narracoes/palavras/v2-narracao-final.json', WORK / 'narracoes/palavras/v2-narracao-final.json')

cfg = (SRC / 'v2/config.py').read_text(encoding='utf8')
cfg += '''

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
'''
# The original exits its scene at T(20)-.62; the larger cards retain safe margins.
cfg = cfg.replace('600 + n * 140', '570 + n * 148')
cfg = cfg.replace('height:124px', 'height:132px').replace('top:1180px', 'top:1210px')
cfg = cfg.replace('font-size:37px', 'font-size:36px')
# A steady amount reveal replaces the decorative random financial digits.
cfg = cfg.replace("flap('#ctot .flap', T(16));", "tl.fromTo('#ctot .flap', {clipPath:'inset(0 100% 0 0)'}, {clipPath:'inset(0 0% 0 0)', duration:.38, ease:'power2.out'}, T(16));")
cfg = cfg.replace('opacity: 0, scale: .6, y: 30', 'opacity: 0, scale: .95, y: 30')
(WORK / 'v2/config.py').write_text(cfg, encoding='utf8')

p = WORK / 'motor/cena.template.html'
s = p.read_text(encoding='utf8')
s = s.replace('top:254px', 'top:270px')
s = s.replace("flap('#pill .flap', p.a + .05);", "tl.fromTo('#pill .flap', {clipPath:'inset(0 100% 0 0)'}, {clipPath:'inset(0 0% 0 0)', duration:.38, ease:'power2.out'}, p.a + .05);")
s = s.replace('opacity: 0, scale: .6, y: 40', 'opacity: 0, scale: .94, y: 40')
s = s.replace("tl.to(w, { y: '0%', duration: .5, ease: 'expo.out' }, t0)", "tl.to(w, { y: '0%', duration: .32, ease: 'power3.out' }, t0)")
s = s.replace("tl.fromTo(w, { y: '45%' }, { y: '0%', duration: .4, ease: 'expo.out' }, 0)", "tl.fromTo(w, { y: '12%' }, { y: '0%', duration: .25, ease: 'power3.out' }, 0)")
# Establish every numeric character as the real value, including random seeks.
s = s.replace('const tl = gsap.timeline({ paused: true });',
              'const tl = gsap.timeline({ paused: true });\n  document.querySelectorAll(\'.flap .c\').forEach(el => el.style.transform = \'none\');')
p.write_text(s, encoding='utf8')
sources = [SRC / 'narracoes/brutos/v2-take1.mp3', SRC / 'narracoes/brutos/v2-take2.mp3',
           Path('E:/GranaPonto/docs/marketing/2026-10/semana-43-2026-10-19-a-2026-10-25/para-aprovacao/pecas/reels/Fatura e parcelas.mp4')]
(ROOT / 'fontes.json').write_text(json.dumps([
    {'arquivo': str(p), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in sources
], indent=2,ensure_ascii=False),encoding='utf8')
print('Projeto preparado:', WORK)

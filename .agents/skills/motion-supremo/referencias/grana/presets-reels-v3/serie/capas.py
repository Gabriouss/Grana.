"""Gera as capas 1080x1920 da série a partir de capa.html."""
import sys, pathlib
from playwright.sync_api import sync_playwright
NOMES = {'f': 'Fatura e parcelas - reedicao v3', '1': 'Quanto pode gastar hoje - reedicao v3', '3': 'Metas e cofrinhos - reedicao v3',
         '4': 'Compra por impulso - reedicao v3', '5': 'Comprometimento futuro - reedicao v3'}
out = pathlib.Path(r'E:/Grana-temporarios/reels-fatura-v3/saida/capas'); out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1080, 'height': 1920})
    for n in (sys.argv[1:] or NOMES):
        pg.goto(f'http://127.0.0.1:8765/serie/capa.html?n={n}', wait_until='networkidle'); pg.wait_for_function('window.__ready===true', timeout=30000)
        pg.screenshot(path=str(out / f'{NOMES[n]}-capa.png')); print(n)
        chk = pg.evaluate('''()=>{const o=[];const r=document.createRange();r.selectNodeContents(document.getElementById('tit'));
          const rs=[...r.getClientRects()];const L=Math.min(...rs.map(x=>x.left)),R=Math.max(...rs.map(x=>x.right));if(L<80||R>1000)o.push('titulo '+Math.round(L)+'-'+Math.round(R));
          document.querySelectorAll('.cw, #cards > img').forEach((e,i)=>{const b=e.getBoundingClientRect();if(b.left<40||b.right>1040||b.top<640||b.bottom>1585)o.push('bloco'+i+' '+[b.left,b.top,b.right,b.bottom].map(Math.round))});return o}''')
        print('  ', chk or 'ok')
    b.close()

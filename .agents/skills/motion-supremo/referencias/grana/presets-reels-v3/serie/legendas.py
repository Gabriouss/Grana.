"""Legendas: linha mais larga que a caixa ou a menos de 40 px da borda do quadro."""
import sys
from playwright.sync_api import sync_playwright
JS = r"""(t)=>{window.renderAt(t);const o=[];for(const l of document.querySelectorAll('.cl')){const g=l.parentElement;if(+getComputedStyle(g).opacity<.5)continue;
const ws=[...l.querySelectorAll('.w')];if(!ws.length)continue;const L=Math.min(...ws.map(w=>w.getBoundingClientRect().left)),R=Math.max(...ws.map(w=>w.getBoundingClientRect().right));
if(L<40||R>1040)o.push([g.id,l.textContent.trim().slice(0,30),Math.round(L),Math.round(R)])}return o}"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1080, 'height': 1920})
    pg.goto('http://127.0.0.1:8765/serie/v.html?n=' + sys.argv[1], wait_until='networkidle'); pg.wait_for_function('window.__ready===true')
    seen = {}
    for k in range(0, int(float(pg.evaluate('window.DUR')) * 10)):
        for it in pg.evaluate(JS, k / 10): seen.setdefault(tuple(it[:2]), []).append((k / 10, it[2], it[3]))
    for k, v in seen.items(): print(k, v[0], v[-1], len(v))
    print('itens', len(seen)); b.close()

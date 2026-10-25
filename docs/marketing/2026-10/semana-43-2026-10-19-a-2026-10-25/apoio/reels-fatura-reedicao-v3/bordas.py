"""Confere cards e textos saindo do quadro 1080x1920 (com margem de 24 px nas laterais)."""
from playwright.sync_api import sync_playwright
JS=r"""(t)=>{window.renderAt(t);const o=[];const vis=e=>{let v=1;for(let x=e;x&&x!==document.body;x=x.parentElement){v*=+getComputedStyle(x).opacity}return v};
for(const c of document.querySelectorAll('#badge,#venc,#tchip,#hcard,#cloud .card,.cg,#btn,#logo,#tag')){if(vis(c)<.6)continue;const r=c.getBoundingClientRect();if(r.width<5)continue;
 if(r.left<24||r.right>1056)o.push([c.id||'card',Math.round(r.left),Math.round(r.right)])}return o}"""
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1080,'height':1920})
    pg.goto('http://127.0.0.1:8765/projeto/index.html',wait_until='networkidle');pg.wait_for_function('window.__ready===true')
    s={}
    for k in range(198):
        for it in pg.evaluate(JS,k/10):s.setdefault(it[0],[]).append((k/10,it[1],it[2]))
    for k,v in s.items():print(k,v[0],v[-1],len(v))
    b.close()

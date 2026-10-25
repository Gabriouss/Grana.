"""Varre a cena: texto saindo do card e textos se sobrepondo dentro do mesmo card."""
from playwright.sync_api import sync_playwright
JS = r"""(t)=>{window.renderAt(t);const out=[];
const vis=e=>{let o=1;for(let x=e;x&&x!==document.body;x=x.parentElement){const s=getComputedStyle(x);o*=+s.opacity;if(s.visibility==='hidden'||s.display==='none')return 0}return o};
const leaves=c=>[...c.querySelectorAll('*')].filter(e=>e.childElementCount===0&&e.textContent.trim()&&!e.classList.contains('bx'));
for(const c of document.querySelectorAll('.card,.box,.ccard,#hLivre')){
 if(vis(c)<.35)continue;const R=c.getBoundingClientRect();if(R.width<5)continue;
 const L=leaves(c).map(e=>[e,e.getBoundingClientRect()]).filter(([e,r])=>r.width>0);
 const id=c.id||c.className;
 for(const [e,r] of L){if(r.right>R.right+3||r.left<R.left-3||r.bottom>R.bottom+3||r.top<R.top-3)out.push(['FORA',id,e.textContent.trim().slice(0,24)])}
 for(let i=0;i<L.length;i++)for(let j=i+1;j<L.length;j++){const a=L[i][1],b=L[j][1];const ox=Math.min(a.right,b.right)-Math.max(a.left,b.left),oy=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
  if(ox>4&&oy>4&&!L[i][0].contains(L[j][0])&&!L[j][0].contains(L[i][0])&&L[i][0].parentElement!==L[j][0].parentElement)out.push(['SOBRE',id,L[i][0].textContent.trim().slice(0,18)+' x '+L[j][0].textContent.trim().slice(0,18)])}}
return out}"""
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1080,'height':1920})
    pg.goto('http://127.0.0.1:8765/projeto/index.html',wait_until='networkidle');pg.wait_for_function('window.__ready===true')
    seen={}
    for k in range(0,198):
        t=k/10
        for item in pg.evaluate(JS,t):
            key=tuple(item);seen.setdefault(key,[]).append(t)
    for k,v in seen.items():print(k,f'{v[0]:.1f}-{v[-1]:.1f}s',len(v))
    print('itens',len(seen));b.close()

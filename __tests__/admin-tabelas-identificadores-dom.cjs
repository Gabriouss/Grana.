'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const ROOT=path.resolve(__dirname,'..'),WEB=path.join(ROOT,'tools/admin-local/web');
function playwright(){const cache=path.join(process.env.LOCALAPPDATA||'','npm-cache/_npx');
 for(const p of [ROOT,process.env.PLAYWRIGHT_DIR,...(fs.existsSync(cache)?fs.readdirSync(cache).map(d=>path.join(cache,d,'node_modules')):[])].filter(Boolean))try{return createRequire(path.join(p,'x.js'))('playwright');}catch{}
 throw Error('Playwright local necessário');}
const sandbox={Date,URLSearchParams};
vm.runInNewContext(fs.readFileSync(path.join(WEB,'simulado.js'),'utf8').replace(/^export /gm,'')+';globalThis.sim=SIMULADO;',sandbox);
const TAG='v2026.10.21-canary-recuperacao-canal-estavel',SLUG='admin_publicacoes_recuperacao_resultado_idempotente';
(async()=>{const browser=await playwright().chromium.launch({headless:true});let checks=0;
try{for(const width of [390,1440])for(const route of ['github','supabase','vercel','marketing/resultados']){
 const page=await browser.newPage({viewport:{width,height:960},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async r=>{const req=r.request(),u=new URL(req.url()),p=u.pathname;
  assert.equal(u.origin,'http://127.0.0.1:4398');assert.equal(req.method(),'GET');
  if(!p.startsWith('/api/')){const f=path.join(p.startsWith('/design-system/')?ROOT:WEB,p==='/'?'index.html':p);return fs.existsSync(f)&&fs.statSync(f).isFile()?r.fulfill({path:f}):r.fulfill({status:404});}
  let b;
  if(p==='/api/saude')b={ok:true,dados:{painel:'grana-admin'}};
  else if(p==='/api/sessao')b={ok:true,dados:{etapa:'ok',restanteSeg:3600,csrfToken:'fixture-local'}};
  else if(p==='/api/marketing/notificacoes')b={ok:true,dados:{status:'indisponivel',naoLidas:null}};
  else if(p==='/api/github/releases')b={ok:true,dados:{releases:[{tag:TAG,nome:'Release de regressão com dados sintéticos',publicadoEm:new Date().toISOString(),url:null,assets:[]}]}};
  else if(sandbox.sim.temLeitura(p)){b=await sandbox.sim.ler(p);if(p==='/api/supabase/funcoes')for(const f of b.dados.funcoes||b.dados.itens||[]){f.slug=SLUG;f.producaoMaisNova=false;f.ultimoCommitLocal={hash:'0000001',data:new Date().toISOString()};}}
  else b={ok:true,dados:null};
  return r.fulfill({contentType:'application/json',body:JSON.stringify(b)});
 });
 await page.goto('http://127.0.0.1:4398/#/'+route);await page.locator('#tela .tabela').first().waitFor({state:'attached'});await page.waitForLoadState('networkidle');
 await page.evaluate(()=>{for(const d of document.querySelectorAll('#tela details'))if(d.querySelector('.tabela'))d.open=true;});
 if(route==='github'||route==='supabase'){
  const value=route==='github'?TAG:SLUG;
  const cell=page.getByRole('cell',{name:value,exact:true}).first();
  const m=await cell.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const s=getComputedStyle(el);return {lines:range.getClientRects().length,font:parseFloat(s.fontSize),text:el.textContent};});
  assert.equal(m.lines,1,`${route}/${width}: identificador inteiro sem fragmentação`);assert.equal(m.text,value);checks+=2;
 }
 const regions=page.locator('#tela .tabela-rolagem');
 for(let i=0;i<await regions.count();i++){
  const region=regions.nth(i);
  const m=await region.evaluate(el=>({overflow:el.scrollWidth>el.clientWidth+1,tab:el.tabIndex,name:el.getAttribute('aria-label'),role:el.getAttribute('role'),font:parseFloat(getComputedStyle(el.querySelector('td')).fontSize)}));
  assert.ok(m.font>=14,`${route}/${width}: fonte preservada`);assert.ok(m.tab===0&&m.name&&m.role==='region');checks+=2;
  if(m.overflow){assert.ok(await region.locator('.tabela-rolagem-ajuda').isVisible(),`${route}/${width}: indicação de rolagem perceptível`);checks++;
   await region.focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>[...document.querySelectorAll('.tabela-rolagem')].some(el=>el===document.activeElement&&el.scrollLeft>0));checks++;
  }
 }
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${route}/${width}: sem overflow da página`);checks++;
 assert.deepEqual(errors,[]);await page.close();
}console.log(`admin-tabelas-identificadores-dom: ${checks} checks, quatro rotas390/1440 OK`);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

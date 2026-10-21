'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const ROOT=path.resolve(__dirname,'..'),WEB=path.join(ROOT,'tools/admin-local/web');
function playwright(){const cache=path.join(process.env.LOCALAPPDATA||'','npm-cache/_npx');for(const p of [ROOT,process.env.PLAYWRIGHT_DIR,...(fs.existsSync(cache)?fs.readdirSync(cache).map(d=>path.join(cache,d,'node_modules')):[])].filter(Boolean))try{return createRequire(path.join(p,'x.js'))('playwright');}catch{}throw Error('Playwright local necessário');}
const PECAS=[{id:'a'.repeat(16),versao:'b'.repeat(40),titulo:'Capa Pix fixture',tipo:'imagem',capaOrfa:true},
 {id:'c'.repeat(16),versao:'d'.repeat(40),titulo:'Imagem com nome capa fixture',tipo:'imagem',capaOrfa:false},
 {id:'e'.repeat(16),versao:'f'.repeat(40),titulo:'Reel completo fixture',tipo:'video',capaOrfa:false}].map(p=>({...p,aprovada:true,arquivos:[],aceite:{versao:p.versao}}));
(async()=>{const browser=await playwright().chromium.launch({headless:true});let checks=0;
try{for(const width of [390,1440]){const page=await browser.newPage({viewport:{width,height:960},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const req=r.request(),u=new URL(req.url()),p=u.pathname;assert.equal(u.origin,'http://127.0.0.1:4395');assert.equal(req.method(),'GET','não escreve aceite, vínculo, agenda ou Meta');
  if(!p.startsWith('/api/')){const f=path.join(p.startsWith('/design-system/')?ROOT:WEB,p==='/'?'index.html':p);return fs.existsSync(f)&&fs.statSync(f).isFile()?r.fulfill({path:f}):r.fulfill({status:404});}
  let d=null;
  if(p==='/api/saude')d={painel:'grana-admin'};
  else if(p==='/api/sessao')d={etapa:'ok',restanteSeg:3600,csrfToken:'fixture-local'};
  else if(p.endsWith('/notificacoes'))d={status:'indisponivel',naoLidas:null};
  else if(p==='/api/marketing/calendario')d={itens:[],aprovadosSemData:PECAS,reais:{status:'disponivel',completo:true,itens:[]}};
  else if(p.endsWith('/meta-publicados'))d={status:'ok',completo:true,posts:[],redes:{instagram:{status:'disponivel',completo:true},facebook:{status:'disponivel',completo:true}}};
  else if(p.endsWith('/capacidades'))d={contractVersion:'e5.real.v1',modo:'real',contas:[],controles:{revisao:1,habilitado:false,pausaGlobal:false,pausaInstagram:false,pausaFacebook:false}};
  else if(p.endsWith('/catalogo')||p.endsWith('/feed'))d={pecas:[]};
  return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,dados:d})});
 });
 await page.goto('http://127.0.0.1:4395/#/marketing/calendario?mes=2026-11');await page.locator('.cal-sem-cartao').first().waitFor();await page.waitForLoadState('networkidle');
 const orphan=page.locator('.cal-sem-cartao').filter({hasText:'Capa Pix fixture'}).locator('.cal-item-canal');
 assert.equal(await orphan.innerText(),'Capa sem vídeo vinculado nesta versão',`${width}: bandeja explica a capa antes de abrir`);checks++;
 const m=await orphan.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.cal-item').getBoundingClientRect();return {h:a.height,bottom:a.bottom,card:b.bottom};});
 assert.ok(m.h>0&&m.bottom<=m.card+1,`${width}: rótulo inteiro dentro do cartão`);checks++;
 assert.equal(await page.locator('.cal-sem-cartao').filter({hasText:'Imagem com nome capa fixture'}).locator('.cal-item-canal').innerText(),'Imagem','não infere vínculo pelo nome');checks++;
 assert.equal(await page.locator('.cal-sem-cartao').filter({hasText:'Reel completo fixture'}).locator('.cal-item-canal').innerText(),'Video','rótulo existente do Reel completo preservado');checks++;
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks++;
 assert.deepEqual(errors,[]);await page.close();
}console.log(`admin-calendario-capa-sem-video-dom: ${checks} checks, capa/imagem/Reel390/1440, zero POST OK`);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

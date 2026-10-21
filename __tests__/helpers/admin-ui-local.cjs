'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const {createRequire}=require('node:module');
const ROOT=path.resolve(__dirname,'../..'),WEB=path.join(ROOT,'tools/admin-local/web');
function playwright(){const cache=path.join(process.env.LOCALAPPDATA||'','npm-cache/_npx');for(const p of [ROOT,process.env.PLAYWRIGHT_DIR,...(fs.existsSync(cache)?fs.readdirSync(cache).map(d=>path.join(cache,d,'node_modules')):[])].filter(Boolean))try{return createRequire(path.join(p,'x.js'))('playwright');}catch{}throw Error('Playwright local necessário');}
function png(w,h){const chunk=(t,d)=>{const n=Buffer.alloc(4);n.writeUInt32BE(d.length);const b=Buffer.concat([Buffer.from(t),d]),c=Buffer.alloc(4);c.writeUInt32BE(zlib.crc32(b));return Buffer.concat([n,b,c]);};const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;const line=Buffer.alloc(w+1,128);line[0]=0;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(Buffer.concat(Array.from({length:h},()=>line)))),chunk('IEND',Buffer.alloc(0))]);}
async function pagina(browser,{width=390,dados={},semCss=false,video=null}={}){
 const page=await browser.newPage({viewport:{width,height:960},reducedMotion:'reduce'}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const req=route.request(),u=new URL(req.url()),p=u.pathname;
  assert.equal(u.origin,'http://127.0.0.1:4394');assert.equal(req.method(),'GET','fixture somente leitura');requests.push(p);
  if(p==='/estilo.css'&&semCss)return route.fulfill({status:404});
  if(p.startsWith('/qa/')&&p.endsWith('.png'))return route.fulfill({contentType:'image/png',body:png(p.includes('3x4')?300:240,p.includes('3x4')?400:300)});
  if(p.startsWith('/qa/')&&p.endsWith('.mp4'))return video?route.fulfill({contentType:'video/webm',body:video}):route.fulfill({status:204});
  if(!p.startsWith('/api/')){const f=path.join(p.startsWith('/design-system/')?ROOT:WEB,p==='/'?'index.html':p);return fs.existsSync(f)&&fs.statSync(f).isFile()?route.fulfill({path:f}):route.fulfill({status:404});}
  let d=dados[p]??null;
  if(p==='/api/saude')d={painel:'grana-admin'};
  if(p==='/api/sessao')d={etapa:'ok',restanteSeg:3600,csrfToken:'fixture-local'};
  if(p.endsWith('/notificacoes'))d={status:'indisponivel',naoLidas:null};
  return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,dados:d})});
 });
 return {page,errors,requests};
}
module.exports={playwright,pagina};

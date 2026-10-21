'use strict';
const assert=require('node:assert/strict');
const {playwright,pagina}=require('./helpers/admin-ui-local.cjs');
const PECA={id:'a'.repeat(16),versao:'b'.repeat(40),nomeExibicao:'Vídeo com capa da versão',tipo:'video',estado:'aprovados',aprovada:true,
 arquivos:[{url:'/qa/video.mp4',tipo:'video'}],capa:{url:'/qa/capa.png',tipo:'imagem'},legenda:'Legenda aprovada'};
(async()=>{const browser=await playwright().chromium.launch({headless:true});let checks=0;
try{
 const recorder=await browser.newPage();
 const video=Buffer.from(await recorder.evaluate(async()=>{const c=document.createElement('canvas');c.width=96;c.height=128;const g=c.getContext('2d');g.fillRect(0,0,96,128);const stream=c.captureStream(10),r=new MediaRecorder(stream,{mimeType:'video/webm'}),parts=[];r.ondataavailable=e=>parts.push(e.data);const done=new Promise(ok=>r.onstop=ok);let i=0;const timer=setInterval(()=>{g.fillStyle=i++%2?'red':'blue';g.fillRect(0,0,96,128);},50);r.start();await new Promise(ok=>setTimeout(ok,450));r.stop();await done;clearInterval(timer);stream.getTracks().forEach(t=>t.stop());return [...new Uint8Array(await new Blob(parts).arrayBuffer())];}));
 await recorder.close();
 for(const width of [390,1440]){
  const orphan={...PECA,id:'c'.repeat(16),versao:'d'.repeat(40),nomeExibicao:'Vídeo sem capa da versão',capa:null};
  const {page,errors}=await pagina(browser,{width,video,dados:{'/api/marketing/pecas':{pecas:[PECA,orphan]},'/api/marketing/feed':{pecas:[PECA]},'/api/marketing/feed-real':{status:'disponivel',perfil:{usuario:'grana'},posts:[],vinculadas:[]}}});
  await page.goto('http://127.0.0.1:4394/#/marketing/acervo');await page.locator('.peca video').first().waitFor();
  const card=page.locator('.peca').filter({hasText:PECA.nomeExibicao}),player=card.locator('video');await player.scrollIntoViewIfNeeded();
  assert.equal(await player.getAttribute('poster'),'/qa/capa.png',`${width}: Acervo conserva capa explícita da mesma versão`);checks++;
  await page.waitForFunction(()=>document.querySelector('.peca video')?.readyState>=2);
  assert.ok(await player.evaluate(v=>v.paused&&v.videoWidth>0));checks++;
  const sem=page.locator('.peca').filter({hasText:orphan.nomeExibicao});
  assert.equal(await sem.locator('video').getAttribute('poster'),null);checks++;
  assert.match(await sem.innerText(),/sem capa vinculada nesta versão/i);checks++;
  await page.goto('http://127.0.0.1:4394/#/marketing/feed');await page.locator('.feed-proximas-grade .feed-celula').first().click();
  assert.equal(await page.locator('dialog[open] video').getAttribute('poster'),'/qa/capa.png','Feed e Acervo recebem o mesmo vínculo explícito');checks++;
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log(`admin-acervo-capa-video-dom: ${checks} checks, capa/sem vínculo/Feed390/1440 OK`);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

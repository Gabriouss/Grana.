'use strict';
const assert=require('node:assert/strict');
const {playwright,pagina}=require('./helpers/admin-ui-local.cjs');
const PECAS=[{id:'a'.repeat(16),versao:'b'.repeat(40),nomeExibicao:'A carrossel fixture',tipo:'carrossel',aprovada:true,arquivos:[{url:'/qa/3x4.png'},{url:'/qa/4x5.png'},{url:'/qa/terceiro.png'}]},
 {id:'c'.repeat(16),versao:'d'.repeat(40),nomeExibicao:'B imagem fixture',tipo:'imagem',aprovada:true,arquivos:[{url:'/qa/unica.png'}]}];
(async()=>{const browser=await playwright().chromium.launch({headless:true});let checks=0;
try{for(const width of [390,1440]){
 const {page,errors}=await pagina(browser,{width,dados:{'/api/marketing/feed':{pecas:PECAS},'/api/marketing/feed-real':{status:'disponivel',perfil:{usuario:'grana'},posts:[],vinculadas:[]}}});
 await page.goto('http://127.0.0.1:4394/#/marketing/feed');await page.locator('.feed-proximas-grade .feed-celula').first().click();
 const dialog=page.locator('dialog[open]');
 assert.equal(await dialog.locator('.feed-contador-slide').innerText(),'Slide 1 de 3',`${width}: identifica contador interno`);checks++;
 assert.equal(await dialog.locator('.feed-post-meta .fraco.num').innerText(),'Peça 1 de 2',`${width}: identifica sequência de peças`);checks++;
 assert.equal(await dialog.locator('.feed-slide').first().getAttribute('aria-label'),'Slide 1 de 3');checks++;
 const next=dialog.getByRole('button',{name:'Próximo slide',exact:true});await next.click();
 await page.waitForFunction(()=>document.querySelector('dialog[open] .feed-contador-slide')?.textContent==='Slide 2 de 3');checks++;
 const box=await next.boundingBox();assert.ok(box.width>=44&&box.height>=44);checks++;
 await dialog.getByRole('button',{name:'Próxima publicação',exact:true}).click();
 assert.equal(await page.locator('dialog[open] .feed-post-meta .fraco.num').innerText(),'Peça 2 de 2');checks++;
 assert.equal(await page.locator('dialog[open] .feed-contador-slide').count(),0,'mídia única não ganha coleção inventada');checks++;
 assert.deepEqual(errors,[]);await page.close();
}console.log(`admin-feed-contadores-dom: ${checks} checks, peça/slide/navegação390/1440 OK`);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

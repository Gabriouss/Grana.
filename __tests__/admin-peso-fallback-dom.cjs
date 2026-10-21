'use strict';
const assert=require('node:assert/strict');
const {playwright,pagina}=require('./helpers/admin-ui-local.cjs');
(async()=>{const browser=await playwright().chromium.launch({headless:true});let checks=0;
try{for(const width of [390,1440])for(const semCss of [false,true]){
 const {page}=await pagina(browser,{width,semCss});
 await page.goto('http://127.0.0.1:4394/#/marketing/feedbacks');await page.waitForLoadState('networkidle');
 const m=await page.evaluate(()=>{const s=getComputedStyle(document.body),b=document.querySelector('button');return {peso:s.fontWeight,fonte:s.fontFamily,sintese:s.fontSynthesis,botao:getComputedStyle(b).fontWeight};});
 assert.equal(m.peso,semCss?'300':'400',`${width}: fallback só governa sem folha`);checks++;
 assert.ok(/Neue Machina/.test(m.fonte));checks++;
 if(!semCss){assert.equal(m.botao,'400');assert.equal(m.sintese,'none');checks+=2;}
 await page.close();
}console.log(`admin-peso-fallback-dom: ${checks} checks, folha/fallback390/1440 OK`);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

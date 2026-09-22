const fs=require('fs'),path=require('path');
const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
process.loadEnvFile();
const out=path.resolve('docs/marketing/funil-criativos-flat-2026-09/revisao-04/telas');
async function visibleText(page){return page.evaluate(()=>{
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),texts=[];
 while(walker.nextNode()){const n=walker.currentNode,e=n.parentElement,r=e.getBoundingClientRect();
 if(r.width&&r.height&&r.top<innerHeight&&r.bottom>0&&r.left<innerWidth&&r.right>0){
 const top=document.elementFromPoint(Math.min(innerWidth-1,Math.max(0,r.left+r.width/2)),Math.min(innerHeight-1,Math.max(0,r.top+r.height/2)));
 if(top&&(e===top||e.contains(top)))texts.push(n.textContent);
 }}return texts.join(' ');
});}
async function clean(page){
 await page.evaluate(()=>{
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  for(const n of nodes){
   if(/^(Bom dia|Boa tarde|Boa noite),/.test(n.textContent.trim()))n.textContent=n.textContent.replace(/^(Bom dia|Boa tarde|Boa noite),.*$/,'$1');
   if(n.textContent.trim()==='exemplo')n.parentElement.style.display='none';
  }
 });
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1024},deviceScaleFactor:2.5});
 const page=await context.newPage();
 await page.goto('http://127.0.0.1:8083',{timeout:120000});
 await page.getByRole('link',{name:'Entrar',exact:true}).first().click();
 await page.getByRole('textbox',{name:'E-mail',exact:true}).fill(process.env.E2E_TEST_EMAIL);
 await page.getByRole('textbox',{name:'Senha',exact:true}).fill(process.env.E2E_TEST_PASSWORD);
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByRole('link',{name:'Perfil',exact:true}).waitFor({timeout:60000});
 await page.getByRole('link',{name:'Perfil',exact:true}).click();
 const toggle=page.getByRole('switch',{name:'Dados de exemplo',exact:true});
 if(await toggle.getAttribute('aria-checked')!=='true')await toggle.click();
 const origin=await page.evaluate(()=>performance.timeOrigin);
 for(const [name,label,expected] of [['credito','Crédito','Nubank Ultravioleta'],['contas','Boletos','Energia']]){
  await page.getByRole('link',{name:label,exact:true}).click();
  await page.waitForTimeout(1800);
  const close=page.getByRole('button',{name:'Fechar',exact:true});
  if(await close.isVisible())await close.click();
  await page.evaluate(()=>document.fonts.ready);
  if(await page.evaluate(()=>performance.timeOrigin)!==origin)throw Error('Navegacao recarregou');
  const text=await visibleText(page);
  if(text.includes('AUDIT ')||!text.toLowerCase().includes(expected.toLowerCase())){console.log({name,audit:text.includes('AUDIT '),expected:text.toLowerCase().includes(expected.toLowerCase())});await page.screenshot({path:'E:/Grana-temporarios/prints/captura-diagnostico.png'});throw Error('Dados invalidos: '+name);}
  await clean(page);
  await page.screenshot({path:path.join(out,name+'-web.png')});
  console.log(name+' web: exemplo validado');
 }
 await page.setViewportSize({width:432,height:960});
 for(const [name,label] of [['lancamentos','Débito e Pix'],['inicio','Início']]){
  await page.getByRole('tab',{name:label,exact:true}).click();
  await page.waitForTimeout(1800);
  await clean(page);
  if((await visibleText(page)).includes('AUDIT '))throw Error('Auditoria na captura');
  await page.screenshot({path:path.join(out,name+'-mobile.png')});
  console.log(name+' mobile: exemplo validado');
 }
 }finally{await browser.close();}
})().catch(e=>{let message=String(e.message);for(const key of ['E2E_TEST_EMAIL','E2E_TEST_PASSWORD'])if(process.env[key])message=message.split(process.env[key]).join('[redacted]');console.error(message);process.exitCode=1;});

const fs=require('fs'),path=require('path');
const root=process.cwd(),out=path.join(root,'docs/marketing/funil-criativos-flat-2026-09/revisao-02');
const runtime='C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/';
const {chromium}=require(runtime+'playwright');
const sharp=require(runtime+'sharp');
const data=(p,m)=>'data:'+m+';base64,'+fs.readFileSync(path.join(root,p)).toString('base64');
const logo=data('design-system/marca/logotipo-gradiente.svg','image/svg+xml');
const font=data('assets/fonts/NeueMachina-Regular.otf','font/otf');
const mark=data('design-system/marca/simbolo-menta-sem-ponto.svg','image/svg+xml');
const web=data('public/telas/inicio-web.png','image/png');
const items=[
['S1','Controle sem<br>parar sua vida.','Seu dinheiro organizado.<br>No celular e no computador.','inicio-mobile.png'],
['S2','Três jeitos de<br>lançar um gasto.','Fale o gasto. Cole o Pix.<br>Leia o QR Code da nota.','lancamentos-mobile.png'],
['S3','Livre para Gastar.<br>Clareza para hoje.','Consulte o valor no app<br>ou na versão web.','inicio-mobile.png'],
['S4','Do gasto lançado<br>ao mês mais claro.','Registre. Acompanhe os compromissos.<br>Decida com mais clareza.','contas-mobile.png']];
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,channel:'msedge'});
for(const [id,h1,h2,screen] of items)for(const story of [false,true]){
const height=story?1920:1440;
const mobile=data('public/telas/'+screen,'image/png');
const meta=await sharp(path.join(root,'public/telas/'+screen)).metadata();
const mw=story?365:326,mh=mw*meta.height/meta.width;
const html='<!doctype html><meta charset="utf-8"><style>'+
'@font-face{font-family:Neue;src:url('+font+')}*{box-sizing:border-box}body{margin:0;width:1080px;height:'+height+'px;background:#052229;color:#effffa;font-family:Neue;overflow:hidden}'+
'.logo{position:absolute;left:64px;top:'+(story?200:60)+'px;width:230px}.bg{position:absolute;width:760px;right:-200px;top:420px;opacity:.045}'+
'.product{position:absolute;left:0;top:'+(story?440:240)+'px;width:1080px;height:900px}'+
'.laptop{position:absolute;left:60px;top:135px;width:720px}.display{padding:12px;background:#0b2d35;border:2px solid #7fa9a0;border-radius:20px 20px 5px 5px}.display img{display:block;width:100%;height:auto;border-radius:8px}.base{height:23px;background:#7fa9a0;border-radius:2px 2px 30px 30px;margin:0 -28px}.phone{position:absolute;right:54px;top:0;width:'+(mw+20)+'px;padding:10px;border:2px solid #a6d9ce;background:#0b2d35;border-radius:36px}.phone img{display:block;width:100%;height:auto;border-radius:24px}'+
'.copy{position:absolute;left:64px;right:64px;top:'+(story?1370:1050)+'px}h1{margin:0;font-size:58px;line-height:1.12;font-weight:400;letter-spacing:-2px}p{font-size:27px;line-height:1.45;color:#a6d9ce;margin:26px 0 0}.caption{position:absolute;left:64px;bottom:'+(story?220:50)+'px;font-size:18px;color:#7fa9a0}'+
'</style><img class="logo" src="'+logo+'"><img class="bg" src="'+mark+'"><div class="product"><div class="laptop"><div class="display"><img src="'+web+'"></div><div class="base"></div></div><div class="phone"><img src="'+mobile+'"></div></div><div class="copy"><h1>'+h1+'</h1><p>'+h2+'</p></div><div class="caption">Grana. · Mobile + Web</div>';
const name=id+'-'+(story?'story':'feed');fs.writeFileSync(path.join(out,name+'.html'),html);
const page=await browser.newPage({viewport:{width:1080,height},deviceScaleFactor:1});
await page.setContent(html);await page.evaluate(()=>document.fonts.ready);await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
await page.screenshot({path:path.join(out,name+'.png')});
const bad=await page.evaluate(()=>{const p=document.querySelector('.phone').getBoundingClientRect(),c=document.querySelector('.copy').getBoundingClientRect();return p.bottom>c.top-20});if(bad)throw Error(name+' overlaps');
await page.close();console.log(name+' verified '+1080+'x'+height);}
await browser.close();
await sharp({create:{width:1080,height:360,channels:3,background:'#052229'}}).composite(await Promise.all(items.map(async([id],i)=>({input:await sharp(path.join(out,id+'-feed.png')).resize(270,360).toBuffer(),left:i*270,top:0})))).png().toFile(path.join(out,'previa-feed.png'));
})();

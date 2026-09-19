const fs=require('fs'),path=require('path');
const runtime=process.env.GRANA_NODE_MODULES||'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/';
const {chromium}=require(runtime+'playwright'),sharp=require(runtime+'sharp');
const out=path.resolve('docs/marketing/funil-criativos-flat-2026-09/revisao-03'),asset=path.join(out,'assets');
const uri=(p,m)=>'data:'+m+';base64,'+fs.readFileSync(p).toString('base64');
async function assets(){
 fs.mkdirSync(asset,{recursive:true});
 let src=fs.readFileSync('scripts/compor-mockup-multiplataforma.mjs','utf8');
 src=src.replace('createRequire(import.meta.url)', 'createRequire('+JSON.stringify(path.resolve('package.json'))+')');
 const end=src.indexOf('  /* 3. Composição:');
 if(end<0)throw Error('Fonte da landing mudou: rever extração.');
 src=src.slice(0,end)+"for(const [name,img] of [['notebook',notebook],['celular',celular]]){const p=new PNG({width:img.w,height:img.h});img.d.copy(p.data);writeFileSync("+JSON.stringify(asset)+"+'/'+name+'.png',PNG.sync.write(p));}}finally{rmSync(tmp,{recursive:true,force:true});}";
 await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
 for(const name of ['notebook','celular']){
 const buf=await sharp(path.join(asset,name+'.png')).trim({background:'#00000000'}).png().toBuffer();
 fs.writeFileSync(path.join(asset,name+'.png'),buf);
 }
}
(async()=>{
 await assets();
 const logo=uri('design-system/marca/logotipo-gradiente.svg','image/svg+xml');
 const mark=uri('design-system/marca/simbolo-menta-sem-ponto.svg','image/svg+xml');
 const font=uri('assets/fonts/NeueMachina-Regular.otf','font/otf');
 const phone=uri(path.join(asset,'celular.png'),'image/png'),laptop=uri(path.join(asset,'notebook.png'),'image/png');
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const results=[];
 for(let n=1;n<=4;n++)for(const story of [false,true]){
 const H=story?1920:1440,top=story?210:64;
 const header='<img class="logo" src="'+logo+'" style="top:'+top+'px"><span class="edition" style="top:'+(top+18)+'px">'+(n%2?'NO CELULAR':'NA VERSÃO WEB')+'</span>';
 let art='',extra='';
 const pic=(src,style)=>'<img class="device" src="'+src+'" style="'+style+'">';
 const copy=(h,p,style)=>'<div class="copy" style="'+style+'"><h1>'+h+'</h1><p>'+p+'</p></div>';
 if(n===1){
 art=pic(phone,'left:52px;top:'+(story?450:260)+'px;width:440px;transform:rotate(-5deg)')+
 copy('Controle<br>sem parar<br>sua vida.','Acompanhe seu dinheiro<br>onde o dia acontecer.','left:550px;top:'+(story?780:570)+'px;width:470px');
 extra='<div class="slab" style="left:0;top:'+(story?530:340)+'px;width:490px;height:820px;background:#0b2d35;border-radius:0 180px 180px 0"></div>';
 }
 if(n===2){
 art=copy('Seu mês.<br>Na tela grande.','Receitas, despesas e compromissos.<br>Uma visão do conjunto.','left:72px;top:'+(story?355:200)+'px;width:930px')+
 pic(laptop,'left:24px;top:'+(story?760:620)+'px;width:1032px;transform:rotate(-3deg)');
 extra='<div class="slab" style="left:0;top:'+(story?840:700)+'px;width:1080px;height:650px;background:#0b2d35;transform:skewY(-8deg)"></div>';
 }
 if(n===3){
 art=copy('Livre para<br>Gastar.','Mais clareza para decidir<br>o próximo gasto.','left:72px;top:'+(story?380:200)+'px;width:430px')+
 pic(phone,'left:566px;top:'+(story?700:470)+'px;width:416px;transform:rotate(6deg)')+
 '<div class="side-note" style="left:72px;top:'+(story?1180:945)+'px">O número<br>que importa<br><span>hoje.</span></div>';
 extra='<div class="slab" style="left:580px;top:'+(story?770:550)+'px;width:500px;height:1000px;background:#aeffe3;border-radius:220px 0 0 0"></div>';
 }
 if(n===4){
 art=pic(laptop,'left:30px;top:'+(story?420:235)+'px;width:1010px')+
 copy('Do gasto lançado<br>ao mês mais claro.','Organize os compromissos.<br>Enxergue o mês pela versão web.','left:72px;top:'+(story?1320:1050)+'px;width:940px');
 extra='<img class="symbol" src="'+mark+'" style="left:-100px;top:'+(story?650:340)+'px;width:820px;opacity:.065">';
 }
 const html='<!doctype html><meta charset="utf-8"><style>@font-face{font-family:Neue;src:url('+font+')}*{box-sizing:border-box}body{margin:0;width:1080px;height:'+H+'px;overflow:hidden;background:#052229;color:#effffa;font-family:Neue}.logo{position:absolute;left:72px;width:240px;z-index:3}.edition{position:absolute;right:72px;font-size:18px;letter-spacing:2px;color:#a6d9ce;z-index:3}.device{position:absolute;height:auto;z-index:2;filter:drop-shadow(0 24px 25px rgba(0,0,0,.24))}.copy{position:absolute;z-index:3}h1{font-size:66px;line-height:1.1;font-weight:400;letter-spacing:-2.5px;margin:0}p{font-size:26px;line-height:1.5;color:#a6d9ce;margin:28px 0 0}.slab,.symbol{position:absolute;z-index:0}.side-note{position:absolute;font-size:35px;line-height:1.3;color:#a6d9ce}.side-note span{color:#aeffe3}</style>'+extra+header+art;
 const name='S'+n+'-'+(story?'story':'feed');
 fs.writeFileSync(path.join(out,name+'.html'),html);
 const page=await browser.newPage({viewport:{width:1080,height:H},deviceScaleFactor:1});
 await page.setContent(html);await page.evaluate(()=>document.fonts.ready);
 await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
 const qa=await page.evaluate(()=>{
 const d=document.querySelector('.device').getBoundingClientRect(),c=document.querySelector('.copy').getBoundingClientRect();
 return {font:document.fonts.check('26px Neue'),overlap:d.left<c.right&&d.right>c.left&&d.top<c.bottom&&d.bottom>c.top,copyInside:c.right<=1080&&c.bottom<=innerHeight};
 });
 if(!qa.font||qa.overlap||!qa.copyInside)throw Error(name+JSON.stringify(qa));
 await page.screenshot({path:path.join(out,name+'.png')});
 results.push({name,...qa,width:1080,height:H});
 await page.close();console.log(name+' OK');
 }
 await browser.close();
 for(const kind of ['feed','story']){
 const h=kind==='feed'?720:960;
 await sharp({create:{width:2160,height:h,channels:3,background:'#052229'}}).composite(await Promise.all([1,2,3,4].map(async(n)=>({input:await sharp(path.join(out,'S'+n+'-'+kind+'.png')).resize(540,h).toBuffer(),left:(n-1)*540,top:0})))).png().toFile(path.join(out,'previa-'+kind+'.png'));
 }
 fs.writeFileSync(path.join(out,'verificacao.json'),JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exit(1)});

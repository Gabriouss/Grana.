'use strict';
// Custodia privada da fila: nunca altera os originais nem depende de checkout.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const c=require('./catalogo.cjs');
const SHA=/^[a-f0-9]{64}$/,V=/^[a-f0-9]{40}$/,ID=/^[a-f0-9]{16}$/;
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const CAMPOS=['tipo','pedidoId','pecaId','caminho','versaoAnterior','versaoCorrigida','anteriorSha256','atualSha256','reciboSha256'];
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const sha1=b=>crypto.createHash('sha1').update(b).digest('hex');
const falhar=(codigo='prova-local-invalida')=>{throw new c.ErroMarketing(codigo,'A prova local ou os arquivos preservados nao conferem.',409);};
function caminhoValido(c){
  if (typeof c !== 'string' || [...c].length > 400 || !c.startsWith('docs/marketing/') || c !== c.normalize('NFKC')
    || /[\u0000-\u001f\u007f-\u009f\\:<>"|?]/u.test(c) || /[\ud800-\udfff]/u.test(c)) return false;
  const partes = c.split('/');
  return partes.every((p, i) => {
    if (!p || p.startsWith('.') || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(p) || /~\d/.test(p)) return false;
    const estrela = p.indexOf('*');
    return estrela < 0 || (i === partes.length - 1 && estrela > 0 && estrela === p.length - 1 && p.lastIndexOf('*') === estrela);
  });
}
function chave(p){return ['grana-ajuste-local-v1',p.pedidoId,p.pecaId,p.caminho,p.versaoAnterior,p.versaoCorrigida,p.anteriorSha256,p.atualSha256].join('\n');}
function validarResumo(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).sort().join()!==[...CAMPOS].sort().join()
  ||p.tipo!=='historico-local-v1'||!UUID.test(p.pedidoId)||!ID.test(p.pecaId)||!caminhoValido(p.caminho)
  ||!V.test(p.versaoAnterior)||!V.test(p.versaoCorrigida)||p.versaoAnterior===p.versaoCorrigida
  ||![p.anteriorSha256,p.atualSha256,p.reciboSha256].every(x=>typeof x==='string'&&SHA.test(x))||digest(chave(p))!==p.reciboSha256)falhar();
 return Object.fromEntries(CAMPOS.map(k=>[k,p[k]]));
}
function criarCustodia({raiz,base,io=fs}){
 base=path.resolve(base);const MAX=64*1024*1024,TOTAL=256*1024*1024;
 function seguro(rel,criar=false){
  if(typeof rel!=='string'||rel.includes('\\')||rel.split('/').some(x=>!x||x==='.'||x==='..'||! /^[a-zA-Z0-9._-]+$/.test(x)))falhar('historico-caminho-invalido');
  const alvo=path.resolve(base,...rel.split('/'));if(!alvo.startsWith(base+path.sep))falhar();
  const pais=[];for(let d=base;;d=path.dirname(d)){pais.push(d);if(d===path.dirname(d))break;}
  for(const d of pais.reverse())if(io.existsSync(d)&&io.lstatSync(d).isSymbolicLink())falhar('historico-link-recusado');
  if(criar)io.mkdirSync(base,{recursive:true,mode:0o700});
  let d=base;for(const parte of rel.split('/').slice(0,-1)){
   d=path.join(d,parte);if(criar&&!io.existsSync(d))io.mkdirSync(d,{mode:0o700});
   if(io.existsSync(d)&&(!io.lstatSync(d).isDirectory()||io.lstatSync(d).isSymbolicLink()))falhar('historico-link-recusado');
  }
  if(io.existsSync(alvo)&&(!io.lstatSync(alvo).isFile()||io.lstatSync(alvo).isSymbolicLink()))falhar('historico-link-recusado');
  return alvo;
 }
 function ler(rel,limite=MAX){const abs=seguro(rel);if(!io.existsSync(abs))falhar('historico-ausente');const stat=io.statSync(abs);if(!stat.isFile()||stat.size>limite)falhar('historico-limite');return io.readFileSync(abs);}
 function gravar(rel,bytes){
  const abs=seguro(rel,true);
  if(io.existsSync(abs)){if(!io.readFileSync(abs).equals(bytes))falhar('historico-divergente');return;}
  const tmp=abs+'.'+crypto.randomUUID()+'.tmp';
  try{io.writeFileSync(tmp,bytes,{flag:'wx',mode:0o600});const fd=io.openSync(tmp,'r+');try{io.fsyncSync(fd);}finally{io.closeSync(fd);}
   try{io.linkSync(tmp,abs);}catch(e){if(e.code!=='EEXIST')throw e;if(!ler(rel,Math.max(MAX,bytes.length)).equals(bytes))falhar('historico-divergente');}
  }finally{if(io.existsSync(tmp))io.unlinkSync(tmp);}
 }
 function entradas(p,incluirCopy=true){
  if(!p||!ID.test(p.id)||!V.test(p.versao)||!caminhoValido(p.caminho)||!Array.isArray(p.arquivos)||!p.arquivos.length||p.arquivos.length>100)falhar();
  const items=p.arquivos.map(a=>({papel:'midia',nome:a.nome,tipo:a.tipo,caminho:decodeURIComponent(a.url.slice(1)),esperado:a.sha1}));
  if(p.composicao&&p.capa)items.push({papel:'capa',nome:path.posix.basename(decodeURIComponent(p.capa.url)),tipo:'imagem',caminho:decodeURIComponent(p.capa.url.slice(1)),esperado:p.capa.sha1});
  const semana=p.caminho.split('/').slice(0,4).join('/');
  for(const estado of incluirCopy?['para-aprovacao','aprovados','historico']:[]){
   const rel=semana+'/'+estado+'/pecas/COPYS-FINAIS.md';const abs=c.caminhoSeguro(raiz,rel);
   if(io.existsSync(abs)&&!items.some(x=>x.caminho===rel))items.push({papel:'copy',nome:'COPYS-FINAIS.md',tipo:'texto',caminho:rel});
  }
  return items;
 }
 function material(p,salvar,incluirCopy=true){let total=0;
  const arquivos=entradas(p,incluirCopy).map(a=>{
   if(typeof a.nome!=='string'||path.posix.basename(a.nome)!==a.nome||!caminhoValido(a.caminho)||a.caminho.includes('*'))falhar();
   const abs=c.caminhoSeguro(raiz,a.caminho),stat=io.lstatSync(abs);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX||(total+=stat.size)>TOTAL)falhar('historico-limite');
   const bytes=io.readFileSync(abs);if(bytes.length!==stat.size||(a.esperado&&sha1(bytes)!==a.esperado))falhar('versao-mudou');
   const h=digest(bytes);if(salvar)gravar('objetos/'+h+'.bin',bytes);
   return {papel:a.papel,nome:a.nome,tipo:a.tipo,caminho:a.caminho,bytes:bytes.length,sha1:sha1(bytes),sha256:h};
  });
  const midias=arquivos.filter(a=>a.papel==='midia'),capa=arquivos.find(a=>a.papel==='capa');
  const versao=capa?c.versaoComposta(midias.map(a=>a.sha1),capa.sha1,p.legenda??null):c.versaoDeArquivos(midias.map(a=>a.sha1),p.legenda??null);
  if(versao!==p.versao)falhar('versao-mudou');
  return {formato:1,pecaId:p.id,caminho:p.caminho,versao:p.versao,legenda:p.legenda??null,arquivos};
 }
 function preservar(p){const m=material(p,true),bytes=Buffer.from(JSON.stringify(m)+'\n'),h=digest(bytes);gravar('versoes/'+h+'.json',bytes);return {sha256:h,pecaId:p.id,caminho:p.caminho,versao:p.versao};}
 function manifesto(h){
  if(!SHA.test(h||''))falhar();const bytes=ler('versoes/'+h+'.json',1024*1024);if(digest(bytes)!==h)falhar('historico-divergente');
  let m;try{m=JSON.parse(bytes);}catch{falhar();}
  if(m.formato!==1||!ID.test(m.pecaId)||!V.test(m.versao)||!caminhoValido(m.caminho)||!Array.isArray(m.arquivos)||!m.arquivos.length||m.arquivos.length>104)falhar();
  let total=0;for(const a of m.arquivos){if(!SHA.test(a.sha256||'')||!Number.isSafeInteger(a.bytes)||a.bytes<0||a.bytes>MAX||(total+=a.bytes)>TOTAL||!caminhoValido(a.caminho)||!['midia','capa','copy'].includes(a.papel))falhar();const b=ler('objetos/'+a.sha256+'.bin');if(b.length!==a.bytes||digest(b)!==a.sha256||sha1(b)!==a.sha1)falhar('historico-divergente');}
  return m;
 }
 function conferir(pedido,p,prova,atual=true){
  const v=validarResumo(prova);
  if(v.pedidoId!==(pedido.remotoId||pedido.id)||v.pecaId!==pedido.pecaId||v.pecaId!==p.id||v.caminho!==pedido.caminho||v.caminho!==p.caminho
   ||v.versaoAnterior!==pedido.versaoAlvo||v.versaoCorrigida!==p.versao||v.anteriorSha256!==pedido.snapshotAnterior?.sha256)falhar();
  let salvo;try{salvo=JSON.parse(ler('recibos/'+v.reciboSha256+'.json',16384));}catch{falhar('prova-local-ausente');}
  if(JSON.stringify(validarResumo(salvo))!==JSON.stringify(v))falhar();
  const antes=manifesto(v.anteriorSha256),depois=manifesto(v.atualSha256);
  for(const [m,versao] of [[antes,v.versaoAnterior],[depois,v.versaoCorrigida]])if(m.pecaId!==v.pecaId||m.caminho!==v.caminho||m.versao!==versao)falhar();
  // O COPYS completo e preservado, mas outras pecas da semana podem muda-lo.
  // O aceite confere somente identidade/legenda/midias desta peca; a custodia
  // continua verificando integralmente os bytes arquivados dos COPYS anteriores.
  const propria=m=>({...m,arquivos:m.arquivos.filter(a=>a.papel!=='copy')});
  if(atual&&JSON.stringify(material(p,false,false))!==JSON.stringify(propria(depois)))falhar('versao-mudou');
  return {prova:v,antes,depois};
 }
 function comprovar(pedido,p){
  if(!pedido.snapshotAnterior||pedido.snapshotAnterior.versao!==pedido.versaoAlvo||p.versao===pedido.versaoAlvo)falhar('anterior-nao-preservado');
  const antes=manifesto(pedido.snapshotAnterior.sha256);
  if(antes.pecaId!==p.id||antes.caminho!==p.caminho||antes.versao!==pedido.versaoAlvo)falhar();
  const novo=preservar(p),v={tipo:'historico-local-v1',pedidoId:pedido.remotoId||pedido.id,pecaId:p.id,caminho:p.caminho,
   versaoAnterior:pedido.versaoAlvo,versaoCorrigida:p.versao,anteriorSha256:pedido.snapshotAnterior.sha256,atualSha256:novo.sha256};
  v.reciboSha256=digest(chave(v));validarResumo(v);gravar('recibos/'+v.reciboSha256+'.json',Buffer.from(JSON.stringify(v)+'\n'));conferir(pedido,p,v);return v;
 }
 function lerAnterior(pedido,p,{arquivo,resolver}={}){
  if(pedido.estado!=='corrigido-aguardando-aceite'||pedido.versaoCorrigida!==p.versao)falhar();
  const {antes}=conferir(pedido,p,pedido.provaCorrecao,false);
  const atual=p.arquivos.find(a=>a.nome===(arquivo||p.arquivos[0]?.nome));
  if(!atual||typeof resolver!=='function')falhar('arquivo-invalido');const protegido=resolver(atual.url);
  if(!protegido||protegido.publico||!['imagem','video','texto'].includes(atual.tipo))falhar('arquivo-recusado');
  const a=antes.arquivos.find(a=>a.papel==='midia'&&a.nome===atual.nome);if(!a)falhar('anterior-indisponivel');
  return {conteudo:ler('objetos/'+a.sha256+'.bin'),mime:protegido.mime,extras:protegido.extras||{}};
 }
 return {preservar,comprovar,conferir,lerAnterior};
}
function padrao(raiz){return criarCustodia({raiz,base:path.join(require('./ajustes-fila.cjs').pastaFila,'historico-correcoes')});}
module.exports={criarCustodia,padrao,validarResumo,chave};

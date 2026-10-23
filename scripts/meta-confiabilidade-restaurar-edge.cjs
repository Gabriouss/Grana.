'use strict';
// Restaura SOMENTE os dois ESZIP brutos existentes. Nunca e chamado pelo preparador.
// Requer recibo operacional explicito da raiz e fila drenada; nenhum .env e aberto.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const slugs=new Set(['admin-publicacoes-reais','marketing-real-executor']);
async function main(){
 const [acao,pasta,reciboFile]=process.argv.slice(2);
 if(!['preparar','executar'].includes(acao)||!pasta)throw new Error('uso: preparar|executar PASTA_BACKUPS [RECIBO_RAIZ]');
 const dir=path.resolve(pasta);if(!dir.toLowerCase().startsWith('e:\\grana-temporarios\\'))throw new Error('backup-deve-ser-local-externo');
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'backup-manifesto.json'),'utf8'));
 if(manifest.stableAcrossDownload!==true||manifest.rawBackups.length!==2)throw new Error('backup-nao-estavel');
 const alvos=manifest.rawBackups.map(b=>{
  if(!slugs.has(b.slug)||b.verify_jwt!==true||path.basename(b.file)!==b.file)throw new Error('alvo-nao-permitido');
  const raw=fs.readFileSync(path.join(dir,b.file));if(sha(raw)!==b.sha256)throw new Error('backup-divergente');
  const payload=Buffer.concat([Buffer.from('EZBR'),zlib.brotliCompressSync(raw)]);
  if(!zlib.brotliDecompressSync(payload.subarray(4)).equals(raw))throw new Error('payload-invalido');
  return {...b,payload,ezbr_sha256:sha(payload)};
 });
 if(acao==='preparar'){
  console.log(JSON.stringify({codigo:'retorno-binario-preparado',alvos:alvos.map(b=>({slug:b.slug,raw_sha256:b.sha256,ezbr_sha256:b.ezbr_sha256})),rede:0}));return;
 }
 const gate=JSON.parse(fs.readFileSync(reciboFile,'utf8'));
 if(gate.raizAutorizouRetorno!==true||gate.pausaGlobal!==true||gate.bloqueiosRetorno!==0||gate.leasesAtivas!==0
  ||!alvos.every(b=>gate.backups?.some(x=>x.slug===b.slug&&x.sha256===b.sha256)))throw new Error('recibo-raiz-insuficiente');
 const ref=process.env.SUPABASE_PROJECT_REF,token=process.env.SUPABASE_ACCESS_TOKEN;
 if(!/^[a-z0-9]{8,40}$/.test(ref||'')||!token)throw new Error('ambiente-operador-ausente');
 async function request(url,init={}){const r=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(60000),
  headers:{Authorization:'Bearer '+token,...init.headers}});if(!r.ok){await r.body?.cancel();throw new Error('retorno-http-recusado');}return r;}
 for(const b of alvos){
  const base='https://api.supabase.com/v1/projects/'+ref+'/functions/'+b.slug;
  await (await request(base+'?verify_jwt=true&ezbr_sha256='+b.ezbr_sha256,{method:'PATCH',body:b.payload,
   headers:{'Content-Type':'application/octet-stream'}})).body?.cancel();
  const meta=await (await request(base)).json();if(meta.verify_jwt!==true||meta.status!=='ACTIVE')throw new Error('retorno-metadata-divergente');
  const raw=Buffer.from(await (await request(base+'/body')).arrayBuffer());
  if(sha(raw)!==b.sha256)throw new Error('retorno-readback-binario-divergente');
  console.log(JSON.stringify({codigo:'retorno-verificado',slug:b.slug,updated_at:meta.updated_at,verify_jwt:meta.verify_jwt,sha256:sha(raw)}));
 }
}
main().catch(()=>{console.error('retorno-nao-concluido-sem-detalhe-sensivel');process.exitCode=1;});

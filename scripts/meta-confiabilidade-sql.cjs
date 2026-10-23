'use strict';
// Operador apos sinal da raiz. Nunca carrega .env nem imprime resposta de erro SQL/API.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const mapa={aplicar:'supabase/migrations/20261022120000_admin_marketing_confiabilidade.sql',
 configurar:'scripts/meta-confiabilidade-configurar.sql',readback:'scripts/meta-confiabilidade-readback.sql',
 conter:'scripts/meta-confiabilidade-retorno.sql',ativar:'scripts/meta-confiabilidade-ativar.sql','email-liberar':'scripts/meta-confiabilidade-email-liberar.sql'};
async function main(){const [acao,pasta,reciboFile]=process.argv.slice(2);if((!mapa[acao]&&!['restaurar-rpcs','restaurar-completo'].includes(acao))||!pasta)throw new Error('uso-invalido');
 const base=path.resolve(pasta),manifest=JSON.parse(fs.readFileSync(path.join(base,'manifesto.json'),'utf8'));
 const retornoNome=acao==='restaurar-rpcs'?'rollback-rpcs':acao==='restaurar-completo'?'rollback-completo':null;
 const retorno=retornoNome?JSON.parse(fs.readFileSync(path.join(base,'backups',retornoNome+'-manifest.json'),'utf8')):null;
 const rel=retornoNome?'backups/'+retornoNome+'.sql':mapa[acao],arquivo=retorno||manifest.arquivos.find(x=>x.arquivo===rel);if(!arquivo)throw new Error('arquivo-fora-manifesto');
 const bytes=fs.readFileSync(path.join(base,rel));const sha=crypto.createHash('sha256').update(bytes).digest('hex');if(sha!==arquivo.sha256)throw new Error('fonte-divergente');
 let autorizacaoEmail=null;
 if(acao!=='readback'){
  const gate=JSON.parse(fs.readFileSync(reciboFile,'utf8'));
  if(gate.raizAutorizou!==true||gate.acao!==acao||gate.sha256!==sha)throw new Error('sinal-raiz-ausente');
  if(acao==='email-liberar'){
   if(gate.consentimentoEmail!==true||!(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i).test(gate.autorizacaoEmailId||''))throw new Error('consentimento-email-ausente');
   autorizacaoEmail=gate.autorizacaoEmailId;
  }
 }
 const ref=process.env.SUPABASE_PROJECT_REF,token=process.env.SUPABASE_ACCESS_TOKEN;
 if(!/^[a-z0-9]{8,40}$/.test(ref||'')||!token)throw new Error('ambiente-operador-ausente');
 const api='https://api.supabase.com/v1/projects/'+ref+'/database/query';
 if(acao==='aplicar'){
  // Backup exato imediatamente antes da escrita liberada, sem log do DDL.
  const nomes=['claim','admitir','recibo','claim_v2','admitir_v2','recibo_v2'].map(n=>'admin_marketing_real_'+n);
  const query="select p.proname as nome,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ("+nomes.map(n=>"'"+n+"'").join(',')+") order by p.proname";
  const r=await fetch(api+'/read-only',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query})});
  if(!r.ok){await r.body?.cancel();throw new Error('backup-rpcs-nao-concluido');}
  const rows=await r.json();if(!Array.isArray(rows)||rows.length!==6||!nomes.every(n=>rows.some(x=>x.nome===n&&typeof x.definition==='string'&&x.definition.startsWith('CREATE OR REPLACE FUNCTION public.'+n+'('))))throw new Error('backup-rpcs-invalido');
  const guardPath='scripts/meta-confiabilidade-retorno-guard.sql',guard=fs.readFileSync(path.join(base,guardPath));
  if(crypto.createHash('sha256').update(guard).digest('hex')!==manifest.arquivos.find(x=>x.arquivo===guardPath)?.sha256)throw new Error('fonte-divergente');
  const guarda=guard.toString('utf8');
  const ddl=guarda+rows.map(x=>x.definition).join(';\n')+';\ncommit;\n';
  const folder=path.join(base,'backups');fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,'rollback-rpcs-raw.json'),JSON.stringify(rows),{flag:'wx'});
  fs.writeFileSync(path.join(folder,'rollback-rpcs.sql'),ddl,{flag:'wx'});
  fs.writeFileSync(path.join(folder,'rollback-rpcs-manifest.json'),JSON.stringify({arquivo:'backups/rollback-rpcs.sql',sha256:crypto.createHash('sha256').update(ddl).digest('hex'),localOnly:true}),{flag:'wx'});
 }
 const endpoint=api+(acao==='readback'?'/read-only':'');
 const query=autorizacaoEmail?bytes.toString('utf8').replace('begin;',"begin;\nselect set_config('app.marketing_email_autorizacao','"+autorizacaoEmail+"',true);"):bytes.toString('utf8');
 const r=await fetch(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(90000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query})});
 if(!r.ok){await r.body?.cancel();throw new Error('sql-nao-concluido');}
 if(acao==='readback')console.log(JSON.stringify({codigo:'readback',dados:await r.json()}));
 else{await r.body?.cancel();console.log(JSON.stringify({codigo:'sql-concluido',acao,sha256:sha,readbackObrigatorio:true}));}
}
main().catch(e=>{console.error(['uso-invalido','arquivo-fora-manifesto','fonte-divergente','sinal-raiz-ausente','consentimento-email-ausente','ambiente-operador-ausente','sql-nao-concluido'].includes(e.message)?e.message:'operacao-nao-concluida');process.exitCode=1;});

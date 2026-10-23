'use strict';
// Prepara/reconfere artefatos EXTERNOS. Sem rede, execucao SQL, deploy ou acesso a .env.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const own=[
 'supabase/migrations/20261022120000_admin_marketing_confiabilidade.sql',
 'supabase/functions/admin-publicacoes-reais/index.ts','supabase/functions/marketing-real-executor/index.ts',
 'supabase/functions/marketing-incidentes-monitor/index.ts','supabase/functions/marketing-incidentes-email/index.ts',
 'tools/admin-local/adaptadores/marketing-backend.cjs','tools/admin-local/adaptadores/_contratos-marketing.cjs',
 'scripts/meta-confiabilidade-configurar.sql','scripts/meta-confiabilidade-readback.sql','scripts/meta-confiabilidade-retorno.sql',
 'scripts/meta-confiabilidade-sql.cjs','scripts/meta-confiabilidade-restaurar-edge.cjs','scripts/meta-confiabilidade-pacote.cjs',
 'scripts/meta-confiabilidade-ativar.sql','scripts/meta-confiabilidade-email-liberar.sql','scripts/meta-confiabilidade-retorno-guard.sql',
 '__tests__/marketing-real-confiabilidade.cjs','__tests__/marketing-real-incidentes.cjs','__tests__/marketing-real-renovacao.cjs',
];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function externo(dir){const abs=path.resolve(dir||'');const allowed=path.resolve('E:/Grana-temporarios');
 if(!abs.toLowerCase().startsWith((allowed+path.sep).toLowerCase()))throw new Error('destino-externo-obrigatorio');return abs;}
function preparar(dir,backup,sqlBruto,shaBruto){const destino=externo(dir),pastaBackup=externo(backup);
 const meta=JSON.parse(fs.readFileSync(path.join(pastaBackup,'backup-manifesto.json'),'utf8'));
 if(meta.stableAcrossDownload!==true||meta.rawBackups?.length!==2)throw new Error('backup-nao-estavel');
 if(fs.existsSync(destino))throw new Error('destino-existente-nao-sobrescrever');
 const selected=new Set(own);
 function dependencias(rel){if(!rel.endsWith('.ts'))return;const source=fs.readFileSync(path.join(root,rel),'utf8');
  for(const m of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
   const resolved=path.resolve(root,path.dirname(rel),m[1]);if(!resolved.startsWith(root+path.sep))throw new Error('import-fora-do-repo');
   const next=path.relative(root,resolved).replaceAll('\\','/');if(!selected.has(next)){selected.add(next);dependencias(next);}
  }}
 for(const rel of own)dependencias(rel);
 const arquivos=[...selected].sort().map(arquivo=>({arquivo,bytes:fs.readFileSync(path.join(root,arquivo))}));
 const brutos=meta.rawBackups.map(b=>{const bytes=fs.readFileSync(path.join(pastaBackup,b.file));
  if(hash(bytes)!==b.sha256||b.verify_jwt!==true)throw new Error('backup-divergente');return {...b,bytes};});
 let brutoSql=null;
 if(sqlBruto){const pastaSql=externo(sqlBruto),manifestBytes=fs.readFileSync(path.join(pastaSql,'manifesto-sql-bruto.json'));
  if(!/^[a-f0-9]{64}$/.test(shaBruto||'')||hash(manifestBytes)!==shaBruto)throw new Error('manifesto-sql-divergente');
  const m=JSON.parse(manifestBytes);if(m.transactionReadOnly!=='on'||m.sanitizedDefinitionUsed!==false||m.rawResponseHashReadback!==true||m.existingFunctions!==30)throw new Error('backup-sql-invalido');
  const files=m.files.map(f=>{if(path.basename(f.file)!==f.file)throw new Error('backup-sql-caminho-invalido');const bytes=fs.readFileSync(path.join(pastaSql,f.file));if(hash(bytes)!==f.sha256)throw new Error('backup-sql-divergente');return {file:'sql-efetivo-pre22/'+f.file,sha256:f.sha256,bytes};});
  files.push({file:'sql-efetivo-pre22/manifesto-sql-bruto.json',sha256:shaBruto,bytes:manifestBytes});
  const raw=JSON.parse(fs.readFileSync(path.join(pastaSql,'resposta-bruta-pg-get-functiondef-metadata-grants.json'),'utf8'))[0].backup;
  const funcs=raw.functions.filter(f=>f.exists);if(funcs.length!==30||funcs.some(f=>!f.definition.startsWith('CREATE OR REPLACE FUNCTION public.admin_marketing_real_')||hash(f.definition)!==m.functions.find(x=>x.name===f.name)?.sha256))throw new Error('definicao-sql-divergente');
  const guard=fs.readFileSync(path.join(root,'scripts/meta-confiabilidade-retorno-guard.sql'),'utf8');
  const full=Buffer.from(guard+funcs.map(f=>f.definition).join(';\n')+';\ncommit;\n');
  files.push({file:'rollback-completo.sql',sha256:hash(full),bytes:full});
  const retorno=Buffer.from(JSON.stringify({arquivo:'backups/rollback-completo.sql',sha256:hash(full),rawManifestSha256:shaBruto,funcoes:30,localOnly:true},null,2)+'\n');
  files.push({file:'rollback-completo-manifest.json',sha256:hash(retorno),bytes:retorno});brutoSql={files,shaBruto};
 }
 fs.mkdirSync(destino,{recursive:true});
 for(const f of arquivos){const out=path.join(destino,f.arquivo);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,f.bytes,{flag:'wx'});}
 fs.mkdirSync(path.join(destino,'backups'));
 for(const b of brutos)fs.writeFileSync(path.join(destino,'backups',b.file),b.bytes,{flag:'wx'});
 fs.writeFileSync(path.join(destino,'backups','backup-manifesto.json'),JSON.stringify(meta,null,2)+'\n',{flag:'wx'});
 if(brutoSql)for(const f of brutoSql.files){const out=path.join(destino,'backups',f.file);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,f.bytes,{flag:'wx'});}
 const manifesto={versao:1,revisaoNecessaria:true,redeExecutada:false,arquivos:arquivos.map(f=>({arquivo:f.arquivo,sha256:hash(f.bytes)})),
  backups:[...brutos.map(({bytes,...b})=>b),...(brutoSql?.files.map(({bytes,...f})=>f)||[])],sqlBrutoManifestoSha256:brutoSql?.shaBruto??null,dependencias:{sqlAntesEdge:true,nodeRequerRecarga:true,
   funcoes:['admin-publicacoes-reais','marketing-real-executor','marketing-incidentes-monitor','marketing-incidentes-email'],verify_jwt:true}};
 fs.writeFileSync(path.join(destino,'manifesto.json'),JSON.stringify(manifesto,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({codigo:'pacote-preparado',arquivos:arquivos.length,eszip:brutos.length,backupsSql:brutoSql?.files.length??0,redeExecutada:false}));
}
function verificar(dir){const destino=externo(dir),m=JSON.parse(fs.readFileSync(path.join(destino,'manifesto.json'),'utf8'));
 for(const f of m.arquivos){if(hash(fs.readFileSync(path.join(destino,f.arquivo)))!==f.sha256)throw new Error('arquivo-divergente');}
 for(const b of m.backups){if(hash(fs.readFileSync(path.join(destino,'backups',b.file)))!==b.sha256)throw new Error('backup-divergente');}
 console.log(JSON.stringify({codigo:'pacote-verificado',arquivos:m.arquivos.length,backups:m.backups.length}));}
function smoke(){const {carregar}=require('../tools/admin-local/adaptadores/_contratos-marketing.cjs');
 const {criarOperadorIncidentes}=carregar('supabase/functions/_shared/marketing-real-incidentes.ts');
 let chamadas=0;const deps={env:()=>undefined,cliente:()=>{throw new Error('banco-proibido');},rede:()=>{chamadas++;throw new Error('rede-proibida');},log:()=>{}};
 return Promise.all(['monitor','email'].map(async tipo=>{const r=await criarOperadorIncidentes(tipo,deps)(new Request('https://fixture.invalid',{method:'GET'}));if(r.status!==405)throw new Error('smoke-recusado');}))
  .then(()=>{if(chamadas)throw new Error('smoke-com-rede');console.log(JSON.stringify({codigo:'smoke-local-ok',emailReal:0,rede:0}));});}
async function main(){const [acao,dir,backup,sqlBruto,shaBruto]=process.argv.slice(2);
 if(acao==='preparar')preparar(dir,backup,sqlBruto,shaBruto);else if(acao==='verificar')verificar(dir);else if(acao==='smoke')await smoke();
 else throw new Error('uso: preparar DESTINO BACKUP_DIR | verificar DESTINO | smoke');}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

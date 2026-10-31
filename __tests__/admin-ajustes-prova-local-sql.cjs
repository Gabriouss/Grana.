'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chave,validarResumo}=require('../tools/admin-local/marketing/ajustes-prova-local.cjs');
const positivos=['docs/marketing/Recebeu um Pix, só colar.mp4','docs/marketing/ação (v2)/C01 - revisão, final.png','docs/marketing/produção com espaço/carrossel-*','docs/marketing/'+ 'a'.repeat(385),'docs/marketing/'+ '😀'.repeat(385)];
const negativos=['','docs/marketing/','/docs/marketing/a.png','C:/docs/marketing/a.png','https://x/docs/marketing/a','docs/marketing//a','docs/marketing/./a','docs/marketing/../a','docs/marketing/.oculto/a','docs/marketing/a\\b','docs/marketing/a:b','docs/marketing/a?b','docs/marketing/a<b','docs/marketing/a>b','docs/marketing/a"b','docs/marketing/a|b','docs/marketing/a\nqualquer','docs/marketing/a\rqualquer','docs/marketing/a\tqualquer','docs/marketing/a\u0000b','docs/marketing/a\u007fb','docs/marketing/a\u0085b','docs/marketing/a\u009fb','docs/marketing/a\ud800b','docs/marketing/nome.','docs/marketing/nome ','docs/marketing/con.txt','docs/marketing/COM1','docs/marketing/lpt9.jpg','docs/marketing/a~1.png','docs/marketing/*','docs/marketing/a**','docs/marketing/a*.png','docs/marketing/a*/b','docs/marketing/e\u0301.png','docs/marketing/Ａ.png','docs/marketing/'+ 'a'.repeat(386),'docs/marketing/'+ '😀'.repeat(386)];
const casos=[...positivos.map(caminho=>({caminho,aceito:true})),...negativos.map(caminho=>({caminho,aceito:false}))];
module.exports={casos};
let n=0;const ok=(v,m)=>{assert.ok(v,m);n++;};
function prova(caminho,id='11111111-1111-4111-8111-111111111111'){
 const p={tipo:'historico-local-v1',pedidoId:id,pecaId:'a'.repeat(16),caminho,versaoAnterior:'b'.repeat(40),versaoCorrigida:'c'.repeat(40),anteriorSha256:'d'.repeat(64),atualSha256:'e'.repeat(64)};p.reciboSha256=crypto.createHash('sha256').update(chave(p)).digest('hex');return p;
}
if(require.main===module)(async()=>{
 for(const c of casos){let aceito=true;try{validarResumo(prova(c.caminho));}catch{aceito=false;}assert.equal(aceito,c.aceito,'Node '+JSON.stringify(c.caminho));n++;}
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;');
  for(const f of ['20261008150000_admin_ajustes_fila.sql','20261023210000_admin_ajustes_prova_local.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',f),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261023210000_admin_ajustes_prova_local.sql'),'utf8'));ok(true,'migration repetivel');
  await db.exec('set role service_role');
  for(const c of casos){
   // NUL/surrogates isolados nao sao texto UTF8 PostgreSQL. Testar o JSONB
   // original, sem a substituicao U+FFFD feita pelo transporte text do driver.
   if(c.caminho.includes('\u0000')||/[\ud800-\udfff]/u.test(c.caminho)){
    await assert.rejects(db.query('select $1::jsonb',[JSON.stringify(prova(c.caminho))]),/unicode|surrogate|character|escape|invalid input syntax for type json/i);n++;continue;
   }
   let resultado=false;try{resultado=(await db.query('select public.admin_ajuste_caminho_valido($1) as v',[c.caminho])).rows[0].v;}catch(e){if(!c.caminho.includes('\u0000')&&!/[\ud800-\udfff]/u.test(c.caminho))throw e;}
   assert.equal(resultado,c.aceito,'SQL caminho '+JSON.stringify(c.caminho));n++;
   if(c.caminho.includes('\u0000')||/[\ud800-\udfff]/u.test(c.caminho))continue;
   const p=prova(c.caminho);const {rows:[r]}=await db.query('select public.admin_ajuste_prova_local_valida($1,$2,$3,$4,$5,$6) as v',[p,p.pedidoId,p.pecaId,p.caminho,p.versaoAnterior,p.versaoCorrigida]);assert.equal(r.v,c.aceito,'SQL prova '+JSON.stringify(c.caminho));n++;
  }
  const id=crypto.randomUUID(),p=prova(positivos[0],id);
  await db.query('insert into public.admin_ajuste_pedidos(id,peca_id,caminho,versao_alvo,texto_original)values($1,$2,$3,$4,$5)',[id,p.pecaId,p.caminho,p.versaoAnterior,'fixture']);
  const update=prova=>db.query("update public.admin_ajuste_pedidos set estado='corrigido-aguardando-aceite',versao_corrigida=$1,prova_correcao=$2 where id=$3",[p.versaoCorrigida,prova,id]);
  await assert.rejects(update(null),/correcao_coerente/);n++;
  for(const delta of [{reciboSha256:'0'.repeat(64)},{pedidoId:crypto.randomUUID()},{versaoAnterior:p.versaoCorrigida},{pecaId:'f'.repeat(16)},{atualSha256:'z'.repeat(64)},{extra:'campo'}]){await assert.rejects(update({...p,...delta}),/prova_local_coerente/);n++;}
  await update(p);ok(true,'prova com caminho real corrigida sem commit');
  await db.query("update public.admin_ajuste_pedidos set estado='aceito',aceite_em=now(),aceite_versao=$1 where id=$2",[p.versaoCorrigida,id]);ok(true,'aceite exato');
  await assert.rejects(db.query('delete from public.admin_ajuste_pedidos where id=$1',[id]),/permission denied/);n++;
  await assert.rejects(db.query('update public.admin_ajuste_pedidos set texto_original=$1 where id=$2',['mudanca',id]),/imutavel/);n++;
  await db.query("insert into public.admin_ajuste_pedidos(peca_id,caminho,versao_alvo,texto_original,estado,versao_corrigida,commit_correcao)values($1,$2,$3,'legacy','corrigido-aguardando-aceite',$4,$5)",[p.pecaId,p.caminho,p.versaoAnterior,p.versaoCorrigida,'f'.repeat(40)]);ok(true,'legacy preservado');
  for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(db.query('select * from public.admin_ajuste_pedidos'),/permission denied/);n++;await assert.rejects(db.query('select public.admin_ajuste_caminho_valido($1)',[positivos[0]]),/permission denied/);n++;await assert.rejects(db.query('select public.admin_ajuste_prova_local_valida($1,$2,$3,$4,$5,$6)',[p,id,p.pecaId,p.caminho,p.versaoAnterior,p.versaoCorrigida]),/permission denied/);n++;}
  await db.exec('reset role');ok((await db.query("select relrowsecurity from pg_class where oid='public.admin_ajuste_pedidos'::regclass")).rows[0].relrowsecurity,'RLS preservada');
  console.log('admin-ajustes-prova-local-sql: '+n+' assertions; matriz Node/SQL real, caminhos UTF8 intactos e roles/constraints');
 }finally{await db.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
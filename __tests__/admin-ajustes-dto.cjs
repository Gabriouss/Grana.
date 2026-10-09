'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),antes=process.argv.includes('--antes');
const id='11111111-1111-4111-8111-111111111111',pecaId='a'.repeat(16),versao='b'.repeat(40);
const raw={id,pecaId,versaoAlvo:versao,versaoCorrigida:versao,commit:'c'.repeat(40),estado:'em-correcao',tentativas:1,criadoEm:'2026-10-09T00:00:00Z',atualizadoEm:'2026-10-09T00:00:00Z',
 lease:{id:'CANARIO_LEASE_PRIVADO',agente:'Beacon',inicio:'2026-10-09T00:00:00Z',expiraEm:'2026-10-09T00:45:00Z',token:'CANARIO_EXTRA_PRIVADO'},textoOriginal:'CANARIO_TEXTO_PRIVADO',remotoId:'CANARIO_REMOTO_PRIVADO',extras:'CANARIO_EXTRA_PRIVADO'};
let calls=[];
const fila={listar:()=>[raw],remotoStatus:()=>({status:'ativo',ultimaSync:'2026-10-09T00:00:00Z'}),retry:async()=>{calls.push('retry');return raw;},conferirAceite:()=>calls.push('conferir'),aceitar:async()=>{calls.push('aceitar');return raw;}};
const mod={exports:{}};
const source=antes?execFileSync('git',['show','HEAD:tools/admin-local/rotas.cjs'],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,'tools/admin-local/rotas.cjs'),'utf8');
const fixtures={
 'ajustes-fila':{fila},catalogo:{obterPeca:()=>({id:pecaId,versao})},aprovacoes:{aprovar:async()=>{calls.push('aprovar');return {aprovacao:{versao}};},pedirAjuste:async()=>{calls.push('solicitar');return {ajuste:raw,avisos:[]};}},
};
vm.runInNewContext(source+'\nmodule.exports._GET=GET;module.exports._acao=tratarAcao;',{
 module:mod,exports:mod.exports,__dirname:path.join(root,'tools/admin-local'),Buffer,URL,Date,Map,Set,console:{error(){throw new Error('log proibido');}},
 require:(s)=>{
  if(s==='./config.cjs')return {RAIZ_DADOS:'/fixture',SIMULAR:false,ocultar:s=>s,tem:()=>false,ler:()=>null};
  if(s==='./seguranca.cjs')return {dentroDoLimite:()=>true};if(s==='./autenticacao.cjs')return {};
  if(s==='./auditoria.cjs')return {registrar:()=>{}};
  const name=path.basename(s,'.cjs');if(fixtures[name])return fixtures[name];
  if(s==='./marketing/ajustes-dto.cjs'||name==='ajustes-dto')return require(path.join(root,'tools/admin-local/marketing/ajustes-dto.cjs'));
  return require(s);
 }
});
function res(){return {statusCode:0,writeHead(n){this.statusCode=n;},end(s){this.json=JSON.parse(s);}};}
function conferir(r){assert.equal(r.statusCode,200);assert.ok(!JSON.stringify(r.json).includes('CANARIO_'),'nenhum dado privado/lease/extras no JSON');const p=r.json.dados.pedidos?.[0]||r.json.dados.pedido||r.json.dados.ajuste;assert.equal(p.id,id);assert.equal(p.pecaId,pecaId);assert.equal(p.lease.agente,'Beacon');assert.equal(p.lease.expiraEm,raw.lease.expiraEm);assert.equal(p.lease.id,undefined);assert.equal(p.textoOriginal,undefined);}
(async()=>{
 let r=res();await mod.exports._GET['/api/marketing/ajustes']({},r);conferir(r);
 for(const action of ['retry','aceitar']){r=res();await mod.exports._acao({},r,new URL('http://127.0.0.1/api/marketing/ajustes/'+action),{pedidoId:id,pecaId,versao,confirmacao:action==='retry'?'TENTAR ENTREGA NOVAMENTE':'APROVAR'},{id:'sessao-ficticia'});conferir(r);}
 r=res();await mod.exports._acao({},r,new URL('http://127.0.0.1/api/marketing/pecas/'+pecaId+'/ajuste'),{versao,motivo:'ajuste ficticio'},{id:'sessao-ficticia'});conferir(r);
 assert.deepEqual(calls,['retry','conferir','aprovar','aceitar','solicitar']);
 console.log('admin-ajustes-dto: 4 rotas reais, DTO fechado, chamadas exatas, zero rede/env');
})().catch(e=>{console.error(e.message);process.exitCode=1;});

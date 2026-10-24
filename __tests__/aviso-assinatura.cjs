 'use strict';
process.env.TZ='America/Sao_Paulo';
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/aviso-assinatura.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,Date,Math,Number,String,console});
const {calcularAvisoAssinatura,formatarDataAssinatura,textoBloqueioAssinatura}=m.exports;
let checks=0;const eq=(a,b,n)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),n);checks++;};
const now=Date.parse('2026-10-24T12:00:00-03:00');
const base={enforced:true,active:true,allowed:true,status:'canceled',access_until:'2026-10-31T18:45:00-03:00',grace_until:null};
let a=calcularAvisoAssinatura(base,now);
eq(a.renovaSozinha,false);eq(a.diasRestantes,7);eq(a.mostrarFaixa,true);eq(a.tipoBloqueio,null);
eq(a.lembretes.map(x=>[x.tipo,x.quando.toISOString()]),[['antes-7','2026-10-24T13:00:00.000Z'],['antes-3','2026-10-28T13:00:00.000Z'],['antes-1','2026-10-30T13:00:00.000Z'],['venceu','2026-10-31T21:45:00.000Z']]);
a=calcularAvisoAssinatura({...base,status:'past_due',access_until:'2026-10-01T00:00:00Z',grace_until:'2026-10-27T00:30:00Z'},now);
eq(a.diasRestantes,2,'data-limite cai em26/10 local, nao27/10 UTC');eq(a.dataLimite.toISOString(),'2026-10-27T00:30:00.000Z');eq(a.mostrarFaixa,true);eq(a.tipoBloqueio,null);
eq(a.lembretes.at(-1).quando.toISOString(),'2026-10-27T00:30:00.000Z');
a=calcularAvisoAssinatura({...base,status:'active'},now);eq(a.renovaSozinha,true);eq(a.lembretes,[]);eq(a.mostrarFaixa,false);
for(const status of ['expired','refunded','chargeback','trialing',null]){a=calcularAvisoAssinatura({...base,status},now);eq(a.lembretes,[],status);eq(a.mostrarFaixa,false,status);}
a=calcularAvisoAssinatura({...base,allowed:false,active:false},Date.parse('2026-11-01T12:00:00-03:00'));eq(a.tipoBloqueio,'vencida');eq(formatarDataAssinatura(a.dataLimite),'31/10');eq(textoBloqueioAssinatura(a).titulo,'Sua assinatura venceu em 31/10');
a=calcularAvisoAssinatura({...base,status:'past_due',allowed:false,grace_until:'2026-10-23T12:00:00-03:00'},now);eq(a.tipoBloqueio,'pagamento-pendente');assert.ok(textoBloqueioAssinatura(a).corpo.includes('23/10'));checks++;
for(const status of ['refunded','chargeback']){a=calcularAvisoAssinatura({...base,status,allowed:false},now);eq(a.tipoBloqueio,'encerrada');eq(textoBloqueioAssinatura(a).titulo,'Sua assinatura foi encerrada');}
eq(calcularAvisoAssinatura(null,now).tipoBloqueio,null);
eq(calcularAvisoAssinatura({...base,status:null,access_until:null,allowed:false},now).tipoBloqueio,null,'conta nova continua venda');
eq(calcularAvisoAssinatura({...base,status:null,access_until:'2026-10-23T15:00:00Z',allowed:false},now).tipoBloqueio,'vencida','historico por prazo passado');
eq(calcularAvisoAssinatura({...base,enforced:false},now).lembretes,[]);
for(const data of [null,'quebrada']){a=calcularAvisoAssinatura({...base,access_until:data},now);eq(a.dataLimite,null);eq(a.diasRestantes,null);eq(a.mostrarFaixa,false);eq(a.lembretes,[]);}
a=calcularAvisoAssinatura({...base,status:'past_due',grace_until:null},now);eq(a.dataLimite,null,'nao inventa carencia a partir de access_until');
a=calcularAvisoAssinatura({...base,access_until:'2026-10-24T18:00:00-03:00'},now);eq(a.diasRestantes,0);eq(a.mostrarFaixa,true);
a=calcularAvisoAssinatura({...base,access_until:'2026-10-24T12:00:00-03:00'},now);eq(a.mostrarFaixa,false,'prazo exato ja encerra');
a=calcularAvisoAssinatura({...base,access_until:'2026-11-01T12:00:00-03:00'},now);eq(a.diasRestantes,8);eq(a.mostrarFaixa,false);
const copia=JSON.stringify(base);calcularAvisoAssinatura(base,now);eq(JSON.stringify(base),copia,'puro nao altera estado');
console.log(JSON.stringify({suite:'aviso-assinatura',checks}));

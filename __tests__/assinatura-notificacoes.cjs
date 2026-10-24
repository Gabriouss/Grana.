 'use strict';
process.env.TZ='America/Sao_Paulo';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
let checks=0;const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;},ok=(b,n)=>{assert.ok(b,n);checks++;};
function montar(){
 const c={now:Date.parse('2026-10-24T09:00:00-03:00'),agendadas:new Map(),disco:new Map(),schedule:[],cancel:[],warnings:[],permission:'granted',permissionWait:null,failList:false,failSchedule:false,failCancel:false};
 class Clock extends Date{constructor(...a){super(...(a.length?a:[c.now]));}static now(){return c.now;}}
 const N={setNotificationHandler(){},setNotificationChannelAsync:async()=>{},AndroidImportance:{HIGH:4},SchedulableTriggerInputTypes:{DATE:'date',TIME_INTERVAL:'timeInterval'},
  getPermissionsAsync:async()=>{if(c.permissionWait)await c.permissionWait;return{status:c.permission};},requestPermissionsAsync:async()=>({status:c.permission}),
  getAllScheduledNotificationsAsync:async()=>{if(c.failList)throw Error('listou');return[...c.agendadas.values()];},
  scheduleNotificationAsync:async req=>{if(c.failSchedule)throw Error('agendou');c.schedule.push(req);c.agendadas.set(req.identifier,req);return req.identifier;},
  cancelScheduledNotificationAsync:async id=>{if(c.failCancel)throw Error('cancelou');c.cancel.push(id);c.agendadas.delete(id);}};
 const storage={getItem:async k=>c.disco.get(k)??null,setItem:async(k,v)=>{c.disco.set(k,v);},removeItem:async k=>{c.disco.delete(k);}};
 const cache=new Map();
 const overrides={'react-native':{Platform:{OS:'android'}},'expo-constants':{__esModule:true,default:{appOwnership:'standalone'},AppOwnership:{Expo:'expo'}},'expo-notifications':N,'@react-native-async-storage/async-storage':{__esModule:true,default:storage}};
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module:m,exports:m.exports,require(id){if(id in overrides)return overrides[id];if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id)+'.ts');throw Error('require nao esperado '+id);},Date:Clock,console:{warn:(...a)=>c.warnings.push(a),error:(...a)=>c.warnings.push(a)},setTimeout,clearTimeout,Promise,Map,Set,Intl,URL,Math,Number,String,JSON});return m.exports;}
 c.api=load('lib/notifications.ts');c.proprias=()=>[...c.agendadas.values()].filter(n=>n.identifier.startsWith('assinatura-'));return c;
}
const base={enforced:true,active:true,allowed:true,status:'canceled',access_until:'2026-10-31T18:45:00-03:00',grace_until:null};
(async()=>{
 const c=montar();c.agendadas.set('conta-outro-venc',{identifier:'conta-outro-venc',content:{data:{billId:'outro'}}});
 await c.api.sincronizarAvisosAssinatura('A',base);eq(c.schedule.length,4);eq(c.proprias().length,4);ok(c.agendadas.has('conta-outro-venc'));
 for(const n of c.proprias()){if(n.content.data.etapa==='venceu')eq(n.trigger.date.getTime(),Date.parse(base.access_until));else eq(n.trigger.date.getHours(),10);}
 await c.api.sincronizarAvisosAssinatura('A',base);eq(c.schedule.length,4,'confirmacao igual nao duplica nem reagenda');eq(c.cancel.length,0);
 await c.api.sincronizarAvisosAssinatura('A');eq(c.schedule.length,4);eq(c.proprias().length,4,'abertura offline preserva agenda da mesma conta');
 const nova={...base,access_until:'2026-11-04T17:00:00-03:00'};await c.api.sincronizarAvisosAssinatura('A',nova);eq(c.proprias().length,4);eq(c.cancel.length,4);ok(c.proprias().every(n=>n.content.data.prazo===new Date(nova.access_until).toISOString()));
 await c.api.sincronizarAvisosAssinatura('A',{...nova,status:'active'});eq(c.proprias().length,0);ok(c.agendadas.has('conta-outro-venc'));eq(c.disco.size,0,'renovacao cancela marcador futuro');
 await c.api.sincronizarAvisosAssinatura('A',{...base,status:'past_due',access_until:'2026-10-01T00:00:00Z',grace_until:'2026-10-27T18:00:00-03:00'});ok(c.proprias().every(n=>n.content.data.prazo===new Date('2026-10-27T18:00:00-03:00').toISOString()));ok(c.proprias().filter(n=>n.content.data.etapa!=='venceu').every(n=>n.content.body.includes('Atualize a cobrança')));
 await c.api.sincronizarAvisosAssinatura('B');eq(c.proprias().length,0,'troca de conta remove avisos da anterior, sem criar novos');ok(c.agendadas.has('conta-outro-venc'));
 await c.api.sincronizarAvisosAssinatura('B',base);await c.api.sincronizarAvisosAssinatura(null);eq(c.proprias().length,0,'logout cancela apenas assinatura');ok(c.agendadas.has('conta-outro-venc'));
 for(const status of ['active','expired','refunded','chargeback',null]){await c.api.sincronizarAvisosAssinatura('B',{...base,status});eq(c.proprias().length,0,status);}
 const late=montar();late.now=Date.parse(base.access_until)+1000;
 await late.api.sincronizarAvisosAssinatura('A',{...base,allowed:false});eq(late.schedule.length,1);eq(late.schedule[0].trigger.seconds,1);eq(late.schedule[0].content.title,'Sua assinatura venceu');eq(late.schedule[0].content.body,'Seus dados continuam guardados.');
 await late.api.sincronizarAvisosAssinatura('A',{...base,allowed:false});eq(late.schedule.length,1);eq(late.cancel.length,0,'nao cancela o aviso imediato ainda pendente');
 late.agendadas.clear();await late.api.sincronizarAvisosAssinatura('A',{...base,allowed:false});eq(late.schedule.length,1,'reabertura apos entrega nao repete vencimento');
 const entregue=montar();await entregue.api.sincronizarAvisosAssinatura('A',base);entregue.now=Date.parse(base.access_until)+1000;entregue.agendadas.clear();await entregue.api.sincronizarAvisosAssinatura('A',{...base,allowed:false});eq(entregue.schedule.length,4,'vencimento agendado antes nao duplica depois');
 const retorno=montar();await retorno.api.sincronizarAvisosAssinatura('A',base);await retorno.api.sincronizarAvisosAssinatura(null);eq(retorno.disco.size,0,'logout cancela marcador do vencimento futuro nao entregue');retorno.now=Date.parse(base.access_until)+1000;await retorno.api.sincronizarAvisosAssinatura('A',{...base,allowed:false});eq(retorno.schedule.length,5,'volta apos logout antes do vencimento recebe o aviso que foi cancelado');
 // S-F3-03: prazo passado não prova entrega de um aviso ainda listado no SO.
 const imediato=montar();imediato.now=Date.parse(base.access_until)+1000;
 const vencida={...base,allowed:false};
 imediato.agendadas.set('conta-intacta',{identifier:'conta-intacta',content:{data:{billId:'outro'}}});
 imediato.disco.set('grana:assinatura:vencimento-avisado:B','marcador-da-outra-conta');
 await imediato.api.sincronizarAvisosAssinatura('A',vencida);
 eq(imediato.schedule.length,1);eq(imediato.proprias().length,1,'aviso imediato ainda aguarda entrega');
 await imediato.api.sincronizarAvisosAssinatura(null);
 eq(imediato.proprias().length,0);eq(imediato.disco.has('grana:assinatura:vencimento-avisado:A'),false,'cancelamento confirmado limpa marcador mesmo após o prazo');
 eq(imediato.disco.get('grana:assinatura:vencimento-avisado:B'),'marcador-da-outra-conta');ok(imediato.agendadas.has('conta-intacta'),'cancelamento preserva outros lembretes');
 await imediato.api.sincronizarAvisosAssinatura('A',vencida);
 eq(imediato.schedule.length,2,'reentrada repõe aviso imediato cancelado antes de entregar');
 await imediato.api.sincronizarAvisosAssinatura('A',vencida);eq(imediato.schedule.length,2,'reconsulta não duplica reposição pendente');
 const cancelamentoFalho=montar();cancelamentoFalho.now=imediato.now;
 await cancelamentoFalho.api.sincronizarAvisosAssinatura('A',vencida);
 const marcador=cancelamentoFalho.disco.get('grana:assinatura:vencimento-avisado:A');
 cancelamentoFalho.failCancel=true;await cancelamentoFalho.api.sincronizarAvisosAssinatura(null);
 eq(cancelamentoFalho.proprias().length,1);eq(cancelamentoFalho.disco.get('grana:assinatura:vencimento-avisado:A'),marcador,'cancelamento falho preserva marcador');eq(cancelamentoFalho.warnings.length,1);
 cancelamentoFalho.failCancel=false;await cancelamentoFalho.api.sincronizarAvisosAssinatura(null);
 eq(cancelamentoFalho.proprias().length,0);eq(cancelamentoFalho.disco.has('grana:assinatura:vencimento-avisado:A'),false,'fila recupera cancelamento e limpa marcador');
 await cancelamentoFalho.api.sincronizarAvisosAssinatura('A',vencida);eq(cancelamentoFalho.schedule.length,2);
 const jaEntregue=montar();jaEntregue.now=imediato.now;
 await jaEntregue.api.sincronizarAvisosAssinatura('A',vencida);jaEntregue.agendadas.clear();
 await jaEntregue.api.sincronizarAvisosAssinatura(null);
 ok(jaEntregue.disco.has('grana:assinatura:vencimento-avisado:A'),'logout sem aviso pendente conserva recibo de entrega simulada');
 await jaEntregue.api.sincronizarAvisosAssinatura('A',vencida);eq(jaEntregue.schedule.length,1,'entrega simulada antes do logout não repete ao entrar');eq(jaEntregue.cancel.length,0,'não cancela algo que já saiu da lista do SO');
 const negada=montar();negada.permission='denied';await negada.api.sincronizarAvisosAssinatura('A',base);eq(negada.schedule.length,0);eq(negada.warnings.length,1);
 const erro=montar();erro.failList=true;await erro.api.sincronizarAvisosAssinatura('A',base);eq(erro.schedule.length,0);eq(erro.warnings.length,1);erro.failList=false;await erro.api.sincronizarAvisosAssinatura('A',base);eq(erro.schedule.length,4,'fila recupera apos falha');
 erro.failCancel=true;await erro.api.sincronizarAvisosAssinatura('A',{...base,status:'active'});eq(erro.warnings.length,2);erro.failCancel=false;await erro.api.sincronizarAvisosAssinatura('A',{...base,status:'active'});eq(erro.proprias().length,0);
 const falha=montar();falha.failSchedule=true;await falha.api.sincronizarAvisosAssinatura('A',base);eq(falha.warnings.length,1);eq(falha.schedule.length,0);falha.failSchedule=false;await falha.api.sincronizarAvisosAssinatura('A',base);eq(falha.schedule.length,4);
 const corrida=montar();let liberar;corrida.permissionWait=new Promise(r=>{liberar=r;});const pa=corrida.api.sincronizarAvisosAssinatura('A',base);for(let i=0;i<20;i++)await Promise.resolve();const pb=corrida.api.sincronizarAvisosAssinatura(null);liberar();await Promise.all([pa,pb]);eq(corrida.schedule.length,0,'resposta da permissao atrasada nao agenda conta que saiu');eq(corrida.proprias().length,0);
 console.log(JSON.stringify({suite:'assinatura-notificacoes',checks}));
})().catch(e=>{console.error(e);process.exitCode=1;});

/* Módulos TS reais; Android/disco/rede simulados. Não roda suíte histórica. */
const assert = require('node:assert/strict');
const { ambiente } = require('./voz-retomada-autonoma.cjs');
const payload = { kind:'transaction', type:'out', description:'Mercado', amount:43.48, category:'Alimentação', color:'#fff', occurred_on:'2026-10-28', wallet_id:'w' };
let n = 0;
function eq(a,b,msg) { assert.deepEqual(a,b,msg); n++; }
const key = id => 'grana:voz:operacao:a:' + id;
async function preparar(source) {
  let m=ambiente(); m.e.rede=false;
  eq((await m.real('voice-operations').registrarOperacaoVoz('sync-app',source,payload)).status,'pending','guardada antes de reiniciar');
  m=m.reiniciar(); m.e.requestNativo='sync-app'; m.nativo.definirEstado('pendente'); return m;
}
const sync = m => m.real('voice-operations').sincronizarOperacoesVoz();
(async()=>{
 for(const source of ['app','widget']) {
  for(const status of ['nova','replay','undone']) {
   const m=await preparar(source);
   if(status!=='nova') m.banco.set('sync-app',{existente:true});
   if(status==='undone') {
    const rpc=m.deps['./supabase'].supabase.rpc;
    m.deps['./supabase'].supabase.rpc=(...args)=>{const q=rpc(...args),send=q.abortSignal; q.abortSignal=async(...a)=>{const r=await send(...a);r.data.status='undone';return r;};return q;};
   }
   eq((await sync(m)).sincronizadas,1,source+' app sincroniza');
   eq(m.banco.size,1,'uma operação banco'); eq(m.e.chamadas.length,1,'uma RPC');
   eq(m.disco.has(key('sync-app')),false,'sai após recibo');
   eq((await m.real('widget-voz-task').tentarVozesPendentes()).restantes,0,'áudio ausente');
   eq(m.e.estado,'ocioso','app reconciliou'); eq(m.e.avisos.length,1,'um recibo');
   eq(m.e.avisos[0][0],status==='nova'?'sucesso':'falha','replay/undone não afirma criação');
   eq(m.e.avisos[0][2],'sync-app','mesma intenção na bandeja');
   if(status!=='nova') eq(m.e.avisos[0][1],status==='replay'?'ja_lancada':'desfeita','decisão financeira comum');
   await m.worker('sync-app'); eq(m.e.acks.at(-1)[1],'concluida','ACK tardio');
   eq(m.e.estado,'ocioso','Worker preserva conclusão'); eq(m.e.chamadas.length,1,'zero RPC extra');
   eq(m.e.avisos.length,1,'zero recibo extra'); eq(m.e.snapshots,1,'snapshot pelo app');
  }
  let m=await preparar(source);
  m.arquivos.set('file:///captura.m4a','audio');
  await m.real('widget-voz-pendentes').reservarFalaEmAndamento({caminho:'file:///captura.m4a',requestId:'sync-app',userId:'a',source});
  await m.real('widget-voz-pendentes').adicionarVozPendente({caminho:'file:///captura.m4a',requestId:'sync-app',userId:'a',source});
  await m.real('voz-recibos-da-fila').guardarReciboDaFila({id:'sync-app',dono:'a',tipo:'aviso',titulo:'Antigo',texto:'Aguardando'});
  m.notificacoes.podeNotificar=async()=>false;
  eq((await sync(m)).sincronizadas,1,'recibo na tela sem permissão');
  eq((await m.real('widget-voz-pendentes').listarVozesPendentes()).length,0,'limpa fila áudio');
  eq(m.arquivos.size,0,'limpa cópias áudio');
  const recibos=await m.real('voz-recibos-da-fila').listarRecibosDaFila('a');
  eq(recibos.length,1,'um recibo persistente');eq(recibos[0].tipo,'sucesso','limpeza não apaga recibo novo');eq(m.e.estado,'ocioso','estado após recibo tela');
  await m.worker('sync-app');eq(m.e.estado,'ocioso','Worker vazio não exige notificação após recibo em tela');eq(m.e.acks.at(-1)[1],'concluida','ACK após recibo tela');
  eq((await m.real('voz-recibos-da-fila').listarRecibosDaFila('a')).length,1,'Worker tardio conserva recibo tela');
  m=await preparar(source);m.e.falharRecibo=true;
  eq((await sync(m)).falhas,1,'falha recibo');eq(m.disco.has(key('sync-app')),true,'conserva operação');eq(m.e.estado,'pendente','sem recibo conserva estado');
  eq(m.e.logs.some(l=>String(l[0]).includes('sincronização não concluiu')),true,'falha tem log');
  m.e.falharRecibo=false;eq((await sync(m)).sincronizadas,1,'retry conclui');eq(m.banco.size,1,'retry não duplica banco');eq(m.e.avisos[0][1],'ja_lancada','retry reconhece confirmação');eq(m.e.estado,'ocioso','retry reconcilia');
  m=await preparar(source);m.e.falharLeituraFila=true;
  eq((await sync(m)).falhas,1,'falha limpeza');eq(m.disco.has(key('sync-app')),true,'limpeza incompleta conserva operação');eq(m.e.estado,'pendente','limpeza incompleta conserva estado');eq(m.e.avisos.length,0,'não emite sucesso após limpeza falha');
  for(const estado of ['preparando','ouvindo','processando','pendente','repetir','atencao']) {
   m=await preparar(source);m.e.requestNativo='outra';m.nativo.definirEstado(estado);
   if(estado==='pendente') m.disco.set(key('outra'),JSON.stringify({requestId:'outra',source,payload}));
   const rpc=m.deps['./supabase'].supabase.rpc;
   m.deps['./supabase'].supabase.rpc=(nome,args)=>{const q=rpc(nome,args);if(args.p_request_id==='outra')q.abortSignal=async()=>({error:{message:'Network request failed'}});return q;};
   await sync(m);await m.worker('sync-app');eq(m.e.estado,estado,'preserva outra captura '+estado);
   if(estado==='pendente')eq(m.disco.has(key('outra')),true,'outra operação permanece pendente');
  }
  for(const estado of ['preparando','ouvindo','repetir','atencao']) {
   m=await preparar(source);m.nativo.definirEstado(estado);await sync(m);await m.worker('sync-app');eq(m.e.estado,estado,'mesmo UUID preserva '+estado);
  }
  m=await preparar(source);m.e.trocarAntesRpc=true;await sync(m);await m.worker('sync-app');
  eq(m.e.estado,'pendente','troca dono JS preserva');eq(m.disco.has(key('sync-app')),true,'troca dono conserva operação');eq(m.e.avisos.length,0,'sem recibo após troca');
  m=await preparar(source);m.e.donoNativo='b';await sync(m);await m.worker('sync-app');eq(m.e.estado,'pendente','dono nativo divergente preserva');eq(m.e.chamadas.length,1,'sem duplicação');
  m=ambiente();m.e.requestNativo='consumida';m.nativo.definirEstado('pendente');await m.worker('consumida');eq(m.e.estado,'ocioso','Worker vazio isolado reconcilia');eq(m.e.chamadas.length,0,'Worker vazio não cria dinheiro');
  // Uma tentativa antiga que falha também não pode apagar uma captura nova.
  m=await preparar(source);m.e.rede=false;m.e.requestNativo='nova';m.nativo.definirEstado('ouvindo');
  await m.worker('sync-app');eq(m.e.estado,'ouvindo','envio antigo falho preserva microfone novo');
  eq(m.e.acks.at(-1)[1],'tentar_novamente','envio falho continua retomável');
  eq(m.banco.size,0,'envio falho não grava');eq(m.disco.has(key('sync-app')),true,'envio falho conserva fila');

  // Sem rede, nem app nem Worker devem afirmar conclusão. Retoma com mesmo id.
  m=await preparar(source);m.e.rede=false;
  eq((await sync(m)).falhas,1,'app recebe falha de envio');
  eq(m.e.estado,'pendente','envio app falho preserva estado');eq(m.e.avisos.length,0,'não há falso sucesso');
  await m.worker('sync-app');eq(m.e.acks.at(-1)[1],'tentar_novamente','Worker falho pede retry');
  eq(m.banco.size,0,'tentativas offline não gravam');
  m.e.rede=true;eq((await sync(m)).sincronizadas,1,'reconexão conclui');
  await m.worker('sync-app');eq(m.banco.size,1,'reconexão e Worker tardio não duplicam');
  eq(m.e.estado,'ocioso','reconexão reconcilia a intenção');eq(m.e.avisos.length,1,'um recibo após reconexão');

  // Conta B nunca consome operação de A, nem o Worker de A altera captura B.
  m=await preparar(source);m.e.dono='b';m.e.requestNativo='captura-b';m.nativo.definirEstado('ouvindo');
  eq((await sync(m)).sincronizadas,0,'B não sincroniza fila A');await m.worker('sync-app','a');
  eq(m.e.chamadas.length,0,'B não envia RPC de A');eq(m.e.estado,'ouvindo','captura B preservada');
  eq(m.e.acks.at(-1)[1],'aguardar_usuario','Worker A bloqueado em B');eq(m.disco.has(key('sync-app')),true,'intenção A permanece');

  for(const caso of ['sem_permissao','problema_servico','revisao']) {
   m=await preparar(source);m.e.requestNativo='nova';m.nativo.definirEstado('processando');
   if(caso==='sem_permissao')m.notificacoes.podeNotificar=async()=>false;
   if(caso==='problema_servico')m.e.rpcErro={code:'PGRST202',message:'RPC ausente'};
   if(caso==='revisao')m.e.rpcErro={code:'23514',hint:'cartao_obrigatorio',message:'Cartão obrigatório'};
   await m.worker('sync-app');eq(m.e.estado,'processando',caso+' antigo preserva captura nova');
   eq(m.e.acks.at(-1)[1],'aguardar_usuario',caso+' não diz concluída');
   eq(m.banco.size,0,caso+' não cria lançamento');
  }

  // Worker com áudio antigo usa a mesma guarda em executarTarefa, não só no ramo de operação.
  m=ambiente();m.e.requestNativo='nova';m.nativo.definirEstado('ouvindo');
  m.arquivos.set('file:///antiga.m4a','audio');
  await m.real('widget-voz-pendentes').adicionarVozPendente({caminho:'file:///antiga.m4a',requestId:'audio-antigo',userId:'a',source});
  await m.worker('audio-antigo');eq(m.e.estado,'ouvindo','áudio antigo não altera captura nova');
  eq(m.banco.size,1,'áudio antigo conclui uma vez');
  await m.worker('audio-antigo');eq(m.banco.size,1,'Worker de áudio repetido não duplica');

  // Conclusão antiga não impede uma fala nova com novo UUID, nem consome a sua fila.
  m=await preparar(source);await sync(m);
  m.e.requestNativo='nova-fala';m.nativo.definirEstado('ouvindo');await m.worker('sync-app');
  eq(m.e.estado,'ouvindo','conclusão velha preserva nova fala');
  m.arquivos.set('file:///nova-fala.m4a','audio');
  const nova=await m.real('widget-voz-task').executarTarefa({caminho:'file:///nova-fala.m4a',requestId:'nova-fala',userId:'a',source});
  eq(nova.guardada,false,'nova fala conclui');eq(m.banco.size,2,'duas falas distintas, duas operações');
  await m.worker('sync-app');await m.worker('nova-fala');
  eq(m.banco.size,2,'Workers tardios das duas falas não duplicam');eq(m.e.chamadas.length,2,'uma RPC por fala');
 }
 // O adaptador TS real de um binário sem as novas pontes nunca usa reset global.
 for(const disponivel of [false,true]) {
  const m=ambiente();let globais=0;
  m.deps['expo-modules-core']={Platform:{OS:'android'},requireOptionalNativeModule:()=>disponivel?{definirEstado(){globais++;}}:null};
  const ponte=m.real('lib/../modules/grana-voice-widget/index.ts');
  eq(ponte.reconciliarVozConcluida('antiga','a'),false,'binário antigo sem reconciliação retorna false');
  eq(ponte.definirEstadoDaRetomada('antiga','a','pendente'),false,'binário antigo sem estado scoped retorna false');
  eq(globais,0,'sem fallback global mesmo com definirEstado disponível');
 }
 console.log(`OK: ${n} verificações focais, sync-app/Worker tardio, recibo, limpeza, replay/undone, dono, captura concorrente.`);
})().catch(e=>{console.error(e);process.exitCode=1;});

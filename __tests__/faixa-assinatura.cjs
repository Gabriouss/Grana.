 'use strict';
const assert=require('node:assert/strict');
const {criarTela,nodes,text}=require('./assinar-vencida.cjs');
let checks=0;const ok=(b,n)=>{assert.ok(b,n);checks++;};const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;};
(async()=>{
 const c=criarTela('components/FaixaAssinatura.tsx');c.estado={...c.estado,allowed:true,active:true,access_until:'2026-11-04T18:00:00-03:00'};
 let tree=c.render();ok(text(tree).includes('Sua assinatura termina em 3 dias'));ok(text(tree).includes('Renovar'));eq(c.rpc.length,0,'faixa nao consulta dados financeiros');
 let button=nodes(tree).find(n=>n.type==='@/components/AppPressable');await button.props.onPress();ok(c.abertos[0].startsWith('https://checkout.invalid.test/mensal?'));ok(c.abertos[0].includes('fixture%40invalid.test'));
 c.estado={...c.estado,access_until:'2026-11-02T18:00:00-03:00'};ok(text(c.render()).includes('em 1 dia'));
 c.estado={...c.estado,access_until:'2026-11-01T18:00:00-03:00'};ok(text(c.render()).includes('termina hoje'));
 c.estado={...c.estado,status:'past_due',grace_until:'2026-11-03T18:00:00-03:00'};tree=c.render();ok(text(tree).includes('Pagamento pendente. Acesso até 03/11.'));ok(text(tree).includes('Atualizar cobrança'));button=nodes(tree).find(n=>n.type==='@/components/AppPressable');await button.props.onPress();eq(c.abertos.at(-1),'https://checkout.invalid.test/cobranca');
 c.estado={...c.estado,status:'canceled',grace_until:null};c.ligado=false;tree=c.render();button=nodes(tree).find(n=>n.type==='@/components/AppPressable');eq(button.props.disabled,true);const n=c.abertos.length;await button.props.onPress();eq(c.abertos.length,n,'flag desligada nao abre compra');
 for(const status of ['active','expired','refunded','chargeback',null]){c.estado={...c.estado,status};eq(c.render(),null,status);}
 c.estado={...c.estado,status:'canceled',access_until:'2026-11-09T18:00:00-03:00'};eq(c.render(),null,'mais de7dias');
 c.estado={...c.estado,allowed:false,access_until:'2026-11-04T18:00:00-03:00'};eq(c.render(),null,'bloqueado nao permanece com faixa de acesso');
 const longa=criarTela('components/FaixaAssinatura.tsx');longa.estado={...longa.estado,allowed:true,status:'active',access_until:'2026-11-30T15:00:00Z'};eq(longa.render(),null);longa.avancarTempo(10*86400000);longa.estado={...longa.estado,status:'canceled',access_until:'2026-11-14T18:00:00-03:00'};ok(text(longa.render()).includes('em 3 dias'),'active que vira canceled com app aberto usa hora atual, nao a da montagem');
 console.log(JSON.stringify({suite:'faixa-assinatura',checks}));
})().catch(e=>{console.error(e);process.exitCode=1;});

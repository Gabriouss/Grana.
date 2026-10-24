 'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {criarTela,nodes,text}=require('./assinar-vencida.cjs');
(async()=>{
 let checks=0;const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;};const ok=(v,n)=>{assert.ok(v,n);checks++;};
 const c=criarTela('components/BaixarMeusDadosBotao.tsx');let tree=c.render({acessoBloqueado:true});ok(text(tree).includes('Solicitar meus dados'));await tree.props.onPress();eq(c.exportacoes.length,0,'bloqueio nao pode gerar JSON vazio/completo');eq(c.alertas.length,1);ok(c.alertas[0][1].includes('sem precisar renovar'));
 const action=c.alertas[0][2].find(a=>a.text==='Solicitar pelo suporte');ok(action);action.onPress();await c.flush();ok(c.abertos[0].startsWith('mailto:suporte@granaponto.com.br'));
 tree=c.render({acessoBloqueado:false});await tree.props.onPress();eq(c.exportacoes.length,1,'fluxo de exportacao de acesso liberado preservado');eq(c.alertas.at(-1)[0],'Cópia gerada');
 const s=criarTela();const own=s.render();const button=nodes(own).find(n=>n.type==='@/components/BaixarMeusDadosBotao');eq(button.props.acessoBloqueado,true);
 const legal=fs.readFileSync('lib/legal-content.ts','utf8');ok(legal.includes('avisos sobre prazo e estado da assinatura'));ok(legal.includes('sem incluir seus lançamentos, saldos, cartões ou metas'));
 console.log(JSON.stringify({suite:'assinatura-dados-bloqueados',checks}));
})().catch(e=>{console.error(e);process.exitCode=1;});

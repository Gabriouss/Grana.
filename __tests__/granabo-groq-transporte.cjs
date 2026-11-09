// Transporte real, incluindo corpo/deadline. Sem rede nem credencial real.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const arquivo='supabase/functions/_shared/granabo-groq.ts';
function carregar(responder){const api={},calls=[],timers=new Map();let relogio=1000,seq=0;
  class Clock extends Date{static now(){return relogio;}}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(arquivo,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports:api,Date:Clock,AbortController,Response,Error,JSON,Promise,fetch:async(url,init)=>{calls.push({url,init});return responder(url,init);},
      setTimeout:(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
      console:{log(){throw Error('Não deve logar payload');},error(){throw Error('Não deve logar conteúdo');}}});
  return {api,calls,timers,avancar(ms){relogio+=ms;for(const [id,t]of [...timers])if(t.ms<=ms){timers.delete(id);t.fn();}}};
}
const payload={messages:[{role:'system',content:'Instruções completas fixture'},{role:'user',content:'Consulte meus registros fixture'}],
  tools:[{type:'function',function:{name:'consultaFixture',parameters:{type:'object',properties:{}}}}],tool_choice:'auto',temperature:0.2,max_tokens:1536};
const opts={key:'chave-fixture',deadline:28000};
async function main(){
  let c=carregar(async()=>Response.json({choices:[{message:{role:'assistant',content:'Texto fixture',reasoning:'raciocínio privado fixture'}}],usage:{total_tokens:80}}));
  let r=await c.api.chamarChatGroq({...payload,metadata:{email:'fixture@example.invalid'},store:true},opts);assert.equal(r.message.content,'Texto fixture');assert.ok(!JSON.stringify(r.message).includes('privado'));
  assert.equal(c.calls.length,1);assert.equal(c.calls[0].url,'https://api.groq.com/openai/v1/chat/completions');
  const body=JSON.parse(c.calls[0].init.body);assert.deepEqual(body.messages,payload.messages);assert.deepEqual(body.tools,payload.tools);
  assert.equal(body.include_reasoning,false);assert.equal(body.parallel_tool_calls,false);assert.equal(body.model,'openai/gpt-oss-120b');assert.equal(c.timers.size,0);
  assert.equal(body.metadata,undefined);assert.equal(body.store,undefined);
  c=carregar(async()=>Response.json({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'call-fixture',type:'function',function:{name:'consultaFixture',arguments:'{}'}}]}}]}));
  r=await c.api.chamarChatGroq(payload,opts);assert.equal(r.message.tool_calls[0].function.name,'consultaFixture');
  for(const status of [429,401,500,503]){c=carregar(async()=>new Response('conteúdo externo privado fixture',{status}));
    await assert.rejects(c.api.chamarChatGroq(payload,opts),e=>e.codigo===(status===429?'muitas_tentativas':'sem_provedor')&&!e.message.includes('privado'));
    assert.equal(c.calls.length,1,'não repete em limite nem amplia custo/prazo');assert.equal(c.timers.size,0);}
  for(const fase of ['headers','body']){let sinal;
    c=carregar(async(_url,init)=>{sinal=init.signal;return fase==='headers'?new Promise(()=>{}):{ok:true,json:()=>new Promise(()=>{})};});
    const p=c.api.chamarChatGroq(payload,{...opts,deadline:2500});await Promise.resolve();c.avancar(1500);
    await assert.rejects(p,e=>e.codigo==='demorou');assert.equal(sinal.aborted,true);assert.equal(c.timers.size,0);assert.equal(c.calls.length,1);}
  c=carregar(async()=>{throw Error('URL ou segredo externo fixture');});await assert.rejects(c.api.chamarChatGroq(payload,opts),e=>e.codigo==='sem_provedor'&&!e.message.includes('externo'));
  c=carregar(async()=>Response.json({choices:[]}));await assert.rejects(c.api.chamarChatGroq(payload,opts),e=>e.codigo==='sem_provedor');
  c=carregar(async()=>{throw Error('não devia chamar');});await assert.rejects(c.api.chamarChatGroq(payload,{...opts,key:''}));assert.equal(c.calls.length,0);
  await assert.rejects(c.api.chamarChatGroq(payload,{...opts,deadline:500}),e=>e.codigo==='demorou');assert.equal(c.calls.length,0);
  await assert.rejects(c.api.chamarChatGroq({...payload,tools:[{type:'browser_search'}]},opts));assert.equal(c.calls.length,0);
  console.log('Groq transporte real: formato/tools/payload, 429/erros, deadline de headers+corpo, sigilo e zero retry verdes.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

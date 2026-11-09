// Provedor e endpoint reais. Rede, autenticação e cota são fronteiras dubladas.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function ambiente(chave='fixture-groq'){
  const ctx={calls:[],env:[],logs:[],handler:null},cache=new Map();
  const overrides={
    'npm:@supabase/supabase-js@2.112.3':{createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'conta-fixture'}},error:null})}})},
    'npm:@supabase/supabase-js@2.112.3/cors':{corsHeaders:{}},
    '../_shared/ai-quota.ts':{consumirCotaIA:async()=>({permitido:true}),mensagemCotaEsgotada:()=> 'limite de teste'},
  };
  ctx.responder=async()=>Response.json({text:'mercado 32 reais'});
  function real(f){f=path.resolve(f);if(cache.has(f))return cache.get(f);const api={};cache.set(f,api);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports:api,Blob,File,FormData,Response,Request,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,AbortController,URL,setTimeout,clearTimeout,
      console:{log:(...a)=>ctx.logs.push(a),warn:(...a)=>ctx.logs.push(a),error:(...a)=>ctx.logs.push(a)},
      fetch:async(url,init)=>{ctx.calls.push({url,init});return ctx.responder(url,init);},
      Deno:{env:{get:k=>{ctx.env.push(k);return k==='GROQ_API_KEY'?chave:k==='OPENAI_API_KEY'?'fixture-openai-inutil':'fixture';}},serve:fn=>{ctx.handler=fn;}},
      require:id=>id in overrides?overrides[id]:real(path.resolve(path.dirname(f),id))}, {filename:f});return api;}
  ctx.shared=real('supabase/functions/_shared/voice-transcription.ts');
  real('supabase/functions/processar-lancamento-voz/index.ts');
  ctx.enviar=async()=>{const form=new FormData();form.append('audio',new File(['audio-fixture'],'fala.m4a',{type:'audio/m4a'}));
    return ctx.handler(new Request('https://fixture.invalid/voz',{method:'POST',headers:{Authorization:'Bearer fixture'},body:form}));};
  return ctx;
}
async function main(){
  let c=ambiente();const p=c.shared.provedoresPadrao('fixture-groq');
  assert.equal(p.length,1,'P7: só a Groq pode compor a configuração real');
  assert.equal(p[0].nome,'groq');assert.equal(p[0].url,'https://api.groq.com/openai/v1/audio/transcriptions');
  let r=await c.enviar();assert.equal(r.status,200);assert.equal((await r.json()).provedor,'groq');assert.equal(c.calls.length,1);
  assert.equal(c.calls[0].init.headers.Authorization,'Bearer fixture-groq');
  assert.ok(!c.env.includes('OPENAI_API_KEY'),'não consulta segredo do provedor retirado');
  for(const status of [429,500,503]){
    c=ambiente();c.responder=async()=>new Response('indisponível',{status});r=await c.enviar();
    assert.equal(r.status,422);assert.equal((await r.json()).code,'nao_entendi');assert.equal(c.calls.length,1);
    assert.ok(c.calls.every(x=>new URL(x.url).hostname==='api.groq.com'),'sem fallback remoto OpenAI');
  }
  c=ambiente('');r=await c.enviar();assert.equal(r.status,503);assert.equal((await r.json()).code,'sem_provedor');assert.equal(c.calls.length,0);
  assert.ok(!c.env.includes('OPENAI_API_KEY'));
  console.log('P7: configuração Groq única, endpoint real sucesso/falhas/sem chave e chamadas exatas verdes.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

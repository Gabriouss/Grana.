import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { criarExecutorSimulacao } from '../_shared/marketing-simulacao-executor.ts';

// verify_jwt=true. Serviço remoto + secret próprio; não é uma rota do navegador.
// MARKETING_SIM_EXECUTOR_ATIVO ausente deixa tudo desligado. Nenhum Graph API.
Deno.serve(criarExecutorSimulacao({
  env:nome=>Deno.env.get(nome),
  cliente:signal=>createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??signal})},
  }),
  log:linha=>console.log(linha),
}));

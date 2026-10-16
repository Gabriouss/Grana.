import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { criarHandlerAdmin } from '../_shared/admin-autorizacao.ts';
import { operacaoPublicacoesSimulacao } from '../_shared/admin-publicacoes-simulacao.ts';

// verify_jwt=true. API de SIMULAÇÃO: adaptador local fechado, nenhum Graph.
Deno.serve(criarHandlerAdmin({
  env:nome=>Deno.env.get(nome),
  cliente:(url,chave,signal)=>createClient(url,chave,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??signal})},
  }),
  log:linha=>console.log(linha),
},operacaoPublicacoesSimulacao));

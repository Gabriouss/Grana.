import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { criarHandlerAdmin } from '../_shared/admin-autorizacao.ts';
import { criarOperacaoAnalytics } from '../_shared/admin-analytics.ts';

// E7: agregados e snapshots, GET Meta compartilhado com E4. verify_jwt=true.
// Sem experimento em execução, criação de pedido ou alteração externa.
Deno.serve(criarHandlerAdmin({
  env:nome=>Deno.env.get(nome),
  cliente:(url,chave,signal)=>createClient(url,chave,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??signal})},
  }),
  log:linha=>console.log(linha),
},criarOperacaoAnalytics(nome=>Deno.env.get(nome))));

import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { criarHandlerAdmin } from '../_shared/admin-autorizacao.ts';
import { criarOperacaoMeta } from '../_shared/admin-meta.ts';

// Somente GET no Graph, sem Pixel/CAPI, campanhas novas ou mudança de verba.
// Publicar futuramente com verify_jwt=true; segredo nunca chega ao navegador.
Deno.serve(criarHandlerAdmin({
  env: nome => Deno.env.get(nome),
  cliente: (url,chave,signal) => createClient(url,chave,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??signal})},
  }),
  log:linha=>console.log(linha),
},criarOperacaoMeta(nome=>Deno.env.get(nome))));

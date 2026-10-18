import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { criarHandlerAdmin } from '../_shared/admin-autorizacao.ts';
import { criarOperacaoPublicacoesReais } from '../_shared/admin-publicacoes-reais.ts';
// verify_jwt=true. Somente o gate compartilhado cria cliente privilegiado.
Deno.serve(criarHandlerAdmin({env:n=>Deno.env.get(n),cliente:(url,chave,signal)=>createClient(url,chave,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??signal,redirect:'error'})},
}),log:linha=>console.log(linha)},criarOperacaoPublicacoesReais()));

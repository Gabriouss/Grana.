import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { criarExecutorReal } from '../_shared/marketing-real-executor.ts';
// verify_jwt=true MAIS secret de servico; sem flag explicita nao cria cliente.
Deno.serve(criarExecutorReal({env:n=>Deno.env.get(n),cliente:signal=>createClient(
 Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??signal,redirect:'error'})},
 }),log:linha=>console.log(linha)}));

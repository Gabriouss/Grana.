import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { criarHandlerAvisosAssinatura } from '../_shared/avisos-assinatura.ts';

Deno.serve(criarHandlerAvisosAssinatura({
  env: nome=>Deno.env.get(nome),
  cliente: signal=>createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{fetch:(input,init)=>fetch(input,{...init,signal})},
  }),
}));

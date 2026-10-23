import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { criarOperadorIncidentes } from '../_shared/marketing-real-incidentes.ts';
// verify_jwt=true + MARKETING_MONITOR_SECRET. Cron remoto independente do worker.
Deno.serve(criarOperadorIncidentes('monitor',{env:n=>Deno.env.get(n),log:s=>console.log(s),
 cliente:signal=>createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??signal,redirect:'error'})},
 })}));

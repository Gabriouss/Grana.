import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { criarHandlerAdmin } from '../_shared/admin-autorizacao.ts';
import { operacaoFeedbacks } from '../_shared/admin-feedbacks.ts';

// Leitura dos feedbacks do app pelo painel admin. Só leitura, atrás do mesmo portão das
// outras funções admin (allowlist, aal2 + TOTP). Publicar com verify_jwt=true (padrão).
Deno.serve(criarHandlerAdmin({
  env: (nome) => Deno.env.get(nome),
  cliente: (url, chave, signal) => createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? signal }) },
  }),
  log: (linha) => console.log(linha),
}, operacaoFeedbacks));

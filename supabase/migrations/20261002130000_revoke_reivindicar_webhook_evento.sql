-- Fecha no repositorio o que a producao ja tem (sonda S2, 02/10/2026).
--
-- `reivindicar_webhook_evento` e security definer e so quem chama e o webhook,
-- com service_role. Em producao a chave anonima recebe 42501 (sem execute), mas
-- as migrations (20260909170000) nunca revogaram: so o `schema.sql` tinha o
-- revoke. Um banco novo montado pelas migrations deixaria a funcao executavel
-- por `anon` e `authenticated`. Revogar de novo e inofensivo onde ja esta.

revoke all on function public.reivindicar_webhook_evento(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.reivindicar_webhook_evento(text, text, text, text)
  to service_role;

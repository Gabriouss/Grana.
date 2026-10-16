-- NÃO APLICADA em produção até a liberação do autor (V-1, 15/10/2026).
--
-- Tira de anon e authenticated privilégios de tabela que nenhum caminho do app
-- usa. RLS filtra linha a linha, mas TRUNCATE não passa por RLS, e TRIGGER,
-- REFERENCES e MAINTAIN (LOCK TABLE, VACUUM, REINDEX) não deveriam estar com
-- quem chega pela API. Vieram do default ACL do Supabase (`arwdDxtm`).
--
-- Só retira acesso que hoje não tem efeito útil: escrita sem política de RLS
-- correspondente já é recusada ou afeta zero linhas. SELECT fica onde está,
-- porque `lib/exportar-meus-dados.ts` lê `feedbacks` e `subscriptions` e um
-- revoke trocaria a lista vazia por erro. Estado anterior guardado fora do
-- repositório (grants-antes-V1.md da rodada).

-- 1. Nada de TRUNCATE, TRIGGER, REFERENCES ou MAINTAIN para quem chega pela API.
revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated;

-- 2. anon não escreve em tabela nenhuma: nenhuma política de escrita alcança
--    anon (a única com role public, em user_achievements, exige auth.uid()).
revoke insert, update, delete on all tables in schema public from anon;

-- 3. authenticated: escrita sem política de RLS para o comando.
revoke update, delete on public.feedbacks from authenticated;              -- só INSERT do dono
revoke insert, update, delete on public.subscriptions from authenticated;  -- só SELECT; escrita por RPC/service_role
revoke insert, update, delete on public.app_release from authenticated;    -- só SELECT; escrita por publicar_app_release
revoke update on public.credit_card_invoices from authenticated;           -- políticas SELECT, INSERT, DELETE
revoke select, insert, update, delete on public.whatsapp_pending from authenticated; -- sem política; só o servidor

-- 4. Funções que anon não tem por que chamar. As duas primeiras são SECURITY
--    INVOKER e a assistente-financeiro as chama com o JWT do usuário, então
--    authenticated continua com EXECUTE. A terceira é função de gatilho.
--    PUBLIC também tinha EXECUTE (ACL =X); revogar só anon deixava o acesso
--    herdado aberto. Os grants explícitos de authenticated/service_role ficam.
revoke execute on function public.buscar_exemplos_similares(uuid, text, integer) from public, anon;
revoke execute on function public.registrar_memoria_assistente(uuid, text, text, text) from public, anon;
revoke execute on function public.validar_wallet_do_usuario() from public, anon;

-- 5. Tabelas futuras criadas pelo postgres (o dono das migrations) nascem sem
--    esses privilégios. O default de supabase_admin não é alterável por postgres.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke insert, update, delete on tables from anon;

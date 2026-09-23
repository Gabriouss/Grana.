-- 23/09/2026 — Funções internas de trigger não são RPCs públicas.
--
-- A auditoria de backend encontrou estas três funções SECURITY DEFINER com
-- EXECUTE herdado por PUBLIC (e, por consequência, disponível para anon e
-- authenticated). Elas retornam `trigger`, então uma chamada direta não
-- consegue executá-las fora do contexto de um gatilho, mas manter o privilégio
-- aberto viola o princípio de privilégio mínimo e transforma uma limitação de
-- implementação na única barreira de segurança.
--
-- Os triggers já instalados continuam funcionando: o executor do trigger não
-- precisa receber EXECUTE nessas funções a cada alteração de linha. O dono do
-- banco continua podendo recriar os gatilhos quando necessário.

revoke all on function public.handle_new_user_wallet()
  from public, anon, authenticated;

revoke all on function public.preencher_wallet_padrao()
  from public, anon, authenticated;

revoke all on function public.reatribuir_wallet_antes_de_excluir()
  from public, anon, authenticated;

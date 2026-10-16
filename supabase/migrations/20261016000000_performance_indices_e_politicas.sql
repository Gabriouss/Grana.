-- NÃO APLICADA em produção até a liberação do autor (B4, 16/10/2026).
--
-- Advisors de performance do Supabase, só a parte que não muda resultado de
-- consulta nenhuma.
--
-- 1. Três chaves estrangeiras sem índice nenhum na coluna que referencia. Apagar
--    a linha pai (conta da série, cartão, pedido de ajuste) varre a tabela
--    filha inteira. As outras dez que o advisor lista são compostas
--    (user_id, x) e já têm índice em x, que atende à checagem; ficam como estão.
--    Sem CONCURRENTLY: a migration roda numa transação só, e as tabelas têm
--    dezenas de linhas (bills 21, whatsapp_pending e admin_ajuste_pedidos
--    quase vazias), então o bloqueio dura milissegundos.
create index if not exists bills_parent_id_idx
  on public.bills (parent_id) where parent_id is not null;
create index if not exists whatsapp_pending_card_id_idx
  on public.whatsapp_pending (card_id) where card_id is not null;
create index if not exists admin_ajuste_pedidos_pai_idx
  on public.admin_ajuste_pedidos (pai) where pai is not null;

-- 2. Duas políticas permissivas de SELECT na mesma tabela fazem o Postgres
--    avaliar as duas em toda leitura. A "dono com acesso escreve" era FOR ALL,
--    então também cobria SELECT, mas com condição mais estreita que a
--    "dono le sempre" (dono E com acesso). Como as permissivas se somam por OU,
--    o SELECT efetivo sempre foi só "é o dono". Dividir a FOR ALL em INSERT,
--    UPDATE e DELETE com as MESMAS condições deixa uma política de SELECT só e
--    o resultado de toda consulta idêntico.
drop policy if exists "assistant_messages: dono com acesso escreve" on public.assistant_messages;
create policy "assistant_messages: dono com acesso insere"
  on public.assistant_messages for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.tem_direito_acesso()));
create policy "assistant_messages: dono com acesso altera"
  on public.assistant_messages for update to authenticated
  using ((select auth.uid()) = user_id and (select public.tem_direito_acesso()))
  with check ((select auth.uid()) = user_id and (select public.tem_direito_acesso()));
create policy "assistant_messages: dono com acesso apaga"
  on public.assistant_messages for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.tem_direito_acesso()));

drop policy if exists "assistant_memory: dono com acesso escreve" on public.assistant_memory;
create policy "assistant_memory: dono com acesso insere"
  on public.assistant_memory for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.tem_direito_acesso()));
create policy "assistant_memory: dono com acesso altera"
  on public.assistant_memory for update to authenticated
  using ((select auth.uid()) = user_id and (select public.tem_direito_acesso()))
  with check ((select auth.uid()) = user_id and (select public.tem_direito_acesso()));
create policy "assistant_memory: dono com acesso apaga"
  on public.assistant_memory for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.tem_direito_acesso()));

-- Fora desta migration, de propósito: os 13 índices "sem uso". O banco é novo,
-- vários cobrem chave estrangeira (wallet_id, card_id, paid_transaction_id) e
-- apagar índice por estatística de poucos usuários troca um custo pequeno de
-- escrita por varredura quando a base crescer.

-- 23/09/2026 — O Granabô recusa conta bloqueada.
--
-- Decisão do autor, respondendo à pergunta 1 da auditoria de backend de
-- 23/09/2026 ("confirmam que o Granabô deveria recusar uma conta bloqueada,
-- em vez de responder normalmente com dados vazios?"): "Sim".
--
-- O QUE ESTAVA ERRADO. Toda tabela de dado financeiro deste projeto tem
-- `and (select public.tem_direito_acesso())` na política de RLS. As duas
-- tabelas do assistente eram a exceção: a política era só
-- `auth.uid() = user_id`. Ou seja, uma conta sem assinatura não conseguia
-- criar lançamento pelo chat (a RPC `registrar_operacao_voz` checa e recusa
-- com 42501), mas continuava gravando histórico de conversa e memória de
-- vocabulário, fatos e preferências — e gastando cota de IA no caminho. A
-- recusa de verdade fica na Edge Function `assistente-financeiro`, que passa
-- a checar `tem_direito_acesso()` antes de qualquer gasto; esta migration
-- fecha a porta de trás, para que a regra não dependa de uma única camada.
--
-- A ESCOLHA QUE IMPORTA: bloqueia ESCRITA, não LEITURA. Fosse uma política
-- `for all` com a checagem, quem perdesse o acesso deixaria de enxergar o
-- próprio histórico de conversa — e isso quebraria o "Baixar meus dados"
-- (`lib/exportar-meus-dados.ts`), que lê estas duas tabelas com a sessão da
-- própria pessoa para atender o art. 18 da LGPD. Cobrar pela ferramenta é
-- legítimo; reter o que já é da pessoa, não. Então: `select` continua livre
-- para o dono, e `insert`/`update`/`delete` exigem direito de acesso.
--
-- De quebra, as duas políticas passam a usar `(select auth.uid())` e
-- `to authenticated`, que é o padrão do resto do schema (o `auth.uid()` cru
-- é reavaliado linha a linha).
--
-- NÃO aplicada em produção por esta sessão: aplicar é decisão do autor
-- (regra 11 do AGENTS.md). Este projeto não tem
-- `supabase_migrations.schema_migrations`, então a aplicação é manual e
-- precisa ser registrada quando acontecer.

drop policy if exists "usuario acessa proprio historico" on public.assistant_messages;

create policy "assistant_messages: dono le sempre"
  on public.assistant_messages for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "assistant_messages: dono com acesso escreve"
  on public.assistant_messages for all to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  )
  with check (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  );

drop policy if exists "usuario acessa propria memoria" on public.assistant_memory;

create policy "assistant_memory: dono le sempre"
  on public.assistant_memory for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "assistant_memory: dono com acesso escreve"
  on public.assistant_memory for all to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  )
  with check (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  );

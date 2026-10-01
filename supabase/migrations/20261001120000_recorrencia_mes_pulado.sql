-- 01/10/2026 — O mês apagado de uma assinatura continua apagado.
--
-- Relato do autor, no dia em que a build 1.10.5 saiu: "não está sendo possível
-- excluir lançamentos da lista de débito/pix".
--
-- O QUE ACONTECIA. Um lançamento marcado "repetir mensalmente" é a cabeça de
-- uma série, e o app cria a ocorrência de cada mês novo quando a tela de
-- Lançamentos ou de Crédito carrega (`ocorrenciasFaltantes`, em
-- lib/recorrencia.ts). A regra era "todo mês da série que não tem lançamento
-- precisa de um". Só que apagar a ocorrência de um mês deixa exatamente esse
-- mês sem lançamento — e a recarga que vem logo depois do `delete` recriava a
-- linha. Visto na rede, em 01/10/2026: `DELETE 204` seguido, na mesma
-- recarga, das duas buscas do contexto de recorrência. Para quem olha a tela,
-- o lançamento simplesmente não sai.
--
-- Não é defeito da build nova: a regra é antiga. Apareceu no dia 1º porque é
-- quando toda série gera a ocorrência do mês e a pessoa vai conferir a lista.
--
-- O QUE FALTAVA era memória. "Não existe" e "foi apagado de propósito" são
-- estados diferentes, e o banco só sabia representar o primeiro. Esta coluna
-- guarda, na CABEÇA da série, os meses que a pessoa removeu ('AAAA-MM').
--
-- Fica na cabeça, e não numa tabela à parte, porque some junto com ela: apagar
-- a série (ou a conta) leva a lista de meses pulados sem precisar de mais uma
-- cascata para lembrar.
--
-- A função existe porque acrescentar um item a um array não se escreve pela
-- API REST sem ler antes, e ler-e-gravar do aparelho perderia um mês quando
-- dois aparelhos apagassem ao mesmo tempo. Ela roda como quem chama
-- (`security invoker`), então a RLS de `transactions` continua valendo: só o
-- dono, e só com direito de acesso.
--
-- NÃO aplicada em produção por esta sessão. Enquanto não for, o app apaga como
-- sempre e registra no log que não conseguiu marcar o mês; o lançamento volta,
-- que é o comportamento de hoje, sem piorar nada.

alter table public.transactions
  add column if not exists recurrence_skipped_months text[] not null default '{}';

comment on column public.transactions.recurrence_skipped_months is
  'Na cabeça de uma série recorrente: meses (AAAA-MM) cuja ocorrência a pessoa apagou de propósito e que não devem ser recriados.';

-- UPDATE é o que a função abaixo usa. INSERT entra junto pela regra de
-- __tests__/transactions-grant-colunas.cjs: coluna nova sem grant de INSERT já
-- derrubou gravação com "permission denied" (25/09/2026) quando um insert
-- passou a enviar o campo. É dado do próprio dono; conceder não abre nada.
grant insert (recurrence_skipped_months) on public.transactions to authenticated;
grant update (recurrence_skipped_months) on public.transactions to authenticated;

create or replace function public.pular_mes_da_recorrencia(p_cabeca uuid, p_mes text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_mes !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mês inválido: %', p_mes using errcode = '22023';
  end if;

  update public.transactions
     set recurrence_skipped_months = array(
           select distinct m from unnest(recurrence_skipped_months || p_mes) as m order by m
         )
   where id = p_cabeca
     and user_id = (select auth.uid());
end;
$$;

revoke all on function public.pular_mes_da_recorrencia(uuid, text) from public, anon;
grant execute on function public.pular_mes_da_recorrencia(uuid, text) to authenticated;

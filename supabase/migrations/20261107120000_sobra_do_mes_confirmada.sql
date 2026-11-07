-- Sobra do mês anterior confirmada pela pessoa (pedido do autor, 07/11/2026,
-- regra 20). NÃO APLICADA: só pelo roteiro de implantação autorizado.
--
-- O app não sabe o saldo real do banco, então nenhuma sobra calculada é
-- confiável ("vai dizer que eu tô com saldo liberado, mas eu tô com
-- absolutamente R$0 na conta"). Na virada do mês a Início pergunta quanto
-- sobrou; só o valor CONFIRMADO entra no Livre do mês `mes`. Sem linha, a
-- sobra é zero. Não é receita, não aparece em lançamentos, não muda carteira
-- e não acumula: cada mês tem a sua linha.
--
-- Cliente antigo (APK sem esta função) não lê a tabela e segue igual. Cliente
-- novo sem a tabela aplicada recebe PGRST205/42P01, trata como "recurso ainda
-- não ligado": sobra zero e nenhuma pergunta.
create table if not exists public.sobra_do_mes (
  user_id uuid not null references auth.users(id) on delete cascade,
  mes text not null check (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  valor numeric(14,2) not null check (valor >= 0 and valor <= 99999999.99),
  confirmado_em timestamptz not null default now(),
  primary key (user_id, mes)
);

alter table public.sobra_do_mes enable row level security;
revoke all on public.sobra_do_mes from public, anon, authenticated;
grant select, insert, update on public.sobra_do_mes to authenticated;
grant select, insert, update, delete on public.sobra_do_mes to service_role;

drop policy if exists "sobra_do_mes: dono le" on public.sobra_do_mes;
create policy "sobra_do_mes: dono le"
  on public.sobra_do_mes for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "sobra_do_mes: dono com acesso insere" on public.sobra_do_mes;
create policy "sobra_do_mes: dono com acesso insere"
  on public.sobra_do_mes for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.tem_direito_acesso()));
drop policy if exists "sobra_do_mes: dono com acesso altera" on public.sobra_do_mes;
create policy "sobra_do_mes: dono com acesso altera"
  on public.sobra_do_mes for update to authenticated
  using ((select auth.uid()) = user_id and (select public.tem_direito_acesso()))
  with check ((select auth.uid()) = user_id and (select public.tem_direito_acesso()));

-- Carimbo do servidor em toda gravação: o cliente não escolhe a data.
create or replace function public.sobra_do_mes_carimbo() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.confirmado_em := now();
  return new;
end $$;
drop trigger if exists sobra_do_mes_carimbo on public.sobra_do_mes;
create trigger sobra_do_mes_carimbo before insert or update on public.sobra_do_mes
  for each row execute function public.sobra_do_mes_carimbo();

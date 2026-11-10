-- 09/11/2026 - Conta recorrente movida de mes nao duplica, em QUALQUER versao do app.
-- NAO aplicada: aplicacao pelo Supremo, em modo manual, depois da revisao do Claude Code #2.
--
-- O DEFEITO. A serie ocupa o mes pela data (lib/recorrencia.ts, ocorrenciasFaltantes):
-- mudar a data de uma ocorrencia (ou da cabeca) para outro mes deixa o mes de origem
-- vazio, e a proxima carga da tela recria a conta nele. Exemplo: aluguel de 01/11
-- pago em 30/10; a pessoa muda a data para 30/10 e novembro volta: dois alugueis.
-- `updateTransaction` (lib/data.ts) grava a data sem olhar a recorrencia, e o banco
-- so protegia o mes APAGADO (20261001130000). Vale no APK 1.10.12 e no app da Play.
--
-- A CORRECAO segue o mesmo mecanismo do mes apagado, para valer na build antiga:
-- `pular_mes_ao_mover_ocorrencia` (BEFORE UPDATE OF occurred_on) poe o mes de
-- origem em `recurrence_skipped_months` da cabeca. O app novo ja nao gera mes pulado;
-- o app antigo tenta, e `ignorar_ocorrencia_de_mes_pulado` descarta a linha sozinha,
-- sem derrubar o lote. NUNCA recusa com erro: o APK 1.10.12 nao trata a recusa
-- (regra 9) e a edicao da pessoa tem de passar.
--
--   * Ocorrencia (parent_id, fora parcela): marca o mes de origem na cabeca.
--   * Cabeca (recurring, sem parent_id, fora parcela): e a ancora das datas. Movida
--     para tras, o mes de origem passa a ser gerado (cabeca + 1 mes) e duplicaria:
--     marcar resolve. Movida para frente, o mes de origem fica antes da cabeca e
--     nunca e gerado: a marca e inofensiva. Por isso a regra e a mesma nos dois
--     sentidos, gravada direto em NEW (a lista mora na propria cabeca).
--   * Mesmo mes, parcela, linha sem serie: nada.
--   * Mes de origem FUTURO (depois do mes atual em Sao Paulo): nada. Ele ainda nao foi
--     gerado, entao nao ha o que proteger, e marca-lo o faria nunca nascer: desfazer
--     uma mudanca (05/11 -> 05/12 -> 05/11) ou corrigir o inicio de uma serie criada
--     no mes seguinte (L1 do Lynx, 09/11). Pagar adiantado conta lancada em mes futuro
--     volta a duplicar como antes: visivel, e se resolve apagando.
--
-- Limite conhecido (o mesmo de antes, nao introduzido aqui): mover para um mes
-- FUTURO ainda nao gerado faz a linha movida ocupar aquele mes, e a ocorrencia
-- propria dele nao e gerada. O servidor nao tem como criar a do mes futuro sem
-- adivinhar; fica no relatorio para decisao.
--
-- Retorno: `drop trigger if exists pular_mes_ao_mover_ocorrencia on public.transactions;`
-- e `drop function if exists public.pular_mes_ao_mover_ocorrencia();`. Os meses ja
-- marcados ficam marcados (sao meses que de fato estao ocupados por outra data).
--
-- Limite conhecido L4 (revisao do Lynx, 09/11; baixo e latente, nao bloqueia): um UPDATE de
-- VARIAS linhas no mesmo comando que muda o mes da cabeca E de uma ocorrencia dela pode falhar
-- com 27000 (tuple to be updated was already modified by an operation triggered by the current
-- command), quando a ocorrencia e processada antes da cabeca: o gatilho dela atualiza a cabeca que
-- o comando externo ainda vai atualizar. Depende da ordem das linhas. Nenhum caminho do app chega
-- a isso (updateTransaction edita uma linha por id; a E7 muda uma linha e nao troca o mes de
-- serie); so SQL manual em lote ou feature futura que mova a serie inteira. Correcao, se um dia
-- for preciso: dividir em BEFORE (cabeca, grava em NEW) e AFTER (ocorrencia, atualiza a cabeca no
-- fim do comando, como o gatilho de delete). Registrado aqui, fora do corpo, para o md5 do corpo
-- aprovado (88711361...dd1c7) nao mudar.
--
-- ASCII de proposito nos corpos (licao do T-UTF8). A funcao do gatilho nao e chamavel
-- por public, anon nem authenticated, como as outras desde a 20260923220000.

do $$
begin
  if pg_catalog.to_regprocedure('public.ignorar_ocorrencia_de_mes_pulado()') is null
     or not exists (select 1 from pg_catalog.pg_attribute
                     where attrelid = 'public.transactions'::regclass
                       and attname = 'recurrence_skipped_months' and not attisdropped) then
    raise exception 'Requer 20261001120000 e 20261001130000 (meses pulados) aplicadas';
  end if;
end $$;

create or replace function public.pular_mes_ao_mover_ocorrencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mes text;
begin
  if new.occurred_on is not distinct from old.occurred_on
     or to_char(new.occurred_on, 'YYYY-MM') = to_char(old.occurred_on, 'YYYY-MM')
     or coalesce(old.installment_total, 1) > 1
     -- Mes de origem FUTURO ainda nao foi gerado: nada a proteger, e marcar o faria nunca nascer (L1 do Lynx).
     or to_char(old.occurred_on, 'YYYY-MM') > to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM') then
    return new;
  end if;

  v_mes := to_char(old.occurred_on, 'YYYY-MM');

  if old.parent_id is not null then
    update public.transactions
       set recurrence_skipped_months = array(
             select distinct m
               from unnest(recurrence_skipped_months || v_mes) as m
              order by m
           )
     where id = old.parent_id
       and user_id = old.user_id
       and not (v_mes = any (recurrence_skipped_months));
  elsif old.recurring then
    if not (v_mes = any (coalesce(new.recurrence_skipped_months, '{}'))) then
      new.recurrence_skipped_months := array(
        select distinct m
          from unnest(coalesce(new.recurrence_skipped_months, '{}') || v_mes) as m
         order by m
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.pular_mes_ao_mover_ocorrencia()
  from public, anon, authenticated;

drop trigger if exists pular_mes_ao_mover_ocorrencia on public.transactions;
create trigger pular_mes_ao_mover_ocorrencia
  before update of occurred_on on public.transactions
  for each row execute function public.pular_mes_ao_mover_ocorrencia();

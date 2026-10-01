-- 01/10/2026 — O mes apagado de uma serie fica apagado em QUALQUER versao do app.
--
-- Continua a 20261001120000, do mesmo dia. Aquela criou a coluna
-- `recurrence_skipped_months` e deixou o APLICATIVO responsavel por duas
-- coisas: marcar o mes ao apagar (chamando `pular_mes_da_recorrencia`) e nao
-- recriar mes marcado (em `ocorrenciasFaltantes`). Funciona na versao nova.
--
-- O QUE AQUELA SOLUCAO NAO COBRIA. O autor confirmou em 01/10/2026 que os dois
-- lancamentos que nao conseguia apagar eram recorrentes ("ambos recorrentes"),
-- e isso expoe o buraco: a build 1.10.5 instalada no aparelho — e toda build
-- anterior, em qualquer aparelho — nao conhece a lista de meses pulados. Entao:
--
--   1. apagar pelo celular nao marca mes nenhum, e o lancamento volta, como
--      sempre voltou;
--   2. pior, apagar pela WEB (que ja marca o mes) e DESFEITO pelo celular: na
--      proxima vez que a tela de Lancamentos ou de Credito carrega la, o codigo
--      antigo ve o mes "faltando" e recria a ocorrencia.
--
-- Regra que depende de todo cliente estar atualizado nao e regra. E o autor
-- decidiu no mesmo dia que nao sai build nova por enquanto (teto de 3 por
-- semana, regra 22 do AGENTS.md), entao a correcao precisa valer para a build
-- que ja esta na mao das pessoas.
--
-- A REGRA PASSA PARA O BANCO, com dois gatilhos em `transactions`:
--
--   * `pular_mes_ao_apagar_ocorrencia` (AFTER DELETE): apagou a ocorrencia de
--     uma serie, o mes entra na lista da cabeca. Na MESMA transacao do delete,
--     entao nao existe mais a janela em que o delete passa e a marca nao.
--
--   * `ignorar_ocorrencia_de_mes_pulado` (BEFORE INSERT): tentativa de criar a
--     ocorrencia de um mes pulado e descartada, linha a linha. Descartar, e
--     nao recusar com erro, e de proposito: o app antigo cria as ocorrencias de
--     TODAS as series num unico INSERT de varias linhas, e uma excecao
--     derrubaria o lote inteiro — as assinaturas que a pessoa nao apagou
--     deixariam de ser geradas. `return null` tira so a linha indesejada.
--
-- "Ocorrencia de serie" e linha com `parent_id` que nao e parcela. Parcelamento
-- tambem usa `parent_id`; `installment_total > 1` e o que separa os dois, pela
-- mesma regra de lib/recorrencia.ts.
--
-- O que acontece nos outros caminhos que apagam linhas:
--   - apagar a CABECA leva os filhos em cascata; o gatilho roda para cada
--     filho, procura a cabeca, nao acha (ja saiu) e nao faz nada;
--   - exclusao da conta e `delete ... where user_id = ...` apagam cabeca e
--     filhos no mesmo comando, e caem no mesmo caso;
--   - `reabrir_conta`, `reabrir_fatura_cartao` e o desfazer da voz apagam
--     lancamentos sem `parent_id` ou parcelas: fora da condicao.
--
-- `pular_mes_da_recorrencia` sai: com o gatilho, a chamada do aplicativo virou
-- redundante, e uma regra com dois donos e como ela envelhece torta. O app que
-- ainda a chamar recebe PGRST202, registra no log e segue — a exclusao em si
-- nunca dependeu dela.
--
-- ASCII de proposito nos corpos das funcoes (licao do T-UTF8).
--
-- As funcoes de gatilho nao sao chamaveis por `public`, `anon` nem
-- `authenticated`, como as outras desde a 20260923220000.

create or replace function public.pular_mes_ao_apagar_ocorrencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mes text;
begin
  if old.parent_id is null or coalesce(old.installment_total, 1) > 1 then
    return null;
  end if;

  v_mes := to_char(old.occurred_on, 'YYYY-MM');

  update public.transactions
     set recurrence_skipped_months = array(
           select distinct m
             from unnest(recurrence_skipped_months || v_mes) as m
            order by m
         )
   where id = old.parent_id
     and user_id = old.user_id
     and not (v_mes = any (recurrence_skipped_months));

  return null;
end;
$$;

revoke all on function public.pular_mes_ao_apagar_ocorrencia()
  from public, anon, authenticated;

drop trigger if exists pular_mes_ao_apagar_ocorrencia on public.transactions;
create trigger pular_mes_ao_apagar_ocorrencia
  after delete on public.transactions
  for each row execute function public.pular_mes_ao_apagar_ocorrencia();

create or replace function public.ignorar_ocorrencia_de_mes_pulado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is not null
     and coalesce(new.installment_total, 1) <= 1
     and exists (
       select 1
         from public.transactions cabeca
        where cabeca.id = new.parent_id
          and cabeca.user_id = new.user_id
          and to_char(new.occurred_on, 'YYYY-MM') = any (cabeca.recurrence_skipped_months)
     )
  then
    return null;
  end if;

  return new;
end;
$$;

revoke all on function public.ignorar_ocorrencia_de_mes_pulado()
  from public, anon, authenticated;

drop trigger if exists ignorar_ocorrencia_de_mes_pulado on public.transactions;
create trigger ignorar_ocorrencia_de_mes_pulado
  before insert on public.transactions
  for each row execute function public.ignorar_ocorrencia_de_mes_pulado();

drop function if exists public.pular_mes_da_recorrencia(uuid, text);

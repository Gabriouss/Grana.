-- 01/10/2026 — Apagar a origem de uma serie ENCERRADA nao leva os meses antigos.
--
-- Achado da revisao do Keel (01/10/2026), confirmado lendo o codigo: o botao
-- "Este e os proximos" (`encerrarSerieAPartirDe`, lib/data.ts) para a serie
-- desligando `recurring` na ORIGEM e apaga as ocorrencias dali em diante; os
-- meses anteriores ficam de proposito. So que `transactions.parent_id` e
-- `on delete cascade`: depois, apagar a origem (que na tela e um lancamento
-- comum, porque `recurring` virou false) leva TODOS os meses que ficaram, sem
-- uma palavra de aviso. O mesmo vale para quem desliga "repetir" na edicao.
--
-- A regra passa para o BANCO, e nao so para a pergunta do app, pelo mesmo
-- motivo da 20261001130000: o aparelho tem a build antiga na mao, e correcao
-- que mora so no cliente nao chega a ele.
--
-- AFTER DELETE na origem com `recurring = false`: as filhas deixam de apontar
-- para ela (`parent_id = null`) e passam a ser lancamentos comuns
-- (`recurring = false`). O segundo campo e essencial: uma filha solta com
-- `recurring = true` viraria CABECA de uma serie nova (a geracao de
-- lib/recorrencia.ts procura `recurring and parent_id is null`) e cada mes
-- antigo comecaria a se repetir sozinho.
--
-- POR QUE AFTER, E POR QUE O NOME DO GATILHO COMECA COM "A0_". Um BEFORE DELETE
-- que atualiza as filhas quebra o `delete` em massa (exclusao da conta, que
-- apaga origem e filhas no mesmo comando): o Postgres recusa com 27000 "tuple
-- to be deleted was already modified by an operation triggered by the current
-- command", e a conta nao se apagava. Provado no PGlite antes de trocar. Com
-- AFTER, o gatilho roda no fim do comando, quando as filhas do delete em massa
-- ja sairam e o update nao acha nada. E ele precisa rodar ANTES do gatilho da
-- chave estrangeira (`RI_ConstraintTrigger_a_*`, que faz o cascade): o Postgres
-- dispara gatilhos do mesmo evento em ordem alfabetica (C), e "A0_" vem antes
-- de "RI_". Se uma versao futura do Postgres mudar essa ordem, o teste de
-- PGlite (origem encerrada solta as filhas) acusa.
--
-- O que NAO muda:
--   - origem com `recurring = true` continua levando a serie em cascata: e o
--     "Excluir a serie inteira", que a pergunta ja avisa;
--   - parcelas (`installment_total > 1`) ficam como estao: a cabeca de uma
--     compra parcelada leva as parcelas, como sempre levou;
--   - ocorrencia (linha com `parent_id`) nao e afetada.
--
-- Efeito no app: a pergunta de excluir (lib/excluir-lancamento.ts) avisa, hoje,
-- que apagar a origem encerrada leva os meses ligados a ela. Depois desta
-- migration o aviso fica falso e deve ser retirado junto (o comentario no
-- codigo diz onde).
--
-- NAO aplicada por esta sessao: aplicar e decisao do autor (regra 11).
-- ASCII de proposito nos corpos das funcoes.

create or replace function public.soltar_filhas_da_origem_encerrada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.recurring is not distinct from true
     or coalesce(old.installment_total, 1) > 1 then
    return null;
  end if;

  update public.transactions
     set parent_id = null,
         recurring = false
   where parent_id = old.id
     and user_id = old.user_id
     and coalesce(installment_total, 1) <= 1;

  return null;
end;
$$;

revoke all on function public.soltar_filhas_da_origem_encerrada()
  from public, anon, authenticated;

drop trigger if exists "A0_soltar_filhas_da_origem_encerrada" on public.transactions;
create trigger "A0_soltar_filhas_da_origem_encerrada"
  after delete on public.transactions
  for each row execute function public.soltar_filhas_da_origem_encerrada();

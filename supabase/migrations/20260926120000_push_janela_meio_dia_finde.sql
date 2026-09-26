-- Janela de push `meio_dia_finde`: meio-dia de sábado e domingo, ligada pelo
-- mesmo `almoco_ativo` da janela `almoco` (dias úteis). Decisão do autor de
-- 25/09/2026 ("Sim" ao lembrete de meio-dia no fim de semana); o app agenda a
-- versão local desde `0b8d2fe`, e `enviar-lembretes-habito` passa a criar a
-- entrega remota.
--
-- ORDEM NO DIA DA BUILD: aplicar esta migration ANTES de publicar
-- `enviar-lembretes-habito`. Sem ela o CHECK recusa a janela nova; a função
-- grava essa janela num upsert separado e só registra o erro, mas o
-- meio-dia do fim de semana não sai.
--
-- Nome da restrição conferido em produção em 26/09/2026:
-- push_habit_deliveries_janela_check = CHECK (janela IN ('noite','almoco')).

alter table public.push_habit_deliveries
  drop constraint if exists push_habit_deliveries_janela_check;

alter table public.push_habit_deliveries
  add constraint push_habit_deliveries_janela_check
    check (janela in ('noite', 'almoco', 'meio_dia_finde'));

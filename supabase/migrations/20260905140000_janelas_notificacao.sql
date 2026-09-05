-- Segunda janela de lembrete de habito (almoco, fixa as 12h, dias uteis),
-- alem da janela "noite" que ja existia (unica ate aqui, horario escolhido
-- em Perfil). Ver docs/superpowers/specs/2026-09-05-janelas-notificacao-design.md.
--
-- Sem coluna de horario pro almoco: e fixo em codigo, mesmo espirito dos
-- lembretes de conta (fixos as 9h, nao configuraveis).
alter table public.push_tokens
  add column if not exists almoco_ativo boolean not null default true;

-- Linhas existentes representam a janela que ja existia -- o default
-- 'noite' e literal, nao uma aproximacao.
alter table public.push_habit_deliveries
  add column if not exists janela text not null default 'noite'
    check (janela in ('noite', 'almoco'));

alter table public.push_habit_deliveries
  drop constraint if exists push_habit_deliveries_expo_push_token_data_local_key;
alter table public.push_habit_deliveries
  add constraint push_habit_deliveries_token_dia_janela_key
    unique (expo_push_token, data_local, janela);

-- reivindicar_entregas_push_habito faz "returning d.*" (setof
-- push_habit_deliveries) -- a coluna nova aparece sozinha, sem precisar
-- recriar a function.

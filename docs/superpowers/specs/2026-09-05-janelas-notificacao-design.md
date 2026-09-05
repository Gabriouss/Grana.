# Janelas de horário nos lembretes de hábito (almoço + noite) — design aprovado

**Data:** 05/09/2026

**Estado:** aprovado com o autor, pronto para implementação

**Contexto de estado atual:** `docs/notificacoes/2026-09-05-estado-atual.md`

## Objetivo

Hoje o Grana. manda **um** lembrete de hábito por dia, num horário único
escolhido em Perfil (19h/20h30/21h30). O autor identificou uma janela de
gasto real que esse único horário não cobre: o intervalo de almoço de
quem trabalha CLT (~11h-13h), quando a pessoa sai pra comer e gasta —
tão previsível quanto a janela noturna que o app já atende. Esta feature
adiciona uma **segunda janela fixa, só de almoço**, sem mexer na janela
que já existe.

## Decisões (validadas com o autor)

1. **Duas janelas nomeadas e fixas** — `noite` (a que já existe,
   configurável entre as 3 opções de sempre) e `almoco` (nova, horário
   fixo **12h00**, não configurável — mesmo espírito de simplicidade dos
   lembretes de conta, que já são fixos às 9h sem escolha do usuário).
   Não é um sistema genérico de N janelas.
2. **`almoco` dispara só em dias úteis** (segunda a sexta) — fim de
   semana não tem hora de almoço de trabalho pra lembrar.
3. **Sem terceiro envio dedicado a fim de semana.** O tom de fim de
   semana continua exatamente a prioridade que já existe em
   `selecionarMensagem` (`saudade` > `fim_de_semana` > `streak_protecao`
   > pool geral) — ela passa a rodar uma vez por JANELA em vez de uma vez
   por dia, então numa sexta-feira tanto o envio de almoço quanto o de
   noite (se ambos disparam) já saem com tom de fim de semana
   automaticamente, sem lógica nova.
4. **Categoria nova `almoco` no catálogo, com 9 mensagens** (uma a mais
   que as demais categorias, pedido explícito do autor) — tom
   **descontraído/brincalhão**, tipo um amigo cutucando ("E aí, já
   registrou o almoço?"), na mesma linha de humor leve que
   `noturno_humor` já usa hoje, só que com gancho de horário de almoço em
   vez de noite.
5. **Toggle próprio em Perfil**, junto dos lembretes que já existem lá,
   default ligado quando o lembrete diário mestre estiver ligado.

## Schema

Migration nova em `supabase/migrations/`, e o mesmo delta espelhado no
final de `supabase/schema.sql` (padrão já usado neste repositório):

```sql
alter table public.push_tokens
  add column if not exists almoco_ativo boolean not null default true;

alter table public.push_habit_deliveries
  add column if not exists janela text not null default 'noite'
    check (janela in ('noite', 'almoco'));

alter table public.push_habit_deliveries
  drop constraint if exists push_habit_deliveries_expo_push_token_data_local_key;
alter table public.push_habit_deliveries
  add constraint push_habit_deliveries_token_dia_janela_key
    unique (expo_push_token, data_local, janela);
```

Linhas existentes recebem `janela = 'noite'` pelo default — é exatamente
o que já representavam, sem precisar de um backfill manual. Sem novas
colunas de horário para `almoco`: o 12h00 fica fixo em código (igual ao
9h dos lembretes de conta), não em banco.

A função `reivindicar_entregas_push_habito` (claim atômico do outbox,
`FOR UPDATE SKIP LOCKED`) precisa do parâmetro `p_janela` a mais na sua
chave de conflito/claim, espelhando a constraint nova.

## Backend

**`supabase/functions/_shared/push-habit.ts`**
- `chegouHorario` continua igual (usado só pela janela `noite`, que lê
  `horario_hora`/`horario_minuto` do token).
- Nova função `chegouHorarioAlmoco(momento)`: `momento.hora === 12 &&
  momento.minuto === 0` (ou uma tolerância pequena, dado o cron de 5 em 5
  min — ex. `hora === 12 && minuto < 5`, pra não depender do cron cair
  exatamente no minuto 0).
- Nova função `ehDiaUtil(diaSemana)`: `diaSemana` entre 1 (segunda) e 5
  (sexta).

**`supabase/functions/enviar-lembretes-habito/index.ts`**
- `criarEntregasDoDia` passa a iterar as 2 janelas por token:
  - `noite`: gate = `chegouHorario` (como hoje). Pool geral =
    `['noturno_humor', 'micro_gastos', 'dicas_atalhos']`.
  - `almoco`: gate = `token.almoco_ativo && ehDiaUtil(diaSemana) &&
    chegouHorarioAlmoco`. Pool geral = `['almoco', 'micro_gastos',
    'dicas_atalhos']`.
  - Cada janela faz seu próprio upsert em `push_habit_deliveries` com
    `janela` no conflito, então as duas podem coexistir no mesmo dia sem
    colidir.

**`lib/notification-catalog.ts`**
- `selecionarMensagem` ganha um parâmetro `janela: 'noite' | 'almoco'`
  (default `'noite'` para não quebrar chamadas existentes) — só decide
  qual pool geral usar no fallback; a prioridade de
  `saudade`/`fim_de_semana`/`streak_protecao` continua idêntica e
  compartilhada entre as duas janelas.
- Nova categoria `almoco`: 9 mensagens (tom descontraído/brincalhão,
  escrito com a skill `copywriting`, respeitando as regras de marca já em
  vigor — sem travessão, sem "não é X, é Y", nunca julgando).

## Cliente

**`lib/notifications.ts`** — `NotifPrefs` ganha `almocoAtivo: boolean`
(default `true`); `scheduleDailyHabitReminder` passa a agendar as duas
janelas.

**`lib/notification-schedule.ts`** — `planejarLembretesHabito` roda 2x no
fallback local (uma por janela), com a janela `almoco` pulando sábado e
domingo no cálculo das datas futuras (mesmo `QUANTIDADE_LEMBRETES_HABITO
= 7`, mas só contando dias úteis pra essa janela).

**`lib/push-notifications.ts`** — `sincronizarInterno` sobe
`almoco_ativo` pro `push_tokens` junto com o resto dos campos já
sincronizados.

**`app/(app)/perfil.tsx`** — dentro do bloco "Notificações"
(linhas 711-748), novo toggle "Lembrete na hora do almoço (dias úteis,
12h)" logo abaixo do `SegmentedTabs` de horário — mesmo padrão visual dos
toggles existentes ali.

## Testes

- `__tests__/corpus-notificacoes.ts`: casos novos cobrindo (a) `almoco`
  pulando sábado/domingo mesmo com `almoco_ativo=true`; (b) as duas
  janelas gerando duas linhas de outbox no mesmo dia sem colidir; (c)
  `almoco_ativo=false` nunca gera entrega de almoço; (d) sexta-feira
  produzindo tom `fim_de_semana` nas duas janelas, não só numa.
- `__tests__/sync-parser.js` — conferir se `selecionarMensagem` segue
  100% compartilhada entre client e Edge Function (já é hoje; só
  precisa continuar sendo depois do parâmetro novo).
- `npx tsc --noEmit` e `deno check` na Edge Function.
- QA manual: aplicar a migration num ambiente de teste, forçar o cron uma
  vez perto do meio-dia com uma conta `almoco_ativo=true`, e conferir uma
  única linha nova em `push_habit_deliveries` com `janela='almoco'`.

## Fora de escopo

- Nenhum terceiro envio dedicado a fim de semana (decisão do autor,
  seção "Decisões" acima).
- Horário de almoço não é configurável pelo usuário nesta rodada (fixo
  às 12h, como os lembretes de conta).
- Não altera lembretes de conta/fatura (sistema separado).
- Não dispara build EAS nem aplica a migration em produção sem pedido
  explícito do autor na sessão (regra 4 do `AGENTS.md`).

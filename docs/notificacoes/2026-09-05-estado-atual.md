# Notificações do Grana. — estado atual (05/09/2026)

Documento de referência, sem código novo. Existe porque o autor pediu pra
visualizar o que já está construído antes de decidir o que entra na janela
de almoço (ver o spec irmão,
`docs/superpowers/specs/2026-09-05-janelas-notificacao-design.md`).

## O que existe

**Um único horário de lembrete de hábito por dia.** Escolhido em Perfil
(`app/(app)/perfil.tsx:711-748`) entre 3 opções fixas — **19h00**,
**20h30**, **21h30** — nunca uma janela, um ponto no tempo só. O valor vive
em dois lugares que precisam ficar sincronizados:

- Local (`NotifPrefs.horario`, `lib/notifications.ts:285-295`) — usado
  pelo fallback sem push (`lib/notification-schedule.ts`, agenda 7
  ocorrências futuras via `expo-notifications`).
- Remoto (`push_tokens.horario_hora`/`horario_minuto`,
  `supabase/schema.sql:3460-3541`) — uma linha por token/aparelho, lido
  pela Edge Function `enviar-lembretes-habito` a cada disparo do cron.

**48 mensagens em 6 categorias** (`lib/notification-catalog.ts:1-15`),
8 por categoria: `noturno_humor`, `streak_protecao`, `micro_gastos`,
`fim_de_semana`, `saudade`, `dicas_atalhos`.

`selecionarMensagem` escolhe por prioridade fixa:

1. `diasInativo >= 2` → `saudade`
2. `diaSemana` em sexta/sábado/domingo → `fim_de_semana`
3. `streak > 1` → `streak_protecao`
4. senão, um pool geral (`noturno_humor`, `micro_gastos`,
   `dicas_atalhos`) evitando as 10 últimas mensagens já usadas naquele
   token, com reaproveitamento só como último recurso.

**Entrega dupla, mesma lógica dos dois lados.** O backend
(`supabase/functions/enviar-lembretes-habito/index.ts` +
`supabase/functions/_shared/push-habit.ts`) recalcula `diaSemana` no fuso
do próprio token e chama o mesmo `selecionarMensagem` importado de
`lib/notification-catalog.ts` — não existem dois catálogos.

**Cron a cada 5 minutos**
(`supabase/cron-lembretes-habito.sql`, `pg_cron`/`pg_net`/Vault) chama a
Edge Function, que cria (upsert) uma linha em `push_habit_deliveries` por
token quando o horário local do token já passou (`chegouHorario`,
`push-habit.ts:35-37` — um `>=` simples, sem teto). A constraint
`unique(expo_push_token, data_local)` garante **um envio por token por
dia**, o que faz o upsert idempotente entre execuções do cron.

**Lembretes de conta/fatura são um sistema totalmente separado** — fixos
às 9h, não configuráveis, sem relação com o catálogo de hábito acima.

## O que NÃO existe (apesar de já parecer que sim)

- **Não existe janela de almoço.** Nenhum horário, nenhuma categoria,
  nenhuma menção a meio-dia em lugar nenhum do código.
- **"Noite" é só um RÓTULO de tom, não um horário real.**
  `noturno_humor` pode ser sorteada e enviada às 19h00 se for essa a
  escolha da pessoa em Perfil — a categoria nunca é filtrada por relógio,
  só está no pool geral igual às outras duas.
- **"Fim de semana" já influencia qual mensagem sai, mas nunca gerou um
  envio a mais.** É pura seleção de conteúdo dentro do único horário que
  já existe — não existe um segundo disparo específico de sexta/sábado/
  domingo.
- **Não existem múltiplas janelas por usuário.** Tanto o modelo local
  (`NotifPrefs.horario`, um campo só) quanto o remoto
  (`push_tokens.horario_hora/minuto`, uma linha por token) só guardam UM
  horário. A constraint do outbox (`unique(token, dia)`, sem coluna de
  "janela") reforça isso: hoje é estruturalmente impossível ter duas
  entregas no mesmo dia pro mesmo token sem colidir.

## Tabela-resumo

| Pergunta | Resposta hoje |
|---|---|
| Quantos horários de lembrete de hábito por dia? | 1 |
| Horários possíveis | 19h00, 20h30 ou 21h30 (escolha única) |
| Janela de almoço? | Não existe |
| "Noite" filtrado por horário real? | Não — é só nome de categoria |
| Envio extra de fim de semana? | Não — só troca o tom do envio único |
| Onde mora o horário (remoto)? | `push_tokens.horario_hora/minuto` |
| Onde mora o horário (local/fallback)? | `NotifPrefs.horario` |
| Constraint do outbox | `unique(expo_push_token, data_local)` — 1/dia |

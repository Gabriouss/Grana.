# Notificação de dica de ferramenta não usada (design)

Data: 2026-09-04
Pedido por: Gabriel (autor), via voz
Status: aprovado por seção com o autor, aguardando plano de implementação

## Objetivo

Princípio-guia do autor: a pessoa deve quase não ter que pensar pra
registrar um gasto ou usar o app. O Grana. já tem várias ferramentas que
reduzem esse esforço (voz, WhatsApp, QR de nota, widgets Android) mas boa
parte dos usuários provavelmente nunca as descobre. Esta feature avisa,
periodicamente, sobre a próxima ferramenta relevante que a pessoa ainda não
usou — no tom "Você sabia? ..." que o autor pediu.

## Por que isto é arquitetural, não um ajuste pontual

Hoje não existe NENHUM jeito de saber, olhando o banco, se uma pessoa já
usou colar comprovante, QR de nota, lançamento por voz, relatório PDF,
diagnóstico ou desafios — `transactions` não guarda origem. Só uma parte
fica de fora dessa lacuna: crédito, cofrinhos e orçamento são inferíveis de
tabelas já existentes, mas o resto exige rastreamento novo. Além disso, existe uma
infraestrutura de push MUITO recente e já ativa em produção (commit
`7a7f00a`, 04/09/2026 — lembrete diário de hábito) que esta feature precisa
reaproveitar sem colidir com ela: `push_tokens` (registro de Expo Push
Token por usuário/aparelho, RLS por dono), catálogo de mensagens com
seletor contextual, Edge Function com outbox e cron via
`pg_cron`/`pg_net`/Vault.

## Decisões (validadas com o autor)

1. **Rastreamento cobre as 13 ferramentas do inventário
   (`lib/feature-flags-regras.ts:ChaveFlag`) + os 5 widgets Android**, desde
   o começo — não uma versão reduzida só do que já é inferível hoje.
2. **Canal de envio separado do lembrete diário de hábito**, com cadência
   própria (uma dica por semana), pra não competir pelo único push diário
   que a pessoa já recebe.
3. **Ordem fixa por relevância**, do que mais reduz esforço de registrar
   gasto pro que é só descoberta de recurso — ver Seção 2 abaixo. Uma
   ferramenta por semana; quando esgota (usou tudo, ou já recebeu dica de
   tudo), o canal fica quieto sozinho, sem loop.
4. **Toggle próprio no Perfil** ("Dicas de ferramentas"), mesmo padrão dos
   dois lembretes que já existem lá.
5. **Widgets são Android-only na implementação atual** do Grana. (o módulo
   `grana-voice-widget` é Kotlin puro, sem contraparte Swift/iOS) — não
   porque o iOS não suporte widget de tela inicial (suporta, via WidgetKit
   desde o iOS 14), mas porque o Grana. só construiu o lado Android até
   agora. As 5 dicas de widget só podem ir pra tokens `plataforma =
   'android'`.

## Seção 1 — Rastreamento de uso

Tabela nova, só pra isto:

```sql
create table if not exists ferramenta_primeiro_uso (
  user_id uuid not null references auth.users(id) on delete cascade,
  chave text not null,
  usado_em timestamptz not null default now(),
  primary key (user_id, chave)
);
```

`chave` usa o mesmo vocabulário de `ChaveFlag` (13 valores) mais 5 valores
novos pros widgets: `widget_voz`, `widget_livre_para_gastar`,
`widget_central`, `widget_compromisso`, `widget_cofrinho`. RLS: usuário só
vê a própria linha; inserts vêm só de `service_role` (Edge Functions) ou de
RPC `security definer` chamada pelo cliente autenticado — nunca insert
direto do cliente na tabela, pra não virar canal de manipular o próprio
histórico de dicas.

Grava só na PRIMEIRA vez (`on conflict (user_id, chave) do nothing`) — não
precisa de update depois disso, é um fato que não muda.

**Pontos de instrumentação** (cada um dispara a marcação só quando a
ferramenta é usada de verdade, não em toda tentativa):

| Chave | Onde marcar |
|---|---|
| `whatsapp` | Edge Function `whatsapp-webhook`, no primeiro lançamento reconhecido daquele usuário |
| `importar_extrato` | `ImportarExtratoModal.confirmar()`, após `addTransactionsBatch` ter sucesso |
| `colar_comprovante` | `PasteReceiptModal.handleSave()` |
| `qr_nota` | `QrScannerModal`, no reconhecimento bem-sucedido |
| `lancamento_voz` | `onTranscribed` de Início/Lançamentos, só quando o texto reconhecido virou lançamento de verdade |
| `widget_*` (5 chaves) | Edge Function `processar-lancamento-voz` — já sabe de qual widget o pedido veio |
| `relatorio_pdf`, `diagnostico`, `desafios`, `foto_perfil`, `lembretes` | ação/tela correspondente, uma chamada pontual |
| `cofrinhos` | inferível: primeira linha em `goals` (sem instrumentar ponto de criação) |
| `orcamento_sugerido` | inferível: primeira linha em `budgets` (sem instrumentar ponto de criação) |

Para as duas últimas, um job (ou a própria consulta de elegibilidade da
Seção 3) pode checar a tabela de origem diretamente em vez de depender de
alguém ter instrumentado o ponto de criação — evita caçar todos os
componentes que criam meta/orçamento.

## Seção 2 — Catálogo de dicas e ordem

Ordem de prioridade (do que mais reduz esforço de lançar pro que é só
descoberta de recurso):

1. `lancamento_voz`
2. `whatsapp`
3. `widget_voz` *(Android)*
4. `qr_nota`
5. `colar_comprovante`
6. `widget_livre_para_gastar`, `widget_central`, `widget_compromisso`,
   `widget_cofrinho` *(Android)*
7. `importar_extrato`
8. `orcamento_sugerido`, `cofrinhos`
9. `relatorio_pdf`, `diagnostico`, `desafios`, `foto_perfil`, `lembretes`

Novo arquivo `lib/dica-ferramenta-catalog.ts`, mesmo padrão de
`lib/notification-catalog.ts`. Cada entrada:

```ts
type DicaFerramenta = {
  chave: ChaveFerramentaOuWidget;
  titulo: string;
  corpo: string; // tom "Você sabia? ..." — direto, sem jargão, foco no ganho prático
  plataformas?: ('android' | 'ios')[]; // ausente = as duas
};
```

Exemplo (widget de voz): *"Você sabia? Dá pra adicionar um widget na tela
inicial do seu Android e lançar um gasto por voz sem nem abrir o Grana."*

## Seção 3 — Envio (cron semanal)

- Tabela nova `push_dica_deliveries (id, expo_push_token → push_tokens,
  chave, enviado_em)`. Cada `chave` só é enviada **uma vez por token**, use
  ou não a pessoa a ferramenta depois — evita insistir na mesma dica toda
  semana.
- Edge Function nova `enviar-dicas-ferramentas`, cron semanal via
  `pg_cron`/`pg_net`/Vault — mesmo esqueleto de `enviar-lembretes-habito`
  (lote pro Expo, backoff, recibo, apaga token com `DeviceNotRegistered`),
  outbox própria, sem se misturar com a diária de hábito.
- Elegibilidade por token: primeira `chave`, na ordem da Seção 2, tal que:
  (a) a pessoa ainda não tem em `ferramenta_primeiro_uso` (nem inferível
  via `goals`/`budgets` pra `cofrinhos`/`orcamento_sugerido`); (b) ainda não
  está em `push_dica_deliveries` pra aquele token; (c) compatível com
  `push_tokens.plataforma`. Sem candidata → não manda nada essa semana.

## Seção 4 — Preferência no Perfil

Novo toggle "Dicas de ferramentas" ao lado dos dois lembretes que já
existem (conta, hábito), mesmo padrão de `carregarNotifPrefs`/
`salvarNotifPrefs`. Desligado, o app não registra/mantém token pra esse
canal — mesma lógica de remoção que já existe pro lembrete diário quando a
pessoa desliga.

## Testes

- `__tests__/corpus-dicas-ferramentas.ts` (novo, mesmo padrão dos corpora
  já existentes): ordem de prioridade determinística, filtro de plataforma
  pulando pro próximo candidato em vez de travar, "esgotou" não gera erro,
  `cofrinhos`/`orcamento_sugerido` inferidos corretamente de `goals`/
  `budgets`.
- Guardas de schema (`corpus-schema-guardas.ts`) cobrindo RLS de
  `ferramenta_primeiro_uso` e `push_dica_deliveries`.
- `npx tsc --noEmit` e `deno check` da nova Edge Function.
- QA manual: forçar o cron uma vez, conferir que o Android recebe dica de
  widget e o iOS não, que usar a ferramenta sugerida faz ela sumir da fila,
  e que desligar o toggle remove o token do canal.

## Fora de escopo desta mudança

- Não cria widget de iOS — só marca as dicas de widget existentes como
  Android-only.
- Não altera o lembrete diário de hábito nem sua cadência.
- Não adiciona rastreamento de uso CONTÍNUO por ferramenta (quantas vezes,
  quando foi a última) — só o fato binário "já usou alguma vez", que é tudo
  que esta feature precisa.

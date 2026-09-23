---
tags: [grana, auditoria]
tipo: registro
data: 2026-09-23
---

# 2026-09-23 - M1 - Auditoria de Backend (Harbor)

**Pedido.** Do autor, repassado pelo Codex: "auditoria rigorosa de seus
próprios segmentos dentro do projeto. Ao terminarem, documentem todos os
achados." Segmento do Harbor (Backend Engineer): Supabase em produção só
leitura — RLS de cada tabela, funções e RPCs, migrations do repositório x
produção (sem `schema_migrations`; sonda por `PGRST202`/`42501`), Edge
Functions no ar x repositório (`updated_at`, `verify_jwt`, código só no
fonte), webhooks da Cakto e do EAS, auth (confirmação de e-mail, SMTP Resend,
`site_url`, redirect URLs), segredos por NOME, cortesias,
`enforce_subscriptions`, plano Free (limites).

Só leitura: nada alterado em código, banco, Supabase, Vercel, Cakto, Resend
ou EAS; nenhum commit; nenhum `eas build`/deploy. Emulador não usado (em uso
pelo Sentinel). Credencial só lida dentro do processo (`node --env-file=.env`),
nunca impressa nem escrita aqui; nenhuma conta real logada.

**Skills usadas.** `supabase-postgres-best-practices` (regras `security-rls-basics`,
`security-rls-performance`, `security-privileges`): confere RLS habilitada por
tabela, `(select auth.uid())` em vez de `auth.uid()` cru nas políticas,
`security definer` com checagem explícita e `execute` restrito, privilégio
mínimo por role.

**Git, antes de começar (leitura).** `git status`: `.claude/settings.json` e
`PRODUCT.md` modificados, sem commit — já é o achado L1 do Ledger
([[2026-09-23 - M1 - Auditoria de Documentação e Vault (Ledger)]]), não
duplico aqui. `git log -3`: `879ac32` no topo, igual ao `origin/main`.

## Cobertura

- [x] RLS: `select` em `pg_policies`/`pg_tables` para cada tabela de `public` (27 tabelas, todas com `relrowsecurity=true`; ver H1, H2)
- [x] Funções/RPCs: `pg_proc`/`has_function_privilege` x `supabase/schema.sql` (44 `security definer` próprias batem nas duas pontas; ver H2)
- [x] Migrations do repo x produção — amostra das 3 mais recentes sem drift; `supabase_migrations.schema_migrations` confirmado inexistente (premissa da regra 9/11 ainda vale)
- [x] Edge Functions: `GET .../functions` (`updated_at`, `verify_jwt`) x `git log` de cada uma das 8 funções — ver "Confirmações"
- [x] `assistente-financeiro`: no ar (v36, `verify_jwt=true`), `updated_at` 19/09; ver H1 e H3
- [x] Webhook Cakto: segredo por nome confirmado (`CAKTO_WEBHOOK_SECRET`), `webhook_events` com 1 linha `cakto/approved`, reconciliado (ver "Confirmações")
- [x] Webhook EAS: `eas-build-webhook` no ar, `verify_jwt=false`, 11 eventos `build_finished`; `app_release` em 1.10.2 (correto — build 1.10.4 nunca compilou, cota EAS esgotada, já documentado em `context.md` 22/09)
- [x] Auth: `mailer_autoconfirm=false`, `site_url=granaapp://`, `uri_allow_list` com native+web+localhost, SMTP Resend (`smtp.resend.com:465`, sem senha lida) — reconfirma o estado já testado em [[2026-09-22 - M1 - Testes do fluxo de assinatura]], sem mudança
- [x] Segredos (Supabase) — 20 nomes listados, nenhum órfão nos que conferi (`OPENAI_API_KEY`, `KIWIFY_WEBHOOK_TOKEN` usados no código). EAS: não verificado (ver "Não verificado")
- [x] Cortesias: 9 linhas `provider='interno'`, todas vinculadas, todas válidas — sem e-mail lido nem registrado
- [x] `enforce_subscriptions` = `true`, inalterado desde 22/09 23:18 UTC
- [x] Plano Free: confirmado (`organizations` API, `plan: "free"`); banco em 24 MB de 500 MB, 21 conexões ativas — longe de qualquer teto

## Achados

### H1 · P2 · Granabô (assistente-financeiro) não checa direito de acesso; ferramentas de memória/histórico não são gated por assinatura

- **Onde.** `supabase/functions/assistente-financeiro/index.ts:2186-2235`
  (handler `Deno.serve`); RLS de `assistant_memory`
  (`supabase/schema.sql:4204`) e `assistant_messages`.
- **Evidência.**
  - Handler da Edge Function: só confere `Authorization: Bearer` válido
    (`supabase.auth.getUser()`, linha 2199), rate limit (`excedeuRateLimit`) e
    cota de IA (`consumirCotaIA`). Nenhuma chamada a `tem_direito_acesso()` /
    `obter_estado_acesso()` em nenhum ponto do arquivo (`grep` no arquivo
    inteiro por esses termos: zero ocorrências).
  - `pg_policies` (Management API, somente leitura) mostra que TODA tabela de
    dado financeiro do usuário (`transactions`, `bills`, `budgets`,
    `categories`, `credit_cards`, `credit_card_invoices`, `wallets`,
    `goals`, `user_gamification`, `voice_operations`) tem, na política RLS,
    `and (select tem_direito_acesso())` — só `assistant_memory` e
    `assistant_messages` não têm: a política é só `auth.uid() = user_id`,
    sem a checagem de assinatura, e ainda usa `auth.uid()` cru (não
    `(select auth.uid())`, o padrão de performance do resto do schema —
    contraria a regra `security-rls-performance` da skill
    `supabase-postgres-best-practices`) e `roles: {public}` em vez de
    `{authenticated}` (inofensivo aqui porque `auth.uid()` é null para
    `anon`, mas inconsistente com o resto).
  - Comparação com a escrita real de dinheiro: `registrar_operacao_voz`
    (`supabase/migrations/20260914120000_lancamento_pelo_assistente.sql:90`),
    que é o que a ferramenta `criarLancamento` do Granabô de fato chama para
    gravar, CHECA `tem_direito_acesso()` e recusa com `42501` se não tiver —
    uma conta bloqueada não consegue criar lançamento real pelo chat. A
    leitura de `wallets`/`categories`/`credit_cards` que
    `executarCriarLancamento` faz antes (linhas 907-921 do `index.ts`) já
    bate na RLS dessas tabelas (gated) e volta vazia, então o fluxo para em
    "você não tem carteira cadastrada" antes de chegar na RPC.
- **Esperado x encontrado.** Esperado (pela cópia de `app/assinar.tsx:73`,
  "A assinatura libera lançamentos, contas, cartões, metas e o Granabô") e
  pelo padrão do resto do schema: toda superfície do Granabô deveria recusar
  uma conta sem `tem_direito_acesso()`. Encontrado: a Edge Function aceita
  qualquer usuário autenticado, sem checar assinatura; o histórico de
  conversa (`assistant_messages`) grava normalmente para conta bloqueada; a
  memória de vocabulário/fatos/preferências (`assistant_memory`) lê e grava
  normalmente também.
- **Comprovado** (leitura de código e de `pg_policies`/`information_schema`
  em produção, via Management API, somente leitura). **Não executado**: não
  chamei a Edge Function de verdade com uma conta bloqueada — exigiria uma
  segunda conta sem cortesia, e a única conta disponível (a de teste dos
  agentes) JÁ tem cortesia, confirmado em [[2026-09-22 - M1 - Testes do fluxo de assinatura]]
 ; criar cortesia para uma conta nova seria escrita no
  banco, fora do escopo desta auditoria.
- **Impacto prático.** Não é bypass de dinheiro (a RPC de escrita está
  protegida) nem vazamento entre contas (tudo escopado por `user_id`). É:
  (1) uma conta bloqueada consegue manter conversa com o Granabô — que
  responderia com dados financeiros vazios/zerados, de forma confusa, em vez
  de recusar com mensagem de paywall — e isso **consome a cota compartilhada
  do Gemini** (documentada no próprio arquivo, linhas 83-92, como recurso
  escasso e global: RPD 500 no modelo Lite, dividido entre TODOS os
  usuários); e (2) histórico e memória de uma conta bloqueada continuam
  sendo gravados no banco sem limite de assinatura.
- **Sugestão.** Checar `obter_estado_acesso()`/`tem_direito_acesso()` logo
  depois do `getUser()` (linha 2201) e devolver 402 antes de gastar cota de
  IA; acrescentar `and (select public.tem_direito_acesso())` às políticas de
  `assistant_memory` e `assistant_messages`, trocando `auth.uid()` por
  `(select auth.uid())` e o role de `public` para `authenticated`, para
  ficar igual ao padrão do resto do schema.

### H2 · P3 · Três funções-gatilho com EXECUTE aberto para `anon`/`public` (não exploráveis, mas contrariam o princípio de privilégio mínimo)

- **Onde.** `handle_new_user_wallet` (`schema.sql:739`), `preencher_wallet_padrao`
  (`:4391`), `reatribuir_wallet_antes_de_excluir` (`:4428`).
- **Evidência.** `has_function_privilege('anon', <oid>, 'execute')` = `true`
  para as três (consulta a `pg_proc`/`has_function_privilege`, produção,
  somente leitura) — as únicas do total de 44 funções `security definer`
  próprias do projeto em que isso acontece; todas as outras (`tem_direito_acesso`,
  `conceder_acesso_cortesia` etc.) já têm `execute` revogado de `anon`/`public`
  explicitamente no schema.
- **Esperado x encontrado.** As três são funções de TRIGGER
  (`returns trigger`, criadas com `create trigger ... execute procedure`),
  nunca chamadas via `supabase.rpc()`. O Postgres concede `EXECUTE` a
  `PUBLIC` por padrão em toda função nova, e nenhuma das três tem o
  `revoke ... from public, anon` que o resto do schema aplica de propósito
  (ver o comentário da skill `supabase-postgres-best-practices`,
  `security-rls-performance`: "Revoke EXECUTE from any role that shouldn't
  call them directly").
- **Comprovado** (privilégio efetivo lido em produção) que a concessão
  existe; **não é explorável na prática** — chamar uma função `trigger` fora
  de um gatilho falha no Postgres (`new`/`old` não existem fora do
  contexto), então uma tentativa de `supabase.rpc('handle_new_user_wallet')`
  por um cliente `anon` erra antes de fazer qualquer coisa. Não testei essa
  chamada de verdade (evitar side effect); é dedução da definição da função,
  não execução.
- **Sugestão.** Higiene, não urgência: `revoke execute on function
  public.handle_new_user_wallet(), public.preencher_wallet_padrao(),
  public.reatribuir_wallet_antes_de_excluir() from public, anon,
  authenticated;` depois de cada `create or replace function`, para não
  depender do comportamento de "função de gatilho não roda solta" como rede
  de segurança implícita.

### Confirmações (sem achado novo — já registrado em outro lugar)

- **`cakto-webhook` e o `updated_at` de 13/09.** `updated_at` em produção
  (`2026-09-13T14:47:00.078Z`) bate exatamente com "publicação... `updated_at`
  13/09 11h47" (horário local) do `context.md`, seção "13/09/2026 — primeira
  venda real na Cakto". Produção e repositório reconciliados; não é drift.
- **`enviar-lembretes-habito` com `updated_at` de 13/09 22:45 (`2026-09-14T01:45:14Z`
  UTC), repositório com commits de 19/09 não publicados (`29426e8` e a
  reescrita das 12 notificações).** Já registrado no `context.md`, seção
  "19/09/2026": "NÃO publicado: `enviar-lembretes-habito`... O deploy foi
  recusado pelo classificador de permissões da sessão e depende do autor."
  Confirmei hoje, por leitura de produção, que o estado não mudou desde
  então — continua pendente de pedido explícito do autor, não é achado novo.
- **`whatsapp-webhook`, mesma situação:** o commit `cfe321b` (19/09, quatro
  correções de parser CSV/data/categoria/hífen) diz na própria mensagem "NAO
  fiz deploy — regra 11: fica para pedido explicito". `updated_at` em
  produção (`2026-09-10T11:58:52Z`) confirma que ainda não foi. Sem efeito
  prático hoje porque o canal WhatsApp está desligado por
  feature flag (`whatsapp`), mas registrado aqui porque também alcança
  `_shared/interpretar-lancamento.ts`, que o Granabô (`assistente-financeiro`)
  importa — **as mesmas 4 correções (aspas em CSV, data ISO, categoria mais
  específica, hífen solto) também ainda não chegaram ao Granabô em
  produção**, confirmado comparando `updated_at` do `assistente-financeiro`
  (`2026-09-19T02:12:38Z`, ou 18/09 23:12 local) contra o horário do commit
  `cfe321b` (19/09 12:02 local) — o deploy do Granabô em produção é ~13h
  ANTERIOR ao commit, então não pode conter essas correções. Isto é uma
  extensão do que já estava registrado (o `context.md` de 19/09 só fala do
  `enviar-lembretes-habito` e do `whatsapp-webhook`, não do
  `assistente-financeiro`), então relato como achado leve:
  **H3 · P3 · Granabô em produção ainda tem os 4 bugs de parser do commit
  `cfe321b` (19/09), pendente do mesmo deploy que já está represado para
  `whatsapp-webhook`/`enviar-lembretes-habito`.** Comprovado por comparação
  de timestamps; não testei uma conversa real no Granabô para confirmar o
  sintoma (ex. "mercado livre" virando Alimentação) porque isso gravaria
  histórico e gastaria cota de IA compartilhada.
- **Cortesias e `enforce_subscriptions`.** 9 linhas `provider='interno'` em
  `subscriptions`, todas vinculadas a `user_id`, todas com `access_until` no
  futuro — bate exatamente com o "9 contas... oito tinham cortesia" do
  `context.md` de 22/09 (regra 12 respeitada: nenhum e-mail lido ou
  registrado, só agregados). `app_backend_config.enforce_subscriptions =
  true`, `updated_at` 22/09 23:18 UTC, inalterado desde então.
- **`supabase_migrations.schema_migrations` não existe** (`pg_namespace` sem
  esse schema) — confirma a premissa da regra 9/11 do `AGENTS.md` ainda vale;
  as tabelas `schema_migrations`/`migrations` que aparecem em
  `pg_stat_user_tables` são internas do Supabase (`auth`, `realtime`,
  `storage`), não do projeto.
- **Amostra de migrations recentes sem drift.** As 3 mais novas
  (`20260915190000`, `20260916200000`, `20260919150000`) têm todas as
  funções que criam presentes em produção com a assinatura esperada.
  Contagem de funções `security definer` do projeto: 44 iguais nas duas
  pontas (produção teve 81 no total em `pg_proc`, mas 31 são do `pg_trgm`,
  extensão instalada em `public`).
- **Verificado pelo "Navegador Harbor"** (portal próprio, sem login real,
  nenhum formulário enviado): `/ativar` sem token renderiza "Criar
  conta"/"Já tenho conta" como o código prevê; `/sign-up` renderiza os campos
  esperados; console sem erro nas duas páginas (`maestri portal logs`,
  vazio). Não é verificação de backend em si, mas corrobora que a config de
  `uri_allow_list`/`site_url` não está quebrando o carregamento da página.

## Não verificado

- Segredos do EAS (`eas env:list`/`eas secret:list`) — não rodei o CLI do EAS
  nesta auditoria; fora do tempo disponível, e a lista de segredos do
  Supabase já cobria o essencial do meu segmento.
- Uma chamada real ao Granabô com uma conta sem `tem_direito_acesso()` (H1) —
  exigiria criar/liberar uma segunda conta, que é escrita.
- Uma pergunta real ao Granabô que dispare os 4 bugs de parser do `cfe321b`
  (H3) — gastaria cota de IA compartilhada e gravaria histórico.
- Corpo publicado das Edge Functions com drift conhecido
  (`enviar-lembretes-habito`, `whatsapp-webhook`) não foi baixado/diffado
  nesta sessão — o `context.md` de 19/09 já registra que a cópia de retorno
  do `enviar-lembretes-habito` está em
  `E:\Grana-temporarios\2026-09-19-M1\retorno-producao\`.
- `webhook_processing_locks` e `webhook_raw_log`: só contei linhas (0 e não
  contei a segunda), não auditei o conteúdo linha a linha.

## Perguntas ao autor

1. **H1 (Granabô sem checagem de assinatura):** confirmam que o Granabô
   deveria recusar (ou pelo menos avisar) uma conta bloqueada, em vez de
   responder normalmente com dados vazios? Se sim, viraria correção de
   prioridade alta, dado que `enforce_subscriptions` está ligado desde
   22/09 e o Granabô é justamente o item mais caro (cota de IA) da lista de
   benefícios da assinatura.
2. **H3 (Granabô sem as 4 correções de parser do `cfe321b`):** o mesmo
   deploy pendente que já está represado para `whatsapp-webhook` resolveria
   isto também, publicando `assistente-financeiro` — vale juntar os três
   deploys (`enviar-lembretes-habito`, `whatsapp-webhook`,
   `assistente-financeiro`) num pedido só quando decidirem publicar?
3. Sobre `.claude/settings.json`/`PRODUCT.md` sem commit (achado L1 do
   Ledger): não é do meu segmento, só reforço que vi o mesmo `git status` e
   não mexi nisso.

## Pausa (limite a 90%, pedido do autor)

Auditoria já estava **concluída e reportada ao Codex** (`maestri ask`) antes
da pausa — nada ficou pela metade. Cobertura final, item a item:

- [x] RLS de todas as 27 tabelas de `public`
- [x] Funções/RPCs (44 `security definer` próprias, batem com o schema)
- [x] Migrations recentes x produção (amostra das 3 mais novas, sem drift)
- [x] Edge Functions no ar x repositório (8 funções, `updated_at`/`verify_jwt`)
- [x] `assistente-financeiro` no ar (H1, H3)
- [x] Webhook Cakto (segredo por nome, `webhook_events`, reconciliação de 13/09)
- [x] Webhook EAS (`eas-build-webhook`, `app_release`)
- [x] Auth (`mailer_autoconfirm`, `site_url`, `uri_allow_list`, SMTP por nome)
- [x] Segredos do Supabase por nome (20 nomes)
- [x] Cortesias (9 linhas, agregado, sem e-mail)
- [x] `enforce_subscriptions` (true, inalterado)
- [x] Plano Free (confirmado, DB em 24 MB de 500 MB)
- [ ] Segredos do EAS via CLI — não verificado, fora do tempo (ver "Não verificado")
- [ ] Execuções reais que exigiriam escrita (conta bloqueada no Granabô, H3 ao vivo) — não verificado de propósito

Nada rodando em segundo plano por mim (nenhum comando pendente, nenhum
processo em background). Parado aqui, aguardando "RETOMAR".

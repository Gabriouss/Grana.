# Contexto do projeto — Grana.

## Estado atual para venda — 08/09/2026

### Resumo executivo

O hardening de venda pública está implementado no código, documentado e
publicado em `origin/main`. A parte de quota de IA também já está aplicada no
Supabase de produção. Não há build Android nova nesta etapa: a última APK
instalada continua sendo a 1.8.3, e qualquer nova build exige autorização
explícita do autor.

### O que foi implementado no código

- Quota persistente e atômica por usuário/canal para o Granabô e lançamento por
  voz, com janela por minuto e por dia; a quota em memória continua apenas como
  defesa rápida.
- Falha da RPC de quota retorna `503`/`limite_indisponivel` e não chama o
  provedor externo; quota esgotada retorna `429` com mensagem amigável.
- Sincronização de assinatura agora deixa recibo visível, preserva token
  pendente e registra logs sem token, senha ou payload de pagamento.
- Assinatura `past_due` não abre um segundo checkout: usa URL de gerenciamento
  da Kiwify quando configurada ou orienta e-mail/suporte.
- Política de privacidade, termos e exclusão de dados cobrem voz no app/widget,
  push, Granabô/Gemini, memória e recibos técnicos.
- CI passou a executar `test:ci`, testes de assinatura/quota e `deno check` das
  Edge Functions alteradas.
- Guardas do schema passaram a separar migrations históricas do baseline final;
  a migration final de voz é comparada com `20260908000000_voice_wallets.sql`.
- Documentação de handoff está em `documentation/`; a especificação está em
  `docs/superpowers/specs/2026-09-08-hardening-venda-publica-design.md`.

### Produção Supabase — aplicado e verificado

Projeto: `cjnuzfbvfuauvlzfoutv` (`ACTIVE_HEALTHY`, região `sa-east-1`).

- `supabase/migrations/20260908140000_ai_usage_quotas.sql` aplicada pela API
  de gerenciamento.
- `public.ai_usage_counters` existe com RLS habilitado.
- `authenticated` pode executar a RPC, mas não tem `SELECT` direto na tabela.
- `public.consumir_cota_ia(text)` existe como `security definer`, fixa o
  `search_path` e usa o fuso `America/Sao_Paulo`.
- Sonda sem JWT confirmou `42501`; nenhuma quota foi consumida nessa sonda.
- `assistente-financeiro`: `ACTIVE`, versão 21, JWT obrigatório.
- `processar-lancamento-voz`: `ACTIVE`, versão 5, JWT obrigatório.
- A migration e as funções foram publicadas na ordem correta: banco → funções.
- O PAT temporário fornecido pelo autor não foi salvo no repositório, em
  variável persistente ou em documentação.

### Verificação executada

- `npx tsc --noEmit`: passou.
- `deno check` de `ai-quota.ts`, `assistente-financeiro` e
  `processar-lancamento-voz`: passou.
- `test:voz`, `test:assistente-aprendizado`, `test:assistente-fatura`,
  `test:blur`, `test:motion`: passaram.
- `voice-fallback.cjs`, `voz-offline.cjs`, `widget-voz-cartoes.cjs`,
  `assinatura-sync.cjs` e `ai-quota.cjs`: passaram.
- Parser completo: 27/27 corpus TypeScript passaram, incluindo voz, WhatsApp,
  carteiras, categorias, cartões, notificações, design system e flags.
- Guardas do schema: 30/30 passaram.
- Como o `npx tsx` local ficou bloqueado por permissão/rede, o corpus TypeScript
  foi executado com o mesmo compilador TypeScript em memória e resolução do
  alias `@/`; o CI continua usando os scripts oficiais do `package.json`.

### Commits e sincronização

- `c6579a0` — hardening para venda pública, quota, CI e documentação.
- `2e8893f` — registro deste deploy no `context.md`.
- `HEAD` e `origin/main` estão em `2e8893f`.
- Permanecem fora deste trabalho, sem alteração intencional: `components/RevealOnScroll.tsx`,
  `supabase/migrations/20260905004109_voice_operations.sql` e
  `.tmp.driveupload/`.

### Pendências antes de vender

Estas são validações operacionais, não novas implementações estruturais:

1. Com uma conta autenticada, confirmar uma chamada permitida de
   `consumir_cota_ia('assistente')` e `consumir_cota_ia('voz')` pelo app/fluxo
   real; a rejeição sem JWT já foi comprovada.
2. Na Kiwify, confirmar o header `x-kiwify-token`, testar compra nova, vínculo
   por e-mail/token, renovação, cancelamento, reembolso e chargeback. Manter
   `app_backend_config.enforce_subscriptions = false` até o ciclo passar.
3. Fazer exclusão de conta com uma conta descartável e verificar Auth, dados,
   avatar e vínculo de WhatsApp removidos.
4. Autorizar a próxima build e preparar a versão somente com
   `npm run build:preparar -- "<mensagem revisada>"`; não subir versão ou
   mensagem manualmente. Nenhum build foi disparado nesta sessão.
5. No APK novo, testar em Android real: voz no app/widget, carteiras pessoais
   e empresa, nomes com/sem acento, múltiplos cartões, parcelado, recorrente,
   boleto, categorias personalizadas, push e notificações interativas.
6. Publicar o APK como `grana.apk`, conferir
   `/downloads/grana-latest.apk`, configurar variáveis Vercel/EAS e validar os
   e-mails pós-compra da Kiwify com links separados de download e ativação.
7. Configurar `EXPO_PUBLIC_KIWIFY_BILLING_URL` somente se existir um link real
   de gerenciamento da Kiwify; sem ele o comportamento atual é seguro e não
   inicia uma nova compra para `past_due`.
8. Fazer revisão humana final dos textos legais antes da publicação comercial.

## 10/09/2026 — o mesmo defeito de voz corrigido duas vezes, e a release do APK

### A duplicação, que é o defeito da regra 10 acontecendo

Duas sessões corrigiram o eco do prompt e o numeral partido em paralelo, sem
saber uma da outra. Uma escreveu a correção, publicou as funções e NÃO empurrou
os commits; a outra encontrou o código em produção sem origem no `main`,
concluiu que alguém tinha escrito pelo painel do Supabase, e o reconstruiu a
partir do bundle publicado no commit `e7ab948`.

As duas implementações eram equivalentes, porque a segunda foi reconstruída da
primeira. Na reconciliação prevaleceu a do `e7ab948` (já estava no `main`) e a
outra foi descartada, sobrevivendo só os testes, que cobriam mais: os falsos
positivos do `temNumeralPartido` (`12x`, `100ml`, `1080p`, `5g`), o eco
truncado derivado do `PROMPT_TRANSCRICAO` real em vez de copiado, a frase real
do caso de 08/09 na íntegra, e uma guarda de regressão do próprio prompt — se
alguém reintroduzir a instrução de escrever dígitos, o teste quebra.

A regra 11 foi corrigida junto: ela atribuía as proteções da v7 ao painel do
Supabase, e a causa real foi uma sessão que publicou sem empurrar. A regra fica
mais forte assim, porque esse caminho não se evita por disciplina de não abrir
o painel.

### A release do APK, que faltava

O `vercel.json` redireciona `/downloads/grana-latest.apk` para
`releases/latest/download/grana.apk` desde sempre, e o repositório não tinha
NENHUMA release: o endereço permanente era 404. A v1.8.4 foi publicada à mão
(APK conferido antes: 129.071.468 bytes, `versionName` 1.8.4 lido do
`AndroidManifest.xml`, pacote `com.gabriouss.grana`, assinatura v2, sha256
`19c18af6…`), e a cadeia inteira foi testada de ponta a ponta — baixando pelo
endereço público e comparando o checksum.

Isso ficou obrigatório depois do `4c9dcdc`: com `app_release.apk_url` apontando
para o link permanente, uma build nova sem release publicada faria o app
anunciar a versão nova e entregar a anterior, sem erro em lugar nenhum.

Para as próximas builds entrou a automação:

- `scripts/verificar-apk.mjs` abre o APK e recusa binário truncado, sem
  assinatura v2, ou de outra versão. Traz um leitor de zip próprio (o Node não
  tem, e depender do `unzip` do sistema não funciona no Windows do autor) com
  autoteste que roda no `test:ci`. Testado contra o APK real de 129 MB: aceita
  1.8.4 e recusa 1.9.9.
- `.github/workflows/publicar-apk.yml` baixa, verifica, publica a release com
  notas e checksum, e no fim CONFERE que o endereço permanente devolve o
  arquivo novo. Aceita `repository_dispatch` (automático) e `workflow_dispatch`
  (à mão).
- O `eas-build-webhook` dispara o `repository_dispatch` depois de gravar em
  `app_release`. Falha no disparo nunca derruba o webhook.

**Pendente, e sem isso a automação não roda sozinha:** os segredos
`GITHUB_DISPATCH_TOKEN` (PAT com `contents: write` no repositório) e
`GITHUB_REPO` (`Gabriouss/Grana.`) no Supabase, e a republicação do
`eas-build-webhook`. Enquanto não existirem, o webhook registra no log e segue,
e a release sai pelo `workflow_dispatch` à mão. O deploy não foi feito nesta
sessão porque o token de acesso expirou no meio, e a regra 11 proíbe publicar
sem antes comparar o que está no ar com o repositório.

## 08/09/2026 — registro completo do dia (34 commits, ~1 400 linhas líquidas)

Dia mais denso do projeto até agora: hardening para venda pública, auditoria
visual completa, correção crítica do lançamento por voz, invariantes de
carteira no banco, design system consolidado, distribuição direta do APK e
build Android 1.8.4 enviada ao EAS.


---

### 1. Correção crítica do lançamento por voz (`c36cce5`, `e9a7b3e`)

**O que aconteceu.** O autor reportou duas falhas com vídeo e print na mesma
noite, ambas no widget Android:

1. **Eco do prompt.** A pessoa disse "merenda de 57 reais e 98 centavos" e a
   folha de confirmação abriu com a descrição `Valores em reais usam vírgula
   como separador decimal, nunca ponto` e R$ 0,00 — o próprio PROMPT que o
   app enviava ao provedor de transcrição.

2. **Numeral partido (e este SALVOU).** Notificação `Merenda de 57quenta e —
   R$ 7,66 · salvo no Grana.` quando a fala foi R$ 57,66. O decodificador
   produziu o híbrido "57quenta" para "cinquenta"; o parser não reconhece isso
   como número, então o valor da frase passa a ser o "sete" seguinte. Valor
   > 0 e categoria Alimentação são as duas condições do salvamento automático
   do widget — R$ 57,66 virou R$ 7,66 em silêncio.

**Causa raiz comum.** A instrução no prompt: `"Valores em reais usam vírgula
como separador decimal, nunca ponto: 11,79 (não 11.79, não 1179)"`. Áudio sem
fala não faz o Whisper devolver vazio — faz ele alucinar, e o recheio é aquilo
com que ele foi escorado. E empurrado a escrever dígitos enquanto ouve
palavras, o decodificador produz híbridos tipo "57quenta".

O motivo original da instrução não se sustentava: `guessAmountFromText` já lê
a forma falada sem ajuda nenhuma. Medido: "onze e setenta e nove" → 11,79,
"uber quinze e cinquenta" → 15,50, "merenda de cinquenta e sete reais e
sessenta e seis centavos" → 57,66. O prompt protegia contra um problema que o
parser já resolvia, e cobrava dois piores por isso.

**O que mudou em `voice-transcription.ts` (módulo compartilhado pelos 3 canais):**

- **Prompt simplificado.** Virou só contexto de domínio (`"Comando de voz em
  português do Brasil sobre um lançamento financeiro pessoal: gasto, receita,
  boleto ou compra."`), sem instrução de formatação e sem exemplos de frase.
  Exemplos descartados de propósito: prompt é viés de vocabulário nos dois
  sentidos, e as palavras que ele facilita reconhecer ele também facilita
  inventar — uma alucinação misturando "mercado" com a fala real não seria eco
  e passaria.
- **`ehEcoDoPrompt(texto)`.** Compara a transcrição normalizada contra o
  prompt. Por TRECHO e não por igualdade: o eco do vídeo parou no meio
  ("nunca ponto") e `===` não pegaria. Piso de 25 caracteres normalizados
  para não barrar fala curta.
- **`temNumeralPartido(texto)`.** Recusa dígito colado em pedaço de numeral.
  Rabo de 3+ letras para não barrar "12x", "5g", "1080p", "100ml"; pega
  "20mil" junto, que é a mesma corrupção. Tabela de todos os numerais
  escritos em português.
- Ambas devolvem `null` como falha de provedor, então a corrida tenta o outro
  — e só com os dois falhando é que sai `nao_entendi`.
- Testes em `voice-fallback.cjs` derivam os casos do `PROMPT_TRANSCRICAO`
  real, não de cópia hardcoded.

Verificação: `npm run test:ci` inteiro verde (39/39), incluindo corpus de
250 mil casos e guarda de sincronia app/servidor.

---

### 2. Carteiras nos lançamentos por voz (`8f2f5c7`, `c9cc7c6`)

- A Edge Function `processar-lancamento-voz` agora recebe e respeita
  `wallet_id` e `card_id` enviados pelo cliente.
- Migration `20260908000000_voice_wallets.sql`: funções `inserir_lancamento`,
  `inserir_lancamento_cartao` e `inserir_lancamento_credito` passam a
  registrar na carteira indicada ou na Principal do usuário como fallback.
- `widget-voz-task.ts` envia o `wallet_id` quando tem contexto de carteira.
- Backward compat: colunas opcionais na RPC, versões anteriores do app
  continuam funcionando sem enviar carteira.

---

### 3. Hardening para venda pública (`c66990c`, `1065aba`, `c6579a0`,
`0057619`, `2e8893f`)

**Quota de IA:**
- Quota persistente e atômica por usuário/canal para o Granabô e lançamento
  por voz, com janela por minuto e por dia; quota em memória continua só como
  defesa rápida.
- `public.consumir_cota_ia(text)` criada como `security definer`, fuso
  `America/Sao_Paulo`, RLS habilitado em `ai_usage_counters`.
- Falha da RPC retorna `503`/`limite_indisponivel`; quota esgotada retorna
  `429` com mensagem amigável.
- Migration `20260908140000_ai_usage_quotas.sql` aplicada em produção.

**Assinatura:**
- Sincronização de assinatura preserva recibo visível, token pendente e
  registra logs sem token, senha ou payload de pagamento.
- Assinatura `past_due` não abre segundo checkout: usa URL de gerenciamento
  da Kiwify quando configurada.
- Teste `assinatura-sync.cjs` com 88 linhas cobrindo os cenários.

**WhatsApp:**
- `whatsapp-webhook` ganhou suporte a carteiras (migration
  `20260908120000_whatsapp_wallets.sql`).
- `delete-account` Edge Function para exclusão de dados (LGPD).
- Migration `20260908130000_assinatura_email_confirmado.sql`.

**Documentação:**
- Especificação em `docs/superpowers/specs/2026-09-08-hardening-venda-publica-design.md`.
- Handoff completo em `documentation/` (architecture, automation, cron,
  emails, flows, operations, permissions, seo, tests, variables).
- Política de privacidade, termos e exclusão de dados cobrem voz no
  app/widget, push, Granabô/Gemini, memória e recibos técnicos.

**Produção Supabase** (projeto `cjnuzfbvfuauvlzfoutv`, `sa-east-1`):
- Todas as migrations aplicadas e verificadas.
- `assistente-financeiro` versão 21, `processar-lancamento-voz` versão 5.
- Sonda sem JWT confirmou `42501`; nenhuma quota consumida na sonda.

---

### 4. Invariante de carteira no banco (`47238b1`, `9cfc9eb`, `da0cf0a`)

- Migration `20260908150000`: insert/update sem `wallet_id` recebe a Principal
  do próprio usuário. Existe uma única Principal por usuário. Excluir carteira
  secundária reatribui dados à Principal. A Principal não pode ser excluída.
- Registros históricos sem carteira corrigidos por UPDATEs idempotentes.
- `TransactionSheet` filtra o sentinel `total`, cai na Principal como padrão
  e recusa valor que não corresponda a carteira real.
- **Race condition corrigida** (`9cfc9eb`): `refreshSaldos` era disparado pelo
  efeito da Início quando as transações chegavam e capturava `wallets` no
  closure; se a busca de carteiras perdia a corrida, rodava com lista vazia.
  Principal zerava no Expo Go enquanto o APK mostrava o valor certo (mesma
  conta, mesmo banco). Agora `refreshSaldos` sai cedo com lista vazia e
  reagenda.
- Lançamentos de agregados (cartão, boleto) reatribuídos à Principal.

---

### 5. Auditoria Impeccable completa (`2461eb3` → `e8f041a`)

Auditoria do app e do desktop web em 08/09. **24 achados fechados, 3 abertos
com motivo.** Relatório em `docs/IMPECCABLE_AUDIT_APP_WEB_20260908.md`.

**Lote 1 — marca e design** (`36cff7c`):
- **P0**: saída de dinheiro saía em vermelho no PDF. Entrada e saída agora
  mesma família cromática (5,27:1 e 5,12:1 sobre branco).
- **P1**: `entradaBorda`/`saidaBorda` reconstruíam semáforo verde/vermelho.
  `saidaBorda` → `#4f8894` (matiz ciano da marca).
- **P1**: `VozesSalvasLocalmente` sem `fontFamily`, sem touchTarget mínimo.
- **P1**: botão WhatsApp contraste 1,98:1 → 8,36:1.
- Corpus de design system agora varre `lib/` e acusa `fontSize` sem família.

**Lote 2** (dentro de `2dc7146`, depois documentado em `fdad811`):
- Insets laterais em 8 telas para paisagem.
- Granachat trata Voltar do Android e Esc.
- Modais do Perfil sobem com teclado (`useKeyboardHeight`).
- SideNav anuncia Granabô como `button`, não `link`.
- **Ícones: 19 famílias → 1.** 57 imports de `@expo/vector-icons` →
  `@expo/vector-icons/Ionicons`. Medido: **3,89 MB → 0,37 MB** de `.ttf`.

**Lote 3 — design system** (`52a840c`):
- Catálogo de sombras em `lib/theme.ts`. 15 receitas, 18 pontos de uso.
  Corpus recusa `boxShadow` literal fora do catálogo.
- Véu neutro (`rgba(255,255,255,0.0X)`) separado por papel real:
  `theme.paperSelected`, `theme.paperMint`, `theme.veil`.
- Cores de gráficos movidas de `theme.ts` para `lib/chart-colors.ts`,
  derivadas de `chartPalette` em vez de ad hoc.
- `formatarDinheiro` tabular com `variant: 'tabular'` usando `tabularNums`.

**Lote 4 — janelas e modal** (`da1cf4f`, `350f563`, `aab39e9`, `c91c949`):
- Janelas de entrada centralizadas (ImportarExtrato, PasteReceipt, QrScanner).
- Modais com `presentationStyle: 'formSheet'` (iOS).
- `formatarDinheiro` em todos os gráficos.
- Parcelas só em compra no crédito.
- Cor semântica de alerta no scan de nota fiscal.

**Lote 5 — extrato e teclado** (`beea09c`):
- `colunaLista` (900px) para extrato em monitores grandes (contra `colunaConteudo` 1440px).
- `ScreenHeader` ganhou prop `coluna`.
- Perfil agora tem botão "Voltar" (era sem saída).
- Alça de arrastar (`Sheet`) acessível por teclado.
- **2,8 MB de assets mortos removidos** (`public/notebook/bg.png`,
  `public/videos/notebook-*.webp`, `notebook-flutuando-v3.mp4`).

**Lote 6 — performance** (`6b57167`):
- Blocos ocultos da Início adiados (`defer hidden home blocks`).

**Abertos de propósito (não são bugs):**
- Sete itens na barra (6 destinos + Granabô) contra teto de 5 — decisão de
  produto.
- `srcset` nas imagens do herói — pendente de asset, não de código.
- Cascata de render da Início (64 `useState`, nenhum `memo`) — refactor
  arriscado, fica para rodada com aparelho.

---

### 6. Distribuição direta do APK (`1d5b191`, `5c6d4ca`, `be314df`)

- Tela `app/baixar.tsx` com link direto para APK.
- Rota `app/ativar.tsx` para ativação.
- `lib/download-app.ts` e `lib/atualizacao.ts` atualizados.
- Variável `EXPO_PUBLIC_ANDROID_DOWNLOAD_URL` configurada no EAS e Vercel
  (`https://granaponto.com.br/downloads/grana-latest.apk`).
- `vercel.json` com header de download.
- Documentação em `docs/DISTRIBUICAO_APK.md`.

---

### 7. Performance e limpeza (`b8c00b5`, `a993d43`, `faf80fa`)

- `lancamentos.tsx`: `initialNumToRender={8}`, `windowSize={5}` (importação
  aceita 10k lançamentos). Sem `getItemLayout` de propósito (altura variável).
- `expo-image` nos 3 avatares (perfil, Início, OnboardingModal) com
  `cachePolicy="disk"`. Dependência nativa: só vale na próxima build.
- `components/BrandLogo.tsx` apagado (último órfão).
- `PENDENCIAS.md` migrado para `context.md` e apagado.
- Barra de espaço deixa de acionar controle desabilitado (`onKeyDown` agora
  consulta `disabled` e `accessibilityState.disabled`).

---

### 8. Build Android 1.8.4 (`3d37c34`, `ca5d343`)

O autor autorizou explicitamente a build após Claude concluir correções.
`npm run test:ci` completo e `npx tsc --noEmit` passaram. `build:preparar`
elevou 1.8.3 → 1.8.4 com nota: "Melhora o lançamento por voz e os widgets,
corrige a seleção de carteiras e aprimora as telas e as respostas do Granabô."

- Build EAS: `99b1a002-dd9b-467f-9cfb-cfed3a24deb2`
- Android 1.8.4, versionCode 11, commit `3d37c34`
- Upload e fingerprint concluídos
- 155 arquivos mudaram desde o APK 1.8.3 (`17a08baf`)
- APK aguardando conclusão do build e teste real no aparelho

---

### 9. Descoberta do `+html.tsx` inerte

O `expo-router` só honra `+html.tsx` quando `web.output` é `"static"`; o
`app.json` não define a chave, então vale `"single"` (SPA). O CSS de
legibilidade, `lang="pt-BR"` e `viewport-fit` nunca valeram. Movido tudo
para `instalarDocumentoWeb()` em `lib/foco-web.ts` (injeção em runtime).
`+html.tsx` mantido com aviso explicando que está inerte.

---

### Estado ao final do dia

- **Produção Supabase**: todas as migrations do dia aplicadas e verificadas.
- **Edge Functions**: `processar-lancamento-voz` v5, `assistente-financeiro`
  v21, `whatsapp-webhook` com carteiras e quota.
- **CI**: verde (39/39 testes), incluindo corpus de 250k e guardas de design.
- **Build 1.8.4**: enviada ao EAS, aguardando conclusão.
- **Pendente**: teste da APK em Android real, publicação do asset `grana.apk`,
  redeploy da Vercel com a variável de download.

## 08/09/2026 — os dois defeitos de voz, e a instrução que causava os dois

Duas falhas do lançamento por voz na mesma noite, reportadas pelo autor com
vídeo e print. Causa raiz **comum**, e não é onde ninguém estava procurando.

### O que apareceu

**Primeiro:** o widget abriu a folha de confirmação com a descrição
`Valores em reais usam vírgula como separador decimal, nunca ponto` e R$ 0,00,
depois de o autor falar "merenda de 57 reais e 98 centavos". Aquele texto é o
PROMPT que o app envia ao provedor de transcrição.

**Segundo, e pior:** a notificação `Merenda de 57quenta e — R$ 7,66 · salvo no
Grana.` quando o autor tinha falado R$ 57,66. Este SALVOU sozinho.

### A causa

O prompt mandava o Whisper escrever em dígitos: "Valores em reais usam vírgula
como separador decimal, nunca ponto: 11,79 (não 11.79, não 1179)". Isso produz
as duas falhas:

1. **Eco.** Áudio sem fala não faz o Whisper devolver vazio — faz ele alucinar,
   e o que ele inventa é aquilo com que foi escorado. Com instrução no prompt,
   sai a instrução. Comprovado cruzando com o mesmo áudio transcrito
   localmente, sem prompt: ali saiu a fala certa nos trechos com voz e
   "Legendas pela comunidade de Amara.org" no silêncio — a alucinação canônica
   de silêncio do modelo. Dois modelos, o mesmo defeito, cada um com o seu
   recheio.

2. **Numeral partido.** Empurrado a escrever dígitos enquanto ouve palavras, o
   decodificador produz híbridos: "cinquenta" saiu "57quenta". Rodado no parser
   real, `Merenda de 57quenta e sete reais e sessenta e seis centavos` devolve
   **R$ 7,66** — "57quenta" não é número, então o valor da frase passa a ser o
   "sete" seguinte. Valor > 0 e categoria Alimentação são exatamente as duas
   condições do salvamento automático do widget. Cinquenta reais somem, calados.

E o motivo original da instrução não se sustentava. Ela existia para impedir
que "onze e setenta e nove" saísse como "1179". Medido contra o código de
produção, `guessAmountFromText` já lê a forma falada sem ajuda nenhuma:
"onze e setenta e nove" → 11,79, "uber quinze e cinquenta" → 15,50,
"merenda de cinquenta e sete reais e sessenta e seis centavos" → 57,66.
**O prompt protegia contra um problema que o parser já resolvia, e cobrava dois
piores por isso.**

### O que foi feito

Tudo em `supabase/functions/_shared/voice-transcription.ts`, que é por onde
passam os três canais (app, widget e WhatsApp) — uma correção cobre os três.

- O prompt virou só contexto de domínio: "Comando de voz em português do Brasil
  sobre um lançamento financeiro pessoal: gasto, receita, boleto ou compra."
  Sem instrução de formatação e **sem exemplos de frase** — prompt é viés de
  vocabulário nos dois sentidos, e as palavras que ele facilita reconhecer ele
  também facilita inventar.
- `ehEcoDoPrompt` recusa transcrição que seja trecho do prompt. Por TRECHO, não
  por igualdade: o eco do vídeo parou no meio e `===` não pegaria.
- `temNumeralPartido` recusa transcrição com dígito colado em pedaço de numeral
  ("57quenta", "20mil"). Exige rabo de 3+ letras para não barrar "12x", "5g",
  "1080p", "100ml".
- Os dois devolvem `null` como uma falha de provedor: a corrida segue para o
  outro provedor, e só se ambos falharem é que quem chamou recebe
  `nao_entendi` — "Não entendi / Não deu pra reconhecer o que foi falado", que
  é o que devia ter aparecido em vez da folha preenchida.

Publicado nas duas funções. Testes em `__tests__/voice-fallback.cjs`, que passou
a derivar os casos do `PROMPT_TRANSCRICAO` real em vez de copiar o texto — a
cópia teria testado um prompt que deixou de existir no momento da própria
correção.

### O que NÃO era, e ficou provado

- **Não era o interpretador.** Alimentado com a fala real, ele acerta.
- **Não era o reconhecimento local.** O widget nem usa esse caminho; o
  `expo-speech-recognition` só serve ao botão dentro do app.
- **Não era a 1.8.4.** `voice-transcription.ts` é idêntico entre 1.8.3 e 1.8.4,
  e a corrida entre provedores entrou em 06/09, antes das duas. A alucinação é
  probabilística: some e volta, o que de fora parece exatamente "quebrou na
  atualização".

### A dívida que fica

Não existe registro de nenhuma transcrição em lugar nenhum: `voice_operations`
guarda só `payload_hash`, e o áudio é apagado depois de usado. Só foi possível
diagnosticar porque o autor filmou a tela. A próxima falha de voz sem câmera
ligada é indiagnosticável do mesmo jeito.

## 08/09/2026 — auditoria /impeccable fechada (24 de 28 achados)

A auditoria completa do app e do desktop web está em
`docs/IMPECCABLE_AUDIT_APP_WEB_20260908.md`, com o placar de fechamento no fim
do arquivo. Vinte e quatro achados resolvidos e verificados por teste, um
fechado por decisão de produto (os sete controles da barra: são cinco destinos
mais o Granabô e o FAB, e a distinção entre destino e ação já está certa) e
três abertos com motivo escrito.

O que mudou de estrutural, e vale mais que a lista de correções: **três regras
do `DESIGN.md` viraram guarda mecânica**, porque a auditoria provou que regra
escrita só em markdown deriva. O corpus de design system foi de 315 para 1120
verificações.

- **Sombra** — as 15 receitas viraram `sombras` em `lib/theme.ts` e o corpus
  recusa `boxShadow` literal fora dali. O documento proibia sombra ad hoc desde
  02/09 e mesmo assim três novas apareceram, uma delas na barra de abas com
  valor DIFERENTE do que o próprio documento afirmava.
- **Only-Font** — a varredura passou a incluir `lib/` (era só `app/` e
  `components/`, e foi por isso que a saída de dinheiro em vermelho no PDF e a
  fonte do sistema passaram meses despercebidas) e a acusar estilo que declara
  `fontSize` sem família, que é como a fonte do sistema entra sem ninguém
  escrever o nome dela.
- **Ícone** — o corpus acusa import do barril `@expo/vector-icons`, que é o que
  o editor sugere sozinho e o que trazia 3,89 MB de fontes.

Também nasceram tokens onde havia hex repetido: `menta(alfa)` (o canal
174,255,227 estava escrito nove vezes, sete delas como 175), `mockupTela`,
`superficieInativa`, `colunaLista`. E `chart-colors.ts` passou a DERIVAR a
paleta de `CATEGORIES` em vez de copiá-la — o comentário já dizia "exatamente
as de CATEGORIES" e mesmo assim eram duas listas de oito hexes em arquivos
diferentes; ao ligar as duas apareceu um erro real, o mock da landing pintando
"Casa" com a cor de Transporte.

**Três achados seguem abertos, de propósito:**

- **Bundle web único (2,82 MB para a landing pública)** — separar exige trocar
  `web.output` de `single` para `static`, o que muda o modo de renderização do
  site inteiro e reabilita o `app/+html.tsx` hoje inerte. Outra ordem de
  mudança; rodada própria.
- **`srcset` nas imagens do herói** — bloqueado por ferramenta: gerar as
  variantes de largura exige um conversor de imagem que não existe neste
  ambiente. Minutos de trabalho com `sharp` disponível.
- **Cascata de render da Início** — resolvida pela metade. `HOME_BLOCOS` passou
  a guardar funções, então blocos desligados em "Personalizar Início" deixaram
  de custar `budgets.map`/`dueThisWeek.map`/`pieData.map` a cada tecla. A outra
  metade — `billDesc`, `billAmount` e o valor do orçamento sendo `useState` da
  Início — pede extrair os formulários para componentes próprios, e isso esbarra
  no `DatePickerModal`/`CategoryPickerModal`, que são singletons no nível da
  Início. É refatoração de plumbing e merece uma passada com o app rodando, para
  MEDIR: sem medição, trocar dez `useState` por dez `useMemo` de dependência
  larga troca desempenho por risco de tela desatualizada.

**Nada disso foi validado em aparelho, e nenhuma build foi disparada.** Os
números de geometria continuam sendo cálculo a partir do código.

## 08/09/2026 — entrega direta do APK

Foi implementado o fluxo curto de distribuição: rota pública `/baixar`, link
para ela no rodapé da landing, botão de download após a ativação da assinatura
e helper centralizado em `lib/download-app.ts`. A URL do APK vem de
`EXPO_PUBLIC_ANDROID_DOWNLOAD_URL`; sem uma URL HTTPS configurada a interface
mostra estado de preparação, nunca um link falso.

`lib/atualizacao.ts` também prefere essa URL estável quando existe, deixando o
artefato temporário do EAS apenas como fallback para instalações antigas ou
ambientes ainda não configurados.

O processo operacional está em `docs/DISTRIBUICAO_APK.md`. Ainda falta publicar
o APK em uma release e configurar a variável na Vercel/EAS. `vercel.json` já
redireciona `/downloads/grana-latest.apk` para o asset `grana.apk` da release
mais recente no GitHub; a criação da release e os ajustes nos painéis externos
continuam manuais.
Nenhum build foi disparado e nenhum banco foi alterado nesta mudança.

### Pendências obrigatórias para a próxima máquina — distribuição do APK

- [ ] Gerar uma nova build Android somente após autorização explícita do autor.
- [ ] Criar uma release pública no GitHub e anexar o APK com o nome exato
  `grana.apk`.
- [ ] Conferir no navegador e em Android real o redirecionamento
  `/downloads/grana-latest.apk`.
- [ ] Configurar `EXPO_PUBLIC_ANDROID_DOWNLOAD_URL` no projeto Vercel com
  `https://granaponto.com.br/downloads/grana-latest.apk`.
- [ ] Configurar a mesma variável nos perfis EAS antes da próxima build.
- [ ] Configurar no e-mail pós-compra da Kiwify os botões separados de
  download e ativação.
- [ ] Testar compra, download, instalação, ativação e atualização em Android
  real.
- [ ] Calcular e registrar o SHA-256 do APK na anotação da release.

Não considerar o fluxo de distribuição pronto enquanto esses itens não tiverem
evidência concreta. A migration de voz, `components/RevealOnScroll.tsx` e
`.tmp.driveupload/` continuam sendo alterações externas e não devem ser
incluídos nesse trabalho sem revisão própria.

## 08/09/2026 — carteiras nos lançamentos e na voz

O `TransactionSheet` agora é centralizado e exige uma carteira real, com
seleção dentro da própria janela. Home, Lançamentos, Contas e Crédito passam
o `wallet_id` escolhido também em edição; no crédito, os cartões exibidos são
os da carteira selecionada.

A voz no app e no widget reconhece nomes personalizados ancorados por
“carteira” ou “conta” (ignorando caixa e acentos), remove essa referência da
descrição e usa a carteira ativa/padrão quando ela não é dita. O widget recusa
carteira desconhecida e conflito entre o cartão e a carteira. O contrato da
operação de voz passou a exigir `wallet_id`; a migration
`20260908000000_voice_wallets.sql` valida propriedade e grava a carteira em
transações, parcelas e boletos.

A migration foi aplicada em produção em 08/09/2026 pela Management API e
verificada pela definição efetiva da função (`wallet_enabled=true` e
`legacy_fallback=true`). O token temporário fornecido não foi persistido.

A função mantém compatibilidade com APKs anteriores: quando o payload antigo
não traz `wallet_id`, resolve a carteira padrão do usuário no servidor. Assim
aplicar a migration antes da nova build não interrompe a voz da versão 1.8.3.

Verificação local: TypeScript, voz, widget-cartões, fallback, voz offline,
assistente-aprendizado, blur e motion passaram. O corpus de parser foi
iniciado sem falha reportada, mas a execução encadeada não exibiu o resumo
final; repetir antes da build. QA visual Android do modal centralizado também
continua pendente. Nenhuma build foi disparada.

## Pré-build 1.8.1 — 07/09/2026

## Correção adicional do widget de áudio — 07/09/2026

## Correção do resumo de faturas na Home — 07/09/2026

## Ordem das ações rápidas na Home — 07/09/2026

O desktop continuava mostrando a ordem antiga porque o Metro não conseguia
recompilar: `app/(app)/_layout.tsx` importava `lib/navegacao-nativa.ts`, mas o
arquivo havia sido removido em um commit anterior. O arquivo foi restaurado,
o servidor web foi reiniciado com cache limpo e a validação autenticada na
Home confirmou: não há banner de APK no desktop e Voz é o primeiro botão.

O botão de lançamento por voz foi movido para o primeiro filho da fileira de
ações inteligentes em `app/(app)/index.tsx`. Como desktop e aplicativo usam a
mesma tela, a ordem agora é Voz, Colar comprovante, Importar extrato e
Escanear nota quando os respectivos flags estão ligados. TSC passou.

`components/CreditSummaryCard.tsx` somava crédito por mês civil, embora a
tela Crédito agrupasse pelo dia de fechamento de cada cartão. O resumo agora
usa `filtrarLancamentosDaFatura`, a mesma regra compartilhada da tela de
crédito; cartões com fechamentos diferentes deixam de misturar ciclos. TSC e
17/17 checagens de ciclo passaram.

Após a build 1.8.1, o widget podia parecer morto quando a tarefa headless
falhava: `processando` não tinha ação, exceções de notificação eram silenciosas
e um `Intent` sem extras deixava o estado preso. A tarefa agora preserva
`atencao` em falhas, tenta notificar sem esconder a falha quando a própria
notificação falha, e o estado `processando` abre o app para recuperação. A
tarefa headless rejeita explicitamente intents incompletos e devolve o widget a
`atencao`. `tsc`, teste executável de cartões e 9/9 guardas visuais passaram.
Essas mudanças nativas precisam entrar em uma nova APK; nenhuma build foi
disparada nesta correção.

Build enviada e aceita pelo EAS: `ce91668c-0a56-4e45-9842-def12af7108c`, preview Android APK interno, versão 1.8.1/code 8, commit `403c446`. Status inicial NEW em 07/09/2026 06:10 UTC, compilação ainda não concluída no registro. Acompanhar: https://expo.dev/accounts/gabriouss/projects/grana-app/builds/ce91668c-0a56-4e45-9842-def12af7108c . Não disparar duplicata.

Autor autorizou corrigir impedimentos e disparar uma build Android. Versão preparada pelo script obrigatório, de 1.8.0 para 1.8.1. Expo SDK 57 alinhado nos patches recomendados; expo-asset instalado diretamente, com plugin, por ser peer obrigatório de expo-audio.

Voz: retry compartilha orçamento de 90s e inclui leitura do JSON no timeout, evitando consumir os 120s do serviço headless somente em duas tentativas. Corrigido fallback atrasado para não chamar outro provedor depois de sucesso do principal. Função processar-lancamento-voz publicada nesta rodada, substituindo a indicação histórica de "não publicado" abaixo. Sonda autenticada pós-deploy com M4A: HTTP 200, Groq, "gastei 32 reais no mercado no pix", 1,93s; sem gravar lançamento.

Validação: Expo Doctor 21/21, TypeScript, test:parser completo, test:voz, widget-voz-cartoes, voice-fallback e test:assistente-aprendizado passaram. Export Android gerou metadata e bundle Hermes. Audit de dependências: 16 moderadas, zero altas/críticas; não aplicar sugestões que rebaixam Expo. Não houve teste físico do widget/biometria; APK precisa desse teste após compilação. Push anterior foi rejeitado pela revisão automática; não repetido sem autorização específica. Build será enviada pelo checkout local.

Documento de orientação técnica/operacional pra quem (pessoa ou sessão de
IA) está entrando neste repositório agora. Cobre o que **não** está nos
outros documentos — arquitetura, convenções de código, fluxo de trabalho,
estado atual. Produto e marca/visual têm documentos próprios, mais
completos que qualquer resumo aqui:

| Documento | Cobre |
|---|---|
| `PRODUCT.md` | Público, proposta de valor, posicionamento, princípios de produto |
| `DESIGN.md` | Sistema de design completo — cores, tipografia, sombra, componentes, regras nomeadas |
| `AGENTS.md` | Regras permanentes de segurança do fluxo git/build (leia antes de commitar ou buildar) |
| `PLANO_DE_EVOLUCAO.md` | Roadmap de engenharia por épicos (gamificação, IA, automações futuras) |
| `context.md` (este arquivo) | Arquitetura, convenções de código, estado atual, como testar |

## O que é o Grana.

App de finanças pessoais (Expo Router + React Native + Supabase) que
elimina a fricção de anotar gasto: a pessoa fala, manda mensagem no
WhatsApp (texto ou áudio), ou fotografa o QR Code de uma nota fiscal — sem
nunca conectar a uma conta bancária. Ver `PRODUCT.md` para a proposta de
valor completa. Nome sempre "Grana." com o ponto.

**Fase atual**: preparação do lançamento comercial. O produto será **pago
desde o primeiro dia, R$ 9,90/mês, sem período de teste** (decisão de
28/08/2026). A landing já anuncia o preço; o checkout da Kiwify e o bloqueio
de acesso ainda não existem, então quem cria conta hoje segue com acesso
completo. Empresa verificada pela Meta e WhatsApp como canal oficial em
operação desde 28/08/2026 — a revisão terminou (ver `PRODUCT.md` para o que a
verificação permite e o que ela não significa na copy).

## Stack

- **Expo SDK 57** (`expo-router` ~57, `react-native` 0.86.2, `react` 19.2.3)
  — a versão mudou bastante entre majors; ao escrever código novo, checar a
  doc versionada em `https://docs.expo.dev/versions/v57.0.0/` em vez de
  confiar em conhecimento geral desatualizado (isso já está em `AGENTS.md`
  como instrução permanente).
- **React Native Web** (`react-native-web` ^0.21) — o mesmo código roda
  como app nativo (iOS/Android) e como site (`npx expo start --web`). A
  landing page pública (`app/index.tsx`) só renderiza na web (redirect pra
  `/sign-in` no nativo).
- **Supabase** — Postgres com RLS, Auth, Edge Functions (Deno), plano
  **Free** (nenhuma solução pode depender de recurso exclusivo do Pro).
- **TypeScript** estrito o bastante pra `tsc --noEmit` ser o gate de
  qualidade padrão depois de qualquer mudança.
- Sem Reanimated/Moti/GSAP — animação é `Animated` nativo do RN em telas
  do app, e no site tanto `Animated` quanto CSS puro (`@keyframes`,
  `transition`) via casts `as any` (ver seção de convenções).

## Estrutura de pastas

```
app/                    Expo Router — cada arquivo é uma rota
  _layout.tsx            Stack.Protected: sessão logada → (app); senão → index/sign-in/sign-up
  index.tsx               Landing page pública (só web)
  sign-in.tsx, sign-up.tsx, nova-senha.tsx
  ativar.tsx               Ativação de compra (Kiwify) — funciona logado ou deslogado
  termos.tsx, privacidade.tsx, exclusao-de-dados.tsx   Sem Stack.Protected — precisam abrir de qualquer lugar
  (app)/                  Área logada — 5 abas (Início, Lançamentos, Crédito, Contas, Desafios) + Gráficos/Perfil
components/              ~65 componentes compartilhados (UI + landing)
lib/                     Lógica/dados sem UI — auth, heurísticas de categorização, gamificação, formatação, etc.
supabase/
  schema.sql              Schema completo (tabelas, RLS, triggers)
  functions/               3 Edge Functions: whatsapp-webhook, kiwify-webhook, eas-build-webhook
  email-templates/
__tests__/               Corpus de teste do parser de voz/WhatsApp (`npm run test:parser`)
design-system/            Tokens exportados (`tokens.json`) + página HTML de referência visual
```

## Roteamento e autenticação

`app/_layout.tsx` usa `Stack.Protected` (padrão atual do expo-router) em
vez de redirect manual — evita o "flash" de tela protegida antes do
redirect. `lib/auth-context.tsx` expõe `useSession()`; `onAuthStateChange`
atualiza o estado pra **qualquer** tipo de evento (inclusive
`USER_UPDATED`), o que outras partes do app dependem pra reagir a mudança
de `user_metadata` sem plumbing extra (ex.: o tour da Início dispara
sozinho assim que `onboarding_seen` muda).

Flags one-time (onboarding visto, tour visto) ficam em
`user_metadata` do Supabase Auth, não `AsyncStorage` — precisam
sincronizar entre aparelhos/navegadores da mesma conta.

## Camada de dados

Tabelas principais (`supabase/schema.sql`): `transactions`, `bills`,
`categories`, `budgets`, `goals`, `credit_cards`, `credit_card_invoices`,
`wallets`, `whatsapp_links`, `whatsapp_pending`, `subscriptions`,
`user_gamification`, `feedbacks`, `app_release`, `webhook_raw_log`. RLS
habilitado em todas — cada usuário só acessa as próprias linhas.

**Assinatura/acesso**: `subscriptions.access_until` controla até quando uma
assinatura recorrente está vigente. `lib/assinatura.ts` cuida do vínculo
automático (email/token) e
`app/ativar.tsx` processa o link pós-checkout. Hoje **não há bloqueio de
acesso** por assinatura — toda conta logada tem acesso total, decisão
deliberada enquanto o preço não é definido.

**Categorização automática**: `lib/heuristics.ts` é a heurística
compartilhada entre os 3 canais de entrada (voz, WhatsApp, QR de nota) —
espelhada no webhook do WhatsApp (Edge Function), então uma mudança de
regra de categorização geralmente precisa ser replicada nos dois lugares.

**Build/versão**: `app_release` é escrita pela Edge Function
`eas-build-webhook`, que **recusa** builds cuja versão não seja maior que a
já anunciada. Ver regra 5 do `AGENTS.md` — subir `expo.version` no
`app.json` antes de todo build de release é obrigatório, senão o aviso de
atualização (`lib/atualizacao.ts` + `UpdateBanner`) fica mudo sem erro
nenhum. Versão atual: `1.4.0`.

## Convenções de código

- **Nomes em português** em todo o código de produto (variáveis, funções,
  componentes de tela) — comentários também. Nomes de bibliotecas/tipos
  vindos de dependências ficam como estão.
- **Comentários só pra WHY não-óbvio** — restrição, bug histórico,
  decisão que parece estranha sem contexto. Nunca "o que" o código já diz
  sozinho.
- **Neue Machina é a única fonte do produto** — `fonts.regular`/`fonts.light`
  em `lib/theme.ts` apontam pra `NeueMachina-Regular`/`NeueMachina-Light` em
  TODO texto (marca, títulos, corpo, campo, controle, valor), em toda
  plataforma. Regra permanente do autor: proibido usar fonte do sistema em
  qualquer papel — uma rodada anterior trocou o corpo do app pra fonte do
  sistema achando que era exigência de Dynamic Type/sp (não era: texto de
  fonte customizada já escala normalmente), e foi revertida em 27/08/2026.
  Não sintetizar bold na fonte da marca (só existem Light e Regular).
- **Valor monetário sempre com `fontVariant: ['tabular-nums']`** — dígitos
  não podem "dançar" ao atualizar.
- **Sem vermelho** em nenhuma superfície de estado — saída de dinheiro usa
  ciano (`theme.down`), não vermelho. `theme.danger` existe só pra
  erro/ação destrutiva, não pra "gasto".
- **CSS web-only via `as any`** — `boxShadow`, `backgroundImage`,
  `backdropFilter`, `scrollSnapType` etc. não existem no tipo `ViewStyle`
  do React Native; o padrão do projeto é castar o objeto de estilo inteiro
  com `as any` no ponto de uso (`GlowOrb.tsx` é a referência mais citada
  pro padrão). Sempre guardado por `Platform.OS === 'web'` quando o
  componente também roda nativo.
- **`lib/breakpoints.ts`** — classes de janela valem em web e nativo. O app
  reestrutura grades/modais em médio e amplo; a web troca para SideNav,
  enquanto iOS/Android usam Native Tabs e deixam tab bar/sidebar/Navigation
  Bar sob responsabilidade do sistema.
- **Alinhamento rigoroso** — instrução permanente do autor: todo texto e
  elemento de uma mesma página precisa compartilhar a mesma margem/grade,
  auditado de verdade (medição, não olhômetro) antes de considerar uma
  seção pronta.
- **`scroll-snap` em `mandatory` quebra navegação programática**
  (`scrollIntoView`) neste projeto — testado e revertido uma vez; use
  `proximity` se precisar de encaixe de rolagem na web.
- **`Animated.loop` do React Native trava depois de uma volta** no
  react-native-web (bug observado e corrigido em `TrustMarquee.tsx`) — pra
  loop CSS infinito de verdade, prefira `@keyframes` + `animationIterationCount: 'infinite'`
  direto, não `Animated.loop`.

## Landing page (`app/index.tsx`)

Página de conversão fria (`/`, só web) — recebe quem nunca ouviu falar do
Grana., separada da tela de login. Passou por duas rodadas grandes de
retrabalho recentes:

- Hero-storytelling com 4 capítulos em scroll (voz → WhatsApp → QR de nota
  → Livre para Gastar), notebook 3D real (composição de camadas PNG
  animadas via CSS, não mais mockup SVG) — `components/NotebookAnimado.tsx`.
- Seções em "dobras" de tela cheia (16:9) com `scroll-snap: proximity`,
  FAQ em cards sobre grade de fundo, Preços em 2 colunas, faixa de
  confiança (`TrustMarquee`) em loop infinito real sob o cabeçalho, textura
  quadriculada interativa atrás de várias seções
  (`components/GradeInterativa.tsx`).
- Ver `DESIGN.md` § "Herói-storytelling" pra linguagem visual, e o próprio
  `app/index.tsx` — os comentários no arquivo documentam o raciocínio de
  cada decisão (por que dobra de tela cheia, por que `proximity` e não
  `mandatory`, etc.) com mais detalhe do que cabe aqui.
- Três seções inspiradas no Organizze, adaptadas à identidade visual do
  Grana. (sessão mais recente): um "Guia" de 4 passos numerados, a grade
  de recursos com o app centralizado, e a seção de Segurança com uma
  composição navegador+celular sobrepostos — todas usando
  `components/MolduraCelular.tsx`/`MolduraNavegador.tsx` (bezel desenhado
  em CSS, sem asset de imagem; flutuam sozinhas e pausam via
  `IntersectionObserver` quando saem da tela) com capturas reais em
  `public/telas/` de uma conta de exemplo com dado 100% fictício — nunca
  logar numa conta de verdade (nem de demonstração) pra gerar material de
  marketing, só dado inventado, mesmo que a intenção seja reproduzir uma
  tela real.
- Assinatura definida em R$ 9,90/mês, já exibida na seção de preços. Sem
  período de teste: o lançamento é pago desde o primeiro dia. O acesso segue
  liberado só porque o checkout ainda não entrou em operação.
- Herói compacto (mobile): capítulos 2-4 repetiam a legenda "Acesso
  antecipado" idêntica 4 vezes numa rolagem curta, sem nenhum apoio visual
  (o vídeo do notebook só aparece uma vez, no capítulo 1, de propósito —
  4 cópias do mesmo `<video>` autoplay era pesado e redundante). Corrigido
  dando a cada capítulo 2-4 um ícone próprio (`Capitulo.icone`, mesmo
  círculo de `featureIconeCirculo`) no lugar da legenda repetida — WhatsApp,
  QR code, carteira. Chamado a atenção por print real do site publicado.
- Duas correções extras no herói compacto, também via print real do site
  publicado: (1) `styles.headline` tinha piso de 44px pensado pra UM título
  só (primeira dobra do herói largo) — repetido 4× empilhado no compacto lia
  como "gigante"; criado `headlineCompacto` com piso bem menor, dedicado.
  (2) O capítulo 1 do herói compacto ainda usava `<NotebookVideo>` (mp4) —
  único lugar que tinha ficado pra trás quando o herói largo trocou pro
  composto animado em PNG; `NotebookAnimado` ganhou uma prop `variante`
  (`'fundo'` = herói largo, absoluto+cover; `'caixa'` = herói compacto,
  `width:'100%'` + `aspectRatio` real do RN, sem `onLayout`/medição — a
  caixa JÁ tem a proporção do canvas, não precisa do recorte tipo `cover`
  que o modo `fundo` calcula). `NotebookVideo.tsx` ficou sem uso (mantido no
  repo, não apagado).
- Ícone "Meta atingida" (troféu com faíscas, `components/IconeMetaAtingida.tsx`)
  importado de um projeto Claude Design (`claude.ai/design`, MCP
  `claude_design`), só a peça animada (sem o texto de estado vazio que a
  acompanhava na origem) — markup SVG embutido via `dangerouslySetInnerHTML`,
  não recriado em `react-native-svg`, pra não divergir de pixel do original.
  Chegou a ficar no CTA final da landing; removido de lá na rodada de
  simplificação da seção, mas o componente ficou sem uso no repo, não
  apagado (mesmo critério do `NotebookVideo.tsx` acima).

## Como testar

- **Tipo**: `npx tsc --noEmit` depois de qualquer mudança — gate mínimo
  antes de considerar algo pronto.
- **Parser de voz/WhatsApp**: `npm run test:parser` roda o corpus em
  `__tests__/`.
- **Visual/QA da landing (ou qualquer tela web)**: `npx expo start --web`
  local, depois `agent-browser` (skill instalada) pra navegar, redimensionar
  viewport (testar pelo menos ~390px compacto e ~1440-1600px largo) e tirar
  screenshot. Pra rolar uma `ScrollView` do React Native Web via
  `agent-browser eval`, é preciso achar o `div` com `scrollHeight >
  clientHeight` — não é a `window` que rola.
- Sem Playwright/Jest configurado pra UI — a verificação visual é sempre
  manual (screenshot + leitura), não snapshot automatizado.

## Fluxo de trabalho entre duas máquinas

Este repositório é trabalhado por Gabriel em duas máquinas diferentes.
Regras de segurança completas (nunca `git init`, sempre `git fetch` antes
de commitar, sempre `git push` antes de encerrar sessão com mudança de
código, nunca disparar `eas build` sem pedido explícito na sessão atual)
estão em `AGENTS.md` — leitura obrigatória antes de qualquer commit ou
build, não repetida aqui pra não divergir da fonte única.

## Sessão de 28/08/2026 — fonte, tokens e bug do Expo Go

Publicado em `origin/main` (commits `80b143d` e `83d0c2a`), com deploy da
Vercel confirmado no ar em granaponto.com.br.

- **Fonte da marca revertida.** Uma rodada anterior trocou `fonts.regular`/
  `fonts.light` pela fonte do sistema em ~472 pontos de uso, alegando
  Dynamic Type/sp. Texto de fonte customizada já escala no React Native, então
  não havia troca a fazer. Neue Machina voltou a ser a única fonte do produto e
  a regra virou permanente ("The Only-Font Rule" em `DESIGN.md`); `PRODUCT.md`,
  este arquivo e `.impeccable/design.json` também descreviam o split
  marca/sistema como válido e foram corrigidos.
- **Token drift fechado.** `theme.danger` no lugar de `#e08a7d` (6 arquivos) e
  fim do quase-duplicado `#e08b7f`; `paperSelected`/`accent` em `BadgeCard` e
  Gráficos; novo par `entradaBorda`/`entradaFundo`/`saidaBorda`/`saidaFundo`
  substituindo hex repetido em 5 arquivos.
- **Eixo do `FlowChart` no estado vazio.** Sem movimentação, `maxVal` caía no
  piso de 1 e o eixo imprimia "R$ 0, R$ 0, R$ 1, R$ 1, R$ 1". A escala agora é
  suprimida; a grade continua.
- **Tela branca no Expo Go depois da trava por digital** (regressão do commit
  `b34be61`). `NativeTabs` usa componentes Fabric compilados que o Expo Go não
  tem — a view não registra, nada renderiza e nenhum erro sobe pro JS. Agora
  `lib/navegacao-nativa.ts:abasNativasDisponiveis()` decide por AMBIENTE DE
  EXECUÇÃO, não por `Platform.OS`; `useTabBarInset` usa a mesma função, e
  `WebTabsLayout` virou `AbasEmJavaScript` (atende navegador e Expo Go).

**Pendente para a próxima sessão:**

1. **As abas nativas nunca rodaram em aparelho.** O Expo Go agora desvia delas,
   então o teste de 28/08 não validou esse caminho — ele só entra numa build do
   EAS. Validar antes de publicar release.
2. **`app.json` ainda em `1.4.0`**, mesma versão da build que a cota barrou.
   Subir antes do próximo build de release, senão o webhook recusa e ninguém é
   avisado da atualização (ver regra 5 do `AGENTS.md`).
3. **Cota do EAS.** 24 builds em agosto/2026, 15 concluídas — exatamente o teto
   do plano free. Conferir a renovação em
   https://expo.dev/accounts/gabriouss/settings/billing antes de disparar.
4. **P2 de performance em aberto**, com o porquê detalhado em
   `IMPECCABLE_AUDIT.md`: Início, Gráficos e Lançamentos baixam o histórico
   inteiro de transações. Não é só janelar — o saldo depende do histórico
   completo (janela curta daria saldo ERRADO, não mais lento) e a navegação por
   mês/ano precisa de dados arbitrários. Exige agregação aplicada no banco e
   busca por período sob demanda.

## Estado no momento deste documento

- Landing page (`app/index.tsx`) passou por auditoria completa e recebeu melhorias estruturais:
  - Cabeçalho sticky com `backdrop-filter: blur` + link discreto "Entrar" no topo.
  - Meta tags SEO com `<Head>` (título, descrição, OG image) e `lang="pt-BR"` garantido no HTML.
  - Indicador visual de scroll no herói (seta animada) e marcadores de capítulo mais nítidos.
  - Capítulos 2-4 do herói no mobile agora têm CTA direto.
  - Quebras de linha `\n` manuais tornadas condicionais ao desktop.
  - Seção Segurança no mobile agora exibe a moldura de celular individual.
  - Cards de dor ("Reconhece isso?") com efeito hover unificado com os cards de feature.
  - Botão CTA do card de preço centralizado no layout mobile.
  - Rodapé empilhado e centralizado no mobile evitando desalinhamento dos links legais.
  - `NotebookAnimado`: pausa de animação via `IntersectionObserver` ao sair da tela, `fetchpriority="high"` e dimensões explícitas para otimização de LCP/CLS.
  - `FaqItem`: hover interativo nos botões e primeiro item aberto por padrão como affordance visual.
  - Correção do texto cortado na seção "O guia pro seu controle financeiro"
    em larguras compactas/intermediárias: `colunaTextoSecao` usava `flex: 1`
    no layout desktop e mantinha esse crescimento depois que o contêiner passava
    para `flexDirection: 'column'`. O React Native Web resolvia uma altura menor
    que o conteúdo, e o `overflow: hidden` da dobra ocultava o final do passo 04.
    A landing agora aplica `colunaTextoSecaoCompacta` às três seções que usam
    esse padrão, removendo o crescimento no eixo vertical (`flexGrow: 0`,
    `flexBasis: 'auto'`), liberando largura total e fazendo o contêiner compacto
    esticar os filhos. Validado sem recorte em 375, 720, 1024 e 1440 px, sem
    erros no console, com `npx tsc --noEmit` e export web concluídos.
- Assinatura recorrente definida em R$ 9,90/mês, sem período de teste; nenhuma
  trava de acesso implementada ainda (toda conta logada tem acesso completo).
- Épicos de `PLANO_DE_EVOLUCAO.md` (metas/cofrinhos, gamificação, projeção
  de fatura) majoritariamente já implementados — conferir `lib/goals.ts`,
  `lib/gamification*.ts`, `lib/projections.ts` antes de assumir que é
  trabalho futuro.

## Sessão de 28/08/2026 — continuidade da nova landing

- Concluídas em `app/index.tsx` as dobras de hábito, Livre para Gastar,
  benefícios, segurança, CTA final e rodapé previstas em
  `HANDOFF_LANDING_CODEX.md`.
- **A dobra de voz NÃO existe.** Uma versão anterior deste registro dizia que
  ela tinha sido concluída e que `components/DemonstracaoVoz.tsx` fora criado;
  nenhum dos dois está na árvore. A seção "Como entra o lançamento", que era
  onde voz/WhatsApp/QR viviam, foi removida sem substituta, então hoje a voz
  no app só aparece numa bullet do card "Lance do jeito que for mais fácil" e
  no FAQ. É o item aberto mais relevante da landing.
- Adicionado `MiniMockBeneficio.tsx`; integrados `ConversaGranabo.tsx` e
  `CardLivreParaGastar.tsx` com dados fictícios.
- `AppPressable` agora encaminha `target` e `rel` por `hrefAttrs` na web, para
  os links externos preservarem o comportamento e a proteção esperados.
- QA local concluído em 390×844 e 1440×1000. TypeScript e corpus completo
  do parser passaram; axe-core reportou zero violações confirmadas.
- Sem commit, push ou publicação nesta rodada. A landing aguarda revisão ao
  vivo do autor antes de qualquer entrega externa.

## Sessão de 29/08/2026 — auditoria técnica da landing e correções

Auditoria `/impeccable audit` sobre `app/index.tsx`, com detector empacotado
mais inspeção ao vivo em 390, 834, 1264 e 1440. Herói preservado por decisão
do autor ("a sessão hero nova está aprovada"), então nada de design, copy ou
layout dele foi tocado.

- **Imagens do herói em WebP sem perdas.** As três camadas do notebook saíram
  de 1.170 KB de PNG para 581 KB, mais a tela do herói compacto (187→129 KB) e
  a captura de Conquistas (126→48 KB). Verificado pixel a pixel: alpha idêntico
  em 100% dos pixels e RGB idêntico em 100% dos pixels VISÍVEIS; a única
  diferença está no RGB sob `alpha=0`, que nenhum compositor desenha. Os PNGs
  substituídos foram removidos de `public/` (recuperáveis pelo git).
- **Fonte do sistema eliminada da landing.** `MolduraNavegador` renderizava
  `granaponto.com.br` sem `fontFamily`, e o react-native-web entregava
  `-apple-system, Segoe UI, Roboto…` — era o único texto visível da página
  fora da Neue Machina.
- Contraste do chip de categoria em `MiniMockBeneficio` estava em 4,25:1
  (WCAG AA pede 4,5:1); a cor da categoria ficou na borda e no fundo, o
  rótulo passou a usar `theme.ink`.
- `#25D366` decorativo saiu do painel de segurança em `app/index.tsx`. A
  exceção de cor de terceiro do DESIGN.md vale só com necessidade funcional,
  que é o caso da bolha em `ConversaGranabo`, não de um fundo de ícone.
- `landing-meta.json` ainda anunciava "Acesso antecipado gratuito" no
  `ogDescription`, ou seja, no card de compartilhamento.
- `will-change: transform` removido do `GlowOrb`: três elementos estáticos com
  `blur(70px)` mantinham camada de composição própria pela vida da página.
- `vercel.json` ganhou `Cache-Control`: `immutable` em `/assets/` e
  `/_expo/static/` (nomes com hash de conteúdo, confirmado no export) e
  `max-age=86400, stale-while-revalidate` em `/notebook/` e `/telas/`.
- Quebras de linha forçadas (`\n`) saíram do checklist de Preços, onde viravam
  quatro linhas irregulares por item em 390px, e da lista de segurança, onde
  já eram string morta apagada em tempo de render.
- Limpeza: 39 chaves de estilo órfãs removidas de `app/index.tsx` (180→141),
  mais os imports `useRef` e `colunaLeitura`, e os assets não referenciados
  `tela-mobile-2.png`, `graficos-web.png`, `inicio-web.png`,
  `inicio-mobile.png`.
- **Aberto, para decisão do autor:** `public/videos/` (2,6 MB, incluindo um
  MP4 de 2,4 MB) e os componentes `NotebookVideo.tsx`,
  `NotebookFloatEstatico.tsx`, `LaptopMockup.tsx` e `MolduraCelular.tsx` estão
  todos órfãos desde que a composição de três camadas substituiu o vídeo do
  herói. Nada os importa. Também segue aberto o `Ionicons.ttf` (199 KB
  comprimidos em produção) carregado por volta de vinte glifos: reduzir exige
  trocar todo ícone da página por SVG inline, inclusive o do herói.
- Medido no export de produção servido localmente: as duas requisições da
  Neue Machina que o servidor de desenvolvimento fazia pela rede são, em
  produção, uma da rede e uma do cache (`transferSize: 0`). Não é defeito.

## Sessão de 29/08/2026 — ritmo vertical do herói mobile

- O herói compacto deixou de sobrepor a copy ao mockup com uma margem inferior
  negativa. Imagem, bloco de mensagem e CTA agora usam `gap` de 20 px no
  contêiner; eyebrow, H1 e apoio usam `gap` interno de 12 px e têm as margens
  individuais neutralizadas nessa variante.
- O bloco ganhou respiro explícito de 16 px no topo e 28 px na base. O H1
  compacto passou a centralizar também o texto, não apenas a própria caixa.
- Validado visualmente em 320×800 e 390×844 no Chrome, sem sobreposição e sem
  erros de página; `npx tsc --noEmit` passou após a alteração inicial.

## Sessão de 29/08/2026 — ícone da web, botões, entrelinha, privacidade e relatórios

Rodada de correções pedida pelo autor em seis pontos, mais uma regressão de
marca detectada durante o trabalho.

**Ícone da web (regressão em produção).** `public/favicon.svg` desenhava o
símbolo chapado numa cor só, alternando por `prefers-color-scheme`, sem
gradiente e com o ponto na mesma cor do G. Como o `<link>` dele declara
`type="image/svg+xml"`, o Chrome o preferia ao `.ico` e o site aparecia com
dois ícones diferentes dependendo de onde era visto. Refeito a partir de
`design-system/marca/simbolo-gradiente.svg`: gradiente de 45° atravessando o
símbolo inteiro, ponto em menta sólida, fundo transparente. `favicon.png` e o
`.ico` (que o Expo gera de `assets/favicon.png`) foram regerados do mesmo
vetor, e `scripts/inject-og-meta.js` passou a remover o `<link rel="icon">`
que o Expo emite, para a página declarar um ícone primário só.

**Botões de ícone do cabeçalho.** `HeaderAction` sem rótulo saía 28×44: o
ícone de 16 com padding de 6 dava 28 de largura, e o `minHeight: touchTarget`
esticava a altura. Com `borderRadius: pill` isso é uma cápsula vertical, não um
círculo. Os dois lados passaram a valer `touchTarget`, e `VoiceEntryButton`
(que tinha diâmetro próprio de 32) foi alinhado ao mesmo tamanho.

**Entrelinha.** `lib/theme.ts` ganhou `leading` e `lh()`, com os mesmos ratios
que `textStyles` já usava. Foram convertidos 38 estilos cuja entrelinha era
menor que 1.25 do corpo da letra, incluindo um 14/14 em `perfil.tsx`. Seguem
~405 estilos sem `lineHeight` declarado, que caem no leading intrínseco da
Neue Machina; usar `lh()` neles é o trabalho seguinte.

**Modo privacidade.** O blur voltou sem o vazamento que o motivou a sair. O
valor real não é mais renderizado quando o modo está ligado: entra uma máscara
falsa e de largura fixa (`R$ 0.000,00`), injetada dentro do próprio `<Text>`
filho por `cloneElement` para herdar a tipografia da tela, e é ela que recebe o
`blur(7px)`. Inspecionar, copiar ou desligar o CSS devolve a máscara.

**Relatório PDF.** Na web ele nunca era usado: o shim de web do `expo-print`
faz `printToFileAsync()` ser `window.print()`, ignorando o HTML — o botão
imprimia a tela. Agora a web abre janela própria com o relatório (janela e não
iframe, porque a CSP não declara `frame-src`). O template saiu da fonte do
sistema e do `font-weight: 600`: na web reaproveita as `@font-face` que o
react-native-web já injetou, sem custo de bundle. Ganhou a seção "Leitura do
mês", com sete insights que só aparecem quando o dado os sustenta.

**Retrospectiva do Mês.** Usava `theme.danger` e dizia "você fechou o mês no
vermelho" — vermelho não existe na paleta e a copy julga, contra a estrela guia
do DESIGN.md. Trocado para `theme.down` e reescrito, mais dois slides novos
(variação contra o mês anterior, e fixo contra variável).

**Gráficos.** A linha do donut era limitada a 460 px, teto herdado de quando o
donut media 220; no amplo ele cresceu para 280 e sobravam 160 para a legenda,
o que cortava o nome da categoria em "Morad…". Teto passou a 520, e no celular
donut e legenda empilham em vez de dividir a linha.

**Aberto, para a próxima sessão:** o ritmo geral das telas (`screenRhythm`) e o
espaçamento interno de modais e folhas seguem sem revisão. As duas exigem ver o
app logado para calibrar, e mudar `screenRhythm` no escuro afeta seis telas de
uma vez.

**Análise do sistema de progressão.** São três sistemas independentes com
vocabulário colidente: Faixa (por Score 0–1000), Elo (por XP) e Arquétipo (por
questionário). "Estrategista" nomeia os três, ganho por mecânicas sem relação
entre si. O XP vem exclusivamente de cofrinho (`lib/goals.ts`): registrar
lançamento, cumprir orçamento e pagar boleto não geram XP nenhum. Conquistas
não são persistidas, então as de sequência voltam a bloquear quando a condição
deixa de valer.

## Sessão de 29/08/2026 — correções da auditoria da landing

- Eliminados os overflows de Preços, FAQ e Segurança em 320 px. Os filhos
  compactos agora anulam os `minWidth` de desktop, ocupam 100% da largura útil
  e não criam rolagem horizontal.
- Hábitos permanece empilhado abaixo de 1080 px; o mockup de 560 px não invade
  mais a coluna textual em 768/1024. O herói também usa a variante compacta
  abaixo de 960 px ou 600 px de altura, evitando colisão em paisagem curta.
- A navegação por seções vive SÓ no botão flutuante, em qualquer largura. Uma
  rodada intermediária a devolveu ao cabeçalho acima de 1280 px e restringiu o
  flutuante a compacto/médio; foi revertido a pedido do autor, que tirou a
  fileira de atalhos do topo justamente por achá-la amontoada. O cabeçalho
  carrega marca e "Entrar", e nada além disso.
- O menu flutuante foca o primeiro link ao abrir e devolve o foco ao gatilho ao
  fechar. Seus sete links usam a referência real do `ScrollView` para rolar ao
  destino e compensar o cabeçalho sticky; todos foram medidos com destino em
  49 px e cabeçalho terminando nos mesmos 49 px.
- Os 3 cards de dor e os 6 cards de benefícios deixaram de usar `AppPressable`:
  são informativos, portanto não entram mais na ordem de teclado nem expõem
  semântica de controle sem ação.
- Validado no Chrome em 320×800, 375×812, 390×844, 768×1024, 844×390,
  1280×800 e 1440×1000. Axe-core: 0 violações; `prefers-reduced-motion`:
  0 animações em execução; `npx tsc --noEmit`: aprovado.

## Sessão de 30/08/2026 — favicon oficial em todas as rotas web

- A landing já declarava o símbolo oficial “G.” com gradiente, mas o HTML
  inicial servido pelo Metro para a área de membros não incluía favicon. O
  navegador caía no ícone antigo em cache, com fundo azul e “G” chapado.
- `app/_layout.tsx` agora injeta pelo `expo-router/head`, em todas as rotas
  web, o SVG canônico `public/favicon.svg`, o PNG oficial como fallback e o
  `apple-touch-icon`. As URLs receberam a versão
  `grana-gradiente-20260830` para invalidar o cache persistente do navegador.
- `app/+html.tsx` e `scripts/inject-og-meta.js` usam exatamente as mesmas
  declarações, cobrindo tanto renderização estática futura quanto o export SPA
  atualmente publicado pela Vercel. O PNG de `assets/favicon.png` usado pelo
  Expo e o de `public/favicon.png` são binariamente idênticos.
- Validado no DOM hidratado das rotas `/`, `/sign-in` e `/lancamentos`, no
  export web de produção após a injeção de metadados e com
  `npx tsc --noEmit`, todos aprovados.

## Sessão de 31/08/2026 — pop-up de novidades por versão

Pedido do autor: avisar, dentro do app, o que mudou (correções/features)
quando a pessoa abre uma versão recém-instalada — diferente do
`UpdateBanner`, que avisa de uma versão *futura* disponível pra baixar.

- **`components/NovidadesModal.tsx`** — folha (mesmo padrão visual do
  `FeedbackModal`: `AppModal` + `AccessibleModalPanel` + `useSheetFlutuante`)
  com a lista de novidades da versão instalada. Montada em `app/_layout.tsx`
  ao lado do `UpdateBanner`, só na área logada (`session && <NovidadesModal
  />`).
- **`lib/atualizacao.ts`** ganhou `verificarNovidades()`/
  `marcarNovidadesVistas()`. A checagem compara a versão instalada
  (`Constants.expoConfig.version`) com a última versão cujas novidades já
  foram vistas neste aparelho (`AsyncStorage`, chave
  `grana_novidades_versao_vista`) — device-local de propósito, mesmo
  critério do `grana_versao_dispensada` já existente, não `user_metadata`.
  Na primeira abertura de sempre (instalação nova, sem baseline salva) só
  grava a versão atual e fica muda — não é atualização, não tem novidade
  pra mostrar. `buscarAppRelease()` foi extraída pra ser a leitura única da
  linha singleton `app_release`, compartilhada com `verificarAtualizacao()`
  (evita duas idas à rede quando as duas checagens rodam juntas).
- **Fonte do texto**: `app_release.notes`, um item por linha. Antes desta
  sessão a coluna existia no schema mas nada nunca escrevia nela.
  `publicar_app_release` (SQL) ganhou o parâmetro opcional `p_notes`, e
  `eas-build-webhook` passa `payload.metadata?.message` — a mensagem do
  build EAS (`eas build --message "..."`, ou a mensagem do commit quando
  nenhuma é passada explicitamente). Decisão do autor: preferiu automação
  via mensagem do build a editar a tabela manualmente a cada release, pelo
  mesmo motivo do bump de versão da regra 5 do `AGENTS.md` — um passo
  manual extra é um passo que uma hora vai ser esquecido em silêncio.
- O pop-up só aparece quando `app_release.version` bate exatamente com a
  versão instalada e há `notes` não vazias — nunca inventa novidade a
  partir de nada, e nunca mostra nota de uma versão que não é a que está
  rodando.
- `npx tsc --noEmit` e `npm run test:parser` (incluindo
  `corpus-schema-guardas.ts` e o `sync-parser.js`) passaram depois da
  mudança.

**Resolvido em 01/09/2026:** `publicar_app_release` com o parâmetro `p_notes`
foi aplicada ao banco de produção. Ao rodar `eas build`, continuar escrevendo
`--message` pensando em quem usa o app, não em changelog técnico — é isso que
vira o texto do pop-up.

## Sessão de 31/08/2026 - refinamento local da landing com referência Portfolite

Primeira passagem feita somente no ambiente local, aguardando aprovação do
autor antes de qualquer commit, push ou publicação. O Portfolite foi usado
apenas como referência de ritmo editorial e hierarquia; identidade, copy,
paleta, Neue Machina e visuais existentes do Grana. foram preservados.

- Os novos PNGs de notebook/celular em `design-system/marketing-mockups/` não
  foram usados. A landing continua usando apenas os visuais que já possuía.
- `TrustMarquee` virou uma linha de fatos estática no breakpoint amplo e com
  movimento reduzido. Em larguras menores, onde os quatro fatos nao cabem, o
  ticker e o controle de pausa continuam disponíveis.
- O gatilho de `NavFlutuanteLanding` mostra "Explorar"/"Fechar" no amplo e
  permanece circular e somente com ícone nas larguras menores.
- A grade de benefícios ganhou composição assimétrica no amplo, rótulos de
  categoria e mais presença para os mini-visuais já existentes. Compacto e
  medio mantem a estrutura anterior. A copy do CSV foi atualizada de 500 para
  10 mil linhas, acompanhando o limite real do importador.
- Validado em 320, 390, 768 e 1440 px sem overflow novo. `npx tsc --noEmit` e
  `git diff --check` passaram. Axe-core: 0 violações automáticas em 390 e
  1440 px; contraste ficou marcado como revisão manual pelo motor. Com
  `prefers-reduced-motion`, 0 animações permanecem em execução.

## Sessão de 01/09/2026 - tela branca após desbloqueio biométrico

O defeito reapareceu numa build Android real: depois de autenticar com a
digital, a tarefa continuava viva no seletor de apps, mas todo o conteúdo
ficava branco e nenhum erro chegava ao JavaScript.

- A correção anterior protegia apenas o Expo Go. A causa real era a própria
  `expo-router/unstable-native-tabs`, que pode falhar silenciosamente ao
  remontar seus componentes Fabric depois que o Android recria a Activity na
  volta do prompt biométrico.
- `app/(app)/_layout.tsx` deixou de importar ou montar `NativeTabs` em qualquer
  ambiente. Web, Expo Go, development build e APK de release agora usam a
  mesma navegação estável em JavaScript (`Tabs`).
- `lib/navegacao-nativa.ts` foi removido porque não existe mais caminho de
  navegação experimental a selecionar. `lib/tab-bar.ts` sempre reserva o
  espaço da barra flutuante no celular, inclusive em build real.
- `app.json` passou de `1.4.0` para `1.4.1` antes da nova build, preservando o
  mecanismo de aviso de atualização. O perfil EAS `preview` agora incrementa o
  `versionCode` automaticamente para o APK instalar sobre a build anterior.
  `.easignore` exclui ferramentas locais, logs do Expo e mockups de trabalho do
  pacote enviado ao EAS.
- Verificações locais: `npx tsc --noEmit`, `git diff --check` e
  `npm run test:parser` aprovados; a suíte reportou todas as checagens verdes.
- Build Android interna concluída com sucesso no EAS: versão `1.4.1`,
  `versionCode 2`, ID `b2605153-7cdf-4903-986f-80c14d14caf4`. APK disponível em
  https://expo.dev/accounts/gabriouss/projects/grana-app/builds/b2605153-7cdf-4903-986f-80c14d14caf4

## Sessão de 01/09/2026 - automação de release e update notes em produção

- A auditoria inicial encontrou `app_release` parada na `1.3.0` e apenas a
  assinatura antiga de `publicar_app_release`, sem `p_notes`.
- A função de quatro parâmetros foi aplicada em produção dentro de transação;
  a assinatura antiga foi removida e a execução continua restrita a
  `service_role`.
- A Edge Function `eas-build-webhook` atual foi implantada com verificação JWT
  desativada no gateway e autenticação própria por assinatura HMAC.
- O secret HMAC foi rotacionado e sincronizado entre EAS e Supabase. Antes da
  correção, as oito tentativas da build `1.4.1` retornaram HTTP 401.
- Um payload assinado e deliberadamente irrelevante retornou HTTP 200 com
  `ignored`, confirmando a integração sem publicar uma release fictícia.
- `app_release` foi atualizada para `1.4.1`, com o APK da build
  `b2605153-7cdf-4903-986f-80c14d14caf4`, expiração em 15/09/2026 e a nota
  `Corrige tela branca apos desbloqueio por digital`.

## Sessão de 02/09/2026 - correções da auditoria `/impeccable audit app`

Rodada de auditoria nas cinco dimensões (acessibilidade, performance,
aparência, conformidade de plataforma, adaptividade) sobre `app/(app)/*` e os
componentes compartilhados, seguida das correções. Nota saiu de 10/20 para
15/20. O relatório completo, com o estado achado a achado, está em
`IMPECCABLE_AUDIT.md`, na seção "Auditoria: 02 de setembro de 2026".

Corrigido:

- **Gráficos eram mudos para leitor de tela.** `PieChart` virou um único
  elemento com `accessibilityRole="image"` e a composição lida por extenso
  ("Gastos por categoria: Mercado 32%, ..."); as áreas de toque das colunas do
  `StackedBarChart`, que são a única forma de selecionar um período, ganharam
  papel, rótulo, dica e estado de seleção. Os dois `<Svg>` saíram da árvore de
  acessibilidade para não anunciar nós soltos de fatia e eixo. Os rótulos das
  colunas não incluem valor de propósito: quem anuncia dinheiro é a lista
  abaixo, que passa por `PrivacyValue` e respeita o modo privacidade.
- **`app/(app)/index.tsx` não tinha nenhum `useMemo`** — 1760 linhas, 44
  `useState`, e todos os derivados (`pieData`, `byCategory`, totais,
  comprometimento futuro, safe-to-spend) recalculados a cada tecla digitada,
  sobre o histórico inteiro. Passe completo de memoização; as contas subiram
  para antes do `if (loading)`, porque hook não pode vir depois de early
  return. `PieChart`, `FutureTimelineChart` e `LineAreaChart` viraram `memo`.
  `StackedBarChart` não, porque tem estado interno de seleção.
- **Tablet nativo nunca ganhava o trilho lateral.** `temBarraLateral` exigia
  `Platform.OS === 'web'` — trava que fazia sentido quando o `sidebarAdaptable`
  das Native Tabs entregava a sidebar do sistema no iPad (ligar as duas daria
  navegação lateral em dobro). Com as Native Tabs removidas na sessão
  anterior, não há concorrente e a trava virou o bug: num iPad a barra
  flutuante era a única navegação, esticada de ponta a ponta com cinco itens
  `flex: 1`. Agora vale `classe !== 'compacto' && (web || altura >= 600)`. O
  piso de altura mira tablet e não celular deitado — iPhone em paisagem tem
  ~844 de largura mas ~400 de altura; tablet tem 744+ nos dois eixos.
- **`fontVariant: ['tabular-nums']` faltando** nos campos de digitação de
  valor de Início, Contas, Lançamentos e Crédito, contra a regra do próprio
  projeto — e justamente onde a dança de dígitos mais aparece.
- Comentários que ainda descreviam o mundo pré-`00de222` foram corrigidos
  (`lib/tab-bar.ts`, `components/SideNav.tsx`, o doc de `Breakpoint`):
  `SideNav` não é mais "exclusivo da web larga".

Deixado aberto de propósito, com o motivo registrado no relatório:

- **Histórico sem paginação em Início, Gráficos e Desafios.** Janelar a busca
  não deixa a tela mais lenta, deixa o SALDO ERRADO — a conta depende do
  histórico completo. A correção certa é agregação no banco, que exige
  migração aplicada e validada contra o banco de verdade. A auditoria de 28/08
  já tentou e reverteu pelo mesmo motivo.
- **Navegação e ícones nativos** (nota 1/4 em conformidade de plataforma).
  Reimplementar Native Tabs exige validação em aparelho físico antes de ir pra
  loja — foi a falta disso que deixou a tela branca passar duas vezes.
- **Reflow em telas largas** nas seis telas que ainda são layout de celular
  esticado. É decisão de design por tela, não correção pontual — e agora com
  mais superfície, já que o trilho lateral passou a aparecer em tablet.

Verificações: `npx tsc --noEmit` limpo após cada etapa e `npm run test:parser`
completo aprovado (34.093 checagens do corpus mais OFX, dedup de CSV, limite
de cartão, paginação, recorrência, sequência, relatório, Score, guardas de
schema e `sync-parser` 26/26 em sincronia). Nenhuma build disparada nesta
sessão e `app.json` segue em `1.4.1` — as mudanças são todas de código do app,
sem migração de banco.

## Sessão de 02/09/2026 - guarda ortográfica das notas de versão

A 1.4.1 publicou "Corrige tela branca **apos** desbloqueio por digital" no
pop-up de novidades, sem acento, na cara de todo mundo que atualizou.

A causa não foi distração, era estrutural: os commits deste repositório são
escritos sem acento por convenção ("fix: estabiliza navegacao apos
biometria"); quando o `eas build` roda sem `--message`, o EAS preenche a
mensagem do build com a mensagem do commit; o `eas-build-webhook` copia essa
mensagem verbatim para `app_release.notes`; e o app renderiza `notes` sem
tocar em nada. O caminho padrão do pipeline publicava texto interno como copy
de produto — ia acontecer de novo.

- `lib/notas-release.ts` é a guarda. Ela **reprova**, não conserta: acento é
  ambíguo demais em português para adivinhar ("esta"/"está", "e"/"é",
  "pais"/"país") e um conserto errado é pior que o erro original.
- Duas camadas de detecção. Um dicionário de palavras que sem acento não
  existem, e regras por TERMINAÇÃO (`-ao`, `-oes`, `-encia`, `-avel`,
  `-ivel`, `-ario`, `-orio`...), que são o que dá garantia de verdade: lista
  envelhece, "nenhuma palavra termina em -cao sem til" continua valendo para
  palavras que ninguém previu. `-oria` e `-aria` ficaram de fora de propósito
  — "categoria", "padaria" e "faria" estão certas sem acento.
- Também reprova nota que começa com prefixo de commit (`fix:`, `feat:`...),
  que é o sinal de que o build rodou sem `--message`. Vale mesmo quando o
  texto está ortograficamente perfeito: continua sendo changelog técnico.
- Três pontos de uso: `npm run notas:check "<mensagem>"` antes do build;
  a Edge Function `eas-build-webhook` como rede de segurança; e
  `__tests__/corpus-notas-release.ts` dentro de `npm run test:parser`.
- Reprovada no webhook, a versão é publicada **mesmo assim, sem notas**. O
  aviso de atualização da regra 5 do AGENTS.md não pode depender de
  ortografia: perder o pop-up é arranhão, perder o aviso de versão faz a
  build inteira passar despercebida. A recusa vai pro log da função e pro
  corpo da resposta, que aparece na tela de webhooks do EAS.
- A cópia dentro da Edge Function (Deno não importa do app) entrou no
  `__tests__/sync-parser.js`, que passou a comparar dois pares de arquivos em
  vez de um. Verificado que ele reprova de verdade quando as cópias divergem.
- Regra 6 nova no `AGENTS.md`; a antiga regra 6 (ler o `context.md`) virou 7.
- Metade do corpus de teste é de FALSO POSITIVO ("categoria", "padaria",
  "faria", "moradia"). Um verificador de acento que acusa palavra certa trava
  build por frase correta, perde a confiança e alguém desliga — e aí volta a
  passar erro de verdade.

**Pendente, precisa de service_role:** o texto errado ainda está no banco.
Esta sessão só tem a chave anon. Rodar no SQL editor do Supabase:

```sql
update app_release
   set notes = 'Corrige tela branca após desbloqueio por digital',
       updated_at = now()
 where id = 1 and version = '1.4.1';
```

Quem já abriu o app e viu o pop-up não vai vê-lo de novo (o
`grana_novidades_versao_vista` local já está em 1.4.1); a correção vale para
quem ainda não atualizou ou não abriu.

Verificações: `npx tsc --noEmit` limpo e `npm run test:parser` completo
aprovado — 94/94 nas notas de release e 32/32 em sincronia. Nenhuma build
disparada; `app.json` segue em `1.4.1`.

## Sessão de 02/09/2026 - carrossel de ações e entrelinha da tela de Crédito

Dois pedidos do autor, a partir de prints do app em produção.

**Ações da Início voltaram a deslizar.** Os quatro botões ("Colar
comprovante", "Importar extrato", "Escanear nota", "Lançamento por voz")
estavam empilhados em duas fileiras. O `b34be61` (passe de auditoria) trocou
o `ScrollView horizontal` por `flexWrap: 'wrap'` e não atualizou o comentário
logo acima, que continuava descrevendo a rolagem — código e comentário
estavam se contradizendo desde então. Revertido para o `ScrollView
horizontal` original; o `minHeight: touchTarget` que veio no mesmo commit
ficou, porque é alvo de toque e não layout.

**Entrelinha da tela de Crédito.** A tela tinha 31 estilos de texto com
`fontSize` e apenas 1 com `lineHeight`. O `lib/theme.ts` já documenta por que
isso embola: a Neue Machina tem leading intrínseco curto, então `<Text>` sem
`lineHeight` explícito sai com as linhas quase encostadas — e existe o helper
`lh(tamanho, papel)` justamente pra isso, usado até então só em duas telas de
auth.

- 22 estilos passaram a usar `lh()`, pelo papel do texto: `corpo` (1.45) no
  que quebra em duas linhas de verdade, `apoio` (1.4) em rótulo e metadado,
  `valor` (1.15) em dinheiro, `titulo` (1.25) no título de folha.
- Ficaram de fora de propósito: rótulos de botão (mudar a caixa de texto muda
  a geometria do botão) e campos de digitação (`lineHeight` em `TextInput` no
  Android corta o texto verticalmente).
- `invoiceInfo` ganhou `gap: 2`. Era o único bloco empilhado da tela sem folga
  nenhuma: "Total em Faturas (Todos os Cartões)" quebra em duas linhas e a
  segunda encostava no "R$ 0,00" logo abaixo. Os vizinhos já tinham folga
  (`cardIdentidade` 2, `cardMidRow` 2, `cardBottomRow` 4, `txInfo` 2).

Verificações: `npx tsc --noEmit`, `git diff --check` e `npm run test:parser`
completo aprovados. Sem validação visual em aparelho ou navegador nesta
sessão — não há login disponível aqui, então as duas mudanças são de leitura
de estilo, não de observação da tela renderizada.

## Sessão de 02/09/2026 - segunda auditoria e correções

`/impeccable audit` rodado de novo, com mais rigor que a rodada anterior do
mesmo dia. Nota medida: 12/20; depois das correções: 16/20. Relatório completo
em `IMPECCABLE_AUDIT.md`, seção "Auditoria: 02/09/2026 (segunda rodada)".

**A nota caiu de 15 para 12 sem haver regressão** — a rodada anterior tinha
dado alto demais em duas dimensões: eu memoizei só a Início e dei Performance
3/4 sem abrir as outras cinco telas, e dei Aparência 4/4 sem nunca medir
cobertura de entrelinha fora do Crédito.

Corrigido:

- **Only-Font Rule violada em produção.** `index.tsx:1670` tinha
  `fontFamily: 'monospace'` nos badges "exemplo"/"oculto" do cabeçalho da
  Início — única violação no repositório inteiro. Trocado por `fonts.regular`.
- **Entrelinha em 85 estilos, nas 6 telas restantes.** O `lh()` existia e vivia
  em duas telas de auth; a correção do Crédito tinha ficado só na tela apontada
  pelo autor. Rótulo de botão e campo de digitação ficaram de fora de propósito.
  Validado por script: 114 blocos, cada `lineHeight` casando com o `fontSize`
  do próprio bloco.
- **Memoização em `credito`, `lancamentos`, `contas` e `desafios`**, que tinham
  zero. O pior era `lancamentos`: quatro passadas sobre a lista a cada tecla
  digitada na busca, sendo que só a última depende do texto. `perfil` segue em
  zero e está certo — não tem valor derivado sobre lista.
- **Badges do Desafios** saíram de `width: '48%'` fixo (duas colunas em
  qualquer largura, ~690px cada num monitor) pra largura por classe de janela.
- **DESIGN.md reconciliado**: Native Tabs (removidas), `theme.danger` (existia
  no código e não no documento) e o vocabulário de sombra (10 receitas no
  código contra 5 catalogadas — as 4 novas foram catalogadas, não consolidadas).

Dois erros meus, pegos e corrigidos dentro da própria sessão, que valem registro:

1. O primeiro script de entrelinha iterava sobre posições calculadas no texto
   original enquanto mutava a string — todas as inserções depois da primeira
   caíam deslocadas. `tsc` passou mesmo assim. Revertido e refeito inserindo de
   trás pra frente, com validador conferindo bloco a bloco.
2. Em `desafios.tsx` coloquei `useBreakpoint` e `useMemo` DEPOIS do
   `if (loading || !state) return`, o que quebraria em runtime com "rendered
   more hooks than during the previous render". `tsc` não pega isso. Escrevi um
   verificador de ordem de hook que roda nas 8 telas e agora acusa zero.

Achados deixados abertos, com motivo: busca sem paginação (janelar deixa o
saldo errado, exige agregação no banco), navegação/ícones nativos (exige
aparelho físico), `perfil.tsx` fora do `screenRhythm` e 9 componentes órfãos.

Um achado da primeira redação era **falso positivo**: "6 de 7 telas não
refluem". A Início reflui via `WidgetGrid`, e `contas`/`credito`/`lancamentos`
são telas de lista e `perfil` é tela de ajustes — coluna única com teto de
largura é o padrão certo dessas superfícies, não defeito.

Verificações: `tsc --noEmit`, `test:parser` completo, bundle web compilando no
Metro (HTTP 200) e verificador de ordem de hook nas 8 telas. Sem validação
visual — não há login nesta sessão. Nenhuma build disparada; `app.json` em
1.4.1.

## Sessão de 02/09/2026 - terceira auditoria: a correção que se perdeu

Reauditoria logo após as correções da segunda rodada. Achado principal: **uma
correção que eu declarei feita não estava feita.**

A segunda rodada trocou `fontFamily: 'monospace'` por `fonts.regular` no estilo
`demoFlag` de `app/(app)/index.tsx` (badges "exemplo"/"oculto" do cabeçalho da
Início, única violação da Only-Font Rule no repositório). Logo depois, um
`git checkout --` no mesmo arquivo — feito para desfazer um script de entrelinha
bugado — levou a correção junto. O passe de entrelinha foi refeito por cima; a
troca da fonte, não. O relatório e a mensagem de commit saíram afirmando que
estava resolvido, e foi para a `main` assim.

`tsc` não pega. O corpus não pegava. Só releitura pegou — e depender de
releitura é o mesmo que não ter garantia.

Correção estrutural: `__tests__/corpus-design-system.ts`, dentro do
`test:parser`, verifica por máquina as Named Rules absolutas do `DESIGN.md`:

- nenhum `fontFamily` com literal de string em `app/` ou `components/`;
- nenhum `fontWeight` (só existem Light e Regular como arquivo);
- nenhuma fonte de sistema citada em linha de `fontFamily`;
- `lib/theme.ts` declara as duas famílias que existem, e os `.otf` existem.

294 guardas. Comentários ficam de fora de propósito — os arquivos que explicam
as regras citam as grafias proibidas. Verificado que REPROVA: reintroduzindo o
`monospace`, duas regras disparam com arquivo e linha e o processo sai com
código 1, quebrando o `test:parser`.

Nota segue 16/20. A segunda rodada já tinha anunciado esse número, mas ele
estava certo por sorte: uma das correções que o compunham não existia.

Achados novos (os dois P3, não corrigidos): avatares usam o `<Image>` do React
Native com uri remoto, sem `expo-image`, sem cache em disco no Android e
decodificados em tamanho cheio para exibir a 44px; e o ajuste fino das listas é
parcial — todas as 10 `FlatList` têm `keyExtractor`, mas só 5 pontos usam
`getItemLayout`/`windowSize`/`initialNumToRender`, sendo que Lançamentos e
Crédito têm altura de linha fixa e ganhariam com `getItemLayout`.

Positivos confirmados: arranque correto para o SDK 57 (`preventAutoHideAsync`
em escopo global sem await), escala de fonte do sistema intacta (zero
`allowFontScaling`, ou seja, padrão ligado), e as correções da segunda rodada
se sustentaram.

## Sessão de 02/09/2026 - plano de interruptores remotos (NADA implementado)

O autor pediu um jeito de desligar funcionalidade do app sem obrigar as pessoas
a atualizar — caso concreto: o WhatsApp do Grana. caiu e não há como esconder o
botão nem o vínculo de número. Pediu também aviso dentro do app e notificação
push (Android/iOS).

**Nenhuma linha de código foi alterada nesta sessão.** O pedido explícito foi
montar o plano para executar na outra máquina. O plano está em
`PENDENCIAS.md`, na raiz (o plano nasceu como
`PLANO-INTERRUPTORES-REMOTOS.md` e foi absorvido por ele), pronto para ser
seguido: SQL
completo, o provider React inteiro, os quatro pontos de entrada do WhatsApp com
arquivo e linha, o componente de aviso, a parte de push (tabela, registro,
Edge Function remetente, credenciais FCM/APNs), o SQL de operação do dia do
incidente, os testes a escrever e um checklist na ordem.

A ressalva que decide o cronograma, e que está no topo do plano: **isto não
resolve o apagão atual.** O app instalado (1.4.1) não tem código que procure
por flags, então o interruptor só existe a partir de uma build nova — dela em
diante todo apagão futuro se resolve por UPDATE no banco. Quem ficar na 1.4.1
continua vendo o botão do WhatsApp para sempre.

Duas decisões de arquitetura registradas no plano, com o motivo:

- **Flags genéricos por nome**, não um booleano de WhatsApp: mesmo trabalho
  agora, e o próximo incidente em qualquer funcionalidade não exige build.
- **Falha ABERTA**: se a leitura da tabela falhar, tudo continua ligado. É o
  oposto do `EntitlementProvider`, que falha fechado de propósito porque o RLS
  aplica a mesma regra no servidor; aqui não existe segunda barreira e o custo
  de errar para cada lado é invertido. Uma queda do Supabase não pode virar app
  inteiro morto.

Levantamento que fundamenta o plano: `expo-notifications` já está instalado e
configurado como plugin, mas só é usado para notificação LOCAL (lembrete de
boleto, fatura, limite de cartão em `lib/notifications.ts`) — não há registro
de push token, tabela de token nem remetente, então push é trabalho novo de
verdade. O `EntitlementProvider` serve de template para o provider de flags, e
o `NovidadesModal` para o pop-up de aviso.

## Sessão de 02/09/2026 - PENDENCIAS.md, documento único de handoff

A pedido do autor, tudo o que está em aberto foi consolidado num arquivo só:
`PENDENCIAS.md`, na raiz. O `PLANO-INTERRUPTORES-REMOTOS.md` foi absorvido
por ele (virou o Bloco 3) e APAGADO — dois documentos sobre o mesmo assunto
viram duas fontes de verdade que divergem, problema que este repositório já
teve.

Estrutura, em ordem de execução:

- **Bloco 1 (2 min)** — o SQL do acento, que ainda está errado no banco de
  produção e exige `service_role`; e o passo novo do `notas:check` antes de
  todo build.
- **Bloco 2 (10 min)** — validação visual das mudanças desta sessão, que é o
  maior risco em aberto: 85 estilos de entrelinha, memoização em 4 telas,
  reflow das badges e o carrossel de ações, tudo alterado sem ninguém ver
  rodando. Traz o que olhar tela a tela e o que é sinal de que passou do ponto.
- **Bloco 3 (~1 dia)** — os interruptores remotos, plano completo.
- **Bloco 4** — as dívidas que exigem banco ou aparelho físico: paginação
  (janelar deixa o saldo ERRADO, não lento), Native Tabs, e o
  `expo install --check` que o proxy bloqueou aqui.
- **Bloco 5 (~2 h)** — P3: `perfil.tsx` fora do `screenRhythm`, 9 componentes
  órfãos com 614 linhas, avatares sem `expo-image`, `getItemLayout`.

Duas seções finais que existem para evitar retrabalho: o que **não** está
pendente (as correções já na `main`, com o aviso explícito de que `perfil.tsx`
com zero `useMemo` está CERTO e não deve ser "corrigido"), e as regras
permanentes do `AGENTS.md` resumidas.

Nenhuma linha de código do app foi alterada nesta sessão desde a terceira
auditoria — só documentação.

## Sessão de 02/09/2026 - interruptores remotos IMPLEMENTADOS (cliente)

O Bloco 3 do `PENDENCIAS.md` foi executado. Todo o lado do cliente está
pronto; **falta aplicar o SQL no Supabase**, que esta máquina não alcança.

- `lib/versao.ts` — `compararVersoes` saiu de `lib/atualizacao.ts` para um
  módulo SEM nenhum import. Motivo: `atualizacao.ts` puxa expo-constants,
  AsyncStorage e o cliente Supabase, e os corpus rodam em node puro.
- `lib/feature-flags-regras.ts` — tipos, as 13 chaves e `efetivamenteLigado`,
  sem React nem React Native, para o corpus poder testar a decisão.
- `lib/feature-flags.tsx` — o provider: lê na entrada e a cada volta do
  background (`AppState`), montado em `app/_layout.tsx` dentro do
  `SessionProvider` (a leitura passa por RLS).
- `components/AvisoFlagModal.tsx` — pop-up de instabilidade, modelado no
  `NovidadesModal`. `info` não abre pop-up, `aviso` abre uma vez, `critico`
  abre sempre. Um aviso por vez, com `critico` na frente.
- `supabase/schema.sql` — tabela `feature_flags` com RLS, as duas constraints
  (severidade válida; desligado exige mensagem) e as 13 chaves semeadas.
- `__tests__/corpus-flags.ts` — 17 checagens, dentro do `test:parser`.

As 13 ferramentas ligadas ao interruptor, com o padrão escolhido por contexto:

| ferramenta | comportamento quando desligada |
|---|---|
| whatsapp | ícone da Início SOME; linha do Perfil fica visível e desabilitada; pareamento some no Perfil e no onboarding; **desvincular continua funcionando** |
| importar_extrato, colar_comprovante, qr_nota, lancamento_voz | somem da fileira de ações (ela desliza, então some sem buraco) |
| relatorio_pdf, cofrinhos | componente retorna null |
| desafios | a TELA vira aviso; a aba continua na barra, porque sumir com ela moveria o resto da navegação debaixo do dedo |
| assinatura_checkout | botão desabilitado com rótulo trocado, nunca escondido — some numa tela de assinatura deixaria a pessoa sem saber o que fazer |
| foto_perfil | guarda no ponto de AÇÃO (`escolherFoto`), não só no botão; remover foto continua liberado |
| lembretes, orcamento_sugerido, diagnostico | linha desabilitada ou escondida no Perfil |

Regra que valeu para todos: **o interruptor esconde a ENTRADA, nunca apaga
dado**, e ação de saída (desvincular, remover foto) nunca é bloqueada.

Achado registrado e NÃO corrigido: `components/ToggleSwitch.tsx` tem violação
das Rules of Hooks pré-existente — `if (Platform.OS !== 'web') return` na linha
21, com `useReducedMotion` e `useEffect` depois. Não quebra em runtime porque
`Platform.OS` é invariante entre renders, então o ramo é sempre o mesmo. Foi
achado pelo verificador de ordem de hook desta sessão; corrigir é mexer em
código fora do escopo desta tarefa.

Verificações: `tsc --noEmit`, `test:parser` completo (17/17 nos interruptores),
verificador de ordem de hook em 0 violações, bundle web compilando (HTTP 200) e
app renderizando no Chromium com o FlagsProvider na árvore, zero erro de
runtime. Sem validação visual das telas logadas: não há login nesta máquina.

**Pendente e só possível aí:** aplicar o SQL de `feature_flags` (está pronto no
fim do `supabase/schema.sql`, é copiar e colar no SQL Editor). Enquanto a
tabela não existir, a leitura falha e cai na FALHA ABERTA — tudo continua
ligado, nada quebra. Push (Parte 5 do plano) não foi implementado.

## Sessão de 02/09/2026 - reconciliação: duas sessões implementaram o Bloco 3 em paralelo

Esta máquina, com acesso real ao Supabase, já tinha aplicado o SQL da Parte 1
(tabela `feature_flags` em produção, verificada linha a linha) num commit
separado, sem saber que a sessão descrita no bloco acima (rodando sem acesso
ao Supabase) tinha, ao mesmo tempo, terminado e publicado o lado inteiro do
cliente em `origin/main` (commit `8c06a7e`). As duas se desconheciam.

Paralelamente, um agente Codex também chegou a começar uma **terceira**
implementação do mesmo Bloco 3, com nomes de arquivo diferentes
(`lib/feature-flags-core.ts`, `lib/versoes.ts`) mas resolvendo o mesmo
problema — descoberta a tempo, antes de virar commit.

**Resolução, nesta ordem:**

1. O trabalho do Codex (não commitado) foi guardado com `git stash push -u`
   em vez de descartado — recuperável via `git stash list` /
   `git stash show -p stash@{0}` se algum pedaço dele for útil depois, mas
   **não foi usado**: a implementação de `origin/main` já cobre o mesmo
   escopo e está testada.
2. `git pull` trouxe `8c06a7e` (fast-forward, sem conflito porque a árvore
   estava limpa depois do stash).
3. Verificado de verdade, não só aceito porque o commit dizia que sim:
   `npx tsc --noEmit` limpo, `npm run test:parser` 100% (17/17 em
   `corpus-flags.ts`, 11/11 nas guardas de schema — que agora exigem RLS e
   política de select em `feature_flags`, batendo com o que já estava em
   produção), e checagem manual de que as 13 chaves aparecem em
   `ligado('<chave>')` nos arquivos certos (`grep -rn "ligado('"`).
4. `app.json` subiu de `1.4.1` para `1.4.2` (regra 5 do `AGENTS.md`) e
   `npm run notas:check` aprovou a mensagem candidata para o próximo build.
   **Nenhum build foi disparado** — regra 4 do `AGENTS.md` exige pedido
   explícito nesta sessão para consumir cota do EAS, e não houve esse pedido.
5. `PENDENCIAS.md` atualizado: checklist do Bloco 3 marcado 1-8 e 11 como
   concluídos e verificados; 9 (build + teste no aparelho) e 10 (push)
   seguem em aberto.

**Lição para as próximas sessões, registrada no `AGENTS.md` em espírito:**
quando duas máquinas trabalham no mesmo `PENDENCIAS.md` ao mesmo tempo sem
`git fetch` frequente, o resultado são implementações redundantes do mesmo
plano. Isto só não virou conflito de merge feio porque nada da versão
divergente chegou a ser commitado.

**Ainda pendente:** item 9 (build de teste, precisa ser pedido explicitamente)
e item 10 (push, Parte 5, independente e não bloqueia).

## Sessão de 02/09/2026 - seletor de categoria sem resposta a toque (achado e corrigido)

Bug relatado pelo autor com print do navegador mobile em produção: em
Lançamentos → "Nova saída/entrada" → Categoria, a lista abria mas nenhuma
linha respondia a toque.

**Investigação (reproduzida localmente, `agent-browser`):** clique simulado
não disparava `onPress`, mas `elemento.click()` via JS funcionava — sinal de
algo bloqueando entrada real sem afetar `.click()` programático. A hipótese
inicial (botões de editar/excluir aninhados dentro do botão da linha —
`<button>` dentro de `<button>`, inválido em HTML) foi eliminada por
experimento: substituí por `Pressable` puro do RN, sem `AppPressable`, sem
`hitSlop`, sem `scaleOnPress`, e o bug persistia idêntico.

**Causa real**, achada capturando `pointerdown`/`mousedown`/`click` reais
(não `elementFromPoint`, que se mostrou não confiável neste ambiente — retornava
`BODY` em qualquer coordenada da página, inclusive fora de qualquer modal): o
próprio wrapper do modal de Categoria — filho direto do `body` — estava
`inert=true`. `lib/modal-accessibility.ts` marca `inert` em todo irmão de todo
nível até o `body` pra isolar um modal aberto (`Sheet.tsx`, `FabButton.tsx` e
`AccessibleModalPanel` chamam o mesmo hook); com dois modais abertos ao mesmo
tempo — o formulário de lançamento e o seletor de categoria por cima dele — o
portal do segundo virava "irmão" do primeiro na varredura e acabava marcado
inert por engano. `inert` bloqueia toque e foco reais, mas não afeta
`.click()` nem `elementFromPoint` — daí o sintoma exato.

**Correção em `lib/modal-accessibility.ts`:** um registro (`paineisAtivos`,
`Set` a nível de módulo) de todo painel de modal atualmente aberto, consultado
antes de isolar qualquer elemento — nenhuma instância do hook pode marcar
`inert` um painel que esteja neste registro. Registrado de forma SÍNCRONA (na
fase de commit do efeito, não dentro do `setTimeout` que faz a varredura),
porque a primeira versão do fix registrava dentro do próprio `setTimeout` e
ainda falhava: outra instância podia varrer primeiro. Uma segunda camada,
depois da varredura, limpa `inert`/`aria-hidden` de todo o caminho do PRÓPRIO
painel até o body — rede de segurança pro caso de um `inert` já ter sido
gravado por uma isolação anterior (o cenário que o comentário original do
arquivo já descrevia pro FAB, só que numa variante nova).

**Achado colateral, corrigido também:** os botões de editar/excluir categoria
eram mesmo filhos do botão de selecionar a linha (`<button>` dentro de
`<button>`) — bug real e separado, não a causa do clique quebrado (testado
isolado), mas gerava erro no console e zerava a árvore de acessibilidade da
lista inteira. Corrigido em `CategoryPickerModal.tsx`: os botões de ação
viraram irmãos do botão de seleção, não mais filhos (contêiner `View` comum
por linha, com o botão de seleção como `flex:1` e as ações ao lado).

**Efeito colateral descoberto durante a investigação:** esse mesmo erro de
console — com o toast do overlay de erro do React visível — estava capturado
DENTRO de dois prints usados como material de marketing na landing, ao vivo em
produção: `public/telas/inicio-mobile.png` e `desafios-mobile.png` (seção "Do
primeiro lançamento ao hábito"). Ambos recapturados com o bug já corrigido,
usando "Dados de exemplo" no Perfil (nunca conta de verdade, por política já
registrada acima), na mesma resolução 390×844. A tag "exemplo" que aparece no
cabeçalho da Início em modo de exemplo foi escondida só visualmente (CSS
inline via `eval`, não no código) na hora de capturar — não deve aparecer em
material de marketing.

Commit `bc0eb62`, já publicado em `origin/main`. Verificado: `tsc --noEmit`
limpo, `test:parser` completo, e a troca de categoria funcionando de verdade
em 3 tentativas consecutivas depois da correção (antes, falhava 100% das
vezes). O deploy da Vercel precisa rodar pra `granaponto.com.br` refletir
isto — não confirmado nesta sessão se já rodou.

## Auditoria de segurança (02/09/2026)

Auditoria estática do código e do `supabase/schema.sql` concluída, sem build,
deploy, migração ou escrita em produção. Foram documentados cinco achados
(2 altos, 2 médios, 1 baixo), com evidências e remediações em
`docs/security-audit/dados-auditoria.json` e no PDF
`docs/security-audit/relatorio-auditoria-seguranca.pdf`. Não foi confirmada
brecha de tenant/IDOR nem XSS na revisão estática; a limitação principal é a
ausência do código da Edge Function `delete-account` e de testes autenticados
contra produção.

### Verificação independente dos 5 achados (mesmo dia, outra máquina)

Cada achado do PDF foi conferido linha a linha contra o código atual (não só
aceito de olho no relatório). Os cinco se confirmaram exatamente como
descritos — nenhum falso positivo. Ordem de prioridade recomendada, revisada:

1. **GRN-SEC-002 (Kiwify, ALTA) — confirmado em
   `supabase/functions/kiwify-webhook/index.ts:20-32`.** `tokenValido()`
   aceita o segredo por header `x-kiwify-token`, por três campos do body
   (`webhook_token`/`token`/`secret`) OU pela query string `?token=`. Query
   string vaza em log de proxy/CDN e histórico de navegador. É o mais barato
   de corrigir (remover os campos redundantes, manter só o header oficial) e
   o mais barato de explorar se vazar. **Prioridade 1.**

2. **GRN-SEC-004 (vínculo automático de assinatura, MÉDIA "condicional" no
   relatório, mas pode ser ALTA na prática) — confirmado em
   `supabase/schema.sql:2351-2374`.** `vincular_assinatura_automatica()` casa
   e-mail sem checar `email_confirmed_at`. Confirmado também que o app já
   sabe distinguir quando o Supabase exige confirmação
   (`needsEmailConfirmation` em `lib/auth-context.tsx:171`), ou seja, o app
   está preparado pro cenário perigoso: se "Confirm email" estiver **OFF** no
   painel do Supabase (Authentication → Settings), qualquer um cria conta com
   o e-mail de um comprador de verdade e herda a assinatura paga dele. **Isto
   só dá pra confirmar olhando o painel do Supabase — nenhuma sessão até
   agora teve esse acesso.** Checar isso é a ação de 5 minutos que mais muda
   o quadro de risco real. **Prioridade 2, mas checar a config PRIMEIRO.**

3. **GRN-SEC-001 (exclusão de conta, ALTA) — confirmado o lado do cliente em
   `lib/data.ts:805-809`.** `deleteUserAccount()` chama a Edge Function
   `delete-account` com `body: {}` — nenhuma prova de reautenticação é
   enviada ao servidor; a senha só é conferida no cliente
   (`reauthenticate()`), e essa checagem nunca atravessa a rede. A função em
   si não existe neste repositório (só 3 Edge Functions:
   `eas-build-webhook`, `kiwify-webhook`, `whatsapp-webhook` —
   confirmado por `ls supabase/functions/`), então não dá pra saber se quem a
   implantou compensou isso do lado do servidor. **Prioridade 3** — exige
   achar a função na infra ou escrevê-la do zero com step-up de verdade.

4. **GRN-SEC-003 (token de ativação em storage, MÉDIA) — confirmado em
   `lib/assinatura.ts:37-61`.** O token só é removido do
   `AsyncStorage`/`localStorage` em caso de SUCESSO (linha 58); se inválido,
   expirado ou a rede falhar, fica gravado indefinidamente — decisão
   deliberada pra permitir retry, com o efeito colateral que o relatório
   aponta.

5. **GRN-SEC-005 (conquistas fabricáveis, BAIXA) — confirmado em
   `supabase/schema.sql:3247-3250`.** Política `for all` em
   `user_achievements` sem checar `badge_id` nem `unlocked_at`. Baixo risco
   real (não é dado financeiro), mas gamificação é fabricável pelo cliente.

**Nenhuma correção foi implementada ainda** — só verificação. Autor ainda não
apontou por qual começar.

## Revisão visual da landing (02/09/2026, somente local)

Aplicadas as nove correções solicitadas na landing: o CTA do Granabô passou a
ter 32 px de respiro após o texto; as numerações 01–04 foram removidas; os
mini-mocks de lançamento por voz, análise mensal, personalização e cofrinho
foram redesenhados com informação reconhecível e anatomia próxima do app; a
seção de segurança virou três provas curtas; o preço de R$ 9,90 ganhou destaque
e perdeu a menção interna à Kiwify; e o card de Livre para Gastar saiu do FAQ.

Os cards puramente informativos também deixaram de usar `AppPressable`, para
não aparecerem como controles sem ação. Verificação local em 1440×900,
768×1024 e 390×844: sem sobreposição ou texto escapando. `tsc --noEmit` limpo,
297/297 guardas do design system passaram, auditoria axe/WCAG com zero
violações e console do navegador sem erros. Nada foi publicado ou enviado à
web nesta revisão; o servidor de aprovação local usa `http://127.0.0.1:8082`.

## Sessão de 02/09/2026 - auditoria de motion e composição visual da landing

Pedido do autor: usar as skills `impeccable` e `web-animation-design` (via
`SuggestSkills`/`SearchSkills`, que não trouxeram nada novo além dessas duas
já habilitadas) pra levantar oportunidades de motion e composição visual na
landing. **Só auditoria, nenhuma linha de código mudou nesta sessão.**

**Achado central: um único gesto de motion, repetido 25+ vezes.**
`RevealOnScroll` (fade + `translateY: 16→0`, `cubic-bezier(0.16,1,0.3,1)`,
600ms) é chamado 25 vezes em `app/index.tsx` — Preços, Segurança, FAQ,
Hábitos, Benefícios, guia numerado, todos com o mesmo gesto, mesma direção,
mesmo tempo. É o antipadrão que o `impeccable` nomeia em `reference/animate.md`:
*"A generic fade-and-rise, hover lift, parallax layer, or scroll reveal is
not a thesis."* A sensação de "falta de motion de qualidade" relatada pelo
autor provavelmente vem daqui — não é falta de quantidade, é falta de
variedade com propósito; a repetição faz a mente parar de notar.

**O que já funciona (preservar):**
- Hero com stagger de letras (`Animated.stagger`, `app/index.tsx:553-556`) —
  único momento realmente autoral da página.
- `NotebookAnimado` — composição de camadas PNG, ideia de material específica
  do produto.
- `TrustMarquee` — loop CSS puro (`@keyframes` + `animationIterationCount:
  infinite`), contornando corretamente o bug do `Animated.loop` no RN Web
  (já documentado nas Convenções de código acima).

**Vocabulário de interação quase inexistente.** Hover só existe em 3
elementos da página inteira: CTA primário, link "Entrar" do cabeçalho, ícone
do Instagram no rodapé (`app/index.tsx:1517-1523,1609`) — e nos três casos é
só troca de `borderColor`/`backgroundColor`. Cards de dor, cards de benefício
e os passos do guia numerado não respondem a hover nenhum.

**Findings priorizados:**

1. **[P1] Reveal genérico sem hierarquia de distância/consequência** — as 25
   chamadas de `RevealOnScroll`. A tabela de timing do `web-animation-design`
   associa duração a distância/importância (300-500ms layout/overlay,
   500-800ms só pro momento autoral); usar 600ms uniforme nivela seções que
   deveriam ter peso diferente. Direção: reservar motion mais lento/expressivo
   pra 1-2 seções que carregam a proposta de valor (Segurança, virada pra
   Preços) e acelerar/suavizar o resto (translateY menor, ~200-300ms).
   Comando sugerido: `/impeccable animate`.
2. **[P1] Composições de card sem resposta a hover/proximidade** — cards de
   dor, benefícios, guia numerado. Direção: elevação sutil (`translateY:
   -2/-4px` + sombra, só transform+opacity) em ~150ms `ease`. Comando
   sugerido: `/impeccable delight` ou `/impeccable animate`.
3. **[P2] Nenhum material além de opacity/translateY na página inteira** —
   `animate.md` lista blur/mask/clip-path/movimento espacial como paleta pra
   "foco e profundidade" ou "reveal e composição"; a Segurança
   (`MolduraCelular`/`MolduraNavegador` sobrepostos) é a candidata óbvia pra
   um reveal por máscara/clip em vez de fade genérico, já que a composição em
   si é o argumento visual da seção.
4. **[P3] `.impeccable/design.json` desatualizado** — `context.mjs` do
   `impeccable` sinalizou que o sidecar de tokens (inclusive motion tokens)
   foi gerado antes da última edição do `DESIGN.md`. Rodar
   `/impeccable document` antes de qualquer trabalho de motion, pra não
   trabalhar com tokens defasados.

**Ordem recomendada pro autor, quando decidir avançar:** `/impeccable animate`
na seção Segurança → `/impeccable animate`/`delight` nos cards → variar o
timing do `RevealOnScroll` por peso de seção → `/impeccable polish` como
passe final.

## Sessão de 03/09/2026 - lançamento por voz com intenção de crédito

Pedido do autor: "dei um comando de voz pra lançar no crédito e caiu no
Pix/dinheiro". Três itens levantados na mesma sessão (ver
`docs/superpowers/specs/2026-09-03-ciclo-fatura-cartao-design.md` pro
primeiro, ainda sem plano de implementação; editar cartão e trocar o motor de
voz do app pro mesmo Whisper do WhatsApp ficaram só desenhados, sem
implementação ainda) — só este terceiro foi implementado nesta sessão, a
pedido explícito do autor.

**Causa raiz confirmada em código**: `PasteReceiptModal.tsx` (o modal que
recebe tanto "colar comprovante" quanto a transcrição de voz no app) nunca
extraiu `payment_method`/`card_id` do texto — só tipo/descrição/valor/
categoria. O comentário em `lib/heuristics.ts:441-447` já registrava isso:
"no crédito da C6" funciona no bot do WhatsApp porque uma etapa lá casa o
cartão citado; "nunca no lançamento por voz DENTRO do app, que não passa por
lá". Ou seja, dizer "no crédito" em voz nunca setava forma de pagamento
nenhuma — o lançamento nascia sem `payment_method`, que a tela mostra como
Pix/dinheiro.

**Escopo pedido pelo autor foi mais estreito** que a primeira proposta
(chip de forma de pagamento na tela de confirmação): só quer que o áudio com
intenção de crédito abra direto a caixa de lançamento do cartão, sem
seletor novo em nenhuma tela.

- `ehIntencaoCredito`/`matchCardByText`/`parseParcelas` portados de
  `supabase/functions/whatsapp-webhook/index.ts` pra `lib/heuristics.ts`
  (exportados), vigiados por `__tests__/sync-parser.js` (agora 35 pares em
  sincronia, incluindo os três novos).
- Botão de voz na Início e em Lançamentos: quando `ehIntencaoCredito(texto)`
  é verdadeiro, navega pra `/(app)/credito?novaCompra=1&texto=<transcrição>`
  em vez de abrir o modal de colar comprovante.
- `credito.tsx` ganhou `abrirNovaCompraDoTexto(texto)` — roda a mesma
  extração de valor/descrição/categoria do modal, casa o cartão citado por
  nome/banco (`matchCardByText`, reserva pro primeiro cartão da carteira,
  mesmo critério do bot), e abre a caixa de compra no cartão já preenchida
  pra revisão antes de salvar.
- Quando a fala NÃO tem intenção de crédito, nada muda — continua abrindo o
  modal de sempre.

Verificações: `npx tsc --noEmit` limpo (precisou de `npm install`, o
ambiente não tinha `node_modules`) e `npm run test:parser` completo aprovado
(34.093 checagens do corpus, mais os 35 pares de `sync-parser.js`, incluindo
os três novos). Sem validação visual em aparelho/navegador nesta sessão —
mudança de lógica de roteamento e extração de texto, não de estilo.

**Mesma sessão, extensão pro boleto.** Autor perguntou se o mesmo atalho
existia pra Contas — não existia. `ehIntencaoBoleto`/`parseDiaVencimento`
portados do bot do WhatsApp pro `lib/heuristics.ts` do mesmo jeito (agora 37
pares em `sync-parser.js`). `contas.tsx` ganhou `abrirNovaContaDoTexto`,
espelhando `abrirNovaCompraDoTexto`, e o botão de voz em Início/Lançamentos
passou a checar boleto ANTES de crédito (mesma ordem do
`registrarLancamento` do bot — "boleto" é sinal mais específico que
"crédito" quando os dois aparecem juntos, tipo "boleto no cartão").
`npx tsc --noEmit` e `npm run test:parser` (37/37 em sincronia) aprovados de
novo depois desta extensão.

## Sessão de 03/09/2026 - CSV também pode ser marcado como fatura de cartão

Autor perguntou como o Grana. separa lançamentos de crédito/débito em
importação de CSV/OFX. Resposta: o OFX já resolvia isso sozinho (o arquivo
declara `<CREDITCARDMSGSRSV1>`/`<CCSTMTRS>` quando é fatura de cartão,
`lib/ofx-parser.ts`), com seletor de cartão na tela de importação. O CSV não
carrega esse metadado — é só data/descrição/valor — então sempre entrava como
conta corrente, mesmo quando era, de fato, export de fatura.

- `ImportarExtratoModal.tsx` ganhou `veioDeCsv` (estado só de UI, não muda o
  parser): quando o arquivo interpretado é CSV, aparece um `ToggleSwitch`
  ("Este CSV é fatura de cartão de crédito") antes do bloco de escolha de
  cartão. Ligado, reaproveita o mesmo bloco/seletor que o OFX já tinha —
  `ehCartao` (derivado de `origem`) já controlava tanto a UI quanto o
  `payment_method: 'credit'`/`card_id` no `confirmar()`, então bastou tornar
  `origem` editável pra CSV em vez de fixa em `'conta'`.
- No OFX a origem continua vindo só do arquivo, sem toggle — é fato
  declarado pelo banco, não pergunta.

Verificações: `npx tsc --noEmit` e `npm run test:parser` (37/37 em
sincronia) aprovados. Sem validação visual em aparelho/navegador nesta
sessão.

## Revisão e merge do branch `claude/grana-landing-page-design-df5etm` (03/09/2026)

Todo o trabalho das três sessões acima (crédito/boleto por voz, CSV como
fatura) vivia num branch remoto separado, nunca mesclado ao `main` — as
seções acima foram trazidas por este merge, não escritas nesta sessão.
Revisão feita numa worktree isolada (`git worktree add` apontando pro branch
remoto, `npm install` próprio, sem mexer no checkout principal): `tsc
--noEmit` limpo e `test:parser` 100% (37/37 em sincronia).

**Achado real, corrigido antes do merge (commit `46a06c2`):**
`abrirNovaCompraDoTexto` em `app/(app)/credito.tsx` chamava
`guessAmountFromText`/`guessCategoryFromText`/`guessDescFromText`/
`matchCardByText` para preencher o formulário de voz, mas fixava
`setTxInstallments('1')` direto — `ehIntencaoCredito` já chama
`parseParcelas` pra decidir a intenção (parcelamento só existe no crédito),
mas o número extraído nunca chegava ao formulário. Ou seja: falar "TV 2500
em 12 parcelas" pelo botão de voz do app abria a tela certa com
valor/categoria/cartão certos, mas sempre lançava 1x — a mesma classe de bug
que a sessão de crédito acima descreve ter corrigido no bot do WhatsApp,
reintroduzida no caminho do app. Corrigido chamando `parseParcelas(texto)`
também para `txInstallments`, com `1` como padrão quando a fala não
menciona parcela.

Merge feito com `git merge` (histórias divergiam desde antes de `fa124dc`/
`cedc5ee`, então não foi fast-forward). Conflito só em `context.md`
(as duas linhas de trabalho documentaram no mesmo arquivo); resolvido
mantendo as duas narrativas. Nenhum conflito de código — o branch não
tocava em nenhum arquivo da landing.

## Sessão de 03/09/2026 - cards de benefício: o desktop herdou as regras do celular

Autor, por print: "você corrigiu essa parte no celular e deixou ruim na
versão desktop". As três correções anteriores do dia em
`components/BeneficiosHorizontais.tsx` (commits `5082069`, `4817e79`,
`296ac7c`) foram todas motivadas por prints de celular, mas nenhuma delas
era condicional à largura — o `numberOfLines={3}`, a altura fixa recalculada
pra caber o texto truncado, o padding menor e o degrau a menos na tipografia
valiam também no card de 420px do desktop. Resultado no amplo: parágrafo
cortado com reticências no meio de uma frase e um vão morto de ~85px embaixo
do texto, porque a altura fixa tinha sido dimensionada pro conteúdo já
cortado.

Compacto e amplo agora são dois cards diferentes, não o mesmo card
escalado. O compacto fica exatamente como estava (altura 290, 3 linhas com
reticências, `padding: lg`, `type.apoio`/`type.legenda`). O amplo perdeu a
altura fixa: `cardAmplo` usa `flex: 1`, e o `alignItems: 'stretch'` que o
trilho já tinha iguala todos os cards pela altura do mais alto — que é o que
a altura fixa tentava imitar com número mágico. Texto inteiro, sem
`numberOfLines`, `padding: xl` e tipografia cheia (`type.corpo`/`type.nota`)
de volta.

Verificado com agent-browser em 1440×900 (caminho fixo/sticky), 1426×645 (o
caminho de rolagem horizontal, que é onde o print do autor caiu: `fixar`
exige altura ≥720, então uma janela desktop baixa usa o layout de toque) e
390×844 (compacto, inalterado). `npx tsc --noEmit` limpo; `npm run
test:parser` 100% (94 notas, 303 guardas do design system, 17 interruptores,
37/37 em sincronia).

### Mesma sessão - o palco do mini-mock estava 9px curto desde sempre

Autor, por prints: "isso aqui não tem margem, totalmente amador" (topo do
mock de análises), "esse primeiro card da sessão não dá pra ver direito" e
"o último também não".

`MiniMockBeneficio.palco` tinha `height: 108` fixo com
`justifyContent: 'center'` + `overflow: 'hidden'`. Medido no navegador, três
das seis variantes pediam mais que isso: `mes` e `organizar` 115px de
conteúdo, `personalizar` 109. Como o conteúdo é centralizado antes de ser
cortado, o excedente saía metade por cima e metade por baixo — comendo o
próprio `padding: spacing.md` — então a primeira linha ("Gastos deste mês /
R$ 1.210") encostava na borda de cima e a última era decepada. Não era só o
card do print: era o mesmo defeito em três cards, em toda largura, desde que
os mocks foram escritos.

Palco subiu pra 124 (a variante mais alta, 115, com folga). Altura única pra
todas as variantes continua sendo de propósito — é o que mantém o
rótulo/título de cada card na mesma linha de base. `alturaCard` do compacto
acompanhou, de 290 pra 300 (medido: sobra de 18px sob a última linha, com
16 de padding, ou seja 2px de folga real).

### Mesma sessão - cabeçalho 3px abaixo do centro da barra

`styles.cabecalho` usava `paddingVertical: spacing.xs` e a JSX sobrescrevia
só o topo (`paddingTop: insets.top + spacing.sm`), então a linha ficava com
8 em cima e 4 embaixo. Somando o `borderBottomWidth: 1` da barra sticky, o
logotipo e o botão "Entrar" caíam 3px abaixo do centro real da barra.
Agora `paddingVertical: spacing.sm` com `paddingBottom: spacing.sm - 1` —
o 1px a menos compensa a borda, que é a régua que o olho usa. Medido depois:
logotipo 12,6px acima e 12,6 abaixo, botão 8 e 8, numa barra de 52px.

**Observação sobre o ar (não corrigido, é infra):** granaponto.com.br está
servindo um bundle ANTERIOR até às correções de card do dia — o palco de lá
ainda mede 108 e não há `-webkit-line-clamp` nenhum, ou seja, o deploy da
Vercel não acompanhou os últimos pushes do `main`. Vale conferir o painel da
Vercel antes de julgar qualquer correção de landing por print do site no ar.

## Sessão de 03/09/2026 - teardown da Dinzo e execução parcial do plano de 7 seções

Pedido do autor: análise profunda da landing de um concorrente (Dinzo) e
replicação da técnica (não da marca/paleta) na landing do Grana. Documentos
gerados: `docs/marketing/2026-09-03-analise-concorrencia-meta-ads.md`
(campanhas mais escaladas no nicho, via Biblioteca de Anúncios da Meta) e
`docs/marketing/2026-09-03-dinzo-design-teardown.md` (tipografia, cor,
spacing, motion com curvas/durações exatas e estratégia de copy da Dinzo,
extraído por `getComputedStyle`/`document.styleSheets`, não estimativa
visual).

A partir do teardown, o autor apontou 7 elementos específicos pra replicar
(técnica, não visual clara da Dinzo) e pediu um plano único de execução —
escrito primeiro em `C:\Users\user\.claude\plans\mete-marcha-num-plano-ticklish-waffle.md`
(fora do repo), depois trazido pra
`docs/marketing/2026-09-03-plano-secoes-landing-dinzo.md` em 04/09/2026 a
pedido do autor, pra qualquer máquina ter acesso via `git pull` em vez de
só a que gerou o plano originalmente. Também virou regra permanente
(`AGENTS.md` #8): antes de qualquer pedido, buscar na biblioteca de skills
instaladas algo relevante ao domínio do pedido.

**Concluído nesta sessão (4 dos 7 itens):**

1. **CTA secundário no herói** — "Ver o Granabô em ação" ao lado do botão
   de cadastro, rolando até `#granabo` via `navegarParaSecao` (passada como
   prop `onNavegarGranabo` pra `HeroStorytelling`, que fica fora do escopo
   léxico de `ConteudoWeb`). `BotaoCTA` ganhou `variante?: 'primario' |
   'secundario'` e `onPress` opcional (precedência sobre o `href` de
   cadastro) — o secundário é outline, sem o reflexo diagonal (assinatura
   do CTA de conversão), com seta pra baixo em vez de pra frente (é
   rolagem, não navegação).
2. **`ConversaGranabo.tsx` clicável, com cara de WhatsApp de verdade** —
   reescrito do zero (era 100% estático). 3 chips disparam trocas reais
   (lançamento por texto, por áudio com o eco `🎙️ Ouvi:`, e consulta por
   categoria), respostas fiéis ao formato literal de
   `supabase/functions/whatsapp-webhook/index.ts`. Cores/formas do
   WhatsApp são citação literal (fundo bege, balão verde com canto reto,
   check duplo azul) — mesma lógica da exceção já aberta pro verde
   #25D366, mas aplicada à janela inteira; a barra de chips por baixo
   volta pros tokens do Grana. de propósito (é controle da landing, não
   WhatsApp de verdade).
3. **Seção "Dois passos" fundida na dobra de "esforço quase zero"** — o
   autor notou que a dobra existente e a seção de passos mostravam a MESMA
   cena (fala virando lançamento) separadas; viraram uma coisa só.
   `components/TrilhaPassos.tsx` (novo) tem 2 passos (não 3 — "conectar
   banco" não existe no produto), cada um com uma CENA do mecanismo
   acontecendo em vez de ícone genérico (mensagem→lançamento categorizado;
   celular+navegador com a mesma linha destacada nos dois). Trilha SVG
   pontilhada liga os dois nós, revelada por `clip-path` (não
   `stroke-dashoffset`, que deslocaria os pontos em vez de crescer a
   linha). `components/DemoRegistroRapido.tsx` ficou órfão (mesmo critério
   de `NotebookVideo.tsx`: mantido no repo, sem uso).
4. **Carrossel navegável de 5 telas reais** (item que o autor pediu pra
   "copiar totalmente" da Dinzo, depois corrigido pra "carrossel com todas
   as telas principais", não só 3 fixas) — `components/CarrosselTelasApp.tsx`
   (novo), nova seção `nativeID="telas"` ("Por dentro do aplicativo.").
   `components/MolduraCelular.tsx` ganhou `indiceControlado?: number`:
   quando fornecido, desliga o crossfade automático por `@keyframes` e
   cada quadro vira uma camada com `opacity`/`transition` CSS controlada
   de fora. Controles emprestam o vocabulário de `BeneficiosHorizontais.tsx`
   (índice, `podeVoltar`/`podeAvancar`, teclado ArrowLeft/Right,
   `accessibilityLiveRegion`) mas usam pílulas com NOME de cada aba
   (Início, Débito e Pix, Crédito, Boletos, Desafios), não setas + "N de 5"
   — aqui cada tela é identificável, ao contrário dos cards de benefício
   intercambiáveis.

**Capturas novas em `public/telas/`** (conta de demonstração, dado 100%
fictício, modo "Dados de exemplo" do Perfil ligado só em memória — some ao
recarregar, precisa navegar por dentro do app depois de ligar, nunca por
URL direta): `lancamentos-mobile.png`, `credito-mobile.png`,
`contas-mobile.png` (novas) e `inicio-mobile.png`/`desafios-mobile.png`
(recapturadas). A tag "(exemplo)" do cabeçalho foi ocultada via DOM na
hora da captura (`display:none` no elemento certo), nunca no código — o
app continua mostrando a badge normalmente pra quem usa de verdade.

**`lib/demo-data.ts` corrigido — bug real, não só preparo de print.** As
datas eram literais em agosto/2026; setembro chegou e o modo de exemplo
passou a abrir um mês vazio (Livre para Gastar zerado, gráfico de
comprometimento com 6 barras idênticas). Agora `esteMes()`/`mesesAtras()`/
`mesesAFrente()` calculam a partir de `new Date()` — a fixture não
envelhece de novo. Acrescentado: 5 meses de histórico com valores variados
(mês de viagem, mês magro, décimo terceiro) e 4 compras parceladas com
janelas de sobreposição diferentes, pra o gráfico de "Comprometimento
futuro" ter pico/queda reais em vez de linha reta (pedido explícito do
autor). Metas (`current_amount`) reduzidas de 4200/1150 pra 1800/650 —
com o histórico novo, os valores antigos deixavam "Livre para Gastar"
negativo (virava R$0,00 na tela).

**Achados de auditoria anteriores também corrigidos nesta sessão**
(P1-P3 do `.impeccable/critique/2026-09-03T23-45-30Z__landing-design-motion.md`,
a maioria já resolvida por trabalho anterior no dia — conferido no código
antes de mexer, não redigitado): "menos de R$0,34/dia" → "R$0,37" (o
valor antigo falhava em fevereiro, 9,90÷28=0,354); sombra ad hoc de
`BeneficiosHorizontais.tsx` unificada com o token `sombraCard`
(`lib/theme.ts`, exportado, antes era const local de `app/index.tsx`);
`prefers-reduced-transparency` tratado nas 3 superfícies com
`backdropFilter` (`usePrefersReducedTransparency` em `lib/motion.ts`);
`FogBackground` passou a reagir a mudança de reduced-motion ao vivo
(`useReducedMotion()` central em vez de checagem única no mount); FAQ
anima altura/opacidade em vez de teleportar (plano formal em
`plans/001-faqitem-accordion-transition.md`); 6 curvas `cubic-bezier`
soltas viraram tokens nomeados (`EASE_REVEAL`, `EASE_LOOP`,
`EASE_BOUNCE_HINT`, `EASE_ROLL`, `EASE_SNAP` em `lib/motion.ts`).

**Pendente — 3 dos 7 itens, o plano completo (com status por item) está em
`docs/marketing/2026-09-03-plano-secoes-landing-dinzo.md`:**

- **Painel web / moldura de navegador** (item 2): `components/MolduraNavegador.tsx`
  foi deletado no commit `f391829` (31/08) por ficar órfão — precisa ser
  recriado (conteúdo recuperável via `git show f391829~1:components/MolduraNavegador.tsx`)
  mais balões de anotação flutuantes (duração/delay únicos por balão,
  nunca sincronizados) e indicador de mouse sugerindo interação. Precisa
  também recapturar `public/telas/conquistas-web.webp` (desktop, 1440×900,
  desatualizada desde antes da correção de crop/badge do mesmo commit).
- **Bento grid de recursos** (item 3): quarto modo em
  `BeneficiosHorizontais.tsx` (CSS Grid estático em telas amplas, mantendo
  o carrossel atual intocado no compacto) — o item de maior risco técnico
  do plano, precisa desligar por completo a mecânica de scroll-linked
  quando o bento estiver ativo pra não competir no mesmo trilho.
- **Cards "Jornada" e "Fechamento do mês"** (item 4): dependem do bento
  existir. Não são feature nova — Jornada reaproveita a linguagem de
  `PILARES_HABITO` (Score, streak, 12 conquistas nominais de
  `lib/gamification.ts`, nunca mencionar XP/Elos como ganho por lançar
  gasto); Fechamento do mês já existe como `components/MonthlyWrappedModal.tsx`
  (7 slides, sem slide de "quanto guardou" — não prometer isso na copy).

`npx tsc --noEmit` limpo e `npm run test:parser` 100% (312/312 guardas do
design system) depois de cada mudança desta sessão. QA visual feito com
`agent-browser` priorizando mobile (390×844) antes de desktop, por pedido
explícito do autor ("70% do foco em mobile"). Sem commit nem push até
este ponto — a sessão foi instruída a manter tudo local até aqui, e agora
publica tudo de uma vez a pedido do autor, pra continuar na outra máquina.

## Sessão de 04/09/2026 - plano pro repositório, painel web, bug real de aviso no Início

Continuação da sessão anterior, em outra janela/possivelmente outra
máquina (mesmo diretório, `git pull` já trazia o commit `bc0f7ba` no
início). Pedido do autor: "eu quero que a outra máquina tenha acesso
total ao planejamento de implementações".

**Plano trazido pro repositório.** O plano das 7 seções (antes só em
`C:\Users\user\.claude\plans\mete-marcha-num-plano-ticklish-waffle.md`,
fora do controle de versão) foi copiado pra
`docs/marketing/2026-09-03-plano-secoes-landing-dinzo.md`, com status
marcado por item — qualquer máquina agora vê o plano completo e o que já
foi feito só com `git pull`. `plans/README.md` e `context.md` atualizados
pra apontar pro novo local.

**Painel web / moldura de navegador implementado (item 2 do plano, 5 dos
7 concluídos agora).** `components/MolduraNavegador.tsx` recriado (existia,
foi deletado no commit `f391829` de 31/08) — conteúdo idêntico ao
original, curva de animação migrada pro token `EASE_LOOP`. Balões de
anotação e indicador de mouse viraram componente novo,
`components/PainelWebDestaque.tsx` (não entraram na própria moldura —
dependem de onde o dado real aparece nesta captura específica). Nova
seção `nativeID="painel-web"` em `app/index.tsx`, entre o carrossel de
telas e "Inteligência financeira".

Bug pego durante a implementação: os balões, posicionados com
`left`/`right` negativo, ficavam relativos à SEÇÃO inteira em vez de à
moldura (o `View` que os envolvia esticava no eixo cruzado por padrão, sem
largura própria) — saíam pela borda do viewport em telas largas. Corrigido
dando ao wrapper largura explícita igual à da moldura.

**Nova screenshot**: `public/telas/conquistas-web.webp` (desatualizada,
29/08) removida; `public/telas/inicio-web.png` capturada no lugar
(1440×900, conta de demonstração, mesmo processo de ocultar a badge
"(exemplo)" via DOM só na captura — nunca no código).

**Achado real fora do escopo, corrigido na mesma sessão.** O autor
reportou por print um aviso vermelho "React does not recognize the
`im..." na tela de Início do app de verdade — não só numa captura minha.
Rastreado: `components/PieChart.tsx` e `components/StackedBarChart.tsx`
passavam `importantForAccessibility="no-hide-descendants"` (prop só do
Android) direto pro `<Svg>` da `react-native-svg`, que não traduz isso pra
web — vazava como atributo cru no DOM. Corrigido com `Platform.OS !==
'web'` guardando a prop nos dois arquivos; comportamento nativo idêntico,
aviso de dev sumiu na web (não afeta a versão publicada, só aparece em
build de desenvolvimento).

`npx tsc --noEmit` limpo e `npm run test:parser` 100% (318/318 guardas do
design system) depois de cada mudança. QA visual em 390×844 (compacto,
sem balões — corretamente ausentes), 1024×800 (faixa de risco que o
plano apontava, sem colisão com o cabeçalho) e 1440×900 (balões
corretos, ancorados na moldura).

**Pendente — 2 dos 7 itens**, plano completo em
`docs/marketing/2026-09-03-plano-secoes-landing-dinzo.md`:

- **Bento grid de recursos** (item 3, próximo): quarto modo em
  `BeneficiosHorizontais.tsx` — maior risco técnico do plano.
- **Cards "Jornada" e "Fechamento do mês"** (item 4): dependem do bento
  existir.

## Sessão de 04/09/2026 (continuação) — bento grid, código pronto/QA pendente

Implementado o item 3 do plano em `components/BeneficiosHorizontais.tsx`:
quarto estado de decisão `bento = largura >= 1100 && !reduzirMovimento`,
`fixar` passou a excluir `bento` explicitamente (`!bento && ...`) pra
nunca ter duas lógicas de posicionamento ativas ao mesmo tempo. Novo ramo
JSX (`if (bento) return (...)`) antes do `if (!fixar)` existente, com
`display:'grid'` via `as any` (3 colunas, `gap: spacing.lg`,
`gridAutoFlow: 'dense'`). Novo componente interno `CardBento` — não
reaproveita `CardBeneficio` porque a regra de largura é oposta (a grade
decide a largura da célula, não o componente). Campo novo
`tamanho?: 'normal' | 'grande'` em `BeneficioHorizontal`
(`undefined` = normal, retrocompatível); card `'grande'` usa
`gridColumn: 'span 2'`, fundo `theme.accentDeep`, borda `theme.accent`,
`borderRadius: 20`. A prop `destaque` que `MiniMockBeneficio` já tinha foi
reaproveitada pro card grande, sem inventar sistema paralelo (era a
recomendação do plano).

`npx tsc --noEmit` limpo e `npm run test:parser` 100% (318/318 guardas do
design system) depois da mudança.

**QA visual NÃO concluída nesta sessão** — a tentativa esbarrou em dois
erros de uso do `agent-browser` (não do produto): a env var da sessão
isolada é `AGENT_BROWSER_SESSION`, não `AGENTS_BROWSER_SESSION`; o comando
de redimensionar viewport é `viewport <w> <h>`, não `resize`. Corrigidos,
mas a sessão foi pausada pelo autor antes da primeira screenshot.
**Próxima sessão: retomar com QA visual nas 3 larguras críticas do plano**
(390×844 compacto — confirmar que ficou bit-a-bit igual ao que já existia
antes do bento; 1024-1100px — faixa onde `bento`/`fixar` trocam, único
modo ativo por vez, sem listener órfão do `useEffect` de scroll-linked;
1440×900 — grade do bento com os 6 itens atuais, ainda sem nenhum
`'grande'` porque isso só chega com o item 4). Com os itens atuais
(nenhum com `tamanho: 'grande'`), o bento hoje é uma grade neutra de 6
cards iguais — a hierarquia visual (1-2 cards grandes/coloridos) só
aparece depois que o item 4 (Jornada/Fechamento do mês) marcar 2 itens
como `'grande'`.

**Pendente — 2 dos 7 itens**, mesmo plano:
- **QA visual do bento** (ver acima) antes de considerar o item 3
  fechado.
- **Cards "Jornada" e "Fechamento do mês"** (item 4): depende do bento,
  que já existe em código — pode começar assim que a QA confirmar que o
  bento está correto.

## Sessão de 04/09/2026 — notificações humanizadas contínuas no Android

O autor reportou que os lembretes humanizados no tom de voz do Duolingo não
estavam aparecendo, embora os lembretes de contas fossem entregues e agrupados
normalmente pelo Android. O catálogo já existia e foi preservado por inteiro:
48 mensagens em `lib/notification-catalog.ts`, com seleção por sequência,
inatividade e fim de semana e bloqueio das 10 últimas escolhas.

**Causa real:** `scheduleDailyHabitReminder` mantinha um único id
`habito-diario` e um trigger `DATE`, que dispara uma vez só. A Home o
reagendava quando ganhava foco, mas depois do primeiro disparo não restava
nenhum lembrete futuro. Não era falta do sistema de mensagens; era o
despachante one-shot.

**Correção:** `lib/notification-schedule.ts` passou a planejar sete ocorrências
avulsas futuras, cada uma com id datado. `lib/notifications.ts` preserva as que
já estão pendentes e completa apenas o fim da janela, para a rotação não gastar
mensagens em reagendamentos descartados. Se já houve lançamento no dia, só a
ocorrência daquele dia é retirada; contas e faturas ficam intocadas. Alterar o
horário no Perfil substitui a janela inteira. As operações são serializadas
para duas chamadas concorrentes da Home não brigarem entre si.

No Android, o canal agora é criado antes de `requestPermissionsAsync` (ordem
necessária a partir do Android 13) e recebeu o nome abrangente "Lembretes do
Grana.". O bloqueio total do `expo-notifications` no Expo Go Android foi
removido: o SDK 57 restringe push remoto nesse ambiente, não as notificações
locais; o `require` continua adiado e protegido para nunca derrubar a raiz.

Regressão adicionada em `__tests__/corpus-notificacoes.ts`: 10/10 checagens
para janela de sete dias, silêncio após lançamento, horário, ids únicos e
virada de ano. `npx tsc --noEmit` limpo e `npm run test:parser` completo passou,
incluindo 318/318 guardas do design system e 37/37 pares sincronizados.

Nenhum build EAS foi disparado — continua exigindo pedido explícito do autor.

## Sessão de 04/09/2026 — push diário contínuo, aleatório e independente de abertura

O autor esclareceu que sete lembretes locais à frente não atendem ao requisito:
as 48 mensagens humanizadas precisam continuar girando diariamente mesmo que a
pessoa nunca mais abra o app, até a desinstalação. A arquitetura passou a ter o
push remoto como fonte principal e o agendamento local de sete dias como
fallback de cadastro/Expo Go, sem manter os dois ativos ao mesmo tempo.

- `lib/notification-catalog.ts` virou a fonte pura das 48 copies e do seletor
  contextual aleatório; `lib/notification-messages.ts` guarda somente o
  histórico local. Tanto o app quanto a Edge Function usam o mesmo catálogo.
- `lib/push-notifications.ts` registra e renova o Expo Push Token depois do
  login e a cada retorno ao primeiro plano, junto com plataforma, fuso e horário
  escolhidos. Troca de token também força sincronização. Desligar o lembrete ou
  sair da conta remove o token; falha inicial de cadastro mantém o fallback
  local. `app.json` fixa `lembretes-contas` como canal Android padrão.
- `push_tokens` tem RLS por dono. `push_habit_deliveries` é uma outbox invisível
  ao app, única por token/data local. O claim SQL usa `FOR UPDATE SKIP LOCKED` e
  lease de 15 minutos, impedindo duplicata se dois crons se sobrepuserem e
  recuperando uma execução que caiu no meio.
- A mesma alteração vive como baseline no fim de `supabase/schema.sql` e como
  delta aplicável em `supabase/migrations/20260904190000_push_habito.sql`.
- `enviar-lembretes-habito` cria a entrega após o horário local, envia lotes de
  até 100 para o Expo, repete falhas transitórias com backoff, consulta recibos
  após 15 minutos e apaga o token quando recebe `DeviceNotRegistered`. A copy
  evita as 10 últimas mensagens daquele aparelho e preserva contexto de
  inatividade, fim de semana e sequência.
- `supabase/cron-lembretes-habito.sql` instala o job de 5 em 5 minutos usando
  URL e segredo guardados no Vault. A função exige `CRON_PUSH_SECRET`; um
  `EXPO_ACCESS_TOKEN` pode ser configurado se a segurança reforçada do Expo for
  habilitada.
- Testes do módulo subiram de 10 para 20 casos (catálogo, antirrepetição, fuso,
  horário, streak e backoff), e as guardas do schema agora cobrem RLS, outbox e
  claim atômico. `npx tsc --noEmit` e `deno check` da Edge Function passaram.

**Estado operacional:** o autor forneceu um token temporário do Supabase e o
backend foi ativado em produção. A migration foi aplicada; a function está
`ACTIVE` com `verify_jwt=false` e segredo próprio obrigatório; o cron está ativo
em `*/5 * * * *`. A primeira execução automática ficou `succeeded`, e a chamada
real pg_net → Vault → Edge Function voltou HTTP 200 com
`{"ok":true,"tokens":0,...}`. Chamada sem segredo voltou 401, como deve. O
token temporário do autor não foi persistido em arquivo nem no repositório.

**Bloqueio restante:** a conta EAS está autenticada nesta máquina, mas a CLI só
expõe o gerenciamento de FCM de forma interativa; não foi possível confirmar
sem risco de alteração se a credencial Android FCM v1 já existe. Ainda falta
uma build nova aberta uma vez num Android físico (para cadastrar o primeiro
token) e um teste de envio + recibo. Até esse teste, não existe garantia honesta
de entrega ponta a ponta. Nenhum build EAS foi disparado nesta sessão.
As alterações paralelas já existentes em `components/MolduraNavegador.tsx`,
`components/PainelWebDestaque.tsx` e `.tmp.driveupload/` foram preservadas e
deixadas fora desta correção.

## Sessão de 04/09/2026 — voz unificada, Fase 2 (primeira leva do núcleo compartilhado)

Início da execução de
`docs/superpowers/specs/2026-09-04-voz-unificada-widget-android-design.md`, a
pedido do autor. Fase 0 e Fase 1 cumpridas; Fase 2 começou pela fatia mais
autocontida. **Nada do app, do widget ou do banco foi tocado.**

**Fase 1 já estava cumprida na prática, e a investigação mostrou por quê.** O
corpus existente não é só um teste do `lib/heuristics.ts`: `__tests__/extrair.ts`
lê funções DIRETO do arquivo real do webhook por regex e roda dentro de
`new Function`. Ou seja, mover código pra fora de `whatsapp-webhook/index.ts`
quebra teste que ninguém esperava — quem for extrair o resto do parser precisa
saber disto antes de mexer:

- `corpus-whatsapp-gerado.ts` (34.093 checagens), `corpus-roteamento.ts`,
  `corpus-consulta.ts` e `corpus-categorias-custom.ts` extraem por nome do
  arquivo do webhook. Função que sai de lá precisa ter o `corpoDaFuncao`
  correspondente repontado pro arquivo novo, ou o teste morre com
  `não achei X`.
- `__tests__/sync-parser.js` compara texto entre dois arquivos por par. Uma
  função que vira `import` no webhook some da comparação — o par tem que ser
  reapontado, não removido.

**O que foi extraído** para `supabase/functions/_shared/`:

- `finance-command.ts` — `NUMERO_POR_EXTENSO`, `somarExtenso`,
  `podeContinuarNumeral`, `segmentarExtenso`, `MOEDA`, `PALAVRA_MOEDA` e
  `normalizarTextoTranscrito`, movidos verbatim (só ganharam `export`). É a
  camada que a transcrição de áudio depende antes de qualquer parser de campo
  rodar.
- `voice-transcription.ts` — a ordem Groq (`whisper-large-v3`) → OpenAI
  (`whisper-1`), o prompt e a chamada multipart. Duas diferenças deliberadas
  em relação ao que estava inline no webhook: `transcrever()` recebe bytes +
  MIME + nome de arquivo (não um `mediaId` da Meta, que o app/widget não têm),
  e o prompt deixou de dizer "mensagens de WhatsApp" — o mesmo texto passa a
  valer pra áudio gravado no app ou no widget, que nunca passaram por lá.
  `fetchComTimeout` é injetado por quem chama.

`whatsapp-webhook/index.ts` passou a importar os dois; `baixarAudioDaMeta`
continua lá, porque é específico da Meta. O resto do parser (forma de
pagamento, recorrência, parcelas, categoria, boleto, `registrarLancamento`)
**ainda não migrou** — é a continuação da Fase 2.

**Achado, não corrigido:** `deno check supabase/functions/whatsapp-webhook/index.ts`
acusa **7 erros de tipo que já existiam antes desta sessão** (confirmado
rodando o mesmo comando no arquivo de `HEAD`). Todos vêm do `extras = []` sem
anotação, que é intencional — o comentário no próprio arquivo explica que
anotar quebra a limpeza de tipos de `__tests__/extrair.ts`. O pipeline do
projeto nunca rodou `deno check` (usa `tsc --noEmit`, que exclui
`supabase/functions/**`, mais os corpus em Node). Isso vira problema quando a
Edge Function nova entrar: vale decidir entre anotar e ensinar o extrator, ou
manter e conviver.

Verificações: `deno check` limpo nos dois módulos novos; `npx tsc --noEmit`
limpo; `npm run test:parser` completo 100% (34.093 do corpus gerado, 16.332 do
manual, 321/321 do design system, 37/37 em sincronia — mesma contagem de
antes, com o par de normalização repontado pro `_shared`); e prova de execução
real em Deno das 7 frases canônicas ("onze e setenta e nove" → `11,79`, "fiz um
pix de 50 pra Maria" preservando o artigo, "5h90" → `5,90`, "um real e um
centavo" → `1,01 reais`).

As alterações paralelas da landing (`app/index.tsx`, `components/AppPressable.tsx`,
`CarrosselTelasApp`, `ConversaGranabo`, `MolduraNavegador`, `PainelWebDestaque`,
`TrilhaPassos`, `BrandMark.tsx`) foram preservadas e ficaram FORA deste commit.

## Sessão de 04/09/2026 — lançamento por áudio unificado e widget Android 1x1

Escopo pedido pelo autor, mais estreito que a spec inteira: **resolver o
lançamento por áudio e deixar o widget de voz pronto pra próxima APK.** Fases 3
a 6 da spec, com uma troca de arquitetura deliberada (ver abaixo).

### A decisão que muda a spec: o backend transcreve, o aparelho interpreta

A spec previa levar o parser inteiro pro Deno (`_shared/finance-command.ts`) e
a Edge Function devolver o lançamento já interpretado. **Não foi isso que foi
feito, e o motivo é concreto:** o gap de qualidade do lançamento por voz do app
era o MOTOR DE TRANSCRIÇÃO (`expo-speech-recognition`, reconhecimento do
aparelho), não o parser. O parser do app (`lib/heuristics.ts`) já é o mesmo do
webhook — vigiado arquivo a arquivo por `sync-parser.js` e coberto pelos 34.093
casos do corpus.

Então a Edge Function nova devolve **só o texto transcrito**, e quem interpreta
é `lib/heuristics.ts`, no aparelho. Resultado:

- paridade real nos dois eixos (mesmo Whisper + mesmo parser) sem portar ~1.000
  linhas de regex financeira pro Deno, onde ela seria verificada por nada;
- o widget não precisa ir à rede pra decidir o que já sabe decidir;
- nenhuma cópia nova nasceu — a contagem de pares em sincronia subiu de 37 pra
  39 porque duas funções foram PORTADAS pro app, não duplicadas de novo.

Quem for retomar a spec: os Blocos `finance-persistence.ts`, `voice_operations`,
`mode=commit` e idempotência por `request_id` **não foram implementados** e
seguem válidos como trabalho futuro. Hoje o widget grava direto pelo
`lib/data.ts` do app, com a sessão do usuário.

### Backend

- **`supabase/functions/processar-lancamento-voz/`** (novo, autenticado). Recebe
  `multipart/form-data` com o campo `audio`, valida o JWT com
  `auth.getUser()` (identidade NUNCA vem do corpo), aplica teto de 2 MiB,
  allowlist de MIME e um rate limit best-effort de 12/min por usuário —
  best-effort de verdade: é um `Map` na memória do isolate, e o Supabase
  recicla isolates. O controle de custo que vale é o teto de tamanho.
  Devolve `{ status: 'ready', transcript }` ou `{ status: 'error', code }` com
  códigos estáveis, que são o que escolhe a mensagem na UI.
  **Publicar SEM `--no-verify-jwt`.** Precisa de `GROQ_API_KEY` (e
  `OPENAI_API_KEY` como fallback) nos secrets.
- O prompt do Whisper em `_shared/voice-transcription.ts` deixou de dizer
  "mensagens de WhatsApp" — agora serve os três canais.

### App

- **`lib/voz.ts`** (novo) — cliente da função. Trata o upload de arquivo nas
  duas plataformas (`{uri,name,type}` no nativo; `Blob` de verdade na web, onde
  a forma do React Native subiria como `[object Object]`), e traduz cada código
  de erro em título+texto prontos pra Alert ou notificação.
- **`components/VoiceEntryButton.tsx`** — trocou `expo-speech-recognition` por
  gravação com `expo-audio` (mono, 64 kbps, .m4a; ~150 KB em 20s), corte
  automático em 20s, e estado "Transcrevendo…" com spinner. **Efeito colateral
  bom: voz voltou a funcionar no Expo Go**, já que o aparelho agora só grava.
- **Lacunas de parsing fechadas** (eram as apontadas pela spec):
  `parseFormaPagamento` e `parseRecorrencia` portadas do webhook pro
  `lib/heuristics.ts` (agora 39/39 em sincronia). Com elas:
  - `credito.tsx` e `contas.tsx` deixaram de gravar `recurring: false` fixo —
    "Netflix no crédito todo mês" e "internet vence dia 15 todo mês" viravam
    lançamento avulso;
  - as duas telas passaram a carregar categorias personalizadas e usá-las no
    reconhecimento por voz;
  - `PasteReceiptModal` grava `payment_method` e `recurring` (antes "no pix"
    era ouvido e jogado fora), e o `guessCategoryFromText` do SALVAR passou a
    receber `extras` — sem isso, categoria custom reconhecida na tela voltava
    pra "Outros" na hora de gravar. Ganhou uma linha "Também reconhecido:
    Pix · repete todo mês", porque recorrência criada sem a pessoa perceber é
    dinheiro aparecendo nos meses seguintes.
  - `CategoryChips` aceita `extras` — antes, categoria custom reconhecida ficava
    selecionada sem chip nenhum pra mostrar qual era.

### Widget Android

Módulo Expo **local** em `modules/grana-voice-widget/` (não config plugin): o
`AndroidManifest.xml` e os recursos do módulo são mesclados pelo Gradle
sozinhos, o que evita um plugin manipulando XML na mão. Autolinking confirmado
via `npx expo-modules-autolinking resolve` (o módulo aparece na lista; ele não
entra no `settings.gradle`, é resolvido por `expoAutolinking.useExpoModules()`).

- `GranaVoiceWidgetProvider` — 1x1, três estados (ocioso/ouvindo/processando),
  estado em SharedPreferences porque um `AppWidgetProvider` é um receiver sem
  instância viva entre um toque e o próximo.
- `GranaVoiceCaptureService` — foreground service `microphone`, MediaRecorder
  com a MESMA configuração do gravador do app, corte por silêncio (só depois de
  ter ouvido fala) e teto duro de 20s. Apaga o arquivo em todo caminho de saída.
- `GranaVoiceHeadlessService` — `HeadlessJsTaskService`, entrega o arquivo ao
  JS com o app fechado.
- `lib/widget-voz-task.ts` — a tarefa. Transcreve, interpreta com
  `lib/heuristics.ts` e grava com `lib/data.ts`. **Não salva quando há
  ambiguidade que mexe em dinheiro**: sem valor, categoria caindo em "Outros",
  ou crédito sem cartão cadastrado viram notificação "toque para revisar" que
  abre a tela certa com a transcrição pronta.
- `index.js` novo (e `package.json:main` apontando pra ele): a tarefa headless
  precisa estar registrada na avaliação do bundle, antes de existir árvore React.
- `components/RespostaVozWidget.tsx` — trata o toque na notificação. "Desfazer"
  apaga o que a fala criou (inclusive todas as parcelas); tocar no corpo abre a
  tela. O botão abre o app de propósito (`opensAppToForeground`): apagar
  lançamento é destrutivo e a confirmação precisa ser visível.
- Perfil ganhou "Widget de voz na tela inicial", com pinning quando o launcher
  suporta e instrução do gesto manual quando não.

### Dois bugs achados relendo o Kotlin (corrigidos antes de qualquer build)

1. **Crash garantido**: o provider chama `startForegroundService` em TODO toque,
   inclusive no "encerrar". Se o processo tivesse morrido com o widget em
   "ouvindo", a instância nova do serviço nascia com `gravando = false`, saía
   sem chamar `startForeground` e o Android derrubava o app inteiro
   (`ForegroundServiceDidNotStartInTimeException`). Agora `startForeground` é a
   primeira coisa do `onStartCommand`, sempre.
2. **`setMaxDuration` + timer próprio**: o MediaRecorder para sozinho ao atingir
   o limite, e o `stop()` seguinte lança — descartando uma gravação de 20s
   perfeitamente boa. O corte agora é só nosso.

### Verificações

`npx tsc --noEmit` limpo; `deno check` limpo nos módulos `_shared` e na Edge
Function nova; `npm run test:parser` 100% (250.200 + 34.093 + 324 guardas do
design system + **39/39 em sincronia**); `npx expo prebuild --platform android`
gerou o projeto nativo sem erro com o módulo autolinkado; e
`npm run notas:check` aprovou a nota candidata do build.

`app.json` subiu **1.4.2 → 1.4.3** (regra 5 do AGENTS.md).

**Não verificado, e só dá pra verificar com build:** o Kotlin nunca foi
compilado — não há JDK nem Android SDK nesta máquina (`java` não existe,
`ANDROID_HOME` vazio). Widget, foreground service e tarefa headless são código
lido e revisado, não código executado.

**Pendente:**

1. **Build EAS** — não disparada (regra 4 do AGENTS.md exige pedido explícito).
   Nota já aprovada: `"Lance gastos por voz direto da tela inicial, com o mesmo
   motor do WhatsApp"`.
2. **Deploy da Edge Function** `processar-lancamento-voz` e conferir que
   `GROQ_API_KEY` está nos secrets. Sem isso o botão de voz responde
   "Voz indisponível agora" — o app não quebra, mas voz não funciona.
3. **QA em aparelho real**: widget na home, gravação com app fechado, force-stop,
   reboot, Android 12/13/14/15, e pelo menos Pixel/Samsung/Motorola.
4. **`expo-speech-recognition` continua instalado** de propósito — nada mais o
   importa, mas a spec manda remover só depois do QA em APK passar.
5. Da spec original, seguem em aberto: `finance-persistence.ts`,
   `voice_operations`, `mode=commit` e idempotência por `request_id`.

As alterações paralelas da landing seguem preservadas e fora deste commit.

## Sessão de 04/09/2026 — auditoria `/impeccable audit` e `/impeccable harden`

Auditoria completa registrada em `IMPECCABLE_AUDIT.md` (seção de 04/09):
**14/20**, com a triagem dos 94 achados do detector — 93 são `advisory` e a
maioria é falso positivo (cor de categoria e de banco são DADO, não drift).
Caiu de 16 para 14 sem regressão: entrou escopo novo (voz/widget) e a rubrica
de app de aparência única foi aplicada direito.

Em seguida, `/impeccable harden` corrigiu os dois P1. Os dois tinham a mesma
raiz: **o widget tratava permissão de notificação como detalhe de lembrete,
quando ela é pré-requisito de mover dinheiro.**

**A regra nova, em uma frase: sem como avisar, o widget não grava.** Não é
"grava e tenta avisar" — é recusa. Duas coisas dependem da notificação e as
duas são inegociáveis: a notificação do serviço em primeiro plano carrega os
botões **Encerrar** e **Cancelar** (sem ela o microfone abre sem controle
visível na gaveta), e o recibo do lançamento — com o **Desfazer** — sai por
notificação. No Android 13+ `POST_NOTIFICATIONS` é permissão de runtime e
`scheduleNotificationAsync` **falha calada**: sem esta regra, o gasto entrava
na conta e ninguém ficava sabendo.

Três portões, em profundidade:

1. **Perfil** pede a permissão ANTES de oferecer o widget
   (`adicionarWidgetVoz`). Instalar primeiro e descobrir depois seria entregar
   um botão morto.
2. **`GranaVoiceCaptureService`** checa `POST_NOTIFICATIONS` (API 33+) junto
   com `RECORD_AUDIO` e se recusa a abrir o microfone sem as duas.
3. **A tarefa headless** confere antes de gastar transcrição e antes de gravar,
   para o caso de a permissão ser revogada entre uma coisa e outra.

**Estado novo do widget: `atencao`.** Existe porque o widget não tem outro
jeito de falar — voltar ao repouso calado faria parecer que o toque não pegou.
Ele fica na tela até alguém tocar, e **o toque abre o app em vez do
microfone**, porque permissão só se resolve numa tela. O ícone é o microfone
CORTADO em `theme.danger`, não um "!": diz o que está indisponível, não que
algo deu errado. `RespostaVozWidget` apaga o aviso na abertura e a cada volta
do segundo plano (`AppState`) — o caminho real é conceder nas configurações do
sistema e voltar, e nessa volta o app é retomado, não remontado.

**Terceiro achado, fora da auditoria:** `lib/voz.ts` não tinha timeout nenhum.
Rede móvel ruim não devolve erro, ela pendura — o botão ficava em
"Transcrevendo…" para sempre e a tarefa do widget segurava o widget em
"Lançando…" até o Android matá-la aos dois minutos. Agora corta em 45s com
`AbortController` e código próprio (`demorou`), que diz a verdade: a fala pode
ter sido perfeita e o áudio pode até ter chegado — "sem conexão" seria mentira.

**Verificações.** `tsc --noEmit` limpo e `test:parser` 100% (324 guardas do
design system, 39/39 em sincronia). O Kotlin **continua sem compilar** (não há
JDK nem SDK aqui), então foram escritos dois verificadores para cobrir a classe
de erro que uma edição manual de recursos produz:

- **cruzamento de recursos**: toda referência `R.<tipo>.<nome>` no Kotlin e
  todo `@<tipo>/<nome>` no XML resolvem para um recurso existente — 29/29, zero
  órfãos. Precisou de duas correções no próprio verificador: `android.R.*` é
  recurso do sistema, e o `AndroidManifest.xml` mora fora de `res/`.
- **well-formedness de XML**: 11/11 arquivos do módulo, com controle negativo
  provando que o verificador reprova XML quebrado de verdade. A primeira versão
  acusou sete arquivos corretos — o grupo de atributos engolia a barra da tag
  auto-fechada.

Os dois verificadores foram descartados depois de rodar: são de uso único e
viveriam desatualizados no repo. Se o módulo nativo crescer, vale reescrevê-los
como teste dentro do `test:parser`.

Segue pendente do relatório: rótulos nas abas (P2), Ionicons (P2), agregação no
banco para o saldo (P2), token de "gravando" no lugar da cor de Alimentação
(P2), `theme.scrim` (P3), órfãos (P3). Nenhuma build disparada; `app.json` em
1.4.3.

## Sessão de 04/09/2026 — reflexo do CTA e direção dos widgets

Corrigido em `app/index.tsx` o reflexo dos botões primários "Criar minha
conta" da landing. O bug era o ciclo de uma única execução (`720ms`,
`animationIterationCount: 1`): ao terminar, a transformação voltava ao estado
estático e deixava a faixa clara parada sobre o botão. Agora a camada continua
existindo somente durante hover real, mas roda em ciclos infinitos de `3.2s`:
uma passagem visível de aproximadamente 700ms, pausa invisível e retorno ao
início ainda com opacidade zero. `prefers-reduced-motion` continua sem o efeito.

Validação no Expo Web com navegador automatizado: estilo computado confirmou
`animation-duration: 3.2s` e `animation-iteration-count: infinite`; a amostragem
por sete segundos observou duas passagens completas; ao retirar o cursor, a
camada animada foi desmontada (`0` elementos). `npx tsc --noEmit` e
`git diff --check` passaram.

Também ficou aprovada como direção de produto, ainda sem implementação naquela
etapa, a família de widgets Android: voz 1x1; Livre para Gastar 2x1; central
de lançamento 2x2; próximo compromisso 2x2; e cofrinho 2x1.

## Sessão de 04/09/2026 — família de widgets Android implementada

A direção acima foi implementada conforme a especificação aprovada em
`docs/superpowers/specs/2026-09-04-widgets-android-home-design.md`. O widget de
voz 1x1 foi preservado e o módulo local agora também publica quatro providers:

- **Livre para gastar 2x1** — livre por dia, total e dias restantes;
- **Central de lançamentos 2x2** — Entrada, Débito/Pix, Crédito e Boleto;
- **Próximo compromisso 2x2** — primeiro boleto pendente/atrasado;
- **Cofrinho 2x1** — meta em foco, valores, percentual e progresso.

Os informativos não abrem cliente Supabase no launcher. O React Native monta
um snapshot mínimo, versionado e cifrado em AES/GCM com chave não exportável do
Android Keystore. O snapshot é atualizado no login, na volta ao primeiro plano
e depois de mutações de transação, boleto ou meta; falha de uma fonte preserva
o último conjunto coerente. Logout limpa os valores antes de remover a sessão,
troca de conta invalida buscas atrasadas e o modo privacidade mascara valores
imediatamente, mesmo sem rede.

Os toques usam deep links e sempre voltam aos fluxos existentes do app. Apenas
o widget de voz movimenta dinheiro sem abrir interface; os quatro widgets
novos só abrem telas/modais para confirmação. O Perfil ganhou uma seção com os
cinco widgets, contagem instalada, pinning quando o launcher suporta e instrução
manual quando não suporta.

**Verificações locais:** `npx tsc --noEmit` limpo; `npm run test:parser` 100%,
incluindo 23/23 verificações novas de snapshot/seleção/deep links; 24/24 XMLs
Android bem formados; todas as referências `R.*` do Kotlin e referências entre
XMLs resolvidas. O compile real de Kotlin/recursos/manifest fica a cargo do
workflow `.github/workflows/android.yml` após o push. Nenhum build EAS foi
disparado e `app.json` permanece em 1.4.3.

O primeiro run desse workflow revelou um erro anterior do widget de voz que
nenhuma checagem textual alcançava: no React Native 0.86,
`HeadlessJsTaskService.getTaskConfig` recebe `Intent?`, mas o override local
usava `Intent` não nulo. `GranaVoiceHeadlessService` foi ajustado para a
assinatura atual e continua encerrando com segurança quando não há extras.

## Sessão de 04/09/2026 — auditoria de margem/entrelinha e o passe de ritmo

`/impeccable audit margem e espaçamento entre linhas`, medido por analisador
nos blocos `StyleSheet` (relatório completo no `IMPECCABLE_AUDIT.md`). As duas
superfícies eram imagem espelhada uma da outra: **o app tinha resolvido a
entrelinha e não a margem (40% de token); a landing tinha resolvido a margem
(96%) e não usava o `lh()`.**

**O achado que mudou o remédio.** Havia 154 números crus de espaço nas telas,
mas não eram 154 decisões: 86 eram quatro valores repetidos, e dois deles com
papel verificado no código — `6px` em 39 lugares (sempre o vão entre um ícone
e o texto ao lado) e `2px` em 23 (sempre o fio entre um rótulo e o sub-rótulo).
Um valor usado 39 vezes para a mesma coisa é um token que ninguém nomeou. A
causa era a escala: `spacing` saltava 4 → 8 → 12 → 16, sem nada abaixo de 4 nem
entre os degraus, então todo ajuste fino escapava do sistema por construção.

Entraram **`spacing.fio` (2)** e **`spacing.icone` (6)**, nomeados por PAPEL e
não como `xxs`/`xsm` — mesmo espírito de `leading.corpo`/`leading.apoio`. A
razão é de revisão: `spacing.icone` num espaço que não envolve ícone lê como
engano; um `xxs` genérico não lê como nada. Com eles, 145 números viraram token
(117 no primeiro passe + 28 na Início, que ficou para um commit à parte).

Também: **`perfil.tsx` entrou no `screenRhythm`** — era a única das sete telas
fora dele (20/16 contra 16/12), e por isso o corpo deslocava ao trocar de aba,
que é exatamente o sintoma que o token nasceu para matar. E **três `lineHeight`
cravados em pixel viraram `lh()`**: `type` é `Platform.select` e `legenda` vale
12 no Android e 14 na web, então um `15` fixo dava 1,07× na web, com as linhas
quase se encostando.

**O que NÃO foi trocado, de propósito.** Sobraram 37 números crus, e eles não
são ritmo: `13` é altura de linha tocável no Perfil, `14` é altura de botão
primário, `10` é altura de linha de lista. Trocar por token encolheria alvo de
toque — seria mudança de design disfarçada de limpeza. Ficaram, com comentário
no ponto mais denso (`perfil.tsx`, os `row`/`tappableRow`) para a próxima
pessoa não "limpar" e reduzir os alvos em silêncio.

Fica aberto do relatório: rótulos nas abas (as três de pagamento — carteira,
cartão e recibo — não se distinguem por ícone), Ionicons no lugar de SF
Symbols/Material Symbols, agregação no banco para o saldo, token de "gravando"
no lugar da cor de Alimentação, e a entrelinha da landing ligada ao `lh()`
(esta última precisa nomear a entrelinha de 1,5 do corpo de marketing, que não
é decisão mecânica).

**CI nova:** `.github/workflows/android.yml` compila o Android nativo
(`expo prebuild` + `gradlew :app:assembleDebug`) num runner do GitHub a cada
push que toca `modules/`, `plugins/`, `app.json` ou `package.json`. Não usa EAS
e não encosta na cota. Existe porque o Kotlin do widget nunca foi compilado
nesta máquina — não há JDK nem Android SDK aqui — e revisão por leitura não
pega erro de tipo, de API nem de merge de manifest. Tem `workflow_dispatch`
para rodar à mão antes de uma build.

## Sessão de 04/09/2026 - dois vazamentos de dado financeiro fora do app

O autor perguntou se a sessão anterior tinha se equivocado em privacidade ao
construir os widgets/notificações. Investigação confirmou dois vazamentos
reais, ambos corrigidos:

1. **`notifyCreditLimitThreshold`** (`lib/notifications.ts`) mandava
   `"R$ X de R$ Y gastos"` no corpo da notificação de limite de cartão — texto
   que aparece na tela de bloqueio por padrão, sem exigir desbloqueio, a menos
   que a pessoa tenha configurado manualmente "ocultar conteúdo sensível" no
   sistema (raro). Corpo não cita mais valor nenhum; a porcentagem que já
   estava no título é suficiente pra avisar.
2. **Widgets de resumo** (Livre pra Gastar, Cofrinho, Próximo Compromisso)
   mostravam saldo/fatura reais na tela inicial por padrão. A causa: a flag de
   privacidade deles só herdava `usePrivacy()` (modo privacidade geral do
   app), que nasce DESLIGADO (`useState(false)`) e foi desenhado pra outra
   ameaça — alguém olhando por cima do ombro enquanto você usa o app —, não
   pra "fica exposto na tela inicial o tempo todo, sem eu nem tocar no
   celular". Ninguém pensaria em ligar essa configuração especificamente por
   causa do widget.

   `lib/widget-privacy-context.tsx` é uma preferência nova e separada
   (`WidgetPrivacyProvider`, chave própria no AsyncStorage), que nasce
   OCULTA. `SincronizadorWidgetsHome` agora oculta valor no widget se
   QUALQUER um dos dois sinais mandar ocultar (`hidden || !valoresVisiveis`).
   Toggle "Mostrar valores nos widgets" novo na seção de widgets do Perfil,
   desligado até a pessoa ligar explicitamente.

   Widgets de ação pura (voz, central de lançamento) não mostram dado
   nenhum — confirmado que não precisavam de mudança.

Verificações: `npx tsc --noEmit` limpo (precisou reinstalar `node_modules` —
`expo-audio`, dependência nova da sessão de voz unificada, não estava
instalada neste ambiente) e `npm run test:parser` completo aprovado, incluindo
20/20 checagens de notificações, 23/23 de widgets e 39/39 pares em
sincronia. Sem validação visual em aparelho Android nesta sessão — o widget
de resumo com o toggle novo ainda não foi visto rodando de verdade.

## Sessão de 04/09/2026 - texto sobrepondo texto, e a margem dos componentes

O autor mandou prints reais do app (via a seção "por dentro do aplicativo" da
landing) mostrando informação empilhada uma em cima da outra. Não era print
ruim: era bug de layout, e tinha uma causa raiz só.

**A causa.** Uma `View` com `flexDirection: 'row'` +
`justifyContent: 'space-between'` segurando dois `<Text>`, nenhum com
`flexShrink` e a fileira sem `flexWrap`. Enquanto o conteúdo cabe na linha,
parece certo. Quando o texto é dado do usuário e cresce — descrição de conta,
nome de categoria, valor em R$ sem teto, nome de faixa — os dois lados não
têm como ceder nem quebrar, e colidem. Por isso o mesmo card aparecia certo
numa linha e sobreposto na outra, o que fazia parecer defeito aleatório.

Dez ocorrências corrigidas em seis arquivos (`index.tsx`, `contas.tsx`,
`desafios.tsx`, `credito.tsx`, `TransactionSheet.tsx`, `OnboardingModal.tsx`),
cada uma com o dado dinâmico que a dispara escrito no comentário. O padrão de
correção é sempre o mesmo: `flexWrap` + `rowGap` na fileira, `flexShrink: 1`
no texto que faz sentido quebrar pra linha de baixo.

**Não era bug** o botão flutuante de Lançamentos aparecendo por cima de um
valor num dos prints: FAB fica em posição fixa da tela por definição, e a
lista já reserva espaço embaixo via `useTabBarInset`. Só precisa printar de
outro ponto de rolagem.

**Auditoria de margem, medida (não amostrada).** A auditoria de 04/09 de
manhã mediu só `app/(app)/*.tsx`. Medindo de novo, agora incluindo os ~60
componentes compartilhados:

| Superfície | Cobertura de token | Números crus |
|---|---|---|
| Telas do app | 82,8% | 47 |
| Componentes do app | 57,5% | 221 |
| Componentes da landing | 71,1% | 33 |

As 7 telas estão todas na mesma régua (`screenRhythm.padding` lateral,
`screenRhythm.gap` entre cards) — a regra de alinhamento do `AGENTS.md` está
cumprida no nível de tela. Os sheets/modais também estão consistentes
(`Sheet.tsx` + `padding: spacing.xl` no scrim de nove modais).

O que sobra, em ordem de valor:

1. **78 dos 221 crus dos componentes são os dois tokens que já existem**:
   `6` em 52 lugares (é `spacing.icone`) e `2` em 26 (é `spacing.fio`). Os
   tokens nasceram na auditoria da manhã e foram aplicados só nas telas.
   Trocar isso é mecânico e não move um pixel.
2. **`10` (45 usos) e `14` (26 usos) estão ENTRE degraus da escala** (que
   salta 8 → 12 → 16). São 71 decisões feitas no olho. Precisam de decisão do
   autor: ganham nome por papel, como `fio` e `icone` ganharam, ou encostam
   no degrau vizinho. Não foi mexido.
3. Dois desvios pontuais: `ImportarExtratoModal` usa scrim
   `rgba(0,0,0,0.55)` contra `0.5` dos outros nove; `HomeCustomizerModal` usa
   `spacing.sm + 2`, conta que escapa da escala.

Vale separar as duas coisas: dívida de token causa um card sutilmente mais
apertado que o irmão, não causa colisão. O que apareceu nos prints era o bug
de flex acima, e está corrigido.

Verificações: `npx tsc --noEmit` limpo e `npm run test:parser` completo
aprovado (327/327 guardas do design system, 39/39 em sincronia). Sem
validação visual em aparelho — os prints novos que o autor pediu ainda
precisam ser tirados depois de rodar o app.

## Sessão de 04/09/2026 - consolidação da outra máquina e fechamento dos riscos

`main` recebeu por fast-forward os 6 commits que estavam apenas em
`origin/claude/grana-landing-page-design-df5etm`: privacidade de notificação
de limite, valores dos widgets ocultos por padrão, toggle explícito no Perfil
e as correções de colisão de texto descritas acima.

O que ainda era risco funcional foi fechado no código:

- voz do widget agora usa `requestId` de ponta a ponta e grava por
  `registrar_operacao_voz`; `voice_operations` persiste o recibo, compara hash
  do payload e devolve o mesmo resultado em retentativas;
- conta, transação e todas as parcelas são criadas na mesma transação SQL;
  `desfazer_operacao_voz` remove o conjunto inteiro atomicamente e deixa o
  tombstone `undone`, impedindo uma retentativa antiga de recriar o gasto;
- notificações novas carregam `operationId`; recibos de builds antigas ainda
  têm fallback pelos IDs individuais;
- todos os `AppWidgetProvider` ficaram `android:exported="false"`, inclusive o
  receiver que aceita `TOQUE`, impedindo outro app de iniciar o microfone;
- pushes remotos de hábito ganharam `collapseId` e `tag` Android estáveis por
  data local, mantendo o retry exponencial sem empilhar cópias visíveis.

Banco: migration criada em
`supabase/migrations/20260905004109_voice_operations.sql` e baseline repetível
atualizado em `supabase/schema.sql`. A aplicação remota não ocorreu: o projeto
está vinculado, mas a CLI respondeu `401 Unauthorized` ao inicializar o login
role e não há `SUPABASE_ACCESS_TOKEN` disponível nesta máquina. Pelo mesmo
motivo, a Edge Function de push alterada não foi publicada.

Verificações locais: TypeScript limpo; a suíte completa encontrou um `+`
acidental no baseline SQL na primeira passagem, ele foi removido, e a segunda
passagem terminou inteira sem falhas (incluindo 23/23 schema, 11/11
voz/idempotência, 22/22 notificações, 327/327 design system e 39/39 arquivos
em sincronia). `git diff --check` também ficou limpo. Nenhuma build, EAS,
versão ou release foi criada nesta sessão.

## Sessão de 05/09/2026 — pop-up de atualização de verdade, e widgets com defeito real de uso

**Pop-up de atualização**: confirmado ponta a ponta com dados reais (`eas
build:list`, `eas webhook:list`, probe HTTP na Edge Function) que o
mecanismo funciona — mas só quando o build usa o perfil `preview`. O
`eas.json` tinha um perfil `production` incompleto (sem `distribution:
internal` nem `android.buildType: apk`) desde o commit inicial do projeto,
nunca usado de verdade (100% das builds históricas usaram `preview`), mas
um risco real se algum dia alguém rodasse `--profile production` por
engano: o artefato sairia `.aab`, que o banner anuncia mas ninguém
instala fora da Play Store. Corrigido alinhando os dois perfis; regra nova
permanente no `AGENTS.md` (#9).

A pedido explícito do autor, build disparada (`eas build --profile preview
--platform android`, 1.4.3, mensagem já aprovada por `notas:check`) —
consumiu 1 das 15 builds EAS do mês. Terminou `FINISHED`, artefato
`.apk`, distribuição `internal`, exatamente o que o webhook espera.

**Achado real, não cosmético: o widget de lançar por voz nunca pedia
`RECORD_AUDIO`.** `adicionarWidget('voz')` em `perfil.tsx` só pedia
permissão de notificação antes de liberar o widget — mas
`GranaVoiceCaptureService.iniciar()` checa `RECORD_AUDIO` PRIMEIRO, e
devolve o mesmo silêncio com flash de "atenção" pras duas faltas. Quem
nunca tinha usado o botão de voz dentro do app (único lugar que pedia
microfone, em `VoiceEntryButton.tsx`) tocava no widget, via um pisca
rápido de "ouvindo" e nada mais — exatamente o "aperto, falo, nada
acontece" relatado pelo autor a partir do aparelho real dele. Corrigido
chamando `requestRecordingPermissionsAsync()` (`expo-audio`) também, antes
da notificação. **Quem já tem o widget instalado da build 1.4.3 não
precisa de build nova pra isso**: basta autorizar o microfone do Grana.
direto nas configurações do aparelho (Android: Apps → Grana. →
Permissões → Microfone) — é permissão de app, não de widget, e passa a
valer na próxima gravação.

**Widget "Central de lançamentos" redesenhado**: era uma grade 2x2 de
caixas com ícone genérico (um "+"/"−" só, sem nenhuma seta) todas na
MESMA cor aproximada a olho (`#7BD8C0`, não batia com nenhum token real).
O autor comparou com o menu real do app (`components/FabButton.tsx`,
lista vertical ícone+rótulo) e pediu pra parecer com aquilo. Reescrito
como lista vertical de 4 linhas; ícones de Entrada/Saída redesenhados como
círculo com seta pra cima/baixo (equivalente a `arrow-up/down-circle-
outline` do Ionicons); cores corrigidas pra bater exato com `lib/theme.ts`
(`theme.up` verde, `theme.down` ciano, `theme.accent2` menta pro Crédito,
`theme.ink` pro Boleto — cada ação com sua própria cor pela primeira vez).
`grana_compromisso_widget.xml` (Próximo compromisso) NÃO foi mexido: o
autor citou como "ruim" na primeira mensagem mas não re-confirmou depois
de esclarecer que os valores mascarados eram só o modo privacidade sem
ativar (não um defeito) — fora de escopo por enquanto.

Sem JDK/Android SDK nesta máquina (limitação de sempre), verificação foi:
XML bem formado (checagem própria de balanceamento de tags), toda
referência `@color`/`@drawable`/`@string`/`@layout` resolvendo pra algo
que existe (script próprio, descartável), IDs batendo com
`CentralLancamentoWidgetProvider.kt`. Compilação de verdade fica por conta
do `.github/workflows/android.yml` no push — acompanhado até `completed`
desta vez, pela API pública do GitHub (o repositório é público, dá pra ler
sem token).

**Notas da versão 1.4.3 incompletas**: o autor notou que o pop-up "O que
mudou" só mostrava uma linha (a mensagem do último commit do build), quando
na verdade a versão inclui tudo desde a 1.4.1 — os 5 widgets Android, push
contínuo, notificações humanizadas corrigidas, e agora os fixes desta
sessão. O campo `notes` sempre suportou múltiplas linhas
(`verificarNovidades` já faz `.split('\n')`); só nunca tinha recebido um
texto multi-linha de verdade. Como o texto é só um campo de dado (não faz
parte do binário do APK), a correção não precisa de build nova — é um
`update app_release set notes = ... where id = 1` direto, no padrão já
documentado no comentário do `schema.sql`. Passado pela mesma guarda
ortográfica (`validarNotaRelease`) antes de entregar ao autor rodar no
SQL Editor do Supabase (sem expor nenhuma credencial de serviço aqui).

**Causa real do lançamento por voz "aperta e nada acontece" tem DUAS
camadas, não uma.** O autor suspeitou que o banimento das contas do
Meta/WhatsApp (30/08, ver memória `meta-whatsapp-contas-banidas`) estivesse
por trás — e estava certo, só que indiretamente: aquele mesmo incidente
órfãou `GROQ_API_KEY`/`OPENAI_API_KEY`, as duas chaves que o motor de
transcrição (WhatsApp, app e widget, é o mesmo motor) precisa. O autor já
regenerou as duas nos consoles externos e recolou nos Secrets — essa parte
está resolvida.

**Mas tem uma segunda causa, confirmada por sonda HTTP direta**: a Edge
Function `supabase/functions/processar-lancamento-voz/` **nunca foi
publicada em produção**. `curl` na URL da função devolve
`{"code":"NOT_FOUND","message":"Requested function was not found"}` — a
resposta canônica do Supabase pra função inexistente, diferente de um
403/401 de autenticação (que é o que `whatsapp-webhook`, publicada de
verdade, devolve pro mesmo tipo de sonda). Ou seja: mesmo com a permissão
de microfone corrigida (sessão anterior) e as chaves novas no lugar, o
áudio chegaria ao servidor e não teria pra onde ir.

**Pendente, a pedido do autor — resolver junto na próxima sessão, não
isoladamente**: (1) publicar `processar-lancamento-voz`
(`supabase functions deploy processar-lancamento-voz --project-ref
cjnuzfbvfuauvlzfoutv`) — nenhuma sessão até agora teve
`SUPABASE_ACCESS_TOKEN`/login da CLI disponível pra fazer isso; (2) o
`update app_release set notes = ...` das notas incompletas da 1.4.3 (ver
acima). Nenhum dos dois precisa de `eas build`.

## Sessão de 05/09/2026 (continuação) — as duas pendências resolvidas, e o WhatsApp desligado

O autor trouxe um Personal Access Token do Supabase válido por 1 dia
(`sbp_...`, nunca persistido em arquivo nem commitado). Com ele, as duas
pendências registradas acima foram fechadas:

- **`processar-lancamento-voz` publicada** (`supabase functions deploy`).
  Confirmado por sonda HTTP: a resposta mudou de
  `{"code":"NOT_FOUND",...}` pra `{"code":"UNAUTHORIZED_NO_AUTH_HEADER",...}`
  — a função existe e valida JWT como esperado, sem `--no-verify-jwt`.
- **Notas da 1.4.3 reescritas** via `POST /v1/projects/{ref}/database/query`
  (Management API, mesmo token) com o changelog completo da versão
  (5 widgets Android, voz na tela inicial, privacidade dos widgets,
  notificações contínuas) em vez da única linha do commit do build.
  Passado pela mesma guarda ortográfica (`validarNotaRelease`) antes de
  publicar. Confirmado por leitura de volta da linha.

**Achado, não coincidência: o autor suspeitou certo, só que indireto.** O
mesmo incidente de 30/08 (contas Meta banidas) órfãou `GROQ_API_KEY`/
`OPENAI_API_KEY` — as chaves do motor de voz. O autor já tinha regenerado
as duas antes desta sessão; o que faltava era só a função nunca ter sido
publicada (item acima). **Verificado, não achado**: `lib/voz.ts`,
`VoiceEntryButton.tsx`, `widget-voz-task.ts` e a Edge Function não têm
NENHUMA referência de código ao WhatsApp — só comentários explicando que
é "o mesmo motor Whisper". O erro "Sem conexão" que o autor mostrou por
print é `codigo: 'sem_rede'` em `lib/voz.ts`, que só dispara quando o
`fetch()` em si lança exceção (sem rede/DNS/TLS) — não tem relação com
função ausente (isso seria outro código) nem com o WhatsApp.

**O WhatsApp foi desativado por tempo indeterminado, decisão do autor
depois de um SEGUNDO banimento de contas Meta** (frustração explícita
na sessão). Dois desligamentos independentes, cada um pela via certa:

1. **Dentro do app**: `UPDATE feature_flags` (mecanismo já existente desde
   02/09, ver `lib/feature-flags-regras.ts`) — `enabled=false` já estava
   assim de uma queda anterior, mas escopado só a `plataformas: ["web"]`
   e com `reativa_em` marcado pra 09/09. Ampliado pra `plataformas: null`
   (todas) e `reativa_em: null` (sem prazo automático), `aviso_versao`
   subiu pra forçar o aviso a reaparecer. Vale em segundos, sem build —
   já esconde/desabilita os botões de WhatsApp em Início, Perfil e
   Onboarding, que já liam essa flag antes desta sessão.
2. **Na landing page** (`app/index.tsx`, commit `a7fb214`): removida a
   dobra inteira "Granabô no WhatsApp" (título, chat `ConversaGranabo`,
   grade de 4 recursos), o item de navegação, o CTA secundário do herói,
   o selo "WhatsApp oficial, verificado pela Meta" (2 lugares: faixa de
   confiança e seção de segurança) e as 2 perguntas do FAQ exclusivas do
   Granabô. Mais 3 ajustes de copy que citavam WhatsApp como um canal
   entre vários. `components/ConversaGranabo.tsx` foi MANTIDO no
   repositório (só desconectado) — "tempo indeterminado" implica
   reativar depois, não descartar.

`npx tsc --noEmit` limpo e `npm run test:parser` 100% (327/327 guardas
do design system) depois da remoção da landing. Nenhuma build EAS
disparada — nenhuma das mudanças desta sessão precisava.

**Nota de coordenação**: o autor mencionou que "o Codex" (outra
ferramenta de IA) está avaliando o mesmo assunto de lançamento por voz
em paralelo, possivelmente na outra máquina. Nenhum arquivo de voz
(`lib/voz.ts`, `widget-voz-task.ts`, `VoiceEntryButton.tsx`,
`processar-lancamento-voz`) foi tocado nesta sessão além do deploy da
função (que é infraestrutura, não código) — só investigado. Quem
retomar precisa `git fetch` antes de editar esses arquivos.

## Sessão de 05/09/2026 — envio de voz compatível com Expo 57

O aviso "Sem conexão" também era causado por uma exceção LOCAL, antes de
qualquer envio: `lib/voz.ts` passava `{ uri, name, type }` ao FormData, mas
Expo 57 instala `expo/fetch` globalmente e seu serializador rejeita esse
objeto com `Unsupported FormDataPart implementation`. Reproduzido com o
serializador instalado e o cliente real, sessão/transporte simulados; zero
envios e a mesma mensagem do print. A observação da sessão anterior sobre
`fetch` lançar apenas por rede/DNS/TLS estava incompleta.

O cliente compartilhado pelo botão e widget agora envia `File` de
`expo-file-system`, verifica existência/tamanho e usa `expo/fetch`
explicitamente. Falhas locais não são mais rotuladas como falta de rede.
Timeout de 75s comporta os dois provedores sequenciais de 30s mais upload,
abaixo do teto de 120s da tarefa do widget.

A função de transcrição ganhou preflight OPTIONS e cabeçalhos CORS em
sucesso/erro. Sonda em produção confirmou que a função JÁ existe (405 com
`metodo_invalido` em OPTIONS), mas ainda não tinha CORS. A tentativa de
publicar esta correção via CLI com `--use-api` retornou 401 Unauthorized;
é preciso renovar a autenticação da CLI e publicar a função. Não houve
alteração de secrets, banco ou permissões de JWT.

`npm run test:voz` executa cliente e handler com dependências nativas/serviços
simulados e o serializador REAL do Expo, cobrindo a regressão, bytes multipart,
arquivo ausente/vazio/grande, sessão, rede, erro local, timeout, web e CORS.
Entrou na CI. TypeScript, esse teste, `deno check` da função e a suíte completa
`test:parser` passaram.
Não houve teste de microfone em aparelho físico ou transcrição com provedores
reais. Nenhuma build EAS foi solicitada/disparada: o Android instalado ainda
precisa de nova versão contendo o cliente corrigido; app.json não foi alterado.

## Sessão de 05/09/2026 — novo visual do widget de voz

O autor comparou o widget 1x1 com os ícones reais do launcher e enviou como
referência o ícone oficial com fundo em gradiente. O diagnóstico confirmou
que o disco de 48dp parecia subdimensionado na célula, principalmente ao lado
do ícone adaptativo do próprio Grana.

O estado de repouso agora usa um círculo de 64dp (33% maior no diâmetro), com
o gradiente horizontal oficial `#B0F7C9 → #22A1C1` e microfone em Instrument
Mint (`#AEFFE3`). Como menta sobre a ponta clara da rampa tem pouco contraste,
o vetor ganhou contorno petróleo `#09384A`; ele continua visualmente menta sem
sumir sobre o fundo. O ícone ocupa 32dp dentro do disco, preservando a proporção
anterior. Ouvindo/processando/atenção mantêm fundos próprios e a mesma forma
circular, portanto o feedback de estado não foi sacrificado.

Arquivos principais: `grana_voice_fundo_gradiente.xml`,
`grana_voice_widget.xml`, `ic_grana_voice_mic.xml`, `colors.xml` e
`GranaVoiceWidgetProvider.kt`. A exceção do gradiente foi registrada em
`DESIGN.md`: no launcher, o widget funciona como extensão do ícone da marca.
Nenhuma build ou alteração de versão foi feita.

### Publicação confirmada em 05/09/2026

Com token temporário fornecido pelo autor, `processar-lancamento-voz` foi
publicada com sucesso via `supabase functions deploy --use-api`. A pendência
de autenticação/publicação acima está resolvida. O token foi usado apenas no
ambiente do processo, sem ser salvo em arquivos do projeto.

Verificação remota: OPTIONS retornou 204 com cabeçalhos CORS; POST sem
Authorization continuou recusado com 401 pelo gateway. A transcrição real e
a gravação em aparelho ainda precisam de validação; a correção nativa requer
novo APK. Nenhuma build EAS foi disparada.

## Sessão de 05/09/2026 — janelas de horário nos lembretes (almoço + noite)

O autor pediu uma segunda janela de lembrete de hábito, no horário de
almoço (11h-13h, pensando no funcionário CLT), acreditando que já existia
uma janela "da noite" dedicada. Duas explorações de código confirmaram que
não é bem assim: **hoje existe um único horário de lembrete por dia**
(19h/20h30/21h30, escolhido em Perfil) — "fim de semana" já influencia o
TOM da mensagem (categoria `fim_de_semana`), mas nunca gerou um envio a
mais, e "noite" (`noturno_humor`) sempre foi só um rótulo de categoria,
nunca filtrado por horário de verdade. Os dois documentos pedidos:
`docs/notificacoes/2026-09-05-estado-atual.md` (o que já existe, em
detalhe) e `docs/superpowers/specs/2026-09-05-janelas-notificacao-design.md`
(o desenho aprovado da solução).

**Decisões do autor**: almoço dispara só em dias úteis (seg-sex, fixo às
12h, não configurável — mesmo espírito dos lembretes de conta); sem
terceiro envio dedicado a fim de semana (o tom de fim de semana passa a
valer pra qualquer uma das duas janelas que cair em sexta/sábado/domingo,
sem lógica nova); categoria `almoco` nova no catálogo com **9 mensagens**
(uma a mais que as outras, pedido explícito), tom descontraído/brincalhão.

**Implementado**:
- `lib/notification-catalog.ts`: categoria `almoco` (9 mensagens, 57 no
  catálogo total), tipo `JanelaLembrete`, `selecionarMensagem` ganhou
  parâmetro `janela` que só decide o pool geral de fallback (prioridade
  saudade/fim-de-semana/streak continua idêntica e compartilhada).
- `supabase/functions/_shared/push-habit.ts`: `ehDiaUtil`,
  `chegouHorarioAlmoco` (reaproveita `chegouHorario` com 12h/0min fixos);
  `chaveColapsoEntrega` ganhou `janela` no colapso — sem isso, almoço e
  noite no mesmo dia colapsariam uma notificação por cima da outra no
  Android/iOS.
- `supabase/functions/enviar-lembretes-habito/index.ts`: itera as 2
  janelas por token (`janelasVencidas`), cada uma com seu próprio
  upsert/mensagem.
- Schema: `push_tokens.almoco_ativo` e `push_habit_deliveries.janela`
  (migration `20260905140000_janelas_notificacao.sql`, espelhada como
  `alter table` ao FINAL do baseline em `schema.sql` — não embutida na
  lista de colunas do `create table`, seguindo o padrão já usado no
  resto do arquivo). Constraint única virou
  `unique(expo_push_token, data_local, janela)`.
  `reivindicar_entregas_push_habito` não precisou mudar (`returning
  d.*` já propaga a coluna nova sozinho).
- Cliente: `NotifPrefs.almocoAtivo` (default true), toggle novo em Perfil
  ("Lembrete na hora do almoço"), `planejarLembretesHabito`/
  `scheduleDailyHabitReminder` agendam as duas janelas (fallback local
  pula sábado/domingo pra almoço), `sincronizarInterno` sobe
  `almoco_ativo` pro `push_tokens`.

**Achado durante a implementação, não previsto no plano**: o guarda de
schema (`corpus-schema-guardas.ts`) comparava o segmento inteiro de
`push_tokens`→`voice_operations` contra UM arquivo de migration só. Minha
primeira tentativa embutiu as colunas novas dentro do `create table`
(errado — quebrou o guarda E destoava do padrão real do arquivo, que
sempre acrescenta `alter table ... add column` depois, nunca embutido).
Corrigido nos dois lados: revertido pra `alter table` solto no fim do
bloco, e o guarda ganhou um terceiro segmento
(`inicioJanelas`→`inicioVoz`) comparado contra a migration nova. Um bug
à parte no próprio guarda novo: a âncora de busca usava um `\n` cru no
meio da string — `schema.sql` está em CRLF, então nunca batia; trocado
por uma âncora de uma linha só.

`npx tsc --noEmit` limpo; `npm run test:parser` 100% (327/327 design
system, 35/35 notificações — incluindo os casos novos de almoço pulando
fim de semana, as duas janelas não colidindo de id/chave de colapso, e
sexta produzindo tom de fim de semana nas duas —, 24/24 guardas de
schema); `deno check` limpo na Edge Function.

**Pendente**: aplicar a migration em produção e publicar a Edge Function
atualizada (precisa de token/acesso explícito do autor, mesmo padrão de
sempre — não feito nesta sessão). Nenhuma build EAS disparada.

---

## Sessão 05/09/2026 (tarde) — barra de 7 destinos, Granabô e correções de Expo Go

### Barra de navegação

A barra flutuante passou de 5 para 7 destinos, nesta ordem: Início ·
Débito e Pix · Crédito · **Granabô** · Boletos · Gráficos · Desafios. O
Granabô fica no centro exato (4º de 7) com botão elevado — disco de menta
sólida de 74px numa barra de 68, transbordando 3px em cima e embaixo. O
limite de 5 abas nunca foi restrição do React Navigation: a barra é 100%
desenhada em JS (`FloatingTabBar`), então era só largura. Gráficos voltou
pra barra (era desktop-only e no celular não tinha ponto de acesso
nenhum, um destino inalcançável); Perfil segue fora, no avatar do
cabeçalho. `MARGEM_MINIMA` do `lib/tab-bar.ts` subiu de 30 pra 46 por
causa do transbordo do disco.

### Blur da barra: duas causas, não uma

O desfoque nunca borrou nada, e foram dois defeitos somados:

1. O container tinha `backgroundColor` semiopaco **e** a camada de vidro
   repetia o mesmo tom por cima — juntas davam ~88% de opacidade. O
   desfoque existia e não tinha o que mostrar. O tom passou a morar numa
   camada só (`styles.vidro`), que também recorta a pílula — o que
   permitiu `overflow: visible` no container, sem o qual o disco elevado
   seria cortado.
2. **A causa raiz de verdade**: o `BlurView` lê `blurTarget.current` no
   próprio `componentDidMount`, mas ele é *descendente* do
   `BlurTargetView`, e o React preenche ref de filho antes do de pai. Na
   hora em que ele lia, o ref do ancestral ainda era `null`. Como ref não
   dispara render, nada nunca o fazia reler: ia `blurTargetId: undefined`
   pro nativo, e o Kotlin cai pra `BlurMethod.NONE` em silêncio
   (`val safeMethod = if (blurTarget != null) method else NONE`). A
   correção é passar a prop como `null` primeiro e o ref depois: é a
   mudança de IDENTIDADE da prop que dispara o `componentDidUpdate` a
   reler o alvo.

### Expo Go: expo-notifications derrubava o app inteiro

Rodar em Expo Go quebrava na raiz. O Expo Go do SDK 53+ removeu o módulo
nativo de push no Android, e o pacote carrega, ao ser importado, um
arquivo de efeito colateral (`DevicePushTokenAutoRegistration.fx.js`) que
registra um listener e lança — de forma assíncrona, fora do escopo do
`try/catch` que já existia em volta do `require`.

Corrigido com um guard de ambiente (`Constants.appOwnership === 'expo'`,
o único sinal que separa Expo Go de dev-client: `executionEnvironment`
marca os dois como `storeClient`) em `getNotifications()`, mais a
eliminação de **dois** imports estáticos que furavam esse guard:
`components/RespostaVozWidget.tsx` e `lib/widget-voz-notificacoes.ts`
importavam `expo-notifications` no topo do arquivo. Ambos passaram a
`import type` + `getNotifications()` lazy. Varredura confirmou que não
sobrou nenhum import cru no repositório.

### Assistente Granabô

Implementado o que o plano de
`docs/assistente-ia/2026-09-05-plano-assistente-zero-custo.md` desenhou:
`supabase/functions/assistente-financeiro/index.ts` (Groq
`llama-3.1-8b-instant`, tool calling em duas passadas, auth por JWT do
usuário com RLS natural, rate limit em memória, degradação graciosa no
429), `lib/assistente.ts`, `app/(app)/assistente.tsx` (chat real) e a
migration `20260905160000_assistant_messages.sql`.

**Correção feita na revisão**: `gastoPorCategoria` usava
`.ilike('category', categoria)`, casamento exato. Um nome que o modelo
inventasse ("Comida" quando a categoria se chama "Alimentação") não casava
com linha nenhuma, a soma dava zero, e o assistente afirmaria "você gastou
R$ 0,00" com toda a confiança — a mentira exata que o desenho com
ferramentas existe pra impedir. Agora a ferramenta resolve o nome contra
as categorias REAIS do usuário (sem acento, case-insensitive, com
casamento parcial) e, quando não acha, devolve a lista real e manda o
modelo perguntar em vez de inventar. Zero só pode ser dito quando a
categoria existe e não teve gasto.

`schema.sql` foi espelhado com a migration nova e o guarda ganhou um
quarto segmento (`inicioVoz`→`inicioAssistente`): 25/25.

**Aplicado em produção**: só a migration (tabela criada, RLS ligado, 1
policy `auth.uid() = user_id` em ALL, 2 índices — verificado por
introspecção e por teste de isolamento ao vivo). A Edge Function **não**
foi publicada, por escolha explícita do autor.

### Pendências

- **Lançamento por voz falha em Expo Go.** A Edge Function foi testada
  direto com JWT real e um `.m4a` montado à mão: o servidor está
  íntegro (autentica, aceita o MIME, chega no Whisper, devolve
  `nao_entendi` pra áudio mudo). A falha é do lado do cliente. Ficaram
  logs `[voz:diag]` (guardados por `__DEV__`) nos quatro pontos de falha
  de `lib/voz.ts` e `components/VoiceEntryButton.tsx` — **remover quando
  a causa for encontrada**.
- Publicar a Edge Function `assistente-financeiro` (o app já chama; até
  lá o chat responde erro).
- Confirmar o blur no aparelho.
- Nenhuma build EAS disparada.

## 05/09/2026 — Correção da árvore do blur da barra (Codex)

- Diagnóstico confirmado no código: o BlurTargetView envolvia todo o Tabs, incluindo o BlurView da própria barra. O README da versão 3.1.0 do Dimezis proíbe explicitamente um alvo conter o BlurView que o amostra: https://github.com/Dimezis/BlurView/blob/version-3.1.0/README.md. Isso é um defeito concreto e uma explicação plausível para o crash relatado; sem logcat, não é confirmação da causa exclusiva.
- Agora screenLayout envolve somente o conteúdo de cada rota com components/TabBlurTarget.tsx. A barra e o Granachat ficam fora dos alvos. O alvo é registrado após onLayout; a barra recebe apenas o da rota ativa, com identidade imutável. Não restaurar o alvo ancestral do navegador.
- components/TabBarBlur.tsx desmonta a captura com a trava ainda não pronta, bloqueada ou AppState inativo. Aguarda dois frames após retomada/troca de alvo, cancela callbacks na saída e não reutiliza uma captura pronta para outro alvo. Método Android dimezisBlurView, intensidade 80, redução 4; véu petróleo reduzido de 45% para 28%. iOS mantém blur nativo e web mantém backdrop-filter.
- npm run test:blur cobre os hooks reais com AppState/frames simulados: ausência/troca de alvo, bloqueio, retomada, evento active repetido e cleanup. Integrado ao CI. TypeScript passou. Testes JS NÃO validam RenderNode, Activity ou sensor biométrico.
- Sem adb/Java disponíveis nesta sessão; nenhum APK/EAS build disparado. Validação física pendente: em Android instalado, rolar texto/gráfico atrás da barra; trocar todas as abas; bloquear/desbloquear por digital repetidamente; cancelar digital e tentar novamente; voltar de segundo plano curto e >30s; testar início frio e logout/login. Observar blur em movimento e ausência de fechamento; coletar logcat se falhar. Testar API <31 e >=31, pois a biblioteca usa caminhos nativos diferentes.
- Preservadas as alterações que já estavam no workspace antes desta correção (Granachat, retirada da rota assistente e ajustes relacionados). Elas não foram produzidas como parte do diagnóstico do blur.
- Validação final: tsc, test:blur, test:voz e toda a suíte test:parser passaram. O harness de voz precisou declarar __DEV__: false para acomodar os diagnósticos de desenvolvimento já adicionados anteriormente ao cliente; sem alteração no fluxo de voz.

## 05/09/2026 — Ajuste visual do vidro após feedback
- Usuário aprovou o resultado visual e pediu menor desfoque para reconhecer melhor o fundo. Intensidade nativa 80 → 45; véu petróleo 28% → 18%. Na web, blur 24px → 14px e véu 55% → 38%. Ciclo de vida e alvos preservados. Preview pelo Metro existente.
- Push continua pendente: rejeição anterior abrangia o commit preexistente 1e542ce; este ajuste não autoriza publicar aquele escopo.

## 05/09/2026 — Retomada da landing após 09c822d (Codex)

Concluído o item D restante do plano do Claude: captura `public/telas/inicio-web.png` 1440×900 com dados de exemplo; as cinco mobile já estavam prontas. Balões reposicionados em 33% após medir títulos em y=245. QA de landing em 390, 1060 e 1440px.
Revisão: conta da demo do Granachat corrigida (624/13=48), identificação visível de exemplo, removida promessa absoluta de IA, preço do documento de copy alinhado a 9,90 e condição de cancelamento não confirmada retirada da landing. Metadados não anunciam mais WhatsApp; CSP do JSON-LD acompanha a descrição. Capturas têm versão na URL para renovar cache.
TypeScript e suíte parser passaram. Relatório completo e próximas melhorias: `docs/marketing/2026-09-05-retomada-e-revisao-landing.md`.
Pendente operacional: em produção os dois CTAs Assinar ainda levam a /sign-up; local aponta à Kiwify e checkout aberto confirmou R$9,90/mês. Configurar EXPO_PUBLIC_KIWIFY_CHECKOUT_URL em Production na Vercel e redeployar; painel/CLI autenticada indisponíveis nesta sessão. Nenhuma compra/webhook simulado nem EAS disparado. Conquistas-web.webp não precisa recaptura: foi substituída por inicio-web.png.
- Exportação web e injeção de SEO/JSON-LD concluídas; hash CSP validado. As seis imagens versionadas carregaram no navegador.

## 05/09/2026 — "Ver detalhes" no mobile e checkout Kiwify resolvido em produção

**"Ver detalhes" nos cards de benefício (`b7a71f8`)**: medido ao vivo com `agent-browser` em 390px — as 9 categorias de `BeneficiosHorizontais.tsx` cortavam o texto na 3ª linha (63px de altura útil contra 105–218px de texto real), não era caso raro. Adicionado link "Ver detalhes" só no modo compacto (bento/desktop já mostram o texto inteiro), abrindo `components/Sheet.tsx` com o texto completo. Altura do card compacto subiu de 300 para 328px pra caber o link sem clipar. Verificado: abre com texto completo, fecha ao tocar fora, não aparece no bento nem no modo fixo.

**Checkout Kiwify — resolvido em produção**: o autor configurou `EXPO_PUBLIC_KIWIFY_CHECKOUT_URL` na Vercel (Production) e redeployou. Confirmado por mim em duas camadas: (1) o bundle publicado (`index-1bad07e...js`) contém a URL real `https://pay.kiwify.com.br/GLhaFCy`; (2) clique real na página ao vivo navegou pra esse domínio e mostrou o checkout de verdade (produto "Grana.", R$ 9,90/mês, Cartão/Boleto/Pix). Item fechado — nenhuma pendência restante na landing desta rodada. FAQ de cancelamento/renovação continua parada: autor respondeu "não sei ao certo, precisa confirmar antes" com a Kiwify.

## 06/09/2026 — Granabô: qualquer período, ferramenta genérica e aprendizado com o uso

Pedido do autor, motivado por um print onde o Granabô recusou "quanto gastei em transporte em maio de 2026?" (só sabia responder sobre o mês corrente) e pelo pedido explícito de um assistente que "aprenda sozinho a responder suas perguntas sem eu precisar dizer aqui". Implementado em três fases, cada uma commitada e publicada separadamente:

- **Fase 1 (`6ccd5c5`)**: `resolverPeriodo()` substitui `janelaDoMesCorrente()` — entende janela móvel ("últimos 15 dias"), mês fechado, ano inteiro e intervalo explícito. Ferramenta nova `consultarLancamentos`: o modelo monta a especificação (categoria/cartão/carteira/descrição/valor/parcelado/recorrente + somar/contar/média/listar/maior/menor + agrupamento), o servidor executa contra whitelist fechada, nunca SQL do modelo. Corrigida a descrição de `gastoPorCategoria` que listava 6 categorias de exemplo e fazia o modelo tratá-las como A lista de categorias existentes.
- **Fase 2 (`0aa030a`)**: seis ferramentas novas (`resumoMetas`, `comprometimentoFuturo`, `alertaDeLimiteCartao`, `perfilFinanceiro`, `retrospectivaDoMes`, `resumoScoreERitmo`), cada uma reaproveitando fórmula já testada em `lib/` (projections.ts, creditLimitAlert.ts, monthly-wrapped.ts, gamification.ts), verificadas contra as originais com dados sintéticos extraídos via esbuild. Achado relevante: `resumoScoreERitmo` replica o recorte REAL que `app/(app)/desafios.tsx` usa em produção (últimos 45 dias, boletos só `status='due'`) pra bater com o que a aba Desafios já mostra — isso significa que o fator "Contas acompanhadas" só vale 200 quando não há boleto due nenhum, e 0 caso contrário (não é bug do port, é o comportamento real hoje; vale revisar isso na tela em outra rodada).
- **Fase 3 (`6fc09a2`)**: tabela `assistant_memory` (migration `20260906120000_assistant_memory.sql`) com RLS, guardando `vocabulario`/`exemplo`/`fato`. Duas funções SQL (`buscar_exemplos_similares` via pg_trgm, `registrar_memoria_assistente` upsert com incremento de `usos`). Quatro mecanismos: `casarNomeComMemoria` (memória antes do casamento difuso; difuso ensina a memória); `naoConsegui(motivo)` registrado em `assistant_messages.ferramenta_usada` (sem tabela nova); `lembrarFato` (só o que o usuário afirmou); e "aprender com os acertos" (few-shot dos exemplos mais parecidos via similaridade de trigrama). Achado no meio do teste: o casamento difuso só reconhece trecho de texto, nunca sinônimo de verdade ("comida" não é trecho de "Alimentação") — ferramenta nova `ensinarApelido` deixa o próprio modelo (que entende semântica) ensinar essa correspondência, confirmando que o nome real existe antes de gravar.

Publicado em produção (migration aplicada via Management API, função via `supabase functions deploy --use-api`, token temporário do autor, nunca persistido). Verificação: `tsc`/esbuild limpos, `npm run test:parser` 100% (guarda de sincronia schema/migration estendido pra 5ª migration), sonda HTTP confirmando 401 sem auth (JWT continua validado). Nenhuma build EAS.

**Teste ao vivo em produção (conta `gbr.design30@gmail.com`) revelou dois problemas reais, os dois corrigidos e publicados na mesma rodada:**

1. **`gemini-3.8-flash` tem RPD (requisições/dia) = 20 no free tier deste projeto** — confirmado no painel `aistudio.google.com/rate-limit`, mesmo valor de toda a linha "Flash" não-Lite (3.5/3.6/3.7/3.8). Como cada pergunta gasta 2 chamadas (tool-calling + follow-up), isso sustenta ~10 perguntas/dia pro app INTEIRO — estourou no meio da própria bateria de teste (`502`/`429` "Quota exceeded... RequestsPerDayPerProjectPerModel-FreeTier"). As variantes "Lite" (3.1 e 3.5) têm RPD=500/RPM=15, 25x mais. Trocado pra `gemini-3.5-flash-lite` (`a53d432`), publicado e testado — funcionando.
2. **"Aprender com os acertos" reforçava exemplo errado**: perguntar "quanto gastei com mercado em junho de 2026?" fez o modelo passar `categoria: "mercado"` literal (não resolve — não é o comportamento do modelo entender sinônimo sozinho, é inconsistente: "comida"→"Alimentação" às vezes resolve sozinho, "mercado" não), a ferramenta corretamente pediu esclarecimento, mas o código gravava isso como exemplo de sucesso mesmo assim (só checava se não jogou exceção). Corrigido (commit seguinte): mensagens que começam com "Não existe " (nome não resolvido) ficam de fora do reforço. Linha ruim já gravada foi apagada do banco. Confirmado ao vivo: a mesma pergunta não grava mais nada de errado.

Bateria completa testada ao vivo e correta: a pergunta original do print (R$ 0,00 real, sem travar no mês corrente), sinônimo de categoria (parcialmente resolvido pelo próprio modelo, inconsistente — ver achado 2), `retrospectivaDoMes` em mês vazio (agosto sem lançamento, resposta correta), `consultarLancamentos` com `operacao=maior` e `ano_inteiro`, `resumoScoreERitmo` (score 200, streak 0 — bate com a conta ter só lançamentos de mais de 45 dias atrás), `resumoMetas`/`alertaDeLimiteCartao` em conta sem meta/cartão, `naoConsegui` (pergunta fora de escopo) e `lembrarFato` (fato persistido e confirmado no banco).

**Pendência resolvida na mesma sessão (`f08e28b`)**: `CATEGORY_KEYWORDS` (o dicionário sinônimo→categoria do whatsapp-webhook: "mercado", "ifood", "uber", "netflix"... → categoria real) foi extraído pra `supabase/functions/_shared/category-keywords.ts` (mesma convenção já usada por `finance-command.ts`/`voice-transcription.ts`) e passou a ser importado — não copiado — por ambas as Edge Functions. `casarNomeComMemoria` ganhou um terceiro estágio determinístico entre a memória pessoal e o casamento difuso. Os três corpora de teste do WhatsApp que extraíam essas funções do arquivo real (`corpus-consulta.ts`, `corpus-categorias-custom.ts`, `corpus-whatsapp-gerado.ts`) e o `sync-parser.js` foram atualizados pra ler do novo local — confirmados 100% (incluindo o corpus gerado de 34093 casos). Publicado nas duas funções e confirmado ao vivo: "mercado" e "comida" agora resolvem pra "Alimentação" de forma determinística, na primeira pergunta, sem depender do modelo acertar sozinho.

## 06/09/2026 — Correções após auditoria visual da landing
Mock financeiro calculado a partir dos valores fictícios; detalhes de benefícios em Modal de viewport com fechamento; alvos de 44px; preço antes do checklist mobile; menu no cabeçalho desktop; Granabô e hero mais concisos; carrossel inicial em Desafios; legendas do painel fora da captura e link de ampliação; bento preservado com movimento reduzido; caminho sticky impossível removido. Trilha alinhada à voz no app. Relatório e limites: docs/marketing/auditoria-visual-2026-09-06/CORRECOES.md. TypeScript, 339 guardas de design e exportação web passaram. Sem EAS. Melhorias editoriais/arte e validação em aparelho permanecem documentadas.

## 06/09/2026 — Landing: revisitar alterações com o autor

Pedido explícito após visualizar o preview: deixar as modificações registradas no contexto porque será necessário revisitar e alterar algumas coisas. **A implementação atual não representa aprovação visual definitiva.** Manter o estado atual até o autor indicar os ajustes; não reverter nem executar automaticamente as demais propostas da auditoria.

- Referência da rodada: commit `0766bd7` (`fix: corrige hierarquia e interacoes da landing`). Base anterior para comparação: `a39c680`.
- Auditoria original, com 20 achados e capturas: `docs/marketing/auditoria-visual-2026-09-06/RELATORIO.md`.
- Implementação e pendências discriminadas: `docs/marketing/auditoria-visual-2026-09-06/CORRECOES.md`.
- Mudanças visuais/editoriais a recuperar na conversa: título e apoio do hero; introdução do Granabô; preço antes do checklist mobile; menu desktop no cabeçalho; detalhes em modal com fechar; alvos maiores; carrossel começando em Desafios; substituição dos balões por legendas abaixo do painel com link de ampliação; fechamento com preço mensal.
- Correções técnicas da mesma rodada: cálculo coerente do mock financeiro, bento preservado com movimento reduzido e retirada do caminho sticky inalcançável.
- O autor ainda não especificou quais elementos deseja alterar. Na retomada, comparar o preview com a versão anterior e receber o direcionamento sobre os pontos concretos; não presumir reprovação de todas as mudanças nem aprovação das sugestões restantes.
- Esta atualização é somente documental: nenhum novo ajuste na landing foi realizado.

## 06/09/2026 — Três bugs encontrados testando a build 1.5.0 no aparelho — NÃO corrigidos, registrados pra próxima sessão

O autor instalou a build 1.5.0 e testou ao vivo. Três problemas reais, nenhum corrigido nesta sessão (pedido explícito: só registrar e encerrar):

1. **Gráficos → Despesas → Mês a Mês: rótulos de data do eixo X sobrepostos e ilegíveis** ("Jun/05/25/25/07/25/25/20/26/20/26/07/06/25/26/26/06/26"). Componente: `components/LineAreaChart.tsx`, usado por `app/(app)/graficos.tsx`. Provável falta de espaçamento/rotação dos rótulos em largura real de celular.

2. **Nome da carteira sumiu do seletor** (topo direito das telas principais). `components/WalletPill.tsx` já tem esse comportamento DE PROPÓSITO (`ehCompacto` oculta o texto, mantendo bolinha+chevron+área de toque+accessibilityLabel — decisão de uma rodada anterior). O que precisa ser conferido na próxima sessão: (a) se o breakpoint `ehCompacto` está dando falso positivo na largura real do aparelho do autor, ou (b) se o autor, vendo ao vivo, quer reverter a decisão de ocultar o nome mesmo em compacto. Não presumir nenhuma das duas — perguntar.

3. **Lançamento por voz continua falhando** ("Não deu para transcrever — Algo falhou ao processar o áudio"). Já era pendência conhecida antes desta sessão (logs `[voz:diag]` instalados em `lib/voz.ts`/`components/VoiceEntryButton.tsx`, causa ainda não encontrada). Sem novidade nesta sessão além de confirmar que persiste na 1.5.0.

4. **Granabô respondeu com erro genérico do servidor pra uma pergunta real no aparelho**: "Algo deu errado do meu lado. Tenta de novo." — essa frase exata é o catch-all `erro_interno` (500) de `supabase/functions/assistente-financeiro/index.ts:1682`, ou seja, uma EXCEÇÃO NÃO TRATADA aconteceu de verdade no servidor pra uma pergunta de período (mês passado / maio de 2026) na conta real do autor — diferente da conta de testes usada nesta sessão, que respondeu esses mesmos tipos de pergunta corretamente via curl. Tentei puxar o stack trace exato dos logs (`function_logs`/`function_edge_logs` via Management API) e as duas tabelas já tinham zerado (retenção curta, o tempo entre o teste do autor e esta investigação foi suficiente pra expirar). **Próxima sessão: reproduzir a mesma pergunta com a conta do autor e puxar o log NA HORA, antes de expirar** — sem o stack trace, a causa raiz continua desconhecida; não presumir qual parte do código quebrou.

Nenhuma dessas quatro coisas foi tocada nesta sessão. Todo o código já commitado e publicado (Granabô fases 1-3 + correções + build 1.5.0) permanece como estava — este bloco é só registro de teste, sem alteração de código.

## 06/09/2026 (continuação) — os quatro bugs da 1.5.0 corrigidos, versão 1.5.1 preparada (build NÃO disparada)

Retomando o registro do bloco anterior, o autor mandou 4 screenshots com os mesmos bugs (mais um: widget de lançamento levando a tela preta) e pediu correção urgente, incluindo testar responsividade geral com a conta de testes (`gbr.design30@gmail.com`). Três dos quatro (achados 1, 2/3 do widget e 3 da voz) tinham WIP não commitado do Codex — revisado linha a linha antes de aplicar, não aceito às cegas.

- **Rótulos do gráfico sobrepostos**: corrigido em `lib/chart-labels.ts`/`components/LineAreaChart.tsx`. Testado com 7 cenários em Node antes de aceitar.
- **Widget "Central de Lançamentos" abrindo em tela preta/Unmatched Route**: faltava `app/+native-intent.tsx` (convenção do Expo Router pra reescrever a URL de deep link ANTES do roteamento tentar casar a rota) e as alturas do `grana_central_widget.xml` usavam `match_parent`, que `RemoteViews`/AppWidget host não mede de forma confiável — trocado por `dp` explícito.
- **Lançamento por voz continuava falhando**: causa raiz confirmada lendo o source do `expo`/`expo-file-system` — o serializador multipart do `expo/fetch` aceita qualquer objeto com `.bytes()` chamável, mas lê `.name`/`.type` diretamente do objeto (não via `instanceof`); a classe `File` do `expo-file-system` tem getter `.name` (mas devolve o nome do arquivo TEMPORÁRIO, derivado do path, não o nome semântico que o chamador queria) e **não tem getter `.type` nenhum** — o campo ia sempre `undefined` pro servidor. Corrigido em `lib/voz.ts`.
- Todo o WIP revisado foi commitado junto (`7abf355`), com uma ressalva registrada na própria mensagem: um achado de auditoria anterior (`podeFixar(tipo)` em `modules/grana-voice-widget/index.ts` supostamente com parâmetro morto) foi conferido e estava ERRADO — o parâmetro é usado de verdade em `app/(app)/perfil.tsx:327`. Não foi aplicado.
- **Lentidão geral (item 8)**: causa raiz é `app/(app)/index.tsx` rebuscando o histórico inteiro de transações (`fetchTransactions()` sem `sinceDays`) toda vez que a tela ganha foco (`useFocusEffect`), inclusive em focos que não mudaram nada relevante (voltar de outra aba, fechar um modal). Corrigido (`b228f5c`): `carregarDadosLeves()` — busca boletos/orçamentos/cartões/metas/XP, sem tocar em transações — roda nos focos repetidos; a busca completa (`load()`, com `fetchTransactions()`) só roda na troca real de modo demo↔real. Um `useRef` (`ultimoModoCarregadoRef`) decide qual dos dois rodar. Sete handlers que só mexem em boleto/orçamento/meta passaram a chamar `carregarDadosLeves()` em vez de `load()`; os que mexem em transação (nova, exclusão, colar comprovante, QR, importar CSV) e o pull-to-refresh continuam com `load()` completo. Verificado ao vivo com `agent-browser`: instrumentado `window.fetch`, navegado entre abas várias vezes, confirmado que a query irrestrita de transações não dispara mais nos focos repetidos. `IMPECCABLE_AUDIT.md` atualizado (`96a6d51`) — o achado P2 vira "parcialmente corrigido": Início resolvido, Gráficos nunca teve o padrão, `app/(app)/lancamentos.tsx:267` ainda tem o mesmo `useFocusEffect(() => load())` sem partição e fica candidato em aberto pra outra rodada.
- **Versão subida pra 1.5.1** via `npm run build:preparar` (`db3a3fa`), nota: "Corrigidos os rótulos sobrepostos do gráfico mensal, o widget Central de Lançamentos que abria em tela preta, e a transcrição de lançamento por voz, no app e no widget." **Build EAS NÃO disparada** — pedido explícito do autor ("não dispare build ainda"), regra permanente também.

## 06/09/2026 (continuação) — carteiras: nome sumindo do seletor (causa raiz errada da vez passada) e sem editar/excluir

Autor voltou com dois problemas novos de carteiras, com instrução explícita de ordem: terminar a otimização (acima) primeiro, resolver isso depois — Granabô ("ainda com problemas para responder", sem detalhe novo) fica pra depois disso.

1. **Botão da carteira sem nome, em algumas telas**: a pendência registrada no bloco de 06/09 acima (`ehCompacto` oculta o nome, achado de rodada anterior) recebeu, nesta sessão, uma primeira tentativa equivocada — um limiar por tamanho do título da tela (`LIMIAR_TITULO_LONGO`), calibrado por estimativa de pixels sem medir o layout real. O autor testou no aparelho e reportou que "algumas telas" (as de título longo — Lançamentos, Contas a pagar) continuavam sem o nome. Investigando de novo, achei a causa raiz de verdade em `components/ScreenHeader.tsx`: o cabeçalho **já** resolve essa disputa por espaço do lado dele — `right` (onde a pílula mora) tem `flexShrink: 0` (nunca encolhe) e o título tem `numberOfLines={2}` (quebra em duas linhas, ou elide como último recurso, ANTES de tirar espaço da pílula). Ou seja: a pílula nunca deveria esconder o nome por causa do título — isso já estava resolvido em outro lugar, e o `ehCompacto` (depois o limiar por título) era um remendo resolvendo um problema que não existia mais. `components/WalletPill.tsx` voltou a mostrar o nome sempre, sem condição nenhuma; removida a dependência de `useBreakpoint` e o prop `titulo` (e as 6 chamadas em `index.tsx`/`lancamentos.tsx`/`contas.tsx`/`credito.tsx`/`desafios.tsx`/`graficos.tsx` que o passavam).
2. **Sem editar/excluir carteira**: `lib/wallets.ts` já expunha `updateWallet`/`deleteWallet` havia tempo, mas `components/WalletPickerModal.tsx` só tinha fluxo de criar/selecionar. Adicionados lápis (edita nome/saldo inicial/cor, reaproveitando o mesmo formulário da criação) e lixeira (exclui, com confirmação — bloqueada só na carteira padrão, `is_default`, já que é ela quem recebe lançamentos sem `wallet_id`; FKs em `transactions`/`bills`/`goals`/`credit_cards` são `on delete set null`, então excluir uma carteira não-padrão é seguro). Guarda de modo demo igual à que já existia na criação (ação simulada, sem chamar o Supabase). `WalletContext` já tinha uma rede de segurança pra carteira ativa excluída (cai pra `'total'` sozinho quando o id não existe mais na lista) — não precisou de mudança.
   - Achado ao testar ao vivo: editar/excluir dispara `refreshSaldos()` pela primeira vez nesta tela (o fluxo de criação original nunca chamava), e isso revelou o saldo LIFETIME real da conta de testes (~-R$1.800, bem diferente do "Saldo atual" de R$0,00 que a Início mostra — aquele é só o fluxo de caixa do mês corrente, este é o consolidado com todo o histórico). Não é bug, são duas métricas diferentes por design (ver `lib/safe-to-spend.ts`).
   - Commit único (`4905ed2`), `tsc --noEmit` e `npm run test:parser` (312/312 guardas de design system + resto) passaram. Verificado ao vivo com `agent-browser` + conta de testes: nome aparece em tela curta (Crédito) e longa (Contas a pagar); criar/renomear/excluir carteira funcionam fim a fim (excluir usa `window.confirm` na web — `agent-browser dialog accept` resolve o dialog nativo que bloqueia a página).

**Pendente (na hora)**: Granabô "ainda com problemas para responder" (queixa do autor, sem novo detalhe) — investigação começada e interrompida por instrução explícita de priorizar o trabalho acima. Resolvida na continuação da mesma sessão, ver bloco abaixo. Build EAS não disparada nesta sessão nem na anterior; quando o autor pedir, cobre 1.5.1 (rótulos/widget/voz/performance) + esta rodada (carteiras).

## 06/09/2026 (continuação) — Granabô: causa raiz real era o modelo sobrecarregado, não rede

Retomando a pendência acima. `chamarLLMComRetry` (novo, em `supabase/functions/assistente-financeiro/index.ts`) tenta repetir a chamada ao Gemini uma vez em falha transiente (429/5xx/timeout) — publicado (`8aa6c8b`) e testado ao vivo com a conta de testes: a MESMA pergunta que devia funcionar falhou nesse teste, 42.7s, HTTP 502.

Puxado o log fresco na hora (retenção curta confirmada de novo) e a causa apareceu sem ambiguidade: primeira tentativa estourou os 30s de timeout, a segunda (a repetição) voltou com **503 "This model is currently experiencing high demand"** — sobrecarga real do `gemini-3.5-flash-lite`, não rede nem bug. Repetir o MESMO modelo 600ms depois tinha baixa chance de ajudar nesse cenário. Corrigido (`b8b5a82`): a repetição agora troca pra `gemini-3.1-flash-lite` (`MODELO_FALLBACK`) — mesmo teto do free tier (RPD 500/RPM 15), backend independente. Publicado e testado ao vivo: a mesma pergunta que falhou em 42.7s passou a responder em 8.6s; mais três perguntas variadas (score, período móvel, ranking) responderam em 2-4s cada.

Achado incidental do próprio autor, testando no aparelho de verdade (conta real, não a de testes): duas perguntas seguidas sobre categorias diferentes no mesmo mês tiveram tempos bem diferentes (uma rápida, outra mais lenta). Conferido que `gastoPorCategoria` filtra direto no banco por categoria+período (`supabase.from('transactions').select('amount').eq('category', ...).gte(...).lte(...)`) — não é scan da conta inteira, então a variação não é o volume de lançamentos. É a variância normal do Gemini free tier (às vezes cai no modelo principal rápido, às vezes precisa do retry+fallback) — esperado, não bug.

## 06/09/2026 (continuação) — flash de tela branca ao trocar de aba

Autor reportou flash branco rápido na troca de aba, "depois das solicitações de ajuste em motion". Rastreado até `components/CenaAnimada.tsx`, introduzido em `3d517ae` — commit cuja própria mensagem já registrava "o motion visual desta entrega NÃO foi aprovado pelo autor e será refeito", pendência que ficou sem retomada até agora.

Causa: o componente anima `opacity` de 0 a 1 (180ms) na MESMA `Animated.View` que envolve a tela inteira, sem fundo próprio. Nenhuma das 6 telas de aba pinta fundo escuro no PRÓPRIO container raiz por precisar — sempre bastou a opacidade ser 1 o tempo todo. Com a nova animação, o fundo escuro de cada tela desbota junto com o conteúdo, revelando por baixo o fundo claro padrão do navigator durante a transição — o flash. Confirmado que as 6 telas (`index`/`lancamentos`/`contas`/`credito`/`graficos`/`desafios`) usam `theme.paper` (`#052229`, mesma cor do `backgroundColor` nativo em `app.json`) no próprio container, o que valida esse como o tom correto do fundo que faltava.

Corrigido (`1437506`): fundo sólido `theme.paper` numa `View` de FORA, nunca animada; a `Animated.View` com `opacity`/`translateX` fica por dentro, sem fundo próprio — só o conteúdo desbota, nunca o que está atrás. `tsc` e `test:parser` passaram; verificado sem regressão visual na web via `agent-browser` (a confirmação definitiva do flash em si só é possível em aparelho Android, onde foi reportado).

**Versão preparada**: 1.5.1 → **1.6.0** via `npm run build:preparar -- --minor` (`f9e8d84`), nota: "Agora é possível editar e excluir carteiras, o nome da carteira parou de sumir do seletor, e corrigido o flash de tela branca ao trocar de aba." Cobre as duas rodadas de carteira + o flash branco (o Granabô é server-side, não entra na nota de build). **Build EAS NÃO disparada** — pedido explícito do autor ("sem disparar build"). Quando pedir, esta build cobre: 1.5.1 (rótulos do gráfico, widget, voz, lentidão) + 1.6.0 (carteiras, flash branco, boleto de dois toques, ciclo de fatura — ver os dois blocos abaixo, ainda sem nova versão preparada pra eles). Granabô já está em produção via deploy direto da Edge Function, não depende de build nenhuma.

## 06/09/2026 (continuação) — boleto precisando de dois toques pra marcar como pago

Autor pediu investigação direta ("por que os boletos precisam de dois toques"). Achado em `app/(app)/contas.tsx:240` (`toggleStatus`): o pill "paga"/"em aberto" só atualizava depois de DOIS round-trips de rede em sequência — a RPC `pagar_conta`/`reabrir_conta`, depois um `load()` inteiro refazendo `fetchBills()` — sem nenhum feedback visual ou tátil nesse meio-tempo. Um toque só não dava pista de que funcionou; o segundo toque acertava por coincidência de tempo ou desfazia o que o primeiro já tinha feito.

Corrigido (`3c8c3cb`): o status é atualizado no estado local (e o háptico dispara) ANTES de esperar a rede; o `catch` desfaz se a chamada falhar. O servidor (`pagar_conta`/`reabrir_conta`, em `supabase/schema.sql`) já era idempotente antes desta mudança (`if v_bill.status = 'paid' then return v_bill`), então não precisou de guarda nova contra toque duplo — só faltava o feedback do lado do cliente. Verificado ao vivo simulando 1.2s de latência de rede via monkey-patch de `window.fetch`: o pill vira "paga" no instante do toque, bem antes do primeiro round-trip responder.

## 06/09/2026 (continuação) — ciclo de fatura do cartão de crédito, implementação completa

Autor cobrou um pedido antigo que nunca tinha sido implementado: "os cartões não estão considerando a data do vencimento como o mês atual dos lançamentos". Achado: existe um design já aprovado desde 03/09/2026 (`docs/superpowers/specs/2026-09-03-ciclo-fatura-cartao-design.md`, status "aprovado... aguardando plano de implementação") que nunca saiu do papel — `lib/faturaCiclo.ts` não existia e `app/(app)/credito.tsx` ainda agrupava lançamentos só por `isSameMonth(occurred_on, ano, mes)` (mês civil), ignorando `closing_day`/`due_day` do cartão por completo. Perguntei ao autor se deveria implementar o design já aprovado inteiro; confirmou que sim.

Implementado seguindo o design point a point, sem redesenhar nada:

- **`lib/faturaCiclo.ts`** (novo): `mesFaturaDoLancamento(occurredOn, closingDay)` — a que fatura (ano/mês de FECHAMENTO) um lançamento pertence, com a regra de corte (dia == closing_day já entra na fatura seguinte); `janelaFatura(year, month, closingDay)` — janela ISO da fatura; `dataVencimentoFatura(year, month, dueDay, closingDay)` — generaliza o cálculo que antes vivia isolado em `credito.tsx`. Testado em `__tests__/corpus-fatura-ciclo.ts` (15 casos: fechamento no meio do mês, dia 1, dia 31 num mês de 30 dias, virada de ano em dezembro, vencimento cruzando mês civil) — registrado em `test:parser`.
- **`components/MonthSelector.tsx`**: ganhou `currentYear`/`currentMonth` opcionais (default: hoje real) — sem isso, o selo "Atual" e o toque-pra-voltar do seletor de mês comparavam sempre contra o mês civil de hoje, o que ficaria errado pra fatura de cartão (cujo "aberto agora" pode já ter virado de mês antes do calendário virar). Retrocompatível — as outras 3+ telas que usam o componente não passam os props novos e continuam com o comportamento de sempre.
- **`app/(app)/credito.tsx`**: dois eixos de navegação por mês, nunca reciclados um no outro — `selectedYear`/`selectedMonth` (mês civil, visão "Total") e `faturaCardYear`/`faturaCardMonth` (ciclo do cartão específico, resetado pra "fatura em aberto agora" toda vez que `selectedCardId` muda pra um cartão — efeito com deps só em `[selectedCardId]`, de propósito: se `walletCards` entrasse, todo `loadData()` reabriria a fatura atual e descartaria a navegação manual do usuário pra uma fatura passada). `creditTransactions` agrupa por `isSameMonth` na visão Total e por `mesFaturaDoLancamento` (com o `closing_day` do cartão selecionado) na visão de cartão específico. Busca de dados alargada de 1 pra 2 meses civis (o par que cobre qualquer `closing_day` de 1 a 31), tanto no fetch principal (which segue o eixo navegado) quanto no bloco de lembretes de vencimento (que agora agenda sobre a fatura EM ABERTO de cada cartão, não mais sobre o mês civil corrente — dedicado, sempre mês atual + anterior, independente de onde o usuário está navegando). `invoiceDueDate`/`currentInvoicePayment`/o modal de pagar fatura passaram a usar o ciclo navegado (`viewYear`/`viewMonth`) em vez do mês civil cru. Rótulo "Fecha dia N" adicionado ao lado do "Vence em..." pra não parecer mês civil por engano. Carrossel de cartões (`cardSpent`, "Fatura atual" de CADA cartão simultaneamente) ficou de propósito no mês civil antigo — fora do escopo do design aprovado, mudar isso seria uma decisão de produto nova, não a correção pedida.
- **Migração de `credit_card_invoices`**: script de prévia (SELECT, sem UPDATE) em `docs/superpowers/specs/2026-09-06-migracao-fatura-cartao-preview.sql`, reimplementando `mesFaturaDoLancamento` em SQL puro — mostra "de (mês civil antigo) → para (fatura nova)" linha a linha e sinaliza `⚠ AMBÍGUO` quando as transações de um mês civil antigo se espalham por mais de um ciclo novo (não decide sozinho nesses casos). O UPDATE fica comentado no mesmo arquivo, só pra rodar depois da revisão do autor — **não executado**, nem a prévia foi rodada contra o banco real nesta sessão (não pedido).
- Verificado ao vivo com `agent-browser`: criado cartão de teste (fechamento dia 19, vencimento dia 5) na conta de testes; lançamento EXATAMENTE no dia 19 corretamente ficou de fora da fatura de setembro (R$ 0,00, "Nenhuma compra") e apareceu na fatura de outubro ao navegar — confirmando a regra de corte; "Vence em 05 out 2026" (cruzando mês civil) apareceu certo pra fatura de setembro, e "05 nov 2026" pra de outubro; pagar/reabrir fatura ficou corretamente isolado por ciclo (setembro continuou "Aberta" depois de pagar a de outubro). `tsc --noEmit` e `npm run test:parser` (327 checagens no total, incluindo as 15 novas) passaram. Commit único ainda não feito nesta anotação — ver o próximo commit no git log.

## 06/09/2026 (continuação) — selo sobrepondo texto, carrossel ainda com mês civil, e edição de cartão

Três achados seguidos, testando a implementação acima com o cartão real do autor (fechamento dia 14/15, a depender do cartão).

1. **Selo "Aberta" sobrepondo o "Vence em..."** (`2f7f6a3`): o "Fecha dia X" que eu tinha acabado de adicionar entrou na MESMA linha do "Vence em...", e a soma dos dois textos quebrava linha em tela estreita — o selo, que fica na mesma fileira, passava a sobrepor o texto quebrado. "Fecha dia X" virou linha própria, acima da fileira "Vence em... + selo" (que voltou a ter só o texto curto que já cabia).
2. **Carrossel de cartões ainda agrupava por mês civil** (`470ee45`): eu tinha deixado isso fora do escopo de propósito (documentado no commit anterior), mas o autor testou e confirmou que não faz sentido — "lançamentos que são feitos em um mesmo ciclo de fatura precisam ficar juntos, independente do calendário", sem exceção pro carrossel. `cardSpent` passou a agrupar por `mesFaturaDoLancamento` com o `closing_day` de CADA cartão; o cartão com o painel de detalhe aberto embaixo acompanha o ciclo NAVEGADO ali (pra pílula do carrossel e o painel baterem sempre no mesmo valor), os outros mostram a fatura real em aberto agora. Isso exigiu alargar a busca: `loadData` passou a buscar sempre o par de HOJE (mês atual + anterior) além do par do eixo navegado, com dedup por id — sem isso, cartões que não são o navegado ficavam com dado incompleto quando a tela estava longe de hoje.
3. **Teste ao vivo com fechamento dia 15**: reproduzi o cenário exato do autor (C6, fechamento 15, vencimento 22) e simulei 3 lançamentos (20/ago, "31/ago", 04/set) — o total bateu R$40 em vez dos R$60 esperados. Investigando, achei que o "31/ago" na verdade tinha sido salvo como **31/JULHO** — erro meu no picker de calendário (ele não reseta pro mês atual a cada abertura; um segundo clique em "mês anterior", pensando que ainda estava em setembro, foi parar em julho). Confirmado consultando o Postgres direto (`occurred_on: "2026-07-31"`). Não era bug: dia 31 com fechamento 15 pertence à fatura de AGOSTO mesmo, e o app mostrou isso corretamente ao navegar pra lá. Conclusão: a lógica de agrupamento está correta; o "Cannot connect to Expo CLI" que apareceu no rodapé de um print do autor sugere que o app dele pode ter ficado com um bundle desatualizado depois de perder a conexão com o Metro — vale reconectar/recarregar antes de testar de novo.
4. **Edição de cartão não existia** (`566b774`): só dava pra criar e excluir; editar nome/banco/dígitos/limite/fechamento/vencimento depois de cadastrado exigia recriar do zero. Achado pelo autor testando a correção acima com o cartão real. `lib/data.ts` ganhou `updateCreditCard` (mesmo padrão de `updateWallet`); o botão de opções do cartão (antes só lixeira, exclusão direta) e o toque longo (antes só excluir) passaram a abrir o mesmo menu Editar/Excluir que os lançamentos já usam (`ItemActionSheet`). Mesmo sheet de cadastro serve pra criar e editar (`editingCardId` no estado decide qual). Verificado ao vivo: editar fechamento de 15 pra 20 persiste e reflete na tela.
5. **Visão "Total" também agrupava por mês civil** (`f5bb94b`): eu tinha deixado isso fora de propósito (mesma decisão do achado 2, documentada como "cartões podem ter closing_day diferentes, não existe um ciclo único pra agregar"). O autor testou a aba Total com o cartão real (fechamento dia 15) e mostrou print — reagiu mal ao ver agrupamento por mês civil de novo, com razão: a justificativa não se sustenta, cada lançamento continua pertencendo ao ciclo do PRÓPRIO cartão dele em qualquer aba. `creditTransactions` agora resolve cada lançamento pelo `closing_day` do seu próprio `card_id`, mesmo na visão Total — "Setembro" ali passa a significar "soma de toda fatura que fecha em setembro". Lançamento sem cartão vinculado (cartão excluído) continua caindo no mês civil, único caso sem `closing_day` disponível. Verificado ao vivo: lançamento de 31/ago com fechamento dia 15 sumiu do Total de agosto e apareceu no Total de setembro.
# Sessão de 06/09/2026 — lista de crédito por ciclo e por cartão

- A tela de Crédito passou de uma lista plana para `SectionList` na visão
  Total. Cada cartão tem seção própria, na mesma ordem do carrossel, com cor,
  nome, intervalo real do ciclo e subtotal; lançamentos ambíguos ficam em
  “Sem cartão vinculado”. Ao selecionar um cartão, a lista continua
  visualmente plana.
- O seletor compartilhado ganhou `mode="invoice"`; só a tela de Crédito usa
  esse modo e agora exibe “Fatura de …”, com setas anunciadas como fatura
  anterior/próxima. As outras telas continuam falando em mês.
- `lib/creditoFaturas.ts` virou a fonte única da filtragem e do agrupamento da
  tela. Lista, total, cartão selecionado, carrossel e lembretes usam a mesma
  regra baseada em `mesFaturaDoLancamento`.
- Diagnóstico das capturas reais: compras antigas apareciam no Total, mas o C6
  mostrava R$ 0,00, sinal de crédito salvo sem `card_id`. Quando há exatamente
  um cartão, a associação é inequívoca e esses registros passam a usar o ciclo
  dele sem reescrever o banco. Com dois ou mais cartões, continuam separados em
  “Sem cartão vinculado” para não atribuir uma compra ao cartão errado; podem
  ser vinculados pela edição do lançamento.
- `rotuloPeriodoFatura` explicita a janela real (ex.: `20 ago – 19 set`) no
  resumo do cartão e no cabeçalho de cada seção, evitando que o mês de
  fechamento seja confundido com mês civil.
- Verificação: `tsc --noEmit` passou; suíte completa `npm run test:parser`
  passou, incluindo 17/17 casos da matemática de fatura e 7/7 casos novos de
  filtragem/separação. A tentativa de QA via `agent-browser` não abriu o Chrome
  local (`CDP response channel closed`); nenhuma build EAS foi disparada.

# Sessão de 06/09/2026 — auditoria Impeccable (Android e desktop web)

- Todos os `TextInput` de fluxos autenticados e modais compartilhados receberam
  `accessibilityLabel`; a validação de lançamento e cadastro de cartão agora
  aparece inline, em região de alerta, sem depender de `Alert.alert`.
- A barra inferior do Android/tablet compacto ficou com seis destinos
  principais (Início, Débito e Pix, Crédito, Boletos, Gráficos e Desafios) e o
  Granabô no centro, sem botão de três pontos. No desktop, o trilho lateral
  mostra os mesmos destinos e Perfil continua no rodapé. Links da lateral web
  agora têm `href` real.
- O resumo da fatura em Crédito empilha informação e CTA em telas compactas;
  isso elimina a sobreposição observada entre “Vence em…”, selo e o botão
  “Lançar no Crédito”.
- Gráficos reutiliza o histórico em cache ao alternar abas; o fallback antigo
  de Desafios também guarda a consulta completa. O recorte de Período continua
  buscando somente as datas necessárias, e os modos Ano/Mês mantêm histórico
  completo porque precisam construir o eixo desde o primeiro lançamento.
- Fotos de perfil passaram a ter nome acessível, os presets perderam emojis
  redundantes (o ícone já comunica a categoria), o estado de gravação por voz
  usa `theme.danger` e copy com reticência tipográfica.

## 06/09/2026 (continuação) — versão 1.7.0 preparada e build EAS disparada

Autor pediu explicitamente ("dispara uma build aí"). Antes de disparar,
conferido que os 4 commits mais recentes (não produzidos por mim nesta
sessão — pelo estilo e pelo conteúdo, parecem ser do Codex continuando o
plano em `docs/superpowers/specs/2026-09-06-plano-codex-ciclo-fatura-cartao.md`
que eu tinha deixado: agrupamento de crédito por ciclo E por cartão numa
`SectionList`, `mode="invoice"` no `MonthSelector`, `lib/creditoFaturas.ts`
como fonte única de filtragem, mais uma auditoria de acessibilidade —
labels em `TextInput`, validação inline em vez de `Alert.alert`, barra
inferior com os 6 destinos reais + Granabô, cache de histórico em
Gráficos/Desafios) estavam íntegros: `npx tsc --noEmit` limpo e
`npm run test:parser` 100% (incluindo os novos corpora de ciclo/fatura).

Havia também um trabalho EM ANDAMENTO, não commitado, tocando
`supabase/functions/assistente-financeiro/index.ts` +
`supabase/functions/_shared/fatura-ciclo.ts` (novo) +
`__tests__/corpus-assistente-fatura.ts` (novo) — provavelmente o
`resumoCredito` do Granabô sendo atualizado pro mesmo modelo de ciclo (a
dívida que o plano pro Codex tinha registrado). **Não tocado, não
commitado por mim** — é trabalho de outra sessão em andamento, e além
disso é uma Edge Function, que não entra no bundle do app de qualquer
jeito.

Versão subida 1.6.0 → **1.7.0** via `npm run build:preparar -- --minor`
(`fd12be4`), nota: "Boletos marcam como pago na hora, cartões de crédito
agrupam certo pela fatura (não mais pelo mês do calendário) com
lançamentos separados por cartão, e agora dá para editar um cartão já
cadastrado." Cobre o boleto de dois toques + as cinco rodadas do ciclo de
fatura (implementação, layout, carrossel, edição de cartão, visão Total) +
o trabalho do Codex (separação por cartão na lista, acessibilidade).

Tudo publicado no GitHub (`f951bd8..fd12be4`) e **build EAS disparada**
(`eas build --profile preview --platform android`, pedido explícito do
autor) — acompanhar em
`https://expo.dev/accounts/gabriouss/projects/grana-app/builds/32f00f39-07d9-4a3c-a538-90797676659f`.
`versionCode` do Android subiu de 5 para 6 automaticamente (gerenciado pelo
EAS, não pelo `app.json`).
- Verificação: `tsc --noEmit`, corpus de ciclo/lista/design system (17/17,
  7/7 e 312/312). A suíte completa anterior já estava verde; a nova execução
  também concluiu os corpora até a guarda de design system, sem regressões de
  lógica (o runner encerrou apenas com a guarda de fonte antes do ajuste, que
  foi corrigida e passou em seguida). QA visual ao vivo continua limitado ao
  Chrome/ADB indisponíveis neste ambiente.

## 06/09/2026 (continuação) — primeira build 1.7.0 falhou no Gradle, corrigida e reenviada com sucesso

A build disparada (`32f00f39-07d9-4a3c-a538-90797676659f`) falhou depois de
7min54s — `eas build:view --json` só devolvia "Gradle build failed with
unknown error", sem detalhe. O log de verdade fica num arquivo `.txt`
comprimido em Brotli (`Content-Encoding: br`) num link assinado do GCS —
`curl` sozinho baixa os bytes crus sem descomprimir; precisa
`zlib.brotliDecompressSync` (Node) ou equivalente antes de conseguir ler.
Decodificado, o erro real: `Unresolved reference 'ComponentName'` em
`modules/grana-voice-widget/android/.../GranaVoiceWidgetModule.kt:54`
(`fixarPorTipo`, usa `ComponentName` mas só importava `Context`) — bug
latente desde `856b59f` (limpeza ponytail, bem antes desta sessão), nunca
pego porque nenhuma build real tinha rodado contra este arquivo desde
então (as builds anteriores ficaram só preparadas, nunca disparadas).
Confirmado que os outros arquivos do módulo (`EstadoWidget.kt`,
`GranaResumoWidgetProvider.kt`, `WidgetRegistry.kt`) já importavam
`ComponentName` certo — só faltava neste um.

Corrigido (`65c0c8f`, uma linha: `import android.content.ComponentName`).
Build reenviada com a mesma versão/nota (`44a6885a-e156-4624-9153-425defa7ba59`,
versionCode 7) — **sucesso**. Link de instalação:
`https://expo.dev/accounts/gabriouss/projects/grana-app/builds/44a6885a-e156-4624-9153-425defa7ba59`.

Nota pra quem for depurar uma build falha no futuro: `eas build:view <id>
--json` dá o `logFiles` (URL assinada); baixar com `curl`, depois
descomprimir Brotli antes de grep — sem isso o arquivo parece binário
ilegível e é fácil desistir cedo demais achando que não dá pra ler o log.

## 06/09/2026 (continuação) — investigação do lançamento por voz: widget funciona, gargalo era o fallback sequencial Groq/OpenAI

O autor relatou lentidão e o widget "não funcionando", perguntando se dava
pra trocar pro reconhecimento de voz nativo do Android. Investigação com
logs reais de produção (Supabase Management API, `analytics/endpoints/
logs.all`, precisa de `iso_timestamp_start`/`iso_timestamp_end` explícitos
ou a query some sem erro) confirmou:

- **O widget está mecanicamente funcionando na build 1.7.0** — permissão,
  gravação, upload e resposta da função `processar-lancamento-voz`, tudo
  OK. As duas notificações do print do autor têm causas diferentes: uma foi
  erro genérico antes de chegar na função; a outra foi a função respondendo
  200 com uma transcrição realmente ruim ("Ouvi: 'VALORES EM RAZO'"), e o
  app recusando lançar por não achar valor — comportamento correto de
  `lib/widget-voz-task.ts`, não bug.
- **Reconhecimento nativo do Android não é recomendado.** Já foi tentado
  antes (`expo-speech-recognition`, ainda instalado sem uso) e revertido de
  propósito por dar transcrição pior que o Whisper na nuvem. Trocar de novo
  arriscaria piorar, não melhorar.
- **A lentidão real era o fallback sequencial**: o segundo provedor só
  começava depois do primeiro terminar (falhando ou não), somando até dois
  timeouts de 30s quando o Groq ficava pendurado sem responder — até ~60s
  no pior caso. Corrigido em `supabase/functions/_shared/voice-
  transcription.ts` (commit `5200545`): corrida com atraso — Groq sai na
  hora, o OpenAI só entra se o Groq falhar na hora ou passar 8s sem
  resposta, o que vier primeiro. Custo do OpenAI não é gasto à toa no caso
  comum (Groq rápido). Validado com `deno check` limpo, `npm run
  test:parser` 100% e um teste isolado (4 cenários: sucesso rápido, falha
  rápida, Groq pendurado, os dois falhando).

**Commitado e publicado no GitHub, mas a função NÃO foi implantada em
produção** — o autor pediu pra deixar só commitado por enquanto
("Não, só deixa commitado por enquanto"). Quando for autorizado: `supabase
functions deploy processar-lancamento-voz --use-api --project-ref
cjnuzfbvfuauvlzfoutv`.

## Sessão de 06/09/2026 — Granabô: ciclo de fatura e aprendizado assertivo

- `supabase/functions/assistente-financeiro/index.ts` agora resolve `resumoCredito`
  pelo ciclo de fechamento de cada cartão (ex.: 20/08–19/09), e não pelo mês
  civil. A mesma ferramenta aceita cartão e categoria e mantém cartões
  diferentes separados, incluindo lançamentos sem cartão vinculado como grupo
  indeterminado.
- `gastoPorCategoria` reconhece o modo `fatura=true` para não cair no recorte
  mensal quando o modelo escolher essa ferramenta para uma pergunta de categoria.
- Foi adicionada a ferramenta `lembrarPreferencia`. Preferências ficam na
  memória existente com a chave `preferencia:*` e são injetadas no prompt sem
  serem tratadas como fatos financeiros. Correções explícitas sobre fatura
  também são detectadas automaticamente no histórico, mesmo que o modelo não
  chame a ferramenta de memória.
- O prompt reforça que toda pergunta de fatura/cartão usa o ciclo real e que
  nenhum número pode ser inventado. O helper puro em
  `supabase/functions/_shared/fatura-ciclo.ts` tem 4 cenários automatizados em
  `__tests__/corpus-assistente-fatura.ts`.

### Publicação e verificação (06/09/2026)

A Edge Function `assistente-financeiro` foi publicada em produção com
`supabase functions deploy --use-api`. A sonda autenticada na conta de testes
retornou HTTP 200 para saudação e para uma pergunta de fatura; a segunda usou
`resumoCredito` e respondeu pelo ciclo de setembro de 2026. O token temporário
foi usado somente no processo de publicação e não foi salvo no projeto.

## Auditoria geral — correções aplicadas (06/09/2026)

- `Granachat` ganhou `AbortController`, botão de cancelamento e timeout de 35s;
  fechar a janela ou desmontar o componente também cancela a consulta.
- `ToggleSwitch` foi dividido em componentes nativo/web para preservar a ordem
  dos Hooks.
- A busca de Lançamentos já estava memoizada e não recebeu uma reescrita sem
  ganho comprovado. O carregamento de histórico completo no Início/Gráficos
  continua sendo a principal dívida de escala, pois a navegação permite meses
  antigos; exige agregação/consulta no banco e validação contra dados reais.
- A auditoria ainda tem um gate físico: widget, voz, biometria, notificações,
  deep links e blur precisam ser instalados e exercitados num Android real.
- Verificação: `tsc --noEmit` passou e o corpus isolado do ciclo passou 4/4.
  A Edge Function ainda precisa ser publicada quando o autor autorizar; nenhum
  deploy ou build EAS foi disparado nesta sessão.

## Sessão de 06/09/2026 — continuidade natural do Granabô

- O fluxo de continuação curta foi reforçado em
  `supabase/functions/assistente-financeiro/index.ts`: quando a mensagem atual
  diz "fatura/ciclo atual" e o histórico contém a pergunta anterior sobre
  cartão/fatura, a intenção anterior é reapresentada ao modelo mantendo
  cartão, categoria e filtros e trocando apenas o ciclo.
- Se a segunda chamada do modelo voltar sem conteúdo depois de uma ferramenta
  consultar os dados, a resposta usa o resultado real da ferramenta como
  fallback; o Granabô não descarta uma consulta válida nem mostra uma desculpa
  genérica.
- A pergunta original continua sendo salva no histórico; o texto enriquecido
  é apenas interno ao ciclo de tool calling.
- `git fetch origin` não pôde completar por indisponibilidade de rede; o ramo
  local está 7 commits à frente de `origin/main`. A alteração está local e
  ainda precisa de validação/publicação quando a rede e a autorização de push
  estiverem disponíveis.

## 06/09/2026 — aprendizado operacional geral do Granabô

- Substituído o remendo específico de "fatura atual" por um fluxo geral em
  `_shared/assistant-learning.ts`: até três rodadas de ferramentas para aprender
  apelidos/preferências, corrigir argumentos e consultar novamente. Chamadas
  idênticas são reutilizadas; catálogo/argumentos são validados.
- `assistant_memory` existente guarda o plano recente em fato `__conversa`,
  vinculado à resposta anterior e válido por 30 minutos. O plano é contexto,
  nunca fonte de valores. Não houve mudança de schema/RLS.
- Exemplos v2 distinguem execução verificada de confirmação explícita do
  usuário. Rejeições explícitas retiram o exemplo vinculado. Exemplos legados
  não verificados não entram mais no prompt. Continuação guarda a pergunta com
  contexto para não ensinar um filtro específico como resposta universal.
- Resposta com valores R$ sem suporte nas ferramentas provoca nova tentativa.
  Falha de redação pode usar resultado de consulta completa. Memórias com erro
  no RPC não são mais anunciadas como gravadas com sucesso.
- Chamadas ao modelo têm orçamento compartilhado de 27s (até 10s por tentativa).
  Banco/autenticação acrescentam latência. Não é garantia de tempo total.
- Validação: `npm run test:assistente-aprendizado` (políticas + handler real com
  serviços simulados), `deno check` da função e `tsc --noEmit` do app. Detalhes e
  limites em `docs/GRANABO_APRENDIZADO.md`. Não houve avaliação com o modelo real.
- `git fetch origin` voltou a funcionar com execução autorizada; nenhuma
  divergência remota encontrada. Deploy tentado, mas o CLI rejeitou a credencial
  fornecida com `LegacyInvalidAccessTokenError` (formato inválido). Mudança ainda
  não está ativa no Supabase; precisa de token válido e teste autenticado após
  publicação. Não foi disparada build EAS.

### Publicação e sonda real — aprendizado do Granabô

- O autor forneceu novamente o token completo. A função `assistente-financeiro`
  foi publicada com sucesso no Supabase (`--use-api`). Não salvar a credencial.
- A primeira sonda revelou que a conta de testes atual tem zero cartões; o
  modelo tentava ampliar a consulta após não encontrar C6. Corrigido o executor:
  filtros de cartão/categoria/carteira são mantidos entre tentativas e uma
  ferramenta incapaz de aplicá-los é recusada. Ausência de cadastro não é sucesso
  nem autoriza um total amplo. Proteção ganhou teste e foi republicada.
- Sonda autenticada com o modelo real, após a última publicação:
  Alimentação em setembro/2026 -> R$ 130,00 (14,1s); "E em Outros?" ->
  R$ 50,00, preservando setembro/2026 (18,9s); fatura atual C6 -> informou
  ausência do cartão sem apresentar outro total (12,4s). Consulta REST direta
  confirmou zero cartões. Não foi possível validar números do ciclo C6 nessa
  conta e não foram criados cartões ou lançamentos de teste.
- Suite de aprendizado: nove cenários de política e integração do handler
  passaram; `deno check` passou. Não houve build EAS: alteração é no servidor.
- O push de commits para `origin/main` permanece pendente de autorização
  explícita, após rejeição da revisão automática. Deploy Supabase foi autorizado
  pelo token fornecido e está concluído, independentemente desse push.

## 07/09/2026 — QA com cartões e pré-build do widget de áudio

- A pedido do autor, criados QA C6 (fecha 15, vence 22) e QA Nubank (fecha 25,
  vence 2), seis transações em cada um e dois controles Pix/débito na conta QA.
  Dados permanecem para inspeção. Criação idempotente em
  `scripts/testar-granabo-cartoes.cjs`; credenciais vêm do ambiente.
- Primeira bateria: 6/7, erro em fatura passada C6. Correção publicada:
  referências explícitas de ciclo atual/anterior são resolvidas no backend com
  deslocamento relativo ao fechamento de cada cartão, sobrescrevendo mês civil
  incorreto do modelo. Comparações entre ciclos não recebem override único.
- Segunda bateria real: 9/9. C6 Alimentação anterior=120, atual=275, total
  atual=335. Nubank Alimentação anterior=200, atual=325, Outros=70, total=395.
  Pix 999 e débito 888 não contam no crédito. Respostas/ciclos/tempos em
  `docs/GRANABO_TESTE_CARTOES_20260906.json`; latência máxima observada 24,8s.
- Suite aprendizado 10 cenários + integração passou, Deno e tsc passaram.
- Auditoria widget: upload corrigido no TESTE (expectativa antiga e mock
  ausente), 11/11 guardas de idempotência e 9/9 visuais passaram. Corrigida
  escolha silenciosa do primeiro cartão na tarefa: vários cartões sem nome
  reconhecido agora pedem revisão. Teste executável da tarefa em
  `__tests__/widget-voz-cartoes.cjs` passou.
- Backend de voz em produção transcreveu M4A sintético corretamente 3/3,
  HTTP 200, Groq, 0,64–0,83s. Nenhum gasto criado por essa sonda.
- Download da função publicada confirmou fallback ainda sequencial; melhoria
  local de 8s NÃO foi publicada (decisão anterior era deixar só commitada).
  Não há acesso a Android/adb para validar widget físico; não houve build.
  Limites e roteiro em `docs/AUDITORIA_WIDGET_VOZ_20260907.md`.
- Push continua pendente da autorização explícita solicitada após rejeição
  de auto-review; não tentar contornar essa restrição.

## 06-07/09/2026 — widget Central de Lançamentos vira cápsulas, retry no lançamento por voz, e fatura passada/atual do Granabô fechada

Sequência de correções antes de uma nova build (nenhuma disparada ainda,
autor pediu pra aguardar o Codex terminar o Granabô primeiro):

- **Widget "Central de Lançamentos"** (`modules/grana-voice-widget/...`):
  duas rodadas. Primeiro `targetCellWidth` 4→5 e `resizeMode` "none"→
  "horizontal" (`7d6bc65`) — o autor mostrou print com o widget não
  ocupando a tela de ponta a ponta em launcher de 5 colunas, e um segundo
  print de área branca ao tentar redimensionar (launcher ignora
  `resizeMode="none"` e arrasta mesmo assim, mas o app nunca é avisado via
  `onAppWidgetOptionsChanged`, então o conteúdo não reflui). Depois
  (`3541789`) os 4 botões deixaram de ser colunas empilhadas dentro de 1
  cartão contínuo e viraram cápsulas separadas (ícone ao lado do rótulo),
  a pedido do autor pra igualar o formato real da fileira "Colar
  comprovante/Importar extrato/Escanear nota" da tela Início
  (`styles.smartActionBtn`). `grana_widget_acao` (usado só neste widget)
  ganhou raio 999dp; `grana_widget_selo` (círculo atrás do ícone) ficou
  órfão e foi removido. Confirmado por inspeção que os IDs de clique
  (`R.id.grana_central_*`) não mudaram — `CentralLancamentoWidgetProvider.kt`
  e o roteamento de deep link (`lib/deep-links.ts`, `app/+native-intent.tsx`)
  não foram tocados. Só verificação estática (`tsc`, XML bem formado) —
  sem JDK/SDK Android nesta máquina, nada foi compilado de verdade.
- **Lançamento por voz — velocidade**: fallback sequencial Groq→OpenAI
  trocado por corrida com atraso de 8s em
  `supabase/functions/_shared/voice-transcription.ts` (`5200545`).
  Commitado, **não publicado ainda** (autor pediu pra deixar só
  commitado).
- **Lançamento por voz — retry**: logs de produção mostraram a função
  `processar-lancamento-voz` respondendo 200 com transcrição válida, mas
  o app às vezes não conseguindo ler o corpo (JSON ilegível ou sem
  `status: 'ready'`) — suspeita de rede móvel picando no meio da resposta.
  `lib/voz.ts` (`fb0bc3f`) agora tenta a mesma gravação mais uma vez
  automaticamente nesse caso específico (nunca nos erros definitivos como
  `audio_ausente`/`audio_grande`/`formato_invalido`/401, que têm código
  reconhecível e não são retentados). Validado com um teste isolado (5
  cenários, fora do `test:parser`) já que o módulo depende de
  react-native/expo e não roda em Node puro.
- **Granabô — fatura passada vs atual**: o Codex diagnosticou e corrigiu
  (`cddb6a9`, eu só revisei e commitei porque a sessão dele bateu no
  limite de uso no meio do trabalho): o Granabô respondia com a fatura
  ATUAL quando perguntado pela PASSADA, porque dependia do modelo acertar
  mês/ano sozinho. `deslocamentoPedido()` lê a própria frase do usuário
  ("fatura passada/anterior" vs "atual") e `cicloRelativo()` resolve o
  ciclo pelo fechamento real de cada cartão, sobrescrevendo o período
  antes da ferramenta rodar. Testado com 2 cartões reais (fechamentos
  diferentes) e 14 lançamentos na conta QA (`docs/GRANABO_TESTE_CARTOES_
  20260906.json`), incluindo troca de cartão no meio da conversa: 9/9
  perguntas corretas contra a função já publicada em produção (versão 19,
  confirmado via Management API que o deploy precedeu o teste em segundos).
  Já publicado; não precisa de build.
- **Estado antes da próxima build**: `tsc --noEmit` limpo e `test:parser`
  100% no HEAD. Além do widget acima, `components/Granachat.tsx`
  (rolagem sem teclado + cancelamento de consultas do Granabô) e
  `components/ToggleSwitch.tsx` (correção de hooks) também mudaram desde
  a 1.7.0 e nunca foram testados num aparelho real. Versão ainda em
  `1.7.0` no `app.json` — falta rodar `npm run build:preparar` antes de
  disparar. Nenhuma build EAS disparada nesta sessão.

## 07/09/2026 — análise do vídeo dos dois widgets e fila offline do lançamento por voz

Atualização posterior: a explicação sobre o limiar era hipótese, não causa
comprovada da segunda tentativa. A fila inicial tinha limitações identificadas
na revisão seguinte; ver docs/VOZ_OFFLINE.md para a implementação posterior.

Implementado reconhecimento local compartilhado (Android 13+, modelo pt-BR),
preparação do modelo no Perfil, persistência de operações de voz antes da RPC,
retomada com payload original e aviso de itens locais. Formulários de despesa,
crédito e boleto usam a fila quando abertos por voz. Cartões/categorias têm cache
por conta. Áudios pendentes usam documentos privados e permanecem na fila durante
a tentativa. Testes voz-offline, voz-upload, widget-voz-cartoes e TypeScript
passaram. Android físico ainda não validado; nenhuma build/deploy disparados.

- O áudio do vídeo foi transcrito somente depois de autorização explícita do
  autor. O vídeo mostrou o widget de voz ficando em “Ouvindo...” até o segundo
  toque, seguido de captura de fala que não correspondia ao comando financeiro;
  também mostrou o widget Central de Lançamentos ocupando espaço vertical
  demais. A segunda tentativa encerrou a captura, mas ainda podia terminar sem
  lançamento quando a transcrição ou a RPC encontravam uma falha de rede.
- `GranaVoiceCaptureService.kt`: limiar de fala reduzido de 1.800 para 600 de
  amplitude. Em aparelhos com microfone mais distante, o valor anterior nunca
  armava o corte por silêncio; a captura só terminava no segundo toque ou no
  teto de 20 segundos e podia incluir a explicação seguinte.
- `grana_central_widget.xml` e `grana_central_widget_info.xml`: altura visual
  reduzida de 60/44dp para 48/40dp, mantendo quatro cápsulas horizontais e os
  IDs de clique/deep link.
- `lib/widget-voz-pendentes.ts` e `lib/widget-voz-task.ts`: quando a rede cai,
  o áudio e o mesmo `requestId` ficam numa fila local vinculada ao usuário; o
  widget notifica que o lançamento está aguardando conexão e o app retoma a
  fila ao abrir ou voltar ao primeiro plano. A RPC idempotente impede duplicata
  se o servidor tiver recebido a operação antes da queda. A fila não é
  processada por outra conta no mesmo aparelho.
- Falha posterior à transcrição agora devolve o texto ouvido para revisão, em
  vez de uma mensagem genérica; falha ao publicar a notificação não transforma
  uma operação já confirmada em nova tentativa.
- Verificação local: `tsc --noEmit` e `git diff --check` passaram. Não há JDK/
  SDK Android nesta máquina; a integração nativa ainda precisa de uma build
  interna e teste físico no aparelho antes de publicar APK. Nenhuma build foi
  disparada.

## Revisão da sincronização de voz — 07/09/2026
Correção anterior 12d75d9 não comprovou a causa da falha do aparelho. Agora sincronizações concorrentes compartilham a promessa, JSON inválido não interrompe a fila, troca de conta interrompe envios e erros de servidor não são rotulados como falta de internet. Retomada periódica a cada 30s apenas em primeiro plano. Teste executável cobre fila offline retornando online, concorrência e item corrompido. Testes de voz/upload/widget e TypeScript verificados. Pendente: diagnóstico da resposta real do backend no aparelho e QA visual Android; nenhuma nova build autorizada/disparada nesta correção.

## 07/09/2026 — CAUSA RAIZ do lançamento por voz: a migration nunca foi aplicada em produção

O lançamento por voz estava quebrado por um motivo que nenhuma das três
correções de cliente anteriores (`12d75d9`, `26d6c63`, e as tentativas de
fila offline) poderia resolver: **a migration
`20260905004109_voice_operations.sql` nunca foi aplicada ao banco de
produção**. A tabela `voice_operations` e as funções
`registrar_operacao_voz`/`desfazer_operacao_voz` simplesmente não existiam.

Diagnóstico (sonda com a chave anônima; a função levanta erro de autorização
antes de qualquer escrita, então a sonda é inofensiva):

- `registrar_operacao_voz` → `PGRST202` (não encontrada)
- `desfazer_operacao_voz` → `PGRST202` (não encontrada)
- tabela `voice_operations` → `PGRST205` (não encontrada)
- controle `tem_direito_acesso` → `42501` (existe; prova que o banco respondia)

Das cinco migrations do repositório, só essa faltava — as outras quatro
(`push_habito`, `janelas_notificacao`, `assistant_messages`,
`assistant_memory`) já estavam aplicadas. Este projeto não usa
`supabase_migrations.schema_migrations` (a tabela não existe no banco), então
não há nada que compare repositório e produção: a única forma de saber é
consultar objeto por objeto.

**Por que isso se disfarçou de bug de sincronização.** Em
`lib/voice-operations.ts:80-88`, só erros Postgres `22*`, `23*` e `42501` são
tratados como recusa definitiva; qualquer outro vira
`return { status: 'pending' }`, que a interface mostra como "Salvo no
aparelho — será sincronizado ao abrir o Grana. com conexão". `PGRST202` não
casa com nenhum dos três. Resultado: com internet perfeita, toda fala chamava
uma função inexistente, recebia "não encontrada" e era arquivada como se
fosse falta de conexão — e a fila retentava contra a mesma função inexistente
para sempre. Duas builds Android foram gastas em correções de cliente que não
tinham como funcionar.

**Correção aplicada em 07/09/2026**: a migration foi executada em produção
via Management API (`POST /v1/projects/{ref}/database/query`, token temporário
do autor, nunca persistido). Verificado depois: os três objetos agora
respondem `42501 permission denied` para o `anon` em vez de "não existe" —
que é exatamente o desenho da migration (`revoke all ... from anon`,
`grant execute ... to authenticated`). Dependências conferidas ANTES de
aplicar: `extensions.digest`, `public.somar_meses_data`,
`transactions_source_event_uniq` e `bills_source_event_uniq` — todas já
existiam.

**Nenhuma build foi necessária**: a 1.8.2 instalada já retenta a fila ao abrir
o app e a cada volta ao primeiro plano, então os lançamentos presos entram
sozinhos.

Notas de PowerShell, para a próxima vez que alguém aplicar SQL daqui:
`@{ query = $sql } | ConvertTo-Json` produziu `{"query":{"value":"..."}}` em
vez de `{"query":"..."}` nesta máquina, e a API respondia
`query: Invalid input: expected string, received object`. A saída só ficou
correta montando o JSON à mão (`-replace` para `\`, `"`, CRLF e tab) e
enviando com `curl.exe --data-binary`, nunca com `Invoke-RestMethod`.

**Dívida declarada, para a próxima build** (não bloqueante): o cliente ainda
converte falha permanente em "salvo no aparelho". `PGRST202` (função ausente),
`PGRST301` (JWT expirado) e timeouts continuam entrando na fila como se
fossem falta de conexão. Foi exatamente isso que escondeu uma feature
totalmente fora do ar por dois dias. O certo é separar recusa permanente de
indisponibilidade temporária e mostrar a primeira em vez de enfileirar.

## 07/09/2026 (continuação) — Granabô perdendo mensagens, e notificações de almoço/noite

Três correções na mesma sessão, todas com a mesma assinatura: um erro real
escondido atrás de um caminho que parecia benigno.

### Granabô: mensagens sumindo do histórico (`c7818f7`)

O autor relatou que "algumas mensagens do Granabô somem da conversa, outras
não". Não sumiam: **nada apaga** `assistant_messages` (não há `DELETE` no
código, nem trigger, nem cron — verificado). O problema era de leitura.

A Edge Function gravava pergunta e resposta **numa única instrução**, e
`now()` no Postgres devolve o mesmo instante para a transação inteira. As
duas linhas nasciam com `criado_em` idêntico ao microssegundo. Medido na
conta do autor: **100 linhas para 50 instantes distintos** — todo par
colidindo, sem exceção.

`fetchMensagens` ordenava só por `criado_em` com `limit(50)`. Ordenação com
empate e `LIMIT` é não-determinística no Postgres, e daí saíam os dois
sintomas: a resposta aparecia acima da pergunta (comprovado — dois pares do
mesmo resultado saíam em ordens opostas), e o par cortado na fronteira do
limite voltava pela metade, ora um membro ora outro. O mesmo histórico
bagunçado ainda era reenviado como contexto ao modelo a cada pergunta, então
o Granabô também *raciocinava* sobre uma conversa fora de ordem.

Correção: leitura desempata por `papel` (como `'assistente' < 'usuario'`, a
ordem decrescente fica estável e o `reverse()` entrega pergunta antes de
resposta — conserta inclusive as linhas antigas, sem migration); escrita passa
a gravar timestamps explícitos com 1ms de diferença. Edge Function publicada
(versão 20). Nota: `limit = 50` conta LINHAS, então o histórico visível é de
25 perguntas, não 50.

### Voz: falha permanente deixando de parecer falta de rede (`dce7d63`)

Continuação da causa raiz da migration não aplicada: `PGRST202`/`PGRST205`/
`42883`/`42P01` agora têm mensagem própria dizendo que não se resolve
sozinho, em vez do texto genérico "continua salvo no aparelho". Nada mudou no
que decide guardar ou remover o lançamento. Junto, consertada a guarda
`corpus-voz-idempotencia`, vermelha desde `81758a6` porque a regex exigia
aridade exata de `processar()` — o `test:parser` voltou a 100%.

### Notificações de almoço e janta (`8b1fea4`)

O backend está inteiro e correto: cron a cada 5 minutos rodando, tabelas,
RLS e as colunas da janela (`almoco_ativo`, `janela`) todas aplicadas em
produção. Mas **`push_tokens` está vazia para todas as contas** e
`push_habit_deliveries` não tem uma linha sequer.

Causa: o projeto **nunca teve `google-services.json`** (nunca existiu no
histórico do git) nem credencial FCM. Sem isso `getExpoPushTokenAsync` sempre
lança no Android — e o `catch` sem log engolia desde o primeiro dia, fazendo
um push que nunca funcionou parecer um push desligado por escolha. O bloqueio
já estava anotado aqui em 04/09 ("falta confirmar se a credencial Android FCM
v1 já existe") e nunca foi fechado.

O que foi corrigido: o `catch` passa a logar, e o agendamento **local** (o
único lembrete que existe sem FCM) deixou de depender de a tela Início ter
terminado de carregar os lançamentos — o boot agenda as duas janelas quando o
push não está disponível. Antes, qual tela abriu primeiro decidia se o
lembrete existia.

**Pendência que só o autor pode fechar** (não dá pelo código): criar o projeto
no Firebase com o pacote `com.gabriouss.grana`, baixar o `google-services.json`,
referenciá-lo em `app.json` como `android.googleServicesFile`, subir a
credencial FCM v1 no EAS (`eas credentials`) e fazer uma build nova. Até lá o
push remoto continua morto e só o lembrete local funciona.

Detalhe do agendamento local que vale saber: o lembrete do dia é
propositalmente cancelado quando já houve lançamento no dia (`jaLancouHoje`).
Quem lança todo dia antes das 12h/20h30 naturalmente vê poucos lembretes.

### Build 1.8.3 enviada e concluída (07/09/2026)

Build EAS `74bd28fe-2222-4f90-87f9-21ff913b765e` — **sucesso na primeira
tentativa**, sem repetir a falha de Gradle da 1.7.0. Autorizada
explicitamente pelo autor antes de sair ("quando finalizar e garantir que
está tudo certo, commit e dispare build"). Link de instalação:
`https://expo.dev/accounts/gabriouss/projects/grana-app/builds/74bd28fe-2222-4f90-87f9-21ff913b765e`

Carrega: correção do histórico do Granabô (lado da leitura), lembretes de
almoço e noite agendados no boot sem depender da tela Início, mensagem
honesta para falha permanente no lançamento por voz, as duas correções de
sincronização de voz do Codex (`12d75d9`, `26d6c63`) e a faixa de aviso que
deixou de cobrir a barra de status.

**Continua fora do ar até alguém mexer no Firebase/EAS**: o push remoto. Ver
a seção acima sobre `google-services.json` e credencial FCM v1.

## 07/09/2026 (fim do dia) — FCM configurado e verificado; build segurada a pedido do autor

O push remoto deixou de estar bloqueado. A configuração que faltava desde
04/09 foi feita nesta sessão, com o autor conduzindo as partes que dependiam
da conta Google:

- Projeto Firebase `granaponto`, app Android registrado com o pacote
  `com.gabriouss.grana`.
- `google-services.json` commitado (`9b924ea`). A chave de API dele não é
  segredo (viaja dentro de todo APK), mas como o repositório é público ela
  foi **restringida** no Google Cloud Console por pacote + SHA-1 do keystore
  do EAS (`13:F8:38:A1:0E:86:72:04:1C:B9:F4:60:A6:70:20:30:DF:E5:1F:A7`,
  obtido por consulta à API do EAS, não chutado).
- Chave de conta de serviço enviada ao EAS via `eas credentials` (a CLI só
  funciona em terminal interativo de verdade — não dá para automatizar daqui,
  o autor rodou). **Verificada por consulta à API**:
  `googleServiceAccountKeyForFcmV1` saiu de `null` para
  `firebase-adminsdk-fbsvc@granaponto.iam.gserviceaccount.com`. A chave
  privada nunca entrou no repositório, e as cópias locais foram apagadas.

**Nenhuma build foi disparada.** O autor pediu para segurar e soltar junto
com as próximas melhorias: "preciso ver se vai surgir alguma melhoria antes
para soltar tudo junto, já atualizamos muitas vezes em pouco tempo".

**Consequência importante para a próxima sessão:** `push_tokens` continua
vazia, e isso é **esperado**, não é bug. O `google-services.json` só entra no
APK em tempo de compilação, então nada de push funciona até sair uma build
nova e o app ser aberto uma vez no aparelho. Não refaça o diagnóstico —
o roteiro e a verificação estão em `docs/PUSH_FCM_SETUP.md`.

Quando a build sair, a versão precisa subir por `npm run build:preparar`
(ainda está em 1.8.3, que é a build já instalada).

## 08/09/2026 — alerta do GitHub sobre a chave do Firebase (resolvido, não é vazamento)

O GitHub disparou "Secrets detected — Google API Key" apontando
`google-services.json#L18`, commit `9b924ea`. **Não é vazamento, e não precisa
de rotação.** Fica registrado com a verificação para ninguém reabrir a
investigação a cada e-mail do scanner.

O que foi conferido no repositório, não no registro:

- O repositório é **público** (confirmado pela API do GitHub sem autenticação).
- **Nenhum arquivo do código importa Firebase.** O `google-services.json` só é
  lido pelo plugin do Gradle na hora de compilar o APK; o push sai por
  `expo-notifications` → serviço da Expo → FCM.
- O arquivo é mínimo: sem `oauth_client`, sem Firestore, sem Storage, sem
  Firebase Auth. É FCM e nada mais. Dado do usuário vive no Supabase, atrás de
  RLS e sessão — nada disso passa por essa chave.

Por que a chave não é segredo: chave de API do Firebase para Android
**identifica** o projeto, não **autoriza** acesso. Ela viaja dentro de todo APK
distribuído e qualquer pessoa extrai com um descompactador — esconder é
impossível por desenho, e a própria documentação do Google diz que pode ficar
em arquivo de configuração versionado.

O que de fato protege, e **foi confirmado pelo autor em 08/09/2026**: a chave
está restrita no Google Cloud por pacote (`com.gabriouss.grana`) + SHA-1 do
keystore do EAS. Sem a restrição o risco real não seria acesso a dado, seria
consumo de cota/cobrança em outras APIs do mesmo projeto. Com ela, a chave só
funciona a partir do app assinado.

**Ação:** fechar o alerta no GitHub como "won't fix". Se o aviso voltar a
incomodar, a alternativa é tirar o arquivo do git e injetá-lo pelo EAS no
build — some o alerta, mas não aumenta a segurança (a chave continua dentro do
APK) e acrescenta uma peça móvel ao build.

## 08/09/2026 — guarda de teclado no AppPressable (defeito latente, sem vítima)

A auditoria de 07/09 carimbou P1 em `AppPressable`: o `onKeyDown` que o projeto
adiciona por fora do `Pressable` chamava `onPress` sem consultar `disabled`, ou
seja, a barra de espaço acionava um controle que o mouse recusa.

Verificado antes de corrigir: **o defeito é real no código, mas não era
alcançável.** Os seis únicos lugares com papel `checkbox`/`radio`/`switch`
(`sign-up`, `ColorGridPicker`, `GoalsCarousel`, `TransactionSheet`,
`QrScannerModal`, `ToggleSwitch`) nunca recebem `disabled` — o `ToggleSwitch`
nem expõe essa prop. As linhas do Perfil que a feature flag desabilita têm
papel `button`, que não entra nessa condição. P1 superestimava: impacto atual
zero.

Corrigido mesmo assim, porque é armadilha para quem criar o primeiro switch
desabilitado: a guarda confere `disabled` E `accessibilityState.disabled`,
porque as duas formas anunciam "indisponível".

`tsc --noEmit` limpo e `test:parser` 100% depois da mudança.

## 08/09/2026 — PENDENCIAS.md apagado; os 5 itens que ainda eram reais migraram pra cá

`PENDENCIAS.md` foi escrito em 02/09/2026 por uma sessão sem login no app, sem
acesso ao banco de produção e sem aparelho físico — 1053 linhas do que sobrava
pra fazer dado esse limite. Desde então este arquivo (`context.md`) virou a
fonte de verdade real: é aqui que cada sessão registra o que fez. O
`PENDENCIAS.md` parou no tempo — chegou a descrever como pendente o Bloco 3
inteiro de interruptores remotos, já implementado há dias — e o autor pediu
pra apagá-lo.

Antes de apagar, um agente conferiu cada item listado **contra o código atual**,
não contra o texto do documento. A maioria já estava resolvida. Quatro itens
seguem abertos de verdade e não estavam registrados em nenhum outro lugar:

- **`lancamentos.tsx` sem otimização de lista.** A `FlatList` não tinha
  `initialNumToRender`/`windowSize`. **Resolvido na mesma sessão** — ver
  abaixo.
- **Avatares sem cache em disco.** `perfil.tsx`, `index.tsx` e
  `OnboardingModal.tsx` usavam o `<Image>` puro do React Native com `uri`
  remoto. **Resolvido na mesma sessão** — ver abaixo.
- **`components/BrandLogo.tsx` órfão.** **Resolvido na mesma sessão** — ver
  abaixo.

**O quarto item que eu tinha listado NÃO era pendência, e vale registrar o
erro.** Migrei do `PENDENCIAS.md` um item dizendo que Início e Gráficos
buscam o histórico inteiro "sem paginação, aguardando agregação no banco".
Ao ir corrigir, li os comentários do próprio código e a história é outra, mais
atual que o documento de 02/09:

- `app/(app)/index.tsx:319-328` diz, com todas as letras, que a busca sem
  `sinceDays` é **de propósito**: a Início navega por mês, inclusive meses
  antigos, e uma janela curta mostraria mês vazio em vez de mês lento. Mais
  importante: **o saldo não depende mais disso** — ele vem do banco via
  `saldos_por_carteira` (`refreshSaldos()`). O que restou dependendo do
  histórico completo é só a navegação por mês. A mitigação escolhida foi
  outra: não repetir a busca cara a cada foco de tela (`carregarDadosLeves`).
- `app/(app)/graficos.tsx:98-109` já usa `fetchTransactionsDoPeriodo` quando
  há período selecionado, e só cai no histórico completo em "Ano a Ano"/"Mês a
  Mês" — modos que montam a régua a partir do primeiro e do último lançamento
  existentes, onde recortar mudaria o eixo. E ainda cacheia (`historicoCache`).

Ou seja: a parte perigosa (saldo errado) já foi resolvida com agregação no
banco, e o que sobra é deliberado e documentado no ponto de uso. A auditoria
de 28/08 já tinha tentado encurtar essa janela e revertido. **Não tentar de
novo.**

A lição, de novo a mesma do dia: o `PENDENCIAS.md` descrevia o mundo de
02/09, e eu o tratei como estado atual. Comentário no ponto de uso envelhece
melhor que documento paralelo — foi o comentário que corrigiu o registro.

## 08/09/2026 — os três itens reais, resolvidos

- **`lancamentos.tsx`**: ganhou `initialNumToRender={8}` e `windowSize={5}`,
  mesmo par que `credito.tsx` já usava. Importa mais aqui porque a importação
  de extrato aceita 10 mil lançamentos de uma vez. **Sem `getItemLayout` de
  propósito**: ele exige altura constante e `rowSub` não tem `numberOfLines` —
  em tela estreita a linha quebra em duas. Altura declarada errada não deixa a
  lista lenta, deixa a rolagem pulando pro lugar errado.
- **Avatares**: `expo-image` instalado (`~57.0.4`) e os três pontos
  (`perfil.tsx`, `index.tsx`, `OnboardingModal.tsx`) passaram a usar
  `contentFit="cover"` e `cachePolicy="disk"`. É **dependência nativa nova** —
  só passa a valer na próxima build.
- **`components/BrandLogo.tsx`**: apagado. Era o último órfão dos nove que o
  `PENDENCIAS.md` listava. O comentário de `BrandLogotype.tsx` que o citava foi
  atualizado, pra não apontar pra arquivo que não existe mais.

`tsc --noEmit` limpo e `test:parser` 100% depois das três mudanças.

`PENDENCIAS.md` foi removido do repositório nesta sessão. Não é mais o lugar
de registrar trabalho em aberto — esse lugar é este arquivo.

## 08/09/2026 — endurecimento para venda e carteiras no WhatsApp

Especificação aprovada e registrada em
`docs/superpowers/specs/2026-09-08-prontidao-venda-hardening-design.md`.

### O que foi implementado

- `kiwify-webhook` agora aceita o segredo somente no header
  `x-kiwify-token`; query string e campos de segredo no corpo foram removidos.
  A idempotência continua na RPC `processar_evento_kiwify`.
- Criada a Edge Function `delete-account`. Ela exige JWT, confere
  `last_sign_in_at` dentro de uma janela de 10 minutos, remove arquivos do
  bucket `avatars`, anonimiza feedbacks e remove o usuário via Auth Admin.
  Falha em qualquer etapa retorna erro visível e não finge exclusão completa.
- O vínculo automático de assinatura agora exige `auth.users.email_confirmed_at`.
  O vínculo por token continua disponível.
- Corrigido o resolver de carteira no app e no WhatsApp para ignorar acentos,
  reconhecer nomes personalizados e não escolher silenciosamente quando o
  nome é inexistente ou ambíguo.
- O WhatsApp passa `wallet_id` nas transações, parcelas e boletos; a carteira
  escolhida sobrevive enquanto o bot pergunta a categoria.
- Atualizadas as migrations
  `20260908120000_whatsapp_wallets.sql` e
  `20260908130000_assinatura_email_confirmado.sql`, além do `schema.sql`.
- Termos e página de exclusão agora dizem que o acesso atual é pago e foram
  atualizados para 8 de setembro de 2026.
- Novo corpus `__tests__/corpus-whatsapp-wallets.ts` cobre carteira padrão,
  personalizada, acento omitido, inexistente e ambígua.

### Produção — feito e verificado

- As duas migrations acima foram aplicadas no projeto Supabase de produção.
- Foram publicadas as Edge Functions `kiwify-webhook`, `whatsapp-webhook` e
  `delete-account`.
- Sondas sem autenticação devolveram 401 para Kiwify e exclusão de conta.
- A RPC de WhatsApp com `wallet_id`, a coluna de pendência e a guarda de
  e-mail confirmado foram confirmadas no banco.
- `app_backend_config.enforce_subscriptions` permanece `false`; nenhum bloqueio
  global foi ativado.
- Não foi disparado build.

### Verificação

- `npx tsc --noEmit`: passou.
- `deno check` das três Edge Functions: passou.
- `npm run test:voz`, `test:assistente-aprendizado`,
  `test:assistente-fatura`, `test:blur`, `test:motion`: passaram.
- `voice-fallback.cjs`, `voz-offline.cjs` e `widget-voz-cartoes.cjs`: passaram.
- O corpus completo de parser passou em voz, WhatsApp, categorias, cartões e
  102 casos novos de carteiras. A guarda de schema agora trata a migration
  histórica de voz separadamente e compara o baseline final com
  `20260908000000_voice_wallets.sql`, sem sobrescrever a migration da outra
  máquina.
- O lote de hardening para venda pública foi implementado localmente:
  vínculo de assinatura agora deixa recibo visível e log sem secrets; cobrança
  past_due não abre um segundo checkout; privacidade/termos cobrem push,
  voz no app/widget, Granabô/Gemini e memória; CI ganhou test:ci, Deno check
  e os testes reais de assinatura/quota; a quota de IA ganhou contador SQL
  atômico por usuário/canal em supabase/migrations/20260908140000_ai_usage_quotas.sql;
  e os artefatos de handoff estão em documentation/.
- A migration de quota foi aplicada no Supabase de produção pela API de
  gerenciamento e verificada com RLS, RPC protegida, fuso de São Paulo e sem
  leitura direta por `authenticated`. Depois dela, `assistente-financeiro` foi
  publicado na versão 21 e `processar-lancamento-voz` na versão 5; ambas estão
  ACTIVE com JWT obrigatório. A sonda sem JWT retornou `42501` como esperado.

### Ainda não comprovado / manual

Checklist para executar na outra máquina, nesta ordem:

0. **Quota de IA — concluído em 08/09/2026:**
   `20260908140000_ai_usage_quotas.sql` foi aplicada no Supabase de produção;
   `assistente-financeiro` e `processar-lancamento-voz` foram publicados depois
   dela. Resta apenas confirmar com uma conta autenticada que
   `consumir_cota_ia('assistente')` e `consumir_cota_ia('voz')` devolvem uma
   linha permitida; a sonda sem JWT já devolveu `42501`.

1. **Kiwify — header e segredo:** no painel do webhook, confirmar/configurar o
   envio do segredo no header `x-kiwify-token`. O valor precisa ser o mesmo do
   secret `KIWIFY_WEBHOOK_TOKEN` da Edge Function. Fazer uma rotação coordenada
   (atualizar os dois lados sem deixar o endpoint sem segredo) e disparar o
   evento de teste da Kiwify. A resposta esperada é 200; sem o header, 401 é
   intencional.
2. **Ciclo comercial:** com uma conta de teste, validar compra nova, vínculo
   pelo mesmo e-mail, ativação por token, renovação, cancelamento, reembolso e
   chargeback. Conferir `subscriptions`, `access_until` e o estado retornado por
   `obter_estado_acesso`. Manter
   `app_backend_config.enforce_subscriptions = false` até todos os cenários
   passarem; só então decidir a ativação global.
3. **Exclusão de conta:** criar uma conta descartável, confirmar o e-mail,
   entrar no app, reautenticar com a senha e usar Perfil → Excluir conta.
   Confirmar no painel que o usuário Auth, dados pessoais, avatar e vínculo do
   WhatsApp sumiram. Não testar isso em conta real.
4. **Build Android:** como este trabalho alterou o resolver de carteiras no
   app, gerar nova build somente com autorização explícita do autor. Antes,
   rodar `npm run build:preparar -- "<mensagem revisada>"`; depois executar o
   comando EAS impresso pelo script. Não subir versão nem mensagem à mão.
5. **Smoke test no aparelho:** instalar o APK e testar voz no app e no widget
   com `carteira pessoal`, `carteira empresa`, nomes com acento/sem acento,
   múltiplos cartões, crédito parcelado, recorrência, boleto e categoria
   personalizada. Confirmar que `push_tokens` recebe o token e que chegam as
   notificações interativas de almoço/noite.
6. **Distribuição:** publicar o APK como asset `grana.apk` no GitHub Release,
   confirmar a URL `/downloads/grana-latest.apk`, variáveis do Vercel/EAS e os
   botões/links de entrega nos e-mails e checkout da Kiwify. Fazer um download
   limpo e instalar fora do ambiente de desenvolvimento.
Além da distribuição, configurar EXPO_PUBLIC_KIWIFY_BILLING_URL na Vercel/EAS
somente se a Kiwify fornecer um link real de atualização de cobrança. Sem esse
link o app não abre um segundo checkout: orienta o usuário a usar o e-mail da
Kiwify e oferece o contato de suporte.

## 08/09/2026 — invariante de carteira no banco e no formulário

Foi criada e aplicada a migration `20260908150000_wallet_assignment_invariant.sql`.
Ela garante que `Total` permaneça apenas uma visão: inserts e updates sem
`wallet_id` recebem a carteira padrão do próprio usuário em transações,
cartões, boletos, metas, pagamentos de fatura e pendências de WhatsApp. Também
há uma única Principal por usuário e a exclusão de uma carteira secundária
reatribui seus dados à Principal; a Principal não pode ser excluída.

O formulário compartilhado de lançamento (`components/TransactionSheet.tsx`)
filtra o sentinel `total`, escolhe a Principal como fallback e rejeita qualquer
valor que não corresponda a uma carteira real. A verificação de produção
confirmou zero registros órfãos e todos os gatilhos/invariantes ativos.

## 08/09/2026 — correção da carteira Total na conta pessoal

O usuário confirmou que `Total` é apenas a visão agregada e que os lançamentos
devem pertencer à `Principal` ou a outra carteira real. Na conta pessoal, a
importação histórica havia gravado 389 transações com `wallet_id = NULL`; isso
fazia os lançamentos aparecerem em `Total`, mas desaparecerem ao selecionar
`Principal`.

### Produção — feito e verificado

- A conta pessoal foi acessada pelo endereço oficial informado pelo usuário.
- A carteira padrão `Principal` foi identificada sem alterar outras carteiras.
- Os 389 lançamentos sem carteira foram atualizados para o UUID da `Principal`.
- A verificação posterior retornou zero transações sem `wallet_id`.
- Havia 15 contas/boletos sem carteira; eles não foram alterados porque a
  solicitação era corrigir os lançamentos importados.
- A interface foi conferida depois da atualização: `Total` e `Principal`
  exibem o mesmo saldo e os lançamentos aparecem na Principal.

### Prevenção no app

Os caminhos de importação de extrato, leitura de QR, lançamento de conta/meta
na tela inicial e cadastro de cartão agora resolvem `wallet_id` para a carteira
padrão quando `Total` estiver selecionado. Assim, novos registros não voltam a
ser gravados sem carteira por causa do seletor agregado.

### Ainda não comprovado

- Não foi feita nova importação real de arquivo na conta pessoal após a mudança;
  validar uma pequena importação com `Total` selecionado antes da próxima
  build.
- Não foi disparado build Android; a mudança de código só entra no APK após o
  fluxo de build autorizado e preparado pelo script de release.

## 08/09/2026 — carteiras de crédito e boletos da conta pessoal

Após a correção dos lançamentos, foi feita uma segunda leitura autenticada da
mesma conta para os registros que também possuem `wallet_id`:

- 1 cartão de crédito estava sem carteira e foi vinculado à `Principal`.
- 15 boletos/contas estavam sem carteira e foram vinculados à `Principal`.
- Não havia pagamentos de fatura em `credit_card_invoices` sem carteira.
- A verificação posterior retornou zero cartões, boletos ou pagamentos de fatura
  sem carteira.

Nenhum valor, limite, vencimento, status ou lançamento foi alterado; somente a
carteira de destino foi preenchida. A sessão usada para a correção foi encerrada
ao final. Não foi disparado build.

## 08/09/2026 — auditoria impeccable: correções P0/P1 e a descoberta do `+html.tsx` inerte

Relatório completo em `docs/IMPECCABLE_AUDIT_APP_WEB_20260908.md` (11/20 web,
12/20 nativo — a queda contra os 14/12 de 07/09 é **alcance**, não regressão: a
rodada anterior parou em ~10 componentes e esta varreu `lib/`, o PDF, o build
web e o comportamento em paisagem).

**Aviso sobre o commit `2dc7146`.** A mensagem dele fala de carteiras, mas ele
carrega junto todo o lote 2 desta auditoria — outro agente rodando neste mesmo
diretório commitou a árvore inteira, incluindo trabalho meu ainda não
commitado. Nada se perdeu e nada quebrou; o histórico é que ficou ilegível
nesse ponto. Fica registrado aqui para quem for procurar depois. **Dois agentes
no mesmo diretório de trabalho colidem assim**: commitar em lotes menores
reduz a janela.

### Fechado no lote 1 (`36cff7c`)

- **P0**: saída de dinheiro saía em vermelho no PDF exportado. Entrada e saída
  agora são a mesma família cromática escurecida para papel (5,27:1 e 5,12:1
  sobre branco), escolhidas para **pesar igual**.
- **P1**: `entradaBorda`/`saidaBorda` reconstruíam o semáforo verde/vermelho.
  `#bb6b60` (que era a cor da categoria Alimentação, reaproveitada por engano)
  virou `#4f8894` — mesmo matiz ciano da marca com L e S idênticos aos do verde.
- **P1**: `VozesSalvasLocalmente` caía na fonte do sistema, sem `fontFamily`
  nenhuma; ganhou também `minHeight: touchTarget` (dava ~36dp contra 48dp),
  região viva e `busy`.
- **P1**: botão do WhatsApp em `PareamentoWhatsapp` tinha contraste 1,98:1.
  Passou a `theme.paper`: 8,36:1.
- **Sistêmico**: o corpus de design system pegava fonte ERRADA e não fonte
  AUSENTE, e parava em `app/`+`components/`. Agora varre `lib/` e acusa estilo
  com `fontSize` sozinho sem família. Provado contra a versão anterior do
  arquivo no git.

### Fechado no lote 2 (dentro de `2dc7146`)

- Insets laterais nas 8 telas (`edges={['top','left','right']}`): em paisagem
  num aparelho com recorte o inset é ~59pt contra 20pt de margem.
- Granachat passou a tratar o **Voltar do Android** e o **Esc**: era `View`
  absoluta, não `<Modal>`, então não herdava `onRequestClose` e o Back saía da
  aba com o chat aberto.
- Modais do Perfil sobem com o teclado, usando `useKeyboardHeight` (o projeto
  decidiu não usar `KeyboardAvoidingView` desde o edge-to-edge do SDK 54).
- `SideNav` anuncia o Granabô como `button`, não `link` sem destino.
- Estado de carregamento de Desafios ganhou área segura.
- **Ícones: 19 famílias → 1.** Os 57 imports saíram do barril
  `@expo/vector-icons` para `@expo/vector-icons/Ionicons`. Medido em
  `expo export`: **3,89 MB → 0,37 MB** de `.ttf`, com guarda novo no corpus
  impedindo o barril de voltar (é o import que o editor sugere sozinho).

### A descoberta que vale mais que o achado original

A auditoria dizia que o CSS global do `app/+html.tsx` não chegava ao build. É
verdade, mas o motivo é maior: **`+html.tsx` é ignorado por completo**. O
`index.html` publicado é, byte a byte, o template padrão da Expo
(`@expo/cli/static/template/index.html`) — mesmo `httpEquiv`, mesma string de
`viewport`, mesmo `<style id="expo-reset">`.

Provado inserindo uma `<meta>` marcadora que nunca apareceu no export, mesmo
depois de limpar `.expo`, `node_modules/.cache` e exportar com `--clear`. O
`expo-router` só honra `+html.tsx` quando `web.output` é `"static"`; o
`app.json` não define a chave, então vale `"single"` (SPA).

Consequência: o CSS de legibilidade da Neue Machina, o `lang="pt-BR"` e o
`viewport-fit` nunca valeram. Movido para `instalarDocumentoWeb()` em
`lib/foco-web.ts`, que injeta em runtime — mesmo caminho que o anel de foco já
usava — em vez de trocar o modo de renderização do site inteiro. Junto entrou
o CSS de `:-webkit-autofill`, que impedia o Chrome de pintar campo
autopreenchido com fundo claro dentro da UI petróleo.

O `+html.tsx` foi mantido, com um aviso no topo explicando que está inerte e
que volta a valer sozinho se alguém ligar `web.output: "static"`.

### Aberto de propósito

- **Sete itens na barra** (6 destinos + a ação do Granabô) contra o teto de 5
  do HIG e do Material 3. **Não mexi**: reduzir significa decidir qual seção
  deixa de ser aba, e isso é produto, não craft. O botão central já está certo
  (`button` + `expanded`, não destino) e não deve ser desfeito junto.
- **`srcset` nas imagens do herói**: exige variantes redimensionadas e este
  ambiente não tem nenhum conversor de imagem (`cwebp`, `magick`, `sips`,
  `ffmpeg`). Pendente de asset, não de código.
- **Cascata de render da Início**: 64 `useState` e nenhum `memo`; digitar num
  campo reconstrói `HOME_BLOCOS` inteiro, inclusive blocos ocultos. É o maior
  ganho de performance que sobrou, e também o refactor mais arriscado — fica
  para uma rodada com verificação em aparelho.

## 08/09/2026 — preparação autorizada do Android 1.8.4

O autor informou que Claude concluiu as correções e autorizou explicitamente
uma nova build. `npm run test:ci` completo e `npx tsc --noEmit` passaram.
O script obrigatório `build:preparar` elevou 1.8.3 para 1.8.4 e aprovou a nota:
"Melhora o lançamento por voz e os widgets, corrige a seleção de carteiras e aprimora as telas e as respostas do Granabô."

EAS preview e production já possuem EXPO_PUBLIC_ANDROID_DOWNLOAD_URL com
https://granaponto.com.br/downloads/grana-latest.apk. O autor configurou a
variável na Vercel e foi orientado a redeployar. O download público retornava
404 antes da publicação do asset grana.apk; ainda exige verificação após release.
Build será enviada após este commit. Testes em Android real e publicação do
APK ainda pendentes; testes automatizados não comprovam instalação no aparelho.

Build enviada ao EAS: 99b1a002-dd9b-467f-9cfb-cfed3a24deb2, Android 1.8.4, versionCode 11, commit 3d37c34. Upload e fingerprint concluídos. Novo fetch confirmou HEAD sem divergência de origin/main; 155 arquivos mudaram desde o APK 1.8.3 (17a08baf). APK ainda aguardando conclusão e teste real.

## 09/09/2026 — consolidação: tudo numa linha só

O autor pediu para mesclar todo o progresso espalhado numa "linha" só,
descartando o que fosse regressão. O inventário achou 4 worktrees, 7 branches
locais, 5 branches remotas e 1 stash. Cada item foi julgado contra o código
atual, não contra o nome ou a data.

**Resgatado (1 item).** `preview/copy-landing` (28/08, 2 commits) tinha visto
um problema real no `components/FaqItem.tsx`: `resposta` com `lineHeight: 21`
cravado e `pergunta` sem entrelinha nenhuma. Na web `type.apoio` vale 16, o
que dava razão 1,31 — abaixo do 1,4 do papel `apoio`; e a Neue Machina tem
leading intrínseco curto, então pergunta de duas linhas saía embolada. A
branch corrigia multiplicando na mão (`type.corpo * 1.4`); o master ganhou
`lh()`/`leading` depois disso, então o resgate foi portado para o idioma
atual (commit `8fca3c5`).

**Descartado, com o motivo.** O resto de `preview/copy-landing`: o hash de CSP
do `vercel.json` é da build daquela branch e quebraria o site atual; o copy do
`landing-meta.json` ainda anuncia WhatsApp (banido na Meta) e "comece grátis"
(hoje há assinatura de R$ 9,90); as props `ajuste`/`escala` do
`NotebookAnimado` não teriam chamador, porque o master invoca
`<NotebookAnimado />` sem props, e o modo `cobrir` é matematicamente idêntico
ao código atual.

`fix/header-overflow` (31/08, 1 commit) estava meio dentro e meio errada: o
`minWidth: 0` em `leftCol`/`texts` já está no master com comentário próprio,
e o `numberOfLines={1}` é exatamente a regressão que o comentário do
`ScreenHeader.tsx` descreve ("Lançamentos" virando "Lança..." com altura
sobrando logo abaixo). Nada a resgatar. SHA `1300835`, se algum dia precisar.

O stash `wip-featureflags-duplicado-antes-de-reconciliar` estava 205 commits
atrás do master. O nome não mentia: o master tem `lib/feature-flags.tsx`,
`lib/feature-flags-regras.ts`, `components/AvisoFlagModal.tsx` e 14
consumidores — implementação estritamente mais completa que a do stash,
incluindo o flag `lancamento_voz` do widget, que nem existia em 02/09.
Aplicá-lo reverteria 205 commits nos arquivos que toca. SHA
`b38846a267ca47e2f81290af2bccde6c4fe97d1a`.

As 3 worktrees de agente e a `codex/correcao-voz-184` não tinham nada
exclusivo — a do Codex foi conferida arquivo a arquivo contra o master
(ignorando CRLF) e as únicas diferenças eram o `AGENTS.md` e o `FaqItem.tsx`
alterados hoje, depois dela. As branches `local/imagens-landing`,
`claude/grana-landing-page-design-df5etm`, `claude/repository-analysis-j56mv1`
e `origin/master` têm zero commits fora do master.

**Estado final local:** uma branch (`master`), zero worktrees, zero stash.
Removê-las exigiu limpar atributos no PowerShell — o `git worktree remove` deu
"Permission denied" no Windows e deixou os diretórios de administração em
`.git/worktrees/` para trás.

**Verificado:** `npx tsc --noEmit` limpo; `test:parser` 1126/1126 guardas do
design system, 17/17 interruptores, 39/39 em sincronia; `test:blur` e
`test:motion` OK. **Não verificado:** a mudança do FaqItem não foi vista em
aparelho nem no navegador — a entrelinha é derivada dos mesmos tokens que o
resto do app já usa, mas ninguém olhou o FAQ renderizado depois dela.

**Pendente de aprovação do autor:** 3 commits locais (`e7ab948`, `a6cd8de`,
`8fca3c5`) ainda não publicados, e as 4 branches remotas obsoletas
(`preview/copy-landing`, `master`, `claude/grana-landing-page-design-df5etm`,
`claude/repository-analysis-j56mv1`) ainda estão no GitHub — apagá-las é um
push, e push depende de pedido explícito.

## 09/09/2026 — o app não funcionava sem internet

O autor perguntou se o app e o lançamento por voz funcionavam offline e disse
que precisam funcionar. Não funcionavam, e a causa era uma só.

**O diagnóstico.** `lib/entitlement-context.tsx` chamava a RPC
`obter_estado_acesso` e, em QUALQUER erro — inclusive falta de rede —, caía num
`catch` que definia `allowed: false`. Não havia cache em disco dessa resposta.
O `app/_layout.tsx` então roteava para a tela de assinatura. Na prática, um
cliente pagante que abrisse o Grana. sem internet via a tela de venda.

O comentário no código chamava isso de falha fechada proposital, com o
argumento de que o RLS negaria os dados de qualquer forma. O argumento tinha um
furo: `lib/offline-cache.ts` já implementa cache de lançamentos e fila de
pendentes, e `lib/widget-voz-pendentes.ts` já guarda áudios gravados sem rede.
Tudo isso ficava inalcançável, atrás de um portão que exigia estar online para
abrir. É o mesmo padrão da regra 9 do AGENTS.md, por outro ângulo: um `catch`
tratando falha temporária como veredito permanente.

**A correção.** Novo `lib/entitlement-cache.ts` guarda a última resposta boa do
servidor, por usuário. Quando a rede falha, o acesso passa a valer até o prazo
que o próprio servidor prometeu (`access_until`/`grace_until`, o maior dos
dois), em vez de uma janela de tolerância inventada — política escolhida pelo
autor entre três opções. Quem cancelou perde o acesso quando o período pago
vence, mesmo sem nunca mais abrir o app com internet. Instalação nova sem rede
continua bloqueada, porque não há cache.

A queda para o cache acontece SÓ em erro de rede (`isLikelyNetworkError`).
Falha permanente, como uma RPC que não existe, continua falhando fechada e
agora registra `causa: 'falha permanente'` no log — para não repetir o caso do
`PGRST202` que virou estado benigno e deixou uma feature fora do ar por dias.
`signOut` apaga o cache, e o registro é chaveado por usuário, então trocar de
conta no mesmo aparelho não herda o prazo da anterior.

**Sobre a voz offline.** O fluxo já tenta reconhecimento no próprio aparelho
antes da rede (`lib/voz.ts` chama `transcreverNoAparelho`). Mas na build 1.8.4
esse caminho não tem como funcionar: ele entrega ao reconhecedor o arquivo m4a
declarando `audioEncoding: 2` (PCM cru). O `VoicePcmDecoder.kt` que decodifica
de verdade é do commit `e7ab948`, que não está na 1.8.4. Ou seja, **voz offline
só passa a funcionar numa build nova** — a correção deste commit resolve o
bloqueio do app, não a transcrição sem rede.

**Verificado:** `npx tsc --noEmit` limpo e `npm run test:ci` completo, saída 0,
incluindo o teste novo `__tests__/entitlement-offline.cjs` (16 verificações
contra o módulo real, com `AsyncStorage` dublê), já encadeado no `test:ci`.

**NÃO verificado — checklist de QA em aparelho:**
- Abrir o app em modo avião com sessão salva e confirmar que entra, em vez de
  cair na tela de assinatura.
- Confirmar que a tela de Lançamentos mostra a faixa "sem conexão" e os dados
  do cache.
- Lançar algo offline pelo formulário e confirmar a sincronização ao voltar a
  rede.
- Gravar pelo widget offline e confirmar que o áudio é preservado e retomado.
- Sair da conta offline e confirmar que não entra mais sem rede.

## 09/09/2026 — o valor escolhia a categoria

Relatado do aparelho: "Energético 18,99" foi lançado em Transporte. A
transcrição estava correta; a classificação não. Reproduzido contra o módulo
real antes de qualquer correção.

**Causa.** `'99'` é palavra-chave de Transporte (o aplicativo de corrida) e
`normalizarParaBusca` troca pontuação por espaço, então "18,99" virava
"18 99" e os centavos eram lidos como palavra. Não era caso raro: preço em
real quase sempre termina em ,99, e o defeito atingia todo lançamento sem
palavra-chave forte no texto — `cafe 4,99` só escapava porque "cafe" casava
antes. Como as 9 categorias fixas são testadas ANTES das personalizadas (isso
é deliberado, ver `__tests__/corpus-categorias-custom.ts`), o falso positivo
ainda impedia que a categoria "Energético" fosse sequer consultada.

**Segundo defeito, achado na mesma investigação.** A comparação não dobrava
acento. A lista fixa contornava isso repetindo variante a variante ('taxi' e
'táxi', 'metro' e 'metrô'), mas o nome de uma categoria criada pela pessoa não
tem como ser duplicado, e a transcrição por voz nem sempre devolve o acento:
"energetico" não encontrava "Energético".

**Correção.** `semValorMonetario` remove o número do VALOR antes da busca por
palavra-chave, e `normalizarParaBusca` passou a dobrar acento via NFD. Some o
valor, não todo número: "chamei um 99" continua caindo em Transporte, e
'office 365'/'b3' seguem intactos porque não têm separador decimal. A política
de "fixa vence custom" NÃO mudou.

Aplicado nas quatro cópias: `lib/heuristics.ts`,
`supabase/functions/_shared/category-keywords.ts` e os dois consumidores
(`whatsapp-webhook`, `assistente-financeiro`). `semValorMonetario` entrou na
lista do `__tests__/sync-parser.js`, que subiu de 39 para 40 pares vigiados,
para as cópias não divergirem.

**Verificado:** `npx tsc --noEmit` limpo e `npm run test:ci` completo, saída 0
— 250.200 casos do corpus do WhatsApp, 34.093 do corpus de voz, 28/28 de
categoria custom (três deles rodando contra a cópia do bot, não a do app) e
40/40 em sincronia. Três arneses de teste precisaram passar a fornecer a
função nova; o primeiro só foi descoberto porque a suíte quebrou.

**NÃO verificado, e importante:** nada foi testado em aparelho. E a correção
não chega sozinha a lugar nenhum — a classificação por voz roda no CLIENTE
(`lib/widget-voz-task.ts` chama `guessCategoryFromText`), então **só vale com
APK novo**. As mudanças nas Edge Functions também exigem deploy; o Granabô em
produção segue com a versão antiga até lá.

**Sabidamente fora do alcance:** "Energético 99" sem centavos e sem "reais"
continua indo para Transporte. Nesse texto o número é genuinamente ambíguo
entre valor e nome do serviço, e resolver exigiria a heurística conhecer o
valor já extraído — hoje `guessCategoryFromText` recebe só o texto.

## 09/09/2026 — WhatsApp despriorizado, e o assistente publicado

**Decisão de produto do autor:** "Esquece WhatsApp. Não sei nem se iremos
voltar a utilizar." O app passou a ter lançamento por voz e chat próprios,
integrados, que cobrem o que o bot fazia. Não propor nem executar trabalho de
evolução desse canal: melhorias no webhook, reativação, copy ou CTA que
dependam dele. O interruptor remoto `whatsapp` está desligado em produção,
coerente com isso. `PRODUCT.md` ainda descreve a integração como operacional e
está desatualizado nesse ponto.

Correção geral que toque o webhook de raspão — como a do vocabulário de
categorias, hoje — segue valendo como higiene de código, para as cópias não
divergirem. Mas isso não é avanço de produto e **não justifica publicar aquela
função**.

**Publicado:** `assistente-financeiro` foi de v21 para v22, com a correção de
categoria. `verify_jwt=true` preservado, e a sonda sem login devolve o próprio
`nao_autenticado` da função, confirmando que o caminho novo está no ar.

**NÃO publicado, de propósito:** `whatsapp-webhook` segue na v68. Ele roda com
`verify_jwt=false` porque quem posta nele é a Meta, esse ajuste só existe no
servidor, e este repositório não tem `supabase/config.toml` — publicar pela
CLI passaria a exigir JWT e faria o webhook recusar toda mensagem. Sem
benefício algum enquanto o canal está desligado. Divergência registrada de
propósito: o repositório está À FRENTE da produção nessa função, que é o
sentido seguro (nada é apagado). Detalhes na regra 11 do `AGENTS.md`.

## 09/09/2026 — leitura do estado atual do lançamento por voz

Esta seção registra como a ferramenta funciona agora, para preservar o
encadeamento que está dando certo e evitar que uma correção futura trate app e
widget como dois motores diferentes.

### O fluxo real

O app e o widget têm entradas diferentes, mas convergem para a mesma cadeia:

1. **Captura.** O botão dentro do app grava M4A/AAC mono em 44,1 kHz e 64 kbps,
   por até 20 segundos, encerrando no segundo toque ou no corte automático. O
   widget usa um `ForegroundService` Android com a mesma configuração; encerra
   depois de 1,6 s de silêncio posterior à fala ou no limite de 20 s.
2. **Transcrição.** Ambos chamam `lib/voz.ts`. No Android 13+, quando o modelo
   `pt-BR` está instalado e o reconhecimento local está disponível, o aparelho
   converte o M4A para PCM e tenta transcrever sem rede. Se o caminho local não
   estiver disponível ou falhar, o áudio vai autenticado para
   `processar-lancamento-voz`, que usa Groq primeiro e OpenAI como fallback
   atrasado. A Edge Function transcreve; ela não interpreta carteira, cartão ou
   categoria.
3. **Interpretação.** O texto é interpretado no aparelho por
   `lib/heuristics.ts`, compartilhado entre app e widget. O mesmo núcleo extrai
   valor, tipo, categoria, categoria personalizada, carteira, forma de
   pagamento, crédito, cartão, parcelas, recorrência, boleto e vencimento.
4. **Persistência.** A operação recebe um `requestId`, é guardada antes da
   rede e chega à RPC `registrar_operacao_voz`. O banco valida usuário, acesso,
   carteira, cartão, tipo e valores; a operação é atômica e idempotente. Repetir
   o mesmo `requestId` devolve o resultado anterior, em vez de duplicar o
   lançamento.

### Diferença entre app e widget

Dentro do app, a fala preenche uma revisão visual: texto ouvido, descrição,
valor, tipo, categoria, carteira e metadados reconhecidos. Crédito abre a tela
de crédito para confirmar cartão/parcelas; boleto abre Contas para confirmar
vencimento; lançamento comum usa o modal de revisão. O usuário confirma antes
de salvar.

No widget, não há tela. Ele só grava automaticamente quando o valor, a
categoria, a carteira e, quando necessário, o cartão são inequívocos. Categoria
desconhecida, valor ambíguo, carteira não encontrada, múltiplos cartões sem
correspondência ou cartão incompatível com a carteira produzem notificação de
revisão; não viram uma escolha silenciosa.

Carteiras personalizadas são reconhecidas quando a fala as ancora em
`carteira <nome>` ou `conta <nome>`. Se nenhuma carteira for mencionada, usa-se
a carteira padrão. Cartões são filtrados pela carteira escolhida e casados por
nome, banco ou parte suficientemente longa do nome.

### Proteções que não podem ser removidas

- `precisaRevisarValorVoz` recusa valores sem evidência decimal, numerais
  partidos, separadores inválidos e mais de um valor decimal; ele prefere pedir
  revisão a inventar valor.
- `semValorMonetario` remove o preço antes da classificação, impedindo que
  centavos como `99` escolham Transporte; a busca também dobra acentos para
  reconhecer categorias personalizadas mesmo quando a transcrição perde o
  acento.
- O widget exige permissão de notificação antes de gravar, porque o recibo e o
  botão `Desfazer` são a única confirmação visível quando o app está fechado.
- Falha temporária de rede preserva áudio/operação e tenta novamente ao abrir,
  voltar ao primeiro plano e periodicamente. Falha permanente precisa aparecer
  como falha; não pode ser rotulada como sincronização pendente.
- O payload original e o `requestId` permanecem imutáveis durante a retomada.
  A RPC e as restrições de carteira/cartão são a última barreira contra
  duplicidade ou lançamento na conta errada.

### O motivo de o fluxo estar estável agora

O ganho não veio de uma heurística isolada. Veio de manter uma única sequência
de captura, transcrição, interpretação, validação, persistência idempotente e
recibo. App e widget compartilham `lib/voz.ts`, `lib/heuristics.ts` e
`lib/voice-operations.ts`; o widget não possui um parser financeiro paralelo.
As cópias server-side que ainda existem são vigiadas por `sync-parser.js`.

### Limites conhecidos

- No Android com modelo `pt-BR` local instalado, a transcrição local encerra o
  fluxo antes do Whisper. Portanto a paridade de caminho é garantida, mas a
  qualidade da transcrição pode variar por aparelho/modelo; não se deve afirmar
  que esse caminho sempre tem a mesma qualidade do Whisper do WhatsApp.
- O código foi coberto pelos testes automatizados de voz, fallback, valores,
  carteiras, cartões, offline e idempotência, mas ainda existe um gate manual:
  não houve validação física completa em Android real de modo avião, widget
  fechado, múltiplas carteiras/cartões, modelo local instalado e retomada após
  reconexão.
- A especificação inicial de voz e alguns comentários antigos ainda descrevem
  o fluxo anterior, em que a transcrição era somente remota. Para manutenção,
  esta seção e a implementação atual devem prevalecer sobre essa descrição
  histórica.

### Estado do working tree durante esta leitura

A leitura não alterou o código. Já havia uma alteração não commitada em
`supabase/functions/eas-build-webhook/index.ts` e o teste novo
`__tests__/eas-download-estavel.ts` não rastreado. A alteração do webhook ainda
falha em `deno check` porque `Deno.env.get('ANDROID_DOWNLOAD_URL')` pode ser
`undefined`, mas a função auxiliar aceita apenas `string`. Isso permanece
registrado como pendência técnica; não foi corrigido nesta leitura.

## 09/09/2026 — Cakto como segundo provedor de assinatura

O autor decidiu trocar o gateway para a Cakto, depois de um comparativo em que
recomendei outro caminho (Pix Automático, por causa da taxa fixa de R$ 2,49
pesar 25% num preço de R$ 9,90). Decisão dele, seguimos com a Cakto.

**O que já existia a favor.** O modelo de assinatura no banco sempre foi
agnóstico de provedor: a coluna `provider` existe desde o início e a função de
processamento recebe campos já normalizados pelo webhook. O que prendia tudo na
Kiwify eram duas restrições `check` e o nome da função.

**O que foi feito.** `processar_evento_kiwify` virou
`processar_evento_assinatura`, com `p_provider` como primeiro parâmetro —
renomear em vez de duplicar, para as duas integrações herdarem qualquer
correção de regra de assinatura em vez de divergirem em silêncio. Os
auxiliares de leitura de payload saíram de `_shared/kiwify.ts` para
`_shared/normalizar-webhook.ts`, compartilhados. Novos
`_shared/cakto.ts` e `cakto-webhook/`, escritos contra o exemplo LITERAL da
documentação oficial da Cakto.

**Duas diferenças da Cakto que moldaram o código, e que são piores que a
Kiwify:**

1. **Segredo no corpo.** A Cakto manda a chave em `secret`, dentro do JSON,
   em vez de assinatura HMAC em header. O `kiwify-webhook` tem um comentário
   dizendo explicitamente que segredo não deve viajar no JSON, porque JSON
   acaba em log, proxy e observabilidade — e é exatamente o que a Cakto faz.
   Quem capturar UM payload consegue forjar eventos. Não dá para consertar do
   nosso lado. Mitigado com comparação em tempo constante e a regra de NUNCA
   registrar o corpo em log, nem em erro.
2. **Sem reenvio.** A documentação diz que a Cakto trata qualquer resposta
   como entrega bem-sucedida. Não há retry. Um erro nosso perde o evento para
   sempre, e um `purchase_approved` perdido é alguém que pagou e ficou sem
   acesso. Todo caminho de falha grita no log com tipo e ids, marcado como
   `EVENTO PERDIDO`, para dar reconciliação manual. Vale notar que a função do
   banco tem um comentário assumindo que "o retry do provedor" resolveria o
   caso de evento fora de ordem — com a Cakto isso deixa de ser verdade.

**ORDEM DE IMPLANTAÇÃO, e ela importa.** A migration foi dividida em duas de
propósito. `20260909170000` cria a função nova e MANTÉM a antiga;
`20260909171000` só apaga a antiga. Entre as duas é obrigatório publicar os
dois webhooks. Apagar antes derruba a cobrança da Kiwify em produção, porque a
versão no ar ainda chama o nome antigo.

**Verificado:** `deno check` limpo nas quatro funções tocadas, `tsc` limpo e
`npm run test:ci` saída 0, incluindo o teste novo `__tests__/cakto-webhook.cjs`
(27 checagens contra os módulos reais) e 30/30 guardas do schema.

**NÃO verificado:** nada foi exercitado contra a Cakto de verdade. Nenhuma
compra real, nenhum webhook recebido, nenhuma assinatura criada. O tradutor foi
escrito contra a documentação, não contra tráfego observado.

**Pendente, e nada disso foi aplicado:**
- rodar a migration `20260909170000` em produção;
- criar o segredo `CAKTO_WEBHOOK_SECRET` no Supabase;
- publicar `cakto-webhook` (precisa de `--no-verify-jwt`, como os outros
  webhooks de provedor externo) e republicar `kiwify-webhook`;
- apontar o webhook no painel da Cakto para a função;
- configurar `EXPO_PUBLIC_CHECKOUT_URL` na Vercel e no EAS com
  `https://pay.cakto.com.br/esgddv2_1096987`;
- só depois de tudo isso, rodar `20260909171000`.

O texto legal (`lib/legal-content.ts`) passou a citar os dois provedores,
porque assinatura recorrente não se transfere: quem já paga continua na Kiwify
até cancelar, e os dois vão conviver por meses.

### Aplicado em produção no mesmo dia

O autor esclareceu que **não existe assinante real na Kiwify**: todos os
usuários da época eram testers que entraram por concessão manual
(`provider = 'interno'`), não por compra. Some, portanto, a preocupação de
convivência entre gateways que motivou dividir a migration — não havia base a
migrar. As duas migrations foram aplicadas no mesmo dia.

Estado em produção, conferido:

- `subscriptions_provider_check` e `webhook_events_provider_check` aceitam
  `cakto`;
- `processar_evento_assinatura` existe com `p_provider` como primeiro
  parâmetro e `service_role` executa;
- `processar_evento_kiwify` foi removida — só depois de os dois webhooks já
  chamarem o nome novo;
- `cakto-webhook` publicada (v1) e `kiwify-webhook` republicada, ambas com
  `verify_jwt=false`, e as duas recusam requisição sem credencial com 401;
- segredo `CAKTO_WEBHOOK_SECRET` criado.

O texto legal voltou a citar apenas a Cakto, já que não há assinatura anterior
em outro provedor para descrever.

### 10/09/2026 — metade do último pendente

Da lista acima sobrava só um item: `EXPO_PUBLIC_CHECKOUT_URL`. **No EAS está
feito**, criada como `plaintext` de projeto nos ambientes `production` e
`preview` com `https://pay.cakto.com.br/esgddv2_1096987`, e conferida por
`eas env:list` depois de gravar. Fica ao lado da `EXPO_PUBLIC_ANDROID_DOWNLOAD_URL`,
que já estava nos mesmos dois ambientes — foi assim que o link permanente do APK
entrou na 1.8.4.

**Na Vercel também está feito**, com token de um dia que o autor gerou para
isso. A variável foi criada nos três ambientes (`production`, `preview`,
`development`) e o deployment de produção foi refeito, porque `EXPO_PUBLIC_*` é
gravada dentro do arquivo no momento da compilação e variável nova não vale
retroativamente.

Antes do redeploy o bundle publicado continha `pay.kiwify.co` e não continha
`pay.cakto.com.br`; depois, o inverso, com o hash do arquivo mudando de
`index-24dfd276…` para `index-d2fd7560…`. O link da Kiwify sumiu por completo
do bundle, e não só deixou de ser usado: como o código é
`EXPO_PUBLIC_CHECKOUT_URL ?? EXPO_PUBLIC_KIWIFY_CHECKOUT_URL` e o primeiro
agora é um literal não vazio, o minificador eliminou o segundo ramo. O fallback
é comprovadamente inalcançável na web.

Isso encerra a lista de pendentes da migração para a Cakto.

**A variável antiga `EXPO_PUBLIC_KIWIFY_CHECKOUT_URL` segue existindo na Vercel
(só em `production`), e o fallback segue no código.** Nenhum dos dois faz efeito
na web depois desta mudança, mas os dois ainda são a rede do APLICATIVO: a
1.8.4 instalada não tem checkout embutido de lado nenhum, então quem está nela
depende do que vier na próxima build. Remover o fallback só depois de uma APK
nova sair com a Cakto dentro.

Vale o mesmo para o aplicativo: a variável agora existe no EAS, mas só entra
numa APK nova. Quem tem a 1.8.4 instalada continua indo para o checkout antigo
até atualizar.

**Descoberta operacional, registrada na regra 11 do AGENTS.md:** criar um
segredo no Supabase reinstancia TODAS as Edge Functions e soma 1 na versão de
cada uma, sem tocar no código nem no `updated_at`. Um único `POST /secrets`
levou `eas-build-webhook` de v33 para v34 e `whatsapp-webhook` de v68 para v69.
Ler o número da versão como sinal de publicação levaria à conclusão errada.

**Continua NÃO verificado:** nenhuma compra real passou pela Cakto. O tradutor
foi escrito contra a documentação, não contra tráfego observado. Falta apontar
o webhook no painel da Cakto e configurar `EXPO_PUBLIC_CHECKOUT_URL` na Vercel
e no EAS com `https://pay.cakto.com.br/esgddv2_1096987`.

## 09/09/2026 — link do APK e webhook de build, aplicados

Fechados os pendentes que sobraram da rodada do link estável:

- segredo `ANDROID_DOWNLOAD_URL` criado no Supabase, com
  `https://granaponto.com.br/downloads/grana-latest.apk`;
- `eas-build-webhook` republicada, então a partir da próxima build é o
  endereço estável que fica gravado, e não o artefato do EAS;
- `app_release` apontava para o artefato que vencia em 23/09 e passou a
  apontar para o link estável, com `apk_expires_at` nulo. Isso fecha o buraco
  de quem está numa build ANTERIOR à 1.8.4, que não tem a URL estável embutida
  e teria o aviso de atualização suprimido em silêncio a partir daquela data.

`verify_jwt` conferido em todas as funções depois dos deploys: `false` nos
quatro webhooks de provedor externo, `true` nas três que atendem o app logado.

## 09/09/2026 — pendências deixadas explicitamente para a outra máquina

O autor confirmou que salvou o webhook da Cakto no painel deles (URL, segredo
e os 6 eventos: compra aprovada, compra recusada, reembolso, chargeback,
assinatura renovada, assinatura cancelada — tipo de disparo Individual).
Ainda assim, **nenhum evento chegou** a `webhook_events` com
`provider = 'cakto'` até este ponto — zero linhas. A integração está pronta
dos dois lados, mas não foi exercitada de ponta a ponta.

O autor disse explicitamente que vai fazer os itens abaixo **na outra
máquina**, então a próxima sessão que abrir o projeto lá deve continuar a
partir daqui, não repetir o trabalho:

1. **Rotacionar o token do Supabase.** Um token de Management API
   (`sbp_e87f...`) circulou em texto puro nesta conversa/sessão. Ele tinha
   validade de 1 dia a partir de quando foi gerado (09/09/2026) e foi usado
   nesta máquina para aplicar as duas migrations da Cakto, criar os segredos
   `CAKTO_WEBHOOK_SECRET` e `ANDROID_DOWNLOAD_URL`, e publicar
   `cakto-webhook`, `kiwify-webhook` e `eas-build-webhook`. Revogar em
   https://supabase.com/dashboard/account/tokens e gerar um novo quando for
   preciso mexer no projeto pela API de novo.

2. **Configurar `EXPO_PUBLIC_CHECKOUT_URL`** na Vercel (Settings → Environment
   Variables, nos três ambientes, com redeploy depois — a variável só vale
   numa build nova do site) e no EAS (mesmo lugar onde
   `EXPO_PUBLIC_ANDROID_DOWNLOAD_URL` foi configurada, nos perfis `preview` e
   `production` — só vale numa build nova do app). Valor:
   `https://pay.cakto.com.br/esgddv2_1096987`, ou o que estiver de fato no
   painel da Cakto se tiver mudado. A variável antiga
   `EXPO_PUBLIC_KIWIFY_CHECKOUT_URL` pode ficar como rede de segurança (o
   código lê a nova primeiro) até a nova estar confirmada nos dois lugares.

3. **Fazer uma compra de teste real na Cakto** depois do passo 2, e conferir
   se o evento chegou (`select * from webhook_events where provider =
   'cakto'`) e se a assinatura foi criada em `subscriptions` com
   `provider = 'cakto'`. É o único jeito de validar a integração de ponta a
   ponta — tudo o que foi feito até aqui passou nos testes automatizados
   contra a documentação e o modelo do painel, mas nunca recebeu tráfego real.

Publicados nesta sessão (`origin/main` = `5113247`): correção do link estável
do APK, toda a integração da Cakto (incluindo a correção de data de evento
achada ao conferir o modelo do painel), a regra 11 do AGENTS.md, e a aplicação
em produção do segredo `ANDROID_DOWNLOAD_URL` e do `app_release` apontando
para o link estável.

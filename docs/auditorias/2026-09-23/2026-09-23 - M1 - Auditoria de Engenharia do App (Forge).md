---
tags: [grana, auditoria]
tipo: registro
data: 2026-09-23
---

# 2026-09-23 - M1 - Auditoria de Engenharia do App (Forge)

Codinome no Maestri: **Forge** (`maestri list` → "you", papel "App Engineer").
IDs dos achados usam o prefixo **F**.

**Pedido.** Do autor, repassado pelo Codex: "auditoria rigorosa de seus
próprios segmentos dentro do projeto. Ao terminarem, documentem todos os
achados." Segmento do Forge (App Engineer): código React Native/Expo em
`app/`, `components/`, `lib/`, `hooks/` e `scripts/`; todas as suítes de teste
e `tsc`; paridade de voz app x widget (regra 13); `catch` que engole erro,
caminhos de falha sem recibo, retry fora do prazo (regra 9); offline e fila;
`app.json`, `eas.json` (regra 8), `.easignore` e a trava de env; dependências
e versão do Expo 57.

Só leitura. Nada alterado em código, config, banco, Supabase, Vercel, Cakto,
Resend ou EAS. Nenhum commit. Emulador não usado (ocupado pelo Sentinel).

**Skills usadas.** `intended-vs-implemented` (promessa/regra documentada x
código citado, em cada achado — mesmo método do Compass e do Ledger nesta
rodada), `test-scenarios` (para nomear os casos que faltam nas suítes
existentes), `pre-mortem` (nos caminhos de falha de voz/offline/fila —
"assumindo que isso falha em produção, por quê"), `ponytail` em modo revisão
(sinalizar excesso de engenharia sem alterar nada), `improve-animations` e
`find-animation-opportunities` (somente leitura, no motion do app, não da
landing), `supabase-postgres-best-practices` (nas consultas do cliente em
`lib/`), `shipping-artifacts` (o repositório já tem `documentation/`; usei
`tests.md`, `flows.md` e `architecture.md` como o lado "intenção documentada"
do método `intended-vs-implemented`) e `web-design-guidelines` (na versão web
do Expo, pelo portal "Navegador Forge"). A disciplina da regra 9 do
`AGENTS.md` (comprovado x hipótese, recibo em caminho de falha, retry dentro
do orçamento de quem chama) corre por baixo de tudo isso.

**Navegador.** Portal dedicado "Navegador Forge" (`maestri list`), já aberto
em `https://www.granaponto.com.br` — não uso os portais compartilhados
"Landing desktop"/"Landing mobile". Sem login com conta real, sem compra, sem
formulário com dado real.

## Inventário do repositório (regra 10)

- Branch única `main`, sincronizada com `origin/main` (`879ac32`), sem branch
  extra, sem worktree extra, sem stash.
- `git status`: `M .claude/settings.json` e `M PRODUCT.md` — já documentados
  e em aberto por [[2026-09-23 - M1 - Auditoria de Documentação e Vault (Ledger)|L1 e L2 do Ledger]];
  não duplico aqui, só registro que não mexi neles.

## Cobertura

- [x] `tsc --noEmit -p .` — **exit 0, zero erros**, árvore de trabalho atual.
- [x] Inventário dos scripts de teste do `package.json`: `test:voz`,
      `test:assistente-fatura`, `test:assistente-aprendizado`, `test:blur`,
      `test:motion`, `test:ci`, `test:parser`, `test:saldos`, `notas:check`,
      `build:preparar` — dez scripts ao todo, não um. `test:ci` invoca
      `npm run test:voz && test:assistente-aprendizado && test:assistente-fatura
      && test:blur && test:motion && ... && test:parser` como sub-chamadas reais
      (`package.json:61`), então rodar `test:ci` uma vez cobre os seis nomeados
      pelo pedido mais ~30 arquivos adicionais de `__tests__/` sem script
      próprio. Achado sobre 2 arquivos que **nenhum** script alcança: F1.
- [x] `npm run test:ci` — **passou por completo, exit 0.** Toda a saída (776
      linhas) lida; nenhuma falha, nenhum "FAIL", nenhum stack trace. Inclui
      `test:parser` no fim (108/108, 250200/250200, 16332/16332, 34093/34093,
      1322/1322 guardas do design system, 264/264 da trava de env, 75/75 em
      sincronia — a lista completa de contadores está no log, omitida aqui por
      tamanho).
- [x] Paridade de voz app x widget (regra 13) — ver F2.
- [x] `catch` que engole erro / caminho de falha sem recibo / retry fora do
      orçamento (regra 9) — ver F3, F4.
- [x] Offline e fila — ver F2, F4, F5.
- [x] `app.json`, `eas.json` (regra 8), `.easignore`, trava de env — ver F6.
      Sem achado: os dois perfis (`preview`/`production`) continuam com
      `distribution: internal` e `android.buildType: apk` idênticos
      (`eas.json`), e `npx tsx __tests__/corpus-env-fora-da-build.ts` (parte do
      `test:parser`) passou 264/264.
- [x] Dependências e versão do Expo 57 — ver F7.
- [x] Navegador web (portal "Navegador Forge"): login com a conta de teste,
      `/sign-in` → `/lancamentos` sem erro de console, CSP bloqueia
      `evaluate`/`eval` (comportamento correto, não é achado), clique em
      "Lançar por voz" sem reação visível no snapshot nem no console — ver F8
      (inconclusivo, não confirmado).

## Achados

### F1 · P3 · Dois arquivos de teste reais em `__tests__/` não são alcançados por NENHUM script do `package.json`

- **Onde.** `__tests__/corpus-carteiras-voz.ts` e `__tests__/side-nav.cjs`.
- **Evidência.** `ls __tests__ | sort` contra os nomes de arquivo referenciados
  em qualquer script de `package.json` (`grep -oE
  '__tests__/[a-zA-Z0-9_.-]+\.(cjs|ts|js)' package.json`): a diferença dá
  quatro arquivos, dois dos quais (`extenso.ts`, `extrair.ts`) são módulos
  auxiliares sem asserção, importados por outros corpora — não são suítes.
  Os outros dois têm asserção real e passam sozinhos:
  `npx tsx __tests__/corpus-carteiras-voz.ts` → "OK — nomes personalizados de
  carteira reconhecidos e removidos da descrição." (testa
  `lib/heuristics.ts: limparReferenciaCarteira`/`matchWalletByText`);
  `node __tests__/side-nav.cjs` → "SideNav: clique comum navega uma vez; 5
  cliques modificados preservam comportamento do navegador." (testa
  `components/SideNav.tsx`, lido do arquivo real via `ts.transpileModule`,
  como a regra 9 pede). Nenhum dos dois aparece em `test:ci`, `test:parser`
  nem em nenhum outro script.
- **Esperado x encontrado.** A regra 9 do `AGENTS.md` diz "liste os scripts
  antes de afirmar que algo não tem teste" — o inverso também vale: um teste
  que existe mas não roda em CI é indistinguível de nenhum teste, porque uma
  regressão em `lib/heuristics.ts` (correspondência de carteira por voz) ou em
  `components/SideNav.tsx` (clique modificado) passa por `npm run test:ci`
  sem ser pega.
- **Comprovado.**
- **Sugestão.** Adicionar os dois a `test:ci` (ou a um script próprio, ex.
  `test:ui`), do mesmo jeito que os outros arquivos soltos de `__tests__/` já
  entram — um `&& node __tests__/side-nav.cjs && npx --yes tsx
  __tests__/corpus-carteiras-voz.ts` no fim de `test:ci` resolve sem criar
  script novo.

### F2 · P2 · Paridade de voz (regra 13): o orçamento de tempo diverge por origem, e a letra da regra 13 não abre essa exceção

- **Onde.** `lib/voz.ts:70` (`ORCAMENTO_COM_PESSOA_ESPERANDO_MS = 15_000`) e
  `lib/widget-voz-task.ts:155-161` (`orcamentoMs: payload.source === 'app' ?
  ORCAMENTO_COM_PESSOA_ESPERANDO_MS : undefined`).
- **Evidência.** Lido o núcleo inteiro: `executarTarefa` (`lib/widget-voz-task.ts`)
  é chamado tanto por `components/VoiceEntryButton.tsx:140` (`source: 'app'`)
  quanto pela tarefa headless do Android (`AppRegistry.registerHeadlessTask`,
  mesmo arquivo, linha 500). Toda a lógica de DECISÃO — `matchWalletByText`,
  `guessAmountFromText`, `guessCategoryFromText`, `parseParcelas`,
  `ehIntencaoCredito`, os limiares de "pedir revisão" — roda em `processar()`
  sem nenhum `if (source === ...)`: é o mesmo código, com os mesmos limiares,
  para as duas origens. A ÚNICA divergência por origem que encontrei é o prazo
  de rede: o app corta a chamada a `transcreverAudio` em 15s (`lib/voz.ts:62-70`,
  comentado como "orçamento de quem tem uma PESSOA esperando na tela"), o
  widget usa o padrão de `lib/voz.ts` (60s, `TIMEOUT_TOTAL_MS`), porque o
  Android só mata a tarefa headless aos 120s.
- **Esperado x encontrado.** A regra 13 do `AGENTS.md` diz, literalmente:
  "Nenhuma entrada pode aceitar silenciosamente o que a outra considera
  ambíguo, **nem ter timeout, fallback ou política de retenção próprios**" — e
  reforça: "Divergência existente é dívida, não exceção autorizada
  (...) implementações anteriores que justifiquem comportamentos diferentes
  não prevalecem sobre esta regra." O código tem exatamente isso: um timeout
  próprio por origem. A justificativa no comentário é a mesma lógica da regra
  9 ("Retry e fallback precisam caber no prazo de quem chama") e cita o
  incidente que a gerou (achado A47, botão preso em "Transcrevendo…" por >4min
  quando o app herdava o teto de 60s do widget) — ou seja, as regras 9 e 13
  puxam em direções opostas aqui: 9 pede orçamento ajustado a quem chama, 13
  proíbe timeout próprio por origem.
- **Comprovado** que o código diverge por origem nesse único ponto (prazo de
  rede). **Não comprovado** que essa divergência já produziu uma decisão
  diferente entre app e widget para a MESMA fala — não encontrei nenhum ramo
  de `processar()`/`lancarNoCredito()` que troque de comportamento por causa
  do timeout menor, só o app falhando mais cedo com `codigo: 'demorou'` (que
  vira fila local, igual ao caminho de rede ruim do widget) em vez de esperar
  mais. Ou seja, sob rede lenta, o app pode enfileirar uma fala que o widget,
  com mais tempo, teria transcrito na hora — a fala não se perde (vai pra
  `widget-voz-pendentes.ts` nos dois casos), mas o RESULTADO IMEDIATO
  (salvou agora x foi pra fila) pode diferir pela mesma condição de rede.
- **Sugestão.** Não é óbvio que dá para eliminar sem reintroduzir o achado A47
  (regra 9). Três saídas possíveis, decisão do autor: (a) registrar
  explicitamente esta divergência como exceção documentada às regras 9 e 13
  juntas, apontando pra este achado; (b) considerar que "timeout" na regra 13
  se refere a decisão de negócio (o que conta como ambíguo, quando confirmar)
  e não a orçamento de rede, e ajustar a redação da regra 13 pra deixar isso
  explícito; (c) medir se 15s é suficiente também pro caso do widget (rede
  pior, sem pessoa olhando) e unificar num valor só. Não tentei nenhuma das
  três — é decisão de produto/regra, não bug a corrigir.

### F6 · sem achado · `app.json`, `eas.json`, `.easignore` e a trava de env — conferidos, sem divergência

- **Onde.** `eas.json` (perfis `preview`/`production`), `.easignore`,
  `scripts/env-fora-da-build.ts` via `__tests__/corpus-env-fora-da-build.ts`.
- **Evidência.** `eas.json`: os dois perfis têm `"distribution": "internal"` e
  `"android": {"buildType": "apk"}` idênticos (regra 8 — comparação linha a
  linha, sem achado). `.easignore` exclui `.env`/`.env.*` e preserva
  `.env.example` (bate com o alerta do topo do `AGENTS.md`: corrigido em
  `4ce2242`). `corpus-env-fora-da-build.ts`, parte de `test:parser`, passou
  264/264 dentro do `test:ci` já rodado.
- **Comprovado.** Sem achado — incluído para registrar que foi de fato
  conferido, não pulado.

### F7 · P2 · `expo-speech-recognition` está preso à SDK 56, uma major atrás do resto do projeto (Expo ~57.0.20), e continua em uso ativo

- **Onde.** `package.json` (`"expo-speech-recognition": "^56.0.1"`) x
  `"expo": "~57.0.20"` e as demais deps `expo-*` (todas `~57.0.x`).
- **Evidência.** `npx expo-doctor` lista 25 pacotes `expo-*` com mismatch de
  PATCH dentro da própria SDK 57 (ex.: `expo` esperado `~57.0.24`, instalado
  `57.0.20`) — isso não inclui `expo-speech-recognition`, porque não é pacote
  publicado pela Expo com tabela de compatibilidade própria no `expo-doctor`.
  Conferido à parte: `npm view expo-speech-recognition versions --json` lista
  `57.0.0` e `57.1.0` publicados — existe versão compatível com a SDK atual, e
  o projeto está preso numa major anterior por `^56.0.1`.
  **Não é dependência morta**: `grep` confirma uso em `lib/voz-local.ts`
  (`import('expo-speech-recognition')`, `ExpoSpeechRecognitionModule`,
  chamado de dentro de `transcreverAudio`/`lib/voz.ts`, no caminho real de
  toda transcrição — app e widget), `components/VoiceEntryButton.tsx` e
  `app/(app)/perfil.tsx`. Uma entrada de `context.md` de 04/09/2026 (linha
  5721) registra o pacote como "instalado de propósito, nada mais o importa" —
  **essa nota é histórica e ficou desatualizada**: `lib/voz-local.ts` (que usa
  o pacote ativamente) aparece em entradas posteriores do mesmo `context.md`
  (ex. linha 7661-67, sobre o bug do `VoicePcmDecoder.kt` corrigido em
  `e7ab948`); não é um erro do registro — `context.md` é log cronológico e
  entradas antigas não se corrigem (mesma convenção do vault) — só não citar
  isso como achado à parte seria enganoso, porque bateria o olho como
  contradição.
- **Esperado x encontrado.** `app.json`/`package.json` declaram a SDK 57 como
  alvo; um módulo nativo que fala com o reconhecedor de fala do sistema
  (Android/iOS) segue compilado contra a API de módulos da SDK 56. Risco é de
  compatibilidade nativa (API de Expo Modules muda entre SDKs), não de
  funcionalidade hoje — `npx tsc --noEmit` e todo o `test:ci` passam porque
  nada disso é pego em teste de Node; só um build real (ou `expo prebuild`)
  expõe incompatibilidade nativa, e build está fora do escopo desta auditoria
  (regra 4).
- **Comprovado** o mismatch de versão e o uso ativo; **hipótese** que isso
  causa problema real em build — não testado.
- **Sugestão.** `npx expo install expo-speech-recognition@57.1.0` (ou o que o
  `expo install --check` recomendar) antes da próxima build, e rodar
  `npx expo prebuild --platform android` para confirmar que o módulo ainda
  autolinka. Também vale revisitar as 25 divergências de PATCH do
  `expo-doctor` na mesma leva.

### F8 · P3 · inconclusivo · "Lançar por voz" na versão web não mostrou reação visível nem erro de console

- **Onde.** `https://www.granaponto.com.br/lancamentos`, botão "Lançar por
  voz" (portal "Navegador Forge", logado com a conta de teste).
- **Evidência.** `maestri portal click` no botão; `maestri portal logs` logo
  depois voltou vazio (sem erro de console); `maestri portal snapshot` antes e
  depois é idêntico (nenhum elemento novo, nenhum diálogo). Uma permissão de
  microfone do navegador é UI nativa do Chrome, fora do DOM — não aparece em
  `snapshot`, e `maestri portal screenshot` deu timeout ("a página não está
  renderizando") nas duas tentativas, então não consegui ver visualmente se um
  prompt de permissão apareceu.
- **Esperado x encontrado.** Não sei dizer. Pode ser (a) um prompt nativo de
  permissão que a ferramenta não alcança, (b) o clique não fez nada por algum
  motivo (bug), ou (c) algo abriu e fechou rápido demais / fora da área
  capturada.
- **Hipótese, não comprovado.** Não investiguei mais fundo porque não é o
  caminho principal do app (voz na web é uma superfície a mais, não a
  documentada pela regra 13, que fala de app x widget) e o tempo foi para os
  achados acima.
- **Sugestão.** Reproduzir num navegador de verdade (fora do Maestri) com
  DevTools abertas, ou aceitar como não verificável por esta ferramenta e
  seguir.

## Perguntas ao autor

1. **F2 — o timeout diferente por origem (app 15s x widget 60s) é uma exceção
   aceita à regra 13, ou a regra precisa de ajuste de redação?** Hoje o código
   segue a regra 9 (orçamento de quem chama) e diverge da letra da regra 13
   (proíbe timeout próprio por origem). Nenhuma decisão financeira diverge —
   só o prazo de rede antes de cair pra fila.
2. **F7 — pode atualizar `expo-speech-recognition` pra `57.1.0` numa sessão
   futura, e rodar `expo prebuild`/build de verificação depois?** Fora do
   escopo desta auditoria (regra 4/11: sem build).
3. **F8 — vale investigar o clique de "Lançar por voz" na versão web com
   ferramenta melhor (DevTools reais), ou aceitar como não coberto?**

## Cobertura fora do alcance desta auditoria

- Não usei o emulador (Sentinel em uso) — nada de Android físico/emulado
  verificado aqui; o que se sabe sobre o widget nativo vem de leitura de
  código, como sempre foi (a compilação Kotlin nunca rodou nesta máquina).
- Não auditei os 50 usos de `.catch(() => {})` no repositório um a um —
  amostrei os que pareciam mais arriscados (`lib/push-notifications.ts`, já
  documentado como incidente corrigido; `lib/data.ts`/`lib/widget-voz-task.ts`
  em `checarLimiteCartao`, que é aviso best-effort pós-gravação, não parte da
  escrita em si) e não achei um novo caso do padrão da regra 9. Não é
  cobertura completa.
- Não fiz auditoria file-a-file de animação/motion no app (fora da landing).
  Amostra: 31 arquivos referenciam `prefers-reduced-motion`/`useReducedMotion`,
  `test:motion` e `test:blur` passam dentro do `test:ci` já rodado. Sem
  achado, mas também sem varredura completa com `find-animation-opportunities`
  seção por seção — o tempo foi para voz, testes e configuração, que eram os
  itens nomeados no pedido.
- `SELECT '*'` aparece 14 vezes em `lib/` (`data.ts`, `wallets.ts`, `goals.ts`,
  `creditLimitAlert.ts`) — não investiguei se algum é caro na prática (sem
  `EXPLAIN`, sem sinal de lentidão relatado); citar isso como achado sem
  medição seria o tipo de achado manco que o método `intended-vs-implemented`
  pede para evitar.

## Limpeza

`E:\Grana-temporarios\2026-09-23-forge-login.cjs` (script descartável de
login, sem credencial no conteúdo) apagado ao final desta sessão.

## PAUSA (limite de uso a 90%, pedido do autor)

Auditoria entregue e reportada ao Codex via `maestri ask` **antes** da pausa —
achados F1 a F8 acima são a entrega final deste segmento, não um corte no
meio. A pausa aconteceu depois do relatório, só não deu tempo de reagir às
perguntas 1–3 de "Perguntas ao autor" nem de aprofundar os itens da seção
"Cobertura fora do alcance desta auditoria".

**Cobertura marcada:**

- [x] `tsc --noEmit` — feito, limpo.
- [x] Inventário dos scripts de teste + arquivos órfãos de `__tests__/` —
  feito (F1).
- [x] `npm run test:ci` — feito, 0 falhas.
- [x] Paridade de voz app x widget (regra 13) — feito, lido o núcleo inteiro
  (F2).
- [x] `catch`/recibo/retry (regra 9) — feito por amostragem, não exaustivo
  (ver "Cobertura fora do alcance").
- [x] Offline e fila — feito (`widget-voz-pendentes.ts` lido).
- [x] `app.json`/`eas.json`/`.easignore`/trava de env — feito, sem achado
  (F6).
- [x] Dependências/Expo 57 — feito (`expo-doctor` + F7).
- [x] Navegador web (portal "Navegador Forge") — feito, login com conta de
  teste, um item inconclusivo (F8).
- [ ] **Falta:** auditoria completa dos ~50 usos de `.catch(() => {})` (só
  amostrado); varredura file-a-file de animação no app fora da landing (só
  amostrado); resposta às 3 perguntas ao autor; qualquer ação que dependa de
  build (F7) ou de ferramenta melhor de navegador (F8).

Retomar por aqui quando o autor mandar RETOMAR.

(em preenchimento)

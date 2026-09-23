---
tags: [grana, auditoria]
tipo: registro
data: 2026-09-23
---

# 2026-09-23 - M1 - Auditoria de Documentação e Vault (Ledger)

**Pedido.** Do autor, via Codex: "auditoria rigorosa de seus próprios
segmentos dentro do projeto. Ao terminarem, documentem todos os achados."
Segmento do Ledger: documentação e vault. Somente leitura: nada foi alterado,
nada commitado. Emulador não usado (ocupado pelo Sentinel).

**Modelo.** Claude Opus 5.5 no lugar do `gpt-5.6-luna` do papel (limite do
Codex esgotado; mesma substituição de 22/09).

**Skills.** `intended-vs-implemented`, `grammar-check`, `retro`,
`stakeholder-map`, `release-notes` e `summarize-meeting`, todas em modo
diagnóstico. O que cada uma acrescentou está na seção "Skills usadas", no
fim.

## Cobertura

> **Pausa pedida pelo autor (limite de uso a 90%).** Ponto de parada: a
> auditoria estava CONCLUÍDA, o relatório foi enviado ao Codex (ficou na fila
> dele) e nada foi iniciado depois. Se retomar, só faltam os itens marcados
> `[ ]` ou `[~]` abaixo e os de "Fora da cobertura", no fim.

- [x] Estado do git: `PRODUCT.md` e `.claude/settings.json` sem commit
- [x] `scripts/verificar-vault.mjs`
- [x] Credencial ou dado sensível em arquivo versionado
- [x] Credencial ou dado sensível no vault
- [x] Espelhos do vault (context, AGENTS, PRODUCT)
- [x] `00 - Índice - Sessões`
- [x] `AGENTS.md` contra o repositório
- [x] `context.md`: topo, seções de 21-22/09, ordem das seções e 218
      caminhos citados (seções antigas não relidas, ver "fora da cobertura")
- [x] `PRODUCT.md` contra o código
- [x] `DESIGN.md` contra o código
- [x] `docs/` (caminhos citados; conteúdo dos planos não relido)
- [~] Notas perenes: 57 varridas por padrão, 6 lidas por inteiro
- [x] Notas de sessão de 20 a 22/09 (M1 e M2); as de 23/09 só pelos títulos
- [ ] Nota do Sentinel: fora do escopo por ordem do pedido

## Achados

### L1 · P2 · A tarefa de 22/09 do próprio Ledger ficou pela metade, e a nota dela afirma o que não aconteceu

- **Onde.** `PRODUCT.md` (árvore de trabalho, sem commit);
  [[2026-09-22 - M1 - Coordenacao dos agentes no Maestri]]; `00 - Índice -
  Sessões`.
- **Evidência.** `git status`: ` M PRODUCT.md`. `git diff PRODUCT.md`: troca
  "O bloqueio está implementado e desligado por interruptor" por "O bloqueio
  foi ligado em 22/09/2026" mais os dois pontos de travamento (e-mail
  diferente, falta de App Links). Arquivo gravado em 22/09 21:06:01, um
  minuto antes da nota de coordenação (21:07:20). Quem mexeu foi o próprio
  Ledger, na tarefa de 22/09, que foi interrompida pelo pedido desta
  auditoria antes de terminar. Ficaram sem fazer: o commit e o push do
  `PRODUCT.md`, a inclusão das notas de 22/09 no índice de sessões, o
  `verificar-vault` e o relatório ao Codex.
- **Esperado x encontrado.** A nota de coordenação diz "`PRODUCT.md` ...
  (`879ac32` e o commit seguinte)" e "[[00 - Índice - Sessões]] com as duas
  notas de hoje que faltavam". O commit seguinte não existe (`git log`: o
  último é `879ac32`), e o índice não lista nenhuma das quatro notas de 22/09
  além de "Plano de tráfego pago" e "Auditoria da landing" (linhas 73 e 75).
- **Comprovado.**
- **Sugestão.** Commitar e publicar o `PRODUCT.md` (o conteúdo confere com o
  `context.md` de 22/09 e com o próprio parágrafo das linhas 55 a 65, que já
  dizia "ligado"). Pôr no índice as notas "Testes do fluxo de assinatura",
  "Coordenacao dos agentes no Maestri", a do Sentinel quando fechar, e esta.
  A nota de coordenação é registro e não se corrige: vale um aviso no topo
  apontando para este achado.

### L2 · P2 · `.claude/settings.json` com `Bash(*)` pendente, num arquivo versionado de repositório público

- **Onde.** `.claude/settings.json`, árvore de trabalho, sem commit.
- **Evidência.** `git diff`: as duas permissões de `curl` (Vercel e Cakto)
  viram `Bash(*)`, `Edit(*)`, `Read(*)`, `Write(*)`, `Glob(*)`, `Grep(*)`.
  Arquivo gravado em 22/09 19:47. Autoria não comprovada: o pedido de 22/09
  dizia que era mudança do autor. Em 22/09 o classificador de permissões do
  Claude Code barrou o commit dela como automodificação, e o autor mandou
  deixar o arquivo fora de commit até decidir.
- **Esperado x encontrado.** O arquivo é versionado (`git log` mostra
  `4c99b4f` e o commit inicial) e o repositório é público (regra 15). Se
  entrar no git, `Bash(*)` passa a valer para toda sessão aberta nas duas
  máquinas, incluindo `eas build`, `supabase functions deploy` e `git push
  --force` sem pedido de permissão, justo as ações que as regras 4, 10 e 11
  querem que passem por decisão explícita. Para uso só local, o lugar é o
  `.claude/settings.local.json`, que já é ignorado.
- **Comprovado** (diff e rastreio no git); o efeito sobre as sessões é
  leitura da semântica de permissões, não testado.
- **Sugestão.** Decisão do autor. Se a ideia é agilizar esta máquina, mover as
  regras para o `settings.local.json` e restaurar o versionado
  (`git checkout -- .claude/settings.json`).

### L3 · P2 · O `context.md` diz que a faixa da landing ganhou pausa; o commit seguinte tirou a pausa e não foi registrado

- **Onde.** `context.md:9567` (seção "22/09/2026 — Correções da auditoria da
  landing com Codex"); `components/TrustMarquee.tsx:69-72`; commit `13ae412`.
- **Evidência.** O `context.md` afirma: "`components/TrustMarquee.tsx` ganhou
  pausa/retomada acessível" (`7c1bdf9`, 22/09 14:29). Quatro horas depois,
  `13ae412` ("remove pausa da faixa", 22/09 18:53) apagou o botão
  Pausar/Retomar, e o código diz hoje: "a pedido do autor, ela não tem pausa
  manual nem por ponteiro/foco no modo normal, e roda infinitamente".
  `grep 13ae412 context.md`: nada. Nenhuma nota de sessão registra o commit
  (só a do Sentinel cita `#no-bolso`, como tela auditada). A paleta
  menta/petróleo aplicada em `#no-bolso` e o novo `petroleo()` de
  `lib/theme.ts` também não estão documentados.
- **Esperado x encontrado.** Regra 6: sessão que mexeu em código atualiza o
  `context.md`. Quem lê o `context.md` hoje acredita que a faixa tem pausa.
  A pausa era correção de um achado de acessibilidade da auditoria da landing
  (movimento automático contínuo sem controle, WCAG 2.2.2); a remoção reabre
  esse achado.
- **Correção feita durante esta auditoria.** A decisão do autor JÁ estava
  registrada: `context.md:1300` (seção "A landing reformada", 13/09) lista
  "letreiro sem botão de pausa (pedido do autor)". Ou seja, a correção de
  `7c1bdf9` foi contra uma decisão registrada, e `13ae412` só a restaurou. O
  defeito de documentação continua: a seção de 22/09 afirma uma pausa que não
  existe, e nada liga a remoção à decisão de 13/09.
- **Comprovado** (texto do `context.md`, código e `git log`).
- **Relacionado.** O lado de interface do mesmo ponto é o P1 da auditoria de
  UI e Design de hoje (Prism, "Faixa animada sem controle de pausa"). Este
  L3 cobre só o registro.
- **Sugestão.** Seção no `context.md` e nota de sessão para `13ae412`, com o
  pedido do autor e a troca consciente contra o critério de acessibilidade.
  Perguntar ao autor se a decisão é definitiva (ver perguntas).

### L4 · P2 · Três perenes atrasadas; uma afirma que a cobrança está desligada

Saída do `node scripts/verificar-vault.mjs "G:/Meu Drive/Obsidian/Gabriel/Grana"`
em 23/09 07:10: 134 notas, 0 links quebrados, 2 notas sem link de entrada
(esta e a do Compass de hoje, ambas em andamento), 3 perenes atrasadas, 20
perenes nunca conferidas, 0 perenes sem `fonte`, 0 fontes inexistentes.

- **[[Visão do Produto]] (grave do trio).** Linhas 48-49: "O bloqueio de
  acesso está implementado, mas `enforce_subscriptions` continua `false`:
  quem cria conta hoje ainda tem [acesso]". Falso desde 22/09 23:18 UTC
  (`context.md`, seção da cobrança ligada; `PRODUCT.md:57`). A fonte dela
  (`PRODUCT.md`) mudou em `d16e1be`. Comprovado.
- **[[Módulos lib]].** Fonte `lib/` mudou em `13ae412` (`petroleo()` novo em
  `lib/theme.ts`). A nota só lista `theme.ts` genericamente (linha 147);
  defasagem pequena. Comprovado.
- **[[Cobertura de Testes]].** Acusada porque `AGENTS.md` mudou em `a57bb45`
  (regra 19, que não fala de teste). Falso positivo do verificador: a fonte
  `AGENTS.md` é ampla demais para essa nota. Comprovado.
- **20 perenes sem `revisado`**: a mesma lista que o fechamento de 21/09 já
  registrava como "20 avisos preexistentes"; não reabro, só confirmo que o
  número não caiu.
- **Sugestão.** Corrigir o parágrafo da cobrança em Visão do Produto e
  carimbar; revisar Módulos lib; trocar a fonte de Cobertura de Testes por
  `package.json` e `__tests__/`.

### Varredura de credenciais no repositório (sem achado novo)

- `git grep` por padrões de token (GitHub, Supabase `sbp_`, Resend `re_`,
  Vercel, Stripe, JWT, chave privada, AWS, Google) nos arquivos versionados:
  só a chave anônima do Supabase em `eas.json:19,31` (decodificada: `role =
  anon`, pública por desenho) e a chave do Firebase em
  `google-services.json:18`, já registrada como pública e restringida por
  pacote e SHA-1 (`context.md:7139`, commit `9b924ea`). Nenhum valor copiado
  para esta nota.
- Histórico inteiro (`git log --all -G`): um único acerto, `c9caace`
  (`context.md`), que é só a menção ao prefixo `vcp_`, sem valor. Falso
  positivo.
- A senha da conta de teste em `14ef2d2` continua no histórico e já está
  registrada (alerta do `AGENTS.md`, regra 15), com decisão do autor de não
  trocar. Não reabro.
- O `secret` do exemplo em `__tests__/cakto-webhook.cjs:40` foi comparado,
  dentro do processo e sem imprimir, com `CAKTO_WEBHOOK_SECRET` do `.env`:
  **diferente**. Não é o segredo real.

### L5 · P3 · Dados com cara de pessoa real no teste do webhook da Cakto

- **Onde.** `__tests__/cakto-webhook.cjs:45` e `:88`, desde `c93c11f`
  (09/09).
- **Evidência.** O objeto `customer` tem nome, e-mail, telefone e um
  `docNumber` de 11 dígitos que **passa na conta dos dígitos verificadores
  de CPF** (conferido dentro do processo, sem imprimir). O comentário diz
  "Exemplo literal da documentação da Cakto", e o `context.md:7878` confirma
  a origem.
- **Esperado x encontrado.** Regra 15 e LGPD: repositório público não guarda
  dado pessoal de terceiro. Se veio da documentação pública da Cakto, já é
  público e provavelmente fictício; se não, é CPF e telefone de alguém.
- **Hipótese.** Não abri a documentação da Cakto para confirmar que o
  exemplo é idêntico lá.
- **Sugestão.** Trocar por dado sintético evidente (CPF gerado de teste,
  e-mail `@exemplo.com`), mantendo a forma do payload. Não precisa reescrever
  histórico.

### L6 · P3 · O `context.md` trata a conta de teste e a conta do autor como duas contas; são a mesma

- **Onde.** `context.md:9602` (seção da cobrança ligada, 22/09) e a checklist
  logo abaixo; `context.md:8826` e `:8974` (16/09); nota
  [[2026-09-22 - M1 - Testes do fluxo de assinatura]], seção Backend
  Engineer, Teste 1.
- **Evidência.** Em 16/09 o autor declarou que o endereço do autor é conta
  **descartável** e ele é o `E2E_TEST_EMAIL` (conferido agora, dentro do
  processo, só o booleano: `E2E_TEST_EMAIL` é esse endereço). Em 22/09 a
  seção da cobrança chama a mesma conta de "conta do próprio autor", dá a
  cortesia a ela e, na checklist, pede para conferir à parte se "a conta de
  teste dos agentes" está entre as cortesias. O Teste 1 do Backend Engineer
  "comprovou" isso uma hora depois, sem notar que era a cortesia concedida na
  mesma noite.
- **Esperado x encontrado.** Um registro só dizendo que as duas são a mesma
  conta. O que se lê é que existem duas.
- **Comprovado** (texto e comparação do `.env`). Sem efeito operacional: a
  conta tem cortesia de qualquer jeito.
- **Sugestão.** Uma linha no `context.md` de 23/09 esclarecendo. O mesmo
  endereço também é o contato de suporte e de privacidade do app
  (`app/assinar.tsx:43`, `lib/legal-content.ts:33`), o que já estava
  registrado em 16/09.

### Varredura de credenciais e dado sensível no vault (sem achado)

`grep` nas notas `.md` do vault pelos mesmos padrões de token: nada. E-mails
presentes: o endereço do autor (conta descartável, em 7 notas, a maioria o
espelho do `context.md`), o remetente `nao-responda@` do domínio do Grana, a
conta de serviço do Firebase (identificador, não chave), e os endereços de
teste da Resend e de `example.com`. Padrões de CPF e telefone: só IDs de
páginas do Facebook nas notas de concorrência e datas de migration. Nenhuma
pasta `Feedbacks/` nem `Screenshots/` dentro do vault; a nota
[[Feedback de Usuários]] só inventaria arquivos, sem conteúdo.

### Espelhos (conferidos)

`context.md`, `AGENTS.md` e `PRODUCT.md` comparados byte a byte (sem `\r` e
sem o cabeçalho gerado) com as três notas de `01 - Código`: **iguais**. O
`hook` de Stop em `.claude/settings.local.json` aponta para
`scripts/espelhar-vault.sh` com o caminho do vault na M1.

### L7 · P3 · O espelho publica no vault o que ainda não foi commitado

- **Onde.** `scripts/espelhar-vault.sh`; [[Produto - Estado Atual - Grana]].
- **Evidência.** O espelho do `PRODUCT.md` (gravado 23/09 07:00) é igual à
  árvore de trabalho, que tem a edição sem commit do L1. Ou seja, o vault
  mostra hoje um `PRODUCT.md` que não existe no `origin/main`.
- **Esperado x encontrado.** A regra 12 diz "o repositório manda"; na
  prática manda a pasta de trabalho da máquina que rodou o último turno. Se
  as duas máquinas tiverem edições locais diferentes, o espelho alterna entre
  elas a cada turno, e o vault afirma coisas que o git não tem.
- **Comprovado** para o `PRODUCT.md` de hoje; o vaivém entre máquinas é
  hipótese.
- **Sugestão.** Espelhar `git show HEAD:<arquivo>` em vez do arquivo em disco,
  ou marcar no alerta do topo quando o arquivo tiver alteração não
  commitada.

### L8 · P2 · `00 - Índice - Sessões` deixou de acompanhar as notas

- **Onde.** [[00 - Índice - Sessões]], seção "Sessões".
- **Evidência.** Comparação dos arquivos da pasta com os links do índice.
  Faltam 11 notas: "2026-09-20 - M1 - Calendário editorial e prompts"; as de
  22/09 "Auditoria no emulador (Sentinel)", "Coordenacao dos agentes no
  Maestri" e "Testes do fluxo de assinatura"; e as sete auditorias de 23/09
  (Backend/Harbor, Documentação e Vault/Ledger, Engenharia do App/Forge,
  Marketing e Growth, Produto/Compass, UI e Design/Prism, Transversal/Auditor),
  estas ainda em andamento. Nenhum link do índice aponta para arquivo
  inexistente. A ordem também é mista: as sete mais novas no topo, de trás
  para frente, e as antigas embaixo em ordem crescente, com a de 17/09 M1 por
  último, fora de lugar.
- **Esperado x encontrado.** O roteiro de abertura manda ler as notas da
  outra máquina a partir do índice. A M2 que abrir o índice hoje não vê o
  que a M1 fez em 20 e 22/09. O `verificar-vault` não pega isso, porque as
  notas se linkam entre si e deixam de ser "sem link de entrada".
- **Comprovado.**
- **Sugestão.** Incluir as notas quando as auditorias de 23/09 fecharem, numa
  ordem só (mais nova no topo). Acrescentar ao `verificar-vault.mjs` uma
  checagem "nota de `00 - Sessões` fora do índice".

### Arquivos citados que não existem mais (sem achado)

Caminhos entre crases em `AGENTS.md`, `PRODUCT.md`, `DESIGN.md` e `docs/*.md`
conferidos contra a árvore: só `metro.config.js` e `app.config.js`, ambos
citados como ausentes de propósito. No `context.md`, 218 caminhos; os que não
existem (`app/(app)/assistente.tsx`, `components/BrandLogo.tsx`,
`ConversaGranabo.tsx`, `DemoRegistroRapido.tsx`, `IconeMetaAtingida.tsx`,
`DemonstracaoVoz.tsx`, `lib/feature-flags-core.ts`, `lib/versoes.ts`,
`scripts/context.mjs`, `supabase/config.toml`) estão todos em seções
históricas que já dizem que foram apagados, que nunca chegaram a existir ou
que são de skill. É o comportamento certo de um diário.

### L9 · P2 · `PRODUCT.md` diz que a dobra do Granabô saiu da landing; ela está no ar

- **Onde.** `PRODUCT.md`, fim de "Operating Context": "a dobra do Granabô saiu
  junto, e o componente de conversa ficou guardado no repositório,
  desconectado". Espelhado em [[Produto - Estado Atual - Grana]].
- **Evidência.** `app/index.tsx:24` importa `ConversaGranachat`, e
  `app/index.tsx:1475-1493` renderiza a dobra com o sobretítulo "Conheça o
  Granabô", o título "Pergunte sobre o seu dinheiro." e
  `<ConversaGranachat compacto={ehCompacto} />`. O componente antigo
  (`ConversaGranabo.tsx`) foi apagado em `7c8a7a5` (05/09); o atual se
  apresenta como "Demonstração do Granachat, a janela de conversa com o
  Granabô".
- **Esperado x encontrado.** O `PRODUCT.md` é a fonte que os agentes de
  produto e marketing leem (foi assim que o CTA errado se propagou em 21/09,
  nota da M2). Hoje ele diz que o Granabô não aparece na landing, e aparece.
- **Comprovado** (leitura de código). Não abri a landing publicada para ver a
  dobra na tela.
- **Sugestão.** Reescrever a frase: o WhatsApp saiu; o Granabô tem dobra
  própria na landing, com a demonstração do Granachat.

### L10 · P3 · `PRODUCT.md` tem a seção "Copy and Marketing Guidelines" duas vezes

- **Onde.** `PRODUCT.md:168` e `PRODUCT.md:183`, texto idêntico.
- **Evidência.** `git log -S`: as duas cópias entraram juntas no `570eb67`
  (21/09, "chore: fechar sessao e publicar contexto").
- **Esperado x encontrado.** Uma seção. Duplicata não contradiz nada hoje,
  mas a próxima edição vai mexer numa só e criar contradição.
- **Comprovado.**
- **Sugestão.** Apagar a segunda.

### L11 · P2 · `DESIGN.md` carrega uma cópia velha de quatro seções, com valores que ele mesmo diz terem sido corrigidos

- **Onde.** `DESIGN.md:145-230` (versão atual) e `DESIGN.md:229-300` (cópia
  antiga): "Named Rules", "Typography", "Layout", "Elevation & Depth" e
  "Shadow Vocabulary" aparecem duas vezes.
- **Evidência.** `diff` entre os dois blocos: a cópia de baixo lista sombras
  com valor escrito à mão, incluindo "Barra de abas (`0 6px 16px
  rgba(0,0,0,0.35)`)". A cópia de cima diz, sobre esse mesmo valor: "A barra
  de abas estava documentada aqui como `0 6px 16px rgba(0,0,0,0.35)` e no
  código como `0 10px 30px -8px rgba(0,0,0,0.55)`; prevaleceu o código". A
  cópia de baixo também perdeu o aviso de que os botões do WhatsApp estão
  ocultos desde 05/09. A duplicação entrou em `52a840c` (08/09): o commit
  anterior tem uma "## Typography", ele tem duas, e a revisão `a222d1b`
  (10/09, "tira a poeira dos documentos vivos") não a removeu.
- **Esperado x encontrado.** O `DESIGN.md` é o que as skills de design
  (`impeccable` e afins) leem como sistema. Quem ler a segunda metade vai
  aplicar valores de sombra que o teste `__tests__/corpus-design-system.ts`
  recusa, e pode tratar o verde do WhatsApp como exceção ativa.
- **Comprovado.**
- **Sugestão.** Apagar a cópia de baixo (`229-300`), conferindo antes que nada
  exclusivo dela se perca. A paleta (11 cores) foi conferida contra
  `lib/theme.ts` e bate. Falta documentar o uso novo de `13ae412`: menta
  (`accent2`) como FUNDO de seção inteira em `#no-bolso`, com texto em
  `paper` e a textura `petroleo()`. O `DESIGN.md` hoje só prevê o Sea Foam
  White como fundo invertido.

### `AGENTS.md` contra o repositório (conferido)

Existem: `scripts/emulador.cjs`, `scripts/preparar-lancamento.ts` (e o
`build:preparar` no `package.json:64`), `scripts/env-fora-da-build.ts`,
`lib/atualizacao.ts`, `lib/notas-release.ts`, `__tests__/sync-parser.js`,
`__tests__/voz-upload.cjs`, `__tests__/voice-fallback.cjs`,
`scripts/espelhar-vault.sh`, `docs/operar-o-app-no-emulador.md`,
`docs/mapa-do-app-para-agentes.md`. Inventário da regra 10: só `main`, sem
worktree nem stash. `git branch -a` ainda mostra
`origin/claude/grana-landing-page-design-df5etm`, mas `git ls-remote` prova
que ela não existe mais no GitHub (mesclada e apagada, `6ec7a17`,
`context.md:9183`): é só referência local velha, some com
`git fetch --prune`. Não é achado.

### L12 · P3 · A regra 9 diz "seis scripts de teste"; hoje há `test:ci`, que roda tudo

- **Onde.** `AGENTS.md:161-166`; [[Cobertura de Testes]].
- **Evidência.** `package.json:56-65` tem `test:voz`,
  `test:assistente-fatura`, `test:assistente-aprendizado`, `test:blur`,
  `test:motion`, `test:parser`, `test:saldos` e **`test:ci`**, que encadeia
  os seis, os três testes que a regra chama de "sem script próprio"
  (`voice-fallback.cjs`, `voz-offline.cjs`, `widget-voz-cartoes.cjs`) e mais
  cerca de trinta. O fechamento de 21/09 já usa `npm run test:ci` como
  verificação.
- **Esperado x encontrado.** A regra existe para ninguém rodar suíte de
  menos; hoje ela manda procurar seis scripts e não cita o que roda tudo.
- **Comprovado.**
- **Sugestão.** Na regra 9, apontar `npm run test:ci` como a verificação
  completa, mantendo o aviso de que `test:parser` sozinho não basta.

### L13 · P2 · A regra 19 não diz a qual "Codex" se aplica, e o próprio Codex lê o `AGENTS.md`

- **Onde.** `AGENTS.md`, regra 19 (`a57bb45`): "Este terminal do Codex nunca
  realiza o trabalho diretamente."
- **Evidência.** O `AGENTS.md` é lido por todo agente que abre o repositório,
  inclusive a CLI do Codex (é o arquivo de instrução padrão dela), o
  `/codex:rescue` e o `codex review`. A regra 16 manda o Codex revisar e
  permite que ele escreva correção; a regra 18 manda "cada agente roda o
  passo a passo ele mesmo", Codex incluído. A regra 19 fala de "este
  terminal" sem nomear o Maestri nem o terminal chamado "Codex" do canvas.
- **Esperado x encontrado.** Uma instrução que só vale para o coordenador do
  Maestri. Como está, qualquer sessão da CLI do Codex pode lê-la como
  "Codex não executa trabalho" e recusar a revisão ou a correção pedida
  pelas regras 16 e 18.
- **Hipótese** (leitura do texto; não vi um Codex recusar trabalho por
  isso).
- **Sugestão.** Reescrever: "O terminal chamado Codex no canvas do Maestri
  (coordenador) não executa trabalho...; não vale para a CLI do Codex usada
  como revisor (regra 16)". Ou mover a regra para o papel do coordenador em
  `.maestri/`, que é onde vive a instrução de cada terminal.

### L14 · P2 · O `context.md` tem duas ordens: metade de cima do mais novo para o mais velho, metade de baixo ao contrário

- **Onde.** `context.md` inteiro (9.716 linhas).
- **Evidência.** Varredura dos cabeçalhos com data: das linhas 61 a ~4338 as
  seções vão de 22/09 descendo até 01/09; da ~4338 ao fim, sobem de 01/09 até
  22/09. As entradas de 22/09 ficaram partidas: a da build 1.10.4 está no
  topo (linha 61), e as correções da landing (9548), a cobrança ligada
  (9594) e a coordenação do Ledger (9642) estão no fim. Há ainda seções fora
  de lugar dentro de cada metade (13/09 em 1732 entre as de 11/09; 08/09 em
  2920 e 3265 entre as de 10/09). O topo e o `AGENTS.md:43` mandam ler a
  seção do `.env` "no fim do `context.md`", e ela está na linha 9078, que já
  não é o fim.
- **Esperado x encontrado.** Regra 6: a próxima sessão começa pelo
  `context.md` para saber onde a anterior parou. Quem lê o topo vê a build de
  22/09 e acha que é o estado atual, sem saber da cobrança ligada nem das
  pendências de assinatura, que estão 9.600 linhas abaixo. Não há convenção
  escrita de onde acrescentar: parte das sessões (M1, sobretudo) põe em
  cima, parte (M2 e as de 21-22/09, inclusive a minha) põe embaixo.
- **Comprovado.**
- **Sugestão.** Decidir uma ordem, escrever no cabeçalho do arquivo e na regra
  6, e juntar as metades (é mover texto, sem reescrever registro). Enquanto
  não for feito, um sumário "estado atual" no topo, logo abaixo do alerta.

### L15 · P2 · Mais duas perenes dizem que o app é gratuito na prática, e a porta do vault ainda vende WhatsApp

Complemento do L4, achado por busca em todas as 57 perenes (o verificador
não pega porque a fonte delas não mudou).

- **[[Schema do Banco]]** (`revisado: 2026-09-19`, fonte
  `supabase/schema.sql`), linhas 38-40: "`app_backend_config` ... Em
  11/09/2026 está `false`: ... o aplicativo é gratuito na prática." A mudança
  foi de dado em produção, não de schema, então o `revisado` não envelhece
  sozinho. Comprovado.
- **[[Arquitetura Geral]]**, linha 49: "Enquanto a flag ... estiver
  desligada ... modo soft launch". Condicional, não falsa, mas quem lê entende
  que é o estado de hoje. Comprovado (texto).
- **[[Grana]]** (a porta de entrada), linha 27: "lançamento por voz,
  WhatsApp e QR Code de nota fiscal". O WhatsApp saiu do produto (decisão de
  05/09 e 09/09, `PRODUCT.md`; memória "WhatsApp fora do Grana., de vez").
  Comprovado.
- **Registros antigos com número velho** (ex.:
  [[Auditoria da Landing - Copy e Acessibilidade]], R$ 19,99 e Kiwify) são
  `tipo: registro` e já estão sob o aviso de preço histórico da reforma de
  10/09. Não é achado.
- **Sugestão.** Corrigir as três frases; incluir no roteiro de "cobrança
  ligada" uma busca por `enforce_subscriptions` no vault, porque decisão
  operacional em produção não aparece no verificador.

### L16 · P3 · O plano de tráfego pago não conversa com os travamentos do pós-compra

- **Onde.** [[Plano de Tráfego Pago - Primeiros 100 Assinantes]]
  (`revisado: 2026-09-22`).
- **Evidência.** O plano cita a cobrança ligada (linha 109), mas nenhuma
  linha menciona e-mail da compra, `/ativar` ou a confirmação de cadastro.
  Os testes do mesmo dia
  ([[2026-09-22 - M1 - Testes do fluxo de assinatura]]) acharam dois pontos
  em que quem paga pode não chegar ao app: e-mail diferente sem vínculo
  automático e o link de confirmação abrindo o navegador (A4). O Compass
  registrou hoje que o checkout aberto do app não leva o e-mail (C5, na
  auditoria de Produto).
- **Esperado x encontrado.** Um plano que otimiza para `InitiateCheckout` e
  mede `Purchase` deveria registrar que parte das compras pode virar suporte
  manual. Hoje as duas notas não se citam.
- **Hipótese** quanto ao efeito na campanha; a ausência do vínculo entre as
  notas é comprovada.
- **Sugestão.** Uma linha de risco no plano apontando para a nota dos testes
  e para o C5, sem duplicar o achado.

### L17 · P3 · O registro da 1.10.4 manda "repetir o envio"; a regra 5 manda recomeçar pelo `build:preparar`, que sobe a versão

- **Onde.** `context.md:61-86` (22/09, build 1.10.4 bloqueada pela cota);
  `AGENTS.md`, regra 5; `scripts/preparar-lancamento.ts:43-47` e `:85-91`.
- **Evidência.** `app.json` está em `1.10.4` (`3f23c6d`), sem APK: o EAS
  recusou por cota, com reset em 01/10. O registro diz "O próximo passo é
  repetir o envio após o reset da cota". A regra 5 diz que "todo build de
  release começa por `npm run build:preparar`", e o script sempre sobe pelo
  menos o patch (padrão `patch`). Seguindo a regra ao pé da letra, a próxima
  build sai 1.10.5 e a 1.10.4 nunca existe.
- **Esperado x encontrado.** Uma instrução só. O risco real é o outro
  caminho: repetir o comando de 22/09 depois de 01/10, com a mensagem
  "Corrige o lançamento automático por voz no widget...", vai publicar no
  pop-up "O que mudou" só essa frase, mesmo que entrem até lá as correções
  das auditorias de hoje.
- **Comprovado** (texto e código); o que a próxima sessão fará é hipótese.
- **Sugestão.** Anotar no `context.md` qual caminho vale: recomeçar pelo
  `build:preparar` com mensagem nova que cubra o que entrou até lá (e aceitar
  pular a 1.10.4), ou reenviar a 1.10.4 só se nada mudou desde `3f23c6d`.

## Resumo

17 achados: **nenhum P1**, **10 P2** (L1, L2, L3, L4, L8, L9, L11, L13, L14,
L15), **7 P3** (L5, L6, L7, L10, L12, L16, L17). Nenhuma credencial nova em
arquivo versionado nem no vault. Cobertura estimada em 85% do segmento (ver
lista no topo e "fora da cobertura" abaixo).

**Segunda rodada do `verificar-vault`, no fim desta auditoria:** 11 itens.
Dois links quebrados, ambos na nota de Backend (Harbor), que não é minha e
não editei: `[[2026-09-22 - M1 - Testes do` / `fluxo de assinatura]]`
partido em duas linhas, e `[[feature flag]]`, que não existe. Seis notas de
23/09 sem link de entrada (as auditorias em andamento, ainda fora do índice:
ver L8). As mesmas 3 perenes atrasadas e 20 nunca conferidas.

## Retrospectiva (skill `retro`, formato Iniciar / Parar / Continuar)

A causa comum de L1, L3, L8 e L14 é de processo, não de conhecimento: as
regras já mandam registrar, e o registro some quando a sessão é interrompida
ou quando quem mexe não é quem fecha.

- **Iniciar.** Commitar e publicar cada documento assim que ele fica pronto,
  e não no fim da tarefa (o L1 foi o próprio Ledger, interrompido entre a
  edição e o commit). Incluir a nota no índice no mesmo passo em que ela é
  criada.
- **Parar.** Escrever na nota de sessão que algo foi feito antes de fazer
  ("e o commit seguinte", "com as duas notas de hoje que faltavam").
- **Continuar.** Nota por sessão e verificação por script: foi o
  `verificar-vault` que apontou a Visão do Produto desatualizada.

| Prioridade | Ação | Dono | Como saber que funcionou |
|---|---|---|---|
| 1 | Checagem "nota de sessão fora do índice" no `verificar-vault.mjs` | quem corrigir L8 | o script acusa as 11 notas de hoje |
| 2 | Convenção escrita de onde acrescentar no `context.md` | autor decide, Ledger aplica | seções novas das duas máquinas no mesmo lugar |
| 3 | Todo commit de código sem seção no `context.md` vira pendência da próxima sessão | coordenador do Maestri | `13ae412`-como-caso não se repete |

## Quem é atingido por quê (skill `stakeholder-map`)

| Leitor | Documento que usa | Achados que o atingem |
|---|---|---|
| Autor | nota de sessão, `context.md` | L2 (decisão de permissões), L3, L14, L17 |
| Sessão da M2 | `context.md`, índice de sessões | L1, L7, L8, L14 |
| Agentes de produto e marketing (Maestri) | `PRODUCT.md`, perenes de Vendas e Produto | L4, L9, L10, L15, L16 |
| Agentes de design e skills de design | `DESIGN.md` | L11 |
| Codex (revisor e coordenador) | `AGENTS.md` | L12, L13 |
| Qualquer leitor do GitHub (repo público) | arquivos versionados | L2, L5 |

Conflito a alinhar: a regra 19 (Codex só coordena) contra as regras 16 e 18
(Codex revisa, corrige e opera o app ele mesmo).

## Skills usadas e o que cada uma acrescentou

- **`intended-vs-implemented`**: o método da auditoria inteira. Cada achado
  cita o que o documento afirma e o que o código ou o git mostram. Foi o que
  achou L9 (dobra do Granabô dada como removida), L11 e L15.
- **`grammar-check`** (diagnóstico, sem reescrever): lida a regra 19 e as
  seções de 22/09 do `context.md`. Acrescentou o L13 (referência vaga: "este
  terminal") e o L17 (instrução que contradiz outra regra); sem erro de
  ortografia relevante nesses trechos.
- **`retro`**: a seção de retrospectiva acima, com a causa comum de processo.
- **`stakeholder-map`**: a tabela de quem é atingido, que decidiu a
  gravidade (L13 subiu para P2 porque o leitor atingido é um agente que age
  sozinho).
- **`release-notes`** (diagnóstico): comparou o que entrou depois de
  `3f23c6d` com a mensagem preparada para a 1.10.4. Entraram 11 arquivos de
  código (`7c1bdf9`, `13ae412`), todos da landing web; hoje a mensagem ainda
  descreve o que muda no APK, mas deixa de descrever assim que entrar
  qualquer correção do app. Base do L17.
- **`summarize-meeting`**: resumo da rodada de 22/09 para achar pendência sem
  dono. Sem dono até agora: apagar o usuário AUDIT não confirmado, os achados
  A2, A3 e A4 dos testes de assinatura, e a seção do `13ae412`.
- Consideradas e não usadas: `copywriting` e `impeccable` (copy e interface
  são dos segmentos Marketing e Prism), `webapp-testing` (não abri a landing;
  o segmento é documento), `test-scenarios` (não há roteiro a montar aqui).

## Fora da cobertura, com motivo

- **Perenes, leitura integral.** As 57 perenes foram varridas por padrão
  (cobrança, versão, WhatsApp, Kiwify, `enforce_subscriptions`) e seis foram
  lidas por inteiro. As 20 sem `revisado` não foram conferidas uma a uma:
  exigiriam uma rodada própria.
- **`context.md`, conferência linha a linha.** Conferi o topo, as seções de
  21 e 22/09, a ordem de todas as seções e todos os 218 caminhos de arquivo
  citados. As seções antigas não foram relidas contra o código, porque são
  registro e valem para a data delas.
- **`docs/`, conteúdo.** Conferidos os caminhos citados; o conteúdo dos
  planos em `docs/superpowers/` e `docs/marketing/` não foi relido.
- **Notas de 23/09 dos outros agentes.** Lidas só pelos títulos dos achados,
  para não duplicar: estão em andamento e não são minhas.
- **Nota do Sentinel.** Fora do escopo por ordem do pedido de 22/09.
- **Documentação da Cakto** (origem do exemplo do L5): não aberta.
- **Histórico do git por dado pessoal** (CPF, telefone): não varrido, só por
  padrão de token.

## Perguntas ao autor

1. `.claude/settings.json` (L2): as permissões amplas são para esta máquina
   só (então vão para o `settings.local.json`) ou para todas as sessões, nas
   duas máquinas e em repositório público?
2. A faixa da landing sem pausa (L3, e o P1 do Prism) é decisão definitiva,
   sabendo que contraria o critério de acessibilidade que a auditoria de
   22/09 corrigiu?
3. `context.md` (L14): as seções novas vão no topo ou no fim?
4. Próxima build (L17): recomeçar pelo `build:preparar` (1.10.5, com
   mensagem nova) ou reenviar a 1.10.4 do jeito que está?
5. Posso commitar e publicar a edição do `PRODUCT.md` que ficou pendente da
   minha tarefa de 22/09 (L1)? Nesta auditoria não commitei nada, como
   pedido.
6. A regra 19 vale só para o terminal coordenador do Maestri, ou também para
   a CLI do Codex usada como revisor (L13)?

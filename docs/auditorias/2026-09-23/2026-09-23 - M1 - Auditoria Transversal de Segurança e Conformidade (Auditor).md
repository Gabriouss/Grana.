---
tags: [grana, auditoria]
tipo: registro
data: 2026-09-23
---

# 2026-09-23 - M1 - Auditoria Transversal de Segurança e Conformidade (Auditor)

**Pedido do autor.** "auditoria rigorosa de seus próprios segmentos dentro do projeto. Ao terminarem, documentem todos os achados." Auditoria somente de leitura; a única escrita autorizada é esta nota. Sem emulador, build, deploy, commit ou conta real.

**Skills usadas como apoio ativo.** `intended-vs-implemented`: confronto entre `documentation/permissions.md`/política e cache, exclusão e atribuição (A1, A2, A4, A5). `privacy-policy`: inventário de coleta, terceiros e retenção, que revelou feedback e identificadores de clique omitidos (A2, A4). `supabase-postgres-best-practices` (regras `security-privileges` e `security-rls-basics`): conferência de RLS, privilégios e limite de isolamento da base; políticas estáticas presentes, produção não sondada. `pre-mortem`: cenário de falha após lançamento em aparelho compartilhado, que orientou A1. `strategy-red-team`: ataque à premissa "RLS basta para isolar contas" com o teste mais barato de troca de conta sem rede. `test-scenarios`: roteiro de QA A→B, exclusão e fila pendente ao final. `code-ultrareview` em modo de diagnóstico: refutação dirigida e enumeração explícita do que não foi testado; o pipeline de diff não se aplica à auditoria do projeto inteiro e não foi executado. `maestri-portal`: consulta sem login do GitHub público e das três páginas legais publicadas. `security-review` foi buscada na biblioteca inteira, incluindo `C:/Users/user/.claude/skills/`, e não estava instalada neste CLI.

## Cobertura

- [x] Segredos no repositório público e histórico
- [x] `.env`, `.easignore`, `.gitignore` e `EXPO_PUBLIC_`
- [x] RLS estática e exposição transversal de dados de terceiros; produção e ataque entre duas contas ficaram fora (sem segunda conta de teste)
- [x] Termos, privacidade e código de exclusão; exclusão real ficou fora para não apagar conta
- [x] Permissões Android por `app.json`/manifest do módulo; manifest final do APK ficou fora (sem build/emulador)
- [x] `npm audit` de dependências
- [x] `.claude/settings.json` — já registrado como L2 pelo Ledger; sem duplicar
- [x] Branches, worktrees e stash — somente `main`, worktree principal e nenhum stash; `PRODUCT.md` e `.claude/settings.json` modificados, já registrado como L1/L2 pelo Ledger

## Achados
### A1 · P1 crítico · Cache e fila offline de lançamentos atravessam contas no mesmo aparelho

- **Onde.** `lib/offline-cache.ts:7-8,16-27,110-123,138-164,178-208`; `app/(app)/lancamentos.tsx:295-303`; `lib/auth-context.tsx:261-285`; `lib/cache-de-tela.ts:102-112`.
- **Evidência.** O cache `grana:cache:transactions` e a fila `grana:queue:transactions-pendentes` têm chaves globais, sem `userId`. A leitura do cache não confere dono. Em falha de carregamento, Lançamentos entrega todo o cache à tela. O logout chama `esquecerTelas`, que remove apenas `grana:cache:tela:*`; busca dirigida por essas duas chaves não encontrou remoção na saída ou na exclusão. `flushPendingQueue()` envia todos os itens com as credenciais da sessão ativa, sem verificar o autor original.
- **Esperado x encontrado.** `documentation/permissions.md` diz que `authenticated` acessa só os próprios dados; a política (`lib/legal-content.ts:121`) promete que cada conta vê apenas os seus dados. Em aparelho compartilhado, A sai, B entra e abre Lançamentos sem rede: B pode ver o cache financeiro de A. Quando a rede volta, uma operação offline de A pode ser gravada na conta B. A mesma retenção continua após excluir a conta A. Atacante: próximo usuário do mesmo aparelho; vítima: usuário anterior.
- **Estado.** **COMPROVADO no código** o cache global, a ausência de limpeza e o caminho de apresentação/envio. **Não verificado no aparelho** nem com duas contas, porque o emulador é do Sentinel e não foi criada segunda conta nesta auditoria.
- **Sugestão.** Particionar cache e fila por `userId` e validar o dono antes de mostrar ou enviar; limpar os dados da conta na saída e na exclusão; testar troca de A para B com rede desligada e fila pendente (inclusive volta da rede).

### A2 · P2 médio · Exclusão preserva feedback e pode preservar dados pessoais dentro dele

- **Onde.** `lib/legal-content.ts:113,215,227,249`; `supabase/functions/delete-account/index.ts:67-73`; `supabase/schema.sql:829-843`.
- **Evidência.** A página publicada em `https://www.granaponto.com.br/exclusao-de-dados` diz "conta e todos os dados associados" e "Nada fica retido após a exclusão". A Edge Function atual faz `update feedbacks set user_id = null`, e o esquema usa `ON DELETE SET NULL`: `message`, `device_info` e `screenshot_url` permanecem. Texto e print livres podem conter nome, e-mail, valores ou imagem identificável; retirar o UUID não garante anonimização.
- **Esperado x encontrado.** A promessa pública é de exclusão total; a implementação conserva o conteúdo do feedback. A política em `lib/legal-content.ts:49-61` tampouco enumera feedback entre dados coletados.
- **Estado.** **COMPROVADO no código e na página publicada** o descompasso. **Não verificado em produção** se há feedback identificável ou se a versão da função publicada é igual ao repositório; sem conta descartável, não foi feita exclusão real.
- **Sugestão.** Decidir a política de retenção com revisão jurídica; apagar os feedbacks associados à conta ou informar claramente a retenção e retirar identificadores de texto/print de modo verificável. Alinhar política e página de exclusão ao comportamento efetivo.

### A3 · P2 médio · Dependências com avisos de segurança na árvore atual

- **Onde.** `package-lock.json` (`node_modules/@xmldom/xmldom` 0.8.14 e 0.9.11 em `plist`; `decode-uri-component` 0.2.2; `uuid` 7.0.3); `package.json` usa Expo 57.
- **Evidência.** `npm audit --json` em 23/09/2026 retornou **16 avisos: 1 high, 15 moderate, 0 critical**. O high é `@xmldom/xmldom`, incluindo parsing/serialização com injeção e consumo quadrático (por exemplo `GHSA-93r5-fhx6-vmg9`, `GHSA-c7q8-3ch8-vqpv`). Há alerta de DoS em `decode-uri-component` (`GHSA-vcc3-ghjq-m6fr`). A árvore confirmou as versões pelo lock. O `npm audit` sugere downgrades incompatíveis com Expo 57 para alguns pais; isso não é recomendação de aplicá-los cegamente.
- **Esperado x encontrado.** Cadeia de dependências sem avisos exploráveis nas entradas usadas; a árvore instalada contém pacotes sinalizados. O alcance real no APK/web/CLI ainda depende do caminho de execução.
- **Estado.** **COMPROVADOS** os avisos do registro npm e as versões locais; **HIPÓTESE** a explorabilidade no produto, sem prova de entrada não confiável chegando a cada pacote.
- **Sugestão.** Rastrear os pais e os caminhos de execução; preferir versões corrigidas compatíveis com SDK 57 quando disponíveis; tratar o XML de entrada externa como não confiável. Não executar `npm audit fix --force` sem revisar o plano de atualização.
### A4 · P2 médio · Política nega uso publicitário, mas landing envia identificadores de anúncio ao checkout

- **Onde.** `lib/legal-content.ts:55,80-82,84-97`; `app/index.tsx:69,94-113,132-134,192-194`; `context.md:9435`.
- **Evidência.** A política diz que os dados financeiros não têm finalidade de publicidade e afirma "Não usamos seus dados para publicidade". A landing lê `gclid`, `fbclid` e `utm_*` da URL e os acrescenta ao link externo da Cakto. O `context.md` declara a finalidade: envio via Meta CAPI e Google Ads Offline Conversion. Isso é medição de publicidade, ainda que não haja pixel próprio no código da landing.
- **Esperado x encontrado.** Uma pessoa deveria saber que identificadores de clique são encaminhados ao parceiro de pagamento para atribuir conversões; a política só apresenta a Cakto como processadora de cobrança e não descreve esse tratamento. O identificador passa a um terceiro junto ao fluxo de compra.
- **Estado.** **COMPROVADO no código e no contexto** o encaminhamento previsto. **Não verificado em checkout real** se a Cakto recebe/persiste esses parâmetros e se os envia efetivamente à Meta/Google; nenhum formulário ou compra foi feito.
- **Sugestão.** Inventariar o fluxo de atribuição efetivamente ativo e explicar na política os identificadores, finalidade, destinatários e retenção; se a decisão for não fazer atribuição, retirar esse encaminhamento em trabalho posterior. Revisão jurídica antes de publicar texto novo.
### A5 · P3 baixo · Política apresenta bloqueio de captura como geral, mas ele é opcional e só funciona no Android

- **Onde.** `lib/legal-content.ts:117-121`; `lib/screen-capture-context.tsx:17-20,46-56,61-78`.
- **Evidência.** A política publicada em `/privacidade` diz que "capturas de tela são bloqueadas nas telas com informação financeira". O código limita `DISPONIVEL` ao Android, começa ligado por padrão, permite desligar no Perfil e ignora silenciosamente erro em `preventScreenCaptureAsync`.
- **Esperado x encontrado.** A proteção é apresentada sem condição; na web e no iOS não é oferecida, e no Android pode estar desligada ou falhar.
- **Estado.** **COMPROVADO no código e no texto público** o limite da promessa. **Não verificado em aparelho** se o bloqueio funciona nas condições atuais.
- **Sugestão.** Especificar "no Android, quando ativado" e não afirmar garantia em caso de falha; revisar o tratamento silencioso do erro se a proteção for requisito de segurança.


### A6 · P2 médio · `.gitignore` permite versionar variantes comuns de `.env`

- **Onde.** `.gitignore:34-35`; `.easignore:17-19`.
- **Evidência.** `git check-ignore -v .env .env.production .env.local` retornou regras para `.env` e `.env.local`, mas nenhuma para `.env.production`. O `.easignore` cobre `.env.*`, mas só controla o pacote enviado ao EAS. A regra 15 do `AGENTS.md` proíbe credenciais em arquivo versionado, e variantes de ambiente costumam conter as mesmas classes de segredo.
- **Esperado x encontrado.** Qualquer `.env*` local deveria ficar fora do Git, exceto o modelo `.env.example`; hoje `git add .env.production` seria aceito e poderia publicar credenciais no repositório aberto.
- **Estado.** **COMPROVADO** o comportamento das regras do Git. **Não encontrado** `.env.production` versionado nem evidência de vazamento novo por esse caminho.
- **Sugestão.** Em etapa posterior à auditoria, alinhar `.gitignore` ao `.easignore` com `.env.*` e exceção explícita para `.env.example`; conferir o diff antes de commitar.
## Conferências sem achado novo e limites

- **Segredos e Git.** `git ls-files` mostra `.env.example` e `google-services.json`, não `.env`. As variáveis locais foram enumeradas apenas por nome, sem imprimir valor. `.easignore:17-19` exclui `.env` e variantes do pacote; `scripts/preparar-lancamento.ts:35` carrega a trava. `eas.json:18-32` publica URL/chave anônima do Supabase e número do bot via `EXPO_PUBLIC_`, valores intencionalmente embutidos. A chave Firebase de `google-services.json` já foi verificada como chave cliente com restrição de pacote/SHA-1 (`context.md:7139`; Ledger, varredura de 23/09). A senha da conta descartável em `14ef2d2` continua acessível sem login no GitHub; é a pendência já decidida no alerta do `AGENTS.md`, não novo achado. A exposição dos cinco segredos ao EAS e a rotação adiada permanecem no alerta do `AGENTS.md`/`context.md`, sem novo identificador.
- **RLS.** O esquema declara RLS nas tabelas financeiras e de assistente (`supabase/schema.sql:214-217,400,557,652,960,3825,4156,4202`). `documentation/permissions.md` descreve isolamento por `auth.uid()`. A evidência existente `.sb-pentest-evidence/03-api-audit/rls-tests/cross-user-test.json` é revisão estática (`production_test: not_run`), não prova em produção. Não fiz tentativa com dois JWTs nem consulta à produção; uma tentativa de montar consulta de metadados falhou antes de enviar requisição. Harbor cobre RLS profundo; A1 é a travessia local fora do banco.
- **Android.** `app.json:25-27` pede `SCHEDULE_EXACT_ALARM`. `modules/grana-voice-widget/android/src/main/AndroidManifest.xml:7-11` pede áudio, foreground service, notificações e wake lock, coerentes com voz/widget; receivers e serviços estão `exported=false`. Camera, áudio e notificações entram por plugins no `app.json:39-76`. Não houve inspeção do manifest fundido do APK nem teste no aparelho, reservado ao Sentinel. S4 e S48 da nota do Sentinel já cobrem o comportamento de permissão no widget.
- **Config do agente.** L2 do Ledger já registra `.claude/settings.json` com `Bash(*)` e demais liberações locais; a decisão do autor é pendente. L1 registra `PRODUCT.md` modificado. `git branch -vv`, `git worktree list`, `git stash list` mostraram só `main` em `879ac32`, worktree principal e stash vazio. O navegador sem login mostrou o GitHub público no mesmo commit. Não executei `fetch`/`pull` porque a instrução desta auditoria exige somente leitura e o alerta do `AGENTS.md` já registra o pull de segurança concluído.
- **Portal próprio.** `Navegador Watchtower` abriu sem login `https://github.com/Gabriouss/Grana.`, o arquivo histórico em `14ef2d2` (sem copiar credenciais), e `https://www.granaponto.com.br/{termos,privacidade,exclusao-de-dados}`. As três páginas legais renderizaram; `portal text body` confirmou a promessa de exclusão total. O `portal evaluate` foi recusado pela CSP, então não usei DOM por script nem inspecionei cabeçalhos de resposta.
- **Testes.** `package.json:57-65` enumera as seis suítes e `test:ci`. Não rodei suítes porque nenhuma implementação foi alterada. `npm audit --json` concluiu após permitir consulta ao registro npm; `npm audit fix` não foi executado. `git status` permaneceu com as duas alterações preexistentes (`PRODUCT.md`, `.claude/settings.json`).

## Cenários de verificação posterior

1. **Troca de conta offline.** Em aparelho descartável, conta A cria lançamento "AUDIT" e o carrega; sai; conta B entra; cortar rede e abrir Lançamentos. Esperado: nenhum valor de A. Restaurar rede com uma operação offline pendente de A e confirmar que nenhuma linha dela aparece em B. Exige duas contas descartáveis e limpeza ao final; não executado aqui.
2. **Exclusão integral.** Criar conta descartável, enviar feedback com texto e print sintéticos "AUDIT", carregar avatar, excluir pelo app e consultar `auth.users`, tabelas do produto, `storage.objects`, `feedbacks` e caches locais. Esperado: aplicar a política decidida e verificar cada superfície. Não executado porque apagaria dados e exigiria conta nova.
3. **Dependências.** Traçar se XML ou URL externa chega aos pacotes sinalizados pelo `npm audit` nos caminhos de build e runtime; confirmar versão corrigida compatível com Expo 57 antes de qualquer atualização.

## Perguntas ao autor

- A promessa de exclusão deve abranger também feedbacks e prints anexos, ou o produto pretende retê-los com informação clara e tratamento verificável de dados pessoais?
- O encaminhamento de `gclid`/`fbclid` à Cakto para atribuição de conversões está ativo e aprovado como parte da política de privacidade?
- O bloqueio de captura deve ser apresentado como controle opcional de Android na política?
- A rotação de `CAKTO_CLIENT_ID`/`CAKTO_CLIENT_SECRET`, `GITHUB_TOKEN`, `SUPABASE_ACCESS_TOKEN` e `VERCEL_TOKEN` já ocorreu desde a decisão de adiá-la em 16/09? Se não, continua pendência crítica já registrada, sem alterar nada nesta auditoria.

**Resumo:** 6 achados novos: 1 P1, 4 P2, 1 P3. Referências existentes, sem duplicação: alerta do `AGENTS.md` (EAS/rotação/senha histórica), L1/L2 do Ledger (`PRODUCT.md`/permissões Claude), S4/S48 do Sentinel (permissões do widget). Nenhuma correção ou operação de escrita no produto foi feita.


**Verificação do vault ao encerrar.** `node scripts/verificar-vault.mjs` leu 139 notas: 2 links quebrados na nota de auditoria do Harbor (em andamento), 6 notas de auditoria de hoje ainda sem link de entrada, 3 perenes atrasadas e 20 nunca conferidas. Minha nota não contém link interno quebrado. Esses itens pertencem à coordenação/documentação (L4/L8 do Ledger e nota do Harbor), por isso não editei notas de outros agentes.

## Pausa temporária a pedido do autor (limite de uso 90%)

**Ponto exato.** A auditoria está concluída e o resumo foi enviado ao Codex pelo Maestri. O último passo antes da pausa foi conferir no `context.md`, `AGENTS.md`, `docs/` e `documentation/` se A1, A2, A4 e A6 já tinham identificador anterior; não encontrei duplicação. Nenhuma correção foi iniciada. Aguardar comando **RETOMAR** antes de qualquer outra ação.

**Cobertura feita:** [x] segredos no repositório público e histórico; [x] `.env`/`.easignore`/`.gitignore`/`EXPO_PUBLIC_`; [x] RLS e exposição transversal por leitura estática; [x] termos, privacidade e código de exclusão; [x] permissões Android por fonte; [x] `npm audit`; [x] `.claude/settings.json` e inventário de branch/worktree/stash; [x] páginas legais e GitHub no Navegador Watchtower; [x] verificador do vault.

**Falta apenas validação fora desta auditoria de leitura:** [ ] teste A→B com duas contas descartáveis e rede desligada; [ ] exclusão real de conta descartável com feedback/print; [ ] consultar RLS publicada com dois JWTs e comparar schema de produção (Harbor); [ ] manifest fundido do APK e permissões no aparelho (Sentinel); [ ] provar quais avisos do `npm audit` são alcançáveis no build ou runtime. Estas lacunas e seus motivos constam nas seções de cada achado.

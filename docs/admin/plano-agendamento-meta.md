# Agendamento Meta: confiabilidade primeiro, operação mais simples

**Data local:** 19/10/2026.

**Status:** Correção mínima v1 validada localmente; preparação concluída até a etapa anterior à produção. Produção exige nova autorização.

## Fechamento PH em 20/10 — código validado, produção não autorizada

**Estado vigente:** P2 e foco resolvidos localmente; revisão substituta Forge **DE ACORDO** para o SQL no commit `7f1c142aa491a1af2b9337269220f491b4df5b81` e o complemento de foco serializado em `5d838c13ee51c9f508dc3f1dca52cfe4f706be89`. O commit `383372fb4c12a26092ce8752ceba2c4a6866a761` é a primeira correção de foco, complementada nesta ordem para cobrir a expiração do aviso. A ordem do autor das 15h40, recebida via maestro Claude Code #2, autoriza Compass a fechar documentação e publicar Git após revisão, fetch e scanner. **Não autoriza migration, deploy, POST Graph, publicação/republicação nem EAS.** As pendências locais antigas abaixo são cronologia superada; o incidente operacional permanece aberto.

### O que foi concluído localmente

- Recuperação/reagendamento mínimo v1, ponte Node/HTTP, fixture independente, UI por rede/A2 e preservações editoriais em `afce5482`, `69047cfe`, `b9043f60`, `779fa1f2`, `49ba4a9f`, `50d78a02`; foco em `383372fb`; consulta pela chave do comando em `7f1c142a`. Os oito escopos foram confrontados com os recibos Ledger1–8; nenhum commit extra ou caminho indevido foi autorizado por inferência.
- Sentinel preserva evidência composta: agregados/admin/marketing/DOM da base779fa1f; dez medidas de foco390/1440 no383372f; **dois testes DEFAULT no7f1c142**, SQL152 verificações e cadeia HTTP real, exit0. Não é execução integral de todos os agregados no hash final. Fonte: `sentinel-final-7f1c142/relatorio-final-composto.md` e `exits.json`, na pasta externa da rodada.
- Consulta P2 recupera somente o sucessor autorizado e seu estado atual, sem replay do comando, mutação SQL ou novo POST Graph. Publicação incerta permanece com um único media_publish simulado; Facebook publicado e recibos ficam intactos. O teste real usa PGlite/RPC/HTTP senha/TOTP/CSRF/consumidor, com transportes externos dublados. PGlite não comprova concorrência PostgreSQL entre conexões reais.
- **Parecer Forge:** DE ACORDO final no P2 SQL e nos dois arquivos do complemento de foco, manifesto 03407d77e01cd571a64f6986a230a2edac4c8f9ccb31044a2ef9ed01ec4107aa. Forge leu o delta e executou os dois cenários P2 e a regressão de foco390/1440:16 medidas, incluindo expiração/fechamento e respeito ao foco escolhido. O primeiro parecer foi revogado quando a trava Compass demonstrou mudança posterior; a revalidação final cobriu UI LF6999f01a e teste45dd68e8, sem repetir agregados intactos. Fonte: relatorio-forge-final-ph.md, terminado em PRONTO.
- **Preparo Harbor:** pacote externo `harbor/final-ph/pacote-producao/ROTEIRO.md`, 52 arquivos e manifesto `42c266bc3d88c1d95bde17a386ef1f275a959608f5c9fd4c06be3572a843d33d`. SQL guardado de aplicação, leitura de verificação e retorno de sete RPCs preparados; não executados. GETs15h51: metadados/bundles estáveis e reconciliados com fontes históricas63037340/6ad786a0; `updated_at` usado, `verify_jwt=true` preservado. Deno check dos quatro entrypoints de ida/retorno exit0. API é o alvo necessário; worker opcional exige autorização separada. RetornoCLI reempacota fontes e não promete ESZIP idêntico. Fonte: `relatorio-harbor-final-ph.md`; preparo não é ensaio de aplicação/retorno em produção.

### Evidência operacional e limites

- **Instagram, leitura Beacon15h43–15h44:** perfil/vínculo corretos, feed autenticado com três mídias antigas e mídia de controle legível; o novo card09h25 segue ausente no feed, GET da mídia18121924843821858 devolve100/33 e seu container18104038811241529 respondePUBLISHED. Permalink público indisponível. Original do card e Reel seguem sem ID recuperável nos registros consultados. Inconsistência comprovada; remoção, restrição específica, inexistência ou outra causa não foram distinguidas. Não republicar por inferência. Fonte: `relatorio-beacon-final-ph.md`, 21GETsGraph, umGETREST e31 asserções sobre respostas vivas; nenhuma escrita Beacon.
- **503, conclusão Harbor:** cron ativo a cada minuto tinha timeoutHTTP30s; seu `succeeded` às08h30 prova apenas enfileiramento. Worker respondeu503/`executor-indisponivel` após4618ms, sem timeoutHTTP do cron. O bundle transforma exceção do claim limitado a4s no catch externo; tentativas começaram depois da resposta e perderam lease com zero efeito admitido. Essa ordem temporal e a reprodução anterior do claim tardio são comprovadas. Qual exceção chegou ao catch e a origem física da demora continuam **sem confiabilidade suficiente**: logs não distinguem banco/pool/transporte/cold start. Não foi identificada a causa definitiva da latência e a migration não é anunciada como correção dela.
- **Painel4317:** reinício anterior autorizado foi rejeitado pela revisão automática com motivo literal `blocked by policy`; nenhum contorno nesta rodada. Processo/ponte atualizados em memória e QA autenticado desse runtime não foram comprovados. GET200 da casca/saúde não prova atualização. Compass não tentou reiniciar nem reconsultou PID.
- **Produção:** nenhum SQL de escrita, deploy, job, POST Graph ou EAS executado por Compass. Pacote pronto não significa implantado; instalar a migration altera o comportamento do próximo cron existente e exige autorização específica antes da aplicação. Preservar Facebook comprovado e Instagram incerto fora de repetição automática.

### Git e continuidade

Janela Compass exclusiva aberta somente após o parecer final. Fetch antes do commit de foco: exit0, ahead/behind8/0, base origin/main cd14e3d177bbf16e9ebea76627cb41ec701675ec. Complemento de foco commitado sozinho em 5d838c13ee51c9f508dc3f1dca52cfe4f706be89; dois caminhos e hashes finais iguais ao manifesto, scanner staged/mensagem com20 valores exit0 e index vazio. O fechamento documental entra em commit próprio após novo fetch e verificações. O envio Git fica condicionado à varredura de TODO o intervalo (blobs de cada commit, mensagens, nomes e e-mails), sem achado ou commit fora dos escopos autorizados; resultado e hashes de publicação constam do relatório externo Compass. A varredura preliminar dos oito commits anteriores conferiu todos os recibos Ledger e não encontrou e-mail novo em relação à base.

Allowlist documental desta janela: `context.md` e `docs/admin/plano-agendamento-meta.md`. O WIP documental Ledger foi preservado e o estado atual entrou acima dele. Skills não rastreadas, `.codex`, capturas, test-shot, ferramenta de vídeo, solicitações e o plano antigo16/10 permanecem fora da entrega; não houve stage amplo nem promessa de sincronizar esses artefatos. Não foi alterado modelo, conta ou configuração; nenhum terminal parado por limite recebeu mensagem.

Relatório de fechamento e resultado do envio: `E:/Grana-temporarios/2026-10-20-meta-confiabilidade/relatorio-compass-final-ph.md`. A fonte de uma futura implantação será o commit publicado identificado nesse recibo, nunca WIP da pasta compartilhada. Esta ordem substitui os bloqueios antigos de push, não os de produção. Ledger/Quill poderão atualizar os espelhos documentais quando retomarem; Compass não carimba notas/vault como atualizados nesta exceção.

### Seis pontos deste fechamento

1. **Pedido:** executar a parte Compass da ordem15h40 até o fim; após DE ACORDO Forge, fetch/comparação, commits prontos, scanner do intervalo com valores/nomes/e-mails e push; registrar context no mesmo envio. Pare antes de produção.
2. **Sintoma/causa:** P2 consultava chave de comando na tabela de lotes; foco perdia alvos durante confirmação/consulta. Correções locais e provas acima; não atribuir a elas a resolução do503 ou da mídia Instagram indisponível.
3. **Arquivos/IDs:** oito commits e final técnico7f1c142, contexto/plano nesta janela, relatórios finais Forge/Harbor/Beacon, complementos Sentinel e recibos Ledger. Compass substitui Ledger somente no fechamento autorizado, sem alterar produto.
4. **Descartados:** repetir suites intactas, reaplicar WIP-v2, mover layout, misturar arquivos alheios, recuperar por novoPOST, declarar feed visível a partir do container, contornar política ou implantar por causa do push.
5. **Percurso:** o auditor externo Compass interrompeu a conferência inicial por diferenças LF/CRLF/finais mistos; equivalências foram demonstradas pelos hashes e pela fonte original com o hash do recibo, sem alterar arquivos de produto. Outra trava interrompeu o primeiro fechamento antes de fetch/stage quando os dois arquivos de foco diferiram do manifesto aprovado, inclusive em LF; Harbor/Forge foram avisados para alinhar o ajuste posterior e sua revisão, sem restaurar código no escuro. A tentativa auxiliar inline foi rejeitada pelo quoting do PowerShell antes de executar; corrigida em arquivo externo. Exits iniciais não contam como scanner aprovado. Seis referências antigas ao login de teste, já existentes na base remota, foram trocadas por `E2E_TEST_EMAIL` no contexto atual; o histórico remoto não foi reescrito. Nenhum valor de segredo ou e-mail foi impresso.
6. **QA aberto:** runtime4317 autenticado; causa final da indisponibilidade da mídiaIG; execução real no horário/permalink/não duplicação; concorrência PostgreSQL multissessão; implantação e retorno ensaiados somente em futura autorização. Causas não isoladas permanecem hipóteses, com os limites específicos dos relatórios finais.



> As seções a seguir preservam a cronologia. O fechamento PH acima prevalece sobre pendências locais antigas.

## P2 — dono confirmado e limite do painel em execução


**Dono executivo confirmado pela coordenação:** Keel, par backendClaude, agora Opus5.5 medium conforme regra/skill28 segundo o coordenador. Ledger não efetuou troca de modelo/effort/conta. Escopo EXCLUSIVO da correção: `consultar` por idempotência do comando de reagendamento + regressão real na migration nova ainda NÃO aplicada. Zero Git, operação real, context ou notas por Keel. Relatório esperado: `E:/Grana-temporarios/2026-10-20-meta-confiabilidade/relatorio-keel-P2-resposta-perdida.md`; ainda sem recibo final lido nesta atualização. Esta designação supera a pendência de owner executivo anterior; referências Harbor/RPC e Forge/integração do parecer permanecem histórico técnico, não delegação atual da correção. Harbor restaurado, limitado até14h23, aguardando e sem janelaGit.

Watchtower encerrou sua ÚNICA revisão com1P2, confirmado pelo Codex em SQLnovo:417/:238 e UI:689. Não há aprovação final nem segunda revisão geral inferida. Sentinel complementará somente o delta corrigido no NOVO hash; recibo779fa permanece parcial. Sem docscommit ou push até correção final/gates e sinal. Nenhum agregado verde resolve o P2.

**Painel4317 — limite observado pela coordenação:** root conferiu o painel; Prism reportou GET saúde/casca/módulos do commit779fa com HTTP200. O processo Node, porém, continuava antigo. Não foi reiniciado porque as sessões guardadas em Map morreriam, contrariando pedido anterior de preservá-las. Portanto HTTP200 dos arquivos/casca não comprova ponte Node atualizada em memória, teste da nova cadeia no servidor real nem operação de publicação. Não registrar reinício, renovação da ponte ou QA de produção como concluídos. As sessões foram preservadas; uma futura atualização do processo requer coordenação apropriada, sem ação nova por Ledger.

Regra12: (1) pedido de confirmar dono/escopo e registrar limite runtime; (2) P2 de consulta pela tabela/chave errada continua bloqueante, Node antigo é limite do ambiente e não causa atribuída ao P2; (3) Keel/relatório esperado, SQL417/238, UI689 e painel4317 acima; (4) descartado reiniciar apesar da ordem de preservar sessões, tratar GET200 como ponte renovada, ou nova auditoria geral; (5) nenhuma operação adicional Ledger, fatos atribuídos à coordenação/Prism; (6) relatório Keel, correção/regressão/hash novo, complemento Sentinel, sinal docs/push e runtime real atualizado ainda pendentes. Zero testes/diagnósticos/Git write/produção nesta documentação.


## Bloqueio de fechamento — P2 consulta de reagendamento pendente


**Fechamento NÃO aprovado.** Revisão única Watchtower concluída com P2 comprovado; gate final ainda não aprovado. Codex informa conferência no código SQLnovo:417/:238 e UI:689, coincidindo com `relatorio-watchtower-delta-final-v1.md`. Os seis commits locais permanecem preservados, sem docscommit ou push.

Após `reagendar` concluir e perder a resposta HTTP, a UI consulta somente pela chave de idempotência do comando. O SQL consulta essa chave apenas em `admin_marketing_real_lotes`, enquanto ela está em `admin_marketing_real_comandos`; o sucessor conserva o lote original. A consulta retorna `lote-inexistente` e não libera a pendência apesar de o sucessor existir. A prova focal Watchtower usa RPCs reais/PGlite: sucessor criado=true, replay mesmo sucessor=true, consulta pendente=lote-inexistente. A limitação legada não é classificada como regressão introduzida pelo delta; é requisito incompleto da nova recuperação. DOM com resposta fabricada e teste real de replay não cobriam essa consulta real.

- [ ] **P2 bloqueante para este fechamento:** corrigir backend e regressão real de consultar pela chave do comando após resposta perdida, sem novo sucessor ou POST duplicado. Codex coordena a correção; ownership técnico indicado no parecer é Harbor/RPC e Forge/integração-regressão. Designação executiva final aguardando mensagem da coordenação; Ledger somente documenta.
- [ ] Novo hash final após a correção e complemento Sentinel restrito ao delta alterado. Sentinel conclui `779fa1f2367e04b7f60c25914b44169b96d24246` como **parcial**, sem repetir partes intactas e sem estender o verde ao P2.
- [ ] Foco por teclado após confirmação/fechamento/consulta continua com evidência parcial; Watchtower não o classificou como segundo defeito comprovado. Concorrência PostgreSQL multissessão continua não ensaiada.
- [ ] Resultado final/gates e sinal explícito para commitdocs/pushintegral. Nenhum agregado verde anterior (130, cadeia, admin, marketing, Deno ou QA sintético) resolve este P2, pois não cobria o cenário real.

Correção/gate novos ainda sem recibo: não registrar como concluídos. Revisão Watchtower é única e já encerrada com achado; não confundir “revisão concluída” com aprovação. Produção/migration/deploy/posts/EAS continuam sem autorização; latência503 e visibilidadeIG seguem abertas. Ledger leu o parecer e registrou a confirmação do Codex, sem reproduzir teste/diagnóstico, editar produto ou fazer Git write.

Regra12 deste avanço: (1) pedido de bloquear fechamento e aguardar correção/gates; (2) sintoma e mecanismo acima; (3) fontes e linhas do parecer, hash parcial e seis commits preservados; (4) descartado tratar agregado verde/replay como recuperação completa, repetir intactos ou fazer publicação; (5) nenhuma nova intercorrência Ledger; (6) owner executivo final, correção, teste real e novo hash/complemento Sentinel pendentes.


## Fechamento documental preparado — commits locais, gates PENDENTES

**Situação vigente20/10/2026:** os quatro commits técnicos estão integrados localmente: Harbor3 `afce548295c294d7cba06ccbc8b7cedb226ba0d2`, Forge7 `69047cfeae8d497f5162744d289fce33dd311352`, fixture1 `b9043f60cc6098fb4c0105119ecebccb2bb828ea`, Prism6/A2 `779fa1f2367e04b7f60c25914b44169b96d24246`. O hash técnico EXATO entregue ao Sentinel é `779fa1f2367e04b7f60c25914b44169b96d24246`. **Gate final Sentinel PENDENTE; revisão única delta Watchtower PENDENTE.** Nenhum passe é inferido de relatos dos donos.

AllowlistA, três arquivos de aceite/agenda/INDICE preexistentes, preservada em `49ba4a9fb1987e7a7332cf25e754650a566f0bab`. AllowlistB, quatro instruções preexistentes em CLAUDE.md, em `50d78a0282d7c4462153ef0e94bb6f8ccb9cfb03`. São commits próprios posteriores ao hash técnico; não alteram sua implementação. Fetchs antes deA/B exit0, ahead/behind4/0 e5/0; hashes iguais ao inventário focal, allowlist literal e blobs staged conferidos; diff-check e scanner staged com valores exit0. Index ficou vazio. **Sem push; documentos continuam sem commit, aguardando resultados e sinal.** Recibos externos `ledger-commit5-recibo.json` e `ledger-commit6-recibo.json`; não chamar dados editoriais de publicação remota.

Validação LOCAL relatada: Harbor130 e Deno0; Forge cadeia/admin/marketing-real0 com R0 intacto e21 chamadas/recibos simulados; Prism QA sintético390/1440, cadeia0 e admin integral0 após A2 às14h12; fixture isolada/admin0. Manifesto Harbor final c4fc6985 supera16b1; Prism final é o deSEIS arquivos A2, não o de cinco; dependências antigas do manifesto Forge não substituem hashes finais dos donos. O root informa ter visto os prints sintéticos390 de confirmação e1440 da listaA2: inspeção desses prints, não navegação real ou prova de produção.

Produção: nenhuma migration nova aplicada, Edge publicada, operação de job/post ou buildEAS nesta entrega. Bundles observados anteriormente pelo Watchtower correspondem a executor6ad786a/APIreal v1 6303734; não foram reconsultados. Recuperação local não corrige o servidor até uma implantação futura autorizada. Permanecem abertos latência503, permalink/visibilidade do Instagram, ausência de duplicação por evidência operacional, QA do painel autenticado e concorrência PostgreSQL entre sessões reais. Não repetir Facebook comprovado nem Instagram incerto.

Harbor foi restaurado na mesma sessão Sol6.1 xhigh/contaPH, rodapé conferido pelo Codex, continuando limitado até14h23, sem janelaGit nem perda. Ctrl+C dado pelo Codex ao terminal parado no limite tinha encerrado a sessão; retomada recuperou o trabalho, sem Git por Harbor. Nenhum comando de ambiente ou valor foi registrado. Artefatos locais excluídos, skills novas e test-shot permanecem preservados; `.codex`/`.env` fora de qualquer allowlist e sem cópia de dados sensíveis ao vault. Estado limpo/sincronizado não é alegado para WIP local excluído.

### Checklist final provisório

- [x] Harbor3/Forge7/fixture1/Prism6 commitados em escopos próprios; código desta entrega não editado pelo Ledger.
- [x] A(dados) eB(CLAUDE) commitados separadamente após autorização específica; sem push.
- [x] Relatos locais130/cadeia/admin/marketing/Deno/QA3901440 documentados com limites; inspeção root dos prints sintéticos registrada.
- [x] Documentos, sessão e perenes atualizados; seis espelhos Maestri atualizados a partir das fontes atuais e espelhos vault preparados/atualizados nesta etapa documental.
- [ ] Sentinel: gate final no hash técnico779fa1f completo, com recibos e limites.
- [ ] Watchtower: UMA revisão final do delta com veredito, sem Git.
- [ ] Registrar os dois resultados efetivos; sinal para commitdocs e push integral. Nenhum push antes dos resultados/sinal.
- [ ] Produção/piloto/SQL remoto/deploy/posts/EAS: NÃO autorizados. QA operacional, IG, latência503 e multissessão continuam pendentes.

Esta seção substitui o estado de andamento dos checklists anteriores; os demais blocos preservam a cronologia e suas pendências da época.

## 1. Diagnóstico e direção

Recomendo evoluir a base atual, preservando snapshots imutáveis, idempotência, execução remota e recibos. O painel continuará local; publicações confirmadas continuarão executando com o computador desligado.

A auditoria encontrou estes pontos principais:

| Ponto | Consequência | Prioridade |
|---|---|---|
| Divergência entre contrato do servidor e consumidor, já corrigida pontualmente | Uma prévia HTTP 200 podia ser recusada pela interface | Alta: prevenir recorrência |
| Alterações e recusas locais não suspendem consistentemente autorizações remotas | Conteúdo antigo pode continuar autorizado | Alta |
| Preparação privada já impede reagendamento | Mudar o horário fica bloqueado antes de publicar | Alta |
| Validade operacional vencida também bloqueia consultas de confirmação | O painel pode perder a capacidade de descobrir o resultado | Alta |
| Confirmações repetidas e linguagem técnica na jornada | Mais esforço e insegurança para agendar | Alta |
| Saúde mede disponibilidade, sem demonstrar prontidão da publicação | Cron funcionando pode coexistir com publicações pendentes | Alta |
| Três suítes importantes ficaram fora dos comandos habituais e da CI | Regressões do executor podem passar despercebidas | Alta |

Os bloqueios de reagendamento e de consultas estão na [máquina de estados SQL](../../supabase/migrations/20261018001000_admin_marketing_real.sql#L368). A repetição de confirmação aparece no [compositor atual](../../tools/admin-local/web/telas/_publicacoes-reais-ui.js#L595).

**Limites da auditoria:** análise do código em `f77bf0b`, alterações existentes preservadas e avaliação visual de prints de ensaio. Executor, renovação e SQL passaram em **312 verificações locais**, com serviços simulados. Não houve nova publicação nem validação completa no painel autenticado.

## 2. Jornada e design propostos

O caminho principal será:

**Revisar peça → Aprovar conteúdo → Escolher redes e horário → Conferir prévia → Agendar → Acompanhar por rede.**

- **Uma confirmação final:** a prévia reúne imagens, ordem, capa, legenda, contas e horários. O botão “Agendar” conclui a autorização, sem checkbox seguido de outro modal equivalente.
- **Autenticação no momento necessário:** se a autenticação recente vencer, solicitar o código preservando a seleção. Uma prévia vencida precisa ser renovada.
- **Calendário orientado ao trabalho:** “Próximas publicações” e “Precisam de atenção” aparecem antes dos controles operacionais. Pausas ativas ficam visíveis; configurações e simulação ficam em ferramentas separadas.
- **Estados compreensíveis:** distinguir “Planejado”, “Agendado no painel”, “Preparando”, “Publicado”, “Suspenso para revisão” e “Precisa conferir”. “Agendado na Meta” só aparece com evidência correspondente.
- **Resultado independente por rede:** Facebook publicado e Instagram pendente aparecem separadamente, com próximo passo específico.
- **Erros úteis:** apresentar causa e ação primeiro; identificadores, revisões e códigos ficam em “Detalhes técnicos”.
- **Publicado e prévia do perfil:** separar histórico comprovado da composição editorial futura. Uma falha na leitura editorial não deve impedir consultar publicações existentes.

A distinção entre preparação e publicação precisa permanecer explícita: a própria documentação da Meta apresenta essas etapas separadamente. [Referência oficial](https://www.postman.com/meta/instagram/request/munmruq/get-ig-container-status).

Na acessibilidade, corrigir semântica dos cartões acionáveis, preservar foco ao trocar seleções, melhorar contraste das datas fora do mês e adotar alvos de toque de 44 px. Manter a identidade visual existente e testar agenda móvel e calendário desktop.

## 3. Código, backend e interfaces

### Identidade editorial e suspensão

Implementar a decisão tomada nesta conversa: **uma alteração suspende os agendamentos antigos até nova revisão**.

- Criar `conteudoId` estável, independente da pasta, com aliases dos identificadores anteriores. Hoje a identidade física depende do caminho, conforme o [catálogo](../../tools/admin-local/marketing/catalogo.cjs#L722).
- Tratar Reel e capa como uma unidade. Alternativas editoriais independentes permanecem separadas.
- Manter no servidor a geração editorial, versão aceita e situação da autorização.
- Introduzir operações idempotentes `iniciarRevisao`, `registrarVersao` e `registrarAceite`, com comparação da revisão esperada.
- Painel e CLI dos agentes devem receber o **recibo remoto de suspensão antes de alterar conteúdo agendado**. Rascunhos continuam editáveis offline.
- Aprovar a nova versão não retoma publicações automaticamente. Uma nova prévia permite revisar alterações, destinos e horários afetados e confirmar a substituição.
- Preservar publicações existentes. Envios já iniciados continuam em conferência, pois uma requisição enviada à Meta pode ter produzido efeito.
- Na migração, associar apenas identidades com vínculo inequívoco. Agendamentos com vínculo ambíguo ficam suspensos para revisão.

As duas máquinas usarão a revisão do servidor para resolver concorrência. Uma cópia desatualizada deverá sincronizar antes de autorizar mudanças.

### Contratos e validação

- Introduzir `e5.real.v2`, com o mesmo formato de resposta entre servidor, adaptador e navegador.
- Retornar explicitamente estado e motivos por destino, mantendo distintas as revisões da prévia, do snapshot e da geração editorial.
- Centralizar no SQL o cálculo de elegibilidade usado pela prévia e pela confirmação. A confirmação sempre revalida as condições.
- Aplicar consistentemente a propriedade dos snapshots nas operações relacionadas.
- Antecipar a validação de mídia, conta, formato, validade operacional e tempo necessário de preparação.
- Preservar a conversão de transporte para JPEG já implementada, sem modificar os originais aprovados nem recortar silenciosamente as peças.

### Executor e recuperação

- Separar autorização para **produzir efeitos** da autorização para **consultar resultados**. Pausa ou capacidade vencida deve impedir novos envios sem impedir conferência de um envio anterior.
- Preservar etapa interrompida e evidência disponível; distinguir preparação privada interrompida de publicação incerta.
- Permitir reagendamento após preparação privada mediante nova prévia: cancelar atomicamente o trabalho anterior e criar um sucessor vinculado. A primeira versão não reaproveitará containers preparados.
- Bloquear reagendamento quando uma publicação já puder ter ocorrido; oferecer “Conferir publicação”.
- Retirar trabalhos com orçamento esgotado da seleção da fila, registrando atenção explícita.
- Manter prazo total de 25 segundos, reserva para gravação de recibos e proteção contra repetição de publicação incerta.
- Estimar antecedência necessária considerando etapas e fila. Horário inviável deve receber explicação e alternativas antes da confirmação.

### Operação

Criar uma visão autenticada com último executor concluído, resultado HTTP, atraso da fila, recibos pendentes, publicações incertas e situação das contas.

Registrar erros sanitizados com fase, HTTP, código/subcódigo e indicação de efeito admitido. Separar acesso verificado, validade da credencial e capacidade comprovada por formato.

## 4. Validação e implantação

Adicionar `test:marketing-real` à CI, incluindo executor, renovação, SQL, contratos e checagem Deno dos endpoints de marketing.

Os cenários obrigatórios serão:

- Fluxo completo servidor → adaptador → HTTP local → consumidor real.
- Carrosséis de cinco e dez imagens, dois destinos e resultado parcial.
- Alteração de legenda, ordem ou capa suspendendo agendamentos anteriores.
- Concorrência entre revisão, confirmação, executor e segunda máquina.
- Reagendamento após preparação privada, sem publicação duplicada.
- Resposta perdida, prazo excedido, recibo indisponível e publicação sem identificação recuperável.
- Consultas funcionando durante suspensão operacional.
- Trabalho no limite de tentativas sem bloquear os seguintes.
- Teclado, foco, leitor de tela, contraste e larguras de 390 e 1440 px.

**Ordem de implantação:** contratos e testes → identidade/suspensão → recuperação do executor → interface → piloto.

Usar migrations aditivas, comparar produção com o repositório e guardar os bundles anteriores. Manter leitura compatível durante a transição; clientes antigos devem receber orientação para atualizar antes de realizar novas escritas.

O piloto deve comprovar publicação autorizada e leitura posterior em cada rede. HTTP 200, cron concluído ou container preparado isoladamente não encerram esse teste.

Alertas iniciais: executor sem conclusão há mais de três minutos, trabalho vencido há mais de dois minutos e qualquer publicação incerta. Esses valores serão limites operacionais iniciais, sujeitos à medição do piloto.

## 5. Melhorias adicionais priorizadas

Após estabilizar o fluxo principal:

| Melhoria | Benefício | Etapa |
|---|---|---|
| Comparação entre versões | Mostrar mudanças de legenda, imagens, ordem e capa antes de substituir agendamentos | Junto da revisão |
| Rascunho de horário e destinos | Evitar repetir escolhas após fechar ou renovar uma prévia | Próxima |
| Preferências de contas e formatos | Reduzir seleção repetitiva, mantendo revisão explícita | Próxima |
| Visão semanal com títulos e conflitos | Facilitar distribuição e identificar sobreposição | Próxima |
| Texto alternativo por imagem | Melhorar acessibilidade das publicações | Posterior, conforme capacidade da API |
| Campanhas, UTMs e resultados por peça | Relacionar conteúdo publicado a desempenho | Posterior |
| Avisos fora do painel | Informar falhas com o computador desligado | Posterior, após definir o canal |

**Premissas fechadas:** administrador principal único, painel local, prioridade em confiabilidade e simplicidade, suspensão antes de alterar peças agendadas e nova revisão antes de autorizar a versão substituta.


## Atualização factual de 20/10/2026 — incidente em investigação

O conteúdo aprovado acima está preservado. Este adendo é andamento factual, não aceite de implantação.

Pedido do autor: “corrigir agendamento Instagram que nao publicou hoje”; plano `docs/admin/plano-agendamento-meta.md`. Ledger documentação exclusiva; Compass mapa; Harbor Edge/SQL; Forge Node; Prism UI; Beacon Meta; Sentinel gates; Watchtower auditor. Sem Harvard. Contas confirmadas em maestri list: PH Compass/Forge/Harbor/Beacon; Gabriel Prism/Sentinel/Ledger/Watchtower; maestro sem troca conforme handoff. Modelo/effort preservados.

- Inventário: main 761d915, origin/main local no mesmo hash, uma worktree, nenhum stash; sem fetch novo. WIP anterior e plano untracked preservados. Após revogação da regra27, git status -sb exit0 sem gancho; parada histórica das 23h45 superada.
- Compass: H1/A2 reproduzidos (seis asserções exit0), A1/A3 e WIP-v2 localizados. Verde confirma defeitos, não correção. Resumos abaixo da grade refletem decisão posterior b112bfb. Fonte relatorio-compass-plano.md:29,37–48.
- Harbor parcial: HTTP503 às 08h30, preparo sem efeito admitido virou incerto após lease vencer às 08h33. Recuperação perde etapa e reagendamento recusa qualquer tentativa anterior; causa estrutural atribuída à perícia Harbor. Origem do 503 ainda não isolada. Fonte relatorio-harbor-diagnostico.md:3–9.
- Beacon: Facebook do card comprovado; IG original/Reels precisam conferir. Novo IG09h25: banco publicado/container PUBLISHED, porém mídia HTTP400 100/33 e ausência no feed. Isso limita a conclusão de “publicado/verificado” do banco: visibilidade IG ainda sem prova. Não repetir FB nem IG incerto. Fonte relatorio-beacon-publicacao.md:5–13,37–54; cinco asserções de evidência viva exit0 não aprovam correção.
- Pendentes Harbor final, Forge/Prism, Sentinel por hash, Watchtower, IG autenticado/permalink sem duplicar FB. Ledger não rodou testes do produto ou sondas. Sem EAS/posts/ativação/deploy/migration; sem commit/push até coordenação serializar. Seis espelhos somente no fechamento. Registro de seis pontos aberto no vault/Maestri e em E:/Grana-temporarios/2026-10-20-meta-confiabilidade/registro-ledger-andamento.md; fontes citadas na mesma pasta.

**Layout:** a proposta original de resumos antes da grade foi superada por pedido posterior do autor (b112bfb). Não reabrir essa posição como correção do incidente. **WIP:** comparação de versões/rascunho no pacote arquivado não é entrega integrada; não reaplicar WIP-v2. **Próximo aceite:** perícia final e reconciliação das evidências IG; correção mínima pelos donos; gate por hash até consumidor final, verificando zero novo POST FB e zero repetição incerta. Operação/piloto exigem autorização posterior; resultado exige permalink IG confirmado e ausência de duplicação FB.

- **Andamento posterior, Prism:** correção H1 local sem commit: allowlist estrita com dois recibos reais; novos testes vermelhos antes e 93 verificações verdes depois, mensagens 34+16 códigos exit0. Fonte externa `relatorio-prism-H1.md:11–18,26–42`. Pendente integração Forge/gate Sentinel/auditoria e operação; não prova publicação. Beacon não conseguiu carregar portal para leitura visual autenticada (adendo de seu relatório); IG divergente continua aberto. Verificador vault Ledger exit0, zero links quebrados/órfãs/fontes ausentes, 16 perenes atrasadas; não são revisões concluídas. Seis espelhos aguardam fechamento.

- **Coordenação posterior e adendo Harbor09h35:** autorizados somente arquivo de migration aditiva v1/testes e contrato mínimo de reagendar com prévia nova (Harbor/Forge/Prism); ZERO deploy/SQL write. Watchtower exclusivo diff/backups; Forge R0 até consumidor final. Harbor relata 16 verificações exit0 reproduzindo claim tardio com worker publicado e RPCs efetivas: prazo4s, worker50308h30:04.707 e preparações08h30:05.139. Origem da latência permanece aberta. Fonte `relatorio-harbor-diagnostico.md:11–15`, `harbor/21-local-reproduction.json`. Regra27 revogada, nenhum agente para por75%; modelos/effort preservados.
- **Prism H1, recibo posterior:** dono informa commit/push serializado autorizado `cd14e3d177bbf16e9ebea76627cb41ec701675ec`, somente allowlist+teste, fetch/comparação0/0 e testes93/mensagens34+16 exit0. Fonte `relatorio-prism-H1.md:44` em diante. Supera a pendência de commit H1; não aprova deploy/produção, R0 ou gates restantes. Ledger segue sem commit até coordenação serializar o seu. IG09h25 permanece divergente, inseguro repetir; FB confirmado Beacon, enquanto consulta independente Harbor retornou código10 sem superar o GET positivo anterior.

- **H1 acompanhamento ENTREGUE:** confirmação da coordenação e adendo `relatorio-prism-H1.md:44` em diante: `cd14e3d177bbf16e9ebea76627cb41ec701675ec`, somente `tools/admin-local/web/telas/_publicacoes-reais.js` e `__tests__/admin-publicacoes-reais-modelo.cjs`; baseline39 → novo teste vermelho → corrigido93, mensagens34+16 exit0; fetch prévio0/0, push exit0, pós0/0, segundo Prism. Ledger conferiu `git show --stat` dos dois caminhos. Correção entregue do acompanhamento, **causa completa do incidente não resolvida**. FB provado por Beacon `/published_posts`; código100/subcódigo33 refere-se ao novo Instagram. Ordem do autor cancela qualquer parada75%: todos seguem, modelos/effort mantidos. Documentação sem commit até sinal, demais gates e operação continuam pendentes.


## Retomada documental — continuidade factual (20/10/2026)

Recibo às 09h43 BRT; andamento, sem fechamento da rodada.


1. **Pedido recebido:** “continua o trampo do painel e aponta docs/admin/plano-agendamento-meta.md”; documentação EXCLUSIVA, continuidade factual e checklist local versus produção. Harbor mínima v1 recuperação/reagendamento; Forge R0 cadeia inteira; Prism ação por rede/UI sem redesign; Sentinel gate; Watchtower uma revisão delta final. Sem trocar modelo/effort. “Antes de fechar vou serializar commits/push; ainda nao commitar.”
2. **Sintoma e causa:** Instagram não publicado no horário relatado. H1 impedia acompanhar recibos legítimos e já foi corrigida; não é explicação completa. Harbor reproduziu claim tardio após HTTP503 e recuperação sem preservar etapa, seguida de reconciliação sem ID. Origem exata da latência503 permanece aberta. Divergência do novo IG não foi resolvida por marcar o banco publicado.
3. **Arquivos e identificadores:** donos e checklist em `docs/admin/plano-agendamento-meta.md`, continuidade em `context.md`; H1 `cd14e3d177bbf16e9ebea76627cb41ec701675ec`; lote original `e1206cca`, IG original `01e8f240`, FB `edf3ad26`, sucessor IG `cfb2d230`/job `2c70d4c5` com snapshot distinto segundo Forge. Fontes externas citadas no checklist. Inventário/fetch desta retomada recebidos do Codex/autor, sem repeti-los: exit0 e divergência0/0, main única, worktree única, stash zero. WIP anterior e plano untracked preservados.
4. **Descartados e limites:** não reaplicar WIP-v2, não repetir diagnóstico ou testes, não redesenhar, não converter baseline/reprodução em gate final, nem chamar correção H1 de resolução do incidente. ZERO deploy, SQL remoto, posts e EAS. Migration autorizada significa somente arquivo e ensaio local dos donos; não aplicação remota.
5. **Percurso:** notas Maestri atuais recuperadas, convenções/índice do vault relidos e relatórios Forge/Watchtower/Sentinel incorporados documentalmente. Primeira leitura ampla de context.md truncou e mostrou encoding inadequado; detalhes relevantes foram relidos em UTF-8 e por fontes focais. Nenhum problema novo do produto foi inferido desse erro de leitura. Nenhuma edição de produto por Ledger.
6. **Não verificado / continuidade:** [ ] entregas mínimas Harbor/Forge/Prism e recibos finais; [ ] hash/bytes e gate Sentinel; [ ] revisão delta única Watchtower; [ ] causa latência503; [ ] visibilidade/permalink IG e não duplicação em etapa autorizada; [ ] painel autenticado/QA operacional. [ ] No fechamento, atualizar perenes afetadas e seis espelhos Maestri a partir das fontes, espelhos do vault e verificador documental. Sem carimbar revisão de conteúdo ainda não conferido. Commit/push aguardam serialização explícita; rodada permanece aberta.

O checklist desta retomada inicial foi superado pela consolidação dos recibos finais abaixo.


## Consolidação dos recibos finais locais — 20/10/2026

**Entrega local relatada; produção inalterada nesta etapa.** Ledger leu os relatórios finais Harbor, Forge, Prism e fixture. A coordenação informa conferência de16 arquivos contra manifestos atuais com zero divergências e fetch novo0/0 em `cd14e3d`; Ledger não repetiu conferência, diagnóstico ou testes.

- **Harbor, três arquivos:** recuperação mínima v1 preserva etapa interrompida; lease de preparo sem efeito admitido pode retomar, preparo admitido incerto fica para atenção, publicação possível/incerta nunca é repetida. Nova prévia vinculada ao job/revisão permite sucessor atômico vazio, mantendo pausa e outra rede intacta. Consultas continuam sob pausa/validade vencida; orçamento esgotado sai antes do LIMIT. DTO autoritativo traz `reagendamento:{permitido,motivo,motivos}`; singular é alias aditivo coerente, UI usa plural. **Manifesto agregado final `c4fc6985e4fd85c8edba25f9a2ce029a9ad20d7df18feda881dd18973f4792c9` supera `16b1efad…`; não é hash de commit.** Teste final130 verificações exit0, baseline exit1 esperado, Deno dos dois endpoints exit0; cadeia final após alias também exit0, segundo o dono.
- **Forge, sete arquivos:** ponte Node/HTTP exige prévia nova com jobId e previaId/previaHash, sem recapturar/upload; regressão versionada percorre SQL/PGlite → Edge → adaptador → domínio → HTTP autenticado → consumidor real. R0 original intacto (`FFC3254E18D21A588285E96E3ACF455C0F1FD02CC0D5B0A78186316AF31FD82B`); cinco PNG→JPEG, FB+IG,21 chamadas/21 recibos simulados, readback antes de publicado. Recuperação/replay, exatamente um POST simulado para publicação incerta e zero novo POST Facebook após publicado. Relata admin integral e marketing-real integral com testes UI/Deno exit0. Dependências Harbor citadas em manifesto antigo do Forge NÃO identificam o hash final; usar manifesto Harbor c4fc6985 atual, validado pela coordenação.
- **Prism, cinco arquivos:** ação por rede com elegibilidade SQL, preparo privado→nova prévia de um destino→confirmar reagendamento; nada de confirmar lote genérico. Resposta perdida mantém chave e bloqueia reenvio até consulta resolvida. Preserva layout/resumos abaixo da grade, sem redesign. Testes consumidor/modelo93/mensagens34+16 e cadeia exit0 relatados. QA browser sintético390/1440 exit0, rotas totalmente dubladas; foco, overflow, mídia e fluxo novo conferidos pelo dono. Isso não é login no painel real nem operação Meta.
- **Fixture Forge, um arquivo separado:** `__tests__/admin-aceite-derivado.cjs` remove dependência frágil do acervo vivo, mantém allowlist real e negativas de aceite composto. Teste sintético, baseline761d915 isolada e admin integral exit0 relatados; produto e dados editoriais intactos. Supera a causa herdada do admin=1 na baseline, sem reescrever o recibo histórico.
- **Ordem Git vigente:** Harbor autorizado agora commit exclusivo3 → Forge7 → Prism5 → fixture1. Autorização não é confirmação de commit concluído: hashes novos aguardam recibos. Watchtower faz UMA revisão final do delta; Sentinel gate no hash integrado antes de qualquer push. Docs Ledger e allowlists A/B só após sinal específico do Codex. Sem stage/commit/push por Ledger.
- **Produção e limites:** migration nova NÃO aplicada; Edge NÃO publicada. Produção observada anteriormente continua executor6ad786a/APIreal v1 6303734 até evidência autorizada posterior. Sem posts, SQL remoto, deploy ou EAS nesta entrega. PGlite serializa conexão: interleavings locais não provam locks/deadlocks PostgreSQL entre sessões reais. Causa latência503, IG original e visibilidade/permalink do IG09h25 continuam abertos; não repetir Facebook comprovado nem Instagram incerto.

Fontes externas: `relatorio-harbor-v1-recuperacao.md`, `relatorio-forge-regressao.md`, `relatorio-forge-fixture-aceite.md`, `relatorio-prism-reagendamento-v1.md`, todos em `E:/Grana-temporarios/2026-10-20-meta-confiabilidade/`. Evidência remota anterior em `relatorio-watchtower-producao.md` e `relatorio-beacon-publicacao.md`. Resultados atribuídos aos donos; Ledger não executou suítes de produto.

### Checklist vigente para fechamento

| Frente | Local comprovado por relato/recibo | Ainda pendente |
|---|---|---|
| H1 | [x] `cd14e3d` já publicado no GitHub, dois recibos estritos aceitos. | [ ] Incidente completo e painel real não se encerram por H1. |
| Recuperação/reagendamento v1 | [x] Harbor implementou3 arquivos,130 verificações e Deno0; agregado final c4fc6985. | [ ] Commit3 confirmado, revisão delta e gate integrado; [ ] aplicação remota futura autorizada. |
| Cadeia R0/HTTP | [x] Forge implementou7 arquivos, cadeia/admin/marketing/Deno verdes locais; R0 intacto. | [ ] Commit7 confirmado e Sentinel no hash integrado. Manifesto antigo de dependências não vale como hash final Harbor. |
| Ação por rede/UI | [x] Prism implementou5 arquivos, prévia+confirmação, bloqueio de repetição; QA sintético390/1440 e cadeia0. | [ ] Commit5 confirmado; [ ] painel autenticado real/QA operacional autorizado. |
| Fixture aceite | [x] Um arquivo Forge isolado, negativas mantidas, baseline sintética/admin0. | [ ] Commit1 próprio confirmado e inclusão no gate integrado. |
| Auditoria e gate | [x] Coordenação informa16 arquivos sem divergências; backups remotos anteriores guardados. | [ ] UMA revisão delta Watchtower e gate Sentinel no hash integrado, ANTES de push. Não substituir por testes dos donos. |
| Produção/Meta | [x] Somente recibos históricos de leitura registrados; FB comprovado por Beacon. | [ ] Nenhuma migration/deploy autorizado; [ ] latência503 e IG/permalink/ausência de duplicação; [ ] concorrência PostgreSQL multissessão. |
| Demais itens do plano | [x] WIP-v2 preservado fora da integração; layout sem redesign. | [ ] Identidade/suspensão editorial integral, demais melhorias e piloto não aprovados por esta entrega mínima. |
| Documentação/Git | [x] Checklist, seis pontos e perenes consolidados com fontes locais separadas de produção. | [ ] Atualizar seis espelhos a partir do estado final; [ ] verificador documental final; [ ] sinal para commits docs e allowlists A/B; [ ] push somente após gate. |

Inventário focal externo `relatorio-ledger-inventario-wip.md`: A=dados de aceite/agenda/INDICE em commit próprio; B=CLAUDE.md em outro. Artefatos locais/skills/test-shot preservados fora da entrega, sem copiar dados sensíveis ao vault. Não chamar árvore limpa ou WIP sincronizado enquanto persistirem arquivos locais excluídos.

### Seis pontos desta consolidação

1. Pedido: fechamento retomado após limite, sem refazer entregas; consolidar docs/checklist/perenes e preparar seis espelhos/verificador. Docs e A/B só depois do sinal.
2. Sintoma/causa: acompanhamento H1 e bloqueio/recovery tratados localmente. Latência503 e visibilidade IG reais continuam sem solução comprovada. Fixture corrige teste dependente do acervo, não produto nem aceite real.
3. Arquivos/IDs: relatórios e escopos3/7/5/1 acima; manifesto Harbor c4fc6985 final,16b1 superado, dependências antigas Forge históricas; novo hash integrado ainda pendente de recibo.
4. Descartado: repetir testes/diagnósticos; tratar130/QA sintético como produção; reaplicar v2; fazer push antes de Sentinel; commitar docs/A/B antes do sinal; expor/copiar dados `.codex`/`.env`.
5. Percurso: nenhum teste de produto executado por Ledger. Uma tentativa de ler nome presumido de manifesto Forge não existia; usada a fonte final entregue pelo dono e a conferência16/0 da coordenação, sem inventar hash final. Nenhum erro de produto inferido disso.
6. Pendências: revisão delta única Watchtower, commits/recibos serializados, hash integrado/gate Sentinel, sinal docs/A/B e push posterior. Seis espelhos preparados externamente para publicar ao fechamento; verificador documental separado das suítes de produto. Concorrência multissessão, painel real e operação/IG ficam explicitamente abertos.


## Commits mecânicos concluídos — gate integrado ainda pendente


1. **Pedido:** janela Git exclusiva transferida ao Ledger porque Harbor estava limitado até14h23; três commits mecânicos e adendo autorizando o quarto, apenas allowlists literais, sem editar código. Fetch/comparação, hashes, staged e scanner antes de cada commit; sem push; docs/A/B continuam aguardando sinal.
2. **Comportamento/causa A2:** Prism comprovou apresentação que ignorava `motivoSuspensao`. Helper comum agora representa suspensão editorial não terminal em descrição/resumo/lista/ícone/agrupamento de atenção, sem mudar o job recebido nem oferecer reagendamento contraditório. Estados terminais preservados. Não altera SQL/Edge nem ativa v2; identidade visual e resumos abaixo da grade preservados. Manifesto final seis arquivos `prism-arquivos-v1-a2-final.json` supera o anterior de cinco. Recibo Prism14h12: admin integral0; QA390/1440 e cadeia0 relatados. Nenhuma suíte repetida por Ledger.
3. **Commits efetivos:** Harbor3 `afce548295c294d7cba06ccbc8b7cedb226ba0d2`; Forge7 `69047cfeae8d497f5162744d289fce33dd311352`; fixture1 `b9043f60cc6098fb4c0105119ecebccb2bb828ea`; Prism6 `779fa1f2367e04b7f60c25914b44169b96d24246`. **Hash integrado para Sentinel: `779fa1f2367e04b7f60c25914b44169b96d24246`.** Fetches exit0; ahead/behind antes de cada commit0/0,1/0,2/0,3/0. Hashes literais dos próprios e blobs staged conferidos, diff-check0, scanner `--staged --valores`0 com saída sanitizada em cada; index vazio após cada commit. Recibos externos `ledger-commit1-recibo.json` até `ledger-commit4-recibo.json`. Dependências históricas do manifesto Forge não foram usadas para aprovar bytes Harbor; este seguiu c4fc6985 final.
4. **Descartados:** stage amplo, incluir Prism anterior de cinco caminhos, misturar docs/A/B, repetir suítes verdes, fazer push antes do gate, operar SQL/Meta/deploy/EAS ou ler/expor conteúdo `.codex`/valores de ambiente. Scanner autorizado compara valores internamente; saída apenas sanitizada, sem valores registrados.
5. **Intercorrência do Codex, relato do coordenador:** Ctrl+C no Harbor parado no limite encerrou o terminal. A sessão original foi restaurada por retomada, mantendo MESMO Sol6.1 xhigh e contaPH, conferidos no rodapé segundo Codex; não houve perda de trabalho nem operação Git por Harbor. A janela dele foi cancelada e transferida ao Ledger. Não registrar comando de ambiente ou valores. Ledger não trocou modelo/effort/conta nem repetiu a restauração. A operação Git subsequente do Ledger concluiu sem erro; janela liberada ao Codex por enviar.sh com confirmação.
6. **Pendências:** revisão delta única Watchtower e gate Sentinel no hash integrado acima; somente depois push coordenado. Docs e allowlistsA/B ainda sem commit/sinal; WIP anterior preservado fora dessas allowlists. Atualizar candidatos dos seis espelhos com novas fontes/hashes ao fechamento e rodar verificador documental final. Nenhuma aplicação da migration/deploy autorizada; produção, latência503, permalink/visibilidadeIG e concorrência PostgreSQL multissessão continuam distintos do aceite local.

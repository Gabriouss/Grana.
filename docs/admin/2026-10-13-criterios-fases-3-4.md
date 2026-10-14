# Critérios de aceite — Fases 3 e 4 do painel administrativo

Versão documental: 2026-10-13 (M1)  
Status: critérios consolidados; F3, F4 e gates globais ainda abertos.  
Fonte de produto: matriz Compass em `E:\Grana-temporarios\2026-10-13-admin-fases34\relatorio-compass-escopo.md`.  
Base inicial dos relatórios: `43e035d76b2c6acb040ba74cbbb7eef53ec14a8b`. Atualização posterior de Prism e Sentinel informa merge local `915d82d9725ba7036c589bc8c2d42bc503cceecd` (`feature/admin-panel-continuation`). Ledger não verificou Git.

## Escopo e limites

Fechar F3 (aprovação, promoção, cronograma, Dia D, vínculo e planejamento) e F4 (timeline, DTO público, contador e alertas) no snapshot integrado que Codex congelar. Usar fixtures descartáveis `AUDIT-F3F4`; não alterar semana 39 nem calendário editorial real. F11 permanece suspenso. Não incluir scheduler/outbox, deploy, migration, build, chamada Meta ou publicação real.

O autor informou nesta sessão que duas publicações de teste no perfil Grana funcionaram em 12/10 e que a API está configurada localmente. Harbor, Forge e Watchtower registram esse relato; nenhum agente desta documentação o reproduziu. O contrato `GET /api/marketing/calendario/ensaio` com `realHabilitado=false` e `chamadasMeta=0` descreve somente o ensaio e não prova que a integração real esteja globalmente desligada. A frase da matriz Compass dizendo que “Meta real permanece desligada” precisa ser reconciliada pelo próprio Compass/Codex antes de ser tratada como estado factual.

## Evidência atual, sem aceite global

- Watchtower 13/10 registra W-C1 (link literal/percent-encoded, vínculo → promoção → releitura) e W-C2 (staging exclusivo `wx`, ownership após aquisição e cleanup apenas próprio) corrigidos no HEAD e aprovados em focais. Isso corrige o estado stale do Item C; não encerra o aceite global.
- Harbor registrou oito focais, todos `exit=0`, às 08:37:37–08:37:40 em `E:\Grana-temporarios\2026-10-13-admin-fases34\harbor-final-*.{log,exit}`: `admin-cronograma` (32 grupos), `admin-meta-promocao`, `admin-marketing-trilha`, `admin-ajustes-dto`, `admin-ajustes-catalogo-dto`, `admin-calendario-cronograma-integracao`, `admin-calendario-helper-ajustes` e `admin-ajustes-vigia` (13 verificações). Fixtures isoladas; o log de cronograma declara zero rede/Meta.
- Forge registrou `exit=0` às 08:36:17 para `admin-demandas-contador`, `admin-calendario-cronograma-tela` e `admin-calendario-helper-ajustes` em `forge-focais-receipt.json`. São execuções no repositório compartilhado sem nova edição nessa execução; não substituem novo gate após a integração.
- O plano Sentinel existe, mas a pasta não contém recibos de `test:ci`, TypeScript, HTTP/browser/E2E ou screenshots finais. Sentinel deve operar somente após freeze do snapshot integrado em cópia externa, sem `.env` nem dados reais.
- Prism não observou browser/screenshot nesta rodada. O recibo visual de 12/10 é apenas baseline de fixture anterior. Watchtower revisou um snapshot parcial, não os bytes integrados finais.

## Matriz executável

| ID | Procedimento | Aprovação exigida | Ownership |
|---|---|---|---|
| F3-1 — fluxo e prova | Em fixture, aprovar versão visível → promover → criar cronograma vazio → adicionar item → declarar Dia D da fixture → vincular versão aprovada → reler a peça planejada no calendário. | Um único vínculo correto no `INDICE.md`; recibos de promoção, vínculo e calendário continuam válidos após releitura; conflito, versão alterada e duplicidade mostram motivo/próximo passo; nenhum sucesso inferido só de HTTP 200. Sem mutação editorial real. | Forge (UI), Harbor (backend); Beacon somente leitura do conteúdo semanal. |
| F3-2 — codec e staging do Item C | No snapshot final, executar `admin-cronograma.cjs` e `admin-meta-promocao.cjs`; testar link literal e codec exato, colisão `EEXIST` e falha de escrita. | Vínculo sobrevive à promoção e leitura no destino; sentinel alheio preservado; falha limpa somente staging próprio; prova escrita antes de remover a origem. Não ampliar C6/R1 ou reabrir F11 sem achado novo. | Harbor. |
| F3-3 — data manual e estados | Executar `admin-calendario-cronograma-tela.cjs`, `admin-calendario-cronograma-integracao.cjs` e `admin-calendario-helper-ajustes.cjs`; completar no browser integrado. | POST só confirma recibo coerente de id, versão, data, hora, canal e `planejadoEm`; ação repetida, cancelada, obsoleta ou tardia não vira falso sucesso; estado, motivo e próximo passo são claros. Dia D nulo não inventa data. | Forge (tela e helper); Harbor (integração backend). |
| F4-1 — timeline e dados públicos | Executar `admin-marketing-trilha.cjs`, `admin-peca-historico-tela.cjs`, `admin-ajustes-dto.cjs` e `admin-ajustes-catalogo-dto.cjs`; revisar DOM/DTO no browser. | Eventos cronológicos com datas efetivas preservadas e custo em reais quando disponível; não expor `textoOriginal`, `lease.id` nem evidência privada. Identificadores técnicos necessários ao contrato não devem vazar para o texto visível. | Harbor (DTO/eventos); Forge (renderização). |
| F4-2 — classificação, contador e alertas | Executar `admin-demandas-contador.cjs` e `admin-ajustes-vigia.cjs` com relógio/timers controlados; validar sem navegar no browser. | Contador coincide com “Precisa de você”; atualização sequencial sem sobreposição; falha visível, sem zero fictício; alerta só após idade >10 min com vigia inativo; lease até 5 min; heartbeat válido por 20 s; polling cessa em bloqueio/logout e na Aprovação. | Forge (contador/UI); Harbor (DTO/vigia). |
| F4-3 — remarcação e trilha | Executar `admin-cronograma.cjs` no snapshot final e reler datas de fixture antes/depois de GET, remarcação, vínculo e promoção. | Recibos de 20/10 e 21/10 preservados e ordenados; GET não grava; legado gera evento somente se data e `planejadoEm` existiam; versão recusada não altera bytes. | Harbor. |
| F3/F4-4 — visual e teclado | No browser do snapshot integrado, observar 320/390/768/1440 px, tema escuro, Light/Regular, diálogos, foco e teclado; executar `npm run test:admin-estilo-final`. | Sem overflow horizontal, corte que impeça decisão, foco perdido, diálogo fora da viewport ou contador ilegível. Repetir se qualquer byte visual mudar após integração; mudança estrutural/posição vai em commit próprio. | Prism (CSS/visual); Forge (markup/JS). |
| Gate global | Congelar os bytes integrados; Sentinel executa `npm run test:ci` e depois `npx tsc --noEmit`, sequencialmente, com logs, exits e manifesto SHA-256 antes/depois; Sentinel completa HTTP/CSRF/auth e browser/E2E com fixture; Watchtower revisa o mesmo snapshot; Compass correlaciona cada critério ao recibo. | `test:ci=0`, TSC `=0`, manifesto estável, nenhum P0/P1/P2 impeditivo e cada recibo pertence aos bytes congelados. Qualquer alteração posterior invalida o gate afetado e exige nova execução/correlação. | Codex integra e coordena; Sentinel QA; Watchtower revisão READONLY; Compass aceite/matriz. |

## Ownership operacional

- Codex: único dono da integração autorizada com `origin/main`, preservação dos 21 commits locais e WIP; antes de qualquer commit segue `AGENTS.md` e compara com `origin/main`. Freeze e gates finais também ficam com Codex.
- Forge: UI F3/F4, polling/contador e `__tests__/admin-calendario-helper-ajustes.cjs` como único escritor a partir da matriz Compass de 13/10. Essa atribuição é prospectiva; os recibos anteriores foram produzidos enquanto Harbor ainda era o dono documentado.
- Harbor: backend/rotas/DTOs/fila/vigia e focais backend.
- Prism: CSS e validação visual; mudança estrutural em commit próprio.
- Beacon: leitura editorial, sem alterar o índice, fila ou calendário real.
- Sentinel: CI/TSC e QA HTTP/browser em cópia externa depois do freeze.
- Watchtower: revisão READONLY do mesmo snapshot final.
- Compass: fechamento da matriz e aceite de produto com recibos correlacionados.
- Ledger: documentação, contexto, sessão e espelhos; sem código ou Git.

## Pré-condições ainda abertas

- [x] Prism relata que Codex criou o merge local `915d82d9725ba7036c589bc8c2d42bc503cceecd` (“merge: integra atualizações remotas preservando o painel admin”). Os números 8/21 são do inventário inicial; Ledger não conferiu a contagem final nem o estado de push.
- [x] Sentinel criou cópia externa em `sentinel/snapshot-b596d1a` para o HEAD `915d82d9725ba7036c589bc8c2d42bc503cceecd`; 1.409 caminhos/198.070.060 bytes. Os manifests before/after têm mapas caminho→SHA idênticos (1.409 entradas), embora os arquivos JSON tenham hashes brutos diferentes. Essa igualdade comprova a cópia, não a execução dos gates.
- [x] W-C1 e W-C2 têm evidência focal atual no relatório Watchtower/Harbor.
- [ ] Fechar F3-1 no browser integrado.
- [ ] Fechar os focais e o browser de F3-3/F4-1/F4-2/F4-3 no mesmo snapshot integrado.
- [ ] Fechar F3/F4-4 com observação visual no browser integrado; relatório Prism não contém screenshots desta rodada.
- [ ] Receber `test:ci` e TypeScript sequenciais, manifests e status sem delta.
- [ ] Receber QA HTTP/CSRF/auth/browser/E2E e revisão Watchtower final sem bloqueador.
- [ ] Compass cruzar critérios e recibos e declarar o aceite de produto.

Até estes recibos e cruzamentos chegarem, as fases e gates permanecem **abertos**. Nenhum teste, Git, produção, Meta ou build foi executado por Ledger.
## Adendo de estado — merge e snapshot de QA (13/10/2026)

O relatório Prism atualizado relata o merge local feito pelo Codex em `915d82d9725ba7036c589bc8c2d42bc503cceecd`, assunto “merge: integra atualizações remotas preservando o painel admin”. O mesmo HEAD consta em `sentinel/snapshot-summary.json`. O relatório Prism diz que a branch está 10 commits à frente de `origin/feature/admin-panel-continuation` no momento de sua leitura; não há recibo de push nesta documentação. O inventário inicial 8 remotos/21 locais não descreve mais a relação atual depois do merge. Ledger não fez fetch nem outra operação Git.

A cópia Sentinel `E:/Grana-temporarios/2026-10-13-admin-fases34/sentinel/snapshot-b596d1a` contém 1.409 arquivos / 198.070.060 bytes. `snapshot-manifest-before.json` SHA-256 `EE127A1EF8A6A691B39ABBE8F9FA95814AC02079B75E7EAC04FC1114E17EBA4E` e `snapshot-manifest-after-copy.json` SHA-256 `56895B482C4E442969F3CB0E0AA50B4887D4D8344EC842D3AB4C1D3DF81041F3` são arquivos diferentes, mas a comparação por caminho e SHA mostra 1.409 entradas em ambos e zero caminho/hash divergente. A primeira tentativa de parser de Ledger assumiu array e falhou com índice nulo; corrigida ao ler o formato objeto. A cópia se mantém correlacionável; ainda não há recibo de teste/QA.

Forge relata commits WIP pelo Codex: `81504d8` (confirma data/ação obsoleta, tela e helper) e `b596d1a` (polling do contador), além de cinco focais com exit 0; Harbor relata `c852b090f8d63e8ac46ba582b7fca765e52f1221` (preserva recibos de remarcação), oito focais com exit 0 e quatro arquivos próprios sem delta durante a execução. Os focais ocorreram antes do merge/snapshot final, logo não satisfazem o gate de bytes do HEAD `915d82d`.

O complemento Harbor `criterios-ownership-harbor-13-10.md` preserva o relato direto do autor sobre publicações teste e separa ensaio local de capacidade real, além de designar Harbor/Beacon para descoberta READONLY do fluxo existente. A matriz principal Compass ainda traz a frase stale “Meta real permanece desligada”; o Codex recebeu pedido para consolidar o complemento. Isso não autoriza publicar nem alterar integração.

Prism registra dois pontos de QA visual ainda abertos: em uma captura anterior (12/10), o título do detalhe aparece parcialmente sob o cabeçalho sticky em 390 px; e está sem decisão se o pedido “sem ids internos” cobre também os textos F3 de origem (`manifestoId#itemId@versão`). Não esconder por CSS; Compass/Codex devem delimitar o requisito e Forge deve corrigir só se aceito, com mudança de posição/layout em commit próprio. Ainda sem `test:ci`, TSC, HTTP/browser/E2E ou revisão Watchtower sobre o snapshot `915d82d`.
## Adendo de estado — 14/10/2026, 00h (Quill, time Claude; revisão do Ledger)

**Mudança de dono, por decisão do autor de 13/10 ~23h50.** O time Claude, na conta PH, coda
até o fim, e o time Codex só revisa, sem editar arquivo do repositório. A tabela "Ownership
operacional" acima descreve a rodada anterior. Para o fechamento valem:

| Linha | Dono (Claude) | Revisor (Codex) |
| --- | --- | --- |
| Backend, duplicatas e aceite composto | Keel | Harbor e Watchtower |
| Tela | Lumen | Forge e Prism |
| QA e gate | Vigil | Sentinel |
| Documentação | Quill | Ledger |
| Aceite de produto | resultado de todos | Compass |

As regras completas estão em
`E:/Grana-temporarios/2026-10-13-marketing-ph/02-RODADA-14-10-CLAUDE-CODA-CODEX-REVISA.md`.
Cada linha só fecha com "DE ACORDO" do revisor.

**Gate global, nos bytes de `5957a75` (HEAD local, sem push).** O exit 1 anterior vinha da
cópia do Sentinel, e não do código: ela excluía o `google-services.json` versionado e não
tinha `.git`, e o `test:ci` parava antes das suítes seguintes. O Vigil refez o gate num clone
que imita o checkout da CI: `git clone --no-checkout`, `checkout --detach`,
`git remote remove origin`, `npm ci`, sem `.env`. No `5957a75`:

- `npm ci` exit 0;
- `npm run test:ci` exit 0 (9302 linhas, 0 FALHOU);
- `npx tsc --noEmit` exit 0.

O manifesto SHA-256 dos 2250 arquivos rastreados não mudou em nenhuma etapa, e o status ficou
vazio. Os recibos estão em `E:/Grana-temporarios/2026-10-13-marketing-ph/vigil/gate-5957a75/`.
O mesmo resultado vale para `03f981d` e `45bbfb0`. Continuam fora os jobs `deno check` e
"segredos" da CI.

**Isto NÃO fecha o gate global da tabela.** Faltam três coisas:
- o freeze final, depois das entregas do Keel e do Lumen;
- HTTP/CSRF/auth e browser/E2E com fixture `AUDIT-F3F4`;
- a revisão do Sentinel e do Watchtower sobre esses bytes.

Qualquer commit novo exige repetir o gate.

**F3/F4-4 (visual e teclado), parcial.** O Vigil mediu no painel real, em 320, 390, 768 e
1440 px, com e sem reduced-motion, as telas novas da frente de marketing (commits `c5b46e3` a
`5957a75`):
- sem rolagem horizontal;
- os diálogos fecham com Esc e o foco volta ao card (12 de 12 rodadas);
- os `<details>` abrem com Enter e têm contorno de foco;
- o título não fica escondido sob o cabeçalho sticky em 390 px na navegação normal.

T1 e C1 só foram conferidos lendo o código. Os detalhes estão em `relatorio-vigil.md` e
`relatorio-vigil-lumen.md`, na mesma pasta. O F3/F4-4 continua aberto até a tela final do
Lumen ser medida.

**F3-1, F3-2, F3-3, F4-1, F4-2 e F4-3:** sem recibo novo nesta rodada. Os focais desses
critérios estão dentro do `test:admin`, que roda no `test:ci` verde acima, mas o
procedimento de browser de cada um continua pendente.

## Estado em 14/10/2026, ~10h (adendo do Quill, achado 3 do Ledger)

A seção acima, com o gate no `5957a75`, fica como histórico. Este adendo a supera para a
rodada atual. Cada evidência leva o tipo dela, porque um verde de um tipo não vale por outro.

| Evidência | Hash | Tipo | Fonte |
|---|---|---|---|
| K1: `aprovar` recusa com 409 `ajuste-aberto` qualquer pedido aberto da peça, lendo a fila privada; fila ilegível dá 503 | `e788118` | focal do dono (`test:admin` e `tsc` exit 0 no snapshot limpo `keel-snapshot-3`, manifesto `keel-manifesto-e788118.sha256`) | `relatorio-keel.md`, `keel3-*.exit` |
| K1 reproduzido com cópia da fila real: 409 `ajuste-aberto`; C7c (capa fora do Feed) e contador (9) conferidos | `e788118` | medição independente do Vigil, volta 3 | `vigil-para-keel-freeze.md` |
| Aprovação e Acervo consomem o contrato de famílias (vigente/superada, filtro "Substituídas") | `9127873` | focal do dono (`admin-aprovacao-contrato-familias.cjs`) | `recibos-lumen/contrato-*` |
| F4-1: sem id, hash nem chave de recibo no texto das telas de marketing | `0a5bb5f` | focal do dono | `recibos-lumen/f41-*` |
| Galeria local: Esc, foco, Host estranho e quebra de linha em 320/390 (G1 a G4 do Vigil) | `fb5aa93`, `5f579d7`, `e74fc5c` | correção do dono; G1 a G4 achados pelo Vigil, reconferência dele nos bytes finais pendente | `vigil-para-lumen-galeria.md` |
| Acabamento visual: escala de ritmo em tokens e telas no ritmo da escala | `5631c68`, `02bee55`, `fa1aa93` | medição própria do Lumen (390 e 1440) e `test:admin`/`tsc` exit 0 no `fa1aa93` | `lumen-freeze/` |

Todos os arquivos citados ficam em `E:/Grana-temporarios/2026-10-13-marketing-ph/`.

**O verde do `e788118` e do `fa1aa93` é focal do dono e não fecha o gate global.** Nenhum
dos dois é o `test:ci` com `tsc` num clone limpo do HEAD final.

**Linha 1, estado em 14/10 ~11h (achado 5 do Ledger).** Cada item vale só no hash e no
escopo indicados. Nada aqui fecha a linha 1, F3/F4 ou o gate integrado, nem aceita o HEAD
posterior a esses hashes:

| Item | Hash | Estado | Fonte |
|---|---|---|---|
| W-C1: validador único `aceiteValido`, derivação composta só nas duas autorizadas, com a cadeia conferida | `5858987` | DE ACORDO do Watchtower, conferido em `3c9a940` | `revisao-watchtower-aceite-seguranca.md`, retomada de 14/10 10h07 |
| W-C2: capa vinculada (`capaDe`) recusada como item autônomo em planejar, cronograma e promover | `3c9a940` | DE ACORDO do Watchtower **só para ações novas** | idem |
| W-C2b: plano de capa gravado antes da correção continua ativo no calendário (`calendario.cjs:101-109`, `cronograma.cjs:246-249`) | `3c9a940` | **aberto**, P2, primeira volta | idem, achado 6 |
| H-01 e H-03 (Harbor) | `4c59d4e` | prova favorável do Harbor no commit, sem DE ACORDO | `revisao-harbor-backend-familias.md`, "Reconferência do commit corretivo 4c59d4e" |
| H-02b (Harbor) | `4c59d4e` | **aberto**: o destino foi corrigido, mas a origem preservada (`catalogo.cjs:262-264` e `:755`) continua aprovável | idem |

**Continua pendente:**
- W-C2b e o resíduo de H-02b, com o Keel, e depois o DE ACORDO do Watchtower e do Harbor
  sobre o freeze corretivo;
- o freeze da tela entregue ao Prism, e a revisão dele;
- a medição "depois" do Vigil sobre o acabamento visual, em 320/390/768/1440;
- HTTP/CSRF/auth e browser/E2E com fixture `AUDIT-F3F4` nos bytes finais;
- o handoff final do Vigil ao Sentinel;
- o gate integrado (`test:ci` e `tsc` em clone limpo, com manifesto) no HEAD final;
- o "DE ACORDO" de cada revisor nas linhas 1 a 6.

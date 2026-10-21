# Plano de execução — marketing e Meta no painel local

**Estado em 16/10/2026, 12h24 BRT:** em andamento; nenhum aceite global. Este registro organiza a rodada e suas dependências. Evidência local, design aprovado, deploy, ativação e aceite são estados diferentes.

**Armazenamento:** o pedido explícito do autor nesta rodada inclui um plano durável no repositório. Ele prevalece, para este artefato, sobre a decisão registrada em 15/10 de manter o plano anterior só na nota de sessão. Este arquivo não contém segredos.

## Escopo decidido pelo autor

Toda gestão de marketing fica exclusivamente em `tools/admin-local`: telas em `web/telas/`, estilo em `web/estilo.css`, rotas em `rotas.cjs` e integração por adaptadores Node locais. O painel continua local, em `127.0.0.1`, protegido por senha e TOTP, sem publicação.

As telas já feitas no `/admin` web (sino, feedbacks, correções de criativos e tipografia) ficam estacionadas, sem apagar. Contratos e lógica pura existentes podem ser reutilizados. Landing, contrato analítico e exportação CSV permanecem independentes da superfície. O servidor local deve chamar Supabase/Edge Functions; o navegador não chama esses serviços diretamente.

Nenhuma ação real na Meta, ativação de Pixel, e-mail real, gasto de mídia ou build EAS está autorizada por inferência deste plano. A migration `feedback_gestao` e a Edge `admin-feedbacks` são a exceção já aplicada/publicada com aprovação do autor, documentada em `E:/Grana-temporarios/2026-10-15-tarde/aplicar-16-10/log.md`. Nenhuma outra migration/função da rodada deve ser aplicada/publicada sem sua autorização e os gates correspondentes. Pré-requisitos restantes estão em `E:/Grana-temporarios/2026-10-15-tarde/PENDENCIAS-DO-AUTOR-META.md`.

## Entregas M7 e estado verificável

| M7 | Evidência disponível | Estado e próximo gate |
|---|---|---|
| 1. Viabilidade, custos, contas e permissões | Plano Compass e itens pendentes do autor | Planejamento; contas, custos e permissões ainda não foram confirmados como pré-condições de operação real. |
| 2. Fundação administrativa remota | Harbor `da4a653`; notificações, leitura, resolução e link assinado de mídia | Código local; migration não aplicada. Não houve prova de corrida Postgres real, restauração de backup, expiração de link ou operação com a máquina M1 desligada. |
| 3. Feedbacks e conclusão de criativos | `c3be3f2`, `1d9c344`, `74806c6`, `28d15cf`, `1d4f2b9`, `b89d574`; correção E3-R1 `821975c`; contrato visual `89aa67b`; revisões Anvil, Lumen e Watchtower | Watchtower deu **DE ACORDO somente ao delta `821975c`**: SQL 39/39, função 112/112, tela 65/65 e reprodução local. Depois da revisão, o autor aprovou a aplicação: migration `20261016020000_feedback_gestao.sql` aplicada e `admin-feedbacks` v1 publicada com `verify_jwt=true`; o log registra RLS ativa, `anon` sem SELECT e sem autenticação = 401. M7 3.1–3.4 segue parcial/incompleto. O porte local e o ajuste do contrato visual continuam em WIP; commits de UI web estacionados. Criativos não incluem aceite de catálogo nem migração de mídia. Aplicar novamente o arquivo `CREATE TABLE IF NOT EXISTS` não atualiza uma constraint antiga: divergência futura exige migration explícita de alteração.
| 4. Conexão Meta e leitura de métricas | Harbor `7233d19` (consulta somente leitura); contrato visual `1a1661d` | Ainda sem consumidor final no painel local, token de leitura, conta real ou validação de valores Meta. Não há escrita Graph, Pixel, CAPI nem persistência própria. Dúvidas de cobertura, paginação, moeda e fuso permanecem. |
| 5. Agendamento, publicação, pausa e reconciliação | Harbor `fec85f9` e `0ff0803`; package tests em `a528585`; relatório `contratos-Harbor-META-5-simulacao.md` | 111 checagens do motor/RPCs SQL, 36 do worker/store/SQL e `deno check` dos quatro endpoints passaram segundo o relatório. Os dois testes E5 foram adicionados a `test:admin`. Migrations não aplicadas, funções não publicadas e nenhum cron instalado. Consumidor Node/local e sincronização confiável do catálogo ainda não foram validados; teste de duas sessões de produção e execução real com M1 desligada também não. Nenhuma publicação, pausa ou recuperação real ocorreu. |
| 6. Medição própria e consentimento | Forge `533b1dc`, `8f6e52c`, `b88efb6`, correção de teste `e0d0266`; 75 testes do módulo, 22 de feedback-consentimento, 41 da landing e QA real em quatro larguras | QA local da landing passou, incluindo foco, preferências e zero chamadas à Meta com configuração desligada; teste do módulo entrou no `test:ci`. A falha 14/15 foi identificada como teste estrutural antigo após o repasse com consentimento migrar para o módulo real, e corrigida exercitando os módulos reais; focais verdes. O Pixel não foi ativado. ID, política de retenção de 180 dias e validação da documentação/SDK Meta seguem pendentes. Checkout, recebimento na Meta, atribuição, Purchase e CAPI não foram comprovados. O gate integral do HEAD ainda não foi emitido. |
| 7. Recomendações, experimentos e relatórios | Beacon `bd3c163`; exportador CSV de Argon em `lib/admin-relatorio-csv.ts` e teste correspondente | O relatório Argon registra teste e `tsc` exit 0; módulo usa allowlist do contrato, preserva `null` distinto de zero e protege CSV contra injeção. Sem commit, sem chamada no `package.json` e sem botão de download/UI local; Codex pediu ao Forge que incorpore os dois arquivos ao `test:ci`. Harbor iniciou snapshot/read-only e agregação semanal própria (`e7.v1`), sem reusar total de 30 dias; Lumen ainda cuida da UI/PDF local. Receita de Cakto segue inconclusiva até reconciliar semântica e integridade do ledger. |
| 8. Ativação progressiva e operação | Plano Compass para M7 5/7/8; sino/central local `2ff8e91`; pendências do autor | O sino local foi implementado com dublê explicitamente marcado. Faltam recibo/revisão final dos fluxos no painel local e o restante da operação. Sem ativação real. Antes do real: aprovar cada peça/versão/destino/conta/janela, testar e-mail crítico com destinatários fictícios, validar acessibilidade e definir rollback/limites operacionais. |

## Bloqueios que impedem aceite

- **E3:** `821975c` teve revisão independente de acordo e a migration/função foram aplicadas/publicadas com aprovação registrada. Ainda faltam concluir/revisar os fluxos no painel local, auditoria de admin/TOTP real, histórico visível, notificação deduplicada e QA de acessibilidade/foco; isso não fecha M7 3.1–3.4.
- **Gate compartilhado:** o primeiro `test:ci` parou em `feedback-consentimento.cjs:119` (14/15); `e0d0266` substituiu a asserção estrutural por exercício das funções reais com/sem consentimento (22/22). Esse erro específico foi resolvido. Ainda falta o gate integral final sobre o topo congelado.
- **B2 e métricas de receita:** a revisão Watchtower encontrou `event_id` contendo o identificador do pedido após a anonimização alegada. Retenção fiscal e semântica de reembolso ainda dependem de decisão; totais e atribuição não devem ser tratados como completos.
- **E4/E5:** não há credencial de leitura confirmada nem evidência de conta real; os endpoints e a migration seguem sem deploy/aplicação. E5 continua em dry-run até passar pelo servidor local e pelo gate.
- **E6:** Pixel desligado. ID e autorização, prazo/copy do consentimento, consulta da documentação oficial Meta e comportamento de checkout ainda não foram validados. A QA local não prova integração real.
- **E7/E8:** CSV e consumidor local pendentes; amostras e qualidade precisam ser observáveis. A operação exige autorização por peça e destino, teste seguro de e-mail e plano de rollback.
- **Autoria e preservação:** `docs/marketing/painel/historico.json` e `docs/marketing/solicitacoes-correcao/` continuam fora do lote até confirmação de autoria. Não apagar nem incluir antes dessa confirmação.

## Encerramento da rodada

1. Cada dono entrega seu relatório final, com commits, escopo local, comandos/saídas e limites não verificados.
2. Anvil fecha o bloqueio E3 no servidor e o porte local; Harbor entrega E5 no servidor local; Lumen/Prism concluem sino e especificações locais; Argon entrega CSV; Forge integra a chamada do teste E6 ao `test:ci` e executa o gate de sua alçada.
3. Watchtower revisa os deltas que corrigem bloqueios. Compass mantém as lacunas de M7 5/7/8 explícitas.
4. Ledger atualiza `context.md`, nota de sessão, vault e fichário somente com os recibos finais. O estado geral permanece “não aceito” enquanto qualquer bloqueio acima existir.
5. Forge coordena o gate e o push do lote. Nenhum deploy, migration em produção, ativação de Pixel, envio de e-mail ou gasto é inferido de teste local ou commit.

## Fontes consultadas nesta fotografia

- Ordem ativa e decisão de superfície do autor: `E:/Grana-temporarios/2026-10-15-tarde/00-ORDEM-META-PAINEL-16-10.md` (SHA-256 `4A4185893CE3B5A05EAA8102AC28A264A8DB0E45A429D056E54A8F289D54E2C3`).
- Critérios M7 e plano Compass: `E:/Grana-temporarios/2026-10-15-tarde/M7-criterios-aceite-compass.md` e `E:/Grana-temporarios/2026-10-15-tarde/plano-proxima-rodada-compass.md`.
- E3: `relatorio-Anvil-E3-feedbacks.md`, `relatorio-Anvil-E3-criativos.md`, `revisao-Lumen-E3-E6.md` e `revisao-Watchtower-E3.md` na pasta da ordem. A revisão final `821975c` tem SHA-256 `7573927381A951AA652EF4952BF45C4CD7207CCD549ABE748695D68F3E79D7A9`.
- E2/E4: `contratos-Harbor-META-2-4.md`. E5: `contratos-Harbor-META-5-simulacao.md` (SHA-256 `C052B7B2C28C5F50EAF3B6B0C675D5C334A9503F400E63B8FA66D0353A58747F`).
- Aplicação E3 aprovada: `E:/Grana-temporarios/2026-10-15-tarde/aplicar-16-10/log.md`.
- B2 e receita/atribuição: `revisao-Watchtower-delta-B2.md` e `relatorio-Beacon-metricas-meta.md`.
- E6: `relatorio-Forge-E6.md` (SHA-256 `301FB240FE64A08057E841C92DCBF36AD594141FF92C5A1448B3005E5305F013`).
- E7: contrato versionado em `docs/marketing/2026-10/semana-42-2026-10-12-a-2026-10-18/apoio/relatorios/relatorio-Beacon-E7-contrato-analitico.md`; `relatorio-Argon-E7-csv.md` (SHA-256 `08940B997353001B8E9C209ACF6F7B3910B0C43B26A2E46FC553471EE6179D4A`).

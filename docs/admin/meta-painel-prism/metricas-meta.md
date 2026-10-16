# Contrato visual: resultados de marketing e Meta

**Entrega:** E4, leitura administrativa no `/admin` web.

**Estado do contrato:** proposta visual alinhada ao dicionário do Beacon; fórmulas de novas assinaturas e receita seguem bloqueadas para leitura real enquanto a origem Cakto não comprovar completude. A semântica de estorno de assinatura ainda depende do autor.

**Protótipo:** [metricas-meta.html](./metricas-meta.html). Todas as capturas usam fixtures fictícias.

**Entradas:** [relatório de métricas do Beacon](../../marketing/2026-10/semana-42-2026-10-12-a-2026-10-18/apoio/relatorios/relatorio-Beacon-metricas-meta.md), contrato de agregação E4, decisões da ordem META-PAINEL-16-10 e tokens de `components/admin/admin-visual.css`.

## Propósito e limites

A tela responde quanto foi gasto em anúncios, quantas primeiras assinaturas pagas foram confirmadas, qual receita bruta foi confirmada e quais reversões ocorreram. Cada medida carrega fonte, intervalo, unidade, atualização e cobertura.

Esta superfície é de leitura. Não cria campanhas, muda orçamento, publica ou chama operações de escrita na Meta. A conta começa como **Não configurado**; exemplos locais não consultam Meta nem Cakto. Campanhas e receitas não são associadas por coincidência de totais, e nenhum dado individual de compra chega ao navegador.

## Ordem da página

1. Shell atual do `/admin`, título **Resultados de marketing** e aviso persistente de demonstração quando os dados forem fixtures.
2. Período, comparação, fuso e intervalos exatos.
3. Estado da conexão Meta, separado de cobertura Cakto e atribuição.
4. Indicadores de investimento em anúncios, novas assinaturas pagas, receita bruta confirmada e reembolsos/chargebacks. Ações pendentes ficam no painel de confiabilidade, não substituem uma medida financeira.
5. Uma série por vez, período atual e comparação com traços e rótulos distintos, resumo textual e tabela de valores.
6. Confiabilidade por fonte: estado, cobertura, atualização, páginas, duplicados/rejeitados e origens desconhecidas.

Seguir o shell existente: fundo `#052229`, superfície `#0b2d35`, texto `#effffa`, apoio `#a6d9ce`, acento `#aeffe3`, largura máxima 1120 px e Neue Machina. Manter o contraste e a hierarquia do `/admin`; sem glassmorphism.

## Períodos

- Fuso de apresentação proposto: `America/Sao_Paulo`. Conferir o fuso real da conta Meta antes de combinar números. Se divergir, mostrar o fuso da conta e não apresentar as janelas como equivalentes.
- Padrão: 30 dias de calendário completos imediatamente anteriores a hoje versus os 30 dias completos anteriores a eles. Limites de consulta usam início inclusivo e fim exclusivo, convertidos da meia-noite local.
- Exemplo em 16/10/2026: atual `[16/09/2026 00:00, 16/10/2026 00:00)`; anterior `[17/08/2026 00:00, 16/09/2026 00:00)`, hora de Brasília. A interface pode mostrar os rótulos civis inclusivos “16 set. a 15 out.” e “17 ago. a 15 set.” junto aos limites do contrato.
- Hoje pode ser uma série parcial separada; não entra no comparativo padrão. Exibir rótulo parcial, intervalo e fuso.
- Sem base anterior válida, variação percentual é indisponível; delta absoluto pode dizer “sem base de comparação”. Nunca exibir infinito, zero ou percentual inventado.

## Dicionário visual e regras de valor

| Rótulo | Definição para a interface | Fonte e apresentação |
|---|---|---|
| Investimento em anúncios | Soma do gasto efetivamente reportado, não orçamento, limite ou estimativa. | Meta Ads Insights, moeda da conta. Somar contas somente com mesmo fuso e moeda. Sem conta/permissão, paginação completa ou conciliação de moeda/fuso: `null`. Zero só com consulta completa que confirme gasto zero. |
| Novas assinaturas pagas | Contagem distinta de `subscription_id` cuja primeira cobrança foi `approved` no intervalo. Renovações, cancelamentos, atrasos, recusas e eventos duplicados não contam. É contagem de assinaturas, não de pessoas. | Ledger `cobranca_eventos`; candidato `provider='cakto'`, `event_type='approved'`, `primeira_compra=true`, assinatura identificada e `event_at` dentro do intervalo. Sem ingestão completa ou classificação/campos suficientes: `null`; exibir a quantidade que não pôde ser classificada. |
| Receita bruta confirmada | Soma de `valor` em primeiras cobranças aprovadas e renovações pagas (`renewed`), pela data efetiva do evento. Não subtrai taxa, desconto de outro período, reembolso ou chargeback. Não é lucro nem repasse líquido. | `cobranca_eventos`, mantendo a moeda. Não somar moedas nem converter sem regra aprovada. Sem ingestão, valor/moeda, paginação ou conciliação completos: `null`. |
| Reembolsos e chargebacks | Contagem e valor reportado das reversões `refunded` e `chargeback` pela data em que ocorreram. Não apaga a cobrança original; cancelamento não é reembolso. | `cobranca_eventos`, reversão vinculada à ordem correspondente. Sem valor, vínculo ou cobertura suficiente: `null`. Não estimar a partir do estado atual da assinatura. |
| Cobertura de atribuição | Entre primeiras cobranças elegíveis com cobertura Cakto completa, mostrar contagem e proporção atribuída a uma campanha Meta identificável, sanitizada e compatível com prova de consentimento no momento da atribuição; mostrar também contagem/proporção de origem desconhecida. | Ledger Cakto e prova de consentimento aprovados. Sem denominador comprovável ou consentimento: `null`. UTM ausente, inválido ou sem correspondência é “Origem desconhecida”, nunca “Orgânica”. Não usar e-mail, ID de usuário/pedido nem identificadores de navegador para unir fontes. |

O tratamento de uma assinatura reembolsada permanece **proposta pendente**: contá-la no intervalo da primeira cobrança e mostrar a reversão no intervalo em que ocorreu. Não apresentar métrica líquida de novas assinaturas até decisão do autor. O CPA também não tem fórmula neste contrato; não o calcular por inferência.

## Cobertura, estados e recibos

Estados de fonte: **Não configurado**, **Completo**, **Parcial** e **Indisponível**. Cada estado tem texto além da cor, intervalo coberto, última atualização, páginas processadas e motivo sanitizado. Atraso e erro atual permanecem separados de uma leitura antiga em cache.

- `null` quer dizer que a medida não é confiável ou não está disponível; nunca convertê-lo em zero em API, tela, comparação ou exportação.
- `0` só é resultado observado com consulta/ingestão e cobertura completas. Resposta vazia sem prova de completude não significa zero.
- Uma soma parcial não aparece como total. Se amostra parcial for útil, fica identificada como amostra, e o total segue `null`.
- O ledger Cakto é best effort e não comprova completude por período; até existir reconciliação ou recibo de completude, contagens, receita e cobertura ficam `null` ou `Parcial`, nunca zero.
- `utm_*` sem referência compatível à escolha de consentimento não habilita atribuição publicitária; manter origem desconhecida.
- Erro sem cache mostra recibo, referência segura e “Tentar novamente”, sem virar lista vazia. Cache antigo mostra data original e erro atual em campos diferentes.
- Exibir duplicados ignorados pela chave `(provider, event_id)`, recusados, pagamentos sem assinatura/data/valor e origens desconhecidas sem revelar payload ou identificador individual.

## Gráfico e interação

O gráfico apresenta uma métrica por vez. Linha atual sólida e comparação tracejada, com legenda textual, intervalos visíveis e tabela equivalente. O resumo informa o delta sem insinuar causalidade. Se a série tiver valor nulo ou período parcial, representar lacuna como lacuna; não desenhar ponto zero.

Filtros de período e comparação atualizam a leitura somente por caminho de leitura. A seleção de hoje sempre adiciona “parcial”. A tela não tem controles de campanha, orçamento ou publicação.

## Responsividade e acessibilidade

- 1440 px: conteúdo central até 1120 px; indicadores em grade e série/cobertura em colunas.
- 768 px: indicadores em duas colunas; cobertura empilhada.
- 390 e 320 px: uma coluna, margens de 16 px, sem rolagem horizontal da página; apenas a tabela detalhada pode rolar dentro de sua própria região nomeada.
- Alvos mínimos 44 × 44 px, rótulos persistentes, foco visível, teclado em ordem previsível e estado assíncrono anunciado uma vez sem mover foco.
- O gráfico tem descrição e tabela; cor sozinha não distingue séries. Respeitar `prefers-reduced-motion`; informações não dependem de hover.

## Handoff

- **Harbor:** cada medida precisa de DTO com intervalo, fuso, unidade, origem, valor nullable, estado/cobertura, paginação, atualização e contagens de classificação/duplicidade. Não retornar registros individuais, PII, segredos ou payloads. Fixtures devem cobrir zero completo, `null`, parcial, duplicata, renovação, reversão e atribuição desconhecida.
- **Lumen:** não mostrar totais Cakto como reais até existir prova de completude. Manter separado gasto Meta, primeira assinatura, receita bruta e reversões; exibir limitações e manter “Não configurado” funcional.
- **Beacon:** manter marcados como pendentes a semântica de estorno e qualquer mudança de fórmula. A taxonomia de Pixel/CAPI do M4 é outra entrega e não define estes números.

## Limites e QA restante

Este artefato é um protótipo estático com fixtures; não consulta provedores, valida dados de produção ou aplica fórmulas ao ledger. O relatório Beacon é uma proposta e aponta a ausência de prova de completude de Cakto, `primeira_compra` ainda não conferido em webhook real, atribuição sem prova vinculada de consentimento e semântica de estorno aguardando o autor. Não marcar esses itens como resolvidos por causa da prancha.

- [ ] Confirmar que as janelas no navegador e no backend usam os limites do contrato, com o fuso real da conta Meta.
- [ ] Verificar que uma fonte ausente, ingestão incompleta ou variação sem base permanece `null` em tela e exportação.
- [ ] Conferir zero somente com cobertura integral comprovada.
- [ ] Validar as fixtures do módulo real/dublê para duplicata, primeira cobrança, renovação, reembolso, chargeback e campos ausentes.
- [ ] Aguardar decisão do autor sobre semântica de estorno antes de retirar o estado bloqueado de E4/M7 4.3.
- [ ] Conferir leitura de tela, teclado e 320/390/768/1440 na UI final de Lumen.

Nenhuma chamada de rede, teste, migration, deploy ou acesso a dado real foi feito para esta prancha.

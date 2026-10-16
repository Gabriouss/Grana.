# Beacon: contrato das métricas Meta e Cakto

- **Data:** 16/10/2026
- **Responsável:** Beacon (Marketing/Growth)
- **Estado:** proposta de definição para implementar com dados de teste. O contrato ainda depende da aprovação do autor para semântica de estorno; nenhum dado de produção foi consultado.
- **Destinatário:** Harbor, Entrega 4.
- **Fontes de requisitos:** plano Compass, Entrega 4; critérios M7 4.1 a 4.6; M4 Beacon (`relatorio-Beacon-M4.md`); limites de `viabilidade-anvil-custos.md`.

## Períodos e comparação

- Fuso de apresentação: `America/Sao_Paulo`, correspondente ao fuso de Brasília previsto para a conta de anúncios no checklist da Meta. Conferir o fuso real da conta antes de comparar. Se divergir, mostrar o fuso real e não combinar períodos como se fossem equivalentes.
- Padrão: os 30 dias de calendário completos imediatamente anteriores a hoje, comparados aos 30 dias completos anteriores a esse intervalo. Usar início inclusivo e fim exclusivo, convertidos de meia-noite local para timestamps com fuso.
- Exemplo para hoje, 16/10/2026: atual `[2026-09-16 00:00, 2026-10-16 00:00)` e anterior `[2026-08-17 00:00, 2026-09-16 00:00)`, hora de Brasília. Não há sobreposição.
- O dia de hoje pode aparecer em uma série separada como parcial, nunca dentro do comparativo padrão. A interface mostra os dois intervalos e o fuso.
- Uma variação percentual sem base anterior válida é `null`; não exibir infinito, zero ou uma porcentagem inventada. O delta absoluto pode aparecer com a indicação “sem base de comparação”.

## Dicionário proposto

| Métrica exibida | Definição e fórmula | Fonte e unidade | Ausência e cobertura |
|---|---|---|---|
| **Investimento em anúncios** | Soma do gasto efetivamente reportado pela Meta para todos os anúncios da conta incluídos no intervalo. Não é orçamento, limite, valor contratado nem gasto estimado. Consolidar por dia e campanha; somar contas somente se todas estiverem no mesmo fuso e moeda. | Meta Ads Insights, campo de gasto retornado pela API; moeda da conta, prevista como BRL. | `null` se conta/token/permissão não estiverem configurados, consulta ou paginação falhar, intervalo estiver incompleto, ou moeda/fuso não puder ser conciliado. `0` só quando a consulta completa da conta para todo o intervalo confirmar gasto zero. Mostrar conta, moeda, intervalo, última atualização e cobertura. |
| **Novas assinaturas pagas** | Contagem distinta de `subscription_id` com a primeira cobrança paga e confirmada pela Cakto dentro do intervalo. Na tabela local, a linha candidata é `provider='cakto'`, `event_type='approved'`, `primeira_compra=true`, `subscription_id` presente e `event_at` dentro do intervalo. Renovação, atraso, cancelamento, recusa e evento repetido não contam. É contagem de assinaturas, não de pessoas únicas. | `cobranca_eventos`; unidade: assinaturas. Deduplicar por `(provider, event_id)` e não contar linha sem identificador de assinatura como uma pessoa ou assinatura presumida. | `null` se a ingestão do período não estiver comprovadamente completa, faltar evento necessário para classificar primeira cobrança, ou faltarem `subscription_id`/data. Ausência de linhas sozinha não prova zero vendas. Exibir quantos primeiros pagamentos não puderam ser classificados. |
| **Receita confirmada** | Soma bruta do campo `valor` informado pela Cakto em cobranças confirmadas do período: primeira cobrança (`approved`) mais renovações pagas (`renewed`), pela data efetiva do evento `event_at`. Não subtrai taxas, descontos de outros períodos, reembolsos ou chargebacks nesta métrica. Não representa lucro nem repasse bancário líquido. | `cobranca_eventos.valor`, `moeda`; moeda prevista como BRL. Não somar moedas diferentes nem converter sem uma fonte e regra de câmbio aprovadas. | `null` se a ingestão estiver incompleta, houver cobrança confirmada sem valor/moeda utilizável, ou a paginação/conciliação falhar. `0` somente com cobertura completa comprovada e nenhum valor confirmado no período. Reembolsos e chargebacks aparecem em linha separada; um líquido só pode ser derivado depois de provar vínculo e valor do evento reversor. |
| **Reembolsos e chargebacks** | Mostrar contagem e valor reportado dos eventos `refunded` e `chargeback`, pela data em que cada reversão ocorreu. Não apagar a cobrança original e não subtrair o mesmo pedido duas vezes. Cancelamento de assinatura não é reembolso. | `cobranca_eventos`, evento de reversão ligado à ordem correspondente. | `null` se valor, ligação à ordem ou cobertura estiverem incompletos. Não estimar reembolso a partir do estado atual da assinatura. |
| **Cobertura de atribuição de campanha** | Entre as primeiras cobranças elegíveis e confirmadas, numerador = assinaturas com identificador de campanha permitido, sanitizado, mapeável a uma campanha Meta e com prova de consentimento compatível no momento da atribuição; denominador = todas as primeiras cobranças elegíveis com cobertura Cakto completa. Mostrar também “origem desconhecida” como contagem e proporção. | Ledger Cakto mais vínculo de campanha e prova de consentimento aprovados. Não usar e-mail, ID de usuário, ID de pedido ou identificadores de navegador para unir fontes. | `null` quando a cobertura do denominador não puder ser provada ou quando não houver prova de consentimento. Campo UTM ausente, inválido ou sem correspondência é “desconhecida”, nunca “orgânica”. |

### Proposta sobre reembolsos na contagem de novas assinaturas

Proponho contar a assinatura no período em que ocorreu sua primeira cobrança confirmada, mesmo se houver reembolso posterior, e mostrar a reversão no período em que aconteceu. Assim a métrica responde “quantas primeiras cobranças foram confirmadas”, e não “quantos clientes continuam ativos”. Um indicador líquido de novas assinaturas não está definido. Esta regra continua **pendente de aprovação do autor**, como exige o critério M7 4.3; enquanto isso, a tela deve rotular a métrica como proposta/bloqueada e não apresentar o resultado como contrato aprovado.

## Cobertura por fonte e regra de `null`

Cada fonte deve ter estado e recibo próprios: `Não configurado`, `Completo`, `Parcial` ou `Indisponível`, além do horário da última atualização, intervalo coberto, páginas consumidas e motivo sanitizado. Não somar fontes diferentes como se fossem intercambiáveis.

- **Meta:** cobertura completa exige conta validada em leitura, permissão suficiente, consulta bem-sucedida do intervalo integral e todas as páginas processadas. Resposta vazia só é zero quando a consulta completa daquela conta e intervalo estiver comprovada.
- **Cakto:** `cobranca_eventos` é um ledger que o webhook grava em modo best effort e que não tem recibo de completude por período. Uma falha de gravação pode não ser reenviada pela Cakto. Portanto, a tabela sozinha não prova que todos os eventos chegaram. Até haver reconciliação ou evidência de completude por período, totais, contagens e cobertura de atribuição ficam `null` ou `Parcial`, nunca zero.
- **Atribuição:** o esquema atual contém `utm_*`, mas não guarda uma referência à escolha de consentimento. Não usar UTMs desse ledger para atribuição publicitária enquanto não houver vínculo compatível e aprovado com a escolha vigente. A falta de vínculo fica como origem desconhecida.
- **`null` significa que o valor não é confiável ou não está disponível.** Zero é um resultado observado em uma fonte consultada por inteiro. Não substituir `null` por `0` em API, interface, exportação ou comparação.
- Uma soma parcial não deve ser apresentada como total. Se a interface optar por exibir uma amostra parcial, rotular como parcial e manter o total da métrica como `null`.

## Exemplo de fixture para Harbor

Valores fictícios e BRL, todos no mesmo intervalo:

1. `approved`, assinatura A, `event_id=e1`, R$ 100: conta uma nova assinatura e R$ 100 de receita confirmada.
2. Repetição de `e1`: ignorada pela chave idempotente; nenhum valor adicional.
3. `renewed`, assinatura A, `event_id=e2`, R$ 100: zero novas assinaturas e mais R$ 100 de receita confirmada.
4. `approved`, assinatura B, `event_id=e3`, R$ 90: uma nova assinatura e mais R$ 90 de receita confirmada.
5. `refunded` vinculado à ordem de A, `event_id=e4`, R$ 100: uma reversão separada de R$ 100. Não altera a contagem bruta de primeiras cobranças sob a proposta acima.
6. `canceled` sem cobrança confirmada: não aumenta receita, novas assinaturas nem valor de reversão.

Resultado candidato: **2 novas assinaturas pagas**, **R$ 290 de receita confirmada bruta** e **R$ 100 em reversões**. O líquido de R$ 190 só pode ser exibido depois de validar vínculo, valores e a semântica aprovada pelo autor. Acrescentar uma fixture com uma assinatura sem `subscription_id` e outra sem `valor`: a cobertura deve ficar parcial e os totais afetados `null`, não silenciosamente subcontados.

## Privacidade, armazenamento e limites atuais

- A leitura é administrativa e somente no servidor. Não expor eventos individuais nem credenciais ao navegador. O agregado não inclui nome, e-mail, telefone, CPF, saldo, compra individual, texto de feedback, URL completa ou IDs pessoais.
- Para a primeira versão, mostrar os totais das fontes Meta e Cakto lado a lado. Não enviar dados de compra da tabela à Meta e não inferir que uma campanha causou uma venda apenas porque os totais coincidem.
- O M5 propõe até 90 dias para eventos e recibos detalhados de marketing, e até 13 meses para agregados que sejam de fato anônimos. São propostas não aprovadas, não prazos legais. `cobranca_eventos` é um ledger de cobrança separado, descrito pela migration como imutável e sem dado pessoal; não aplicar a ele o prazo de marketing de 90 dias sem decisão própria sobre registros financeiros e fiscais.
- A migration `20261015233000_cobranca_eventos.sql` declara em comentário que ainda não foi aplicada. Esta tarefa não consultou produção. O próprio código do parser diz que a classificação `primeira_compra` vem de `purchase_approved` como hipótese documental e ainda não foi conferida em webhook real. Não tratar nenhum dos dois pontos como validado.
- A versão da Graph API, campos atuais, permissões, paginação real e payload Meta continuam para a implementação do Harbor. Esta definição não autoriza chamadas reais nem mudança paga.

## Critérios de aceite para o painel

- [ ] Períodos e fuso aparecem por fonte e coincidem com os limites inclusivo/exclusivo acima.
- [ ] A interface separa investimento Meta, assinaturas pagas Cakto, receita bruta confirmada e reversões.
- [ ] Duplicata, renovação, cancelamento, primeira compra, reembolso e chargeback passam pelas fixtures do ledger real/dublê.
- [ ] Fonte sem configuração, paginação incompleta, falha, dado ausente e atribuição sem consentimento resultam em `null`/`Parcial`, nunca em zero nem “orgânico”.
- [ ] Zero só aparece com consulta ou ingestão completa comprovada.
- [ ] Estado da fonte, última atualização e cobertura acompanham cada indicador; recomendações ficam inconclusivas quando a fonte é parcial.
- [ ] “Retorno em anúncios” não é apresentado como lucro.
- [ ] A regra de assinatura reembolsada, o tratamento líquido e a fixture real de Cakto recebem aprovação e validação antes de retirar o estado `BLOQUEADO` do M7 4.3.

**Verificação desta entrega:** conferência documental do plano, M7, M4, migration/parser de cobrança, checklist Meta e limites de custo. Sem testes de código, leitura de produção, chamada à Meta/Cakto, compra de teste, migration ou deploy.


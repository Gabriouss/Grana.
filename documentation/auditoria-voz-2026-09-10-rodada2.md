# Voz — segunda bateria exploratória, 10/09/2026

Base: `942f264`. Pedido: acumular mais testes antes de corrigir qualquer coisa.
Nenhum código de produção alterado. Sem build, deploy ou gravação em banco.

## Resultado

`node __tests__/voz-auditoria-rodada2.cjs`: saída **1**; **2.068 verificações,
1.916 aprovadas e 152 reprovadas**. O script permanece fora de `test:ci`, como
corpus exploratório de achados abertos. Não são 152 bugs diferentes.

Executa o parser e a tarefa reais, com banco, notificações e dispositivo
simulados. Executa também as funções reais das telas de contas e crédito,
extraídas por AST dos TSX, com setters simulados. Data congelada em
**10/09/2026 ao meio-dia local** para reproduzir vencimentos.

Cobertura: parcelas de 2 a 36 em seis grafias e três valores; 730 datas
explícitas válidas (todos os dias de 2027, com `/` e `-`); datas impossíveis;
datas faladas; negação de recorrência; nomes de carteiras com significado
financeiro; cartões de duas carteiras; receita descrita como crédito.

## Achados novos

| Caso | Resultado observado | Consequência |
|---|---|---|
| `mercado 1200,50 no crédito C6 em vinte e duas vezes` | 2 parcelas | quantidade errada chega à operação do widget; tela de crédito também preenche 2 |
| `... em vinte e uma parcelas` | compra única | parcelamento desaparece |
| `... em trinta e cinco parcelas` | 5 parcelas | quantidade errada |
| `... em 37 parcelas` | compra única | quantidade fora do limite é descartada, em vez de exigir revisão |
| `internet 89,90 não recorrente` / `não se repete` | `recurring: true` | cria solicitação de repetição contra a fala |
| `internet 89,90 boleto vence amanhã` | 15/09 em vez de 11/09 | aplica hoje + 5 dias |
| `internet 89,90 boleto vence dia vinte` | 15/09 em vez de 20/09 | numeral falado não chega ao leitor de datas |
| `internet 89,90 boleto vence 31/02/2027` | envia `2027-02-31` | data impossível chega à fronteira de gravação |
| `recebi um crédito de 89,90 de salário`, único cartão C6 | saída no crédito C6 | receita tratada como despesa de cartão |
| `mercado 34,57 carteira Boleto`, carteira com esse nome | `kind: bill` | nome da carteira vira intenção de boleto |
| `mercado 34,57 carteira Recorrente` | `recurring: true` | nome vira ordem de repetição |
| `mercado 34,57 carteira Débito` | `payment_method: debit` | nome vira forma de pagamento |

O envio de data impossível ao dublê **não prova aceitação pelo banco**.
Essa rodada mede o payload enviado pelo cliente, não a validação PostgreSQL.

## Causas no código atual

- `parseParcelas`: tabela de extenso cobre 2..20 e somente alguns compostos
  (24, 30 e 36). Outros viram fragmentos como `20 e 2`, e a regex lê o último
  número perto de “vezes”/“parcelas”, ou só 20 após “parcelado em”. Foram
  **117 falhas** na matriz de parcelas. O widget interpreta `null` como
  compra única, mesmo quando a pessoa pediu parcelamento explicitamente.
- `parseRecorrencia`: encontra palavras afirmativas sem considerar a
  negação. As quatro frases negativas testadas retornaram `true`.
- `parseDiaVencimento`: só lê data numérica e `dia N` em dígitos. As cinco
  formas faladas testadas caíram no padrão de cinco dias. Valida dia até 31
  e mês até 12, mas não a combinação/calendário: seis datas impossíveis
  foram devolvidas intactas. As funções reais da tela de contas também
  preencheram vencimento e recorrência incorretos.
- `ehIntencaoCredito`: a palavra “crédito” basta, sem distinguir crédito
  recebido de compra no cartão. O ramo de crédito do widget fixa `out`.
- O widget remove a referência à carteira para tipo/descrição, mas continua
  usando o texto completo para boleto, crédito, recorrência e pagamento.
  Assim, mesmo nomes reconhecidos e removidos corretamente ainda afetam o
  roteamento financeiro por outros caminhos.

## Ampliação de achado da primeira bateria

Com C6 Pessoal antes de C6 Empresa, a frase
`mercado 34,57 no crédito C6 Empresa carteira Empresa` termina em
“Cartão e carteira não combinam”. O matcher escolhe o primeiro C6 e a guarda
de vínculo barra a operação. É uma ampliação do problema de prioridade entre
nome e banco da primeira rodada, **não uma gravação na carteira errada**.

Carteira chamada Crédito também provoca “Qual cartão?” mesmo que a pessoa
só tenha mencionado a carteira. Nos dois casos houve revisão, não gravação.

## Controles que passaram e limites

Passaram todas as 730 datas explícitas válidas, as formas numéricas de
parcelamento dentro do limite e os controles de recorrência afirmativa.
Semanas, dias e “assinatura” isolada não foram indevidamente convertidos em
recorrência mensal. Pix Pessoal e débito Empresa preservaram suas carteiras.

Não foi repetida a suíte completa: ela terminou com saída 0 na bateria
anterior e nenhum arquivo de produção mudou desde então. A nova rodada
testou exclusivamente novas expectativas. `git diff --check` passou.

Não houve teste acústico em Android, chamada de reconhecimento remoto,
consulta à produção ou validação de persistência real. “Chegou à gravação”
significa chamada interceptada de `registrarOperacaoVoz` com payload real.

## Acúmulo para a fase de correções

| Bateria | Verificações | Aprovadas | Reprovadas |
|---|---:|---:|---:|
| Primeira | 7767 | 6349 | 1418 |
| Segunda | 2068 | 1916 | 152 |
| Total | 9835 | 8265 | 1570 |

Esses totais contam asserções, inclusive controles e combinações do mesmo
defeito. Não estimam a frequência dos erros entre usuários. Os scripts ficam
separados para que as próximas baterias possam ser comparadas sem perder a
origem dos achados. **Correções adiadas por pedido explícito do autor.**

# Voz — terceira bateria e revisão dos commits recentes

Base: `c5febc2`. Escopo: analisar os últimos commits e executar outra bateria
de lançamento por áudio. Nenhum arquivo de produção alterado nesta rodada.

## Leitura dos commits

- `de546cf`: concluiu e verificou as correções das duas auditorias anteriores;
  os testes viraram parte de `test:voz`. Alterou parser, referências de
  carteira/cartão, telas do app e as cópias do servidor. O extrator de testes
  passou a usar TypeScript/AST.
- `2b491cf`: corrigiu duração de acesso ao plano anual na integração Cakto.
- `1158191` e `3bca60c`: plano anual, preços e parcelamento da assinatura.
- `e43fd2b`, `e53b336`, `3b9e8c8`, `c5febc2`: documentação operacional,
  cortesias e proteção de credenciais locais no `.gitignore`.

Os sete commits posteriores ao `de546cf` não alteraram os módulos de voz
testados. As mudanças comerciais foram identificadas pelo diff, não auditadas
como uma nova tarefa comercial. O relato de funções “publicadas” no contexto
não substitui verificação de implantação; esta rodada não consultou produção.

## Bateria nova

A suíte existente `npm.cmd run test:ci` terminou com **saída 0**, incluindo
as duas auditorias corrigidas (7.770 e 2.075), 22.485 verificações de valores,
16.332 de voz gerada, 250.200 do corpus geral, 34.093 de WhatsApp gerado,
fallback, fila offline e sincronismo 40/40. O primeiro comando no sandbox
parou ao tentar acessar `tsx`; a execução autorizada fora dele completou.

Reprodução:

```text
node __tests__/voz-auditoria-rodada3.cjs
node __tests__/voz-auditoria-rodada3.cjs --baseline=27ba1e2
```

| Versão | Verificações | Aprovadas | Reprovadas |
|---|---:|---:|---:|
| Antes das correções (`27ba1e2`) | 1169 | 354 | 815 |
| Atual (`c5febc2`) | 1169 | 372 | 797 |

O corpus exploratório retorna 1 pelos achados abertos e fica fora do CI.
São asserções, não bugs únicos nem taxa de erro do reconhecimento acústico.
792 reprovações são combinações de uma única família de valores.

## Quatro famílias ainda abertas

| Transcrição/configuração | Resultado na chamada de gravação do widget | Esperado |
|---|---|---|
| `mercado 2 mil e 50 reais` | `amount: 2000.5` | 2050 |
| `mercado 18,99 no crédito no Itaú`, único cartão C6 | usa C6 | revisão do cartão |
| `mercado 18,99 no crédito de Itaú`, único cartão C6 | usa C6 | revisão do cartão |
| `mercado 18,99 e farmácia 20` | grava somente 18.99 | revisão por múltiplos gastos |
| `mercado 18,99 não quero que se repita todo mês` | `recurring: true` | false |

**Todos esses exemplos também falham na versão anterior.** Não atribuir sua
introdução ao commit de conclusão do Claude. A bateria atual mediu uma
melhora de 18 asserções: 16 milhares com resto em centenas e duas formas de
citação de cartão inexistente passaram a ser tratadas corretamente.

### Por que ainda falham

1. O normalizador une a parte restante do milhar somente quando ela é pelo
   menos 100. Restos entre 1 e 99 entram na regra de reais e centavos. A
   matriz cobre quatro milhares × 99 restos × dígitos/extenso: 792 falhas.
   `2 mil e 50 reais` passa também pela guarda do widget, portanto não é só
   erro de prévia.
2. A detecção de cartão explicitamente mencionado exclui algumas preposições
   (`no`, `de` etc.) imediatamente após “crédito”. Isso pode permitir o
   fallback para o único cartão, mesmo havendo outro banco no restante da
   frase. A forma direta “crédito Itaú” já exige revisão corretamente.
3. A guarda de múltiplos valores conta quantias decimais. Um segundo valor
   inteiro acompanhado de outra despesa não dispara a revisão. O controle
   com dois decimais (`18,99` e `20,50`) foi bloqueado corretamente.
4. A regex de negação de recorrência cobre formas próximas, mas não a frase
   composta “não quero que se repita todo mês”. A expressão afirmativa no
   fim vence e produz uma série recorrente.

## Reconhecimento local e controles

Executado `lib/voz-local.ts` real com eventos nativos simulados:

- retorno da transcrição final;
- silêncio e erro retornando `null`;
- nova tentativa funcionando depois de erro;
- segunda chamada simultânea recusada enquanto há uma em andamento;
- `requiresOnDeviceRecognition: true` em todas as chamadas;
- remoção de listeners e limpeza do PCM a cada conclusão.

Esses controles passaram. Também passaram 336 asserções de valores “X e Y”
e normalização repetida, 16 milhares com resto em centenas e os controles de
cartão C6 e dois valores decimais.

Os testes carregam os módulos reais com TypeScript/VM. Apenas dispositivo,
referências, notificações e fronteira de gravação são simulados. A comparação
histórica lê os módulos `lib/` por `git show`, sem trocar branch nem alterar
o checkout. Não houve microfone físico, envio de áudio a provedores, escrita
financeira real ou deploy. Não se mediu a aceitação de payload pelo banco.

`git diff --check` passou. Somente o corpus e a documentação foram alterados.

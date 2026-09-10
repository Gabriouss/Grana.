# Auditoria adicional do lançamento por voz — 10/09/2026

Base auditada: `7a6f2b5`, incluindo as correções de `d803816`.
Escopo autorizado: verificar os achados do Claude e executar mais testes.
Nenhum código de produção foi alterado, nenhum deploy/build foi disparado e
nenhum lançamento foi enviado a banco real.

## Resultado e reprodução

- `npm.cmd run test:ci`: **saída 0**. Inclui 22.485 verificações de valores,
  corpus de voz 106/106, voz gerada 16.332/16.332, repertório do Claude 64/64,
  corpus geral 250.200/250.200, WhatsApp gerado 34.093/34.093, fallback,
  reconhecimento local, fila offline, cartões do widget e sincronismo 40/40.
- `node __tests__/voz-auditoria-diversa.cjs`: **saída 1**, com **7.767
  verificações, 6.349 aprovadas e 1.418 reprovadas**. São combinações e
  asserções, NÃO 1.418 bugs distintos nem uma taxa de erro em uso real.
- O teste exploratório fica fora de `test:ci` enquanto registra achados
  abertos. Ele falha deliberadamente nas expectativas que a implementação
  atual não atende; não mascara defeitos para deixar a suíte verde.
- `git diff --check`: passou.

O teste carrega `lib/heuristics.ts` e `lib/widget-voz-task.ts` reais via
TypeScript/VM. Somente dispositivos, armazenamento, referências de usuário,
notificações e fronteira de gravação são dublês. As funções `processText` do
modal e `abrirNovaCompraDoTexto` da tela de crédito são extraídas por AST dos
TSX atuais e executadas com setters simulados. Não são cópias da lógica.

## Achados prioritários: payload incorreto chega à gravação do widget

| Transcrição e configuração | Observado | Esperado |
|---|---|---|
| `mercado 18,00 reais e 99 centavos` | `amount: 1800.99`, sem revisão | 18.99 |
| `mercado 18,99 no crédito Nubank Black`; Gold antes de Black, ambos banco Nubank e mesma carteira | `card_id: gold`, sem revisão | black |
| `mercado 18,99 no crédito Nubank`; mesmos dois cartões | escolhe Gold | revisar qual cartão |
| `mercado 18,99 no crédito Itaú`; único cartão cadastrado é C6 | escolhe C6 | revisar cartão inexistente/incompatível |
| `mercado 18,99 carteira Pessoalidade`; apenas Pessoal cadastrada | escolhe Pessoal | revisar carteira não encontrada |
| `mercado 18,99 carteira salario`; carteira cadastrada como Salário | `type: in` | `out` |

1. **Valor multiplicado**: a regex que une reais e centavos em
   `normalizarTexto` casa o sufixo `00 reais e 99 centavos` do decimal. O texto
   vira `18,00,99 reais` e é lido como 1800.99. A guarda chama o parser sobre
   texto já normalizado e deixa passar. A família gerada cobre 11 partes
   inteiras × 100 centavos: **1.100 falhas**. O modal do app também foi
   executado: preenche o valor incorreto, embora exija confirmação humana.
2. **Cartão**: `matchCardByText` retorna a primeira correspondência de nome
   OU banco antes de verificar um nome completo de outro cartão. A escolha
   depende da ordem da lista. A função real da tela de crédito também
   preenche Gold quando a fala especifica Black. Quando nenhum cartão casa,
   o widget usa o único cadastrado mesmo que a fala cite outro banco.
3. **Carteira por prefixo**: `matchWalletByText` usa `includes` sem limite no
   fim do nome, então Pessoal casa com Pessoalidade.
4. **Saída vira entrada**: o casamento da carteira remove acentos, mas
   `limparReferenciaCarteira` usa o nome original em regex. `salario` casa
   com Salário e não é removido. `guessTypeFromText` lê a referência como
   marcador de entrada. Reproduzido tanto no widget quanto na função real
   do modal do app.

## Outras limitações reproduzidas no parser

| Transcrição | Obtido | Esperado |
|---|---:|---:|
| `mercado 1.5 mil reais` | 1000 | 1500 |
| `mercado 2 mil e 500 reais` | 500 | 2500 |
| `mercado 2 mil e quinhentos reais` | 500 | 2500 |
| `mercado dois milhões de reais` | 2 | 2000000 |
| `mercado 1 milhão e 200 mil reais` | 200000 | 1200000 |
| `café dois reais e meio` | 2 | 2.50 |
| `mercado 18 vírgula zero cinco` | 18 | 18.05 |
| `mercado 5 h 57` | 5 | 5.57 |
| `mercado 5:57.` | 5 | 5.57 |

A forma `5:57` passa, mas um ponto final faz a regex deixar de reconhecê-la.
`vírgula zero um` até `vírgula zero nove` perde os centavos em 99 combinações.
O teste também estressa `1000:01` e outras partes inteiras acima de três
dígitos: 198 falhas. Essa última família é **entrada sintética de limite**;
não há evidência de um aparelho ter produzido esse formato.

O widget encaminhou `18 vírgula zero cinco` e `5:57.` para revisão. Esses dois
casos são perda de qualidade/preenchimento, não prova de salvamento automático
incorreto. Os outros casos desta tabela foram medidos no parser; não inferir
gravação em produção a partir de um valor retornado.

## Verificação dos achados do Claude

As correções de `5h57`, `45 mil reais`, `99 centavos` e `dois e meio` passaram.
O corpus original de 64 casos e os 16.332 casos gerados também passaram.

Há uma imprecisão no registro/commit anterior: valor positivo e categoria
conhecida não bastam para o widget salvar. Existe também
`precisaRevisarValorVoz`, que exige evidência decimal. A execução real de
`mercado 45 mil reais` terminou em **“Confirme o valor que ouvi”**, sem chamada
de gravação. Portanto, a frase histórica de que todos os exemplos inteiros
“passam pelos dois portões” não descreve o comportamento atual.

Categorias personalizadas sem conflito funcionaram (`Projeto Aurora`).
`Petiscos da Lua` virou Alimentação porque as palavras-chave nativas têm
precedência. Essa precedência já é contrato explícito do corpus existente:
é uma limitação de produto observada, não uma regressão atribuída ao Claude.

Também passaram os controles de Pix, débito, crédito parcelado, boleto
recorrente, carteira inexistente sem prefixo coincidente, dois valores
decimais exigindo revisão e retomada de áudio do app exigindo confirmação.

## O que falta validar no aparelho

- [ ] Gravar as frases acima pelo microfone do app e do widget; registrar o
  texto bruto ouvido, a prévia, o recibo e o lançamento efetivo.
- [ ] Repetir com rede e em modo avião; confirmar Android 13+ e pacote local
  pt-BR instalado (pré-condições atuais de `voz-local.ts`).
- [ ] Usar dois cartões do mesmo banco, inverter a ordem, repetir os comandos.
- [ ] Testar carteiras com acento, nomes que são prefixos de outros e nomes
  que contêm palavras de receita, pagamento ou números.
- [ ] Testar cancelamento, ruído e interrupção da gravação no aparelho.

Os testes automatizados validam o tratamento de transcrições e eventos
simulados. Não medem a taxa de acerto acústico do Android/Whisper, não
confirmam a versão das funções atualmente publicadas e não substituem QA de
APK. O sincronismo 40/40 compara as cópias no repositório.

Recomendação: corrigir primeiro os achados que alcançam a gravação automática,
rodar este corpus e a suíte completa, e só então preparar a próxima build.

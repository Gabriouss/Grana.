# Voz — bateria exploratória 4 (10/09/2026)

Base: `07507b3`. Sem alteração de produção, build, deploy ou gravação real.
Execução: `node __tests__/voz-auditoria-rodada4.cjs`.
Resultado: **37 asserções, 17 aprovadas, 20 reprovadas**, em 16 cenários
do widget e duas simulações de dependência local pendurada. São sete famílias
de achados, não vinte bugs independentes. Corpus fora do CI enquanto aberto.

## Achados reproduzidos

| Família | Entrada/condição | Resultado observado | Comportamento seguro esperado |
|---|---|---|---|
| Boleto já pago | `paguei o boleto da internet 18,99 no pix` | Cria `bill`, descrição Pagamento, vencimento padrão cinco dias depois | Registrar saída Pix ou pedir revisão, não agendar dívida futura |
| Vencimento sem palavra boleto | `internet 18,99 vence amanhã` | Cria saída hoje; deixa “vence amanhã” na descrição | Reconhecer conta a vencer ou pedir revisão |
| Negação do lançamento | `mercado 18,99 não lançar` | Envia saída para gravação | Não gravar automaticamente |
| Carteiras com prefixo comum | `mercado 18,99 carteira Pessoal e carteira Pessoal Empresa` | Escolhe Pessoal Empresa; descrição vira `Mercado ira Pessoal Empresa` | Pedir escolha entre as duas carteiras |
| Nome de cartão e banco concorrente | `mercado 18,99 no crédito C6 e Nubank` | Escolhe C6, havendo C6 e Nubank Black cadastrados | Pedir revisão da ambiguidade |
| Nome do cartão contamina categoria | `uber 18,99 no crédito Mercado`, cartão Mercado do C6 | Cartão correto, categoria Alimentação | Categoria Transporte, sem usar nome do cartão como descrição da compra |
| Preparação local sem prazo | Consulta de idiomas ou conversão PCM nunca resolve | Primeira chamada fica pendente; segunda retorna null por ocupado | Prazo limitado, liberação da exclusão e possibilidade de recuperação |

As três primeiras entradas foram repetidas com 18,99, 50,25 e 1200,50.
Os valores foram preservados nos resultados impressos; a divergência desta
rodada é de intenção/roteamento, não a inflação de valor das rodadas anteriores.

## Controles e evidência

- Apenas `carteira Pessoal Empresa` seleciona corretamente a carteira longa.
- `C6 e Nubank Black` pede revisão; somente `Nubank Black` seleciona o cartão.
- `uber 18,99 no pix` retorna Transporte e Pix.
- `voz-offline.cjs`, `voice-fallback.cjs` e `widget-voz-cartoes.cjs`: aprovados.
- Não repetimos todo `test:ci`: a execução completa aprovada está documentada
  na rodada 3 e não houve mudança de produção entre as rodadas.

Os testes carregam o TypeScript real em VM e substituem serviços externos.
A tarefa real do widget chega a `registrarOperacaoVoz`, interceptada para
capturar o payload sem banco. Os cenários começam com transcrição pronta;
não medem acurácia de reconhecimento de áudio.

Em `lib/voz-local.ts`, os awaits de `getSupportedLocales` e
`prepararAudioLocal` precedem a instalação do timeout de 30 segundos.
O teste acelera todos os timers desse módulo a zero e usa watchdog externo
de 40 ms: nenhum timeout instalado conclui a chamada nas duas simulações.
Não é medição de latência em aparelho nem prova de que a API nativa ficará
pendurada em uso real; é reprodução da ausência de limite quando isso ocorre.

As expectativas de negação e revisão expressam requisitos de segurança:
não significam que exista hoje uma feature completa de cancelamento falado.
Esta rodada não comparou commits anteriores; não atribuir os achados a uma
regressão específica ou ao trabalho do Claude sem investigação adicional.

## QA que permanece pendente

- Repetir frases com microfone real no app e no widget, online e offline.
- Validar indisponibilidade do serviço nativo e conversão no Android real.
- Após correção autorizada, promover os casos a regressões permanentes,
  repetir as quatro baterias e o CI completo.

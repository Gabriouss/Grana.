# Auditoria de voz — rodada 6 (11/09/2026)

Bateria exploratória sobre os quatro caminhos de lançamento por voz: o botão
dentro do app, a tarefa do widget, o caminho offline com fila, e o cliente de
transcrição. Rodar com:

    node __tests__/voz-auditoria-rodada6.cjs

**90 asserções, 84 aprovadas, 6 reprovadas.** Como nas rodadas 3, 4 e 5, a
expectativa escrita no teste é o comportamento desejado, não o atual, então
reprovação aqui é achado em aberto e não regressão. Nenhuma linha de código de
produção foi alterada nesta rodada.

## Como a bateria funciona

Os módulos exercitados são os de produção, compilados em memória com
`ts.transpileModule` e executados em `vm.runInNewContext`, com dublês para
cada dependência, seguindo a receita de `__tests__/voz-upload.cjs`. São eles
`lib/voice-operations.ts`, `lib/widget-voz-task.ts`,
`lib/widget-voz-pendentes.ts` e `lib/voz.ts`, mais o `lib/heuristics.ts` real.

Cada caso afirma sobre o **efeito colateral**, e não só sobre o valor
devolvido: qual notificação saiu, em que estado o widget ficou, se o arquivo
de áudio foi apagado, se a fila guardou ou perdeu o item, e quantas vezes a
rede foi chamada.

**Nada disso tocou num microfone.** Toda gravação é simulada. O reconhecimento
local, o serviço nativo do widget e a entrega de notificação no Android
continuam sem validação em aparelho.

## Os seis achados

### 1. Falha permanente do servidor vira "salvo no aparelho" (grave)

`registrarOperacaoVoz` em `lib/voice-operations.ts` só trata como definitivo o
erro cujo código casa com `/^(22|23|42501)/`. Um `PGRST202`, que é a função
ausente no servidor, cai no `catch` genérico e vira `status: 'pending'`.

O widget então chama `notificarSalvoLocal()`, devolve `true`, e a tarefa
termina em `ocioso`. Para quem falou, a leitura é "deu certo, sincroniza
depois". Para sempre.

É exatamente o defeito de 07/09/2026, quando a migration das operações de voz
não estava aplicada em produção e uma feature inteira ficou dois dias parecendo
instabilidade de rede. O próprio arquivo documenta isso no comentário de
`explicarFalhaDeEnvio`, que sabe distinguir `PGRST202`, `PGRST205`, `42883` e
`42P01` como permanentes. Só que essa função é usada apenas no caminho de
sincronização, e não no caminho que o widget percorre.

A parte boa: a sincronização acerta. Ela conta a falha, guarda a operação e
devolve a frase que manda avisar o suporte. As três asserções dessa parte
passaram.

**Sugestão:** aplicar a mesma lista de códigos permanentes dentro de
`registrarOperacaoVoz`, deixando o erro subir em vez de virar pendência.

### 2. Sem rede e sem sessão, a fala é destruída (grave)

Em `lib/widget-voz-task.ts`, quando a transcrição falha por rede, o `catch`
enfileira o áudio para retomar depois. Só que ele só faz isso se conseguir
identificar o usuário: `if (userId)`. Sem sessão, não enfileira, e o `finally`
apaga o arquivo do mesmo jeito.

Resultado: a pessoa falou, não havia rede, a sessão não estava disponível, e a
gravação some. Sobra o estado de atenção no widget, sem nada para retomar.

A vinculação ao usuário existe por um motivo legítimo, que é impedir que um
áudio antigo caia na conta seguinte do mesmo aparelho. O problema é o descarte
como consequência.

**Sugestão:** guardar o áudio mesmo sem usuário identificado, com a decisão de
dono adiada para a retomada, ou pelo menos avisar explicitamente que a fala se
perdeu.

### 3. Gravação nova sem permissão de notificação é descartada (questão de desenho)

Quando `podeNotificar()` é falso, a tarefa acende o estado de atenção e não
lança nada, o que está certo, já que sem notificação não há recibo nem
desfazer. Mas o áudio recém-gravado é apagado. A proteção existente cobre só
áudio já preservado, pela condição `payload.source === 'app' ||
caminho.includes('/voz-pendente/')`.

Quem falou precisa liberar a permissão e repetir a fala. É defensável, e por
isso está marcado como questão de desenho e não como defeito.

### 4. Áudio vindo do app deixa o widget em atenção (visível, de baixo risco)

Um áudio gravado pelo botão do app sem rede entra na fila com `source: 'app'`.
Na retomada, a tarefa transcreve, manda a notificação de revisão e devolve
`false`, porque o caminho do app nunca lança sozinho, ele pede confirmação.
Só que `false` faz `executarTarefa` acender `atencao`.

Ou seja, o widget passa a exibir atenção depois de um fluxo que funcionou
exatamente como projetado, e que nem envolveu o widget.

**Sugestão:** distinguir "não salvou porque falhou" de "não salvou porque pediu
revisão" antes de escolher o estado final.

### 5. A fila de voz pendente não tem validade nem faxina (privacidade)

`lib/widget-voz-pendentes.ts` nunca remove item por idade, e
`tentarVozesPendentes` filtra por usuário atual. Um áudio gravado por outra
conta no mesmo aparelho fica no armazenamento do app para sempre: nunca é
processado, porque o filtro o ignora, e nunca é apagado, porque ninguém o
remove.

O teste coloca um item de 90 dias de outra conta e confirma que ele continua
lá. Isso é fala financeira de terceiro guardada por tempo indeterminado.

**Sugestão:** descartar itens acima de um prazo, e descartar item de outra
conta na primeira varredura.

### 6. Permanente contra temporário, resumo

O ponto comum dos achados 1, 2 e 5 é o mesmo da regra 9 do `AGENTS.md`: todo
caminho de falha precisa deixar recibo visível, e um `catch` precisa decidir
explicitamente se o erro é temporário ou permanente. Aqui, um erro permanente
virou espera silenciosa, e dois descartes de dado aconteceram sem aviso.

## O que passou, e vale registrar

- **Idempotência da fila.** Repetir o mesmo `requestId` não duplica o item nem
  recopia o arquivo.
- **Offline honesto.** Sem rede, a tarefa enfileira preservando o mesmo
  `requestId`, mantém o arquivo, notifica e acende atenção. Continua correto
  mesmo quando a notificação de pendência falha.
- **A retentativa do corpo ilegível.** Resposta 200 com corpo ilegível tenta
  exatamente duas vezes, nunca três, e aproveita a segunda quando ela vem boa.
- **O prazo do cliente.** Com o reconhecimento local consumindo 30 segundos e a
  rede pendurada, o `AbortController` corta e devolve `demorou`, sem segunda
  tentativa fora do orçamento.
- **Economia.** Reconhecimento local que resolve não gasta chamada de nuvem, e
  sessão ausente, arquivo vazio ou arquivo grande demais não gastam upload.
- **Mensagens.** Os onze códigos de erro têm título e texto legíveis, sem
  jargão vazando para a tela.
- **Ordem financeira.** Valor inteiro em dígitos exige confirmação, por
  desenho, já que o reconhecedor pode ter colado reais e centavos. Foi isso que
  reprovou o primeiro caminho feliz que escrevi, e a expectativa corrigida foi
  a minha, não a do código.

## QA que continua pendente, em aparelho

- [ ] Falar um lançamento pelo widget com o app fechado e conferir o recibo.
- [ ] Repetir com o modo avião ligado e confirmar a retomada ao voltar a rede.
- [ ] Revogar a permissão de notificação e conferir o estado de atenção.
- [ ] Conferir se o reconhecimento local no aparelho responde dentro dos 30
      segundos de orçamento.
- [ ] Conferir a entrega das notificações agora que existem dois aparelhos
      registrados para push.

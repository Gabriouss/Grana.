# Widgets Android da tela inicial — design aprovado

**Data:** 04/09/2026

**Estado:** aprovado para planejamento de implementação

**Plataforma:** Android, Expo SDK 57, módulo Expo local

## Objetivo

Ampliar o widget Android 1x1 de lançamento por voz com quatro widgets que
levem a informação e os atalhos mais úteis do Grana. para a tela inicial:

1. Livre para Gastar 2x1;
2. Central de lançamento 2x2;
3. Próximo compromisso 2x2;
4. Cofrinho 2x1.

O widget de voz 1x1 permanece disponível e continua sendo o único widget que
pode efetivar uma movimentação financeira sem abrir uma tela do aplicativo.
Os quatro novos widgets são informativos ou atalhos: qualquer ação que altere
dinheiro exige a confirmação já existente dentro do Grana.

## Princípios e decisões

- Não duplicar regras financeiras em Kotlin. Saldo, Livre para Gastar,
  vencimentos e progresso de cofrinhos são calculados pelo mesmo TypeScript
  usado pelo aplicativo.
- Não entregar a sessão do Supabase ao código do widget nem criar um segundo
  cliente de autenticação no Android.
- Não acordar o runtime React Native periodicamente apenas para atualizar um
  widget. Isso aumentaria bateria e ainda não daria garantia de horário por
  causa das restrições de segundo plano do Android.
- Persistir somente um resumo mínimo, criptografado pelo Android Keystore.
  Histórico de lançamentos, refresh token e credenciais não entram no resumo.
- Respeitar o modo privacidade do Grana. também fora do aplicativo.
- Exibir quando os dados foram atualizados e assumir explicitamente que uma
  mudança recebida pelo WhatsApp enquanto o app está fechado só aparece no
  widget na próxima sincronização.
- Apagar o resumo no logout antes de remover a sessão.
- Manter compatibilidade a partir do `minSdkVersion` atual, API 24.

## Abordagens descartadas

### Cliente Supabase dentro do Kotlin

Daria ao widget capacidade de buscar dados com o app fechado, mas exigiria
duplicar renovação de token, filtros RLS, consultas e regras financeiras.
Também aumentaria a superfície de segurança e permitiria divergência entre o
que o widget e o app chamam de saldo.

### Atualização periódica com WorkManager + React Native headless

Poderia reduzir a defasagem, mas iniciaria o bundle JavaScript em segundo plano
mesmo sem interação. O Android não garante execução pontual, force-stop ainda
interrompe o trabalho, e o custo de bateria não se justifica para dados que já
são sincronizados sempre que a pessoa usa o produto.

### Push específico a cada alteração financeira

É a opção mais próxima de tempo real para lançamentos feitos no WhatsApp, mas
exigiria triggers/outbox e uma nova categoria de push silencioso no backend.
Fica fora desta entrega. O snapshot local não impede essa evolução posterior.

## Arquitetura

```text
Supabase
   │
   │ app em primeiro plano / mutação local / voz concluída
   ▼
TypeScript: montarSnapshotWidgets()
   │  cálculos compartilhados + dados mínimos
   ▼
Módulo Expo local: atualizarSnapshot(json)
   │  AES/GCM com chave no Android Keystore
   ▼
SharedPreferences: IV + texto cifrado
   │
   ├─ LivreParaGastarWidgetProvider
   ├─ CentralLancamentoWidgetProvider
   ├─ ProximoCompromissoWidgetProvider
   └─ CofrinhoWidgetProvider
```

O módulo existente `modules/grana-voice-widget` será ampliado e renomeado
somente na documentação/comentários para representar a família. O diretório,
namespace Kotlin e nome do módulo JavaScript continuam iguais nesta entrega
para não quebrar autolinking nem o widget de voz instalado.

### Contrato TypeScript → Android

O TypeScript envia uma string JSON com versão explícita:

```ts
type SnapshotWidgetsV1 = {
  version: 1;
  userId: string;
  updatedAt: string;
  privacyHidden: boolean;
  safeToSpend: {
    livrePorDia: number;
    livreTotal: number;
    diasRestantes: number;
    semSaldo: boolean;
  };
  nextCommitment: null | {
    id: string;
    description: string;
    amount: number;
    dueDate: string;
    overdue: boolean;
    recurring: boolean;
  };
  goal: null | {
    id: string;
    title: string;
    currentAmount: number;
    targetAmount: number;
    progress: number;
    color: string;
    completed: boolean;
  };
};
```

Os valores representam o total de todas as carteiras. Um widget na tela
inicial não acompanha o seletor temporário de carteira da Home; usar “Total”
evita que ele mude de significado conforme a última tela visitada.

O próximo compromisso é o boleto pendente de menor `due_date`, inclusive se
estiver atrasado. O cofrinho é o primeiro ainda não concluído na ordenação
estável de `fetchGoals()` (`created_at` crescente). Se todos estiverem
concluídos, mostra o primeiro existente como conquista; se não houver nenhum,
mostra o estado vazio.

### Persistência criptografada

`WidgetSnapshotStore.kt` usa uma chave AES no provider `AndroidKeyStore`, com
GCM e IV novo a cada escrita. `SharedPreferences` guarda somente IV e payload
cifrado em Base64. A leitura falha fechada: qualquer JSON inválido, versão não
reconhecida, chave perdida ou falha de descriptografia produz o estado vazio,
nunca dados parciais ou texto financeiro em claro.

O método nativo `limparSnapshot()` remove payload e IV. Ele é chamado:

- no logout, antes de `supabase.auth.signOut()`;
- quando não há sessão ativa;
- se o usuário autenticado do snapshot não corresponde à sessão atual.

## Sincronização

Um componente sem interface, montado dentro dos providers de sessão e
privacidade, coordena a sincronização somente no Android quando o módulo
nativo existe.

Ele atualiza o snapshot:

1. após a sessão autenticada ficar disponível;
2. sempre que o app volta a `active`;
3. após mudança no modo privacidade;
4. após uma mutação financeira feita pelo app;
5. após a tarefa headless de voz concluir com sucesso.

Mutações financeiras em `lib/data.ts` e `lib/goals.ts` emitem apenas um sinal
puro de “dados mudaram”. O sincronizador aplica debounce e busca em paralelo
transações, boletos e cofrinhos. Isso evita ciclos de importação e evita várias
consultas quando uma ação cria mais de uma linha, como parcelamento.

Se uma busca falhar, o snapshot anterior é preservado. O widget continua
mostrando o último dado válido com sua hora real de atualização; não substitui
informação conhecida por zeros. Quando não existe snapshot, os widgets
mostram “Abra o Grana. para atualizar”.

Os providers usam `updatePeriodMillis="0"`. Redesenhos são disparados pela
escrita do snapshot, por atualização do pacote, reinicialização do aparelho e
mudanças de locale/data relevantes. Não há promessa de tempo real com o app
fechado.

## Widgets

### Voz 1x1

Sem alteração funcional. Continua com os estados ocioso, ouvindo,
processando e atenção; exige microfone e notificações; lança por voz com recibo
e opção de desfazer.

### Livre para Gastar 2x1

Conteúdo:

- título “Livre para gastar”;
- valor principal `R$ X/dia`;
- apoio “R$ Y no total · N dias”;
- horário da última sincronização.

Sem saldo, mostra “Sem saldo disponível neste mês”. Com privacidade ativa,
substitui os dois valores por `••••`, mantendo título e dias restantes. O toque
abre `com.gabriouss.grana://safe-to-spend`.

### Central de lançamento 2x2

Grade de quatro alvos com tamanho tocável adequado:

- Entrada → `add-tx?type=in`;
- Débito/Pix → `add-tx?type=out`;
- Crédito → abre `/(app)/credito?novaCompra=1`;
- Boleto → abre `/(app)/contas?novaConta=1`.

Não mostra valores e não depende de snapshot. Voz não é repetida porque já
tem o widget 1x1 dedicado; assim todos os quatro tipos manuais do FAB atual
ficam acessíveis.

### Próximo compromisso 2x2

Conteúdo:

- “Próximo compromisso” ou “Atrasado”;
- descrição em até duas linhas;
- data relativa/curta de vencimento;
- valor, mascarado no modo privacidade;
- indicador discreto quando recorrente.

O toque abre a tela Contas. Não marca como pago fora do aplicativo. Sem conta
pendente, mostra “Nada pendente” e mantém o atalho para Contas.

### Cofrinho 2x1

Conteúdo:

- nome do cofrinho;
- valor atual e alvo, mascarados no modo privacidade;
- percentual numérico e barra de progresso;
- estado concluído quando `current_amount >= target_amount`.

O toque abre a Home com `acao=deposit-goal&goalId=<id>`. A Home encaminha o id
ao carrossel e abre o `GoalDepositModal` existente. Nenhum valor é movimentado
antes da confirmação dentro do app. Sem cofrinho, o widget convida a criar um
e abre a seção correspondente da Home.

## Deep links e navegação

`lib/deep-links.ts` ganha ações tipadas para crédito, boleto, cofrinho e tela
de contas. URLs são validadas como as ações atuais; ids entram por query string
e nunca são executados diretamente no Kotlin.

Os `PendingIntent` usam request codes distintos por widget, ação e instância,
com `FLAG_IMMUTABLE` e `FLAG_UPDATE_CURRENT`. Cada região tocável da central
abre uma URL específica. Os demais widgets possuem um único alvo principal.

Se o app abrir sem sessão, o fluxo normal de autenticação continua protegendo
a área interna. A ação recebida deve ser preservada pelo mecanismo existente
de destino pós-login ou, quando isso não for possível no primeiro incremento,
voltar com segurança para a Home sem executar movimentação.

## Recursos Android

Cada novo widget terá:

- um `AppWidgetProvider` próprio;
- um XML `appwidget-provider` próprio;
- layout `RemoteViews` próprio;
- label e descrição próprios na galeria de widgets;
- preview estático compatível com a identidade do Grana.;
- drawables vetoriais próprios ou compartilhados;
- `targetCellWidth/Height`, além de `minWidth/minHeight` para Android antigo.

Os widgets informativos aceitam redimensionamento horizontal quando o launcher
permitir, sem alterar o tamanho-alvo inicial. A central mantém proporção 2x2.
Layouts usam apenas views aceitas por `RemoteViews`; não dependem de Compose,
Glance ou biblioteca externa.

## API pública do módulo

A API existente permanece compatível e ganha operações genéricas:

```ts
type TipoWidget = 'voz' | 'livre' | 'central' | 'compromisso' | 'cofrinho';

atualizarSnapshot(snapshot: SnapshotWidgetsV1): void;
limparSnapshot(): void;
quantidadeInstalada(tipo?: TipoWidget): number;
podeFixar(): boolean;
fixarNaTelaInicial(tipo?: TipoWidget): boolean;
redesenharTodos(): void;
```

O parâmetro opcional mantém `quantidadeInstalada()` e
`fixarNaTelaInicial()` equivalentes ao widget de voz para consumidores já
existentes.

## Perfil

A linha única “Widget de voz na tela inicial” vira uma seção “Widgets da tela
inicial” com cinco itens. Cada item informa tamanho, utilidade e estado
“Adicionar”/“Adicionado”. O pedido de pin usa o provider correto; launchers sem
pinning recebem instrução para abrir a galeria e procurar pelo label exato.

Somente o widget de voz pede microfone/notificações antes de ser oferecido.
Os quatro novos não exigem permissões adicionais.

## Privacidade, segurança e acessibilidade

- Valores seguem `privacyHidden`; a preferência é sincronizada imediatamente.
- Dados persistidos pelo módulo são cifrados em repouso.
- Logout limpa o snapshot antes da sessão.
- Descrições de conteúdo narram finalidade, estado e ação de cada alvo.
- Cores nunca são o único sinal de atraso, conclusão ou entrada/saída.
- Valores usam formatação `pt-BR`; datas respeitam locale do aparelho.
- Texto possui limites e ellipsis para launchers com grades menores.
- Nenhum widget aparece na tela de bloqueio: `widgetCategory="home_screen"`.

## Estados de erro

- Sem snapshot: “Abra o Grana. para atualizar”.
- Snapshot desatualizado: mantém o dado e mostra a hora/data da sincronização.
- Snapshot inválido ou indecifrável: estado vazio e limpeza do payload quebrado.
- Sem item específico: estado vazio útil, com atalho para criar/consultar.
- Deep link desconhecido ou id removido: abre a tela dona do recurso sem
  executar ação.
- Módulo ausente (Expo Go, web, iOS): API TypeScript continua retornando
  valores seguros e nenhum controle de widget é exibido.

## Testes e verificação

### TypeScript

- testes puros da seleção do próximo boleto e do cofrinho;
- cálculo do snapshot usando `calcularSafeToSpend` compartilhado;
- exclusão de transações de crédito do saldo de caixa;
- total de todas as carteiras;
- privacidade e estados vazios;
- parser e geração dos novos deep links;
- debounce e preservação do snapshot anterior em falha.

### Android estático

- autolinking do módulo;
- XML bem-formado;
- toda referência `R.*` resolve para recurso existente;
- todos os providers possuem manifest, metadata e layout;
- PendingIntents têm request codes sem colisão;
- nenhum layout usa view incompatível com `RemoteViews`;
- leitura/escrita criptografada não contém o JSON em claro nas preferências.

### Projeto

- `npx tsc --noEmit`;
- `npm run test:parser`;
- `git diff --check`;
- `npx expo-modules-autolinking resolve --platform android`;
- prebuild Android somente se puder ser executado sem apagar alterações locais.

### QA obrigatório em APK

- Android 12, 13, 14 e 15;
- ao menos Pixel, Samsung e Motorola;
- instalação manual pela galeria e pinning pelo Perfil;
- tamanhos 1x1, 2x1 e 2x2 em launchers diferentes;
- app aberto, em segundo plano, morto pelo sistema, após reboot e após
  atualização do APK;
- troca de conta e logout sem vazamento do usuário anterior;
- modo privacidade ligado/desligado;
- estados sem dados, atraso, recorrência, meta concluída e dados antigos;
- todos os deep links e retorno pós-login;
- widget de voz sem regressão.

Não há garantia honesta de funcionamento nativo antes desse QA: esta máquina
não possui JDK nem Android SDK para compilar o Kotlin. Uma build EAS só será
disparada mediante pedido explícito do autor e depois de subir `expo.version`.

## Fora de escopo

- widgets para iOS;
- atualização em tempo real com o app fechado;
- cliente Supabase ou token de sessão no Kotlin;
- pagamento de boleto, depósito em cofrinho ou lançamento manual com um único
  toque fora do app;
- escolha/configuração de carteira ou cofrinho na galeria do launcher;
- coleção rolável de boletos, lançamentos ou metas;
- alteração no motor de voz, parser financeiro ou backend de notificações.

## Critérios de aceite

1. Os cinco widgets aparecem separadamente na galeria do Android e podem ser
   adicionados pelo Perfil quando o launcher suporta pinning.
2. Livre, compromisso e cofrinho exibem o último snapshot válido e respeitam
   o modo privacidade.
3. A central abre os quatro fluxos manuais corretos sem efetivar lançamento.
4. O cofrinho abre o modal do item exibido e exige confirmação no app.
5. O widget de voz mantém o comportamento atual.
6. Logout e troca de conta não deixam dados financeiros do usuário anterior
   nos widgets.
7. Falha de rede preserva o dado anterior e sua data real, sem trocar por zero.
8. Nenhuma credencial ou histórico financeiro completo é persistido pelo
   módulo de widgets.
9. Testes TypeScript e verificações estáticas passam; limitações de compilação
   nativa e QA ficam explicitamente registradas até uma APK ser gerada.

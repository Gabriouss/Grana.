# Voz unificada e widget Android 1x1 (especificação de execução)

Data: 2026-09-04

Pedido por: Gabriel (autor)

Status: implementado no repositório; migração remota e validação em aparelho aguardam credenciais/build autorizada

Escopo de plataforma: Android, APK distribuído fora da Play Store

## Objetivo

Entregar um widget Android 1x1 que permanece na tela inicial e inicia um
lançamento por voz sem abrir a tela principal do Grana. Ao mesmo tempo,
eliminar a diferença de qualidade entre:

1. áudio enviado ao Granabô pelo WhatsApp;
2. lançamento por voz dentro do aplicativo;
3. lançamento iniciado pelo widget Android.

Os três canais devem usar o mesmo núcleo de transcrição, normalização,
interpretação e regras financeiras. Não manter cópias independentes do
parser por canal.

## Definição de “mesma qualidade”

Paridade não significa que dois áudios gravados em aparelhos ou codecs
diferentes produzirão necessariamente os mesmos caracteres. A captura física
e a compressão variam. Para este projeto, paridade significa:

- mesma ordem de provedores: Groq `whisper-large-v3`, com OpenAI `whisper-1`
  como fallback;
- mesmo prompt em português brasileiro;
- mesma normalização da transcrição;
- mesmo parser financeiro;
- mesmas regras para valor, descrição, tipo, forma de pagamento, cartão,
  parcelas, recorrência, vencimento e categoria;
- mesmas regras de segurança contra ambiguidade e duplicação;
- os mesmos fixtures de áudio/texto devem produzir a mesma estrutura
  financeira, independentemente do canal que iniciou o processamento.

O que pode mudar por canal é apenas a interface de confirmação:

- WhatsApp pergunta e confirma na conversa;
- aplicativo mostra a revisão dentro do app;
- widget salva automaticamente quando o comando estiver completo e oferece
  **Desfazer** pela notificação.

## Evidência do estado atual

### O que já está completo

O motor do WhatsApp já reconhece:

- Pix, débito, dinheiro e crédito;
- crédito à vista e parcelado, de 2 a 36 parcelas;
- lançamentos mensais recorrentes;
- boletos/contas a pagar e respectivos vencimentos;
- boletos recorrentes;
- receitas e despesas;
- cartões citados pelo nome ou banco;
- as nove categorias nativas;
- categorias criadas pelo usuário, quando o nome é dito.

Evidências principais:

- forma de pagamento: `supabase/functions/whatsapp-webhook/index.ts`, perto de
  `parseFormaPagamento`;
- recorrência: mesmo arquivo, perto de `parseRecorrencia`;
- boleto: mesmo arquivo, perto de `registrarBoleto`;
- roteamento e persistência: mesmo arquivo, perto de
  `registrarLancamento`/`finalizarLancamento`;
- categorias personalizadas: mesmo arquivo, perto de
  `fetchCategoriasDoUsuario` e `matchCategoryByKeyword`.

Verificação executada durante o desenho desta especificação:

- `npm.cmd run test:parser`: aprovado;
- corpus manual do WhatsApp: 186/186;
- corpus gerado do WhatsApp: 34.093/34.093;
- categorias personalizadas: 12/12;
- recorrência: 15/15;
- funções copiadas entre app e webhook: 37/37 em sincronia;
- toda a suíte terminou sem falhas.

### O que ainda está incompleto

O botão interno em `components/VoiceEntryButton.tsx` usa
`expo-speech-recognition`, isto é, outro motor de transcrição. Depois, o
aplicativo usa cópias parciais das heurísticas do webhook.

Consequências observáveis no código atual:

- Pix/débito/dinheiro mencionados na fala não chegam consistentemente ao
  campo `payment_method` no caminho genérico;
- `app/(app)/credito.tsx::abrirNovaCompraDoTexto` fixa recorrência como falsa;
- `app/(app)/contas.tsx::abrirNovaContaDoTexto` fixa recorrência como falsa;
- os caminhos de crédito e boleto chamam `guessCategoryFromText` sem carregar
  as categorias personalizadas;
- o modal genérico reconhece uma categoria personalizada com `extras`, mas a
  converte novamente sem `extras` ao salvar;
- `__tests__/sync-parser.js` reduz divergência entre cópias, mas não substitui
  um único núcleo compartilhado.

Portanto, não se deve ligar o widget diretamente ao fluxo atual do
`VoiceEntryButton`. Primeiro deve existir o núcleo unificado.

## Decisões de produto

### Widget

- Tamanho inicial e alvo: 1x1.
- Estado ocioso: botão com ícone de microfone e identificação do Grana.
- Um toque começa a gravação sem abrir a Activity principal.
- Enquanto grava, o widget muda para estado “ouvindo” e o Android mostra o
  indicador obrigatório de microfone.
- Um segundo toque encerra a gravação imediatamente.
- Também encerrar automaticamente após silêncio detectado depois do início da
  fala, com limite absoluto de 20 segundos.
- Enquanto processa, o widget mostra estado estático “processando”; não usar
  animação que App Widgets não garantem.
- Em sucesso, mostrar um check temporário e voltar ao microfone.
- Em falha, mostrar estado de erro temporário e publicar uma notificação com
  a próxima ação possível.

### Salvamento iniciado pelo widget

Quando valor, categoria e destino estiverem inequívocos, salvar
automaticamente e publicar uma notificação, por exemplo:

> Mercado — R$ 120,00 no Pix
>
> Alimentação · salvo no Grana.

Ações:

- **Desfazer**: reverte exatamente a operação criada por aquele comando;
- **Abrir**: abre o lançamento correspondente no Grana.

Nunca salvar quando faltar informação essencial ou houver ambiguidade que
possa alterar dinheiro. Nesses casos:

- valor ausente/inválido: “Não encontrei o valor” + **Tentar novamente**;
- valor ambíguo de áudio: mostrar as duas leituras e abrir a revisão;
- categoria desconhecida: não cair silenciosamente em “Outros”; oferecer
  **Escolher categoria**;
- crédito sem cartão cadastrado: não converter para Pix/débito; oferecer
  **Cadastrar cartão**;
- sessão expirada sem possibilidade de renovação: oferecer **Entrar no
  Grana**;
- sem rede ou falha de ambos os provedores: não guardar áudio financeiro por
  tempo indefinido; apagar o arquivo temporário e oferecer **Tentar de novo**.

### Aplicativo

O botão de voz dentro do app troca `expo-speech-recognition` por gravação de
áudio e envio ao mesmo backend do widget/WhatsApp.

O aplicativo preserva a revisão visual antes de salvar. A resposta estruturada
do backend deve preencher a tela certa:

- Pix/débito/dinheiro/receita: lançamento comum;
- crédito à vista, parcelado ou recorrente: compra no cartão;
- boleto comum ou recorrente: Contas a pagar.

A revisão deve exibir e permitir corrigir todos os metadados reconhecidos,
inclusive forma de pagamento, recorrência, cartão, parcelas, vencimento e
categoria personalizada.

### Regras financeiras

- Pix, débito, dinheiro e crédito são formas distintas em
  `transactions.payment_method`.
- Parcelamento só é válido para despesa no crédito.
- Parcelamento e recorrência são mutuamente exclusivos. Se ambos forem ditos,
  parcelamento vence por ser a intenção mais específica.
- Crédito exige cartão cadastrado. Se o nome/banco for dito, casar o cartão;
  caso contrário, usar o cartão padrão/primeiro e dizer qual foi usado.
- Boleto é salvo em `bills`, não em `transactions`; só vira saída quando pago,
  preservando o comportamento atual.
- Recorrência suportada é mensal. Não interpretar “toda semana” como mensal.
- Categorias nativas usam as keywords atuais. Categoria personalizada só casa
  quando seu nome estiver na frase.
- Categoria desconhecida não deve ser inventada nem convertida silenciosamente
  em outra categoria no widget.
- Carteira explícita, se implementada no mesmo ciclo, só pode ser usada após
  validar que pertence ao usuário. Sem carteira dita, usar a carteira padrão
  do usuário.

## Arquitetura recomendada

### Visão geral

```text
WhatsApp (áudio OGG) ─┐
                      ├─> transcrição compartilhada ─> parser compartilhado
App (áudio M4A) ──────┤          │                         │
Widget (áudio M4A) ───┘          │                         ├─> rascunho/revisão
                                 │                         └─> persistência
                                 └─> Groq -> OpenAI fallback
```

Não fazer o `whatsapp-webhook` chamar outra Edge Function via HTTP. Além da
latência e de mais um ponto de falha, o Supabase hoje limita cadeias de
chamadas recursivas/aninhadas. Compartilhar módulos TypeScript dentro de
`supabase/functions/_shared/`.

### Módulos compartilhados do backend

Extrair do arquivo monolítico `whatsapp-webhook/index.ts`:

1. `supabase/functions/_shared/voice-transcription.ts`
   - recebe bytes, MIME type e nome de arquivo;
   - tenta Groq e depois OpenAI;
   - possui um único prompt, sem dizer “mensagem de WhatsApp”;
   - normaliza a transcrição;
   - nunca registra áudio nem transcrição nos logs.

2. `supabase/functions/_shared/finance-command.ts`
   - funções puras de normalização e parser;
   - recebe texto, categorias do usuário e cartões do usuário;
   - devolve uma união discriminada, sem acessar UI:

```ts
type ResultadoComandoFinanceiro =
  | { status: 'ready'; draft: LancamentoEstruturado }
  | { status: 'needs_amount'; transcript: string }
  | { status: 'ambiguous_amount'; transcript: string; options: number[] }
  | { status: 'needs_category'; transcript: string; draft: RascunhoParcial }
  | { status: 'needs_card'; transcript: string; draft: RascunhoParcial }
  | { status: 'unsupported'; reason: string };
```

3. `supabase/functions/_shared/finance-persistence.ts`
   - recebe a estrutura já interpretada;
   - possui adapters para chamada autenticada do app/widget e para a identidade
     já validada pelo WhatsApp;
   - não aceita `user_id` vindo livremente de cliente móvel;
   - preserva idempotência por `request_id`/`event_id`.

O webhook deve importar esses módulos. Não deixar implementações antigas ao
lado das novas depois da migração.

### Nova Edge Function autenticada

Nome sugerido: `processar-lancamento-voz`.

Contrato de entrada `multipart/form-data`:

- `audio`: arquivo M4A/AAC ou OGG/Opus;
- `request_id`: UUID gerado no aparelho antes da primeira tentativa;
- `source`: `app` ou `widget`;
- `mode`: `draft` para revisão no app, `commit` para widget;
- `wallet_id`: opcional; nunca confiar sem verificar propriedade.

Limites iniciais:

- duração máxima: 20 segundos;
- tamanho máximo: 2 MiB;
- MIME allowlist explícita;
- uma única operação ativa por `request_id`;
- rate limit por usuário para impedir abuso e custo acidental.

Autenticação e autorização:

- manter `verify_jwt = true`;
- preferir o padrão atual `withSupabase({ auth: 'user' })` de
  `@supabase/server`, confirmando a API na documentação vigente antes de
  implementar;
- receber o JWT da sessão no `Authorization`;
- derivar identidade do JWT validado, nunca de `user_id` no body;
- usar cliente Supabase limitado por RLS para dados do usuário;
- segredos da Groq/OpenAI ficam somente nos secrets das Edge Functions;
- nunca embarcar `service_role`, secret key ou token administrativo no APK;
- devolver 401 quando a sessão não puder ser renovada e códigos de erro
  estáveis para a UI decidir a mensagem.

Resposta de sucesso em modo `draft`:

```json
{
  "status": "ready",
  "request_id": "uuid",
  "transcript": "mercado 120 no pix alimentação",
  "draft": {
    "kind": "transaction",
    "type": "out",
    "description": "Mercado",
    "amount": 120,
    "category": "Alimentação",
    "color": "#bb6b60",
    "payment_method": "pix",
    "recurring": false,
    "occurred_on": "2026-09-04"
  }
}
```

Resposta de sucesso em modo `commit` também inclui `operation_id`, resumo e
identificadores necessários para abrir/desfazer, sem expor dados de outro
usuário.

### Idempotência e desfazer

Criar uma migração versionada para uma operação de voz genérica. Nome sugerido
da tabela: `voice_operations`.

Campos mínimos:

- `id uuid` (`request_id`);
- `user_id uuid`;
- `source text` (`app`/`widget`);
- `status text` (`processing`/`committed`/`failed`/`undone`);
- `kind text` (`transaction`/`installment`/`bill`);
- `result_ids jsonb` com os IDs criados;
- `created_at`, `completed_at`, `undone_at`;
- dados mínimos para devolver a mesma resposta em retry.

Não guardar áudio nem transcrição completa nessa tabela. Se for necessário
diagnóstico, guardar apenas código de erro, provedor, latência e tamanho do
áudio.

Requisitos de banco:

- RLS habilitada;
- `SELECT` restrito a `auth.uid() = user_id`;
- inserção/atualização também com ownership (`USING` e `WITH CHECK`);
- funções SQL com `SECURITY INVOKER` sempre que possível;
- qualquer função privilegiada inevitável deve ficar fora de schema exposto,
  revogar `EXECUTE` de `PUBLIC` e validar explicitamente a identidade;
- a função de commit deve ser atômica: ou registra a operação e todos os
  lançamentos, ou nada;
- uma repetição do mesmo `request_id` devolve o resultado anterior, sem criar
  segunda transação;
- `desfazer_operacao_voz(operation_id)` só desfaz operação daquele usuário,
  dentro da janela definida, e contempla todas as parcelas de uma compra;
- rodar advisors antes de considerar a migração pronta.

O projeto usa migrações imperativas (`supabase/migrations/`) e não possui hoje
`supabase/schemas/` nem `supabase/config.toml` versionado. O agente deve:

1. verificar a versão/ajuda da CLI antes de assumir comandos;
2. criar a migração com `supabase migration new voice_operations`;
3. testar localmente/num ambiente controlado;
4. revisar RLS, grants e funções;
5. executar advisors;
6. comparar a lista de migrações antes de aplicar em produção;
7. pedir autorização antes de uma mudança irreversível ou implantação em
   produção.

### Android nativo

Criar um módulo Expo local somente para Android, sugerido como
`modules/grana-voice-widget/`, seguindo o mecanismo oficial de módulos locais
do Expo SDK 57.

Componentes nativos:

1. `GranaVoiceWidgetProvider : AppWidgetProvider`
   - cria/atualiza o widget 1x1;
   - registra `PendingIntent` explícito para iniciar o serviço;
   - restaura estado ocioso após reboot/atualização do pacote.

2. `GranaVoiceCaptureService : Service`
   - foreground service do tipo `microphone`;
   - inicia a notificação obrigatória em menos de cinco segundos;
   - grava AAC/M4A no cache privado do aplicativo;
   - monitora amplitude para encerrar após silêncio;
   - limite absoluto de 20 segundos;
   - suporta parar/cancelar pelo segundo toque e pela notificação;
   - sempre libera `MediaRecorder`, arquivo e wakelock em `finally`;
   - apaga arquivo ao concluir ou falhar.

3. Ponte para tarefa headless
   - ao finalizar a captura, inicia uma tarefa Headless JS com URI privada e
     `request_id`;
   - a tarefa carrega/renova a sessão Supabase do usuário;
   - envia o multipart para `processar-lancamento-voz`;
   - atualiza widget e notificação com o resultado;
   - não toca em componentes React de UI.

4. Config plugin
   - declara provider, service e metadata do App Widget;
   - copia XML/layout/drawables necessários no prebuild;
   - adiciona permissões nativas de forma idempotente;
   - nunca editar `android/` manualmente como fonte de verdade, porque o
     projeto usa geração nativa do Expo.

Manifest/permissões a validar conforme o target SDK gerado pelo Expo 57:

- `RECORD_AUDIO`;
- `FOREGROUND_SERVICE`;
- `FOREGROUND_SERVICE_MICROPHONE` no Android 14+;
- `POST_NOTIFICATIONS` no Android 13+;
- service com `android:foregroundServiceType="microphone"`;
- receiver/provider não exportado além do estritamente exigido pelo launcher;
- `PendingIntent` explícito, immutable quando não precisar de mutação.

O Android permite que uma interação direta com App Widget inicie um foreground
service que usa permissão de microfone. Isso não elimina os indicadores de
privacidade nem a notificação obrigatória.

### Gravação dentro do app

- usar `expo-audio` compatível com o Expo SDK 57 para gravar M4A/AAC;
- manter o mesmo gesto atual: tocar para iniciar, tocar novamente para parar;
- enviar para a Edge Function em `mode=draft`;
- substituir o parser local do resultado de voz pela estrutura devolvida pelo
  backend;
- manter parser local apenas onde ainda for necessário para texto colado/CSV,
  sem chamá-lo de “mesmo motor de voz”;
- remover `expo-speech-recognition` e seu plugin somente depois que os testes
  de paridade e QA em APK passarem.

## Permissões e onboarding

O widget não pode pedir permissão de microfone de modo confiável sem uma tela.
Antes de adicioná-lo, o usuário precisa abrir o Grana pelo menos uma vez e:

1. autorizar microfone;
2. autorizar notificações quando exigido;
3. aceitar que o áudio do comando será enviado aos provedores de transcrição;
4. estar autenticado;
5. opcionalmente escolher carteira/cartão padrão.

Adicionar no Perfil ou na área de atalhos:

- explicação curta do widget;
- status das permissões;
- botão **Adicionar widget à tela inicial** usando pinning quando o launcher
  suportar;
- botão para abrir configurações quando uma permissão estiver bloqueada.

Depois desse preparo, o uso normal não abre a Activity principal. O processo
do aplicativo e o foreground service são iniciados em segundo plano.

Limitações honestas:

- desinstalar remove o widget;
- “Forçar parada” nas configurações pode impedir receivers/services até o
  usuário abrir o app novamente;
- sem internet não existe paridade com o Whisper em nuvem;
- fabricantes podem aplicar restrições extras de bateria; testar OEMs reais;
- uma sessão revogada exige login novamente.

## Notificações

Criar canal separado, por exemplo `lancamento-voz`, sem misturar com lembretes
financeiros.

Tipos:

1. **Gravação em andamento**
   - ongoing;
   - texto “Grana está ouvindo…”;
   - ações **Concluir** e **Cancelar**.

2. **Processando**
   - curta duração;
   - não prometer que salvou antes da confirmação do backend.

3. **Sucesso**
   - resumo do lançamento;
   - ações **Desfazer** e **Abrir**;
   - para crédito parcelado, mostrar valor total e número de parcelas;
   - para recorrente, dizer que repetirá todo mês;
   - para boleto, mostrar vencimento.

4. **Precisa de ação**
   - erro claro e próximo passo;
   - deep link para a revisão correta;
   - nunca exibir stack trace, JWT ou texto bruto de provedor.

5. **Desfeito**
   - confirmar que a operação foi revertida;
   - se falhar, não fingir sucesso e oferecer abrir o app.

## Privacidade e segurança

O texto legal atual diz que Groq/OpenAI recebem áudio somente quando o canal de
WhatsApp está em uso. Isso ficará incorreto.

Antes da release:

- atualizar `lib/legal-content.ts` para incluir voz no app e widget;
- explicar finalidade, provedores, envio e descarte;
- obter consentimento antes do primeiro envio de áudio pelo app/widget;
- não guardar áudio em Supabase Storage;
- usar cache privado local e apagar em todos os caminhos;
- não registrar transcrição nem conteúdo financeiro em logs;
- nunca colocar chaves Groq/OpenAI no APK;
- limitar tamanho, duração, MIME e frequência;
- validar ownership de carteira, cartão, categoria e operação;
- usar JWT da sessão Supabase para app/widget;
- não usar `user_metadata` como autorização;
- não aceitar `user_id` do body como identidade;
- revisar RLS e testar tentativa de acesso cruzado entre dois usuários.

O token temporário compartilhado em conversa anterior não deve ser copiado
para arquivo, commit, log ou código. Se tiver expirado quando a execução
começar, solicitar outro e mantê-lo apenas em variável de ambiente do processo.

## Ordem recomendada de implementação

### Fase 0 — segurança operacional do repositório

1. Ler `AGENTS.md` e `context.md` por inteiro.
2. Rodar `git status --short` e preservar alterações de outras sessões.
3. Nunca executar `git init`.
4. Conferir documentação versionada do Expo SDK 57 antes de código nativo.
5. Conferir changelog/documentação atual do Supabase antes de alterar
   Functions/Auth/RLS.
6. Não disparar EAS Build sem pedido explícito do autor naquela sessão.

### Fase 1 — caracterização e testes antes da refatoração

1. Congelar em testes o comportamento atual do WhatsApp para todos os tipos.
2. Adicionar fixtures representando app/widget, incluindo M4A e OGG curtos.
3. Criar teste de contrato para `ResultadoComandoFinanceiro`.
4. Confirmar que nenhum teste depende de enviar áudio real a provedores em CI;
   mockar HTTP e manter testes de integração opcionais com secrets.

### Fase 2 — extrair o núcleo compartilhado

1. Extrair transcrição, normalização e parser para `_shared/`.
2. Fazer o `whatsapp-webhook` usar as importações novas.
3. Remover as implementações antigas, sem manter fallback duplicado.
4. Rodar `npm.cmd run test:parser`.
5. Validar que os números de cobertura relevantes continuam 100%.

Gate: nenhuma mudança no aplicativo/widget antes de o WhatsApp continuar verde.

### Fase 3 — Edge Function autenticada

1. Criar `processar-lancamento-voz`.
2. Implementar validação de JWT e limites de upload.
3. Implementar `draft` primeiro.
4. Testar com usuário A e provar que não acessa cartão/categoria do usuário B.
5. Implementar `commit` idempotente.
6. Implementar desfazer atômico.
7. Testar repetição do mesmo `request_id`.

### Fase 4 — migração e RLS

1. Criar migração via Supabase CLI, não inventar nome de arquivo à mão.
2. Implementar `voice_operations`, policies e funções SQL.
3. Rodar testes de RLS com duas identidades.
4. Rodar advisors e revisar warnings.
5. Não aplicar em produção até revisão explícita do diff SQL.

### Fase 5 — voz completa dentro do app

1. Trocar captura local de texto por gravação de áudio.
2. Chamar a função em `mode=draft`.
3. Adaptar telas para todos os campos e categorias personalizadas.
4. Comparar cada tipo com o WhatsApp.
5. Só então remover `expo-speech-recognition`.

### Fase 6 — widget e serviço Android

1. Criar módulo Expo local e config plugin.
2. Implementar widget 1x1 e estados.
3. Implementar foreground service de gravação.
4. Implementar tarefa Headless JS autenticada.
5. Implementar notificações e ações.
6. Implementar pinning pelo app.
7. Testar com app em foreground, background e processo encerrado.

### Fase 7 — legal, observabilidade e acabamento

1. Atualizar política/termos e consentimento.
2. Garantir que logs não contenham áudio/transcrição.
3. Registrar somente métricas técnicas anônimas/operacionais necessárias.
4. Revisar acessibilidade do widget e notificações.
5. Atualizar `context.md` com arquitetura e estado real.

### Fase 8 — validação e entrega

1. `npm.cmd run test:parser`.
2. `npx.cmd tsc --noEmit`.
3. testes locais das Edge Functions;
4. testes de RLS e idempotência;
5. teste de integração com áudio real em ambiente autorizado;
6. APK de desenvolvimento/preview somente se o autor pedir build;
7. QA em aparelhos reais;
8. antes de release, subir `expo.version` e validar a nota com
   `npm.cmd run notas:check "Lance gastos por voz direto da tela inicial"`;
9. manter package `com.gabriouss.grana` e a mesma chave de assinatura para
   instalar por cima do APK existente.

## Matriz mínima de testes funcionais

Cada frase deve ser testada no app, no widget e no adaptador do WhatsApp. Para
o parser, usar o mesmo texto normalizado; para transcrição, usar fixtures de
áudio equivalentes.

| Caso | Exemplo | Resultado esperado |
|---|---|---|
| Pix | “Mercado 120 no Pix, alimentação” | despesa, Pix, Alimentação |
| Débito | “Farmácia 55 no débito” | despesa, débito, Saúde |
| Dinheiro | “Feira 40 em dinheiro” | despesa, dinheiro |
| Receita | “Recebi um Pix de 250 do João” | entrada, Pix |
| Crédito | “Almoço 30 no crédito da C6” | cartão C6, uma parcela |
| Parcelado | “Notebook 3000 em 10x no Nubank” | dez parcelas no cartão |
| Crédito recorrente | “Netflix 39,90 no crédito todo mês” | crédito recorrente |
| Boleto | “Boleto da luz 210 vence dia 10” | `bills`, vencimento correto |
| Boleto recorrente | “Internet 99 vence dia 15 todo mês” | `bills`, recorrente |
| Categoria custom | “Ração 80 na categoria Pet” | categoria Pet do usuário |
| Categoria ausente | “Compra 80” sem match | não salvar; pedir categoria |
| Cartão inexistente | “Crédito no cartão X” | não escolher cartão de outro usuário |
| Contradição | “TV em 10x recorrente” | parcelado, não recorrente |
| Retry | mesmo `request_id` duas vezes | uma única operação |
| Desfazer parcela | compra de 10x | remover/reverter as dez linhas da operação |
| Sem rede | widget offline | não salvar; apagar áudio; oferecer retry |
| Token expirado | sessão renovável | renovar e concluir uma vez |
| Sessão revogada | refresh falha | não salvar; solicitar login |

Também testar:

- cartão e categoria pertencentes a outro usuário;
- categoria personalizada com mesmo fragmento de categoria nativa;
- áudio sem fala, áudio muito longo e MIME inválido;
- Groq indisponível com sucesso no fallback OpenAI;
- ambos os provedores indisponíveis;
- app removido dos recentes;
- aparelho reiniciado;
- Android 12, 13, 14, 15 e versão mais recente suportada pela build;
- pelo menos Pixel, Samsung e Motorola;
- launcher que suporta e launcher que não suporta pinning;
- TalkBack/content description no widget.

## Critérios de aceite

O trabalho só está concluído quando:

1. app, widget e WhatsApp convergem para o mesmo parser/transcritor
   compartilhado no backend; não existem cópias concorrentes para voz;
2. o WhatsApp mantém 100% da suíte atual;
3. app e widget cobrem todos os tipos da matriz;
4. categoria personalizada e cartão são sempre limitados ao usuário;
5. retry não duplica lançamento;
6. desfazer reverte exatamente a operação, inclusive todas as parcelas;
7. widget inicia gravação na Home sem mostrar a tela principal;
8. foreground service e indicadores de microfone obedecem ao Android;
9. áudio temporário é apagado em sucesso, cancelamento, erro e timeout;
10. nenhum secret está no APK ou Git;
11. nenhum áudio/transcrição aparece em logs;
12. política de privacidade e consentimento refletem Groq/OpenAI no app/widget;
13. limitações de rede, force-stop e sessão revogada são comunicadas sem
    promessas falsas;
14. TypeScript, parser, RLS e QA de APK estão aprovados;
15. nenhuma EAS Build foi consumida sem autorização explícita do autor.

## Fora de escopo inicial

- widget para iOS;
- ativação por palavra-chave sempre ouvindo (“Ei, Grana”);
- gravação com a tela bloqueada sem interação explícita do usuário;
- funcionamento offline com qualidade Whisper;
- recorrência semanal/diária;
- múltiplos comandos financeiros em um único áudio;
- publicação na Play Store.

## Referências obrigatórias antes de implementar

- Expo SDK 57 — custom native code:
  https://docs.expo.dev/workflow/customizing/
- Expo SDK 57 — áudio:
  https://docs.expo.dev/versions/v57.0.0/sdk/audio/
- Expo — config plugins:
  https://docs.expo.dev/config-plugins/introduction/
- React Native — Headless JS Android:
  https://reactnative.dev/docs/headless-js-android
- Android — App Widgets:
  https://developer.android.com/develop/ui/views/appwidgets/overview
- Android — foreground service iniciado em background:
  https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start
- Android — declaração de foreground services:
  https://developer.android.com/develop/background-work/services/fgs/declare
- Supabase — autenticação de Edge Functions:
  https://supabase.com/docs/guides/functions/auth
- Supabase — secrets:
  https://supabase.com/docs/guides/functions/secrets
- Supabase — limites das Edge Functions:
  https://supabase.com/docs/guides/functions/limits

As páginas devem ser relidas na execução, porque Android, Expo e Supabase
mudam. Não implementar a partir de lembrança ou apenas deste documento.

## Instrução curta para o Claude

> Leia `AGENTS.md`, `context.md` e esta especificação inteira. Preserve todas
> as alterações que já estiverem no worktree. Implemente por fases e não pule
> os gates. Primeiro unifique o motor do WhatsApp sem regressão; depois crie a
> Edge Function autenticada e sua persistência idempotente; então migre a voz
> interna; por último faça o widget/foreground service Android. Não copie
> secrets para o projeto, não rode `git init`, não aplique migração destrutiva
> sem revisão e não dispare EAS Build sem autorização explícita do Gabriel na
> sessão atual. Ao terminar cada fase, rode os testes correspondentes, atualize
> `context.md`, faça `git fetch origin`, confira divergência com `origin/main`,
> commite somente o que pertence à tarefa e publique no GitHub.

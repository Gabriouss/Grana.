# Auditoria Impeccable: Grana App — Web e Mobile

| Campo | Valor |
|---|---|
| **Data** | 2026-08-29 |
| **URL local** | http://localhost:8081 |
| **Sessão** | grana-app-audit-872d955db2e9 |
| **Escopo** | Web pública e autenticada conforme acesso; mobile nativo por revisão estática e diagnósticos |

## Cobertura

| Superfície | Método | Estado |
|---|---|---|
| Web pública | QA em navegador, responsividade, teclado, axe e console | Concluído |
| Web autenticada | Revisão estática; execução bloqueada pela ausência de sessão/credenciais autorizadas | Concluído com limitação |
| Mobile nativo | Revisão de código, acessibilidade, safe areas e diagnóstico de tipos; sem emulador/dispositivo | Concluído com limitação |

## Resumo

| Severidade | Quantidade |
|---|---:|
| Crítica | 0 |
| Alta | 2 |
| Média | 7 |
| Baixa | 1 |
| **Total** | **10** |

## Prioridade recomendada

1. **ISSUE-005** — tornar o cadastro rolável e ancorado no topo quando o conteúdo exceder a altura disponível.
2. **ISSUE-003** — substituir o consentimento customizado por controle com estado/teclado válidos e links semânticos separados.
3. **ISSUE-010** — alinhar os patches do SDK 57 e validar em development build/dispositivo.
4. **ISSUE-001, 002 e 007** — fechar o ciclo de acessibilidade de erros, foco e feedback assíncrono.
5. **ISSUE-004, 006, 008 e 009** — preservar deep links, reduzir carga histórica, descrever gráficos e corrigir o contrato de design.

## Verificações executadas

- Chrome isolado: 320×568, 390×844, 844×390 e 1440×900.
- Login: axe-core com 0 violações confirmadas; foco visível por teclado; sem overflow horizontal.
- Cadastro: axe-core com 1 violação `aria-required-attr` de impacto `critical`; fluxo completo por teclado e clipping reproduzidos.
- Vitais do login local: TTFB 6,2 ms; FCP 428 ms; LCP 468 ms; CLS 0,02.
- Rotas protegidas: 6 destinos testados em sessão deslogada.
- `npx tsc --noEmit`: passou.
- `npx expo config --type public`: passou e confirmou SDK 57, orientação livre e configuração iOS/Android.
- `npx expo install --check`: falhou com 15 incompatibilidades de patch.
- `git diff --check`: passou.
- Sessão de navegador encerrada; nenhuma conta foi criada e nenhum e-mail externo foi enviado.

## Limites da auditoria

- A área autenticada não foi aberta em execução porque não havia credenciais/sessão autorizadas; os achados dessas telas são estáticos.
- Não há `adb`, Android Emulator, simulador iOS ou aparelho conectado neste ambiente. Native Tabs, teclado físico, leitores de tela nativos, Dynamic Type máximo e safe areas reais continuam como gates de dispositivo — não foram declarados como aprovados visualmente.
- `ffmpeg` não está disponível; por isso os achados interativos usam capturas por etapa e logs de estado, sem vídeo.

## Pontos aprovados

- Foco visível no web funciona e o ciclo de Tab do modal de recuperação fica preso ao diálogo enquanto aberto.
- Login e cadastro não criam overflow horizontal nas larguras testadas.
- As listas longas centrais de Lançamentos, Crédito e Boletos usam `FlatList`.
- As 7 telas autenticadas aplicam `SafeAreaView` no topo e reserva inferior centralizada por `useTabBarInset`; não foi encontrado número fixo concorrente nessas telas.
- Navegação nativa possui fallback explícito para Expo Go e usa Native Tabs apenas onde os componentes Fabric estão disponíveis.
- Movimento reduzido está centralizado em `useReducedMotion`/`AppModal` nos componentes ativos do app revisados.
- Alvos de ícone compartilhados usam `touchTarget` de 44 pt no iOS/web e 48 dp no Android, ou `hitSlop` quando a caixa visual é menor.

## Achados

### ISSUE-001: Erro do login não é anunciado nem leva o foco ao campo inválido

| Campo | Valor |
|---|---|
| **Severidade** | Média |
| **Categoria** | Acessibilidade / formulário |
| **URL** | http://localhost:8081/sign-in |
| **Vídeo** | N/A — captura estática; gravação indisponível no ambiente |

**Descrição**

Ao enviar o login vazio, a mensagem “Preencha e-mail e senha.” aparece visualmente, mas não possui `role="alert"` nem região `aria-live`; o foco continua no botão “Entrar” em vez de ir ao primeiro campo inválido. Os textos “E-mail” e “Senha” também não são elementos `label` associados, e os inputs renderizados não expõem `aria-label`/`id`. Leitores de tela podem não anunciar o erro nem o contexto correto do campo.

**Reprodução**

1. Abra `/sign-in` com a sessão deslogada.
2. Sem preencher os campos, ative “Entrar”.
3. Observe a mensagem visual abaixo da senha.
   ![Erro visível sem anúncio assistivo](screenshots/sign-in-empty-submit-mobile.png)
4. Inspeção da interface renderizada, repetida duas vezes: `role=alert: 0`, `aria-live: 0`, `label: 0`; `document.activeElement` permaneceu `BUTTON`.

---

### ISSUE-002: Modal de recuperação perde o foco ao fechar

| Campo | Valor |
|---|---|
| **Severidade** | Média |
| **Categoria** | Acessibilidade / UX |
| **URL** | http://localhost:8081/sign-in |
| **Vídeo** | N/A — `ffmpeg` não está disponível no ambiente; evidência por etapas |

**Descrição**

O modal prende o foco corretamente enquanto está aberto e fecha com `Escape`, mas não devolve o foco ao botão “Esqueci minha senha”. Após o fechamento, `document.activeElement` é `BODY`. O mesmo ocorre fechando pelo botão “Fechar”, fazendo usuários de teclado e leitores de tela perderem sua posição.

**Reprodução**

1. Ative “Esqueci minha senha” por teclado.
   ![Modal aberto](screenshots/issue-002-modal-open.png)
2. Pressione `Escape` e aguarde a animação de fechamento.
   ![Modal fechado](screenshots/issue-002-after-close.png)
3. **Observe:** o foco está em `BODY`, não no gatilho.
4. Repita pelo botão “Fechar”; o foco também termina em `BODY`.

---

### ISSUE-003: Consentimento obrigatório do cadastro tem semântica ARIA inválida e teclado não padrão

| Campo | Valor |
|---|---|
| **Severidade** | Alta |
| **Categoria** | Acessibilidade / funcional |
| **URL** | http://localhost:8081/sign-up |
| **Vídeo** | N/A — `ffmpeg` não está disponível no ambiente; evidência por etapas |

**Descrição**

O controle obrigatório de consentimento renderiza como `DIV role="checkbox"`, mas não expõe o atributo obrigatório `aria-checked`; o axe-core classifica a falha como impacto `critical`. Quando focado, `Space` — tecla padrão de checkbox — não alterna o estado e pode rolar a página; somente `Enter` alterna visualmente. Mesmo assim, a árvore acessível continua reportando `checked=false`. Além disso, “Termos de Uso” e “Política de Privacidade” são elementos genéricos com `onClick`, sem `href`, papel ou `tabindex`, e são ignorados na navegação por Tab.

**Reprodução**

1. Abra `/sign-up` e avance com `Tab` até o consentimento.
   ![Checkbox focado e desmarcado](screenshots/issue-003-checkbox-before-space.png)
2. Pressione `Space`.
   ![Checkbox continua desmarcado após Space](screenshots/issue-003-checkbox-after-space.png)
3. **Observe:** o estado não muda; o axe mantém `aria-required-attr`, e a árvore não possui `aria-checked`.
4. Pressione `Enter`; o ícone muda visualmente, mas a árvore ainda informa `checked=false`.
   ![Mudança apenas visual após Enter](screenshots/issue-003-checkbox-after-enter.png)
5. Percorra a tela por `Tab`; os dois links legais nunca recebem foco.

---

### ISSUE-004: Deep links protegidos descartam o destino e enviam para a landing page

| Campo | Valor |
|---|---|
| **Severidade** | Média |
| **Categoria** | Funcional / navegação |
| **URLs** | `/lancamentos`, `/credito`, `/contas`, `/desafios`, `/graficos`, `/perfil` |
| **Vídeo** | N/A — `ffmpeg` não está disponível no ambiente; evidência por etapas |

**Descrição**

Em sessão deslogada, todas as rotas protegidas testadas redirecionam para `/`, a landing page de marketing, em vez de `/sign-in`. O destino original também não é preservado em parâmetro de retorno. Um link compartilhado ou favorito para uma função interna perde o contexto e exige que a pessoa encontre “Entrar” e depois navegue de novo até a seção desejada.

**Reprodução**

1. Em sessão isolada e deslogada, abra `/lancamentos`.
2. **Observe:** a URL final é `/` e a landing é exibida.
   ![Landing após abrir rota protegida](screenshots/issue-004-protected-route-redirect-root.png)
3. Repita com `/contas`, `/credito`, `/desafios`, `/graficos` e `/perfil`; todas terminam em `/`.

---

### ISSUE-005: Cadastro fica cortado e o CTA sai da área alcançável em telas baixas

| Campo | Valor |
|---|---|
| **Severidade** | Alta |
| **Categoria** | Responsividade / funcional |
| **URL** | http://localhost:8081/sign-up |
| **Viewports** | 320×568 e 844×390 |
| **Vídeo** | N/A — `ffmpeg` não está disponível no ambiente; evidência por etapas |

**Descrição**

O formulário alto é centralizado dentro de uma área cuja altura permanece igual à viewport. Em 320×568, o topo do título fica cortado e o link “Já tem conta? Entrar” desaparece. Em 844×390 (paisagem), o cabeçalho inteiro e os dois CTAs ficam fora da viewport; “Criar conta” começa em `y=410` numa tela de 390 px. A página informa `scrollHeight=390`, e tentativas de rolagem não alteram `scrollY` nem o `scrollTop` dos contêineres renderizados, bloqueando o fluxo de cadastro nessa orientação.

**Reprodução**

1. Abra `/sign-up` em 320×568.
   ![Topo e navegação cortados em 320×568](screenshots/issue-005-320-initial.png)
2. Role totalmente para cima; a captura permanece idêntica.
   ![Topo continua cortado](screenshots/issue-005-320-after-scroll-up.png)
3. Repita em 844×390.
   ![CTA fora da viewport em paisagem](screenshots/issue-005-landscape-confirmed.png)
4. Tente rolar para baixo; `scrollY` e `scrollTop` continuam em `0`, e o CTA permanece com `y=410`.
   ![Rolagem não alcança o CTA](screenshots/issue-005-landscape-after-wheel-100.png)

---

### ISSUE-006: Três telas continuam baixando o histórico inteiro de lançamentos

| Campo | Valor |
|---|---|
| **Severidade** | Média |
| **Categoria** | Performance / escalabilidade |
| **Superfícies** | Início, Gráficos e Lançamentos |
| **Método** | Revisão estática |

**Descrição**

`fetchTransactions()` sem `sinceDays` faz `select('*')` de todo o histórico. A Início repete isso ao ganhar foco e após diversas mutações; Lançamentos repete ao focar, voltar ao foreground, sincronizar pendências e gerar recorrências; Gráficos carrega tudo mesmo antes da pessoa escolher período. O payload e a reconciliação crescem sem teto com o tempo de uso.

**Evidência de código**

- `app/(app)/index.tsx:285,394-396`
- `app/(app)/graficos.tsx:97`
- `app/(app)/lancamentos.tsx:127,134,145,166,181`
- `lib/data.ts:29-50`

**Recomendação**

Tratar como iniciativa própria: agregados confiáveis no banco para saldos/totais, busca por período sob demanda e paginação da lista. Não aplicar uma janela curta apenas no cliente, pois o saldo depende do histórico completo.

---

### ISSUE-007: Toasts das ações principais não são anunciados por leitor de tela

| Campo | Valor |
|---|---|
| **Severidade** | Média |
| **Categoria** | Acessibilidade / feedback |
| **Superfícies** | Início, Lançamentos, Crédito, Boletos e Perfil |
| **Método** | Revisão estática |

**Descrição**

O componente compartilhado renderiza a mensagem num `Animated.View` sem `accessibilityLiveRegion`, `role="status"`/`alert` ou chamada a `AccessibilityInfo.announceForAccessibility`. Como ele desaparece sozinho após 2 segundos, confirmações como sincronização, salvamento e alterações podem passar completamente despercebidas por usuários de leitor de tela.

**Evidência de código**

- `components/Toast.tsx:48-59`
- Usado em `app/(app)/index.tsx:1570`, `lancamentos.tsx:661`, `credito.tsx:1063`, `contas.tsx:426` e `perfil.tsx:894`.

**Recomendação**

Expor `accessibilityLiveRegion="polite"`/papel de status na web e anunciar a mensagem no nativo quando `visible` mudar, evitando duplicidade de anúncio.

---

### ISSUE-008: Linha do tempo futura depende da altura das barras para informar valores mensais

| Campo | Valor |
|---|---|
| **Severidade** | Média |
| **Categoria** | Acessibilidade / visualização de dados |
| **Superfície** | Início — comprometimento futuro |
| **Método** | Revisão estática |

**Descrição**

`FutureTimelineChart` expõe os nomes dos meses, a legenda das duas cores e apenas o total geral. Os valores mensais e a divisão entre contas recorrentes e parcelas futuras existem somente como alturas de barras. Diferente de `FlowChart` e `LineAreaChart`, não há rótulo acessível ou alternativa textual por ponto; um leitor de tela não consegue recuperar o dado principal do gráfico.

**Evidência de código**

- `components/FutureTimelineChart.tsx:40-71`
- Uso em `app/(app)/index.tsx:1068`

**Recomendação**

Adicionar um resumo acessível por mês (`“Setembro: R$ X recorrentes, R$ Y parcelas”`) ou controles equivalentes aos gráficos interativos existentes.

---

### ISSUE-009: Contrato Impeccable de tipografia contradiz a regra vigente da marca

| Campo | Valor |
|---|---|
| **Severidade** | Baixa |
| **Categoria** | Design system / manutenção |
| **Método** | Revisão estática |

**Descrição**

O topo de `.impeccable/design.json`, `DESIGN.md` e `lib/theme.ts` dizem que Neue Machina é a única fonte do produto. Porém a seção narrativa do mesmo JSON ainda diz que a fonte do sistema deve carregar leitura, controles e dados, cria a regra “Brand Is An Accent” e proíbe Neue Machina nesses papéis. `app/_layout.tsx` também mantém um comentário antigo com a mesma orientação. A interface atual está correta, mas ferramentas/assistentes guiados por esse contrato podem reintroduzir exatamente a regressão de fonte já registrada no histórico do projeto.

**Evidência de código**

- `.impeccable/design.json:95,101,113`
- `app/_layout.tsx:53-54`

**Recomendação**

Atualizar a narrativa/rules/dos/don’ts do JSON e o comentário do layout para refletirem a `The Only-Font Rule`, mantendo uma única fonte de verdade.

---

### ISSUE-010: Validação oficial do Expo acusa 15 dependências fora das versões compatíveis

| Campo | Valor |
|---|---|
| **Severidade** | Média |
| **Categoria** | Mobile nativo / compatibilidade |
| **Método** | Diagnóstico oficial `npx expo install --check` |

**Descrição**

O verificador do SDK 57 encerra com erro e lista 15 pacotes abaixo das versões esperadas, incluindo o núcleo `expo` (`57.0.13` → `~57.0.18`), `expo-router` (`57.0.13` → `~57.0.17`) e `react-native` (`0.86.2` → `0.86.3`). Também estão fora da faixa recomendada câmera, constantes, crypto, font, haptics, image-manipulator, image-picker, linking, notifications, secure-store, sharing e splash-screen. Não há falha de tipo hoje, mas a divergência amplia o risco em runtime nativo — especialmente na navegação por Native Tabs, que já possui histórico de tela branca no projeto.

**Evidência**

- `npx expo install --check`: **falhou** com “Found outdated dependencies”.
- `npx tsc --noEmit`: passou, portanto o risco é de compatibilidade/runtime e não erro de tipagem atual.

**Recomendação**

Alinhar os patches com `npx expo install --fix`, revisar o diff e repetir `tsc`, corpus de testes e validação em development build/dispositivo antes de qualquer release. Não foi executado nesta auditoria porque alteraria dependências.

---

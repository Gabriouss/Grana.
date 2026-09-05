# 004 — Dar continuidade à abertura e saída do Granachat
Base: d37bd7f • Status: TODO • Aplicativo interno Grana.
Raiz absoluta: C:/Users/user/Desktop/Aplicativo Financeiro/grana-app.
Todos os caminhos abaixo são relativos a essa raiz. Planejamento apenas.

Severidade: MEDIUM. Categorias: continuidade, acessibilidade. Escopo: components/Granachat.tsx; lib/motion.ts somente se tokens ainda ausentes. Dependência recomendada: 003.

## Problema e código atual
Granachat.tsx:333: `if (!visivel) return null;`.
Granachat.tsx:172: `flatListRef.current?.scrollToEnd({ animated: true });`.
O painel não possui saída; scroll ignora redução de movimento. Foco automático após 150ms e geometria 3:4 são decisões existentes a preservar.

## Alvo
Superfície: opacity 0→1, translateY 12→0dp, scale .97→1 em 240ms, curva cubic-bezier(0.23,1,0.32,1). Retorno inverso em 160ms. Pivô no centro inferior da janela, relacionado visualmente ao botão; sem viagem longa atravessando a tela.
Scrim: opacity 0→1 em 160ms, independente da superfície. Animar opacidade sobre a cor atual, não substituir sua opacidade final.
Modo reduzido: apenas fade 120ms; scroll sem animação. Abertura por teclado/foco assistivo: instantânea se detectar essa origem com segurança; não bloquear foco aguardando transição.
Usar Animated transform/opacity com driver nativo e tokens em lib/motion.ts. Não interpolar intensidade do BlurView.

## Passos
1. Separar desejo visivel da presença montada. Estados fechado, entrando, aberto, saindo; manter árvore durante saída.
2. Manter Animated.Values entre reversões, parar animação anterior, retomar valor atual. Callback de desmontagem exige finished e versão da transição vigente.
3. Acrescentar Animated.View apenas à superfície e ao véu. Coordenar entrada e foco automático existente: o teclado não espera 240ms; reposicionamento permanece por medidas reais, sem tween concorrente de width/height.
4. Backdrop/X/botão central fecham pelo mesmo caminho. Enquanto sai, consumir toques de fundo para não atingir tela inferior; remover interatividade e foco do conteúdo que está saindo.
5. Cancelar timers de foco e scroll quando oculto/desmontado. Auto-scroll apenas após envio próprio ou quando usuário já está a até 48dp do fim; caso esteja lendo histórico, preservar posição e oferecer acesso às novas mensagens.
6. Consultar useReducedMotion em scroll e presença. Preservar histórico, requisições, erro e confirmação do servidor.
7. Com trava/AppState inativo: encerrar movimento visual e não manter captura desnecessária; avaliar geometria ao retornar. Não mudar funcionamento da autenticação.

## Limites
Não criar indicador de digitação fictício; não atrasar resposta para parecer humana. Não alterar API do assistente ou prometer que o backend esteja publicado. Não reformular janela 3:4, cores, barra glass ou alvos nativos.
## Verificação
npx tsc --noEmit; npm run test:blur; teste de presença com relógio controlado. Abrir/fechar dez vezes, abrir durante saída, receber mensagem enquanto lê histórico, abrir teclado e girar aparelho, fonte 200%, redução de movimento ligada, bloquear/desbloquear com painel aberto.
Aceite: sem foco no painel fechado, sem duas animações de geometria competindo e sem auto-scroll tirando usuário da leitura. Validar Expo Go Android; desempenho/crash de release exigem binário físico.


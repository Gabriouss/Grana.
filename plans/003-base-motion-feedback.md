# 003 — Consolidar feedback e reduzir custo de movimento
Base: d37bd7f • Status: TODO • Aplicativo interno Grana.
Raiz absoluta: C:/Users/user/Desktop/Aplicativo Financeiro/grana-app.
Todos os caminhos abaixo são relativos a essa raiz. Planejamento apenas.

Severidade: MEDIUM. Categorias: interrupção, duração, performance. Escopo: lib/motion.ts, components/Toast.tsx, FadeIn.tsx, FutureTimelineChart.tsx e testes específicos; revisar consumidores antes de mudar API.

## Problema e código atual
Toast.tsx:53: `).start(() => onHide());`. Cleanup :55: `return () => clearTimeout(timer);`.
FadeIn.tsx:27: `Animated.timing(opacity, { toValue: 1, duration: 340, delay, useNativeDriver: true })`.
FutureTimelineChart.tsx:24: `const id = progress.addListener(({ value }) => setT(value));`.
O primeiro permite callback de saída obsoleto; os demais acrescentam espera e renderização durante leitura. Não há medição de queda de frames.

## Alvo e convenções
Expandir lib/motion.ts, sem substituir os tokens CSS da landing: UI_OUT=[0.23,1,0.32,1], UI_DRAWER=[0.32,0.72,0,1], UI_MOVE=[0.77,0,0.175,1]. Fornecer representação CSS e Easing.bezier para Animated a partir dos mesmos números.
Toast: entrada opacity 0→1 + translateY 8→0dp, 160ms UI_OUT; saída inversa 125ms UI_OUT. Manter leitura por 2000ms nesta etapa; acessibilidade e duração de anúncio devem ser avaliadas, não encurtadas. Reduzido: zero deslocamento, fade 120ms.
FadeIn em conteúdo diário: opacity 0→1, translateY 6→0dp, 180ms UI_OUT, delay 0. Nunca replay em refetch. Se houver consumidor de marketing, preservar seu comportamento com variante explícita. Conteúdo em redução de movimento: visível imediatamente.
Gráfico: valores/alturas finais imediatos; opcional fade único 160ms UI_OUT no container. Remover crescimento por setState em cada frame.

## Passos
1. Inventariar consumidores dos três componentes; adicionar tokens em lib/motion.ts sem renomear os existentes.
2. Toast: armazenar animação ativa; cancelar na substituição e cleanup. Cada exibição tem identidade própria; callback só chama onHide quando finished e identidade ainda vigente. Nova exibição retoma valores atuais, sem setValue(0) durante reversão.
3. Não vincular reinício de timer à identidade instável de onHide. Manter callback recente em ref; evento/ID de mensagem controla duração. Se precisar prop de ID para mensagens repetidas, migrar todos os consumidores.
4. Atualizar FadeIn e seu escopo interno. Não animar a lista inteira após cada edição.
5. Remover progress/listener/t do gráfico, calcular alturas finais com os mesmos dados e fórmulas.
6. Testar substituição aos 1990ms e durante saída, desmontagem, mensagem repetida, rerender sem mensagem nova e redução de movimento.

## Limites
Sem dependências novas, backend, lógica financeira, mudanças de formatação monetária ou reformulação global de navegação. Não alterar AppLockGate ou TabBlurTarget.
## Verificação
npx tsc --noEmit; npm run test:blur; testes de timers/callbacks acima. No Expo Go, substituir toasts rapidamente e atualizar dados do gráfico: último feedback permanece, números nunca contam a partir de zero. Verificar 1x e vídeo lento. Reduzir movimento durante exibição não deixa callback pendente.
Concluído quando não há callback antigo fechando mensagem nova e nenhum setState por frame no gráfico.


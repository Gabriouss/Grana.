# 007 — Tornar troca de telas e botões fluidos
Status: TODO • Base d37bd7f • Severidade MEDIUM • Escopo: app/(app)/_layout.tsx, components/AppPressable.tsx, lib/motion.ts e novo wrapper de cena se necessário.
Raiz: C:/Users/user/Desktop/Aplicativo Financeiro/grana-app.
Pedido explícito do usuário: motion na navegação e nos botões. Dependência recomendada: 003.

## Evidência
_layout.tsx:162 já anima seleção do ícone: Animated.spring(progress, com speed:16, bounciness:0). Preservar esse comportamento amortecido.
AppPressable.tsx:139 e :146 usa springs de pressão com toValue .96/1; web usa transitionDuration '150ms'. Há feedback, mas ele ainda não tem intensidade diferenciada por tamanho de alvo.
O Tabs usa freezeOnBlur, lazy e detachInactiveScreens; o blur captura exclusivamente o conteúdo de cada rota. Nunca colocar a barra dentro desse alvo.

## Receita
Troca por toque: cena de destino entra com translateX de +8dp quando avançar na ordem das abas e -8dp quando voltar, opacity .88→1, em 180ms, cubic-bezier(0.23,1,0.32,1). Fundo petróleo estático impede flash. Barra permanece fixa.
Somente destino anima; não manter duas telas financeiras interativas sobrepostas. Primeiro acesso por login/deep link não recebe deslocamento direcional.
Toque repetido na aba atual: não replay. Toque em outra durante entrada: destino mais recente prevalece imediatamente, sem fila. Teclado, redução de movimento e foco assistivo: troca imediata ou fade 120ms sem deslocamento.
Botões compactos: scale 1→.97 em 100ms ao pressionar; retorno a 1 em 160ms, mesma curva UI_OUT. Cards largos: .99; texto inline e controles de seleção: sem escala, cor/opacity de pressão. Escala aplicada à superfície, hitbox estável. Botão desabilitado não anima.
Redução: sem escala, feedback de cor/opacity imediato. Não adicionar vibração por padrão a todos os toques.

## Passos
1. Criar tokens de pressão/entrada em lib/motion.ts, preservando tokens da landing.
2. Introduzir variante opt-in de AppPressable para compact/card/static e migrar primeiro FAB e ações de formulário. Não mudar em massa todos os consumidores sem inventário.
3. Rastrear chave/índice anterior da rota no navegador; não usar estado financeiro como trigger da animação.
4. Aplicar transform/opacity ao wrapper da cena, dentro do alvo exclusivo da rota; barra e chat continuam irmãos externos. Confirmar que o alvo nativo continua com tamanho e posição corretos.
5. Reativação de rota congelada deve preparar o valor antes do frame visível. Não remontar formulário/lista para obter animação; preservar scroll, dados e efeitos.
6. Manter Animated.Value por instância, parar efeitos em cleanup, retarget sem setValue abrupto durante reversão. A seleção funcional acontece no toque, nunca no fim do timing.
7. Não animar altura/margens/blur. Não reativar NativeTabs para obter transições.

## Verificação
npx tsc --noEmit; npm run test:blur. Expo Go: index→crédito→contas→index rápido, aba atual duas vezes, deep link, lista rolada, formulário aberto, tecla voltar, fonte 200%, reduzir movimento. Apertar/arrastar dedo para fora/cancelar toque: escala sempre retorna.
Filmar antes/depois: mudança percebida em até primeiro frame disponível, estabilização em 180ms, nada fica esperando. Testar digital/background e leitura do blur durante transição.
Concluído quando os quatro critérios coexistem: movimento direcional curto, estado de tela preservado, toque cancelável, captura nativa sem autorreferência. Sem instalar dependências neste plano.


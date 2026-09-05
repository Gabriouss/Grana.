# 005 — Separar movimento da folha e do fundo
Base: d37bd7f • Status: TODO • Aplicativo interno Grana.
Raiz absoluta: C:/Users/user/Desktop/Aplicativo Financeiro/grana-app.
Todos os caminhos abaixo são relativos a essa raiz. Planejamento apenas.

Severidade: MEDIUM. Categoria: continuidade e coesão. Escopo piloto: components/AppModal.tsx, Sheet.tsx, TransactionSheet.tsx e eventual novo components/MotionSheet.tsx. Dependência: 003; linguagem visual validada em 004.

## Problema e código atual
TransactionSheet.tsx:143: `<AppModal visible={visible} animationType="slide" transparent onRequestClose={onClose}>`.
AppModal.tsx:15: `animationType={reduzirMovimento ? 'none' : animationType}`.
Sheet.tsx:108: `<Pressable style={[styles.scrim, scrimStyle]} onPress={onClose} accessible={false}>`.
Fundo e painel compartilham a animação de apresentação do Modal. Não é falha comprovada de desempenho; é uma oportunidade de separação visual. AppModal já respeita acessibilidade.

## Alvo
Piloto opt-in, sem mudar todos os modais de uma vez. Modal externo com animationType none; controlador de presença retém janela até saída terminar.
Painel sobe de translateY igual à sua altura medida até 0 em 260ms; saída em 200ms. Curva cubic-bezier(0.32,0.72,0,1).
Scrim opacity 0→1 em 160ms, curva cubic-bezier(0.23,1,0.32,1). Não mover o fundo junto.
Modo reduzido: sem translate/scale, fade 120ms. Desktop: painel flutuante centrado com scale .97→1 e opacity em 200ms UI_OUT, saída 160ms.
Native driver para transform/opacity. Preservar cor, safe area, ScrollView, foco e padding de teclado existentes.

## Passos
1. Inventariar AppModal/Sheet e criar composição opt-in para TransactionSheet, com visibilidade externa e presença interna.
2. Medir painel antes da primeira apresentação, sem flash visível e sem medida fixa por modelo de celular.
3. Animar véu e painel separadamente. Fechamento por voltar, X, scrim ou salvamento confirmado usa o mesmo controlador.
4. Proteger interrupções e callbacks obsoletos como no plano 003; quando reaberto antes do fim, inverter do ponto atual.
5. Deixar scroll/teclado com mecânica atual. Não animar paddingBottom quadro a quadro nem adicionar atraso depois do keyboardDidShow.
6. Validar piloto. Só depois migrar ItemActionSheet, WalletPickerModal e HomeCustomizerModal em lote pequeno auditado.
7. Confirmar que modal oculto não prende foco nem recebe toque; gesto do sistema de voltar continua funcionando.

## Limites
Sem gesto de arrastar para fechar nesta fase. O handle existente não autoriza nova dependência ou mudança de semântica. Não alterar modais full-screen de câmera/onboarding. Não mudar validação ou momento de persistência.
## Verificação
npx tsc --noEmit; testes de presença/limpeza, retorno rápido e abertura durante saída. Em Expo Go: teclado aberto, formulário longo, seleção de carteira, erro de validação, toque no fundo durante entrada, botão voltar repetido, fonte 200%, Android com navegação por três botões e gestos.
Gravar 1x e lento: fundo só muda opacidade, painel se move sem campos cortados. Aceite: usuário pode agir durante entrada, salvamento não depende da duração da animação, saída não deixa camada invisível bloqueando a tela.


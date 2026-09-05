# 008 — Animar gráficos com transições curtas e dados estáveis
Status: TODO • Base d37bd7f • Severidade HIGH para duração atual de FlowChart; MEDIUM para coesão.
Raiz: C:/Users/user/Desktop/Aplicativo Financeiro/grana-app.
Escopo: components/FlowChart.tsx, LineAreaChart.tsx, FutureTimelineChart.tsx; integração de chaves em app/(app)/index.tsx e graficos.tsx. Dependência: 003. Pedido explícito do usuário: motion em gráficos.

## Evidência
FlowChart.tsx:197: const id = progress.addListener(({ value }) => setT(value));
FlowChart.tsx:212–217: Animated.timing(progress, { toValue: 1, duration: 4000, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
A assinatura dos pontos/período reinicia esse efeito. Marcadores têm opacity dependente de t>0.9.
FutureTimelineChart.tsx:34 anima alturas durante 700ms via listener/setT.
LineAreaChart.tsx:116 gera caminhoReto(pontos); seleção e resumo usam selectedIndex.
Quatro segundos é tempo longo para uma ação cotidiana. Há render por frame no caminho JS; não foi medido engasgo físico.

## Receita — primeira entrega
Entrada inicial do desenho: opacity 0→1 em 240ms UI_OUT=cubic-bezier(0.23,1,0.32,1), sem deslocar escala/eixos. Desenho completo pronto desde o início.
Troca de período/carteira/tipo: transição do gráfico completo em 200ms; saída do conjunto antigo 80ms, troca de geometria e eixos como unidade, entrada 120ms UI_OUT. Não cruzar eixos antigos com valores novos. Não segurar requisição por causa da animação.
Resumo numérico é sempre o dado confirmado do período indicado; nunca contar de zero. Durante carregamento, manter indicação clara do conjunto exibido e estado de carregamento; não rotular dados antigos como período novo.
Seleção de ponto: marcador .97→1 + fade 125ms UI_OUT; tooltip opacity 125ms, valor final imediato. Ao arrastar/selecionar rapidamente, feedback acompanha o ponto sem fila.
Reduzido: geometria e seleção imediatas; opcional fade 120ms sem escala.

## Passos
1. Remover timer 4000ms e listener/setT de FlowChart; preservar cálculo dos pontos, formato, interação e privacidade.
2. Adotar wrapper Animated opacity com driver nativo para o conjunto visual. Reservar tamanho para evitar saltos.
3. Definir identidade de conjunto a partir de período + carteira + modo + dados confirmados; rerender irrelevante não reinicia animação. Última resposta válida vence, sem regressão de concorrência de fetch.
4. Aplicar a mesma política a LineAreaChart e FutureTimelineChart. O plano 003 remove o crescimento por frame do último; este plano acrescenta transição coerente.
5. Garantir que tooltip/seleção não fique ligado a índice inválido após troca de conjunto. Leitor de tela anuncia somente estado final relevante.
6. Em respostas rápidas sucessivas, cancelar saída/entrada antiga e renderizar último conjunto; não formar fila de animações.

## Etapa opcional posterior
Morph real entre linhas apenas quando número de pontos, semântica e escala permitirem correspondência válida. Exige prova de desempenho de animação SVG fora de setState por frame e revisão de dependência, não é requisito para concluir a primeira entrega. Sem morph entre meses e anos com topologias diferentes.
Não usar scaleY que deforme texto, círculos e espessura do traço. Sem contagem monetária, paralaxe ou loops de gráfico.

## Verificação
npx tsc --noEmit; testes existentes de cálculos/gráficos e suíte parser se cálculos forem tocados (idealmente não serão).
Expo Go: alternar mês/7dias/ano cinco vezes, dados vazios, um ponto, valores iguais, valores altos, valores ocultos, erro/rede lenta, selecionar durante transição, fonte grande e reduzir movimento.
Aceite: desenho estabiliza em até 240ms após dados prontos, números corretos imediatamente, sem render React por frame no wrapper, sem mistura de eixos e datasets, seletores respondem durante transição. Medir em Android intermediário antes de release.


# 002 — Direção e roteiro de motion para o Grana
Status: PLANEJADO • Base: d37bd7f • Data: 05/09/2026
Escopo: aplicativo autenticado. Documento de planejamento; nenhuma animação implementada nesta etapa.

## Direção
O Grana deve responder com precisão ao toque, preservar a posição das coisas e confirmar cada operação com clareza. Personalidade: calma, tátil, com pequenos sinais de personalidade no Granabô. O petróleo, a menta e o vidro já estabelecem profundidade; o movimento deve explicar a interação.

Três momentos definem a proposta:
1. A janela do Granabô surge com um deslocamento curto relacionado ao botão e retorna pelo mesmo caminho.
2. A folha de lançamento sobe como uma superfície independente; o fundo escurece sem deslizar junto.
3. Ao usar voz, a interface distingue escuta, processamento e resultado real sem sugerir que uma transcrição já é um lançamento salvo.

## Evidência e limites
Auditoria estática dos componentes e da captura fornecida pelo usuário. Não houve medição de frames nem reprodução física nesta etapa. As frequências abaixo são hipóteses de uso, não analytics.
Expo ~57.0.18, React Native 0.86.3, React 19.2.3; Animated e CSS existentes. Reanimated não está instalado. Manter a arquitetura de blur corrigida: alvos das telas separados da barra, suspensão com bloqueio/AppState. Motion não exige animar intensidade do blur.

## Achados confirmados, por retorno esperado
| Prioridade | Grau | Categoria | Local | Evidência / implicação | Plano |
|---|---|---|---|---|---|
| P1 | MEDIUM | Interrupção | components/Toast.tsx:41–55 | Cleanup limpa timer, mas não as animações; callback final chama onHide sem verificar finished. Nova mensagem pode disputar com saída anterior. | 003 |
| P1 | MEDIUM | Continuidade | components/Granachat.tsx:333 | if (!visivel) return null elimina a superfície imediatamente; não há fase de saída. | 004 |
| P1 | MEDIUM | Acessibilidade | components/Granachat.tsx:172 | scrollToEnd({ animated: true }) não consulta redução de movimento e acompanha qualquer aumento de mensagens. | 004 |
| P1 | MEDIUM | Coesão | components/AppModal.tsx:15 e components/Sheet.tsx:108 | Modal recebe slide, Sheet contém scrim e painel juntos. A composição não permite dar ritmos separados ao fundo e ao painel. Proposta de refinamento, não crash confirmado. | 005 |
| P2 | MEDIUM | Duração | components/FadeIn.tsx:27 | Entrada 340ms + delay e deslocamento 14dp; excede o orçamento proposto para conteúdo cotidiano. | 003 |
| P2 | MEDIUM | Performance | components/FutureTimelineChart.tsx:24–34 | Listener chama setT por frame durante 700ms, animando alturas. Existe custo de render por frame; engasgo não foi medido. | 003 |
| P2 | LOW | Estado | components/VoiceEntryButton.tsx:170–193 | Estados já têm texto, ícone e spinner; transição localizada pode fortalecer a leitura sem mudar gravação/transcrição. | 006 |

## Oportunidades que passam pelo filtro
| Superfície | Propósito | Frequência estimada | Receita proposta | Por que ajuda / redução |
|---|---|---|---|---|
| Granachat | Continuidade espacial | Ocasional | opacity 0→1, translateY 12→0dp, scale .97→1, 240ms; saída 160ms invertida | Relaciona janela e acionador; modo reduzido só fade 120ms |
| Folhas de edição | Continuidade espacial | Ocasional | Painel translateY altura medida→0, 260ms; saída 200ms; scrim fade 160ms | Fundo permanece fixo; reduzido só fade 120ms |
| Confirmação / toast | Feedback | Dezenas/dia | opacity e translateY 8→0dp em 160ms; saída 125ms | Curto e sem bloquear; reduzido sem deslocamento |
| Voz | Indicação de estado | Ocasional | Troca de ícone por fade 125ms; borda de escuta opacity .55↔1 em 900ms por trecho | Estado de gravação real; reduzido usa indicador estático, texto permanece |
| Organização da Home | Continuidade espacial | Rara, modo editar | Futuro: preview segue dedo; assentamento 200ms, sem quique, curva drawer | Ajuda a prever destino; preservar troca direta entre dois cards |
| Meta atingida | Confirmação rara | Rara | Futuro: selo .97→1 + fade 200ms, uma vez após confirmação | Marca conquista; sem loop/confete sobre dados, reduzido fade 120ms |

Curva de entrada/saída: cubic-bezier(0.23,1,0.32,1).
Curva das folhas e assentamento: cubic-bezier(0.32,0.72,0,1).
Movimento entre estados visíveis, quando necessário: cubic-bezier(0.77,0,0.175,1).
Os números são propostas de design para validar em aparelho, não resultados de benchmark.

## O que preservar ou rejeitar
- Barra de abas: preservar spring com bounciness: 0 em app/(app)/_layout.tsx:162. Pelo pedido explícito posterior, adicionar entrada direcional curta de 8dp/180ms somente à cena (plano 007), sem mover a barra ou atrasar navegação.
- Valores monetários: rejeitar contagem de zero até o saldo. Exibir imediatamente o valor verdadeiro, inclusive em acessibilidade.
- Gráficos: rejeitar desenho teatral repetido, paralaxe e números em movimento durante leitura.
- Glass: rejeitar pulso de blur, brilho percorrendo a barra e captura de árvore que contenha a própria barra. Custo contínuo sem feedback útil.
- Granabô em repouso: rejeitar respiração infinita do botão. Não compete com leitura de saldos.
- WidgetGrid: respeitar decisão de trocar dois cards; não converter para inserção que desloca os intermediários. O arraste atual é deliberadamente restrito à web com mais de uma coluna (components/WidgetGrid.tsx:58); a proposta futura se limita a esse ambiente. Arraste nativo fica fora do escopo.
- Atalhos por teclado: resposta imediata, sem aguardar coreografia. Preservar foco visível.

## Sequência de entrega
1. **003 — Base e feedback:** tokens internos, interrupções de toast, redução das entradas e custo de gráfico. Ganho transversal. Esforço relativo M.
2. **004 — Granachat:** primeiro momento expressivo para aprovar a linguagem. Esforço M.
3. **005 — Folhas:** piloto em TransactionSheet, expandir após validação. Esforço G pela abrangência.
4. **006 — Voz:** feedback localizado; gravação e persistência intactas. Esforço P/M.
5. **Fase posterior:** gesto de organização e celebração de meta. Exigem auditoria específica e plano próprio; não estão prontos para implementação neste pacote.

Mínimo recomendado: 003 + 004 + piloto 005. Não tratar todas as telas como uma grande substituição de animações. Cada etapa deve poder ser revertida separadamente.

## Plataforma e custo
Primeiras quatro etapas usam Animated com transform/opacity e driver nativo, e CSS no caminho web quando já adotado pelo projeto. Não instalar dependências para fades ou janelas simples.
Para o gesto futuro de widgets, avaliar Reanimated e Gesture Handler em prova isolada. Expo SDK57 documenta Reanimated incluído no Expo Go, instalação via expo install de reanimated + worklets; conferir versão efetivamente instalada antes de adotar. Não presumir que o APK existente incorpora uma dependência recém-adicionada.
Fontes: [Expo SDK57](https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/), [Animated RN](https://reactnative.dev/docs/animations). As especificações de timing deste plano são decisões de design.

## Critérios de aceite
- Interação funcional responde imediatamente; nunca esperar animação para disparar ação.
- Abrir/fechar dez vezes rapidamente: sem saltar ao início, callbacks antigos, estado preso ou clique vazando.
- Respeitar reduzir movimento desde a inicialização; enquanto preferência é desconhecida, não disparar deslocamento decorativo. Não alterar a política global de outros componentes sem inventário.
- Preservar foco, leitura por TalkBack/VoiceOver, tamanho de toque e rótulos de busy/erro.
- Teclado aberto, fonte 200%, rotação e tela pequena: campo e ações acessíveis.
- Bloqueio/digital, cancelamento e retomada com chat aberto: sem crash e sem exposição sob a trava.
- Medir em Android intermediário: meta de 60fps, orçamento ~16,7ms/frame; medir 120Hz se disponível (~8,3ms). Registrar aparelho e taxa de quadros; não prometer resultado com base na web.
- Capturar antes/depois do mesmo percurso, 1x e reprodução lenta; sem dados financeiros reais em material compartilhado.
- Expo Go é ambiente de prévia; validar o binário Android antes de release. Nenhum EAS build automático.

## Atualização de escopo — quatro pilares pedidos pelo usuário
Granachat, troca de telas, botões e gráficos são entregas explícitas, não opcionais.
Ordem atual: 003 (base) → 004 (Granachat) → 007 (telas e botões) → 008 (gráficos) → 005 (folhas) → 006 (voz).
O mínimo recomendado passa a incluir 003, 004, 007 e 008; folhas e voz completam a linguagem depois.
Descoberta adicional confirmada: FlowChart.tsx:214 usa duration:4000 e listener setT por frame (:197). Prioridade alta de duração, sem alegar queda de FPS medida. Plano 008 substitui por transições de até 240ms e preserva dados finais corretos.
A restrição a animações decorativas em dados continua: o movimento solicitado é transição entre estados e feedback de seleção, não falsificação/interpolação dos valores monetários.
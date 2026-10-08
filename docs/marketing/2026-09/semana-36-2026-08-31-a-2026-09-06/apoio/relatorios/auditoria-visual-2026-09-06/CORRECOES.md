# Correções aplicadas em 06/09/2026

Implementação autorizada após a auditoria. O relatório original permanece como registro do estado anterior.

## Entregue

- V01: valores do mock financeiro derivados de uma única estrutura; total R$ 1.260,00 e diário R$ 84,00.
- V02: detalhes dentro de Modal de viewport, mantendo o Sheet compartilhado; botão visível de fechar com 44px e Escape.
- V03: oferta e CTA antes do checklist no mobile; borda separadora acompanha a nova ordem.
- V04: menu no cabeçalho também no desktop; removido o botão fixo sobre os cards.
- V05: detalhes e pílulas do carrossel têm 44px de altura real. Card compacto aumentado para acomodar o alvo sem recortar conteúdo. Entrar já tinha hitSlop; não precisou alteração.
- V06: introdução do Granabô resumida, mantendo explicação de consulta aos dados e rótulo de conversa de exemplo.
- V07: título do hero mais específico e texto de apoio mais curto. Estilo de CTA existente preservado; teste de CTA preenchido não aplicado.
- V08: link descritivo para abrir a captura em tamanho completo numa nova aba. Não inclui recorte ampliado automático no mobile.
- V09/V17: retirados balões sobre a captura; legendas estáticas abaixo indicam coluna esquerda/gráfico central. A moldura preserva inclinação no desktop e sua lógica de movimento reduzido/pausa fora de vista.
- V10 parcial: carrossel começa em Desafios, coerente com o argumento de hábito. Os cinco seletores 3+2 permanecem; reorganização completa da seção não aplicada.
- V12: bento depende apenas da largura, inclusive sob movimento reduzido.
- V13: trilha anuncia voz dentro do app, reconciliando a copy com a decisão documentada. Não altera nem certifica a integração WhatsApp.
- V18: fechamento mais curto, com preço mensal e condições confirmadas próximos da ação.
- V20: removidos efeito, estado e renderização do caminho sticky inalcançável.

## Validação

- TypeScript sem erros após correção das props da moldura.
- 339/339 verificações existentes do design system passaram.
- Exportação Expo web concluída; nenhum build EAS.
- Navegador: oferta e CTA visíveis juntos em 390×844; modal com scrim 390×844; nove detalhes abrem e têm fechamento em 320px; grade presente em 1440px com movimento reduzido.
- Medidas de largura do documento correspondem à viewport em 320/390/768/1100/1280/1440px na seção de benefícios.
- Capturas de revisão geradas no diretório de trabalho: grana-preco-corrigido.png, grana-detalhe-corrigido.png, grana-painel-corrigido.png e grana-hero-corrigido.png. Evidências originais da auditoria permanecem nesta pasta.

## Melhorias ainda não implementadas

V11 (nova arte da tela do notebook), V14 (reescrita ampla dos nove benefícios), V15 (tratamento da grade), V16 (reorganização comercial do FAQ) e V19 (experimentos de compressão/medição em produção) permanecem propostas, não defeitos declarados como resolvidos. Também permanecem validação em Safari/aparelho real/zoom 200%, teste completo com leitor de tela e confirmação das condições de cancelamento. Não foram inventadas políticas ou estimativas de ganho de conversão.

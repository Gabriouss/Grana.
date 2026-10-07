# Card de exemplo: lançar por voz pelo widget (26/09/2026)

É um card único de feed, em 1080×1440, pedido pelo autor como exemplo com o conteúdo do `FUNIL.md`. Não usou nenhum crédito da ElevenLabs.

- **H1:** "Se anotar depende de lembrar, você perde o momento." É o gancho do R3 no funil.
- **H2:** "Toque no widget e fale o gasto. O Grana. lança sem abrir o app." Adaptado da descrição real do widget, em `modules/grana-voice-widget/.../strings.xml`.
- **Produto:** o mockup real `design-system/marketing-mockups/celular-vazio.png`, recortado e inclinado. A tela é a tela inicial do Android com dois elementos que o funil (seção 8) permite recriar em HTML, com textos e cores tirados do código:
  - o widget "Lançar por voz";
  - a notificação "Pão na padaria · R$ 3,57".

  Os ícones de app são genéricos, sem marca.
- **Fica de fora de propósito:** o widget "Livre para gastar", porque o valor dele depende da regra 20 e da build nova (portão do dia D). Também não há botão publicitário nem preço.
- **Para regenerar:** abra `card.html` no Chromium com a janela em 1080×1440 e fotografe. Os caminhos apontam para os assets do repositório.

## Comparação com a ElevenLabs (26/09/2026)

O mesmo card foi gerado no GPT Image 2, pela ElevenLabs, com o logotipo oficial ligado como referência. Custou ≈ 1.860 créditos.

- **Acertou:** os textos, com todos os acentos, e o logotipo, que saiu próximo do oficial.
- **Errou:**
  - a fonte do título, que saiu grotesca genérica em vez da Neue Machina;
  - o ícone da notificação, um "G" comum em vez do "G." do Grana.;
  - o tamanho do widget;
  - o arco de baixo, que saiu cheio em vez de uma linha fina.

**Decisão do autor:** prefere a versão local, feita em HTML com os assets oficiais. A geração por IA fica só como referência de direção de arte, o que está de acordo com a regra do funil que proíbe logotipo, texto e tela desenhados por IA em peça publicada.

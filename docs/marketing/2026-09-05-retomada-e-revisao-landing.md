# Retomada e revisão da landing do Grana.

Data: 05/09/2026. Base recebida: `09c822d`. Escopo: concluir o plano do Claude e revisar o resultado, sem redesenhar a página inteira.

## Onde o Claude parou

Os registros fornecidos pelo autor e o histórico local concordam:

- `7c8a7a5`: nove categorias de benefícios, Granachat e Widgets em destaque, seção própria do Granachat, widgets como quinto pilar do hábito, CTAs de compra e texto da tela Assinar.
- `09c822d`: cinco capturas mobile 390×844 atualizadas, com correções de cabeçalho, carteira, resumo e props de acessibilidade que vazavam para o DOM.
- Interrupção: item D, captura desktop. A sessão `granaweb` ficou em branco ao abrir o login, antes de gerar a nova imagem.

O plano completo estava em `.claude/plans/mete-marcha-num-plano-ticklish-waffle.md` fora do repositório. Seu escopo excluía arte do mascote, novas seções do plano Dinzo, reativação do WhatsApp e builds EAS. Esses limites foram preservados.

## Conclusão do trabalho

| Item | Resultado |
|---|---|
| A — Nove cards por categoria | Implementação do Claude preservada; conferida em 390, 1060 e 1440px |
| B — Seção Granachat | Demo clicável confirmada e refinada na revisão |
| C — Widgets no hábito | Implementação do Claude preservada |
| D — Prints | Cinco mobile do Claude preservados; `inicio-web.png` recapturada em 1440×900 |
| F — Checkout no código | Dois links locais de compra levam à Kiwify; preço do checkout confirmado em R$ 9,90/mês |
| F — Configuração publicada | Pendente na Vercel: ambos os links públicos de compra ainda vão para `/sign-up` |

Captura desktop: conta de demonstração, modo Dados de exemplo ligado pelo Perfil, navegação exclusivamente pela UI e badge de exemplo ocultada somente no DOM. Sem alteração dos dados financeiros ou do modo demo no código. Não houve overlay de erro; console da sessão trouxe apenas aviso de fallback do Animated no navegador.

Os títulos de Livre para Gastar e Comprometimento futuro ficaram em y=245 na captura de 900px de altura. Os balões passaram para 33% da moldura, considerando também a barra de navegador. Conferência visual: os dois acompanham a primeira linha de cards; em compacto os balões continuam ocultos.

## Revisão e melhorias aplicadas

1. **Balões desatualizados:** o Comprometimento futuro em 58% acompanhava outra região da captura. Reposicionado junto à linha correta.
2. **Conta inconsistente na demo:** R$ 623,40 / R$ 48,23 não correspondia a um número inteiro de dias. Exemplo agora explicita R$ 624,00 / 13 dias = R$ 48,00 por dia.
3. **Demo confundida com consulta real:** cabeçalho visível “Conversa de exemplo”; estado de processamento cita os dados de exemplo. A área continua com papel de log e anúncio acessível.
4. **Promessa absoluta de IA:** “Ele nunca inventa um valor” substituído pela descrição do uso dos dados registrados e do pedido de esclarecimento de categoria.
5. **Preço divergente:** `COPY_LANDING_GRANABO.md` alinhado a R$ 9,90, coincidente com landing, tela Assinar e checkout real.
6. **Condição comercial não confirmada:** removido “Cancele quando quiser” da landing. Os termos do projeto remetem às condições do parceiro; o checkout aberto não esclareceu o procedimento de cancelamento. Preservadas mensalidade e ausência de teste. Não alterados os termos jurídicos.
7. **SEO/share anunciando canal desligado:** `landing-meta.json` atualizado para voz/nota fiscal e Granabô dentro do app. Hash exato do JSON-LD atualizado na CSP, sem flexibilizar a política.
8. **Cache de capturas:** seis URLs recebem `?v=20260905`, pois os arquivos substituídos mantêm os nomes e a hospedagem configura cache prolongado para `/telas/`.

## QA realizada

- 390×844: carrossel 1 de 9, próximo recurso funciona; demo recebe pergunta e devolve resposta corrigida; painel web cabe sem balões; documento sem overflow horizontal.
- 1060×900: carrossel mantém contador (2 de 9 após interação), cards inteiros e documento sem overflow horizontal.
- 1440×900: bento com cards amplos e composição desktop do painel conferidos.
- TypeScript: aprovado.
- `npm run test:parser`: aprovado, incluindo 339/339 guardas de design system e 39/39 verificações de sincronia.
- Console da landing: sem erro React, com aviso de depreciação de `props.pointerEvents` preexistente.
- Não foi executado pagamento, nem simulado webhook de compra em produção. Não houve build EAS.

## Pendência operacional: Vercel

Verificado diretamente em `https://www.granaponto.com.br/`: os dois botões Assinar apontam para `/sign-up`, embora o código de compra já esteja publicado. Em localhost os mesmos botões apontam para `https://pay.kiwify.com.br/GLhaFCy`, que abriu e mostrou R$ 9,90/mês.

Isso é compatível com ausência da variável no bundle publicado. Não foi possível inspecionar o painel de ambiente da Vercel nesta sessão; não há conector, CLI autenticada ou projeto local vinculado disponível.

No projeto Vercel responsável pelo domínio, configurar `EXPO_PUBLIC_KIWIFY_CHECKOUT_URL` com a URL de checkout acima no ambiente Production e refazer o deploy. O Expo incorpora variáveis públicas durante a exportação, portanto apenas salvar a variável não atualiza o bundle existente. Depois, conferir os dois CTAs no domínio publicado. Validação de pagamento → webhook → acesso exige um fluxo de teste controlado, não uma compra automática nesta revisão.

## Melhorias recomendadas para a próxima rodada

- **P2 — Detalhes de benefícios no celular:** o limite de três linhas/300px é uma decisão documentada para manter a seção compacta. Com textos maiores, esconde parte das ferramentas. Avaliar “Ver detalhes” acessível ou resumos mobile próprios; não remover a restrição sem validar a altura da seção.
- **P2 — Procedimento comercial claro:** após confirmação da operação, explicar renovação, cancelamento e duração do acesso na FAQ e alinhar termos/checkout. Não inventar condições.
- **P3 — Capturas reproduzíveis:** automatizar sessão de demonstração e checagens de viewport/badge/erros, sem guardar credenciais no repositório. Evita novo envelhecimento das seis imagens.
- **P3 — Limpar o aviso de pointerEvents:** rastrear o componente emissor antes de uma alteração transversal; não impede a captura ou compra.

Nota de reconciliação: `conquistas-web.webp` foi substituída por `inicio-web.png` em 04/09 e não tem consumidor atual. Sua recaptura ainda aparece em trechos históricos do plano Dinzo, mas não é pendência desta landing.

Validação final de empacotamento: 
- Exportação web concluída com sucesso (
px expo export --platform web).
- Injeção de metadados/JSON-LD passou com validação do hash CSP.
- Seis imagens versionadas carregadas no navegador; painel também conferido em 1060px, sem overflow horizontal.

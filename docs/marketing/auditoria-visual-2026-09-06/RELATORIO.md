# Auditoria visual da página de vendas do Grana.

Data: 06/09/2026. Base local: `be9fc82`. Escopo: landing pública, composição, hierarquia, responsividade, demonstrações, navegação e acessibilidade visual. **Nenhum componente da página foi alterado nesta auditoria.**

## Diagnóstico

A identidade já é reconhecível: petróleo e menta, tipografia própria, superfícies discretas e capturas reais do produto. O próximo salto de qualidade depende mais de clareza e composição do que de adicionar efeitos. No celular, explicações longas antecedem demonstrações e preço; no desktop, a navegação flutuante cobre partes dos cards. Há também defeitos objetivos no exemplo financeiro e na apresentação dos detalhes de benefícios.

Recomendação: corrigir os defeitos de confiança e interação primeiro; depois antecipar a prova do produto e a oferta mensal; por último refinar motion e acabamento. Não há evidência nesta auditoria para estimar aumento de conversão.

## Método e limites

- Navegador Chromium automatizado, `http://localhost:8081`, Expo em desenvolvimento. Inspeção visual e DOM cruzados com o código. Não é uma certificação da versão publicada.
- Celular 390×844: todas as seções principais, menu, detalhes, resposta do chat, FAQ, fechamento e rodapé.
- Desktop 1440×900: hero, chat, hábitos, painel, benefícios, preço e FAQ.
- Amostras de benefícios em 320×900, 768×900, 1100×900 e 1280×900. Estes tamanhos adicionais não equivalem a uma revisão integral de todas as seções.
- Movimento reduzido em 1440×900. Menu e detalhes fechados com Escape; FAQ de assinatura aberto; pergunta “Quanto posso gastar?” executada com resposta de exemplo.
- Capturas de seção aguardaram cerca de 1 segundo após o scroll para não confundir entrada animada com contraste final. São recortes de viewport, não imagens da seção inteira. O indicador de desenvolvimento do Expo não integra o produto.
- Não foram executados Lighthouse, testes de rede móvel, Safari/iOS, aparelho físico, leitor de tela completo, zoom 200% ou compras. Medidas de tamanho de arquivos são de disco, não tempos de carregamento.
- Referência auxiliar: [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), consultada em 06/09/2026, especialmente foco, movimento reduzido, imagens e alternativas a gestos. As decisões abaixo também usam observação direta; as regras de linguagem da marca prevalecem sobre convenções em inglês desse guia.

## Estado atualizado, sem repetir pendências resolvidas

O `context.md` registra a inclusão de “Ver detalhes” e a confirmação do checkout Kiwify em produção. Portanto, “não existe acesso ao texto completo” e “checkout ainda leva ao cadastro” não são pendências desta auditoria. O primeiro foi retestado: existe, mas sua montagem visual merece correção (V02). O checkout não foi reaberto nesta rodada. A política detalhada de cancelamento continua dependendo de confirmação comercial; não inventar condições.

## Prioridades

P1 = corrigir antes da próxima rodada de aquisição/divulgação; P2 = melhoria importante de experiência; P3 = refinamento ou manutenção. Esforço P/M/G é estimativa relativa, não compromisso de prazo.

| ID | Prioridade | Natureza | Achado | Esforço |
|---|---|---|---|---|
| V01 | P1 | Defeito confirmado | Conta do Livre para Gastar não fecha | P |
| V02 | P1 | Defeito confirmado | Detalhes montados no fluxo da seção, sem fechamento visível | M |
| V03 | P1 | Hierarquia | Preço mensal e assinatura chegam tarde dentro da própria seção | P |
| V04 | P2 | Defeito visual | “Explorar” cobre informação dos cards no desktop | M |
| V05 | P2 | Usabilidade | Alvos de toque pequenos em detalhes e seletores de telas | P |
| V06 | P2 | Composição | Demonstração do chat abaixo de explicação longa | M |
| V07 | P2 | Posicionamento visual | Hero genérico e CTA primário com menos massa de cor que Entrar | M |
| V08 | P2 | Legibilidade | Captura desktop pequena demais para comunicar detalhes no celular | M |
| V09 | P2 | Precisão visual | Balão de comprometimento sobre área de cofrinhos | P |
| V10 | P2 | Narrativa | Hábitos ocupa 1.706px no celular; prova de hábito não é a tela inicial | M |
| V11 | P2 | Consistência | Notebook do hero e capturas internas mostram estados diferentes | M |
| V12 | P2 | Acessibilidade/motion | Preferência de movimento muda o layout de benefícios | P |
| V13 | P2 | Consistência de conteúdo | Trilha ainda anuncia WhatsApp | P + confirmação |
| V14 | P3 | Densidade | Bento tem muita explicação de implementação | M |
| V15 | P3 | Acabamento | Grade decorativa compete com miniaturas e bordas | P |
| V16 | P3 | Hierarquia | FAQ/segurança repetem objeções; FAQ ocupa 1.215px | M |
| V17 | P3 | Motion | Flutuação independente dos balões dificulta associação espacial | M |
| V18 | P3 | Conversão visual | Fechamento repete introdução sem recuperar preço | P |
| V19 | P3 | Entrega visual | Otimização de imagens deve preservar leitura de números | M |
| V20 | P3 | Manutenção | Condição do modo sticky de benefícios é inalcançável | P |

## Achados detalhados

### V01 — Exemplo financeiro inconsistente

**Fonte:** `components/CardLivreParaGastar.tsx:27`, `:33`, `:36`. [Evidência](390-livre.png).

O card mostra saldo 3.240, contas 1.180 e cofrinhos 800, mas total livre 1.269 e diário 84,60. A subtração resulta em **1.260**, e 1.260 ÷ 15 resulta em **84,00**. O diário atual é coerente com o total errado, não com as parcelas do exemplo. Isso enfraquece justamente a prova do cálculo financeiro.

**Proposta:** manter os três valores de entrada e corrigir total/diário para R$ 1.260,00/R$ 84,00. Preferir uma única estrutura de dados fictícios que derive total e diário. **Aceite:** parcelas, total, dias e diário fecham em todas as versões do mock; número não é alterado isoladamente numa captura. Não envolve mudar a fórmula real do aplicativo.

### V02 — “Ver detalhes” parece uma folha, mas está dentro da seção

**Fonte:** `components/BeneficiosHorizontais.tsx:332` (bloco `detalheAberto`); `components/Sheet.tsx:100` e estilo `scrim`. [Evidência](390-detalhes.png).

O `Sheet` é montado diretamente no container de benefícios, sem um `Modal`/portal externo. O fundo medido tem posição `relative`, x=32, y≈509, largura=326, altura≈335 em viewport 390×844. Não cobre a viewport. O painel ocupa apenas a parte inferior, texto exige rolagem interna e o restante da página continua visualmente exposto. O conteúdo existe e Escape fecha, mas não há botão visível de fechar. Isso não é “texto perdido”; é um problema de apresentação modal e descoberta da saída.

**Proposta:** hospedar esta instância em um modal/portal de viewport, com scrim cobrindo toda a tela, título associado, fechamento visível de pelo menos 44×44px e rolagem interna. Preservar restauração de foco e Escape. Não mudar o Sheet compartilhado sem revisar os demais consumidores.

**Aceite:** abrir os nove detalhes em 320/390/768px; fundo bloqueado, texto inteiro alcançável, fechamento por botão/Escape/fundo, foco retorna ao acionador. O diálogo não desloca a seção nem aparece limitado à largura do card.

### V03 — A oferta mensal deveria aparecer antes do checklist no celular

**Fonte:** `app/index.tsx:1344`, `:1377`, `:1399`; `precoColunas` em `:1954`. [Celular](390-precos.png), [desktop](1440-precos.png).

A seção mede 1.291px em 390px. Seu início mostra preço diário, explicação e uma lista longa; R$ 9,90/mês e o CTA ainda não aparecem na captura de 844px. No desktop o layout lado a lado comunica a oferta bem. É uma questão de ordem responsiva, não falta de informação.

**Proposta:** em telas estreitas, mostrar plano, preço mensal, condições e CTA antes do checklist. Tratar valor diário como apoio. Manter a composição de duas colunas no desktop. **Aceite:** ao navegar para Preços em 390×844, mensalidade e CTA aparecem juntos sem scroll adicional. Não prometer teste ou cancelamento não confirmado.

### V04 — Navegação flutuante sobre informação

**Fonte:** `components/NavFlutuanteLanding.tsx:150`. [Benefícios](1440-beneficios.png), [hábitos](1440-habitos.png), [1280px](1280-beneficios.png).

“Explorar” é fixo no canto inferior direito e intercepta visualmente o card de Contas e a descrição de Widgets nos enquadramentos capturados. A informação pode ser recuperada rolando, mas o controle compete com o conteúdo durante a leitura.

**Proposta:** preferir navegação no cabeçalho desktop ou uma margem externa reservada em larguras que comportem isso. Apenas diminuir o botão não elimina a sobreposição. **Aceite:** nenhum controle fixo cobre texto/CTA/foco em 1280 e 1440px, inclusive no fim de seções longas.

### V05 — Aumentar áreas de toque sem engordar os ícones

**Fonte:** `components/BeneficiosHorizontais.tsx:463`; `components/CarrosselTelasApp.tsx:41`, `:111`, `:137`.

Medidas do DOM em 390px: “Ver detalhes” 95×20px, pílulas de telas com 29px de altura, Entrar 90×36px. Os dois primeiros não recebem `hitSlop` nessas instâncias. A ação de detalhes fica especialmente pequena para uma saída necessária ao texto truncado. As setas dos benefícios já têm 44px: preservar.

**Proposta:** área real de toque de 44px como meta de conforto web mobile; manter tipografia e ícone menores dentro dela. Rever o espaço entre pílulas para evitar sobreposição de hit areas. **Aceite:** medir caixa clicável e testar toque nas bordas, não apenas aumentar a aparência. Estas medidas isoladas não constituem uma declaração de reprovação WCAG: critérios de espaçamento e exceções requerem análise própria.

### V06 — Demonstrar o Granabô antes de explicar tanto

**Fonte:** `app/index.tsx:1154`; `components/ConversaGranachat.tsx:193`. [Celular](390-granachat.png), [desktop](1440-granachat.png), [resposta](390-chat-resposta.png).

Em 390px a seção mede 1.126px. Dois parágrafos empurram os chips de interação para além da primeira viewport. No desktop, o corpo de chat tem 250px fixos e bastante vazio no estado inicial. A altura fixa evita saltos durante a conversa e não deve ser removida sem substituição.

**Proposta:** título + uma frase curta + demo, deixando explicação de funcionamento como apoio após a demonstração. Uma pergunta e resposta iniciais claramente fictícias podem dar significado ao espaço reservado, sem simular conversa real do visitante. **Aceite:** ao chegar à seção mobile, pelo menos um chip fica visível; três exemplos funcionam sem deslocar o restante da página. Preservar “Conversa de exemplo”.

### V07 — Tornar o hero mais específico e a ação principal mais dominante

**Fonte:** hero de `app/index.tsx` antes de `nativeID="produto"`; `BotaoCTA` em `:135`. [Celular](390-hero.png), [desktop](1440-hero.png).

“Um aplicativo que ajuda você a visualizar seu mês” descreve a categoria, enquanto Livre para Gastar e registro por voz diferenciam o produto. No celular o parágrafo ocupa cinco linhas; Entrar é preenchido e Criar minha conta é contornado. O tamanho/posição ainda ajudam o CTA, mas a massa de cor do login compete com a aquisição.

**Proposta:** testar uma mensagem como “Saiba quanto pode gastar hoje.” com apoio sobre voz e organização; preservar a marca e confirmar a redação final. Testar CTA principal menta preenchido, login discreto e acesso secundário “Ver como funciona”. Não mudar o destino de cadastro automaticamente: ele foi uma decisão documentada.

**Aceite:** H1, uma frase explicativa e CTA principal cabem em 390×844; o valor percebido é compreensível sem ler três seções. Comparar cliques/avanço até preço em teste posterior, sem atribuir ganhos antecipadamente.

### V08 — O painel mobile é uma miniatura, não uma demonstração legível

**Fonte:** `components/MolduraNavegador.tsx:156`. [Evidência](390-painel-web.png).

A captura original é 1440px e aparece com cerca de 326px no celular, escala de aproximadamente 23%. Textos de 14px na imagem equivalem a pouco mais de 3px. A imagem comunica “há um painel”, mas não comprova os números.

**Proposta:** manter visão geral e acrescentar um recorte editorial legível do indicador principal, ou ampliação acessível com fechamento. Não apenas escalar a imagem inteira: isso excederia a tela. **Aceite:** um dado central pode ser lido sem pinça e a visão integral permanece disponível. O desktop usa cerca de 659px, também devendo tratar números menores como ilustração.

### V09 — Callout sem conexão clara com o dado

**Fonte:** `components/PainelWebDestaque.tsx:31`. [Evidência](1440-painel-web.png).

O balão da direita está na altura correta, porém junto da coluna de cofrinhos; “Comprometimento futuro” é o gráfico central. Sem linha ou marcador de origem, pode parecer que descreve o elemento errado.

**Proposta:** usar marcador/linha curta ancorada ao gráfico ou legendas externas numeradas; evitar cobrir valores. **Aceite:** associação inequívoca entre cada legenda e região em 1280/1440px e durante a flutuação. Não pressupor que acertar apenas o percentual vertical resolve a posição.

### V10 — Reduzir distância entre hábito e sua prova

**Fonte:** `app/index.tsx:1191`; `components/CarrosselTelasApp.tsx`. [Celular](390-habitos.png), [desktop](1440-habitos.png).

A seção tem 1.706px no celular. O telefone e os cinco seletores antecedem o título e cinco explicações. A imagem inicial é Início, com finanças; o argumento é constância, conquistas e Score.

**Proposta:** colocar título antes da imagem no mobile e iniciar essa seção na tela de Desafios, ou ligar a seleção de cada argumento à tela correspondente. Preservar as cinco telas e o arranjo de seletores 3+2 aprovado. **Aceite:** título e prova de hábito aparecem na primeira viewport da seção; demais pilares continuam acessíveis.

### V11 — Unificar a direção das capturas

**Fonte:** `components/NotebookAnimado.tsx:220`; `public/notebook/notebook.webp`; `public/telas/inicio-web.png`. [Hero](1440-hero.png), [painel](1440-painel-web.png).

O notebook mostra saudação Gabriel e composição anterior; painel e telefone mostram Mariana, novos cards e outra organização. Exemplos independentes são permitidos, mas a mudança de estrutura faz o produto parecer menos consistente.

**Proposta:** usar o mesmo estado demonstrativo e versão do app em todos os materiais, ou rotular explicitamente exemplos independentes. Atualizar a tela dentro do notebook preservando perspectiva e qualidade do mockup. **Aceite:** checklist único de versão, dados fictícios, nomes, telas, valores e cores para futuras recapturas. Não reutilizar conta pessoal.

### V12 — Movimento reduzido altera a arquitetura visual

**Fonte:** `components/BeneficiosHorizontais.tsx:131`. [Normal](1440-beneficios.png), [movimento reduzido](1440-reduced-motion.png).

`bento = largura >= 1100 && !reduzirMovimento`. A preferência troca a grade por um carrossel, reduzindo a exposição simultânea de recursos e mudando a hierarquia dos cards grandes. Não é necessário mudar a composição para retirar animação.

**Proposta:** selecionar layout apenas por espaço; preferência de movimento controla transições/loops. **Aceite:** mesma grade e destaque de conteúdo em 1440px com e sem movimento reduzido, com efeitos desativados no segundo caso.

### V13 — WhatsApp remanescente na trilha

**Fonte:** `components/TrilhaPassos.tsx:76`. [Evidência](390-registro-rapido.png).

Ainda aparece “Texto ou áudio no WhatsApp”, embora o histórico da retomada registre a retirada dessa divulgação. O estado funcional atual do canal não foi validado nesta auditoria. Portanto, o achado confirmado é a divergência entre copy e decisão documentada, não uma afirmação de indisponibilidade do serviço.

**Proposta:** reconciliar com o responsável pelo produto e atualizar a trilha para o fluxo confirmado. **Aceite:** todas as seções descrevem os mesmos canais disponíveis. Não reativar integração como parte de uma correção visual.

### V14 — Enxugar o bento sem esconder capacidades

**Fonte:** benefícios em `app/index.tsx`; `components/BeneficiosHorizontais.tsx:109`. [Evidência](1440-beneficios.png).

O card Registro concentra voz, QR, Pix, OFX, CSV, 10 mil linhas, manual e offline. O conjunto é valioso, mas lê como inventário técnico dentro de uma área de varredura visual. O Granabô já teve uma seção explicativa extensa antes.

**Proposta:** uma frase de resultado + até dois detalhes diferenciadores no estado de leitura rápida; detalhes completos por expansão também no desktop, caso o texto seja encurtado. Preservar os nove benefícios e destaques de Granabô/Widgets. **Aceite:** compreensão por título e mock; nenhuma capacidade desaparece silenciosamente.

### V15 — Reduzir ruído de fundo

**Fonte:** `GradeInterativa` nas seções de `app/index.tsx`. [320px](320-beneficios.png), [tablet](768-beneficios.png).

A grade, bordas dos cards, linhas dos mini-gráficos e fade lateral formam várias camadas de traços. No tablet, o fade cobre parte do card vizinho de propósito, mas amplia a sensação de texto lavado na borda.

**Proposta:** diminuir a presença da grade atrás de texto, reservando-a às margens; limitar o fade ao indício de continuidade. **Aceite:** hierarquia primeiro título, depois mock, depois corpo; preservar a pista de scroll horizontal, sem classificar o recorte intencional do vizinho como overflow.

### V16 — FAQ e segurança podem ser mais fáceis de percorrer

**Fonte:** `app/index.tsx:1307`, `:1430`, `:2070`. [Segurança](390-seguranca.png), [FAQ](390-faq.png), [assinatura](390-faq-assinatura.png).

Ausência de conexão bancária, edição de dados e proteção reaparecem em vários pontos. A seção de segurança mede 947px e FAQ 1.215px no estado inicial mobile. O acordeão funciona e tem estados expostos; não precisa ser substituído.

**Proposta:** manter três provas curtas de segurança e organizar FAQ por decisão, começando por assinatura/uso, sem repetir textos completos. Reduzir espaços internos somente onde há sobra real. **Aceite:** respostas completas acessíveis, títulos identificáveis e nenhuma política comercial inventada. Considerar renomear “Sem letra miúda” se as condições ainda não estiverem todas esclarecidas.

### V17 — Motion com função e estabilidade

**Fonte:** `components/PainelWebDestaque.tsx:41`, `:56`; `components/MolduraNavegador.tsx:61`, `:99`.

A moldura pausa fora de vista por IntersectionObserver; os balões não têm esse controle local e usam ciclos diferentes de 5,4s/6s. O deslocamento relativo existe por projeto, mas em uma legenda técnica pode enfraquecer o vínculo com o alvo. A preferência de movimento é respeitada nesses componentes.

**Proposta:** animação conjunta sutil da composição ou legendas estáticas; pausa fora de vista também nos balões. Entradas apenas uma vez, transform/opacity, sem acrescentar loop a todo card. **Aceite:** comparação gravada com e sem motion; foco e leitura não se movem durante a interação; preferência reduzida mantém conteúdo completo. Não houve medição de FPS/CPU: não atribuir travamentos a esses loops sem perfil.

### V18 — Fechamento mais orientado à decisão

**Fonte:** `app/index.tsx:1490` em diante. [Evidência](390-cta-final.png).

Título e parágrafo repetem começar/hoje/rotina; o título toma cinco linhas e o parágrafo outras cinco no mobile. O preço não é retomado junto ao último CTA.

**Proposta:** título mais curto, benefício central, R$ 9,90/mês próximo do botão e as condições confirmadas. Manter três fatos de apoio. **Aceite:** fechamento tem uma mensagem principal e uma ação, sem urgência artificial nem selo de confiança inventado.

### V19 — Qualidade de mídia antes de compressão indiscriminada

**Fonte:** `public/telas/`, `public/notebook/`. As seis capturas somam 612.705 bytes; notebook 318.532, fundo webp 252.346 e sombra 22.754. Não significa que tudo integra o carregamento crítico.

**Proposta:** comparar WebP/AVIF das capturas com PNG em números pequenos e bordas, gerar variantes responsivas e revisar prioridade de mídia do hero. Preservar alt descritivo e dimensões explícitas já presentes nas imagens examinadas. **Aceite:** comparação visual a DPR 1/2 e relatório de transferência/cache na build de produção. Não concluir que a página é lenta a partir do Metro em desenvolvimento.

### V20 — Simplificar estados de layout não utilizados

**Fonte:** `components/BeneficiosHorizontais.tsx:131–132`.

`fixar` exige `!bento`, largura ≥1100 e movimento não reduzido, exatamente a combinação que torna `bento` verdadeiro. Portanto, o modo fixo não pode ser ativado no código atual. A revisão ao vivo confirmou grade em 1100px; não há scroll sticky a auditar nessa configuração.

**Proposta:** decidir se o modo legado será removido ou se existe um intervalo realmente desejado; remover comentários conflitantes. **Aceite:** tabela explícita de layouts por largura e movimento, sem estados impossíveis. É dívida de manutenção, não bug de rolagem reproduzido.

## Inventário por seção

| Seção | Altura a 390px | Avaliação e destino |
|---|---:|---|
| Hero | não medida | Marca forte; benefício genérico e mock pouco legível. V07/V11 |
| Produto | 955px | Dores reconhecíveis, três cards muito altos para o volume de texto; compactar em conjunto com V07 |
| Registro rápido | 952px | Boa transformação fala → lançamento; revisar canal anunciado. V13 |
| Granabô | 1.126px | Demo funciona, demora a ficar visível. V06 |
| Hábitos | 1.706px | Maior seção mobile medida; aproximar prova e argumento. V10 |
| Painel web | 614px | Visão geral funciona; detalhes pequenos. V08/V09 |
| Livre para Gastar | 809px | Boa demonstração central, conta precisa correção. V01 |
| Benefícios | 755px fechado | Nove categorias acessíveis; corrigir modal/toque e manter bento no movimento reduzido. V02/V05/V12 |
| Segurança | 947px | Separadores e ícones claros; reduzir repetição. V16 |
| Preços | 1.291px | Desktop claro; reordenar mobile. V03 |
| FAQ | 1.215px inicial | Acordeão funcional; revisar ordem/densidade. V16 |
| CTA final | não medida | Repetitivo, pode recuperar oferta. V18 |
| Rodapé | não medida | Grupos Produto/Conta/Transparência e links compreensíveis; preservar |

## O que preservar

- Paleta e tipografia da marca; não trocar por estética genérica de SaaS.
- Contrastes teóricos dos tokens contra `paperRaised`: ink 14,13:1; inkSoft 9,33:1; inkFaint 5,61:1, calculados por luminância relativa sRGB. Não há justificativa para clarear todo texto secundário. Isso não mede cada composição com opacidade/fundo animado.
- Capturas reais com texto alternativo; mini-mocks para explicar mecanismos; rótulo de conversa fictícia; ausência de promessa absoluta de IA.
- Bento com nove capacidades, dois destaques maiores e mobile com vizinho parcial intencional.
- Arranjo 3+2 dos seletores de telas, alinhamento do FAQ e preço em card único: decisões anteriores explícitas.
- Menu com Escape, FAQ com `aria-expanded`, link de pular conteúdo e hierarquia H1/H2 presentes no DOM.
- Resposta da demo verificada: R$ 624 ÷ 13 = R$ 48,00. Não confundir com o defeito do mock V01.
- Nenhum alargamento de documento observado nos probes 320/768/1100/1280; isso não prova ausência de todo recorte interno.

## Sequência de execução proposta

1. **Correção objetiva:** V01, V02, V05. Revalidar cálculos, interação modal, foco e toque.
2. **Leitura e oferta:** V03, V06, V07, V10, V18. Fazer comparação antes/depois em 390 e 1440; não alterar tudo simultaneamente se houver teste de conversão.
3. **Prova visual consistente:** V08, V09, V11, V13. Unificar referências e validar canais do produto.
4. **Acabamento:** V04, V12, V14–V17, V19–V20. Primeiro manter o conteúdo estável, depois refinar movimento.

Cada rodada deve checar 320/390/768/1100/1280/1440, zoom 200%, teclado, movimento reduzido, Safari e pelo menos um celular real. Para implementação, acrescentar apenas testes relevantes: cálculo do mock, abertura/fechamento/foco do diálogo e regressão de layout responsivo. Uma auditoria documental não requer build EAS.

## Evidências e encerramento

As imagens nesta pasta registram o estado observado; a matriz acima distingue o que foi inspecionado integralmente do que foi amostrado. O console apresentou aviso de depreciação `props.pointerEvents`, sem erro de execução nos fluxos exercitados. Não é um resultado de performance de produção.

Próximas validações externas: disponibilidade do canal WhatsApp, condições comerciais completas, build publicada, zoom e tecnologias assistivas. Não foi encontrado motivo para refazer a identidade visual do Grana.; o trabalho recomendado é concentrar atenção no benefício, tornar as demonstrações coerentes e retirar obstáculos à leitura e à interação.

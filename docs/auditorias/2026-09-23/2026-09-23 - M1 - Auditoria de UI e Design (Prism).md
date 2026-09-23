---
tags: [grana, auditoria, landing, motion]
tipo: registro
data: 2026-09-23
---

# 2026-09-23 - M1 - Auditoria de UI e Design (Prism)

**Pedido.** "auditoria rigorosa de seus próprios segmentos dentro do projeto. Ao terminarem, documentem todos os achados." Segmento: UI e Design. Somente leitura de produto e código; esta nota é o único arquivo escrito.

**Skills usadas.** `impeccable` e `ui-visual-composition`: hierarquia, consistência e acessibilidade; `apple-design` e `emil-design-eng`: qualidade de componentes e interação; `review-animations`: motion e movimento reduzido; `anti-ui-slop`: composição e copy. `maestri-portal`: inspeção da landing no portal exclusivo `Navegador Prism`.

## Cobertura

- [x] DESIGN.md, tema, tokens e tipografia no app e na web (busca de fonte/weight, `lib/theme.ts`, amostra das telas principais e landing)
- [x] Componentes e telas do app por leitura estática de código: tokens, estrutura principal, botões, modais, tabulação e avisos; amostragem, sem declaração de teste nativo de todas as telas
- [x] Marca: `BrandLogotype`, tokens, SVGs e `assets/icon.png` vistos; a divergência do ângulo do widget já está aberta no DESIGN.md e não foi duplicada
- [x] Copy de interface: busca das strings com travessão e fórmula "não é X, é Y"; A3 anterior citado
- [x] Motion e prefers-reduced-motion no código; HTML do portal conferido. Mudança de propriedade quadro a quadro e preferência simulada não verificadas por bloqueio de `evaluate` na CSP
- [x] Landing desktop em 1440×900: snapshots da home, Garantia e FAQ, HTML publicado e navegação; contraste medido nos pares centrais dos tokens. Screenshot do portal falhou
- [x] Landing mobile em 390×844 e 320×844: snapshots e interações de menu, planos e FAQ, HTML antes/depois de resize; screenshot falhou
- [x] Conferência contra achados anteriores de 21 a 23/09; A3, achados S do Sentinel, correções da landing em 7c1bdf9 e remoção posterior em 13ae412 identificados
- [x] Fora: emulador Pixel 8, ocupado pelo Sentinel; nenhuma conclusão visual nativa foi declarada como teste no aparelho

Cobertura estimada: **80%**. O código e a navegação web foram lidos; ficaram sem verificação visual os estados que dependem de screenshot, leitor de tela real, contraste composto e motion quadro a quadro. O portal recusou `evaluate` pela CSP e `screenshot` por falha de renderização/minimização. Nenhuma conta foi usada e nenhum dado foi enviado.

## Achados

### P1 · P2 médio · Faixa animada sem controle de pausa

- **Onde:** `components/TrustMarquee.tsx:79-95, 153-178`; landing publicada em `https://www.granaponto.com.br/`, portal `Navegador Prism` (1440×900 e 390×844).
- **Evidência:** a faixa normal usa `animationIterationCount: 'infinite'`, duração medida de ~24,95 s no HTML publicado; o ramo estático só aparece com `prefers-reduced-motion`. Não há controle Pausar/Retomar nem pausa por hover/foco. O commit `13ae412` removeu explicitamente o controle incluído em `7c1bdf9`. O snapshot do portal mostra `region "Destaques do Grana."` com a faixa em movimento e sem botão associado. [Web Interface Guidelines da Vercel](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), linha 51, pede controle de pausa/parada/ocultação para movimento automático longo junto de conteúdo.
- **Esperado x encontrado:** uma pessoa que não pediu movimento reduzido deveria poder parar o texto em rolagem para lê-lo. Hoje ele segue indefinidamente.
- **Estado:** **COMPROVADO no código e no HTML publicado**; leitor de tela real e teste com preferência reduzida no portal não foram executados. É regressão de acessibilidade em relação a `7c1bdf9`, mas o commit `13ae412` registra a remoção como deliberada, então a decisão precisa ser reconciliada com acessibilidade.
- **Sugestão:** restaurar controle visível de pausa/retomada com rótulo acessível, preservando a variante estática para movimento reduzido.

### P2 · P2 médio · Resposta do FAQ fica presa a 56 px e pode cortar texto no mobile

- **Onde:** `components/FaqItem.tsx:19-40, 73-82, 105-117`; `https://www.granaponto.com.br/#faq`, portal `Navegador Prism` em 390×844 e 320×844.
- **Evidência:** `aoMedirConteudo` guarda a primeira altura e retorna em qualquer `onLayout` posterior (`medido.current`). A resposta aberta "Como funciona a assinatura?" contém 165 caracteres; o HTML publicado mostrava `height: 56px; overflow: hidden` na região `faq-resposta-_r_8_` tanto em 390 px quanto depois de reduzir o portal a 320 px, embora a largura do texto tenha caído de 266 para 207 px. O componente usa `fontSize: type.apoio` e `lineHeight: lh(...)`; 56 px comportam cerca de 2,5 linhas.
- **Esperado x encontrado:** ao estreitar a janela ou ampliar texto, a caixa deveria acompanhar as novas quebras. Ela mantém a altura antiga e corta a resposta visualmente.
- **Estado:** **COMPROVADO no HTML publicado e no mecanismo do código**. O portal não conseguiu gerar screenshot (`screenshot timed out — page is not rendering`); a quantidade exata de linhas cortadas não foi medida por imagem. A altura travada e o `overflow: hidden` são observados.
- **Sugestão:** recalcular a altura quando largura ou escala da fonte mudar, ou usar disclosure sem altura fixa. Testar 320/390 px e texto ampliado, aberto antes e depois do resize.

### P3 · P3 baixo · Travessão ainda aparece em copy publicada e no paywall

- **Onde:** `app/index.tsx:1761` (fechamento da landing), `app/baixar.tsx:40` (página de download) e `app/assinar.tsx:175` (botão "Já paguei — verificar acesso").
- **Evidência:** strings de interface no fonte, não comentários; a diretriz do segmento proíbe travessão na copy. A ocorrência da tela "Confirme seu e-mail" já é **A3** em `context.md` de 22/09 e não é reaberta aqui.
- **Esperado x encontrado:** frases e rótulos diretos, sem travessão; esses três textos ainda o usam.
- **Estado:** **COMPROVADO no código**. A landing não foi capturada visualmente no fechamento, e as telas de download/paywall não foram abertas.
- **Sugestão:** reescrever os três trechos com frase curta ou pontuação simples, mantendo preços e sentido originais; tratar A3 no mesmo passe sem criar outro registro para ela.

### P4 · P3 baixo · Preço anual no paywall não usa algarismos tabulares

- **Onde:** `app/assinar.tsx:123,290`, `DESIGN.md` na regra "The Tabular Rule"; comparação: `app/index.tsx:2418` usa `fontVariant: ['tabular-nums']` no preço da landing.
- **Evidência:** `destaqueValor` desenha `reais(PRECO_ANUAL)` com Neue Machina Regular, mas sem `fontVariant`; a regra documentada exige a propriedade em todo valor monetário. Não há `fontWeight` fora da regra nem família diferente nos trechos auditados.
- **Esperado x encontrado:** mesmo tratamento numérico do preço da landing; o valor do paywall não recebe esse tratamento.
- **Estado:** **COMPROVADO no código**. Movimento visual dos dígitos e aparência no aparelho não foram testados; o preço é estático na tela atual, então o impacto prático é baixo.
- **Sugestão:** usar o estilo monetário tabular existente ao corrigir o paywall, sem acrescentar novo peso ou família.

### P5 · P3 baixo · Faixa não acompanha mudança de movimento reduzido com a página aberta

- **Onde:** `components/TrustMarquee.tsx:49-69`; comparação: `lib/motion.ts:44-61` (`useReducedMotion`).
- **Evidência:** `TrustMarquee` lê `matchMedia(...).matches` uma vez ao montar e faz apenas uma consulta assíncrona `AccessibilityInfo.isReduceMotionEnabled()`. Não assina `reduceMotionChanged` nem o evento `change` da media query, como faz o hook compartilhado. O ramo animado tem loop infinito (`TrustMarquee.tsx:153-178`).
- **Esperado x encontrado:** ao ativar a preferência de movimento reduzido com a aba aberta, a faixa deveria virar lista estática; o estado do componente permanece no valor capturado até recarregar a página.
- **Estado:** **COMPROVADO no código**; a troca da preferência durante uma sessão real não foi reproduzida no portal, pois `maestri portal evaluate` foi barrado pela CSP da página.
- **Sugestão:** consumir o hook reativo comum ou assinar a alteração de `matchMedia`; manter o estado inicial correto antes da primeira pintura.


## Skills: aplicação na auditoria

| Skill | Uso ativo e contribuição |
| --- | --- |
| `impeccable` | Separou landing persuasiva de app operacional e orientou a verificação em desktop/mobile; o lançador de contexto não foi executado porque a auditoria proíbe efeitos de instalação/cache, então DESIGN/PRODUCT/context foram lidos diretamente. |
| `ui-visual-composition` | Confrontou hierarquia, ritmo, token e legibilidade com os papéis do DESIGN.md; apontou o conteúdo cortado do FAQ. |
| `interface-design` | Conferiu o vocabulário de app operacional, `screenRhythm`, estados, tabulação e feedback em componentes-base; manteve o escopo de marketing fora dessa lente. |
| `apple-design` | Checou resposta imediata, foco retornando ao gatilho do menu e comportamento reduzido; o menu passou em navegação por teclado no portal. |
| `emil-design-eng` | Aplicou frequência e propósito do motion: o loop da faixa merece controle; não propôs animação extra para ações repetidas do app. |
| `anti-ui-slop` | Separou falha de qualidade de preferência estética. A paleta petróleo/menta, o SVG da marca e os mockups específicos foram considerados identidade deliberada, não sinais de UI genérica. |
| `ui-ux-pro-max` | Usou a referência local de alvo, contraste e controle de movimento longo; o buscador Python da skill falhou neste ambiente, então a referência local foi lida diretamente. |
| `web-design-guidelines` | Leu a versão atual da fonte da Vercel; regra de pausa em animação longa fundamenta P1 e HTML/semântica foram conferidos no portal. |
| `review-animations` | Varrida de duração, propriedades, origem, acessibilidade e preferência reduzida; `height` em FaqItem é o risco material, ligado ao P2. |
| `improve-animations` | Mapeou motion em CSS, Animated e tokens de `lib/motion.ts`; priorizou os achados P1/P2/P5 sem criar planos nem alterar fonte. |
| `find-animation-opportunities` | Passou os candidatos pelo filtro de frequência e propósito; descartou movimento adicional nos controles financeiros cotidianos. |
| `animation-vocabulary` | Nomeou separadamente marquee contínuo, reveal por interseção e rolling label para não tratar efeitos diferentes como uma única falha. |
| `web-animation-design` | Checou o FAQ como disclosure por altura e a faixa como loop constante; recomendações são pontuais e preservam a curva existente. |
| `web-motion-design` | Conferiu staging e temporização do menu flutuante (180 ms ao abrir, 130 ms ao fechar); sem novo achado. |
| `scroll-animations` | Comparou `RevealOnScroll` e `useEntradaNaTela` com a regra 9: há guarda para conteúdo nascer visível; mudança de valor por quadro não pôde ser medida no portal. |
| `copywriting` | Leu CTA, objeções e fechamento como texto de conversão; manteve a afirmação comercial e isolou violações de pontuação no P3. |
| `grammar-check` | Varreu strings de interface e separou texto exibido de comentários; `A3` anterior foi referenciado, sem duplicação. |
| `intended-vs-implemented` | Cruzou as regras de DESIGN.md (fonte, numeração e marca) com `lib/theme.ts`, assets e estilos, gerando P4 com dois lados citados. |
| `test-scenarios` | Transformou lacunas de verificação em passos de QA para 320/390 px, texto ampliado, pausa da faixa e troca de preferência em sessão aberta. |
| `maestri-portal` | Inspecionou home, preços, garantia, FAQ e menu no portal exclusivo, com snapshots e HTML em 1440/390/320 px. |

## Verificações positivas e limites

- Busca em `app/`, `components/` e `lib/`: nenhum `fontWeight` ativo e nenhuma família literal diferente de Neue Machina (o `monospace` encontrado é comentário histórico). `assets/icon.png` mostra símbolo G circular com ponto separado e gradiente compatível com a marca; `BrandLogotype.tsx` usa o gradiente único em coordenadas globais.
- Razões calculadas dos tokens: `down` sobre `paper` 5,77:1 e sobre `paperRaised` 5,07:1; `accent` sobre `paper` 5,62:1; `inkFaint` sobre `paperRaised` 5,61:1. Não substituem teste de cores compostas no navegador.
- O menu flutuante abriu em 390 px, moveu foco ao primeiro link e mostrou sete alvos de 44 px; o seletor Anual/Mensal e seus links de compra foram inspecionados em 320 px, sem acionar checkout. Não foi observada quebra horizontal no snapshot, mas não houve medição DOM de `scrollWidth` porque a CSP bloqueou `evaluate`.
- O snapshot do Maestri repete rótulos de links e glifos, porém o HTML real traz `aria-hidden="true"` nas cópias e ícones. Esse sinal foi descartado como possível limitação do snapshot, sem abrir um achado de leitor de tela.
- A diferença conhecida de ângulo da rampa no widget consta expressamente em `DESIGN.md`; os achados do Sentinel (S1–S49) e A3 continuam na nota dele/contexto. Não foram contados novamente.
- `node scripts/verificar-vault.mjs` apontou esta nota como sem link de entrada, além de pendências de outras notas. O índice não foi editado porque a auditoria restringe a escrita à minha própria nota.

## Perguntas ao autor

- O controle de pausa da faixa deve voltar, apesar da remoção deliberada no commit `13ae412`? A recomendação de acessibilidade é restaurá-lo.

## Resumo

**5 achados: 0 P1 crítico, 2 P2 médios, 3 P3 baixos.** Nenhum código, configuração, serviço ou banco foi alterado; nenhum commit, build ou deploy foi feito.



## Pausa temporária — 23/09/2026

**Ponto exato:** auditoria do segmento encerrada, cinco achados P1–P5 registrados e resumo enviado ao Codex no Maestri. A pausa chegou depois da conferência final da estrutura da nota e do `git status`, que mostrava apenas as alterações preexistentes em `.claude/settings.json` e `PRODUCT.md`. Nenhum código ou serviço foi alterado por esta auditoria.

**Cobertura feita:** DESIGN.md, tema/tokens/tipografia por código; marca e ícone; busca de copy; motion e movimento reduzido por código; landing no portal exclusivo em 1440×900, 390×844 e 320×844 por snapshots, HTML e interações; confronto com achados anteriores. **Falta/verificação não feita:** screenshot do portal (falha da ferramenta), leitor de tela real, contraste composto, motion quadro a quadro, inspeção visual nativa e varredura integral de todas as telas do app (emulador reservado ao Sentinel). Cobertura estimada mantida em 80%. Pergunta pendente ao autor: restaurar pausa da faixa após `13ae412`.

**Estado:** trabalho pausado a pedido do autor até mensagem explícita de RETOMAR. Não iniciar novos comandos ou achados.

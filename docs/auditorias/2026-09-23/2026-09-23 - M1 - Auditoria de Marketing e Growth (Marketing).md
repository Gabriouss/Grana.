---
tags: [grana, auditoria, landing, copy, preco]
tipo: registro
data: 2026-09-23
---

# 2026-09-23 - M1 - Auditoria de Marketing e Growth (Marketing)

**Pedido.** Do autor: "auditoria rigorosa de seus próprios segmentos dentro do projeto. Ao terminarem, documentem todos os achados." Segmento: marketing e growth. Somente leitura no projeto e na produção; esta nota é o único arquivo criado.

**Skills usadas ativamente.** Biblioteca varrida em E:/GranaPonto/.claude/skills, E:/GranaPonto/.agents/skills e C:/Users/user/.claude/skills; aplicadas em modo de auditoria:
- copywriting, grammar-check, value-prop-statements e value-proposition: examinei promessa, clareza do título/CTA, objeções e correspondência benefício/recurso; contribuíram para B5, B9 e B10.
- seo-audit e ai-seo: verifiquei HTML inicial, metadados, robots, sitemap, canonical, JSON-LD, OG e conteúdo extraível; contribuíram para B1–B3. Indexação e citações por IA não foram presumidas.
- competitor-analysis, competitive-battlecard e positioning-ideas: comparei páginas oficiais de [Díntavo](https://dintavo.com.br/), [Dinzo](https://dinzo.com.br/) e [Organizze](https://www.organizze.com.br/app-de-financas/); modelo gratuito limitado + Pro do Díntavo contradiz generalização de B5.
- ideal-customer-profile e customer-journey-map: confrontei público presumido nos planos com jornada anúncio → landing → oferta → Cakto → acesso; apontaram lacuna no checkout (B7). Perfil segue hipótese sem pesquisa verificável.
- content-strategy, marketing-ideas, gtm-strategy e gtm-motions: comparei calendário, formatos, peças, canais e meta de 100 assinantes; contribuíram para B4, B6 e B11. Nenhuma campanha foi lançada.
- growth-loops: procurei ciclo de indicação medido; há intenção de afiliados/tráfego, sem dados de ativação, convite ou retorno para validá-lo.
- pricing-strategy: confrontei landing, Cakto e nota vigente; confirmei R$9,90 e R$97,90 e economia de R$20,90 à vista. Parcelado anual com juros pode superar doze mensalidades; landing delimita corretamente a economia.
- ab-test-analysis: procurei variantes, amostra, conversões e atribuição; dados insuficientes para inferir significância ou conversão.
- web-design-guidelines, anti-ui-slop e ui-visual-composition: revisei hierarquia de CTA, composição E01/E02/E05/E06 e viewports; não atribuí defeito visual sem captura repetível.
- sentiment-analysis: sem amostra agregada e anonimizada de clientes, não calculei sentimento nem tratei comentário isolado como evidência de ICP.
- intended-vs-implemented: confrontei copy e planos com scanner e cálculo Livre para Gastar; contribuiu para B9–B11.
- test-scenarios, webapp-testing e maestri-portal: orientaram inspeção da landing e dos dois checkouts no portal exclusivo, sem envio nem compra.
## Cobertura

**8/8 frentes examinadas (100% de inspeção documental e pública).** Não representa validação de conversão, indexação ou performance real.

- [x] Landing: copy, proposta, CTA e navegação; hero → preços e alternância mensal/anual no Navegador Beacon.
- [x] SEO técnico/on-page: HTML, robots, sitemap, canonical, OG, schema e rotas.
- [x] Velocidade/experiência: desktop, viewport 390×836 e tamanhos de recursos; Web Vitals não medidos.
- [x] Funil: Contexto - FUNIL, FUNIL.md, tráfego e eventos previstos; sem relatórios de campanhas.
- [x] Checkout Cakto: duas ofertas públicas, taxas, totais e texto antes do envio.
- [x] Vault: criativos E01/E02/E05/E06, calendário, plano editorial, tráfego e vendas.
- [x] Preço/promessas: nota vigente, landing, ofertas e módulos do produto.
- [x] Concorrência: páginas oficiais de Díntavo, Dinzo e Organizze.

## Fora de escopo e limites

- WhatsApp como canal, por decisão expressa do autor.
- Compra, envio de formulário, alteração em contas/serviços, Pixel 8, build e deploy, proibidos na auditoria.
- Não verificados: conversão/abandono, dados Meta/GA4/Pixel/CAPI, Search Console/indexação, Core Web Vitals, SERP personalizada, checkout após preencher dados, OCR em nota física, pagamento e ativação pós-compra. Nenhum login foi necessário.
- maestri portal evaluate foi bloqueado pela CSP; usei snapshot/texto e GET/HEAD. Capturas posteriores ficaram instáveis; não atribuí problema visual à ferramenta.
## Achados

### B1 — Schema anuncia iOS sem produto iOS (P2 médio)

- **Onde:** `scripts/inject-og-meta.js:53`; JSON-LD `SoftwareApplication` em `https://www.granaponto.com.br/`.
- **Evidência:** GET público de 23/09 devolve `operatingSystem: "Web, Android, iOS"`; `PRODUCT.md` e `/baixar` apresentam navegador e Android. A auditoria de landing de 22/09 (`7c1bdf9`) publicou os metadados, sem registrar este descompasso.
- **Esperado x encontrado:** plataformas vendidas com precisão x iOS anunciado a robôs e agentes de busca.
- **Status:** **COMPROVADO** no HTML e no produto documentado. Exibição em resultado de busca não verificada.
- **Sugestão:** ajustar o `operatingSystem` à oferta real e conferir o JSON-LD depois de publicar.

### B2 — HTML público quase sem conteúdo para crawler sem JavaScript (P2 médio)

- **Onde:** `https://www.granaponto.com.br/` e export em `vercel.json:2`.
- **Evidência:** GET do HTML publicado, removendo `script`, `style` e tags, deixa 295 caracteres: título, descrição e "Ative o JavaScript para continuar." Não contém CTA, preço, FAQ ou explicação do produto; o corpo é montado pelo bundle. O registro `2026-09-22 - M1 - Auditoria da landing e correções` comprova metadados por rota, mas não relata HTML de conteúdo. Busca web `site:granaponto.com.br` nesta auditoria não devolveu páginas do domínio.
- **Esperado x encontrado:** o conteúdo essencial da página pública disponível no HTML inicial x texto de venda dependente de execução de JavaScript.
- **Status:** **COMPROVADO** no HTML; prejuízo de indexação/AI SEO é **HIPÓTESE** sem Search Console ou logs de crawler.
- **Sugestão:** renderizar no HTML os blocos essenciais de valor, oferta e FAQ ou publicar páginas textuais equivalentes acessíveis por links; medir cobertura e consultas no Search Console antes/depois.

### B3 — Canonical e sitemap apontam para host que redireciona (P2 médio)

- **Onde:** `landing-meta.json:2`, `public/sitemap.xml:4` e `<link rel="canonical">` publicado.
- **Evidência:** `https://granaponto.com.br/` responde **308 Permanent Redirect** para `https://www.granaponto.com.br/`; o HTML final em www aponta canonical e `og:url` ao apex. O sitemap e robots também usam apex.
- **Esperado x encontrado:** URLs canônicas apontando diretamente ao host final de 200 x sinais canônicos dirigidos a um 308.
- **Status:** **COMPROVADO** por HEAD/GET de 23/09. Efeito concreto em rankings não medido.
- **Sugestão:** escolher o host final como `siteUrl`, canonical, OG e sitemap; validar todas as rotas depois da publicação.

### B4 — Três cadências editoriais incompatíveis no mesmo lançamento (P2 médio)

- **Onde:** `FUNIL.md:104-111,129-152`; `03 - Marketing/Calendário do primeiro mês.md:16-18`; `03 - Marketing/Plano Editorial de Conteúdo e Produção com IA.md:16-21`; nota Maestri `Contexto - FUNIL:6`.
- **Evidência:** calendário atual e contexto compartilhado exigem **4 Reels, 8 estáticos, 8 carrosséis e 8 sequências de Stories**; o `FUNIL.md` local e o plano editorial perene dizem **12 Reels e 8 estáticos/carrosséis**. O cronograma de `FUNIL.md` lista R1–R12. A nota de 21/09 da M2 corrigiu preço/CTA, não esta cadência.
- **Esperado x encontrado:** uma pauta operacional única x dois volumes e formatos incompatíveis, ambos descritos como vigentes.
- **Status:** **COMPROVADO** nos documentos. Nenhuma peça foi publicada por esta auditoria; impacto na produção é hipótese.
- **Sugestão:** eleger o calendário aprovado pelo autor como fonte de execução, reconciliar o `FUNIL.md` e rotular o plano anterior como histórico, sem apagar o registro de sua decisão.
### B5 — Objeção sobre apps gratuitos faz alegação universal sem base (P2 médio)

- **Onde:** `app/index.tsx:680-682`, texto publicado em `https://www.granaponto.com.br/#objecoes` (confirmado por `maestri portal text`).
- **Evidência:** a resposta afirma que os únicos jeitos de sustentar app grátis são anúncios, ofertas de cartão ou uso de dados. O concorrente [Díntavo](https://dintavo.com.br/) descreve plano gratuito permanente limitado e plano Pro pago (FAQ, linhas 184-186), outro modelo possível. A copy não oferece fonte para acusar de monetização de dados todos os aplicativos gratuitos.
- **Esperado x encontrado:** explicar o motivo da assinatura do Grana. com seus próprios fatos x generalização contestável sobre terceiros, num bloco de confiança antes da compra.
- **Status:** **COMPROVADO** como alegação absoluta publicada e contraexemplo de modelo freemium. Efeito na confiança/conversão é **HIPÓTESE**, sem teste de usuários.
- **Sugestão:** sustentar a assinatura pelos compromissos verificáveis do próprio produto e retirar o elenco universal de motivos de concorrentes.
### B6 — Plano pago prevê fundador em vídeo contra diretriz editorial (P2 médio)

- **Onde:** `03 - Marketing/Calendário do primeiro mês.md:15-16` e `04 - Tráfego/Plano de Tráfego Pago - Primeiros 100 Assinantes.md`, tabela de criativos A6.
- **Evidência:** o calendário vigente define "sem presença nem voz do fundador"; o plano de 22/09 propõe `A6 | Fundador falando para a câmera | Reels de 30 s, gravado pelo autor`. São instruções simultaneamente vigentes para a mesma campanha. Não é o canal da rede do fundador; este achado se limita à peça A6.
- **Esperado x encontrado:** direção de produção consistente x criativo cuja execução viola a restrição vigente.
- **Status:** **COMPROVADO** nos planos. A6 é rascunho, sem vídeo produzido ou publicado.
- **Sugestão:** decidir se A6 é exceção aprovada e registrar a decisão; caso contrário, trocar sua prova de origem por demonstração real do produto sem imagem/voz do autor.
### B7 — Checkout não repete garantia nem próximo passo de acesso (P3 baixo)

- **Onde:** checkouts públicos `https://pay.cakto.com.br/323b2rs` e `https://pay.cakto.com.br/esgddv2_1096987`, `maestri portal text body` em 23/09.
- **Evidência:** ambos mostram apenas Grana., campos de identificação, oferta, forma de pagamento, resumo, taxa e total. Não apareceu prazo de reembolso de sete dias nem orientação sobre e-mail/ativação, embora a landing prometa a garantia (`app/index.tsx:1677-1683`). Não avancei em nenhum formulário nem cliquei em `Gerar PIX`.
- **Esperado x encontrado:** termos decisivos da landing acessíveis também no ponto de pagamento x checkout sem esses dois reforços no texto lido. A garantia existe na fonte de preço, então é lacuna de apresentação, não ausência comprovada do direito.
- **Status:** ausência de texto **COMPROVADA** na leitura dos dois checkouts; efeito em abandono é **HIPÓTESE** sem dados de funil ou teste.
- **Sugestão:** se a Cakto permitir descrição/elemento confiável na oferta, repetir a garantia e indicar que o acesso chega por e-mail, sem prometer abertura automática do app (achado A4 já aberto).
### B8 — Peso inicial alto, impacto perceptível ainda sem medida (P3 baixo)

- **Onde:** HTML da home (preload de duas Neue Machina e bundle `/_expo/static/js/web/index-3158ad...js`), `public/notebook/notebook.webp`.
- **Evidência:** GET/HEAD de 23/09: bundle JS **2.648.723 B** sem compressão, **721.344 B** com `Accept-Encoding: gzip`; imagem do notebook desktop **795.008 B**; fontes preloaded somam **115.736 B**. A home exige JS para mostrar o corpo (B2). O portal não conseguiu capturar screenshot/linha do tempo de carregamento de forma confiável após a primeira captura.
- **Esperado x encontrado:** experiência inicial rápida para tráfego móvel x payload relevante antes da página estar totalmente interativa. Isso é indício de custo, não prova de lentidão.
- **Status:** tamanhos **COMPROVADOS**; Core Web Vitals, LCP, INP e percepção do usuário **NÃO VERIFICADOS**.
- **Sugestão:** medir LCP/INP e waterfall em aparelho/rede móveis antes de priorizar divisão do bundle, formatos de fonte e imagem. Usar o peso como hipótese de investigação, sem prometer ganho só pela redução de bytes.
### B9 — Copy promete registro por foto, recurso lê apenas QR Code (P2 médio)

- **Onde:** `app/baixar.tsx:40`, `scripts/inject-og-meta.js:22,24`, `components/NoSeuBolso.tsx:43` e FAQ em `app/index.tsx:740`.
- **Evidência:** `/baixar` diz "por voz, texto ou foto" e o card da landing se intitula "Fotografe a nota". O leitor real em `components/QrScannerModal.tsx:188-192,220` usa `CameraView` com `barcodeTypes: ['qr']` e instrui apontar ao QR da NFC-e. Não há captura de imagem da nota nem OCR nesse fluxo. O texto menor do card menciona QR, mas título, página de download e snippet não delimitam.
- **Esperado x encontrado:** promessa de escanear o QR Code da nota x promessa ampla de fotografar a nota, que sugere leitura de qualquer recibo/foto.
- **Status:** **COMPROVADO** no código e no texto publicado de `/baixar`. Não testei com nota física ou imagem de galeria; o scanner foi testado sem nota pelo Sentinel em 22/09.
- **Sugestão:** nomear a entrada como leitura do QR Code da NFC-e em título, página de download e metadados; reservar "foto" para um fluxo que aceite imagem.
### B10 — Demonstração da nota sugere compra preenchida, mas QR comum não traz valor (P2 médio)

- **Onde:** `components/NoSeuBolso.tsx:43`; promessa geral da descrição em `landing-meta.json:4`; implementação `lib/nfce-parser.ts:4-24`, `components/QrScannerModal.tsx:110-117,264-292`.
- **Evidência:** o card diz "O Grana. lê a compra e você confere o valor antes de salvar." O parser documenta que, na emissão online comum, o QR traz só a chave, não o total; retorna `valorTotal: null`. O scanner então coloca descrição genérica `Compra`, deixa o valor vazio e pede ao usuário que digite o valor do cupom. A tela não extrai itens nem descrição da compra.
- **Esperado x encontrado:** copy que antecipe digitação na maioria das NFC-e x expectativa de valor já lido para mera conferência. A explicação precisa aparece no scanner só depois do escaneamento.
- **Status:** **COMPROVADO** no módulo real e na copy; taxa de NFC-e de cada formato entre usuários e efeito na conversão **NÃO VERIFICADOS**. O comentário do próprio componente reconhece a limitação, mas a frase de venda ainda a encobre.
- **Sugestão:** dizer na landing que o QR identifica a nota e pode pedir o valor, ou limitar a promessa de preenchimento automático aos casos em que o QR o carrega.
### B11 — Plano de anúncio atribui parcelas futuras ao Livre para Gastar (P2 médio)

- **Onde:** `04 - Tráfego/Plano de Tráfego Pago - Primeiros 100 Assinantes.md`, seção "Onde o Grana. tem espaço" e linha A5 da tabela de criativos.
- **Evidência:** o plano diz que o valor para gastar já desconta "as parcelas e as contas agendadas" e propõe A5 com "A fatura dos próximos meses já descontada". `lib/safe-to-spend.ts:36-73` desconta apenas contas pendentes do **mês atual** e metas; não recebe parcelas futuras. O próprio `app/index.tsx:1111-1115` registra que a landing retirou uma frase equivalente por ser falsa. O gráfico de comprometimento futuro é outro recurso (`components/FutureTimelineChart.tsx`).
- **Esperado x encontrado:** campanha que diferencie projeção futura do cálculo diário x rascunho que funde os dois e promete dedução inexistente.
- **Status:** **COMPROVADO** entre plano e módulo real. A5 ainda é rascunho; não foi publicado nesta auditoria.
- **Sugestão:** reescrever A5 como visibilidade das parcelas futuras no gráfico, sem dizer que já saíram do Livre para Gastar; revalidar qualquer criativo final antes da veiculação.
## Checagens sem novo achado e pendências já registradas

- Título, description e OG específicos para /, /assinar, /baixar e /termos; imagem OG responde 200. robots.txt e sitemap públicos. CTA do hero desce a #precos; alternância mensal aponta à oferta correta e UTMs persistem no link testado.
- Cakto: mensal R$8,91 + taxa R$0,99 = R$9,90; anual R$96,91 + taxa R$0,99 = R$97,90. Cartão e Pix aparecem, boleto não. Menos de R$0,37/dia é válido no mensal.
- Assinatura/ativação já registradas em 2026-09-22 - M1 - Testes do fluxo de assinatura: A2 (mensagem para e-mail rejeitado), A3 (estado pós-compra) e A4 (link de confirmação abre web, não Android). Não duplicadas.
- Plano de tráfego já registra pendências Pixel/CAPI/PageView/ViewContent/InitiateCheckout/Purchase e legibilidade do rodapé a 360 px; não abri IDs novos. Nota Sentinel de 22/09 registra S4, S43, S45 e S33; não reabri problemas de outro segmento.
- git status anterior mostrava mudanças preexistentes em .claude/settings.json e PRODUCT.md, não editadas. main acompanha origin/main, sem branch, worktree ou stash adicional.

## Perguntas ao autor

1. Qual cadência vale: 4 Reels + 8 estáticos + 8 carrosséis (calendário 22/09) ou 12 Reels + 8 peças (FUNIL.md)?
2. A peça A6 com o fundador em câmera é exceção aprovada à diretriz de não usar presença/voz do fundador?
3. A oferta deve prometer leitura do QR da NFC-e e avisar que pode ser necessário digitar o valor, ou há fluxo de foto/OCR planejado?
4. Há acesso a Search Console, métricas de performance e eventos de funil para validar hipóteses B2, B7 e B8?

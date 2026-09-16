# Plano de vendas — landing page nova do Grana. (v2)

Documento de planejamento, fora do código. **Não altera** `app/index.tsx`
nem a landing publicada — é o roteiro de estrutura + copy pra uma peça nova,
evoluída do prompt de 06/09 (`2026-09-06-prompt-claude-design-nova-lp-vendas.md`).

## Contexto

- Produto pré-lançamento: zero tráfego pago/orgânico, zero material de mídia,
  zero prova social real ainda.
- Objetivo duplo: converter quem chegar por conta própria E deixar a página
  pronta pra aguentar tráfego pago quando ele começar.
- Comunicação principal **focada na versão web/desktop**. O app de celular é
  o diferencial (Granachat/Granabô + widgets, voz, foto de nota fiscal),
  nunca o centro da narrativa.
- Sem período de teste: todo CTA já é "Assinar agora", direto ao checkout
  Cakto. Nenhum fluxo de "criar conta grátis" separado da assinatura.
- Preço só aparece em UM lugar da página: o bloco de oferta (bloco 9).
- Restrição confirmada: lançamento por voz falhou em teste real no Firefox
  (relato do autor). A copy da versão web nunca menciona voz como ação
  imediata na página; voz só aparece como convite pro app (blocos 6 e 13).
- Reposicionamento central: a comunicação não é sobre "quanto você pode
  gastar" (framing de gastar até o limite), e sim sobre "quanto sobra pra
  você" no fim do mês. Isso afeta o Livre pra Gastar e qualquer menção a
  saldo disponível.
- **Regra de voz de marca (confirmada em `docs/superpowers/specs/2026-09-05-janelas-notificacao-design.md`
  e `docs/assistente-ia/2026-09-05-plano-assistente-zero-custo.md`, e coerente
  com as 40 notificações do catálogo canônico em `design-system/TOM_DE_VOZ.md`,
  nenhuma delas usa travessão): nenhuma frase de página usa travessão, nenhuma
  usa a construção "não é X, é Y" pra corrigir ou julgar o usuário. Aplica-se
  às frases de copy (headlines, corpo, respostas de FAQ/objeção); não se
  aplica à prosa interna deste documento (contexto, estrutura, checklist).

## Estrutura (13 blocos)

1. Herói *(web)*
2. CTA primário — Assinar agora
3. A dor
4. A solução — cole o texto, e o app organiza sozinho *(web)*
5. Panorama de ferramentas *(web)* — todas as funcionalidades básicas
6. E no seu bolso, ainda mais *(mobile)* — widgets, voz, foto de nota fiscal
7. Notificações e desafios
8. Granachat + Granabô *(mobile — diferencial principal)*
9. A oferta / Checkout
10. Quebra de objeções
11. Garantia
12. FAQ
13. CTA final + PS

---

## 1. Herói *(web)*

**Headline:** "O controle do seu dinheiro, na sua mão."

**Subheadline:** "Sem formulário, sem planilha, sem conectar banco. Só o seu
dinheiro, do seu jeito."

**Mockup:** painel web, tela Início, card "Livre para Gastar" com valor de
exemplo.

## 2. CTA primário

**"Assinar agora"** — sem preço na micro-copy (o preço mora só no bloco 9).
Leva direto ao checkout Cakto.

## 3. A dor

- "Você olha o extrato e pensa: 'o que aconteceu com meu dinheiro?' Sem
  lembrar direito onde ele foi."
- "Um dia vira o outro, os gastos somem da memória, e no fim do mês só
  resta o apagão financeiro: um monte de dinheiro que passou por você sem
  deixar rastro."
- "Sem enxergar o quadro completo, fica difícil fechar o mês com algo
  guardado pra você."

## 4. A solução — cole o texto, e o app organiza sozinho *(web)*

"Pra nunca mais perder o rastro do dinheiro: cole o texto de uma compra, um
extrato, um resumo de fatura. O Grana. organiza sozinho, sem formulário, sem
escolher categoria na mão."

*(Sem menção a voz aqui — ver nota de restrição no Contexto.)*

## 5. Panorama de ferramentas *(web)*

**Abertura:** "No Grana. você organiza suas metas nas caixinhas, acompanha
entradas e saídas, define tetos de gasto por categoria. E ainda assim
consegue ver quanto sobra pra você curtir seu lazer, sem culpa."

- **Cartão no seu ritmo:** a fatura segue o ciclo de fechamento real do seu
  cartão, não o mês do calendário. Mais de um cartão? Cada fatura fica
  isolada, sem se misturar.
- **Contas e boletos:** vencimento visível, marcar como pago em um toque,
  sem esquecer.
- **Caixinhas e metas:** separe dinheiro com intenção, pra ele sobrar onde
  você decidiu.
- **Tetos de gasto por categoria:** defina um limite pra cada categoria (o
  Grana. já sugere um, com base no seu perfil) e acompanhe sem precisar
  fazer conta.
- **Entradas e saídas organizadas:** veja o que entrou e o que saiu, sem
  misturar.
- **Categorização automática:** todo lançamento já chega organizado.
- **Livre pra Gastar:** um número só, sempre atualizado. Já desconta contas,
  parcelas e o que você reservou nas caixinhas.
- **Gráficos do mês:** comprometimento futuro e categorias, num relance.

## 6. E no seu bolso, ainda mais *(mobile)*

"Tudo que você já tem no computador, com três coisas a mais que só o app
traz:"

- **Widgets:** lance um gasto direto da tela inicial do celular, sem abrir
  o app.
- **Lançamento por voz:** fale o gasto, o app organiza.
- **Foto da nota fiscal:** aponte a câmera pro QR Code, pronto.

## 7. Notificações e desafios

- **Notificações que ajudam, não cobram:** no tom "Você sabia que...",
  avisando sobre um recurso que você ainda não experimentou. Nunca um
  alarme de gasto, nunca uma cobrança.
- **Score Grana:** uma nota de 0 a 1000 que mede só o que você controla, o
  hábito de registrar e o quanto do seu retrato financeiro já está
  completo. Um mês mais apertado não derruba a nota. O Score nunca vira um
  julgamento sobre a sua vida financeira, só sobre a sua constância em
  acompanhá-la.
- **Sequência de dias:** quantos dias seguidos você manteve o hábito,
  sempre visível, sem cobrança se ela quebrar.
- **Conquistas por hábito:** marcos como "Primeiro Registro", "Semana
  Blindada" e "Hábito Inquebrável" celebram constância financeira.

## 8. Granachat + Granabô *(mobile — diferencial principal)*

Bloco único e exclusivo, com chat simulado (reaproveita
`components/ConversaGranachat.tsx`, já existente e em produção na landing
atual). Chips clicáveis disparam uma conversa real:

| Chip | Pergunta | Resposta |
|---|---|---|
| Gasto por categoria | "Quanto gastei com mercado esse mês?" | "Você gastou R$ 412,80 com Mercado em setembro." |
| Fatura do cartão | "Minha fatura do cartão já fechou. Quanto ficou?" | "Sua fatura fechou em R$ 638,40, com vencimento dia 25." |
| Boletos | "Tenho algum boleto vencendo essa semana?" | "Você tem 1 boleto vencendo essa semana: R$ 180,00, dia 12." |
| Sobra do mês | "Quanto sobrou pra mim depois de tudo?" | "Depois de contas e parcelas já agendadas, sobram R$ 624,00 pra você neste mês." |

**Saudação inicial:** "Oi! Sou o Granabô. Pergunte sobre o seu dinheiro que
eu consulto e respondo. Testa um dos exemplos aí embaixo."

Copy da seção não descreve limitação nenhuma do assistente (decisão do
autor) — só o que ele efetivamente faz.

## 9. A oferta / Checkout

**Título:** "Seu assistente financeiro por menos de R$0,37 por dia" (número
matematicamente correto pro plano mensal, R$9,90; usado como título geral
por decisão do autor — ver nota no checklist).

**Reforço:** "Um único plano, com tudo incluído. Sem versão limitada, sem
recurso trancado atrás de outro preço."

**Preços:**
- **R$97,90/ano** — em destaque, plano principal.
- R$9,90/mês — alternativa.

**Botão:** "Assinar agora"

## 10. Quebra de objeções

- **"Meus dados bancários ficam seguros?"** → "O Grana. nunca se conecta ao
  seu banco nem usa Open Finance. Você registra por texto, voz ou apontando
  a câmera pro QR Code da nota. Nunca compartilha senha de banco com
  ninguém."
- **"E se o Grana. entender um lançamento errado?"** → "Acontece. O
  reconhecimento é automático e acerta na maioria das vezes, mas todo
  lançamento pode ser editado, e a categoria trocada a qualquer momento."
- **"Como o Livre pra Gastar é calculado?"** → "A partir do que você
  registrou, o Grana. desconta as contas que ainda vencem e o que você já
  separou nas caixinhas, e mostra o que sobra pelos dias que faltam. É uma
  referência que acompanha o seu dia a dia."
- **"O Grana. movimenta meu dinheiro?"** → "Não. O Grana. é um registro
  financeiro pessoal. Ele mostra pra onde seu dinheiro foi, com base no que
  você mesmo conta pra ele."
- **"Posso editar ou excluir meus dados?"** → "Pode. Todo lançamento é
  editável, e você pode excluir sua conta quando quiser, direto pelo app."
- **"Vou ter que ficar preenchendo formulário toda hora?"** → "Cole o texto
  de uma compra e o app organiza sozinho."
- **"E se eu esquecer de lançar?"** → "As notificações avisam, e o widget
  deixa o lançamento a um toque, sem abrir nada."

## 11. Garantia

"Sem contrato, sem fidelidade, sem letra miúda. Nos primeiros 7 dias, se
mudar de ideia, o reembolso é garantido. Depois disso, o cancelamento
continua livre, a qualquer momento, sem multa."

## 12. FAQ

- **Preciso conectar minha conta bancária?** Não. O Grana. nunca acessa
  banco nem Open Finance.
- **Funciona pra quem nunca usou app de finanças?** Sim. Comece colando um
  gasto, sem configurar nada antes.
- **Como funciona a assinatura?** É uma assinatura sem período de teste. Os
  valores e a forma de pagamento estão na seção acima.
- **Dá pra usar no celular e no computador com a mesma conta?** Sim.
- **Como cancelo?** Direto pelo app, a qualquer momento, sem multa.
- **Preciso instalar alguma coisa?** Não pra começar: o Grana. roda direto
  no navegador. Pra ter os recursos extras do bolso, como widgets, voz e
  foto de nota fiscal, é só baixar o app.
- **Quais as formas de pagamento?** [confirmar com o provedor de checkout
  antes de publicar]

## 13. CTA final + PS

**CTA:** "Assinar agora" (sem preço)

**PS:** "Você não precisa de mais uma planilha, nem de mais força de
vontade. Precisa só parar de perder o rastro do seu dinheiro. E no celular,
é só falar. O app organiza o resto."

---

## Checklist de claims a validar antes de publicar

- [ ] Confirmar formas de pagamento aceitas no checkout (FAQ, último item).
- [ ] Restrição de voz no Firefox: registrar como bug de produto a
      investigar, não como claim da landing (landing já não fala de voz
      como ação na página web).
- [ ] Nenhuma menção a WhatsApp em nenhum bloco (canal descontinuado).
- [ ] Nenhum valor de preço fora do bloco 9.
- [ ] Bloco 9: "menos de R$0,37 por dia" bate matematicamente com o plano
      mensal (R$9,90), não com o anual em destaque (R$97,90/ano ÷ 365 =
      R$0,268/dia, ou seja "menos de R$0,27/dia"). Usado como título geral
      por decisão explícita do autor — revisar antes de publicar se isso
      precisa de ajuste fino ou fica assim mesmo.
- [ ] Nenhuma conquista/streak citada que não exista de fato em
      `lib/gamification.ts` / `lib/gamification-infinite.ts`.
- [ ] Nenhuma frase de página usa travessão ou a construção "não é X, é Y"
      (regra de marca confirmada em specs de 05/09 e no catálogo de
      notificações — ver Contexto).
- [ ] Tracking sugerido: Pixel Meta + GA4, evento no clique do CTA principal
      e no clique do plano anual vs. mensal.
- [ ] LGPD: se houver captura de e-mail em algum ponto, checkbox de
      consentimento explícito.

---

## Prompt para gerar a landing (referências 21st.dev)

**Nota de stack**: os componentes de referência abaixo (21st.dev) são
React + Next.js + shadcn/ui + Tailwind + TypeScript — uma stack diferente da
do app (Expo + React Native Web). Este prompt gera um site novo e
independente, não um componente pra incorporar em `app/index.tsx`. Cole o
bloco `## PROMPT` inteiro na ferramenta de geração (Claude Design, v0,
lovable ou equivalente).

### PROMPT

Crie uma landing page de vendas completa em **React + Next.js + shadcn/ui +
Tailwind + TypeScript** para o **Grana.** (com o ponto final, sempre — faz
parte do nome), um app de finanças pessoais brasileiro por assinatura.

#### Sistema de design (aplicar à risca)

- Fundo: `#052229` · Superfície elevada: `#0b2d35` · Texto primário:
  `#effffa` · Texto secundário: `#a6d9ce` · Texto terciário: `#7fa9a0`
- Marca/destaque (uso moderado): `#aeffe3` · Ação primária/CTA: `#1fa98d`
- Entrada de dinheiro: `#74e291` · Saída de dinheiro: `#00a6ca` (nunca
  vermelho) · Destrutivo/atraso (nunca perto de valor de gasto): `#e08a7d`
- Tipografia: **Neue Machina**, só Light e Regular, nunca negrito simulado,
  nunca fonte de sistema
- Nunca branco, nunca cinza neutro em superfície nenhuma

#### Regra de voz (aplicar em toda copy da página)

Nenhuma frase usa travessão (—) nem a construção "não é X, é Y" pra
corrigir ou julgar quem lê. Tom empático, nunca de fiscal de gastos. Sem
urgência fabricada (contador, vaga limitada, "só hoje"). Sem prova social
inventada (produto pré-lançamento — omitir o bloco em vez de simular).
Comunicação focada na versão **web/desktop**; o app de celular aparece como
diferencial, nunca como o argumento central.

#### Estrutura e componentes de referência, bloco por bloco

1. **Herói** — background de `https://21st.dev/@amanshakya307/components/velaris`
   combinado com o layout de `https://21st.dev/@waleedkibhen/components/saa-s-template`.
   H1 com efeito shimmer de
   `https://21st.dev/@?/components/shimmer-text` (código completo abaixo,
   nesta mesma conversa) sobre o texto **"O controle do seu dinheiro, na
   sua mão."** Subheadline: "Sem formulário, sem planilha, sem conectar
   banco. Só o seu dinheiro, do seu jeito." CTA: botão "Assinar agora" com
   o efeito de `https://21st.dev/@designali-in/components/shiny-button`.
   Mockup do painel web ao lado ou abaixo do herói.

2. **A dor** — 3 blocos curtos, sem ícone genérico: "Você olha o extrato e
   pensa: 'o que aconteceu com meu dinheiro?' Sem lembrar direito onde ele
   foi." / "Um dia vira o outro, os gastos somem da memória, e no fim do
   mês só resta o apagão financeiro: um monte de dinheiro que passou por
   você sem deixar rastro." / "Sem enxergar o quadro completo, fica difícil
   fechar o mês com algo guardado pra você."

3. **A solução** — "Pra nunca mais perder o rastro do dinheiro: cole o
   texto de uma compra, um extrato, um resumo de fatura. O Grana. organiza
   sozinho, sem formulário, sem escolher categoria na mão." Sem menção a
   voz aqui.

4. **Panorama de ferramentas** — bento grid de
   `https://21st.dev/@avanishverma4/components/bento-grid-01`, com o efeito
   de destaque de `https://21st.dev/@jahed/components/spotlight-card` em
   cada célula. Abertura: "No Grana. você organiza suas metas nas
   caixinhas, acompanha entradas e saídas, define tetos de gasto por
   categoria. E ainda assim consegue ver quanto sobra pra você curtir seu
   lazer, sem culpa." Uma célula por item: Cartão no seu ritmo, Contas e
   boletos, Caixinhas e metas, Tetos de gasto por categoria, Entradas e
   saídas organizadas, Categorização automática, Livre pra Gastar, Gráficos
   do mês (textos completos de cada um na seção 5 deste documento).

5. **Telas internas do Grana.** — usar
   `https://21st.dev/@ravikatiyar162/components/circular-gallery` com
   mockup de celular pra exibir as telas reais do app em carrossel/galeria
   circular (Início, Crédito, Contas, Desafios).

6. **E no seu bolso, ainda mais** *(diferencial mobile)* — usar
   `https://21st.dev/@kokonutd/components/ai-voice-input` pra ilustrar a
   ferramenta de lançamento por voz. Texto: "Tudo que você já tem no
   computador, com três coisas a mais que só o app traz:" Widgets,
   Lançamento por voz, Foto da nota fiscal (textos completos na seção 6).

7. **Notificações e desafios** — Score Grana, sequência de dias, conquistas
   por hábito (textos completos na seção 7).

8. **Granachat + Granabô** — chat simulado com os 4 pares pergunta/resposta
   da seção 8 deste documento (reaproveitar a lógica de
   `components/ConversaGranachat.tsx`, adaptada pra React/shadcn).

9. **Oferta/Checkout** — componente
   `https://21st.dev/@?/components/pricing` (código completo nesta
   conversa), adaptado pra **BRL** e para os valores reais: **R$97,90/ano**
   em destaque (plano principal, "Popular") e R$9,90/mês como alternativa.
   Sem menção a trial nem stack de bônus (o produto não tem nenhum dos
   dois). Título: "Seu assistente financeiro por menos de R$0,37 por dia."
   Reforço: "Um único plano, com tudo incluído. Sem versão limitada, sem
   recurso trancado atrás de outro preço." Botão "Assinar agora" com o
   efeito shiny-button.

10. **Quebra de objeções**, **Garantia**, **FAQ** — textos completos nas
    seções 10, 11 e 12 deste documento.

11. **CTA final + PS** — texto completo na seção 13 deste documento.

#### Mobile-first

Público majoritariamente mobile mesmo com o site sendo sobre a versão web
do produto. Testar em 390px antes de qualquer largura maior.

#### Ao final, inclua

Uma nota técnica separada listando: (a) todo claim que precisa de
confirmação antes de publicar (ver checklist acima), (b) sugestão de
tracking (Pixel Meta + GA4, evento no clique do CTA principal e no clique
do plano anual vs. mensal).

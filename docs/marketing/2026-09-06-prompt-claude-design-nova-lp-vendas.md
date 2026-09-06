# Prompt para o Claude Design — nova LP de vendas do Grana., com mockups reais

Gerado em 2026-09-06, a partir do `context.md`/`DESIGN.md`/`PRODUCT.md` do
projeto + o skill de copy `copy-lp-queiroz` (framework de 15 blocos:
Cialdini, Heath, Sullivan, Schwartz, Whitman, Hormozi), adaptado porque o
skill é calibrado pra infoproduto (curso/mentoria) e o Grana. é um SaaS de
assinatura com marca deliberadamente calma — as adaptações estão marcadas
abaixo, não é a receita padrão do skill aplicada sem ajuste.

Cole o bloco `## PROMPT` abaixo inteiro no Claude Design.

---

## PROMPT

Crie uma landing page de vendas completa para o **Grana.** (com o ponto
final, sempre — faz parte do nome), um app de finanças pessoais brasileiro.
Preciso de **bastante mockup de telas reais de dentro do aplicativo** — não
ilustração genérica, telas de verdade da interface, sem moldura de
dispositivo (como a Linear expõe produto: flutuando, não dentro de um iPhone
desenhado).

### O produto

Grana. elimina a fricção de anotar gasto. Em vez de formulário ou planilha,
a pessoa registra um lançamento de três jeitos: **falando** (microfone
dentro do app), **mandando mensagem no WhatsApp** (texto ou áudio, pra um
número comercial verificado pela Meta), ou **fotografando o QR Code** de uma
nota fiscal (NFC-e). O app categoriza sozinho. O diferenciador central é o
cálculo de **"Livre para Gastar"** — quanto sobra pra gastar agora,
descontando contas e parcelas futuras já agendadas — em vez de só mostrar um
extrato do que já aconteceu.

**Nunca se conecta a banco nem Open Finance.** É sempre autodeclarado —
restrição de privacidade deliberada, é isto que permite os três jeitos de
entrada sem pedir credencial nenhuma. Esse é o mecanismo que resolve a
objeção mais óbvia ("meus dados bancários ficam seguros?") antes mesmo de
ela ser feita: a resposta é que o banco nunca entra na equação.

**Público**: público geral no Brasil que acha o registro manual de gastos
trabalhoso e por isso desiste (de planilha, de app tradicional) — não um
nicho estreito. Quer saber pra onde o dinheiro foi e quanto sobra, sem que
isso vire uma segunda tarefa administrativa.

**Oferta real**: assinatura de **R$ 9,90/mês**, sem período de teste
gratuito, cancelável a qualquer momento (sem multa). Ainda não há
depoimento, case ou imprensa reais — é produto pré-lançamento.

### Adaptações ao framework de copy (leia antes de escrever)

Este projeto segue um framework de 15 blocos calibrado pra infoproduto
(curso/mentoria), mas a marca do Grana. tem regras que reescrevem como cada
bloco se comporta:

- **Sem urgência/escassez fabricada.** Nada de contador regressivo, vaga
  limitada inventada ou "só hoje". Se não houver escassez REAL (não há), o
  bloco 12 do framework original (urgência) fica de fora ou vira algo
  honesto como o preço de lançamento sendo o preço de sempre.
- **Sem selo, sem confete, sem badge de gamificação.** A confiança do
  Grana. vem de consistência silenciosa, não de efeito visual.
- **Sem vermelho em dado financeiro.** "Você gastou" nunca é tratado como
  evento negativo — gasto usa ciano (`#00a6ca`), nunca vermelho de alarme.
  Vermelho/salmão (`#e08a7d`) só existe pra ação destrutiva (excluir conta),
  nunca perto de um valor de gasto.
- **Prova social honesta.** Sem depoimento real ainda — usar placeholders
  claramente marcados (`[ESPAÇO PRA DEPOIMENTO — resultado específico]`),
  nunca inventar nome, foto ou resultado.
- **Garantia vira "sem prisão", não "dinheiro de volta".** Não é um produto
  de reembolso de 30 dias — é assinatura mensal simples. A garantia real é
  "cancele quando quiser, sem multa, sem letra miúda, direto pelo app".
- **Oferta sem stack de valor artificial.** Nada de "bônus 1 + bônus 2 +
  valor total R$X, hoje por R$Y" — é um preço mensal único e honesto,
  R$ 9,90/mês.
- **Mockups de tela são a prova, não o depoimento.** Onde o framework pediria
  "prova social" pesada, priorize mostrar a MECÂNICA do produto funcionando
  — a tela real fazendo o que promete — porque é a prova mais forte
  disponível antes do lançamento ter usuários.

### Estrutura da página (adaptada do framework de 15 blocos)

1. **Herói (headline + subheadline + mockup em destaque)** — título direto
   sobre o resultado ("saiba quanto pode gastar hoje", não sobre o
   mecanismo). Mockup grande da tela de **Início**, mostrando o card "Livre
   para Gastar" com um valor de exemplo, sem moldura de dispositivo, sombra
   profunda (`0 32px 80px -16px rgba(0,0,0,0.55), 0 0 0 1px
   rgba(174,255,227,0.07)`). 3 variações de headline pra escolher, ângulos
   diferentes (resultado / alívio da tarefa chata / privacidade).
2. **CTA primário** — "Criar minha conta" (não "Comprar" — hoje quem cria
   conta já usa o produto). Micro-copy abaixo: "R$ 9,90/mês • cancele
   quando quiser".
3. **A dor** — 4-6 bullets curtos sobre o cansaço de anotar gasto: esquecer
   de lançar, abandonar a planilha na segunda semana, não saber quanto
   sobra sem abrir a calculadora.
4. **A solução, com os três mockups de entrada lado a lado** — tela do
   microfone ativo, tela de conversa no WhatsApp com um lançamento sendo
   reconhecido, tela da câmera lendo o QR Code da nota. Estas três imagens
   são o coração visual da página.
5. **Benefícios (não features)** — traduzir cada mecanismo em consequência
   real: "categorização automática" vira "você nunca mais organiza
   categoria na mão"; "Livre para Gastar" vira "você sabe se pode gastar
   AGORA, não só o que já gastou".
6. **Mockup do Granabô** (assistente de IA dentro do app) — tela de
   conversa real, mostrando uma pergunta em linguagem natural sendo
   respondida com um número real do próprio histórico da pessoa.
7. **Prova social** — bloco de placeholders, marcado como tal (ver
   adaptação acima). Se houver algum número real disponível (ex.: contagem
   de espera, usuários no acesso antecipado), usar; senão, omitir o bloco
   inteiro em vez de inventar.
8. **A oferta** — preço único R$ 9,90/mês, sem trial, sem stack de bônus.
9. **Quebra de objeções**, no mínimo estas três, no formato "Mas
   [objeção]... [resposta que desarma]":
   - "Meus dados bancários ficam seguros?" → nunca conecta a banco, nunca
     pede senha nem número de cartão.
   - "Vou ter que ficar preenchendo formulário toda hora?" → fala, manda
     áudio ou tira foto; o app organiza sozinho.
   - "E se eu esquecer de lançar?" → WhatsApp fica sempre aberto, é mais
     rápido que abrir qualquer app.
10. **Garantia (adaptada)** — "Cancele quando quiser, sem multa. Sem
    período mínimo, sem letra miúda."
11. **FAQ** — 5-6 perguntas que empurram decisão sem prometer o que o
    produto não faz: funciona sem conectar banco? o WhatsApp é mesmo
    oficial? funciona pra quem nunca usou app de finanças? quais as formas
    de pagamento da assinatura?
12. **CTA final** — resumir a promessa (saber quanto sobra pra gastar, sem
    esforço) + botão.
13. **PS de fechamento** — recapitular o mecanismo central (voz/WhatsApp/QR
    → sem conectar banco → Livre para Gastar) numa frase.

### Sistema de design (aplicar à risca, sem inventar variação)

**Paleta** — nunca branco, nunca cinza neutro:
- Fundo: `#052229` (petróleo profundo)
- Superfície elevada: `#0b2d35`
- Texto primário: `#effffa`
- Texto secundário: `#a6d9ce`
- Texto terciário/placeholder: `#7fa9a0`
- Marca/ação em foco (usar com moderação — é a cor mais chamativa da
  paleta): `#aeffe3`
- CTA de venda (só este botão usa glow de cor): `#1fa98d`, sombra
  `0 10px 32px -8px rgba(31,169,141,0.6)`
- Entrada de dinheiro: `#74e291` · Saída de dinheiro: `#00a6ca` (nunca
  vermelho)
- Destrutivo/atraso (nunca perto de valor de gasto): `#e08a7d`
- Bordas: `rgba(175,255,227,0.14)` padrão, `rgba(175,255,227,0.26)` quando
  precisa de mais presença

**Tipografia** — Neue Machina é a ÚNICA fonte, em todo o texto da página,
sem exceção (nunca fonte de sistema, nunca uma segunda família). Só existem
dois pesos: Light e Regular — nunca simular bold. Título do herói em escala
fluida grande (`clamp(34px, 2.6vw + 16px, 56px)`), pensado pra ocupar a
primeira dobra de tela cheia.

**Forma**: cantos em 8/12/16/22px e pílula (999px) só pra botão de CTA.
Cards de recurso e o card do herói podem ter sombra pesada (`0 16px 40px
-12px rgba(0,0,0,0.5)` recurso, a fórmula do herói acima pro card
principal) — landing page é o único lugar do sistema onde sombra pesada é
correta; dentro do app real ela quase não existe.

**Mockups de tela**: são o elemento visual central da página, não
decoração ao lado do texto. Reaproveitar a linguagem visual real do app
(fundo escuro, a mesma paleta, Neue Machina nos rótulos das telas também) —
nunca inventar uma versão mais "bonita"/genérica de fintech com fundo
branco. Uma tela mockada errada (fundo claro, fonte diferente, vermelho em
gasto) quebra a promessa de "é o produto de verdade", que é o argumento
mais forte disponível antes de haver prova social real.

### Mobile-first

Público majoritariamente mobile. Parágrafos curtos (3 linhas), headline até
8 palavras quando possível, CTA com texto curto o bastante pra caber num
botão, sem tabela larga.

### Ao final, inclua

Uma nota curta separada (fora da página, é briefing técnico) listando: (a)
todo claim que precisa de prova antes de publicar, (b) onde entra o
checkbox de consentimento LGPD se houver formulário de e-mail, (c) sugestão
de tracking (Pixel Meta + GA4, evento no clique do CTA principal).

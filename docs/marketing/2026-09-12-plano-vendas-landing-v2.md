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
- Preço só aparece em UM lugar da página — o bloco de oferta.
- Restrição confirmada: lançamento por voz falhou em teste real no Firefox
  (relato do autor). A copy da versão web nunca menciona voz — voz só
  aparece no bloco mobile (bloco 6), onde o app garante o comportamento.

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

**Headline — 3 opções:**
- A) **"Saiba, agora, quanto você pode gastar."** — sobre o resultado (Livre
  pra Gastar), não sobre o mecanismo.
- B) **"Pare de fazer conta de cabeça antes de comprar."** — sobre a dor.
- C) **"Seu dinheiro, sem conectar sua conta a nada."** — sobre privacidade,
  ângulo pouco explorado por concorrentes que usam Open Finance.

**Subheadline:** "O Grana. mostra quanto sobra pra gastar hoje — descontando
contas e parcelas que já estão agendadas — sem pedir a senha do seu banco."

**Mockup:** painel web, tela Início, card "Livre para Gastar" com valor de
exemplo.

## 2. CTA primário

**"Assinar agora"** — sem preço na micro-copy (o preço mora só no bloco 9).
Leva direto ao checkout Cakto.

## 3. A dor

Bullets curtos (3-5 linhas cada):
- "Anotar todo gasto na hora é a primeira coisa que você para de fazer."
- "A planilha dura duas semanas. Depois vira um arquivo que ninguém abre."
- "Você sabe o que já gastou. Não sabe se pode gastar mais até o fim do mês."

## 4. A solução — cole o texto, e o app organiza sozinho *(web)*

"Cole o texto de uma compra, um extrato, um resumo de fatura. O Grana.
identifica valor, categoria e data sozinho — sem formulário, sem escolher
categoria na mão." Mockup: tela de colar comprovante, com o resultado
categorizado ao lado.

*(Sem menção a voz aqui — ver nota de restrição no Contexto.)*

## 5. Panorama de ferramentas *(web)*

Visão completa, um parágrafo curto por item (não é mais "superficial" —
cobre tudo que existe na versão web):

- **Cartão no seu ritmo** — a fatura segue o ciclo de fechamento real do seu
  cartão, não o mês do calendário. Mais de um cartão? Cada fatura fica
  isolada, sem se misturar.
- **Contas e boletos** — vencimento visível, marcar como pago em um toque,
  sem esquecer.
- **Cofrinho e metas** — separe dinheiro com intenção, não só guarde o que
  sobrou.
- **Categorização automática** — todo lançamento já chega organizado.
- **Livre pra Gastar** — o card do herói, sempre atualizado.
- **Gráficos do mês** — comprometimento futuro e categorias, num relance.

## 6. E no seu bolso, ainda mais *(mobile)*

"Tudo que você já tem no computador, com três coisas a mais que só o app traz:"
- **Widgets** — lance um gasto direto da tela inicial do celular, sem abrir
  o app.
- **Lançamento por voz** — fale o gasto, o app organiza.
- **Foto da nota fiscal** — aponte a câmera pro QR Code, pronto.

## 7. Notificações e desafios

Breve, um parágrafo cada:

- **Notificações que ajudam, não cobram** — lembretes no tom "Você sabia
  que..." apontando um recurso que você ainda não usou, nunca um alarme de
  gasto.
- **Desafios e conquistas** — constância vira progresso visível: sequência de
  dias, conquistas por hábito (nunca por gastar mais).

## 8. Granachat + Granabô *(mobile — diferencial principal)*

Bloco único e exclusivo. "Pergunte sobre o seu dinheiro, na linguagem que
você já usa — 'quanto gastei com mercado esse mês?' — e receba resposta com
o dado real do seu histórico, na hora." Mockup: conversa real dentro do app.
Nunca promete que "nunca erra" — descreve o que ele realmente faz (responde
com base no que foi registrado, pede esclarecimento quando falta categoria).

## 9. A oferta / Checkout

Único bloco com preço:

- **R$97,90/ano** — em destaque, plano principal.
- R$9,90/mês — alternativa, texto menor.
- Sem período de teste. Sem stack de bônus. Um preço, honesto.

## 10. Quebra de objeções

Formato "Mas [objeção]... [resposta]":
- "Meus dados bancários ficam seguros?" → O Grana. nunca se conecta ao seu
  banco. Não pede senha, não pede número de cartão.
- "Vou ter que preencher formulário toda hora?" → Cole o texto de uma
  compra e o app organiza sozinho.
- "E se eu esquecer de lançar?" → As notificações avisam, e o widget deixa o
  lançamento a um toque, sem abrir nada.

## 11. Garantia

"Cancele quando quiser, sem multa. Sem período mínimo, sem letra miúda,
direto no app."

## 12. FAQ

- Preciso conectar minha conta bancária? Não — o Grana. nunca acessa banco
  nem Open Finance.
- Funciona pra quem nunca usou app de finanças? Sim — comece colando um
  gasto, sem configurar nada antes.
- Quais as formas de pagamento? [confirmar com Cakto antes de publicar]
- Dá pra usar no celular e no computador com a mesma conta? Sim.
- Como cancelo? Direto pelo app, a qualquer momento, sem multa.

## 13. CTA final + PS

CTA: "Assinar agora" (sem preço).
PS: "Cole um gasto, veja o quanto sobra pra hoje. É isso que o Grana. faz."

---

## Checklist de claims a validar antes de publicar

- [ ] Confirmar formas de pagamento aceitas na Cakto (FAQ item 3).
- [ ] Restrição de voz no Firefox: registrar como bug de produto, não como
      claim da landing (landing já não fala de voz no bloco web).
- [ ] Nenhuma menção a WhatsApp em nenhum bloco (canal descontinuado).
- [ ] Nenhum valor de preço fora do bloco 9.
- [ ] Nenhuma conquista/streak citada que não exista de fato em
      `lib/gamification.ts` / `lib/gamification-infinite.ts`.
- [ ] Tracking sugerido: Pixel Meta + GA4, evento no clique do CTA principal
      e no clique do plano anual vs. mensal.
- [ ] LGPD: se houver captura de e-mail em algum ponto, checkbox de
      consentimento explícito.

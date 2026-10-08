# Configuração da Meta (página e tráfego pago): checklist

Escrito em 27/09/2026, a pedido do autor, depois da pergunta "Quais dessas APIs
vamos precisar para configurar a página do Grana. na Meta? Incluindo a
configuração do tráfego pago".

Legenda: **[Autor]** só o autor faz, porque exige login no painel da Meta ou da
Cakto, cartão ou decisão de negócio. **[Agente]** um agente pode fazer, no
repositório ou com um acesso que o autor conceder na sessão.

> **Anúncio pago continua parado** até o autor decidir sobre a conta da Meta.
> Nada é publicado antes do dia D. Este checklist deixa tudo pronto para ligar,
> e não liga nada.

## Das APIs listadas, só uma entra

| Artigo da Meta | Precisa? | Por quê |
|---|---|---|
| Sobre a API de Conversões | Ler | É a que manda a venda para a Meta. |
| Comparar as opções de configuração | Ler | Confirma que a opção é "integração com parceiro" (Cakto). |
| Implementar… instruções personalizadas | Ler só a parte do token | O token de acesso é o que se cola na Cakto. |
| Como preparar sua empresa | Ler | Portfólio, domínio e dataset, na ordem certa. |
| Recomendações de desempenho | Depois | Só com campanha rodando. |
| API de Anúncios (Marketing API) | Não | Serve para criar anúncio por código. O Gerenciador de Anúncios basta. |
| Conversions API Gateway | Não | Servidor próprio na nuvem, pago à parte. A Cakto já faz esse papel. |
| API de eventos offline | Não | Venda em loja física. |
| GTM server-side | Não | Exigiria contêiner de servidor. Sem necessidade. |
| Migração do WhatsApp Local para Cloud | Não | Assunto do bot, não do tráfego. |

## Passo a passo

### 1. Portfólio empresarial — [Autor]
- [ ] Criar (ou confirmar) o portfólio empresarial em business.facebook.com.
- [ ] Ligar a Página do Grana. e a conta do Instagram ao portfólio.
- [ ] Dar acesso de administrador a uma segunda pessoa de confiança, para a
      conta não depender de um login só.

### 2. Conta de anúncios — [Autor]
- [ ] Criar a conta de anúncios dentro do portfólio, moeda BRL, fuso de
      Brasília.
- [ ] Cadastrar a forma de pagamento. **Não** criar campanha ainda.

### 3. Verificação do domínio `granaponto.com.br` — [Autor] + [Agente]
- [ ] **[Autor]** Em Configurações do negócio → Segurança da marca → Domínios,
      adicionar `granaponto.com.br` e escolher o método "registro TXT de DNS".
      Copiar o valor que a Meta mostrar.
- [ ] **[Agente]** Criar o registro TXT no DNS do domínio, com o valor que o
      autor passar na sessão. Onde o DNS mora (Vercel ou registrador) é o
      primeiro item a conferir; se for na Vercel, o agente usa o
      `VERCEL_TOKEN` do `.env` da máquina, sem imprimir o valor (regra 15).
- [ ] **[Autor]** Clicar em "Verificar" no painel. A propagação pode levar de
      minutos a algumas horas.

Por que vem antes do resto: sem domínio verificado a Meta limita quais eventos
de compra podem otimizar a campanha.

### 4. Dataset (Pixel) — [Autor]
- [ ] No Gerenciador de Eventos, criar um dataset com o nome "Grana." e
      ligá-lo à conta de anúncios.
- [ ] Anotar o ID do dataset. O ID não é segredo; o token do passo 5 é.

### 5. API de Conversões pela Cakto — [Autor]
- [ ] No dataset, em Configurações → API de Conversões → "Gerar token de
      acesso". Copiar o token **direto para a Cakto**.
- [ ] Na Cakto, abrir as integrações do produto e procurar a da Meta/Facebook,
      colar o ID do dataset e o token.
      *Não conferido:* o nome exato do campo e se a Cakto aceita token de API
      de Conversões ou só o ID do Pixel. Ninguém abriu esse painel ainda.
- [ ] Fazer uma compra de teste (ou usar o "Testar eventos" do Gerenciador) e
      confirmar que chega um evento `Purchase`.
- [ ] O token **nunca** vai para o repositório, o vault, mensagem de commit ou
      conversa com agente. Se precisar guardar, só no gerenciador de senhas
      do autor.

### 6. Evento de otimização — [Autor]
- [ ] Na hora de criar a campanha (depois do dia D), objetivo Vendas,
      otimizando para `Purchase` do dataset "Grana.".

## O que já existe no código

- **A landing já repassa a atribuição para o checkout.**
  `PARAMETROS_ATRIBUICAO` e `comAtribuicao()` em `app/index.tsx` copiam
  `utm_*`, `gclid` e `fbclid` do endereço da landing para o link da Cakto. É
  isso que permite à Cakto devolver à Meta qual anúncio gerou a venda.
- **A política de privacidade já declara esse repasse.** `lib/legal-content.ts`
  explica que `gclid`/`fbclid`/`utm` acompanham o link até a compra e que
  Google e Meta recebem só o identificador do clique e o fato da compra.
- **Não há Pixel na landing.** Nenhum script da Meta roda em
  `granaponto.com.br` hoje.

## Opcional: Pixel na landing — [Agente], só com decisão do autor

O Pixel no navegador mede visita e clique no botão de compra, o que ajuda a
Meta a otimizar antes de haver volume de vendas. Custa:

- [ ] **[Autor]** decidir se quer. Sem decisão, fica como está.
- [ ] **[Agente]** instalar o script com o ID do dataset (o ID pode ser
      público; o token do passo 5 não entra).
- [ ] **[Agente]** atualizar `lib/legal-content.ts`: hoje o texto diz que só
      quem chega por anúncio carrega identificador, o que deixa de ser verdade
      com Pixel. Precisa citar o cookie da Meta e para que serve.
- [ ] **[Agente]** aviso de cookies na landing, com opção de recusar, antes de
      carregar o script (LGPD).

## Fora deste checklist

- Criação de campanhas, públicos e orçamento.
- Criativos: ver `GUIA-DE-PRODUCAO-DE-CRIATIVOS.md`. Nos anúncios, nada de
  banco ou Open Finance, e preço só como "menos de R$ 0,37 por dia".

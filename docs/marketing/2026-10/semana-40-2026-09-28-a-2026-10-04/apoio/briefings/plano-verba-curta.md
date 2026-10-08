# Plano de verba curta · Flare · 30/09/2026 · RASCUNHO 1 (antes da matriz e do questionamento do Beacon)

**Pausa da regra 21 (`032d375`):** a liberação histórica de produção e as fases abaixo estão suspensas. Nenhuma produção antes de 03/10; só em 03/10 e 04/10, hora de Brasília, com pedido do autor naquela sessão. Fora desses dias, pausa até nova abertura pelo autor. Ver [README](../README-MATERIAL-FINAL.md). Este plano não autoriza gasto.

Só plano. Nada foi publicado, criado ou gasto na Meta. Nada aqui vale antes do dia D (build 1.10.5 publicada e testada). Produção de peças pode seguir; publicação e verba, não.

Fontes lidas: ticket `TICKET-MKT-PLATAFORMAS.md`, vault `04 - Tráfego/Plano de Tráfego Pago - Primeiros 100 Assinantes` (revisado em 26/09, com a produção estática encerrada e a mídia suspensa), `05 - Vendas/Preço Vigente e Parcelamento - Cakto` (revisado em 13/09). Onde este plano diz "depende da matriz", falta o `matriz-plataformas.md` do Meridian, que ainda não existe. Quem aponta o que a web faz ou não faz é ele, não eu.

## 1. A conta que decide o plano

O ticket já diz: as primeiras vendas podem nem vir do tráfego. A nota de preço confirma por quê.

- Margens e receitas líquidas internas não são reproduzidas neste pacote público. Para a conta de aquisição, consultar a nota "Preço Vigente e Parcelamento - Cakto" e reconferir taxas e condições antes de decidir. Na copy, a única menção de preço permitida continua "menos de R$ 0,37 por dia".
- O plano de tráfego já registrava que assinatura de ticket baixo vendida a público frio custa de R$ 40 a R$ 120 por venda, faixa de mercado e não medida no Grana.
- A hipótese histórica favorece o plano anual para suportar custo de aquisição nessa faixa. Não foi validada com taxas ou mix atuais. Com verba curta, o teste precisa comparar o custo com a receita líquida do plano escolhido e medir o mix mensal/anual, não só quantas compras saem.
- Hipótese, não fato: o teto de custo por compra que faz sentido é o que se paga em até 3 meses de comissão do plano que a pessoa comprou. Isso vira número só depois do teste medir o mix mensal/anual.

## 2. Ordem: orgânico, depois teste pago mínimo, depois decisão

**Fase 0 · antes do dia D (produção e preparo, custo zero de verba)**
- Peças para os três públicos prontas e aprovadas (o inventário está em `inventario-criativos.md`; o que refazer primeiro está no `plano-3-publicos.md`, que espera a matriz).
- Landing com UTM por origem e por peça (a landing já repassa UTM e `fbclid` ao checkout).
- Nenhum centavo antes destes itens, todos da frente do Keel (`plano-meta-api.md`): Pixel com consentimento LGPD, evento `InitiateCheckout` no clique do plano, `Purchase` com valor vindo do webhook da Cakto. Sem eles a verba compra clique e não aprende nada.

**Fase 1 · orgânico primeiro (D até D+14)**
- Canais: os que a decisão de 25/09 permite. Vídeo curto com personagem fictício e voz da ElevenLabs, tela do app sempre captura real com dados de exemplo. Sem WhatsApp, sem o rosto do autor, sem conexão bancária.
- Rede de conhecidos, comunidades e LinkedIn: o plano antigo listava também "grupos". Fica proibido grupo de WhatsApp. Trocar por comunidades de outras plataformas, e a decisão de expor a rede pessoal do autor é dele.
- Afiliados e criadores por comissão: custo zero de verba. Ainda ninguém conferiu no painel da Cakto se o programa está ativo nem qual comissão cabe na margem. É o primeiro item a conferir.
- O que medir, sem Pixel: visitas por UTM, cliques em planos, compras na Cakto por origem. Sem número por peça, ninguém sabe o que virar anúncio.

**Fase 2 · teste pago mínimo (só se a porta abrir, ver seção 3; a partir de D+15)**
- Uma campanha, um conjunto de anúncios, objetivo Vendas para o site, otimizando para `InitiateCheckout` (hipótese do rascunho antigo, não confirmada nesta revisão; objetivo, eventos e exigências atuais dependem de conferência operacional).
- **Não fragmentar em três conjuntos, um por público.** Com verba de poucos reais por dia, cada conjunto fica sem dado. Os três públicos entram como três ângulos de criativo dentro do mesmo conjunto, cada um com a sua UTM. É hipótese minha; quem confirma como a Meta trata isso é o `plano-meta-api.md`.
- Destino sempre a landing, nunca o arquivo `.apk` (a Meta proíbe página de destino que baixa arquivo sozinha). Para o iPhone e o computador o destino é a mesma landing, e a promessa é a que a matriz confirmar.
- Verba proposta, **menor** que a do plano antigo, que era R$ 100 por semana:

| Etapa | Verba | Quando | Para que serve |
|---|---|---|---|
| Sonda de aprovação | R$ 7 por dia, 7 dias (R$ 49) | D+15 a D+21 | Testar se a conta nova aprova o anúncio, com a menor exposição de banimento. Nada de editar por 7 dias. |
| Teste de criativo | R$ 14 por dia, 7 dias (R$ 98) | D+22 a D+28, só se a sonda passou | Descobrir qual dos três ângulos tem o menor custo por `InitiateCheckout`. |
| Decisão | zero | D+29 | Ler os números e escolher parar, manter ou escalar. |

Total do teste: R$ 147 em 14 dias. O pré-pago por Pix vale como teto físico: adicionar saldo em partes pequenas, e o gasto para quando o saldo acaba. Como o Pix pré-pago funciona no Gerenciador é pergunta para o Keel.

## 3. Portas: quando o pago pode começar

Só abre se os quatro sinais forem verdadeiros, medidos no orgânico:
1. Build 1.10.5 publicada e testada pelo QA (dia D declarado pelo QA, não por mim).
2. Visita da landing que vira clique em plano acima de 5% (número de mercado do plano antigo, a recalibrar).
3. Pelo menos uma compra real vinda de origem orgânica, para provar que o checkout fecha do começo ao fim (a nota de preço lembra que a integração da Cakto teve poucas vendas reais até hoje).
4. Pixel e `InitiateCheckout` medidos no Gerenciador de Eventos (frente do Keel).

Se o sinal 2 ou 3 falhar, o problema é a página ou a oferta, e anúncio só paga para mostrar o problema a mais gente. A verba não abre.

## 4. Quando parar, manter e escalar

Limites iniciais, de mercado e não medidos no Grana. Recalibrar ao fim da sonda (mesmos números do plano antigo):

| Sinal | Limite | Decisão |
|---|---|---|
| CTR de link | abaixo de 0,8% | o gancho não segura: trocar o criativo |
| Custo por `InitiateCheckout` | acima de R$ 25 | trocar o criativo |
| Visita que vira checkout | abaixo de 5% | o problema é a página, não o anúncio: parar o pago e consertar a página |
| Checkout que vira compra | abaixo de 20% | o problema é o checkout ou a oferta: parar o pago |

**Parar tudo, sem esperar os 7 dias:**
- A Meta reprovar ou limitar a conta ou o anúncio. Não abrir segunda conta, não recorrer em laço nem publicar o mesmo criativo em outra conta para contornar uma restrição.
- O anúncio prometer algo que a matriz do Meridian não confirma como "funciona" na plataforma do público que ele mira.
- O checkout ou o acesso pós-compra quebrar (o pago só compra a falha).
- Saldo pré-pago zerado: não recarregar por reflexo, decidir de novo.

**Manter:** o custo por `InitiateCheckout` fica entre os limites acima, mas ainda não houve compra vinda do anúncio. Segue mais 7 dias com a mesma verba.

**Escalar, com teto:** só se houver pelo menos 2 compras atribuídas ao anúncio E custo por compra dentro do teto da seção 1 (medido pelo mix real mensal/anual). Aumentar no máximo 20% por vez, uma vez por semana, porque mudança acima disso reinicia o aprendizado (prática de mercado, conferir). Nunca mais de R$ 100 por semana sem nova decisão do autor, que é o parâmetro dele em 22/09.

## 5. O que não fazer com a verba
- Impulsionar publicação sem UTM: gasta e não deixa recibo.
- Campanha de instalação de app: a Meta pede app na loja, e o Grana. é APK fora da loja.
- Declarar a categoria especial de serviços financeiros sem a Meta pedir (trava idade, gênero e interesses). Se ela sugerir, parar e reavaliar.
- Pagar criador antes de a comissão da Cakto estar conferida.

## 6. O que só o autor pode decidir ou fazer
- Se a verba de teste (R$ 147) é aceitável, ou se prefere zero pago até haver 5 compras orgânicas.
- Identidade, pagamento e 2FA da conta nova (item do Keel, `plano-meta-api.md`).
- Se expõe a rede pessoal dele nos canais orgânicos.

## 7. O que ficou sem verificação
- Nenhum custo por clique, por checkout ou por compra do Grana. existe medido: a faixa de R$ 40 a R$ 120 é de mercado.
- Se a Cakto tem pixel nativo com API de Conversões e se o programa de afiliados está ativo (não conferi, o autor decidiu não mexer nessa frente).
- Como o Pix pré-pago da Meta se comporta e se a segmentação por dispositivo (Android, iPhone, computador) é boa ideia com essa verba. As duas são do Keel.
- A divisão 70% web e 30% app vale para mensagem e peças, não para verba: com R$ 14 por dia não há como dividir em conjuntos. A calibragem da mensagem por público depende da matriz.

## Adendo editorial e fontes

COPYS-FINAIS é a única fonte comercial deste pacote. O plano não reativa estáticos, não cria público exclusivo de iPhone, não libera voz web e não autoriza gasto. A fonte única de preço foi lida na finalização anterior, segundo o README, no vault em 30/09, revisado 13/09; cálculos internos devem ser reconferidos antes de uma decisão. Q4 exige preço e condições atuais de Cakto e página de planos. Os limites de CTR, custo, conversão, aprendizado e escala acima não foram medidos no Grana. nem verificados como recomendações atuais.

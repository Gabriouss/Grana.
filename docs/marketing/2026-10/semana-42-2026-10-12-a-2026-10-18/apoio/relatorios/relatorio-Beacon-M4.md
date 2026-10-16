# Relatório Beacon M4 — proposta de eventos Pixel/CAPI

- **Data:** 16/10/2026
- **Responsável:** Beacon (Marketing/Growth)
- **Estado:** proposta para decisão do autor. **Ativação:** nada instalado, publicado em produção ou enviado à Meta.
- **Escopo:** proposta para a landing pública `/` e para a compra da assinatura pela Cakto: `PageView`, `ViewContent`, `InitiateCheckout` e `Purchase`. `/baixar`, `site-vendas/`, cadastro e todas as áreas privadas ficam fora até terem rota/estado de publicação e escopo aprovados.

## Decisão proposta

Medir somente a navegação da landing pública e a compra da assinatura do Grana., com consentimento prévio para publicidade, conforme a proposta M5. Não instrumentar cadastro, login, redefinição de senha, app autenticado, painel, feedbacks nem enviar eventos sobre lançamentos, contas, cartões, carteiras, saldos, voz, fotos ou uso do Granabô. A recusa de rastreamento deve deixar a landing, o cadastro e a compra utilizáveis.

Usar o Pixel apenas para eventos de navegação e intenção na landing. O caminho proposto para `Purchase` é a integração nativa da Cakto descrita no checklist existente; ela ainda não foi conferida. Não habilitar Pixel/CAPI da Cakto até demonstrar que o consentimento chega ao checkout e que o payload real respeita a lista aprovada. A liberação da CAPI precisa de decisão própria, separada da aprovação do Pixel. Não há decisão nesta proposta sobre contar apenas a primeira cobrança ou também renovações, nem sobre reembolsos/reversões; `Purchase` fica bloqueado até o autor aprovar essas semânticas.

## Evidência atual e limites

- `app/index.tsx` copia `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid` e `fbclid` para o destino do checkout; o caminho de cadastro também pode receber esses parâmetros. Não há, nessa função, verificação da escolha de consentimento.
- `lib/legal-content.ts` declara que Google e Meta recebem o identificador de clique e a informação da compra quando a pessoa segue do anúncio até a compra.
- `lib/checkout.ts` acrescenta `email` e `confirmEmail` à query do link da Cakto para vincular a compra à conta. Essa finalidade operacional não autoriza reutilizar o e-mail em publicidade. Se a página externa carregar Pixel, a URL pode expor os parâmetros ao destinatário; isso precisa ser testado.
- `docs/marketing/meta-configuracao-checklist.md` diz que não há Pixel na landing e propõe usar a integração CAPI da Cakto. Nome de campo, payload real, consentimento, checkout publicado e evento `Purchase` ainda não foram conferidos.
- O M5 original existe em `E:\Grana-temporarios\2026-10-15-tarde\relatorio-Watchtower-M5-LGPD-Pixel-CAPI.md`. Ele registra como proposta: consentimento prévio, falha fechada para escolha ausente/corrompida/vencida, zero reenvio retroativo, separação entre consentimento e autorização operacional da CAPI, consentimento propagado ao checkout e retenções propostas. Nenhuma dessas propostas está aprovada ou implementada.
- A busca local de `fbq`/`fbevents` não encontrou chamadas nos arquivos públicos examinados pelo M5 (`app/index.tsx`, `app/baixar.tsx`, `site-vendas/index.html`, `lib/checkout.ts`). Isso não prova ausência em tags externas, no checkout da Cakto ou em produção.
- A ANPD recomenda informação clara e controle efetivo para cookies não necessários. O acesso às páginas oficiais de implementação da Meta retornou HTTP 429 nesta consulta e também foi limitado na revisão M5; nomes exatos de campos e deduplicação devem ser conferidos antes de implementar.

## Matriz de eventos

| Evento | Quando dispara | Canal proposto | Dados permitidos no evento |
|---|---|---|---|
| `PageView` | Uma vez ao entrar na rota `/` da landing pública, depois de consentimento válido. Não repetir por renderização, rolagem ou navegação interna para uma rota privada. | Pixel | `event_id` aleatório da ocorrência e rota canônica pública sem query/hash. Sem campos livres. |
| `ViewContent` | Uma vez quando a seção de preços `#precos` entra em exibição na rota `/`; não disparar apenas por carregar a página. | Pixel | `event_id` aleatório, `content_type: product` e `content_ids` com código genérico estável da oferta. Sem valor nesta fase. |
| `InitiateCheckout` | No clique explícito em CTA que realmente abre o checkout da Cakto, depois de consentimento. Não disparar se o destino cair no cadastro, nem em carregamentos repetidos. | Pixel | `event_id` aleatório, `content_ids` com código genérico do plano escolhido e `content_type: product`. O preço fica de fora até o valor enviado ao checkout ser confirmado. |
| `Purchase` | Só após uma transação de assinatura confirmada como paga pela Cakto e com consentimento compatível comprovado. A semântica para cobrança inicial, renovação, reversão e reembolso fica pendente de decisão do autor; não usar visita à página de sucesso como prova. | CAPI nativa da Cakto, se payload, consentimento e controle de evento passarem pelos gates abaixo | `event_id` aleatório, `value` efetivamente cobrado, `currency: BRL` e código genérico do plano, somente se esses campos existirem e forem aprovados. Horário da compra conforme fonte confirmada. O payload nativo ainda é desconhecido. |

`app/index.tsx` usa a seção `#precos` e pode levar o CTA ao cadastro quando o checkout não está configurado. Nesse fallback não houve início de checkout e não se emite `InitiateCheckout`. `site-vendas/index.html` e `/baixar` são explicitamente excluídos até confirmação de que fazem parte das páginas-alvo publicadas. Rotas de cadastro, login, redefinição de senha, app, admin e feedback nunca recebem Pixel nesta proposta.

## Lista de parâmetros

### Permitidos na proposta

- Campos necessários para identificar o evento e o momento (`event_name`, `event_time`, `event_id` aleatório e uma rota canônica pública sem query/hash), sujeitos à confirmação na documentação oficial da Meta.
- `action_source: website`, se exigido pelo contrato técnico vigente.
- Para `Purchase`, valor da assinatura efetivamente cobrado e moeda `BRL`; um código genérico do plano pode identificar o produto.
- Para `ViewContent` e `InitiateCheckout`, somente código genérico do plano/produto, sem conteúdo do cadastro ou do app.
- IDs de campanha validados e permitidos, se necessários e após consentimento. `utm_*`, `gclid` e `fbclid` só podem acompanhar cadastro/checkout como atribuição de primeira parte depois de consentimento compatível, com allowlist e sanitização; a proposta não os envia como campos livres de `custom_data`.

### Proibidos nesta proposta

- Dados financeiros do usuário: lançamentos, descrições de compras, estabelecimentos, categorias, contas, saldos, cartões, carteiras, faturas, metas ou conteúdo de voz/foto.
- Nome, e-mail, telefone, endereço, CPF, identificador da conta do Grana, ID interno de usuário/assinatura/pedido, texto de formulário ou qualquer versão com hash desses dados. O e-mail operacional da query do checkout não pode ser encaminhado à Meta.
- `fbclid`, `gclid`, `utm_*`, query string completa, URL com token/identificador de pedido, dados de referência brutos ou conteúdo livre em parâmetros personalizados do evento.
- Correspondência avançada automática, captura automática de formulários e eventos automáticos configurados no Gerenciador de Eventos.
- Eventos de cadastro, login, assinatura renovada, reembolso, uso do aplicativo ou ações financeiras. Podem ser considerados separadamente apenas com pedido e avaliação próprios.

O M5 permite considerar IDs de campanha validados, a reconciliar com M4. Esta proposta escolhe não mandar identificadores brutos nem valores UTM livres dentro do evento; se a Meta precisar de outro identificador, a finalidade e o campo exigem aprovação explícita. O Pixel, depois de autorizado, pode criar/ler seu próprio identificador de navegador e a conexão do navegador revela metadados técnicos à Meta. Na primeira versão, o Grana. não acrescentaria IP, user-agent, `fbp`/`fbc` ou outros campos pelo servidor. Isso não significa que o Pixel omita identificadores ou metadados próprios da requisição. Política e banner devem descrevê-los com precisão antes da ativação.

## Consentimento e repasse de atribuição

1. A categoria de marketing começa desativada. Escolha ausente, inválida/corrompida, vencida ou indisponível por falha de armazenamento conta como recusa: não carregar `fbevents.js`, não fazer preconnect/pixel invisível, não criar/ler identificadores publicitários, não enviar Pixel/CAPI e não propagar parâmetros de atribuição. O erro falha fechado.
2. O aviso deve oferecer aceitar, rejeitar e configurar, com recusa igualmente visível/acessível, escolha granular e explicação de finalidade, destinatário e retenção. Fechar, rolar ou continuar não é aceite. Rejeitar não bloqueia navegação, cadastro ou compra.
3. Ao aceitar, habilitar apenas eventos futuros nas rotas aprovadas. A escolha pode ser alterada; ao revogar, parar novos envios, cancelar eventos de publicidade pendentes e remover IDs locais. Não guardar evento ocorrido sem consentimento para reenviar depois, mesmo que a pessoa aceite mais tarde.
4. A escolha vale tanto para Pixel como para CAPI; CAPI tem autorização operacional separada. O servidor revalida a escolha no envio e cancela pendências após revogação. Se não for possível vinculá-la de forma comprovável à compra e ao checkout, não habilitar `Purchase`.
5. Guardar apenas a prova mínima da escolha, versão da finalidade/política e data. O M5 propõe 180 dias para preferência no navegador; 90 dias para identificadores controlados pelo Grana. (ou revogação, o que vier primeiro) e para eventos/recibos detalhados; até 13 meses para agregados realmente anônimos; e 180 dias após expiração/revogação para a prova mínima de consentimento, sujeito a validação jurídica. Nova decisão é necessária quando finalidade ou fornecedor mudar. Retenção da Meta/Cakto continua desconhecida. Todos esses prazos são propostas do M5, ainda não aprovadas; não são prazos impostos pela lei.
6. Não instalar tags em layout compartilhado. No painel Meta, deixar desligados correspondência avançada automática, eventos automáticos e captura automática de formulário. Cadastro pode receber atribuição de primeira parte compatível com consentimento, mas nunca recebe Pixel ou evento de cadastro nesta proposta.
7. O Pixel, se autorizado, envia requisições ao destinatário Meta; IP/user-agent da conexão e IDs de navegador podem ser observáveis mesmo sem o Grana. adicioná-los ao payload CAPI. Inventariar o que o SDK transmite e refletir o envio na política/banner; não prometer ausência de dado que a tecnologia expõe.
8. O `lib/checkout.ts` coloca `email` e `confirmEmail` na URL externa. Antes de permitir Pixel/CAPI no checkout Cakto, capturar as requisições de teste e comprovar que a query de e-mail não é transmitida como URL, referrer, dado de evento ou log para Meta. Se não for possível provar, manter Pixel da Cakto e `Purchase` desligados. E-mail e hash de e-mail continuam fora da allowlist.

O M5 propõe consentimento livre, informado, específico e demonstrável para rastreamento publicitário, e rejeita usar legítimo interesse para contornar a recusa. A base legal final e o texto da política ainda precisam de validação jurídica; isto é proposta técnica, não parecer jurídico. Fontes: [LGPD consolidada, arts. 7º, 8º, 9º e 18](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm), [Guia ANPD de cookies](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf/@@display-file/file) e [recomendações ANPD para banners](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-emite-recomendacoes-para-adequacao-da-pratica-de-coleta-de-cookies-do-portal-gov.br).

## Deduplicação e idempotência

- A matriz usa um canal por evento: `PageView`, `ViewContent` e `InitiateCheckout` pelo Pixel da landing; `Purchase` pela integração nativa da Cakto, se passar pelos gates. Não ligar ao mesmo tempo o `Purchase` nativo e uma implementação própria.
- A integração nativa da Cakto é quem controla o próprio payload e possíveis retries. Conferir o evento real no “Testar eventos” e no Gerenciador; se enviar e-mail/hash, ID de pedido ou outro campo proibido, desligar `Purchase` ou pedir aprovação explícita do autor com atualização correspondente da política. Não presumir que o Grana. consegue filtrar o payload nativo.
- Se uma mesma ação vier a ser enviada pelo navegador e pelo servidor, gerar um único ID aleatório não pessoal e reutilizá-lo no campo de ID de cada canal, com o mesmo nome de evento e dataset. Confirmar os nomes/campos atuais (`eventID`/`event_id`) na [documentação oficial de deduplicação da Meta](https://developers.facebook.com/documentation/ads-commerce/conversions-api/deduplicate-pixel-and-server-events) antes de codificar. Não usar e-mail, telefone, pedido ou ID interno como chave.
- Se a integração nativa e a implementação própria não puderem compartilhar o mesmo ID, escolher uma só. Na integração nativa, conferir duplicação no Gerenciador de Eventos; idempotência no código só se aplica a uma implementação própria via `supabase/functions/cakto-webhook`, que exigiria escopo e aprovação separados.
- Não contar com coincidência de horário, valor ou cookies como substituto para deduplicação. Não atribuir semântica a renovação, reversão ou reembolso antes do contrato de métricas aprovado pelo autor (Compass M7, caso 4.3).

## Critérios de aceite antes de ativar

- [ ] Autor aprova quais rotas públicas entram, quais eventos, os parâmetros, quem envia `Purchase`, a semântica inicial/renovação/reembolso e a ativação de Pixel e CAPI (decisões separadas).
- [ ] O M4 é reconciliado e aprovado junto ao M5; política/banner e base legal são revisados, inclusive fornecedores, transferências internacionais, metadados do navegador e os prazos propostos.
- [ ] A integração Cakto e o checkout efetivamente publicados são identificados. O token e os passos 5 e 6 de `meta-configuracao-checklist.md` ficam bloqueados até os gates M4/M5; não presumir autorização para campanha otimizada por `Purchase` nem escolher evento alternativo sem decisão/documentação Meta.
- [ ] Estado sem escolha, corrompido, vencido, storage indisponível ou erro de consentimento: nenhuma chamada, script, preconnect, pixel invisível, cookie ou parâmetro publicitário; checkout continua funcional.
- [ ] `ViewContent` ocorre uma vez só quando `#precos` entra em exibição; `InitiateCheckout` ocorre apenas no CTA que realmente abre a Cakto, nunca quando o destino cai no cadastro.
- [ ] Aceite: só os eventos/rotas aprovados; sem tag em cadastro/login/app/admin/feedback nem em navegação SPA/back/forward para áreas privadas; sem correspondência avançada, captura de formulário ou eventos automáticos.
- [ ] Revogação antes ou durante envio bloqueia o envio e cancela pendências; o evento ocorrido sem consentimento não é reenviado após aceite posterior.
- [ ] Banner utilizável por teclado e leitor de tela nas larguras 320/390/768/1440; recusar exige esforço equivalente a aceitar e a compra continua disponível.
- [ ] Capturar o payload real do evento nativo da Cakto e as requisições à Meta na página de checkout: provar que query/referrer de e-mail e `confirmEmail` não chegam à Meta. Se o payload enviar campo proibido, `Purchase` fica desligado sem aprovação explícita.
- [ ] Compra aprovada, repetição/retry e reversão são testados contra o contrato de métricas aprovado; sem contrato, `Purchase` permanece bloqueado. Página de sucesso, pagamento recusado ou checkout iniciado não substituem confirmação de compra.
- [ ] Se houver evento duplo navegador/servidor, a mesma identidade de evento é vista nos dois lados e uma só conversão aparece no Gerenciador de Eventos; sem ID compartilhável, usar um canal.
- [ ] Rotas, parâmetros e eventos são validados em Test Events e no Gerenciador; tags e identificadores de teste não ficam habilitados em produção. Nada é ativado sem autorização do autor.

**Nenhum desses critérios foi executado nesta etapa.** Este relatório é especificação para decisão; não houve instalação de Pixel, configuração da Cakto, chamada de API, compra de teste ou envio à Meta.

## Referências e pendências

- Código atual: `app/index.tsx` (`PARAMETROS_ATRIBUICAO`, `comAtribuicao`, `hrefCompra`) e `lib/legal-content.ts`.
- Código adicional relevante: `lib/checkout.ts` (`checkoutComEmail`), `supabase/functions/cakto-webhook/index.ts` (somente alternativa de integração própria, não escolhida) e o alvo web `site-vendas/index.html` (fora do escopo até confirmação).
- Checklist existente e dependências bloqueadas até aprovação: `docs/marketing/meta-configuracao-checklist.md`.
- Parecer M5 original: `E:\Grana-temporarios\2026-10-15-tarde\relatorio-Watchtower-M5-LGPD-Pixel-CAPI.md`; reter e implementar prazos somente após aprovação dessa proposta e validação jurídica.
- Revisão documental Flare, 16/10/2026: `E:\Grana-temporarios\2026-10-15-tarde\revisao-Flare-M4.md`; os achados relevantes foram incorporados.
- Documentação Meta para revalidar na etapa de implementação: [deduplicação Pixel/servidor](https://developers.facebook.com/documentation/ads-commerce/conversions-api/deduplicate-pixel-and-server-events), [eventos de servidor da Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event) e [eventos do Meta Pixel](https://developers.facebook.com/docs/meta-pixel/implementation/conversion-tracking). O conteúdo dessas páginas não pôde ser lido nesta consulta (429); por isso a proposta não trata o contrato atual de campos ou a janela de deduplicação como verificados.

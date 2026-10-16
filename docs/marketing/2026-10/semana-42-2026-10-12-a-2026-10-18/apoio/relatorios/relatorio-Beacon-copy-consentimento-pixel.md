# Beacon: copy de consentimento e estados do Pixel

- **Data:** 16/10/2026
- **Responsável:** Beacon (Marketing/Growth)
- **Estado:** texto final para implementação, sujeito à revisão jurídica e à aprovação do autor antes de ativar medição. Nenhum Pixel foi ativado nesta etapa.
- **Destinatário:** Forge, Entrega 6.
- **Base:** parecer Watchtower M5, taxonomia e limites M4 Beacon (`relatorio-Beacon-M4.md`) e decisão de partida da ordem META.

## Banner de consentimento

**Título**

> Você decide sobre a medição da Meta

**Texto**

> Quando o Pixel estiver configurado, ele mede, com sua autorização, visitas às páginas públicas, a visualização dos preços e o início do checkout. Se a integração de conversões for habilitada separadamente, a Meta também poderá receber a confirmação da compra da assinatura. A Meta pode receber identificadores do navegador e dados técnicos da conexão. Recusar ou retirar a autorização não impede a navegação nem a compra. Você pode mudar sua escolha em Preferências de privacidade.

**Ações do primeiro nível, com o mesmo destaque e esforço**

- `Aceitar`
- `Recusar`
- `Configurar`

Aceitar ou recusar aplica a escolha à categoria opcional de publicidade da Meta. Configurar abre as preferências sem ativar nada. Fechar o banner, continuar navegando ou chegar pelo anúncio não vale como consentimento.

## Preferências de privacidade

**Título**

> Preferências de privacidade

**Introdução**

> Escolha se autoriza a medição publicitária da Meta. Essa opção fica desativada até você escolher. A navegação e a compra continuam disponíveis mesmo se você a mantiver desligada.

**Categoria opcional, desligada por padrão**

> **Medição e publicidade da Meta**  
> Permite, quando houver Pixel configurado, medir visitas às páginas públicas, a visualização dos preços e o início do checkout. A confirmação da compra só será enviada se a integração de conversões estiver habilitada separadamente e a escolha de consentimento puder ser comprovada. A Meta pode receber identificadores do navegador e dados técnicos da conexão.

**Ações**

- `Salvar minhas escolhas`
- `Recusar opcionais`
- `Aceitar opcionais`
- Link persistente para reabrir: `Preferências de privacidade`

## Estados de configuração do Pixel

Estes textos são para a interface administrativa. O campo preenchido, sozinho, nunca transforma a integração em Validado.

| Estado | Texto principal | Ação/critério mostrado |
|---|---|---|
| **Não configurado** | O ID do Pixel não está configurado. A landing não carrega o SDK nem faz chamadas à Meta. | `Configurar ID do Pixel`. Informar o ID público do dataset no ambiente web. Não pedir nem exibir token. |
| **Em teste** | A configuração está presente. Envie um evento de teste depois de uma escolha de consentimento válida e confirme o recebimento no Gerenciador de Eventos. | `Abrir instruções de teste`. Permanecer Em teste até existir evidência datada de recebimento; configuração preenchida não basta. |
| **Validado** | Recebimento de teste confirmado em **[data e hora]** para o dataset **[ID]**. Esta validação cobre somente o Pixel no navegador e a versão testada. | `Ver evidência`. Purchase da Cakto, CAPI, payload de checkout e deduplicação são validações independentes. |
| **Com problema** | Não foi possível confirmar o recebimento: **[motivo curto e sanitizado]**. Revise a configuração e faça um novo teste. | `Ver diagnóstico` ou `Tentar novamente`. Não tratar como Validado; se consentimento ou destino não puderem ser confirmados, falhar fechado. Nunca mostrar token, payload bruto ou dado pessoal. |

## Configuração para a landing

| Nome | Uso | Regra |
|---|---|---|
| `EXPO_PUBLIC_META_PIXEL_ID` | ID público do dataset/Pixel, consumido somente pelo build web da landing. | Variável opcional, ausente ou vazia significa **Não configurado** e nenhuma chamada, script, imagem de pixel ou preconnect à Meta. Configuração não equivale a consentimento nem a validação. Aplicar somente ao ambiente web; não adicionar aos perfis EAS Android. |
| `META_ACCESS_TOKEN` | Credencial de servidor para integrações que precisem de token, como Graph API ou CAPI. | Secret exclusivo do servidor, nunca `EXPO_PUBLIC_*`, nunca no bundle, no navegador, no app Android ou em material versionado. Harbor define sua leitura e armazenamento. Não é necessário para carregar o Pixel da landing. |

O ID do Pixel não é segredo, mas não registrar seu valor em commit ou usar o próprio ID como sinal de consentimento. Estado `Validado` exige recibo de teste, data/hora e escopo. Se Harbor usar outro nome de secret no conector de leitura, manter o nome do servidor definido por ele e não expor a variável à landing.

## Regras de implementação que preservam esta copy

- Sem consentimento válido, escolha ausente, inválida, vencida ou indisponível por falha de armazenamento: nenhum SDK, preconnect, pixel invisível, identificador de publicidade, evento ou repasse de atribuição. A falha fecha a medição.
- Depois de aceite, limitar eventos às rotas e ações públicas aprovadas no M4: `PageView`, `ViewContent`, `InitiateCheckout` e `Purchase` somente após a confirmação Cakto e consentimento compatível. Não instalar em cadastro, login, app autenticado, painel, feedback ou qualquer rota privada.
- `Purchase` nativo da Cakto não é payload controlado pelo Grana. Não ativar Pixel/CAPI no checkout até comprovar consentimento no fluxo real e que `email`/`confirmEmail` da query não chegam à Meta por URL, referrer, evento ou log. Sem essa prova, manter desligado.
- Não ativar correspondência avançada automática, captura automática de formulários ou eventos automáticos. Não enviar nome, e-mail ou hash, telefone, IDs internos, pedido, finanças individuais, texto livre, conteúdo de tela privada, IP ou `fbp`/`fbc` adicionados manualmente pelo servidor.
- Pixel e CAPI compartilham a mesma escolha de consentimento. A liberação operacional da CAPI é separada. Revogação bloqueia novos eventos e cancela pendências; não reenviar eventos ocorridos antes do aceite.
- A copy não afirma prazo de retenção, destino internacional ou ausência de metadados. A política de privacidade precisa refletir a configuração real, a retenção aprovada, os destinatários e a transmissão nativa do Pixel antes de qualquer ativação. Os prazos do M5 ainda são propostas, não aprovação jurídica.

## Critérios de aceite da integração

- [ ] Aceitar, Recusar e Configurar aparecem no mesmo nível, com acesso por teclado e leitor de tela nas larguras 320, 390, 768 e 1440 px.
- [ ] ID ausente, vazio ou configuração inválida mantém o estado Não configurado e não produz rede Meta.
- [ ] Configuração existente sem evento de teste comprovado permanece Em teste.
- [ ] Validado mostra data/hora e escopo do teste e não se estende automaticamente a CAPI ou Purchase da Cakto.
- [ ] Erro mostra orientação sanitizada; tokens, emails, payloads e URLs privadas não aparecem.
- [ ] Rejeitar mantém a compra utilizável; revogar impede novos envios e cancela pendências sem reenvio posterior.
- [ ] Consentimento e Pixel não permanecem ativos em navegação SPA/back-forward para rotas privadas.
- [ ] Nenhum texto promete que Pixel omite identificadores ou dados técnicos que a requisição do navegador revela à Meta.

**Verificação desta entrega:** copy confrontada com M4 e M5 e nome da variável pública conferido contra a convenção Expo existente. Nenhum módulo, landing, configuração de ambiente, política publicada, teste de compra ou integração foi alterado ou ativado.


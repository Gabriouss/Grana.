# Especificação: prontidão para venda e endurecimento operacional do Grana.

## Contexto

O Grana. já tem fluxo de assinatura, notificações, lançamento por voz,
widgets e integração com a Kiwify, mas ainda existem riscos de produção em
quatro pontos: autenticação do webhook, exclusão de conta, ativação gradual de
assinaturas e resolução de carteira/cartão no lançamento por voz. O objetivo é
fechar esses riscos sem disparar build nesta sessão e sem interromper o uso
atual do aplicativo.

## Objetivos

1. Tornar o recebimento de eventos da Kiwify autenticado, idempotente e
   observável.
2. Entregar exclusão de conta realmente executada no servidor, com confirmação
   de identidade e recibo visível em caso de falha.
3. Validar o ciclo comercial completo antes de ativar o bloqueio de acesso por
   assinatura.
4. Fazer o lançamento por voz resolver carteiras e cartões personalizados no
   app, no widget e no WhatsApp usando uma regra canônica.
5. Atualizar documentação, termos e checklist operacional sem inventar regras
   comerciais que ainda não estejam configuradas na Kiwify.

## Não objetivos nesta etapa

- Não disparar `eas build`.
- Não ativar o bloqueio global de assinaturas antes do teste de compra e do
  provisionamento dos usuários de teste.
- Não apagar dados de usuários reais para validar exclusão.
- Não substituir a migration de voz já modificada por outra máquina.
- Não trocar autenticação estática da Kiwify por HMAC sem confirmar que o
  provedor realmente envia uma assinatura verificável.

## Estratégia de rollout

O rollout será compatível e reversível:

1. Adicionar código e migrations com `enforce_subscriptions` desligado.
2. Aplicar no Supabase e executar sondas somente de leitura, além dos testes
   de erro que não alteram dados.
3. Criar uma conta de teste descartável e uma assinatura de teste/cortesia
   controlada para validar o acesso.
4. Exercitar compra, renovação, cancelamento, reembolso e chargeback com os
   eventos disponíveis na Kiwify.
5. Só então avaliar a ativação do bloqueio global. Se qualquer etapa falhar,
   manter o bloqueio desligado e corrigir o lote correspondente.

Cada lote deve ser implantável isoladamente. O rollback preferencial é
desligar a flag de assinatura e reverter apenas o lote de código que causou a
falha; migrations destrutivas não fazem parte desta entrega.

## Lote 1 — webhook Kiwify

### Alteração

`kiwify-webhook` deixará de aceitar segredo em query string ou no corpo. O
segredo será aceito somente no header configurado pelo provedor. A validação
continua usando comparação em tempo constante, limite de corpo, método POST,
normalização do evento e hash do payload.

O processamento continuará delegando estado e idempotência à RPC
`processar_evento_kiwify`. Falhas de autenticação retornam erro sem alterar
assinatura; falhas persistentes do banco retornam erro explícito e ficam
registradas nos logs da função.

### Operação manual

Depois do deploy, o segredo deve ser rotacionado no painel da Kiwify e no
segredo da Edge Function. A troca deve ocorrer coordenadamente para não deixar
uma janela sem eventos. O segredo nunca será colocado no repositório, no
frontend ou em mensagens de log.

### Aceite

- Header correto: evento aceito uma única vez.
- Query/body sem header: rejeitado.
- Header incorreto: rejeitado.
- Reenvio do mesmo evento: não duplica assinatura nem histórico.
- RPC ausente ou erro permanente: resposta de erro e log identificável.

## Lote 2 — exclusão de conta

### Alteração

Criar a Edge Function `delete-account`. Ela deve:

1. exigir JWT válido;
2. confirmar o usuário pelo token recebido, sem aceitar `user_id` fornecido
   pelo cliente;
3. exigir reautenticação recente conforme o fluxo já disponível no app;
4. remover objetos de Storage pertencentes ao usuário;
5. apagar os registros do usuário na ordem de dependências definida pelo
   schema;
6. remover o usuário do Supabase Auth usando a chave de serviço somente no
   servidor;
7. devolver resultado estruturado e registrar falhas por etapa.

Como Storage e Auth não participam da mesma transação do Postgres, a função
deve deixar um erro explícito se uma etapa posterior falhar. Não pode retornar
“exclusão concluída” quando apenas parte do processo foi executada.

### Aceite

- Sem JWT: 401 e nenhuma escrita.
- JWT de outro usuário não consegue excluir o alvo de outra pessoa.
- Conta descartável: dados, arquivos e usuário Auth removidos.
- Falha intermediária: mensagem visível no app e log com etapa, sem segredo.

## Lote 3 — assinaturas e entitlements

### Alteração

Manter `enforce_subscriptions` desligado durante a implantação. Revisar o
vínculo automático por e-mail para considerar somente identidade confirmada e
preservar o vínculo por token quando esse for o fluxo escolhido.

Antes de ligar o bloqueio, conferir:

- compra nova vinculada ao usuário correto;
- renovação estende `access_until`;
- cancelamento não revoga acesso já pago antes do fim do período;
- reembolso/chargeback revoga conforme o estado recebido;
- usuário sem assinatura recebe tela de assinatura;
- usuário de teste com concessão explícita continua entrando.

Se a Kiwify não oferecer um evento necessário para um cenário, isso será
registrado como pendência operacional, não mascarado no cliente.

## Lote 4 — voz, carteiras e cartões

### Regra canônica

O interpretador deve produzir uma intenção com campos normalizados:

```text
tipo: entrada | saída
descrição
valor
carteira_nome
cartão_nome
categoria
recorrência
parcelas
data
```

`carteira_nome` e `cartão_nome` são resolvidos contra os registros do usuário,
com comparação normalizada de acentos, caixa e espaços. A resolução deve
respeitar o usuário autenticado e nunca aceitar um ID fornecido pelo áudio.

Exemplos esperados:

- “Mercado 34,57 reais Cartão C6 carteira pessoal” → saída, cartão C6,
  carteira pessoal.
- “festa 143,98 reais carteira empresa” → saída, carteira empresa, sem
  cartão obrigatório.

Se houver zero ou mais de uma correspondência plausível, o lançamento não deve
ser gravado silenciosamente: o usuário recebe uma confirmação para escolher a
carteira/cartão. O mesmo resolver será reutilizado no app, widget e WhatsApp;
adaptações específicas ficam apenas na captura do áudio e na apresentação da
confirmação.

### Aceite

- Carteira personalizada com acento e sem acento.
- Duas carteiras com nomes semelhantes.
- Cartão informado sem carteira.
- Carteira informada sem cartão.
- Carteira/cartão inexistente.
- Lançamento parcelado, recorrente e categorias nativas/personalizadas.
- Falha de rede ou RPC deixa estado de atenção visível e não simula sucesso.

## Lote 5 — termos, operação e observabilidade

- Ajustar os termos para refletir corretamente a oferta paga atual, sem
  prometer cancelamento ou reembolso além do que estiver configurado.
- Documentar variáveis, segredos, URLs e sequência de rotação.
- Registrar checklist de teste de produção, conta descartável e critérios de
  rollback.
- Preservar os logs necessários para investigar webhook, voz, exclusão e
  push, sem dados sensíveis.

## Verificação

Antes de considerar a entrega pronta, executar:

- `npx tsc --noEmit`;
- `npm run test:parser`;
- `npm run test:voz`;
- `npm run test:assistente-aprendizado`;
- `npm run test:assistente-fatura`;
- `npm run test:blur`;
- `npm run test:motion`;
- `node __tests__/voice-fallback.cjs`;
- `node __tests__/voz-offline.cjs`;
- `node __tests__/widget-voz-cartoes.cjs`;
- sondas Supabase de autenticação, RPC e estado de acesso;
- teste real com conta descartável para compra/entitlement e exclusão.

A divergência preexistente entre a migration de voz e o baseline do schema será
reportada separadamente até que possa ser corrigida sem sobrescrever trabalho
de outra máquina.

## Pendências que permanecem manuais

- gerar e instalar uma nova build Android;
- publicar o APK no asset do GitHub Release;
- configurar/confirmar variáveis no Vercel e no EAS;
- configurar botões e links de entrega na Kiwify;
- validar push/FCM em aparelho físico;
- executar o smoke test final no Android.


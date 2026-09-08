# Fluxos de alto risco

## Compra e liberação

Ator: comprador. Pré-condição: checkout Kiwify concluído.

1. Kiwify envia evento POST com header x-kiwify-token.
2. kiwify-webhook valida método, segredo, corpo e evento.
3. processar_evento_kiwify grava o evento de modo idempotente.
4. O usuário confirma e-mail, entra no app e é vinculado por e-mail ou token.
5. obter_estado_acesso calcula allowed e o layout abre ou mantém o paywall.

Negativas: sem header é 401; evento repetido não duplica; RPC ausente retorna
erro e log; falha de vínculo aparece no paywall e pode ser tentada novamente.

## Lançamento por voz

Ator: usuário autenticado. Pré-condição: acesso permitido e áudio válido.

1. App/widget envia áudio com JWT para processar-lancamento-voz.
2. A função valida usuário, MIME, tamanho e quota persistente de voz.
3. Groq é o provedor primário; OpenAI pode ser fallback.
4. O cliente interpreta carteira, cartão, categoria, parcelas e recorrência.
5. registrar_operacao_voz grava operação e lançamentos atomicamente.
6. O recibo permite sincronizar, notificar e desfazer.

Negativas: sem JWT, áudio inválido, quota esgotada, RPC ausente e falha
permanente têm códigos/estados visíveis; nenhum erro vira sucesso simulado.

## Granabô

Ator: usuário autenticado. Pré-condição: mensagem não vazia e quota disponível.

1. assistente-financeiro valida JWT, corpo e quota de assistente.
2. Gemini escolhe uma ferramenta de catálogo fechado.
3. A ferramenta consulta dados filtrados pelo user_id e RLS.
4. O resultado real volta ao modelo para redação.
5. Pergunta, resposta e memória permitida são persistidas.

O modelo não recebe SQL, chave de serviço ou acesso direto ao banco. Quota
esgotada impede a chamada externa.

## Exclusão de conta

Ator: usuário autenticado. Pré-condição: reautenticação recente.

1. Cliente envia JWT para delete-account.
2. Função confirma o usuário pelo token e janela de login recente.
3. Remove objetos do avatar, anonimiza feedbacks e remove o usuário Auth.
4. Cascatas removem dados vinculados; falha intermediária vira erro visível.

## Push e lembretes

O cliente registra token e preferências com RLS. A função agendada reivindica
entregas com lock, envia pelo Expo/FCM, registra sucesso e remove tokens
inválidos. Sem FCM no APK, o app mantém lembrete local como fallback.

## Distribuição

Compra leva a /baixar e /ativar. O APK é público; o controle comercial está no
entitlement do servidor. O asset oficial deve se chamar grana.apk e a URL
estável é /downloads/grana-latest.apk.

# Permissões e isolamento

## Papéis

| Papel | Origem | Escopo |
| --- | --- | --- |
| anônimo | request sem sessão | rotas públicas, cadastro e login |
| authenticated | JWT Supabase | próprios dados e RPCs permitidas |
| service_role | secret apenas em Edge Function/operador | webhooks, push, exclusão e tarefas internas |
| provedor | Kiwify, Meta, Groq/OpenAI, Gemini, Expo | somente o endpoint contratado |

## Matriz resumida

| Recurso/operação | anônimo | authenticated | service_role |
| --- | --- | --- | --- |
| dados financeiros | não | próprio user_id | tarefa autorizada |
| wallets/cards/categories | não | próprio user_id | manutenção |
| subscriptions | não | leitura própria | webhook/admin |
| push_tokens | não | próprio token | envio/limpeza |
| voice_operations | não | leitura própria; escrita por RPC | RPC interna |
| assistant_messages/memory | não | próprio user_id | função do assistente |
| ai_usage_counters | não | somente via RPC | manutenção |
| exclusão de conta | não | somente a própria, com reauth | Auth Admin |
| feature flags/app_release | não | leitura pública autenticada | publicação |

## Regras importantes

As tabelas de usuário têm RLS e predicado auth.uid() = user_id. Funções
security definer fixam search_path, derivam o usuário de auth.uid() e revogam
execução pública quando não são APIs do app. O cliente nunca recebe
service_role, secrets de IA ou o segredo Kiwify.

Negativas obrigatórias: JWT ausente dá 401; usuário não pode fornecer um
user_id para escolher outra conta; token de ativação não é aceito como
identidade de outro usuário; nomes de carteira/cartão são resolvidos contra os
registros do próprio usuário.

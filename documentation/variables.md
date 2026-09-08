# Variáveis, secrets e go-live

## Cliente público

| Nome | Uso | Fonte | Risco |
| --- | --- | --- | --- |
| EXPO_PUBLIC_SUPABASE_URL | endpoint Supabase | .env/Vercel/EAS | público |
| EXPO_PUBLIC_SUPABASE_ANON_KEY | cliente Supabase | .env/Vercel/EAS | público, protegido por RLS |
| EXPO_PUBLIC_KIWIFY_CHECKOUT_URL | checkout | Vercel/EAS | público |
| EXPO_PUBLIC_KIWIFY_BILLING_URL | gerenciamento de cobrança, opcional | Vercel/EAS | público |
| EXPO_PUBLIC_ANDROID_DOWNLOAD_URL | APK estável | Vercel/EAS | público |
| EXPO_PUBLIC_WHATSAPP_NUMBER | instrução de pareamento | Vercel/EAS | público |

## Backend

| Nome | Usado por | Rotação |
| --- | --- | --- |
| KIWIFY_WEBHOOK_TOKEN | kiwify-webhook | rotacionar junto do painel Kiwify |
| GROQ_API_KEY | transcrição | painel Groq |
| OPENAI_API_KEY | fallback de transcrição | painel OpenAI |
| GEMINI_API_KEY | Granabô | Google AI Studio |
| WHATSAPP_APP_SECRET/TOKEN | webhook Meta | Meta App Dashboard |
| SUPABASE_SERVICE_ROLE_KEY | funções administrativas | Supabase; nunca no cliente |
| FCM/EAS credentials | build e push Android | Google Cloud/EAS |

Nenhum secret deve aparecer em app.json, código cliente, logs, commit, corpo
de webhook ou query string. A chave Firebase pública do Android deve continuar
restrita por pacote e SHA-1.

## Checklist de rotação

1. Criar novo segredo no provedor.
2. Atualizar secret da função/EAS.
3. Testar endpoint com o novo valor.
4. Remover o valor antigo no provedor.
5. Registrar a troca sem registrar o segredo.

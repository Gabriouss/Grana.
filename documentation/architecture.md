# Arquitetura do Grana.

## Visão do produto

O Grana. é um app de organização financeira pessoal. A pessoa registra
lançamentos, contas, cartões, metas e categorias; pode usar voz, widget Android,
QR Code, WhatsApp opcional e o Granabô. O acesso comercial é uma assinatura
processada pela Kiwify; o Grana. não movimenta dinheiro nem conecta contas
bancárias.

## Stack e fronteiras

- Cliente: Expo SDK 57, React Native 0.86, Expo Router, React Native Web.
- Backend: Supabase Auth, Postgres/RLS, Storage e Edge Functions em Deno.
- IA: Groq/OpenAI para transcrição; Google Gemini para o Granabô.
- Operação: Vercel para a web e URL estável do APK; GitHub Actions para CI;
  EAS para builds Android.
- Pagamento: Kiwify por checkout e webhook autenticado.

O cliente usa somente a chave pública do Supabase. Chaves de serviço, Kiwify,
Groq, OpenAI, Gemini, Meta e FCM ficam em secrets de backend ou EAS. O JWT
identifica o usuário; Edge Functions usam o JWT para RLS e RPCs protegidas.

## Fluxo de sessão e acesso

1. Supabase Auth cria ou restaura a sessão.
2. O app tenta vincular compra por e-mail confirmado ou token de ativação.
3. obter_estado_acesso devolve active, status, access_until e allowed.
4. O layout protege as abas pelo campo allowed.
5. Enquanto enforce_subscriptions estiver desligado, a regra de entitlement
   continua observável, mas não bloqueia globalmente o app.

## Riscos e premissas conhecidos

- O primeiro build com google-services.json é necessário para push remoto.
- O fluxo de pagamento depende do header secreto configurado na Kiwify.
- A quota de IA depende da migration ai_usage_counters estar aplicada antes
  de publicar as Edge Functions correspondentes.
- A migration inicial de operações de voz é histórica; a migration posterior
  de carteiras é o baseline final comparado ao schema canônico.
- A validação física de widget, biometria, instalação e notificações depende de
  aparelho Android; os testes Node/Deno não substituem esse passo.

## Documentos relacionados

- flows.md — fluxos com efeitos, autorizações e provedores.
- permissions.md — matriz de acesso e RLS.
- variables.md — variáveis, secrets, rotação e go-live.
- tests.md — cobertura existente, propostas e lacunas.
- emails.md — templates e mensagens de entrega.
- cron.md — trabalho agendado e idempotência.
- seo.md — rotas públicas e metadados.
- automation.md — IA, voz, webhooks e automações.
- operations.md — sinais, recibos e resposta a incidentes.

# Arquitetura do Grana.

## Visão do produto

O Grana. é um app de organização financeira pessoal. A pessoa registra
lançamentos, contas, cartões, metas e categorias; pode lançar por voz no app,
pelo widget Android, fotografar uma nota fiscal para ler seus dados localmente
e revisar a sugestão antes de salvar, ou usar o Granabô. O WhatsApp está
desligado por decisão do autor (05/09/2026) e não recebe evolução. O acesso
comercial é uma assinatura processada pela Cakto (mensal ou anual); o Grana.
não movimenta dinheiro nem conecta contas bancárias.

## Stack e fronteiras

- Cliente: Expo SDK 57, React Native 0.86, Expo Router, React Native Web.
- Backend: Supabase Auth, Postgres/RLS, Storage e Edge Functions em Deno.
- IA: Groq/OpenAI para transcrição; Google Gemini para o Granabô.
- Operação: Vercel para a web e URL estável do APK; GitHub Actions para CI;
  EAS para builds Android.
- Pagamento: Cakto, com checkout mensal e anual e o webhook `cakto-webhook`.
  A Kiwify foi o gateway anterior, trocado em 09/09/2026; `kiwify-webhook`
  continua na pasta, sem uso.

O cliente usa somente a chave pública do Supabase. Chaves de serviço, Cakto,
Groq, OpenAI, Gemini, Meta e FCM ficam em secrets de backend ou EAS. O JWT
identifica o usuário; Edge Functions usam o JWT para RLS e RPCs protegidas.

## Fluxo de sessão e acesso

1. Supabase Auth cria ou restaura a sessão.
2. O app tenta vincular compra por e-mail confirmado ou token de ativação.
3. obter_estado_acesso devolve active, status, access_until e allowed.
4. O layout protege as abas pelo campo allowed.
5. `enforce_subscriptions` está ligado desde 22/09/2026 (decisão do autor):
   quem não tem acesso é mandado para a tela de assinar. As contas que
   existiam na data têm cortesia sem prazo.

## Riscos e premissas conhecidos

- O primeiro build com google-services.json é necessário para push remoto.
- O fluxo de pagamento depende do segredo do webhook configurado na Cakto
  (`CAKTO_WEBHOOK_SECRET`). A Cakto manda o segredo no corpo do JSON, não em
  header.
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

## Retirada do QR em 15/10/2026

O parser de deep links deixou de aceitar scan-qr em b2c3eaa. O componente
QrScannerModal e o parser nfce-parser foram removidos em 1def588; câmera e
ML Kit continuam usados pela foto da nota. A copy até 5944921 foi aprovada,
com gate final publicado. O APK antigo conserva o código e a justificativa
de câmera anteriores até receber uma build nova.

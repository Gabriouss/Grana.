---
tags: [grana]
tipo: registro
data: 2026-09-22
---

# 2026-09-22 - M1 - Testes do fluxo de assinatura

Nota compartilhada: cada agente escreve só a própria seção.

## Compass: conta nova pela web cai na tela de assinar?

**Pedido.** Do autor, repassado pelo Codex: "uma conta nova de verdade cai na
tela de assinar?". Pela web, no portal "Landing mobile" (390x836), sem
emulador (ocupado pelo Sentinel). Sem pagar nada, sem mexer no código.

**Resultado.** Não chega à tela de assinar. **O cadastro falha antes**, com
"O servidor não respondeu agora. Tente de novo em instantes." Nenhuma conta
foi criada, então não houve o que excluir.

### Passo a passo

1. `granaponto.com.br` (landing) → botão "Entrar" no topo.
   Print `01-landing.png`.
2. `/sign-in`: e-mail, senha, "Entrar", "Esqueci minha senha", "Não tem
   conta? Criar conta". Print `02-entrar.png`.
3. `/sign-up`: e-mail, senha, confirmar senha, caixa dos Termos e da
   Política, "Criar conta". Print `03-criar-conta.png`.
4. Preenchido com `audit-assinatura-20260922@example.com`, senha inventada e
   não registrada, termos marcados. Print `04-form-preenchido.png`.
5. "Criar conta" → alerta vermelho "O servidor não respondeu agora. Tente de
   novo em instantes." e a tela fica no cadastro. Print `05-apos-criar.png`.

Prints em `E:\Grana-temporarios\2026-09-22-assinatura\` (fora do vault e do
repositório).

### Causa (comprovada até onde dá daqui)

- A mensagem vem de `lib/auth-errors.ts:86`, ramo `status >= 500`.
- Repetido direto na API pública de auth, com a chave anônima do `eas.json`
  e o mesmo e-mail: `POST /auth/v1/signup` → **HTTP 500**,
  `unexpected_failure`, `"Error sending confirmation email"`.
- `GET /auth/v1/settings`: `mailer_autoconfirm: false`, ou seja, o projeto
  **exige confirmação de e-mail** no cadastro.
- Config de auth, lida pela Management API com `SUPABASE_ACCESS_TOKEN`
  (valor não impresso, só campos não secretos): SMTP próprio pela Resend
  (`smtp.resend.com:465`), remetente `nao-responda@granaponto.com.br`,
  `rate_limit_email_sent: 30`/h, `site_url: granaapp://`.
- Conta não criada: login com o mesmo e-mail devolve `invalid_credentials`,
  não `email_not_confirmed`. O GoTrue desfaz o usuário quando o e-mail de
  confirmação não sai.

### O que NÃO foi validado

- [ ] **Se o 500 é só do `@example.com` ou de qualquer e-mail.** O domínio
  `example.com` é reservado e não recebe e-mail; a Resend pode recusar o
  envio por isso. Se for qualquer e-mail, **nenhum cliente novo consegue se
  cadastrar**, o que é crítico com cobrança ligada. Não testado para não
  deixar usuário órfão sem confirmação. Teste sugerido: cadastro com
  `delivered+audit@resend.dev` (endereço de teste da Resend, entrega simulada)
  ou um e-mail real do autor, e apagar o usuário depois via service_role.
- [ ] Olhar no painel da Resend o log do envio de 22/09 (domínio verificado?
  chave válida?).
- [ ] Tela depois da confirmação: se o app abre sem assinatura ou mostra a
  tela de assinar com preço e botão da Cakto. Não alcançado.
- [ ] `site_url` é `granaapp://`: o link de confirmação aberto num computador
  pode não levar a lugar nenhum. Hipótese, não conferida.

### Achados

- **A1 (crítica se confirmada para qualquer e-mail).** Cadastro pela web
  falha com 500 "Error sending confirmation email".
- **A2 (média).** A mensagem ao usuário diz "o servidor não respondeu", que
  sugere tentar de novo; a falha é no envio do e-mail e repetir não resolve.

Nada foi alterado no código, no Supabase ou na Resend.

### Rodada 2: separar "só example.com" de "qualquer e-mail"

**Pedido.** Do Codex: repetir o cadastro pela web com
`delivered+audit20260922@resend.dev` (endereço de teste da Resend) e ler os
logs de auth das duas tentativas, sem escrever nada.

**Resultado. O cadastro FUNCIONA com e-mail entregável. O 500 era só do
domínio reservado `example.com`.** O achado A1 cai: não há quebra geral.

1. `/sign-up` preenchido com `delivered+audit20260922@resend.dev`, senha
   inventada e não registrada, termos marcados (20:31, horário local).
   Print `06-form-resend.png`.
2. "Criar conta" → tela "Quase lá / Confirme seu e-mail": "Enviamos um link
   de confirmação para delivered+audit20260922@resend.dev. Abra o e-mail e
   toque no link para confirmar — o Grana abre sozinho, já conectado.", com o
   botão "Voltar para o login". Print `07-apos-criar-resend.png`.

**Logs de auth** (Management API, `analytics/endpoints/logs.all`, tabela
`auth_logs`, token lido dentro do processo e não impresso; o arquivo bruto foi
apagado depois, por conter dado de outros usuários):

| Hora (UTC) | Rota | Status | Erro |
|---|---|---|---|
| 23:25:18 | `/signup` | 500 | `gomail: could not send email 1: 550 "Invalid 'to' field. Please use our testing email address instead of domains like 'example.com'."` |
| 23:28:37 | `/signup` | 500 | o mesmo 550 da Resend (tentativa pela API) |
| 23:31:05 | `/signup` | 200 | nenhum |

A Resend recusa `example.com` de propósito e manda usar os endereços de teste
dela. A SMTP, o domínio remetente e a chave estão funcionando.

**Achados novos**

- **A3 (baixa, copy).** A tela "Confirme seu e-mail" usa travessão, contra a
  regra de copy do Grana.
- **A4 (média, hipótese não conferida).** O texto promete "o Grana abre
  sozinho, já conectado", mas `site_url` é `granaapp://`. Quem se cadastra
  pela web num computador pode abrir o link e não cair em lugar nenhum. Para
  conferir é preciso abrir o link de confirmação, e ele não chega a caixa
  nenhuma nesse endereço de teste.
- **A2 continua valendo.** Um e-mail que a Resend recusa aparece para a
  pessoa como "o servidor não respondeu agora. Tente de novo", e tentar de
  novo não resolve.

**Pendências**

- [ ] **Usuário AUDIT não confirmado ficou no Auth:**
  `delivered+audit20260922@resend.dev`. Não dá para excluir pelo app, porque
  ele não entra sem confirmar, e o pedido proibia escrever no Supabase. Apagar
  com service_role (Admin API ou painel) quando o autor liberar.
- [ ] Tela depois da confirmação (app liberado ou tela de assinar com preço e
  botão da Cakto): continua sem verificação. Para chegar lá é preciso uma
  caixa de e-mail real, ou confirmar o usuário pela Admin API.

## Backend Engineer: a conta de teste está na cortesia? e onde um assinante pode ficar preso no paywall?

**Pedido.** Do autor, repassado pelo Codex via `.maestri`: dois testes do
fluxo de assinatura, sem mexer em código. O segundo cruza com o item que a
própria sessão de hoje (bloco "22/09 — ligar `enforce_subscriptions`" no
`context.md`) tinha deixado pendente na checklist, e com o A4 do Compass
acima — cheguei nele por leitura de código, antes de ler a seção dele, e os
dois achados batem.

### Teste 1 — a conta de teste dos agentes está entre as cortesias?

**Resultado: SIM.** Consulta somente leitura (`SELECT`) via Management API
do Supabase, script Node que lê `E2E_TEST_EMAIL` e `SUPABASE_ACCESS_TOKEN`
só dentro do próprio processo (`node --env-file=.env`), sem imprimir e-mail,
senha nem token em nenhum momento — nem no terminal, nem aqui.

```
provider=interno, status=active, access_until=2099-12-31 23:59:59+00,
vinculada_a_conta=true
```

Cortesia concedida, sem prazo prático, já vinculada a um `user_id` (a conta
já existia e já logou). Com `enforce_subscriptions=true` (confirmado ainda
ligado, `updated_at=2026-09-22 23:18:09 UTC`, mesma consulta read-only), a
conta de teste dos agentes entra no app normalmente — item da checklist
resolvido.

### Teste 2 — quem assina com o paywall já ligado volta direto pro app?

**Não dá para pagar de verdade** (regras 4/11: nada de compra real nem de
publicar algo). O que segue é leitura de código/config, separada do que foi
de fato executado — e cruzada com a Rodada 1/2 do Compass, acima.

**Comprovado nesta sessão (execução real, read-only):**

- `app_backend_config.enforce_subscriptions = true`, `updated_at` 22/09
  23:18 UTC (consulta SQL direta).
- Config de Auth do Supabase (`GET .../config/auth`, só campos não secretos
  lidos, nenhum segredo): `mailer_autoconfirm=false`, `site_url="granaapp://"`,
  `uri_allow_list` inclui `granaapp://*`, `https://granaponto.com.br/*` e
  `https://www.granaponto.com.br/*`. Bate com o que o Compass leu em
  `/auth/v1/settings`.

**Leitura de código (não executada):**

1. **A "URL de retorno" da Cakto é a do e-mail pós-compra, não a do
   checkout.** Não há redirect configurável em `pay.cakto.com.br/...` neste
   repositório; o retorno documentado é o `emailAccessLink` do produto na
   Cakto, gravado como `https://granaponto.com.br/ativar` (context.md,
   13/09/2026, verificado então via `products_retrieve` da API da Cakto).
   **Não re-verificado agora**: o MCP da Cakto foi removido desta máquina
   (context.md, 10/09) e não existe outro script no repositório para chamar a
   API dela; montar um cliente OAuth novo ficaria fora do escopo ("se houver
   API" — não há uma pronta, e o pedido foi para não escrever código).
2. **Sem token por comprador, o único vínculo automático é por e-mail
   igual.** `app/ativar.tsx` tem um caminho com `?token=` que a própria Cakto
   não sabe gerar (comentário explícito no arquivo) e um caminho sem token,
   que é o único que a Cakto entrega de verdade. Sem token, quem compra com
   um e-mail e cria conta com outro **não tem recurso automático nenhum** —
   só cortesia manual (`conceder_acesso_cortesia`, service_role).
3. **A4 do Compass, confirmado com a causa exata.** `app/sign-up.tsx` promete
   "o Grana abre sozinho, já conectado" depois de confirmar o e-mail. Mas
   `emailRedirectTo` é `Linking.createURL('/auth/callback')`, que na WEB
   resolve para `https://granaponto.com.br/auth/callback` (por isso esse host
   está no `uri_allow_list`, ao lado do scheme `granaapp://`). Busquei no
   repositório inteiro por `assetlinks`, `associatedDomains` e
   `intentFilters` (Android App Links/iOS Universal Links) — **não existe
   nenhum**. Sem essa config, um link `https://granaponto.com.br/...` tocado
   no Gmail do celular abre o **navegador**, não o app instalado. Quem se
   cadastrou pela web (o caminho real de quem ainda não tem o app, vindo do
   `emailAccessLink` da Cakto → `/ativar` → `/sign-up`) fica logado na
   **versão web** do Grana., não no app Android. Não é o paywall travando —
   é a pessoa "chegar" no lugar errado, sem saber que precisa abrir o app de
   verdade e entrar de novo com a mesma senha. Confirma o A4 do Compass por
   um caminho diferente (leitura de código, não tentativa de clique); a parte
   que falta provar (clicar num link de confirmação de verdade) é a mesma
   pendência que ele já registrou.
4. **O que NÃO deveria travar, pelo que o código mostra.** Todo carregamento
   de acesso (`EntitlementProvider.recarregar`, em qualquer tela) chama
   `vincular_assinatura_automatica()` de novo antes de checar
   `obter_estado_acesso()` — não só no login. Uma vez logado no **app
   nativo** com o mesmo e-mail da compra, com o webhook da Cakto já
   processado, o acesso libera sozinho; o botão "Já paguei — verificar
   acesso" em `app/assinar.tsx` força essa re-checagem a qualquer momento.
5. **Risco sistêmico já conhecido, não novo desta sessão:** `cakto-webhook`
   não tem reenvio (a Cakto trata qualquer resposta como entrega); evento
   perdido (erro 500, RPC falhando) só deixa log (`perdaIrrecuperavel`), sem
   recuperação automática.

**Resumo:** juntando os dois testes, a ordem mais provável de alguém ficar
preso, hoje, é (1) e-mail da compra diferente do e-mail da conta — sem
recurso automático — e (2) confirmação de e-mail abrindo a versão web em vez
do app nativo, por falta de Android App Links (A4, agora com a causa
identificada). O 500 geral do Compass (A1) **não se confirmou** — era
`example.com` sendo recusado pela Resend, não uma falha geral de cadastro.
Nenhum dos pontos acima é bug no paywall em si: a lógica de liberação por
e-mail, dentro do app nativo já logado, funciona pelo que o código mostra.

**Não verificado nesta sessão:**
- [ ] Abrir de fato um link de confirmação a partir do Gmail do celular e ver
  se abre o navegador ou o app (mesma pendência do Compass, causa raiz agora
  identificada: falta de App Links).
- [ ] Uma compra de teste real na Cakto, ponta a ponta, com o paywall ligado.

Nada foi alterado no código, no Supabase, na Cakto ou na Vercel. Nenhuma
escrita foi feita em nenhum banco.

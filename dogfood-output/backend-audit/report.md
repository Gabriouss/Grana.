# Auditoria rigorosa de backend — Grana.

Data: 30/08/2026 (America/Sao_Paulo)  
Escopo: PostgreSQL/Supabase, RLS e RPCs, Edge Functions, autenticação, integrações Meta/Kiwify/EAS, persistência financeira, privacidade, dependências e repositório GitHub.

## Veredito executivo

O backend ainda não está pronto para um lançamento comercial pago. A base tem boas defesas elementares, mas há quatro classes de risco que precisam ser fechadas antes de cobrar usuários:

1. a assinatura não controla acesso;
2. o webhook da Kiwify não implementa corretamente o ciclo oficial de renovação/atraso;
3. operações financeiras e webhooks não são transacionais/idempotentes;
4. rotas com `service_role` confiam em estado que o próprio cliente pode editar.

Contagem desta auditoria: **2 críticos, 7 altos, 7 médios e 1 baixo**. “Crítico” inclui bloqueador comercial, não apenas invasão remota.

## Estado analisado

- GitHub: repositório público `Gabriouss/Grana.`, branch padrão `main`, commit remoto confirmado `cd15ab1d484432c0c81c85851bc263de3543cea8`.
- O `HEAD` local parte do mesmo commit, mas o working tree contém muitas alterações não commitadas. `supabase/schema.sql` local tem uma RPC adicional (`saldos_por_carteira`) que ainda não está em `origin/main`.
- Branches remotas: `main`, `master` (12 commits atrás, sem commits exclusivos) e `preview/copy-landing` (5 commits atrás e 2 exclusivos).
- As três Edge Functions responderam em produção com os status esperados para GET sem credencial: WhatsApp 403; Kiwify e EAS 405.
- Nenhuma linha de usuário foi consultada. As verificações implantadas usaram apenas saúde, configuração pública, `limit=0` e uma RPC booleana sem usuário.

## Achados

### GRN-BE-001 — Crítico — assinatura não controla o acesso

**Confirmado no GitHub e no working tree.**

O próprio código registra que `temAssinaturaAtiva()` não é chamada em tela nenhuma. As rotas protegidas exigem apenas sessão autenticada, e as políticas RLS das tabelas financeiras autorizam qualquer usuário autenticado sobre as próprias linhas sem verificar assinatura.

Evidências:

- `app/index.tsx:63-64` e `app/index.tsx:103`;
- `lib/assinatura.ts:64-68`;
- `supabase/schema.sql:220-241`, com o mesmo padrão nas demais tabelas.

Impacto: qualquer pessoa cria conta e usa o produto completo sem pagar. Colocar apenas um paywall no cliente não resolve, porque a chave `anon` e a API são públicas; o controle precisa existir também no banco/RPCs.

Correção necessária: definir uma única regra server-side de entitlement e aplicá-la às políticas de acesso e às operações mutáveis, preservando rotas mínimas para ativação, perfil e exclusão de conta. Cobrir ativo, carência, cancelado, reembolso e chargeback com testes RLS negativos.

### GRN-BE-002 — Crítico antes do lançamento — contrato da Kiwify incompatível com o ciclo recorrente oficial

**Confirmado no GitHub e no working tree.**

O normalizador classifica `subscription_canceled`, mas não classifica os gatilhos oficiais `subscription_renewed` e `subscription_late`. Ambos caem em `desconhecido` e retornam 200 sem atualizar a assinatura. O parser também procura `subscription.next_charge_date`, enquanto o payload documentado de compra usa `Subscription.next_payment` e oferece `Subscription.customer_access.access_until`.

Evidências:

- `supabase/functions/kiwify-webhook/index.ts:90-129`;
- `supabase/functions/kiwify-webhook/index.ts:169-175`;
- documentação oficial da Kiwify lista `subscription_renewed`, `subscription_late` e `subscription_canceled` e documenta o payload de compra;
- o cabeçalho do próprio arquivo, linhas 7-27, admite que o contrato e a autenticação não foram confirmados.

Há problemas adicionais no mesmo fluxo:

- autenticação por token na query string foi assumida, mas não fechada contra o contrato real do painel;
- resultados de `upsert`/`update` são ignorados e a função devolve 200 mesmo se a gravação falhar (`index.ts:184-237`);
- eventos fora de ordem podem fazer um evento antigo sobrescrever estado mais novo;
- não há ID único do evento nem tabela de inbox idempotente.

Impacto: renovação paga pode não estender acesso; atraso pode não iniciar carência; falha de banco pode ser confirmada à Kiwify e nunca receber retry.

Correção necessária: capturar fixtures reais de todos os gatilhos no modo de teste da Kiwify; validar o segredo no lugar exato documentado; normalizar IDs de pedido, assinatura e evento separadamente; persistir primeiro em inbox com chave única; processar em transação; rejeitar ou reenfileirar falhas; proteger contra eventos atrasados.

### GRN-BE-003 — Alto — `service_role` do WhatsApp funciona como “confused deputy”

**Confirmado no GitHub e no working tree.**

A política `FOR ALL` de `whatsapp_links` permite ao dono editar todas as colunas da própria linha, inclusive `phone`, `verified`, `last_entry_kind`, `last_entry_id` e `last_entry_at`. Depois, o webhook usa `service_role` e apaga `bills`/`transactions` somente pelo UUID guardado, sem reafirmar `user_id`.

Evidências:

- `supabase/schema.sql:107-147`;
- `supabase/functions/whatsapp-webhook/index.ts:1895-1952`.

Impacto: se um UUID de outra conta for conhecido por qualquer vazamento ou referência cruzada, um usuário autenticado pode preparar seu `last_entry_id`, mandar “cancela” e induzir a função privilegiada a ler/apagar linha alheia. Mesmo sem UUID alheio, o cliente pode marcar seu vínculo como verificado ou mudar o telefone sem provar posse.

Correção necessária: retirar UPDATE direto dessas colunas; expor ao cliente somente criação/remoção do pedido de pareamento; manter estado verificado e “último lançamento” em tabela privada ou RPCs restritas. Toda operação privilegiada deve filtrar simultaneamente por `id` **e** pelo `user_id` derivado do vínculo confirmado.

### GRN-BE-004 — Alto — webhook do WhatsApp não é idempotente e confirma falhas como sucesso

**Confirmado no GitHub e no working tree.**

O payload contém `message.id`, mas o código não o persiste nem deduplica. O handler processa apenas o primeiro `entry/change/message`. Qualquer exceção é apenas logada e a função sempre responde 200 para impedir retry.

Evidências:

- `supabase/functions/whatsapp-webhook/index.ts:2108-2148`;
- `finalizarLancamento`, linhas 1145-1232, não recebe ID da mensagem.

Impacto: reentrega cria lançamentos duplicados; erro transitório perde lançamento definitivamente; lotes podem perder todas as mensagens depois da primeira. Mensagens concorrentes do mesmo telefone também disputam `whatsapp_pending` e `last_entry_id` sem serialização.

Correção necessária: inbox por `provider_message_id UNIQUE`, processamento de todos os itens do lote, estado `received/processing/done/failed`, lock/advisory lock por telefone e retry seguro.

### GRN-BE-005 — Alto — operações financeiras multi-etapa não são transacionais

**Confirmado no GitHub e no working tree.**

Pagamento de boleto, pagamento de fatura, reabertura e parcelamento executam várias chamadas PostgREST independentes.

Evidências:

- `lib/data.ts:172-220` — cria saída e depois fatura; reabre em ordem inversa;
- `lib/data.ts:334-423` — insere parcelas em loop;
- `lib/data.ts:555-597` — cria/apaga saída separadamente da mudança do boleto;
- `supabase/functions/whatsapp-webhook/index.ts:1159-1218` — parcelamento em loop e limpeza do rascunho mesmo após erro parcial.

Impacto: falha no segundo passo deixa saída órfã, fatura marcada de forma divergente ou série com apenas parte das parcelas. Retry pode duplicar o que já entrou.

Correção necessária: mover cada caso para uma RPC transacional com validação de dono, constraint idempotente e retorno único. Não engolir falha de exclusão antes de atualizar o estado principal.

### GRN-BE-006 — Alto — coleta excessiva de PII e log não autenticado sem retenção

**Confirmado no GitHub e no working tree.**

O webhook da Kiwify grava corpo e todos os headers **antes** de autenticar, inclusive para chamadas inválidas. `webhook_raw_log` não tem expiração, limite, redaction ou ID de evento. O mesmo payload inteiro também fica em `subscriptions.raw_last_event`.

Evidências:

- `supabase/functions/kiwify-webhook/index.ts:132-162`;
- `supabase/schema.sql:932-967`;
- o payload oficial da Kiwify contém nome, e-mail, telefone, CPF, IP e metadados do cartão/compra;
- `lib/legal-content.ts:84-91` afirma um compartilhamento bem menor: e-mail e status, e que nenhum terceiro/dado excede o necessário.

Impacto: spam no endpoint público pode consumir o banco Free; dados falsos ou sensíveis ficam indefinidamente; o tratamento real diverge da política de privacidade. Se o segredo vier no corpo em algum tipo de evento, ele também é armazenado cru.

Correção necessária: autenticar antes de persistir; impor limite de corpo e rate limit; armazenar somente campos mínimos e hash/ID do evento; mascarar headers; TTL curto com job de expurgo; documentar base legal e retenção.

### GRN-BE-007 — Alto — exclusão de conta não apaga todos os dados prometidos

**Confirmado no GitHub e no working tree.**

A foto é gravada em `storage.objects`, mas `delete_user_account()` não remove o objeto e a UI não chama `removerFoto()` antes da RPC. `webhook_raw_log` não possui `user_id` e também permanece. Feedbacks são apenas desvinculados; `screenshot_url` e metadados continuam.

Evidências:

- `lib/profile.ts:104-145` e `lib/profile.ts:151-159`;
- `app/(app)/perfil.tsx:142-158`;
- `supabase/schema.sql:1061-1090`;
- `lib/legal-content.ts:54`, `97`, `155` e `231-235` prometem exclusão permanente dos dados da conta.

Impacto: dado pessoal pode sobreviver à exclusão da conta, contrariando produto e política. Se o bucket `avatars` estiver público, o objeto órfão continua acessível por URL. A configuração pública/privada do bucket não pôde ser confirmada pela API, mas o cliente usa `getPublicUrl()`.

Correção necessária: orquestrar exclusão server-side, removendo Storage e registros operacionais vinculáveis antes de apagar `auth.users`; definir retenções legais explícitas; testar a ausência posterior por todas as superfícies.

### GRN-BE-008 — Alto — schema não reproduz um banco novo e não há migrações versionadas

**Confirmado no GitHub e no working tree.**

`schema.sql` adiciona FK de `whatsapp_pending.card_id` para `credit_cards` na linha 176, mas `credit_cards` só é criada na linha 537. Em um banco vazio, a execução para em `relation "credit_cards" does not exist`. O arquivo mistura bootstrap e alterações incrementais com `IF NOT EXISTS`, sem `supabase/migrations/` ou tabela de versão.

Impacto: disaster recovery, staging e nova máquina não conseguem reconstruir o backend de forma determinística. “Rodar o arquivo uma vez no SQL Editor” não representa o estado realmente implantado.

Correção necessária: gerar baseline ordenado e migrações imutáveis; usar Supabase CLI em projeto local/staging; CI deve aplicar tudo do zero e executar lint/pgTAP/RLS.

### GRN-BE-009 — Alto — callback de Auth transporta sessão por schemes não verificados

**Confirmado no GitHub e no working tree.**

Confirmação de e-mail e recuperação usam `granaapp://`/`grana://`, carregando `access_token` e `refresh_token` no fragmento. O app aceita qualquer URL recebida que contenha esses parâmetros, sem validar scheme, host ou rota.

Evidências:

- `app.json:5-8`;
- `lib/auth-context.tsx:40-63` e `102-130`.

Impacto: outro app instalado pode registrar o mesmo scheme e interceptar a sessão. O RFC 8252 observa que schemes privados podem ser registrados por múltiplos apps e recomenda claimed HTTPS quando possível.

Correção necessária: Android App Links/iOS Universal Links em domínio controlado, callback dedicado e allowlist estrita de scheme/host/path; preferir fluxo PKCE/token hash em vez de importar tokens longos diretamente.

### GRN-BE-010 — Médio — integridade entre locatários não é garantida por todas as FKs

**Confirmado no GitHub e no working tree.**

Há trigger correto para `wallet_id` em quatro tabelas, mas não há equivalente para:

- `transactions.card_id` e `transactions.parent_id`;
- `bills.paid_transaction_id`;
- `credit_card_invoices.card_id`, `wallet_id` e `paid_transaction_id`.

A policy de insert da fatura confere apenas `user_id` (`schema.sql:881-885`).

Impacto: conhecendo UUID alheio, uma conta pode criar referência cruzada, provocar conflito no `UNIQUE(card_id, year, month)` ou deixar relacionamentos incoerentes. RLS impede leitura direta, mas não substitui integridade de escrita.

Correção necessária: FK composta `(user_id, id)`/constraints ou triggers que validem o mesmo dono em todas as relações; testes negativos A→B.

### GRN-BE-011 — Médio — RPCs `SECURITY DEFINER` de assinatura têm grants/search path incompletos

**Confirmado no GitHub e parcialmente confirmado em produção.**

As três RPCs usam `set search_path = public`, referências não qualificadas e revogam apenas de `public`, não de `anon`. Uma chamada implantada com chave anônima a `tem_assinatura_ativa()` retornou HTTP 200; `get_gamification_summary()`, que revoga `public, anon`, retornou 401.

Evidências:

- `supabase/schema.sql:975-1048`;
- contraste correto em `schema.sql:52-76`.

Impacto: superfície RPC maior que a pretendida; `vincular_assinatura_por_token` pode virar oráculo de token/rota anônima conforme os grants implantados. Search path `public` é mais fraco que o padrão recomendado para funções privilegiadas.

Correção necessária: `set search_path = ''`, nomes totalmente qualificados, `revoke all ... from public, anon`, grants mínimos e testes de matriz anon/authenticated/service_role.

### GRN-BE-012 — Médio — GitHub sem gates de qualidade e segurança

**Confirmado no GitHub em 30/08/2026.**

- `main` sem branch protection e sem ruleset;
- zero workflows em GitHub Actions;
- sem CI de TypeScript, parser, schema, Edge Functions, RLS ou secret lint;
- Dependabot security updates desabilitado e Dependabot alerts não habilitado/acessível;
- code scanning não configurado;
- secret scanning e push protection estão habilitados — ponto positivo.

Impacto: um push direto pode publicar regressão de RLS/webhook sem revisão ou teste. As branches antigas/divergentes ampliam risco de deploy a partir da origem errada.

Correção necessária: proteger `main`; PR obrigatório; checks de `tsc`, corpus, schema fresh-apply, Deno check/test, RLS/pgTAP e npm audit; habilitar Dependabot alerts/updates e CodeQL; excluir ou documentar branches obsoletas.

### GRN-BE-013 — Médio — corrida no webhook de release EAS

**Confirmado no GitHub e no working tree.**

O handler faz SELECT da versão e UPDATE depois, em duas operações (`eas-build-webhook/index.ts:130-139`). Dois builds podem ler a mesma versão; o mais novo atualiza primeiro e o mais antigo sobrescreve depois, contrariando o comentário de que nunca regride.

Correção necessária: UPDATE condicional atômico/RPC com lock e comparação semver no banco, verificando também quantidade de linhas alteradas. Hoje um `UPDATE` que afete zero linhas retorna sucesso.

### GRN-BE-014 — Médio — pareamento de WhatsApp previsível e sem controles de tentativa

**Confirmado no GitHub e no working tree.**

O código de seis dígitos é gerado por `Math.random()` no cliente (`lib/data.ts:759-797`), sem constraint de unicidade, limite de tentativas ou rate limit por telefone/IP. A validade de 15 minutos ajuda, mas não resolve colisão nem abuso. O update de confirmação também não repete `verified=false`, permitindo corrida (`whatsapp-webhook/index.ts:1005-1028`).

Correção necessária: geração criptográfica server-side, hash do código, unicidade dentro da janela, tentativas/lockout e update atômico “consume once”.

### GRN-BE-015 — Médio — estado de XP e outros campos internos editáveis pelo cliente

**Confirmado no GitHub e no working tree.**

`user_gamification` usa policy `FOR ALL`, logo o cliente pode atualizar `lifetime_xp` e `streak_shields` diretamente, contornando o teto de `add_xp()` (`schema.sql:471-529`). O mesmo padrão amplo existe em entidades que misturam campos do usuário e campos operacionais.

Correção necessária: separar policies por operação e usar privilégios por coluna/RPCs para campos controlados pelo servidor.

### GRN-BE-016 — Médio — token de ativação é bearer sem expiração e armazenado cru

**Confirmado no GitHub e no working tree.**

`subscriptions.activation_token` tem 128 bits aleatórios e unicidade, mas não tem `expires_at`, hash ou rotação após uso (`schema.sql:928-938`, `1029-1044`). Enquanto a assinatura estiver sem dono, um link vazado continua reclamável indefinidamente.

Correção necessária: armazenar hash, prazo curto, consumo atômico e revogação explícita; evitar token em logs/analytics/referrer.

### GRN-BE-017 — Baixo — dependência transitiva com advisory moderado

`npm audit` encontrou 12 nós moderados, todos propagados por um advisory de `uuid < 11.1.1`; a instalação atual chega a `uuid@7.0.3` por `expo-sharing → @expo/config-plugins → xcode`. Não houve alerta alto ou crítico. O vetor exige uso específico de buffer em UUID e parece concentrado em tooling, portanto não é P0, mas deve ser acompanhado com a matriz oficial do Expo em vez do downgrade major sugerido pelo npm.

## Controles positivos encontrados

- RLS está habilitado em todas as tabelas de dados do schema; policies de dono usam `USING` e `WITH CHECK` e, em geral, envolvem `auth.uid()` em subselect.
- Assinatura da Meta (`X-Hub-Signature-256`) e assinatura da EAS falham fechadas quando o secret falta e usam comparação constante.
- `SUPABASE_SERVICE_ROLE_KEY` aparece somente como secret de Edge Function; não foi encontrado hard-code de service role, OpenAI, Groq, GitHub ou chave privada nos arquivos rastreados nem no histórico local das refs disponíveis.
- `.env` não está rastreado; somente `.env.example` com placeholders.
- GitHub Secret Scanning e Push Protection estão habilitados.
- `npx tsc --noEmit`: aprovado.
- `npm run test:parser`: aprovado, incluindo 106/106, 250.200/250.200, 16.332/16.332, 34.093/34.093 e demais corpora, todos com zero falhas.
- A API de dados implantada respondeu 200 para consultas `limit=0`; o 401 no root OpenAPI não representa indisponibilidade das tabelas.

## Lacunas de verificação

- O endpoint OpenAPI do PostgREST implantado não permitiu introspecção; portanto não foi possível provar que todas as policies, grants, índices e constraints do arquivo correspondem ao banco real.
- Deno e Supabase CLI não estão instalados nesta máquina; as Edge Functions não passaram por `deno check` nem testes integrados locais.
- Não há banco local/staging reproduzível para `db lint`, `EXPLAIN`, pgTAP ou testes reais de concorrência/RLS.
- Não foram realizadas tentativas de exploração contra contas reais, escrita de eventos, alteração do GitHub ou mudança no Supabase.

## Ordem recomendada de correção

1. Fechar `GRN-BE-001` e `002` antes de vender qualquer assinatura.
2. Fechar o caminho privilegiado do WhatsApp (`003`) e introduzir idempotência/inbox (`004`).
3. Migrar todas as operações financeiras multi-etapa para RPCs transacionais (`005`) e validar FKs multi-tenant (`010`).
4. Minimizar/expurgar logs e tornar exclusão de conta completa (`006`, `007`).
5. Criar baseline+migrations+staging+testes RLS (`008`, `011`).
6. Migrar callbacks de Auth para App/Universal Links (`009`).
7. Só então automatizar gates no GitHub e corrigir os médios restantes.

## Fontes primárias consultadas

- Repositório: https://github.com/Gabriouss/Grana.
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Database Functions: https://supabase.com/docs/guides/database/functions
- Supabase API security: https://supabase.com/docs/guides/api/securing-your-api
- Kiwify — webhooks/payload: https://kiwify.notion.site/Webhooks-pt-br-c77eb84be10c42e6bb97cd391bca9dce
- Kiwify — criação e gatilhos: https://docs.kiwify.com.br/api-reference/webhooks/create
- Expo Linking: https://docs.expo.dev/linking/into-your-app/
- RFC 8252: https://datatracker.ietf.org/doc/rfc8252/
- GitHub security settings: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-security-and-analysis-settings-for-your-repository
- GitHub Dependabot alerts: https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-alerts
- Advisory `uuid`: https://github.com/advisories/GHSA-w5hq-g745-h8pq

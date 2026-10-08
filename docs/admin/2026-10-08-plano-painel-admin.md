# Plano · terminar o painel administrativo (08/10/2026, M1, a partir das 13h)

Escrito pelo Orquestrador Supremo a partir do pedido do autor de 08/10, para ser
executado pelos dois times sem novas perguntas (o autor sai às 12h e acompanha
pela M2, pelo GitHub e pelo vault). Repositório público: nenhum valor de
credencial aqui nem em nenhum arquivo versionado (regra 15); só nomes de variável.

Relatórios e estado de cada agente: `E:\Grana-temporarios\2026-10-08-painel\`.
Andamento resumido: seção "Andamento" no fim deste arquivo, atualizada pelo Ledger.

## O pedido, nas palavras do autor

1. "eu quero que você finalize o painel administrativo"
2. "feche aquela [lógica] do botão que serviria para preparar build [...] resolva isso daí"
3. Correções de marketing: "eu passo o feedback lá no painel, você recebe aqui, faz as
   alterações e sobe para o painel a correção que eu pedi [...] muito fácil, rápido,
   prático, quase zero aperto"
4. "um post agendado para sair lá no painel [...] seja agendado na meta. Aí saia
   conforme o calendário"
5. "fechar também a questão de subir o painel para a web no domínio do Grana [...]
   não pode ser frágil a ataques, DDoS e tentativas de muitas requisições [...] a
   segurança seja um ponto rigoroso no painel"
6. "70% Codex e 30% Claude": o time Codex executa; o time Claude julga e revisa.
7. "utilize sempre as skills disponíveis"; "subisse tudo ao repositório";
   "Registre tudo no vault também".

## Divisão (Codex executa, Claude julga)

| Frente | Executa (Codex) | Julga (Claude) |
|---|---|---|
| A. Painel local terminado | Forge (tela), Harbor (servidor), Sentinel (QA) | Lumen (visual), Vigil (confere QA) |
| B. Botão de build | Harbor (servidor), Forge (tela) | Keel |
| C. Ciclo de ajustes de marketing | Compass (desenho), Harbor + Forge (implementa), Beacon (executa as correções) | Meridian (desenho), Flare (correções) |
| D. Calendário na Meta | Compass (pesquisa), Harbor (integração), Beacon (regras de campanha) | Keel (código), Flare (regra de campanha) |
| E. Painel na web, segurança rigorosa | Harbor (função), Forge + Prism (página), Watchtower (red team) | Lynx (segundo olhar de segurança) |
| F. Registro | Ledger (context.md, vault, fichário) | Quill (confere) |

Skills obrigatórias por frente (regra 7): A `impeccable`, `ui-visual-composition`,
`web-design-guidelines`, `webapp-testing`, `test-scenarios`; B e D
`intended-vs-implemented`; C `copywriting`, `grammar-check`; D e E
`supabase-postgres-best-practices`, `security-review`; E `webapp-testing`. Cada
relatório diz qual skill foi usada em quê.

## A. Painel local terminado

Fonte única do que falta: `relatorio-compass-painel-local-pendencias.md` (rodada
08/10). Fechar todos os itens "Código confirmado" (alvos de 44 px, rota
desconhecida com "Página não encontrada", Tráfego, Calendário), o favicon único
(o da 404, em todas as páginas e no painel local) e o QA visual das seis telas.
Calendário e Feed foram aprovados pelo autor ("A questão da interatividade do
calendário está boa. A simulação do feed do Instagram está boa"): não redesenhar.
Commit por item, mudança de layout em commit próprio (regra 14).

## B. Botão de build (decisão do maestro, porque o autor delegou)

O botão hoje só prepara e devolve o comando. Passa a ter duas etapas, as duas com
frase de confirmação digitada:

1. **Preparar** (como hoje): roda `scripts/preparar-lancamento.ts` sem shell,
   respeita o teto da semana (regra 22) e a trava do `.env` (regra 15), e agora
   também commita e publica o `app.json` (o preparo só conta quando está no git).
2. **Disparar** (novo, frase `DISPARAR BUILD`): roda `eas build --profile preview
   --platform android --non-interactive --no-wait`, com a nota passada como
   argumento de processo (`execFile`, sem shell). Lição de 08/10: a nota de 10
   linhas passada pelo terminal do Windows virou 1 linha. Depois do anúncio, o
   painel confere `app_release.notes` contra a nota aprovada e, se divergir,
   mostra o recibo e oferece regravar.

O clique do autor com a frase é o pedido explícito da regra 4. Nenhum agente
aciona o botão. Teste com módulo real e dublês de `git`, `eas` e banco: nenhum
build real em teste.

## C. Ciclo de ajustes de marketing ("quase zero aperto")

Fluxo-alvo, a ser desenhado pelo Compass e julgado pelo Meridian antes de codar:

1. O autor marca "Pedir ajuste" numa peça e escreve o que quer (já existe:
   grava em `docs/marketing/painel/aprovacoes.json`).
2. O pedido vira item numa **fila de ajustes** com estado: `novo` →
   `em-correcao` → `corrigido-aguardando-aceite` → `aceito` ou `novo` de novo.
3. Um vigia local (sobe junto com o painel ou com o Maestri, como o guardião das
   caixas) vê o item `novo` e entrega ao agente de marketing (Beacon, par Flare)
   por `.maestri/enviar.sh`, com peça, versão, caminho e o texto do autor.
4. O agente corrige, gera a nova versão, registra em `aprovacoes.json` o novo
   sha1 e muda o estado para `corrigido-aguardando-aceite`, com commit e push.
5. O painel mostra "Corrigido, veja a versão nova" com antes e depois lado a
   lado, e os botões Aprovar e Pedir ajuste de novo.

Requisitos: nenhum passo manual entre o clique do autor e o agente; recibo visível
em todo estado (regra 9), inclusive "ninguém pegou ainda" com a hora; funcionar
também quando o autor estiver na M2 (estudar gravar a fila numa tabela do
Supabase só do admin, lida e escrita pelo painel web, com o vigia da M1 lendo de
lá). Regras de criativo valem (regras 23 a 25; ElevenLabs só com aprovação do
autor antes, regra 24, então correção que exija ElevenLabs para e pede).

## D. Calendário executado na Meta

- Pesquisa primeiro (Compass): o que a API oficial da Meta permite hoje para
  Instagram e Facebook (publicação de conteúdo, agendamento nativo ou não,
  limites, tipo de conta e permissões exigidas, token de longa duração).
- Desenho: o painel continua sendo a fonte do calendário; um agendador do
  próprio projeto, sem custo novo (cron do Supabase ou equivalente no plano
  Free), publica na hora marcada pela API da Meta, ou usa o agendamento nativo
  onde existir. Recibo de cada publicação ou falha no painel.
- Credenciais da Meta: só nome de variável, valor no `.env` ou em secret.
  O autor cria o app e o token; até lá, a integração funciona em modo de ensaio
  (mostra o que publicaria e quando, sem chamar a Meta).
- Travas que não mudam: nada publica antes do dia D declarado pelo QA (decisão
  de 25/09; `calendario.json` está com `diaD: null`), e peça só vai para o
  calendário de publicação com aceite do autor registrado. Ligar a publicação
  real é decisão do autor, pelo painel, com frase de confirmação.

## E. Painel na web com segurança rigorosa

Base: `CONTRATO-admin-web.md` (rodada 07/10), função `admin-consulta`
(`da627b8`) e página sem rota (`9b9731a`). A build 1.10.6 já foi disparada, então
a rota `/admin` pode voltar.

Exigências de segurança (Watchtower ataca, Lynx confere, nada vai ao ar sem os dois):

- **Volume e DDoS:** a página é estática na Vercel (proteção de borda da própria
  Vercel); a função recusa cedo e barato, antes de qualquer consulta ao banco:
  método, tamanho do corpo, CORS só do domínio, limite por IP e por usuário,
  teto total de tempo; resposta de erro curta e sem detalhe. Medir o custo de
  um pedido negado e confirmar que um volume alto não esgota a cota do plano
  Free nem derruba o app (as funções do app não podem ser afetadas).
- **Login:** Supabase Auth com MFA TOTP obrigatório (aal2), allowlist de um
  usuário no servidor, CAPTCHA gratuito no login se o Supabase Free permitir
  sem custo, bloqueio progressivo de tentativas.
- **APIs nunca expostas:** nenhum token de provedor (Vercel, EAS, GitHub, Cakto,
  Meta) na função web nem no bundle; a web é só leitura de agregados. Ações que
  escrevem continuam no painel local.
- Cabeçalhos: `noindex`, CSP, `frame-ancestors 'none'`, sem cache de dados.
- Red team documentado: força bruta de login, repetição de token, JWT de outro
  usuário, conta não admin, pedidos em rajada, corpo grande, origem falsa.

Publicação: deploy da função nova só depois do parecer do Watchtower e do Lynx,
pela regra 11 inteira (`verify_jwt=true` conferido depois, função nomeada).
**Depende do autor e fica pronto para ele:** criar a conta admin, cadastrar o
TOTP no autenticador e o secret `ADMIN_USER_IDS` com o id dela. Sem isso a
página sobe, mas não entrega dado nenhum (falha fechada).

## F. Registro

Ledger mantém a seção "Andamento" deste arquivo, a nota de sessão
`00 - Sessões/2026-10-08 - M1 - Painel administrativo (tarde)` no vault e as notas
do fichário. Quill confere. Seis perguntas da regra 12 por frente.

## Andamento

- 13h05: plano publicado e distribuído.
- 13h08: Ledger releu o plano e assumiu a frente F; relatório parcial em `E:\Grana-temporarios\2026-10-08-painel\relatorio-ledger-painel-admin.md`.
- 13h56: Watchtower comunicou achados preliminares em E (limite global em memória pode bloquear usuário legítimo; aal2 por telefone aceito sem TOTP específico). Aguardam confirmação Harbor, retorno dos executores e segundo olhar Lynx; sem liberação para publicar.
- 14h00: na pasta da rodada, `keel-criterios-B-e-D.md` é critério de julgamento e `watchtower-admin-sondas.cjs` é sonda, não fechamento. Relatórios formais A–E seguem pendentes. Estado e lacunas: `E:\Grana-temporarios\2026-10-08-painel\estado-Ledger.md`.
- 14h01 — A: Forge reporta 32 combinações de fixture (8 rotas × 4 larguras), sem overflow, e correções de alvos/404/Tráfego; Lumen julgou o diff “PROCEDE” com duas ressalvas não bloqueantes. QA independente completo, seis telas e favicon global ainda pendem.
- 14h02 — B: Keel julgou “BOM”, mas pede correção de três achados médios (B1–B3) antes do commit. A suíte não foi executada por Keel; nenhum EAS real foi disparado.
- 14h03 — E: Watchtower confirma E1–E3 em harness local; Lynx concorda e conclui **NÃO PUBLICAR**. No delta de Harbor, Watchtower registrou 19 grupos verdes, mas reproduziu H1–H3 (recusas ainda consomem limite global, janela permite 119 Auth em 1.001 ms, IPv6 inválido não agrupa). CAPTCHA/progressivo, TOTP específico, export/headers e re-review do delta seguem pendentes; nada foi publicado.
- 14h04 — F: Quill revisou o relatório parcial de Ledger em `revisao-quill-ledger-painel-admin.md`; seis observações foram incorporadas. Nota parcial da sessão criada e indexada no vault. Relatório e estado atualizados na pasta externa; Ledger acompanha correções e relatórios restantes.
- 14h05 — A: quatro commits de Forge publicados (`8e4755e`, `a171210`, `37ed5a4`, `866b82d`). Lumen julgou o diff de Tráfego “PROCEDE”; QA de fixture sem overflow não substitui o QA independente das seis telas, tabela real ou conferência do favicon.
- 14h06 — B/E: Keel julgou B “BOM”, com B1–B3 ainda bloqueando commit; não executou a suíte. Lynx confirmou H1–H3 do hardening em E junto com Watchtower e manteve **NÃO PUBLICAR**; E2/TOTP, E3 final, E4 e E5 continuam pendentes.
- 14h06 — F: relatório e `estado-Ledger.md` atualizados, com as seis perguntas e limites de evidência; a nota de sessão recebeu adendo cronológico. A revisão Quill disponível cobre a primeira versão; revisão final após novas evidências ainda pendente.
- 14h07 — C: Compass informou desenho aprovado com mudanças por Meridian; Beacon iniciou piloto manual de oito ajustes. Relatório formal Compass e contrato Harbor ainda pendem; o ciclo automático aguarda o fechamento de E.
- 14h07 — E: Forge informou view/controle integrados, oito prazos de Auth/MFA e teste cliente verdes, com tsc 0. A rota está no working tree e os exports Android antes/depois estão em andamento. Sem re-review de Watchtower/Lynx; H1–H3 seguem bloqueando publicação.
- 14h08 — F: relatório externo e estado atualizados; nota do vault recebeu adendo. Evidências e pendências continuam distinguidas por frente; sem deploy, build EAS ou publicação na Meta.
- 14h10 — B/E: Keel aprovou o diff B para commit, com N1/N2 baixos; Harbor reporta 15 grupos verdes. `a5fe70c` (B) e `35a01d0` (backend E) já estão em `origin/main`; sem preparo de versão ou EAS real. Watchtower e Lynx confirmaram correções locais do backend E em 21 grupos e TOTP, mas `SEM_IP_RESIDUAL`/`OVERFLOW_RESIDUAL`, gateway/XFF, cota, E3/E5 e validações de publicação mantêm **NÃO PUBLICAR**.
- 14h12 — C/D: Compass entregou os relatórios formais. C: desenho aprovado com mudanças por Meridian; fila/integração e contrato Harbor pendentes, piloto Beacon manual. D: pesquisa concluída; fluxo Instagram consultado não demonstra agendamento futuro, Facebook Page tem recursos de agendamento no SDK; versão/quota, token, permissões/conta real, janela e Cron seguem sem confirmação. `diaD: null`; sem chamada, código ou publicação na Meta.
- 14h12 — E: Prism reporta 24/24 checks em fixture isolada. Watchtower relatou preliminarmente uma quebra de integração cliente/view: o cliente remove payload de indisponibilidade e `AdminVisual.web.tsx` lê `porPlano.mensal` antes de mostrar aviso. Sonda com cliente/view reais reproduziu; o adendo formal Watchtower ainda não estava na pasta. Forge/Prism avisados; sem publicação.
- 14h16 — F: Ledger atualizou o relatório externo e estado por seis perguntas com B/C/D/E; atualiza agora o contexto, vault e fichário. Quill deve revisar esta versão em arquivo separado; falta QA final de A, contrato/execução C/D e fechamento de E. Nenhuma credencial, build, deploy, migration ou chamada real à Meta.
- 14h18 — F: adendo parcial acrescentado a `context.md`, nota de sessão do vault e notas do fichário; regra de voz/ownership preservada. `node scripts/verificar-vault.mjs` rodou em 173 notas: 26 itens exigem atenção e 17 perenes não têm `revisado`; Ledger não fez limpeza fora do escopo. Revisão Quill desta versão e fechamento das frentes continuam pendentes.
- 14h20 — A: Sentinel e Vigil acharam dois overflows reais em 320 px no painel local (Documento 349 px, Tráfego 363 px); fixture estática de 32 casos não os expunha. Vão ao Lumen (`estilo.css`, commit próprio de layout); A segue aberta até repetir a matriz.
- 14h20 — E: `9fb1a16` (visual Prism, `AdminVisual.web.tsx` + CSS) publicado em `origin/main`. Prism: 24/24 em fixture e rota local nas quatro larguras, sem credencial real; isso não libera deploy.
- 14h24 — E: Watchtower encerrou F1 (bloco indisponível derrubava o painel) nos hashes revistos e a sonda e o teste integrado (32 combinações) passaram; Lynx tinha reproduzido F1 antes. **Não é liberação da frente E.** Faltam: segundo olhar Lynx na correção, revisão dos deltas estáveis de `PainelAdmin.web.tsx`/`admin-web.ts`, E5 (cabeçalhos/robots só provados em disco), sonda XFF do gateway, cota e export final. Eventos Auth tardios: lacuna de cobertura, sem acesso indevido demonstrado.
- 14h24 — E: varredura do export externo (84 arquivos, 19 valores do `.env`, valores não impressos): nenhum segredo privado; uma coincidência é o contato público de suporte, rastreada e não bloqueante. O `dist` final com `/admin` ainda não existia; a varredura final fica pendente.
- 14h24 — B: Keel julgou a tela BOM com T1 médio a fechar antes do commit (conferir nota não atualiza o estado e o botão "não saiu" continua); T2–T4 baixos. UI segue sem commit; nenhum EAS real.
- 14h25 — Passagem: o time Codex atingiu o limite de 5 h (volta 18h17). O par Claude assume por revezamento (Anvil, Keel, Lynx, Lumen, Vigil, Flare, Quill, Meridian); a sonda XFF fica para o Harbor às 18h17. Registro de F passa a ser de Quill.
- 14h50 — A: `14a4d86` corrige o overflow de 320 px em Documento e Tráfego (Lumen); reconferência do Vigil pendente.
- 14h50 — C: Keel publicou `d6c7170` (fila privada de ajustes fora do repositório, vigia, CLI de conclusão, migration `admin_ajustes_fila` para a M2, que foi APLICADA em produção depois, ver 15h00). Verificados: 13 grupos da fila e 17 verificações da migration em Postgres embutido. Sem verificação: entrega real ao Beacon por `enviar.sh`, vigia com o servidor reiniciado e a migration já em produção (conferida em 15h00). Faltam: textos e lista de estados na UI de aprovação (Anvil) e `test:admin` incluir os testes de ajustes.
- 14h50 — E: **/admin no ar** em `www.granaponto.com.br/admin` (`granaponto.com.br` dá 308), por `0528ada` (página), `fdb3229` (cabeçalhos, robots e SEO do HTML) e `6e5bbe6` (rota, commit próprio). Lynx deu APROVADO COM PUSH: hashes conferidos, varredura do `dist` final contra os 19 valores sem segredo privado (uma coincidência pública de contato rastreada), E5 em disco. Conferido ao vivo: `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `X-Frame-Options: DENY`, CSP presente, `noindex` no HTML sem canonical, `Disallow: /admin`. A `admin-consulta` NÃO está publicada: a página mostra só erro com recibo, sem dado nem cadastro de fator.
- 14h50 — E, deploy da função: Keel deixou o preparo pela regra 11 (`keel-deploy-admin-consulta.md`): a função não existe em produção, `deno check` 0, 21 grupos verdes, nada publicado. Faltam o secret `ADMIN_USER_IDS` (valor do autor) e o modo manual do autor; o terminal em auto mode bloqueia o deploy. Criar o secret reinstancia todas as funções e soma 1 em cada versão. A sonda XFF foi escrita e também não foi publicada. Gates XFF/gateway, E4 e cota valem para o deploy da função.
- 14h50 — Por ordem do autor, D (calendário na Meta) e os ajustes de material ficam parados. Pendência conhecida do Lynx: a CSP não lista o hash do script inline `__EXPO_ROUTER_HYDRATE__`, comportamento já existente em todas as rotas, decisão separada.
- 15h00 — C/banco: a migration `admin_ajustes_fila` FOI APLICADA em produção em 08/10 a pedido do autor e versionada em `supabase/migrations` por `c1d5a29` (Keel). Conferido: RLS ligada, 0 policies, anon e logado sem leitura, `service_role` sem delete, REST e RPC anônimos devolvem 401. Isto corrige o "proposta, não aplicada" registrado às 14h50.
- 15h00 — E4: o CAPTCHA NÃO foi ligado, porque trancaria o APK 1.10.6 já instalado (o app não manda token). Caminho proposto ao autor, sem decisão ainda: Turnstile, token no app e na web, build, e só então ligar. Até lá a defesa é o limite por IP e o TOTP.
- 15h00 — Conta admin web: a conta de ontem é a do painel LOCAL, não uma conta do Supabase. Recomendação ao autor: criar uma conta Grana nova só para admin e colocar o id dela em `ADMIN_USER_IDS`.
- 18h19 — E, deploy: o secret `ADMIN_USER_IDS` foi criado (conta pessoal do autor; valor nunca impresso) e a `admin-consulta` foi publicada em três versões: v1 (`35a01d0`); v2 (`0462c24`, IP real: a sonda XFF provou que `XFF[0]` é o `cf-connecting-ip` e o último é o proxy, e um `CF-Connecting-IP` forjado é recusado; sonda apagada); v3 (`611c834`, contagem de contas, com a migration `20261008183000` aplicada, execute só para `service_role` e anon com 401). O autor entrou no `/admin` pelo celular com TOTP e viu dados. Isto supera o "função não publicada" e o "sonda XFF não publicada" de 14h50.
- 18h19 — Abertos: rolagem no celular (Anvil); Receita indisponível por desenho; revisão do Watchtower pós-deploy. CAPTCHA (E4) segue desligado, sem decisão do autor.
- 19h00 — B: a tela do preparo persistido foi publicada em `e25803f` (cinco caminhos) e aprovada pelo Anvil, com observações não bloqueantes abertas (dois recibos até recarregar, mensagem genérica na falha de rede da conferência, T3 de teto único de prazo com o Harbor). O Keel achou o T1 e o Anvil conferiu o fechamento. Sem `build:preparar`, bump de `app.json` ou EAS real; o 16/16 de navegador é relato do Forge.
- 19h00 — D: `1083ab9` é só o ENSAIO, aprovado pelo Keel (13 grupos D e 15 B), sem chamada à Meta, sem leitura de `.env`, sem build e sem publicação real; a seção de ensaio na tela do painel local entrou em `2312da2`. A Meta real continua desligada por falta de: promoção que preserve a prova de aceite apesar da troca de `id`/caminho, evidência em lista fechada, configuração, outbox/scheduler/custos/reconciliação e `diaD` (hoje `null`). o autor retomou D por volta das 18h40 (ver 19h10); o aviso do Orquestrador não substitui o aceite do autor por peça (regra 25).
- 19h00 — E: `b1a9a7f` ajusta a CSP para liberar por hash o script de hidratação do expo-router (item que o Lynx deixou como ressalva).
- 19h10 — D, decisão do autor (~18h40, fala registrada na ordem `ORDEM-aprovou-vai-ao-calendario.md`): "quando o material seja aprovado, ele já vá direto para o agendamento do calendário". Isto SUBSTITUI a pausa de D e o "aprovar não inventa data" de `calendario.cjs:6-7`. Cada peça nasce com data prevista vinda do cronograma que gerou o roteiro (data absoluta, ou relativa ao dia D), ligada ao item do cronograma por id estável, não pelo caminho. Aprovar = entrar no calendário automaticamente nessa data; o autor ainda pode mudar a data; peça aprovada sem data fica em "aprovados sem data" com aviso; mudou depois do aceite, sai do calendário. Calendário para a Meta automático só quando o real estiver ligado, com os portões: peça aprovada naquela versão, nada antes do dia D, data no passado vira aviso e data relativa sem dia D fica "aguardando dia D".
- 19h10 — D, responsáveis (70/30): Harbor implementa e testa o fluxo inteiro com módulos reais, sem aceite nem data fabricados; Keel julga antes do push; Compass define o formato do manifesto do cronograma antes do código, com Meridian; Beacon/Flare localizam o reel da padaria (data e aceite), sem produzir nem regerar nada (regras 21 e 24); Forge mostra data e origem na tela do calendário. A Meta real segue DESLIGADA pelos gates técnicos (promoção que preserve o aceite apesar de `id`/caminho, evidência fechada, configuração, outbox/scheduler/custos/reconciliação e dia D), e não por pausa do autor. O `1083ab9` segue só como ensaio.

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
- 19h20 — D, prova da lacuna: Beacon localizou o reel da padaria (relatório `relatorio-padaria-data.md`). `grana-reels-v8-pop.mp4` segue em `para-aprovacao` da semana 39. O aceite do autor é de 07/10/2026 10:31:32 (-03:00), com versão `bc01c04e…` que bate com os bytes atuais (Beacon reaplicou a fórmula de `catalogo.cjs:312`). No cronograma é `R-P` em D+4, mas `diaD=null` e `planejados` vazio, então não há data absoluta. Isto é a prova da lacuna do fluxo aprovou→calendário, NÃO um agendamento. A ordem de 19h autoriza a continuidade; a Meta real ainda depende dos gates técnicos. Nada foi produzido, gerado ou chamado.

- Após as entregas D2: Harbor publicou 6826356 com promoção que preserva a evidência fechada ao novo id/caminho; Keel APROVOU após repetir 16 grupos de promoção, 13 de ensaio, 15 de build e 18 de ajustes. Nenhuma peça real foi movida ou planejada. Antes da etapa real ainda falta rotina de recuperação de cópia sem prova após queda forçada e o vínculo ao item estável do cronograma.
- D, tela local de ensaio: Forge publicou 2312da2 (calendario.js, teste novo e somente a linha test:admin de package.json). Keel e Lumen aprovaram; Forge relata test:admin exit 0 e navegador 8/8 em 320/390/768/1440, leitura GET. Não chama Meta, não lê env, não aciona build e não implementa ainda a entrada automática após aprovação.
- D, manifesto: Compass salvou formato-cronograma.md versão 3; Meridian aprovou o contrato sem bloqueios, depois de confirmar B1/B2 e três notas não bloqueantes incorporadas. Harbor iniciou o fluxo: tools/admin-local/marketing/cronograma.cjs e __tests__/admin-cronograma.cjs aparecem no working tree. Ainda não chegou relatório integrado nem parecer Keel; Ledger não abriu/alterou esses arquivos. A tela 2312da2 cobre só o ensaio. Esperam-se relatório/julgamento do fluxo cronograma → aceite → promoção → calendário.
- A operação real na Meta permanece desligada por gates técnicos. Não confundir ensaio ou teste local com agendamento/publicação real. Os relatórios completos são relatorio-harbor-D2-promocao.md, parecer-keel-D2-promocao.md e relatorio-forge-D-tela.md; Ledger não repetiu testes.


- 19h01 — D, contrato: formato-cronograma.md v3 aprovado pelo Meridian sem bloqueios; B1/B2 e três notas não bloqueantes do parecer v2 incorporadas. Harbor iniciou cronograma.cjs e teste no working tree, mas ainda não houve relatório integrado/parecer Keel. A tela 2312da2 segue restrita ao ensaio; sem data, vínculo, agendamento ou Meta real demonstrados.
- 19h01 — Auditoria Ponytail: Watchtower reporta P01 ALTA confirmado por módulos reais com fixtures fictícias; Lynx confirmou P01-P06 (PROCEDE) e a seção de proteções. P01: DTOs do painel local expõem cadastro individual e pedido com valor/referência/e-mail mascarado ao navegador. Não é relato de acesso externo nem leitura de dados reais. Correção é server-side; durante auditoria, nenhuma edição de código. Faltam auditoria-impeccable-admin.md e conferência de Lumen.


- 19h01 — D, contrato atualizado: Meridian aprovou a revisão v2 sem bloqueios; Compass publicou formato-cronograma.md v3 com três notas não bloqueantes incorporadas. Harbor iniciou cronograma.cjs/teste, mas relatório integrado e parecer Keel ainda faltam. A tela 2312da2 continua restrita ao ensaio.
- 19h01 — Ponytail: P01 ALTA confirmado em auditoria-ponytail-admin.md por sonda de módulos reais com dados fictícios; Lynx confirmou por leitura. DTO do painel local envia cadastro individual e venda com referência/valor/e-mail mascarado ao navegador. Sem acesso a dados reais ou prova de exploração externa; nenhuma correção durante a auditoria. Faltam auditoria-impeccable-admin.md e a conferência de Lumen.


- 19h05 — Quill revisou o adendo D/P01 em arquivo separado; correções registradas no relatório Ledger. P01 é violação da regra no painel local, sem vazamento público demonstrado; /admin público mostra apenas agregados. D2 ainda exige recuperação de cópias sem prova por SHA, vínculo ao item estável após promoção e teste cronograma → aprovar → promover → calendário; aviso de alteração local ainda não publicada é recomendação não bloqueante.


- 19h07 — D3 Harbor: relatório de implementação/testes entregue em relatorio-harbor-D3-cronograma.md; sem commit/push ou julgamento Keel. Meridian v4 apontou novo bloqueio B3: aprovação ainda é localizada por id que deriva do caminho, e a promoção muda esse id. Resolver com aceite ligado a item estável + versão/SHA e teste após promoção; etapa real continua bloqueada.
- 19h07 — D, Forge: helper de exibição de cronograma e teste de módulo real registrados em relatorio-forge-aprovou-calendario.md; Chrome relata 16 estados/larguras sem overflow. Anvil deu APROVADO parcial, com seis ajustes antes do diff integrado; não é entrega final. Tela 2312da2 continua sendo apenas ensaio.
- 19h07 — Impeccable: auditoria Prism entregue, nota geral 16/20; achados incluem alvos locais abaixo de 44 px, mono/fallback tipográfico e travessão placeholder. Sem edição de produto; falta segunda leitura Lumen. Não confirmado defeito de contraste, leitor de tela ou desempenho.


- 19h09 — D3: Meridian v5 resolveu B3 no diff (aceite preservado sob SHA1 igual e original mantido), mas Keel julgou **NÃO PROCEDE para push** por B1: sincronização falha depois da promoção concluída e emite 503 afirmando falsamente que a origem foi preservada; A1/A2 também pedem guardas e leitura degradada para manifesto inválido. Keel exige delta único v5+B1+A1+A2, hashes novos e testes; nenhum commit/push D3.
- 19h09 — D, UI: julgamento-anvil-calendario-helper.md é parcial BOM; seis ajustes do helper no diff integrado, mais teste de resposta tardia/erro/zero POST e nova revisão final continuam pendentes.
- 19h09 — Impeccable: Lumen acrescentou conferência ao relatório; quatro achados procedem. ORDEM-correcao-impeccable.md manda Lumen executar, Prism julgar antes do push. Agora falta o parecer Prism das correções, não a conferência Lumen.

- 23h44 — D3b: Keel aprovou para commit/push em `parecer-keel-D3b-cronograma.md`; Harbor relatou `fcd2792` publicado. Ledger fez `git fetch origin` e confirmou `HEAD = origin/main = fcd2792` (pai `68c8804`), oito caminhos do D3b. Keel relata 17 grupos cronograma, 16 promoção, 13 ensaio, 19 ajustes, 15 ações de build e duas telas com saída 0; Ledger não repetiu os testes. Ressalva não bloqueante: `ajustes[]` legados sem `estado`; 8 entradas verificadas, nenhuma na mesma versão de aceite.
- 23h44 — D/Meta: Harbor relata R-P aprovado em 07/10; `diaD=null` fica aguardando. D 09/10 → 15/10 (D+4 úteis) é apenas fixture; sem cronograma real, hora/canal declarados, Meta/Graph, build EAS ou deploy de função. Meta permanece atrás de dia D, configuração/permissões/quota, mídia remota, outbox/reconciliação, scheduler/custos e ativação explícita. `admin-build-acoes` é teste local, não build EAS.
- 23h44 — Ponytail/P01: Watchtower e Lynx confirmam que DTOs do painel LOCAL levam cadastro e venda individuais ao navegador; ALTA pela regra literal, risco real baixo por loopback/login/TOTP. Sem dado real consultado nem vazamento público demonstrado; `/admin` público segue agregado. Orquestrador reportou Harbor coordenando a correção server-side com Forge. O status lista mudanças em adaptadores, telas e testes relacionados; Ledger não revisou/alterou. Harbor relata 3 grupos backend e test:admin 0; Forge relata UI vermelho/verde, tsc 0 e test:admin 0. Watchtower e Lynx ainda não fecharam o snapshot integrado.

- 23h45 — Vault: espelhamento executado; scripts/verificar-vault.mjs saiu 0 e apontou 27 itens de atenção (17 perenes sem revisado, uma fonte ausente). Sem limpeza fora do escopo.

- 23h51 — P01: Harbor relata snapshot server-side em `relatorio-harbor-P01-agregados.md`, 3 grupos verdes e `npm test:admin` 0; Forge relata UI vermelho/verde, `tsc` 0 e `test:admin` 0. Watchtower aguarda snapshot integrado estável/hashes/testes e Lynx; não declarar P01 fechado. O processo local ainda não foi reiniciado.
- 23h51 — D/UI: Forge relata que o DTO ainda não expõe o recibo exato de entrada automática no calendário; tela final aguarda integração e revisão. Sem build real. D3b `fcd2792` é push ao GitHub, não deploy; `diaD=null`, Meta real desligada e sem chamadas.

- 09/10 — F, segurança: o autor confirmou em 08/10 que os cinco segredos expostos no EAS foram trocados. GITHUB_TOKEN com escrita e SUPABASE_SERVICE_ROLE_KEY mantida no .env são decisões do autor; o repositório de código continua público e o APK terá repositório separado. HTTP 200 para credenciais novas é relato da passagem, não verificado por Ledger. Nenhum valor foi registrado.
- 09/10 — F, continuidade: Harbor relata D3b fcd2792 publicado e aprovado por Keel, com uma ressalva legada não bloqueante; Watchtower APROVOU P01 integrado em sete hashes, aguardando segundo olhar Sentinel. Harbor relata rascunho APK externo completo/testado (plano-alternativa-grana-apk.md, patch e hashes; 27 verificações herdadas + 6 dispatch/gates, deno 0 e apply-check 0), sem aplicação/GitHub/build/deploy/Meta. Ponte C AUDIT está autorizada em DECISOES-autor-ponte-e-repo.md, ainda não executada e depois de P01. Estado de segurança e evidência discriminados em context.md e na nota da sessão de 09/10.

- 09/10 — Snapshot local durante a documentação: HEAD 11be4cc; origin/main..HEAD contém 5861262 (UI P01) e 11be4cc (backend P01), com a referência local origin/main em 079f3f7. Não fiz fetch/push; aguarda o segundo olhar de Sentinel. Modificações e arquivos não rastreados de Harbor/Forge ficaram intactos.

- 09/10 — F, leitura factual Sentinel: o segundo olhar de P01 foi executado nos sete hashes; os testes focais backend/UI-simulador saíram 0 e não mostraram campos individuais. P01 ainda não está fechado: o teste backend não está ligado a test:admin/test:ci; Sentinel não confirmou CI remoto para 5861262, e o relato é anterior ao HEAD local 11be4cc. A1/A2 do rascunho APK: token write pode alcançar o job inteiro; release/latest é alterada antes do upload e não volta ao estado anterior se o upload falhar. Aguardam tratamento antes de ativação. Ponte: testes isolados 19+6 saíram 0, mas a rota ainda retornava remoto:false no snapshot Sentinel; sem pedido AUDIT remoto. D3b fcd2792 continua publicado/aprovado por Keel com ressalva legada não bloqueante; Meta/build/deploy real continuam sem execução.

- 09/10 — F, atualização do gate P01: commit local 891cc34 colocou os testes backend/UI em test:admin, invocado por test:ci; Forge relata test:admin 0. A execução completa local test:ci ainda não tinha recibo/arquivo .exit no último snapshot; sem CI remoto para 5861262/11be4cc/891cc34. Não fechar/publicar a partir do teste focal.
- 09/10 — C01 separado de P01: Watchtower confirmou que GET e POST da fila serializam lease.id e textoOriginal no JSON, embora a UI os oculte. A UI C passou sua suíte, mas C integrada fica NÃO LIBERADA até DTO fechado em GET/POST e teste no corpo HTTP. Achado pré-existente, ALTA pela regra do autor; risco efetivo mitigado por loopback/login, sem exploração externa ou fila real demonstrada.
- 09/10 — APK/Ponte: A1 (contents:write alcança o job inteiro) e A2 (release/latest muda antes do upload sem rollback em falha) seguem pendentes antes de ativar o rascunho. Ponte C AUDIT segue autorizada após P01 e não executada; Sentinel só testou harness isolado, sem serviço real, e reportou remotoStatus fixo em false no snapshot. Compass relata Fase 1 bloqueada até gates F0 e sem recibo verde completo de CI P01.
- 00h22, 09/10 — F, atualização Harbor/Sentinel: Harbor informa D3b publicado em fcd2792, Keel aprovado com ressalva legada não bloqueante; P01 integrado aprovado por Watchtower nos sete hashes; rascunho APK externo completo e Ponte C AUDIT autorizada, ainda não executada, depois de P01. Ledger leu o segundo olhar Sentinel: duas sondas focais P01 saíram 0 sem campos individuais; 891cc34 integrou os testes backend/UI ao test:admin, e Forge reporta test:admin 0. O test:ci completo permanece sem recibo final no último snapshot e não há CI remoto confirmado para os commits locais. APK continua só rascunho: Harbor relata 27 verificações herdadas + 6 de dispatch/gates, deno check 0 e apply-check 0; Sentinel aponta A1 (permissão contents:write no job inteiro) e A2 (release/latest pode mudar antes de falha de upload, sem rollback provado). Não aplicar/ativar até resolver ou documentar aceite. Ponte teve apenas harness isolado 19+6; sem serviço real, remotoStatus estava fixo em false no snapshot. Watchtower confirmou C01 separado de P01: lease.id e textoOriginal atravessam GET/POST; C integrada segue não liberada até DTO fechado e teste do JSON HTTP. Sem código, serviço real, build EAS, deploy, GitHub ou Meta por Ledger.

- 00h23, 09/10 — F, recibo final: Forge atualizou forge-P01-CI-final.log e criou forge-P01-CI-final.exit com valor 0; a execução local completa test:ci terminou verde (sessão 63846 informada por Forge). Isso substitui o snapshot anterior que ainda não tinha .exit. Ledger não executou a suíte. Não há confirmação de CI remoto para os commits locais 5861262, 11be4cc e 891cc34; nenhum fetch/push foi feito por Ledger. P01 mantém aprovação Watchtower nos sete hashes e segundo olhar focal Sentinel; C01 segue bloqueando C integrada.

- 00h24, 09/10 — snapshot compartilhado: o reflog local registra origin/main atualizado por push para 891cc34 às 00h24; HEAD e a referência local origin/main agora coincidem. Ledger não fez fetch nem push; o reflog consultado não identifica o agente que executou o push. O recibo local test:ci exit 0 continua sendo o log/exit de Forge; o status remoto de Actions não foi consultado. Permanecem alterações e novos arquivos WIP de Harbor/Forge no working tree; foram preservados sem leitura/edição adicional.

- 00h27, 09/10 — alerta de workflow, fonte Sentinel via Maestri: relata que o push 079f3f7..891cc34 iniciou Android nativo run 37879111809 (expo prebuild + assembleDebug), API pública in_progress; run de CI 37879111734 também em andamento. Sentinel pediu cancelamento, mas informou gh sem autenticação e ausência de navegador conectado. Ledger tentou leitura anônima pelo caminho do origin e recebeu 404, sem confirmação independente nem contraprova. Ledger não usou credencial, não cancelou nem iniciou build/workflow. Aviso encaminhado ao Orquestrador. Não há evidência aqui de conclusão/publicação de artefato; distinguir estes workflows GitHub Actions de EAS.

- 00h30, 09/10 — F, snapshot Forge UI A/D/P01: relatorio-forge-UI-A-D-P01.md e estado-forge.md (00h25) dizem que UI P01 5861262 foi julgada por Watchtower em sete hashes e ainda aguardava Sentinel/push; esse trecho é histórico frente ao reflog local, que registra update by push de origin/main para 891cc34 às 00h24, e ao segundo olhar Sentinel já recebido. Forge reporta UI C com testes de módulos reais 0 e navegador 64 estados 0, congelada para Watchtower; C01 HTTP segue bloqueador independente (lease.id/textoOriginal no GET/POST), Harbor dono server-side. Switch 44px, quebra de Tráfego e favicon UI ainda aguardam QA/mapping. Forge informa run 21287 em andamento, mas os arquivos nomeados têm carimbos antigos; há também recibo test:ci local forge-P01-CI-final.exit=0 às 00h23. Não inferir status de 21287 sem novo recibo. Sentinel relata workflows remotos 37879111734 e 37879111809 em andamento; Ledger não confirmou por GET anônimo (404), não cancelou e não usou credenciais. Sem edição de UI, admin real, build, deploy ou Meta por Ledger.


- 00h32, 09/10 — F, conciliação Forge/Sentinel: Forge relata `5861262` P01 UI aprovado por Watchtower em sete hashes, C UI com teste de módulos reais 0 e 64 estados de navegador 0, congelada para revisão; C01 continua bloqueador HTTP (`lease.id`/`textoOriginal` em GET/POST), com DTO sob ownership de Harbor. Switch 44px, quebra de Tráfego aguardam QA; favicon depende do mapping Harbor. O snapshot Forge ainda aguardava Sentinel, mas Sentinel depois atribuiu a si o push `079f3f7..891cc34`; HEAD e tracking ref locais observados em `891cc34`. Sentinel reporta CI remoto `37879111734` success nesse SHA. O CI antigo `37875804517/fcd2792` é histórico. O run Android nativo `37879111809` segue relatado `in_progress`; cancelamento retornou 404, sem encerramento confirmado. A sessão Forge `21287` consta como em andamento no relatório, sem recibo que a ligue ao exit 0 local separado. W02 ALTA foi confirmada por Watchtower usando seed fictícia; Forge/Prism relatam intenção de retirar cadastro/QR/seed do browser e preservar OTP de fator pré-cadastrado, ainda pendente de diff/teste/revisão. `/admin` não publicado. Ver seis respostas em context.md e nota de sessão 09/10. Ledger não editou UI/código, não fez fetch, teste, build, deploy, Meta nem usou credenciais.

## Andamento — 09/10/2026, fechamento da Fase 0 (Ledger)

- **Fechamento:** `baca954` (`feat(admin): fecha fase zero do fluxo de ajustes`), local em `main`, ainda sem push; `origin/main` permanece em `22a1409`. O commit alterou `package.json`, `tools/admin-local/rotas.cjs` e `tools/admin-local/web/telas/aprovacao.js`. A linha de `test:admin` passou a incluir 13 testes: `admin-ajustes`, `admin-ajustes-catalogo-dto`, `admin-ajustes-funcao`, `admin-ajustes-migration`, `admin-ajustes-tela`, `admin-ajustes-tela-integracao`, `admin-ajustes-vigia`, `admin-calendario-cronograma-integracao`, `admin-calendario-cronograma-tela`, `admin-confirmar-sem-digitar`, `admin-cronograma`, `admin-meta-ensaio` e `admin-meta-promocao`.
- **Verificação consolidada (relatada, sem repetição por Ledger):** os 13 testes individuais, `test:admin`, `npm run test:ci`, `npx tsc --noEmit` e `git diff --check` terminaram com exit 0. Watchtower não apontou bloqueador; anotou mapa de labels duplicado e o spread de `remoteStatus` como manutenção.
- **Coordenação/histórico:** o plano `E:/Grana-temporarios/2026-10-09-painel/plano-fluxo-marketing-painel.md` é tratado como aprovado pelo Orquestrador; Fase 1 vem após Fase 0. O autor decidiu incluir ícones e Granabô no painel, e Compass já fechou o item 6. A Fase 1 ainda não começou; depois do push da Fase 0, Compass abre a fase e confirma ownership. QA visual dos itens 4 e 6 permanece PENDENTE: o item 4 foi publicado em `22a1409` com `test:ci` verde, mas o servidor carregava CJS antigo e o autor não dispensou a revisão. Em `8ff7530`, Beacon publicou antes de `test:ci`; a suíte passou depois no tree combinado. O histórico foi preservado sem reescrita.
- **Escopo:** E05 foi consultado somente em leitura; não havia estimativa na fila e nem texto nem peça foram abertos. Nesta execução documental/Fase 0 não houve login em produção, build, geração paga ou edição de assets.
- **Export e ocorrência anterior, ainda sob triagem:** no export das 08h43, scanner de valores saiu 1/`REVISAR_NAO_PUBLICAR` por `E2E_TEST_EMAIL` no JS. Scanner de padrões achou `cadastro-admin-totp` no CSS (2), `email-literal` (8) e `uuid-literal` (7) no JS, e `email-formato` (1) em `telas/inicio-web.png`. Sentinel/Watchtower determinarão a causa; exposição não está confirmada. A ocorrência relatada de Lynx em produção (login por senha sem confirmação prévia de autorização/separação, três consultas, POST vazio de cadastro de fator com 400 e sem cadastro segundo a resposta, logout e interrupção após reconhecer que excedeu o escopo) não é QA de MFA. O autor declarou depois que a conta já incluída na allowlist lhe pertence, foi configurada por ele e tem TOTP verificado; não houve validação independente por agente.
- **Documentação:** relatório de Ledger em `E:\Grana-temporarios\2026-10-09-painel\relatorio-ledger-sessao.md`; sessão M1 no vault `00 - Sessões/2026-10-09 - M1 - painel marketing e Fase 0`. As notas de sessão Maestri nomeadas na ordem de retomada não estavam conectadas ao canvas listado nesta sessão.

## Andamento — 09/10/2026, implementação do item 6 (Ledger)

- **Pedido aprovado:** incluir no painel local 145 ícones originais, a prancha do Granabô e link para o `.blend`, sem duplicar assets. Cadeia de ownership/ordem: Forge → Harbor → Prism.
- **Implementação:** commit local `93ce3469bfea1c6c7e6321dd502a079ff7ddc6c0` (`feat(admin): inclui originais de marca no painel`), em `main`; na primeira conferência estava um commit à frente de `origin/main=b5dd34e7d6ac7d1a8d0ece53fe4368259ca5bbf7`. O push posterior foi concluído, conforme apêndice factual abaixo. Arquivos: `__tests__/admin-arsenal-allowlist.cjs` (novo), `package.json`, `tools/admin-local/adaptadores/design-system.cjs`, `tools/admin-local/seguranca.cjs`, `tools/admin-local/web/estilo.css` e `tools/admin-local/web/telas/design-system.js`. Assets referenciados sem cópia: `docs/marketing/arsenal/icones/`, `docs/mascote/granabo-prancha-w3.png` e `docs/mascote/blender/granabo.blend`; originais não alterados.
- **Verificações recebidas:** regressão de 21 grupos; `test:admin`, `npm run test:ci`, `npx tsc --noEmit` e `git diff --check` com exit 0. CI e tsc finais correram em sequência (`semOverlap: true`), ambos exit 0. Recibos em `E:/Grana-temporarios/2026-10-09-painel/harbor-arsenal-integracao/`; Ledger não executou testes.
- **Watchtower:** sem bloqueador. Riscos/limites restantes: TOCTOU entre validação e abertura do caminho e custo de revalidar a pasta.
- **QA visual pendente:** itens 6 e 4 continuam PENDENTES porque a sessão local serviu código CJS antigo e ainda precisa ser reaberta/relogada por alguém autorizado para a revisão visual. A disponibilidade de desktop remoto M1 permanece NÃO CONFIRMADA; o Orquestrador não confirmou se o autor tem esse acesso. Handoff registra portal restaurado em `#/visao-geral`; Ledger não fez inspeção visual. O QA do item 4 não foi dispensado.
- **Limites da rodada:** sem ação em produção, edição dos assets originais ou uso de viewer. Ledger alterou somente documentação/vault; o commit de implementação já existia localmente e ainda não havia sido publicado naquela atualização documental. O push posterior consta no apêndice factual abaixo.

## Apêndice factual — push posterior do item 6

Push concluído após o registro anterior: `b5dd34e..f59e4a5`, incluindo `93ce346` e `f59e4a5`. Na conferência local, `HEAD=origin/main=f59e4a576f7902f5fa037e68e4246f72da5964bc`; `origin/main..HEAD` está vazio. A árvore estava limpa no início desta atualização, antes das novas edições documentais.

QA visual do item 6 e QA visual do item 4 permanecem PENDENTES; o QA do item 4 não foi dispensado.

Ledger apenas registrou o estado informado/conferido localmente. Os dois QA visuais seguem como checklist pendente.

## Correção factual — disponibilidade de desktop remoto M1

O registro anterior dizia que a sessão M2 só enviava mensagens e não tinha desktop M1 ou relogin. Isso extrapolou uma hipótese; o Orquestrador Supremo esclareceu que NÃO confirmou o acesso remoto do autor à área de trabalho M1. Corrigido: essa disponibilidade permanece NÃO CONFIRMADA. QA visual dos itens 6 e 4 segue pendente porque a sessão local serviu código antigo e precisa ser reaberta/relogada por alguém autorizado; nenhuma revisão visual foi concluída aqui. No início desta correção, `HEAD=origin/main=cf0fb3a708c596f16db34e0ea3cfd7bbc6ab9e88` e a árvore estava limpa; as alterações desta correção são documentais.

## Fechamento da Fase 1 — 09/10/2026 (Ledger)

Esta atualização supera o estado anterior de que a Fase 1 ainda não havia começado. O plano de fluxo de marketing está aprovado pelo Orquestrador; Fase 1 foi concluída e publicada. Fases 2–4 permanecem não iniciadas.

- **Commit/push:** `173938f1ac1e0b12a02abed4b5d60ff69190c2d5` (`feat(admin): conclui fase 1 do fluxo de ajustes`), publicado em `main` no intervalo `3e816bf..173938f`. No início, `HEAD=origin/main=173938f` e a árvore de código estava limpa.
- **14 caminhos:** `__tests__/admin-ajustes-custo.cjs` (novo), `__tests__/admin-ajustes-migration.cjs`, `__tests__/admin-ajustes-tela-integracao.cjs`, `__tests__/admin-ajustes-tela.cjs`, `__tests__/admin-ajustes.cjs`, `package.json`, `supabase/migrations/20261009100000_admin_ajustes_estados_terminal.sql`, `tools/admin-local/marketing/ajustes-cli.cjs`, `ajustes-dto.cjs`, `ajustes-fila.cjs`, `ajustes-remoto.cjs`, `tools/admin-local/rotas.cjs`, `tools/admin-local/web/telas/ajustes.js`, `aprovacao.js`.
- **Sentinel:** `npm run test:ci` e `npx tsc --noEmit` sequenciais, ambos reportados exit 0. Recibos `E:/Grana-temporarios/2026-10-09-painel/sentinel-fase1-final-3e816bf-20261009-191944-test-ci.{log,exit}` e `...-tsc.{log,exit}`. Manifestos `hashes-before.json`, `hashes-after-test-ci.json`, `hashes-after-tsc.json`: snapshot-base `HEAD=3e816bf`, hashes estáveis e 14 caminhos iguais aos bytes no commit `173938f`. Ledger leu recibos/hashes, não rodou testes.
- **Watchtower:** APROVADO por leitura do snapshot final, sem bloqueador, conforme handoff. SHA-256: `tools/admin-local/web/telas/ajustes.js` `fe04673efc94541a40f13c1d70047215445780dd3268fca53861c9e9870f1905`; `__tests__/admin-ajustes-tela.cjs` `ed52f2ad06d6326c0ed8ee8c94496fc261df12269e4f3a10839f3ad49e2eaf5f`; `ajustes-fila.cjs` `44fc0a21b44f6136f627f5cade3e90aa77b847fdd054604020ad8f8efc72f3f8`; `ajustes-remoto.cjs` `540f5c8373b4826bd76342f51f059415a0875001fa4ca0911250dc0c628cedab`; `rotas.cjs` `bdf43ec9c8e6fe135dd2b84671ac0377d2cdf76c12f906d58ac05c00e7116a95`; migration `20261009100000_admin_ajustes_estados_terminal.sql` `8420be2b9ebf772c3445cb69ff5e3c5f8f584d96a23efe5d67426765a5d22ebb`. DTO, CLI e testes também constam no manifesto.
- **Migration/produção:** a migration existe apenas no repositório; sem apply, deploy ou operação em produção. Estado remoto não sondado nesta atualização.
- **QA/E05:** QA visual dos itens 4 e 6 segue PENDENTE; a sessão local serviu módulo antigo e precisa ser reaberta/relogada por alguém autorizado. Desktop remoto M1 permanece NÃO CONFIRMADO. E05 continua pausada: lease anterior expirado, sem leitura, renovação ou alteração manual; retomar pelo vigia normal com lease novo.
- **Escopo:** Fase 0 e item 6 anteriores estão publicados; Fases 2–4 não começaram. Ledger não executou testes, não alterou código, não aplicou migration nem acessou produção.

## Correção factual pós-revisão — Fase 1 e preparação da Fase 2

A revisão documental de Codex via Maestri identificou o defeito que motivou o hold anterior do Watchtower: em `tools/admin-local/web/telas/ajustes.js`, o aviso não mostrava `remoto.ultimoErro` quando havia sincronização recente e a fila estava vazia ou toda sincronizada. Forge corrigiu a apresentação no commit `173938f`; `__tests__/admin-ajustes-tela.cjs` cobre fila vazia, permanência no polling, fila sincronizada e limpeza do erro. O snapshot corrigido foi aprovado por Watchtower sem bloqueador. Não foi relatado incidente em produção.

Sobre E05, o transcript Beacon consultado por Codex via Maestri registra uma tentativa de `ajustes-cli ler` às 18h23 com lease expirado/inválido; resultado `resultado_lease=expirado_ou_invalido`, exit 1. Não houve leitura bem-sucedida, renovação do lease, alteração da fila nem criação da estimativa. Beacon recebeu orientação para pausar às 18h27; retomar apenas pelo vigia normal com lease novo.

Compass recebeu a tarefa de abrir Fase 2 e preparar/confirmar ownership; a resposta via Maestri trouxe a matriz de responsabilidades. Isso é preparação, não implementação: Fase 2 ainda não começou como trabalho de implementação; Fases 3–4 seguem não iniciadas.

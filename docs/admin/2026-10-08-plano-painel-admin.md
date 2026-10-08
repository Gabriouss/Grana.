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

# ALERTA CRÍTICO DE SEGURANÇA — LER ANTES DE QUALQUER OUTRA COISA

> **Registrado pela M2 em 16/09/2026, a pedido do autor, como informação
> séria, crítica e de extrema importância. É a PRIMEIRA coisa que a próxima
> sessão da M1 precisa saber — antes do inventário, antes de ler o resto,
> antes de qualquer pedido. Não apague este bloco enquanto os itens abaixo não
> estiverem resolvidos E confirmados pelo autor.**

**1. Os segredos do `.env` da M1 foram enviados ao servidor do EAS.** A build
1.10.2 (12/09/2026, disparada pela M1, build `149bb92e`) levou, dentro do
pacote do projeto, o `.env` da M1 com `CAKTO_CLIENT_ID`,
`CAKTO_CLIENT_SECRET`, `GITHUB_TOKEN`, `SUPABASE_ACCESS_TOKEN` e
`VERCEL_TOKEN`. Comprovado pelo log da build (`env: export …`, que mostra só
os nomes). Causa: o `.easignore`, criado em 01/09 (`00de222`), substitui o
`.gitignore` no envio e não excluía o `.env`; corrigido em `4ce2242`. Os
segredos NÃO entraram no APK — o APK da 1.10.2 foi aberto e conferido — e não
ficaram públicos, mas estão num servidor de terceiro, fora do controle do
projeto.

**Contexto, não pendência:** o repositório `Gabriouss/Grana.` é PÚBLICO, e a
senha da conta de teste ficou num plano versionado (`14ef2d2`, removida em
`eb3b3ad`, ainda no histórico). **O autor decidiu em 16/09/2026 que essa
senha não é importante** — é a conta descartável dos agentes —, então ela não
precisa ser trocada nem cobrada. O cuidado que continua valendo é o da regra
15: nenhuma credencial em arquivo versionado.

**O que a M1 faz, nesta ordem, antes de qualquer outro trabalho:**

1. **`git fetch origin` e `git pull`.** Sem o `4ce2242`, a próxima build da
   M1 manda o `.env` de novo, com os mesmos segredos. Depois do pull, confira
   que o `.easignore` tem as linhas `.env` e `.env.*`.
2. **NÃO dispare nenhuma build (`eas build`) antes do passo 1**, nem com
   pedido do autor: explique o motivo e faça o pull primeiro. Desde
   `abf329a`, o `npm run build:preparar` recusa preparar a build (sai com
   "BLOQUEADO") se algum `.env*` fosse no pacote — mas essa trava só existe
   DEPOIS do pull, e `eas build` chamado direto passa por cima dela. Nunca
   pule o `build:preparar` (regra 5).
3. **Pergunte ao autor se os segredos já foram trocados**:
   `CAKTO_CLIENT_SECRET` (e o par `CAKTO_CLIENT_ID`), `GITHUB_TOKEN`,
   `SUPABASE_ACCESS_TOKEN` e `VERCEL_TOKEN`. Se não foram, diga que a troca é
   pendência crítica. Depois da troca, atualize o `.env` da M1 — e nunca
   escreva os valores em arquivo versionado, no vault ou em registro.
4. Leia a regra 15, no fim deste arquivo, e a seção "O `.env` foi nas builds do EAS" no fim do `context.md`.

**Estado em 16/09/2026:** passo 1 feito pela M1 (`git pull`, `.easignore` com
`.env`/`.env.*` confirmado) · **troca dos cinco segredos ADIADA por decisão do
autor** ("vamos trocar os segredos depois") — não é esquecimento, foi
perguntado e respondido. Continua pendência, sem prazo.

Isso NÃO bloqueia build nem trabalho novo: a trava (`abf329a`) já impede
qualquer `.env*` de ir para o pacote, então o risco de REPETIR o vazamento
está fechado independente da troca. O que fica em aberto é só o segredo já
exposto no servidor do EAS continuar válido até alguém trocá-lo.

Quando a troca acontecer e for confirmada pelo autor, troque este bloco por
uma linha dizendo quem resolveu, o quê e quando. O registro detalhado continua
no `context.md`.

---

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Este projeto é trabalhado em mais de uma máquina

O autor alterna entre pelo menos duas máquinas neste mesmo repositório. Isso já
causou uma reescrita acidental do histórico do git numa sessão anterior — uma
sessão do Claude Code rodou `git init` num diretório que já tinha commits
publicados no GitHub, criando um "Initial commit" novo e desconectado do
histórico real. Os arquivos sobreviveram porque continham uma cópia do
trabalho mais recente, mas o histórico de commits anterior virou um ramo
lateral, unido de volta só num merge manual depois.

Regras permanentes para qualquer sessão que abrir este repositório:

1. **Antes de qualquer commit, rode `git fetch origin` e compare com
   `origin/main`.** Se o local estiver atrás, avise o autor e pergunte se deve
   puxar (`git pull`) antes de continuar — não presuma que o estado local é o
   mais atual só porque é o que está na tela.
2. **Nunca rode `git init` neste diretório.** Se o `.git` estiver ausente,
   corrompido, ou o histórico local parecer desconectado do remoto, o reparo é
   clonar de novo a partir de `https://github.com/Gabriouss/Grana.` — nunca
   reinicializar. Reinicializar destrói a rastreabilidade de que commit fez o
   quê, mesmo que os arquivos sobrevivam.
3. **Antes de encerrar uma sessão que mexeu em código, commite e publique
   (`git push`) tudo, mesmo trabalho incompleto**, para que a próxima sessão
   — nesta máquina ou na outra — comece de um estado limpo e sincronizado, em
   vez de arriscar dois trabalhos divergentes na mesma base.
4. **Builds do EAS (`eas build`) consomem uma cota mensal compartilhada entre
   as duas máquinas.** Nunca dispare um build sem o autor pedir explicitamente
   nesta sessão — mesmo que uma sessão anterior, nesta ou noutra máquina,
   tenha pedido builds recentemente. Cada sessão pede de novo.

5. **Todo build de release começa por `npm run build:preparar --
   "<mensagem>"` (ou `-- --minor "<mensagem>"` / `-- --major "<mensagem>"`
   pra subir mais que o patch) — NUNCA suba `expo.version` nem escreva a
   mensagem do build à mão.** Esse comando (`scripts/preparar-lancamento.ts`)
   funde dois passos que já tiveram guarda-corpo separado e mesmo assim
   falharam por depender de alguém lembrar de rodar os dois, na ordem
   certa, toda vez:

   - **Sobe `expo.version` sozinho** (patch por padrão). Sem isso o aviso
     de atualização (`lib/atualizacao.ts`) não funciona: ele compara a
     versão anunciada em `app_release` com a versão embutida na build
     instalada, e a Edge Function `eas-build-webhook` **recusa** publicar
     uma versão que não seja maior que a já anunciada (responde
     `older version ignored`) — build sai, instala, funciona, e ninguém é
     avisado, silêncio indistinguível de "não saiu build". Foi exatamente
     o que aconteceu entre 1.1.1 e 1.2.0: várias builds seguidas com a
     mesma versão, todas ignoradas.
   - **Valida a mensagem ANTES de escrever qualquer coisa em disco** (mesma
     checagem de `lib/notas-release.ts`/`__tests__/sync-parser.js` que a
     Edge Function roda do lado dela). O texto do `--message` vai
     literalmente para o pop-up "O que mudou no Grana.", na cara de todo
     mundo que atualiza — a 1.4.1 foi ao ar com "apos" sem acento porque os
     commits deste repositório são escritos sem acento por convenção, e
     `eas build` sem `--message` preenche a mensagem do build com a do
     commit. Nota reprovada não bumpa versão nenhuma — não vale gastar um
     número de versão numa nota que vai sair errada mesmo.

   O comando termina imprimindo o `eas build --profile preview --platform
   android --message "..."` já pronto pra copiar — ele mesmo NUNCA dispara
   o build (regra 4 continua valendo, pedido explícito sempre).

6. **Ao iniciar o trabalho numa sessão, leia o `context.md` primeiro.** Ele é
   a visão técnica/operacional do projeto e o estado de onde a última sessão
   parou. Ao encerrar uma sessão que mexeu em código, atualize o `context.md`
   com o que mudou e o estado atual, e suba isso no GitHub junto com o resto
   do commit — é assim que a outra máquina fica sabendo o que aconteceu aqui.

7. **Antes de agir sobre qualquer pedido do autor, procure na biblioteca de
   skills instaladas (`.claude/skills/`, `.agents/skills/`, e as globais)
   por alguma que ajude a executar o que foi pedido.** Pedido de auditoria de
   design/UI → skills tipo `impeccable`/`apple-design`/`emil-design-eng`;
   pedido de motion/animação → `find-animation-opportunities`/
   `improve-animations`/`review-animations`/`animation-vocabulary`; pedido de
   copy/posicionamento → `copywriting`/`competitor-analysis`/etc. Isso vale
   pra qualquer tipo de solicitação, não só landing page — é hábito
   permanente da sessão, não uma escolha pontual. Só pular a busca quando o
   pedido for claramente fora do domínio de qualquer skill instalada (ex.:
   uma pergunta de fato sobre configuração do Supabase, uma correção de bug
   pontual sem ambiguidade de abordagem).

8. **`eas.json`: `preview` e `production` têm que continuar gerando o mesmo
   tipo de artefato (`distribution: internal`, `android.buildType: apk`).**
   O pop-up de atualização (`lib/atualizacao.ts`) só funciona se o link do
   build for um `.apk` instalável direto — um `.aab` (o padrão do Expo pra
   builds sem esses dois campos) chega ao aviso mas não instala. Os dois
   perfis foram alinhados em 05/09/2026 por causa disso; se `production`
   voltar a divergir de `preview`, o próximo build feito com o perfil
   errado quebra o aviso silenciosamente.

9. **Antes de dar qualquer mudança por pronta, siga a disciplina de
   verificação abaixo.** Ela foi escrita em 07/09/2026, a pedido do autor,
   depois que uma revisão das correções do Codex mostrou duas regressões
   introduzidas por outro agente na mesma semana — pegas antes da build
   1.8.1, mas que teriam ido ao aparelho. O autor pediu que isto seja
   consultado sempre, não só quando parecer relevante.

   - **Existem SEIS scripts de teste, não um.** `test:parser` é o corpus
     grande e **não** cobre `lib/voz.ts`, o assistente nem os widgets. Os
     outros são `test:voz`, `test:assistente-aprendizado`,
     `test:assistente-fatura`, `test:blur` e `test:motion`, além de testes
     em `__tests__/` sem script próprio (`voice-fallback.cjs`,
     `voz-offline.cjs`, `widget-voz-cartoes.cjs`). Liste os scripts antes de
     afirmar que algo não tem teste — um `grep` por um nome só já levou a
     concluir, errado, que `test:parser` era a única suíte do projeto.
   - **Módulo de React Native, Expo ou Deno NÃO é desculpa pra não testar.**
     Sem Jest, este repositório testa esses módulos compilando o TypeScript
     em memória (`ts.transpileModule`) e executando em `vm.runInNewContext`
     com um `require` que devolve dublês para cada import. O sandbox também
     controla o tempo: um `Date.now` falso e um `setTimeout` encurtado fazem
     uma corrida de 8 segundos rodar em milissegundos sem mexer na constante
     de produção. Receita pronta em `__tests__/voz-upload.cjs` e
     `__tests__/voice-fallback.cjs`. Testar uma reimplementação da lógica não
     vale: só o módulo real pega o bug do módulo real. E quando o
     comportamento custa dinheiro, tempo ou escrita em banco, asserte em
     QUAIS chamadas aconteceram, não só no valor devolvido.
   - **Retry e fallback precisam caber no prazo de quem chama.** Some o novo
     pior caso antes de acrescentar uma tentativa: duplicar um timeout de 75s
     estourava os 120s em que o Android mata a tarefa headless do widget, o
     que é pior que o bug original. Use um prazo total compartilhado, com
     folga pro que vem depois (interpretar, gravar, notificar). E confira,
     linha a linha, se a proteção cobre a etapa que realmente falha — abortar
     o `fetch` mas ler o corpo fora da região protegida deixa sem proteção
     justamente o corpo pendurado que se queria consertar.
   - **Todo caminho de falha deixa recibo visível.** Voltar ao repouso em
     silêncio é o pior desfecho, porque é indistinguível de "nada aconteceu".
     Estado de atenção, notificação, ou tela — algo. E o `catch` que notifica
     precisa de guarda própria, porque a notificação também pode falhar.
   - **Animação se confere vendo o valor MUDAR, não o valor final.** Em
     17/09/2026 a entrada das seções da landing foi trocada por CSS preso à
     rolagem, a conferência mediu se algum bloco ficava apagado, deu tudo
     verde — e no aparelho do autor nada se movia: a animação nascia
     terminada, porque `animation-timeline: view()` resolve a linha do tempo
     contra o contêiner que ROLA mais próximo, e as dobras desta página têm
     contêineres com `overflow: hidden` que não rolam. Sonde a propriedade
     quadro a quadro (opacidade mínima e máxima por bloco enquanto rola), e
     desconfie de "não está quebrado" quando o que se prometeu era movimento.
   - **`prefers-reduced-motion` desliga quase todo o motion do Grana., e
     sessão de acesso remoto do Windows liga essa preferência sozinha.** Antes
     de investigar "o motion parou", confirme
     `matchMedia('(prefers-reduced-motion: reduce)').matches` no ambiente de
     quem relatou; a faixa do topo parada, com os fatos espaçados, é o sinal
     visível disso (`TrustMarquee`). Para reproduzir, o navegador
     automatizado emula com `set media dark reduced-motion`.
   - **Separe hipótese de fato comprovado no `context.md`,** e diga o que NÃO
     foi validado, de preferência como checklist de QA acionável em vez de
     ressalva vaga. Se uma sessão seguinte provar que a hipótese estava
     errada, volte e corrija o registro antigo.
   - **Quando uma feature falha de ponta a ponta, confira o SERVIDOR antes de
     depurar o cliente.** Este projeto não tem
     `supabase_migrations.schema_migrations`: nada compara o repositório com
     a produção, e uma migration escrita aqui pode simplesmente nunca ter
     sido aplicada lá. Em 07/09/2026 o lançamento por voz estava morto porque
     a tabela e as RPCs de `20260905004109_voice_operations.sql` não existiam
     em produção — e duas builds Android foram gastas em correções de fila,
     retry e concorrência no cliente, nenhuma das quais tinha como funcionar.
     A sonda é barata e não escreve nada: chamar a RPC com a chave anônima
     devolve `PGRST202` quando a função não existe e `42501` quando existe.
     O mesmo vale para colunas novas e para as notificações push, que nunca
     entregaram nada porque `push_tokens` estava vazia (falta
     `google-services.json`/FCM, não é bug de código).
   - **`catch` que transforma falha permanente em estado benigno é como uma
     feature inteira fica fora do ar por dias sem ninguém notar.** Aconteceu
     três vezes neste projeto: `PGRST202` virando "salvo no aparelho, sincroniza
     depois", e o registro do token push falhando em silêncio desde o primeiro
     dia. Ao capturar um erro, decida explicitamente se ele é temporário
     (vale enfileirar e tentar de novo) ou permanente (precisa aparecer),
     e nunca deixe um `catch` sem log.

   A versão longa desta análise, com os commits e trechos de código de cada
   caso, está na memória do Claude, em
   `~/.claude/projects/<pasta do projeto>/memory/`
   (`verificacao-no-repo-grana`, `retry-precisa-caber-no-orcamento-de-quem-chama`
   e `padroes-de-correcao-do-codex`).

   **Atenção: a memória é indexada pelo CAMINHO da pasta de trabalho.** Ela
   não acompanha o repositório e não é a mesma nas duas máquinas. Numa sessão
   aberta em outro diretório, o acervo aparece vazio mesmo existindo em disco.
   Até 10/09/2026 esta referência apontava para
   `c--Users-user-Desktop-Aplicativo-Financeiro`, endereço que morreu quando o
   trabalho nesta máquina mudou de pasta. As 32 memórias foram consolidadas em
   `E--GranaPonto`, que corresponde a `E:\GranaPonto`. Se abrir o projeto por
   um caminho novo, copie o acervo antes de começar, em vez de recomeçar do
   zero.

10. **Todo trabalho vive numa linha só: a branch local única, que rastreia
    `origin/main`. Não crie branch. Não crie worktree. Não deixe stash.**
    O nome dela varia por cópia — era `master` nos clones antigos e é `main`
    no clone de `E:\GranaPonto` —, mas a regra é a mesma: uma só.
    O autor não acompanha branches — ele mesmo diz que é leigo em git — e
    depende de que o que foi feito esteja publicado, não guardado em algum
    lugar que só um agente sabe achar.

    Em 09/09/2026 o inventário do repositório mostrava, ao mesmo tempo:

    - `preview/copy-landing` com **2 commits de 28/08 nunca mesclados**,
      mexendo em 334 linhas de `app/index.tsx`. A `main` fez a mesma tarefa
      por outro caminho (`e0d7ce4`), então foi trabalho **feito duas vezes** e
      o do branch virou lixo — e como a landing foi reescrita várias vezes
      desde então, mesclar hoje seria regressão, não recuperação;
    - `fix/header-overflow` e `local/imagens-landing` apontando para branches
      remotas que **já não existem**;
    - **três** worktrees de agente (`.claude/worktrees/agent-*`) parados no
      MESMO commit, com a MESMA mensagem — a mesma correção tentada em
      triplicata;
    - um stash de 02/09 (`wip-featureflags-duplicado-antes-de-reconciliar`),
      resto de uma reconciliação em que TRÊS sessões implementaram o mesmo
      plano em paralelo sem saber uma da outra.

    Nada disso apareceu sozinho: cada item foi criado por uma sessão que
    achou que estava sendo organizada, e nenhuma voltou para limpar.

    Na prática, em toda sessão:

    - **Comece com o inventário e RELATE ao autor**, antes de escrever código:
      `git branch -vv`, `git worktree list`, `git stash list`. Qualquer coisa
      que não seja `master` é dívida — diga qual é, se tem trabalho exclusivo
      (`git log --oneline origin/main..<branch>`) e proponha resolver ou
      descartar. Não decida sozinho apagar: só o autor sabe o que ainda quer.
    - **Se uma ferramenta criar worktree sozinha** (subagente com isolamento),
      a sessão que o criou o remove antes de terminar (`git worktree remove`).
      Worktree é andaime, não entrega.
    - **Nunca termine com trabalho não commitado.** Se ficou pela metade,
      commite pela metade e diga isso na mensagem — a regra 3 existe pra isso.
    - **Antes de começar tarefa grande, confira se ela já não está sendo
      feita**: leia o `context.md` e o inventário acima. Duas sessões no mesmo
      plano é o defeito mais caro deste repositório, e já aconteceu com o
      Bloco 3 dos interruptores remotos e com a família de widgets.

    A única exceção é branch pedida explicitamente pelo autor nesta sessão —
    e nesse caso ela é mesclada ou descartada antes de a sessão acabar.

11. **Publicar uma Edge Function SOBRESCREVE a produção inteira. Se houver
    código lá que não está aqui, o deploy apaga — em silêncio.** É o perigo
    inverso do descrito na regra 9, e os dois convivem: nada neste projeto
    garante que o repositório e a produção sejam iguais. Não existe
    `supabase_migrations.schema_migrations`, não existe deploy pela CI, e
    ninguém compara os dois automaticamente.

    Já aconteceu. As proteções da versão 7 da função de voz — o descarte do
    eco do prompt e a recusa de numeral partido — estavam no ar e não estavam
    no `origin/main`, então qualquer deploy feito a partir do repositório as
    teria apagado sem aviso, e a falha só apareceria como "o reconhecimento
    por voz piorou".

    A causa não foi o painel do Supabase, como esta regra afirmou primeiro:
    aquele código foi escrito NUM repositório, em outra sessão, e publicado de
    lá — só que os commits nunca foram empurrados. Quem olhou depois viu código
    em produção sem origem no `main` e concluiu, razoavelmente, que alguém
    tinha escrito direto no painel. O commit `e7ab948` reconstruiu a mesma
    lógica a partir do bundle publicado, e em 10/09/2026 as duas versões foram
    reconciliadas: prevaleceu a do `e7ab948`, e da outra sobreviveram só os
    testes, que eram mais completos.

    Isso torna a regra MAIS forte, não menos. O painel é um caminho que dá pra
    evitar por disciplina; uma sessão que commita e publica sem empurrar
    produz o mesmo estrago sem ninguém fazer nada de errado à vista. É por isso
    que a regra 10 (uma linha de trabalho só, nada guardado) e esta aqui são a
    mesma regra vista de dois lados: código que existe em produção e não existe
    no `origin/main` é uma bomba-relógio, seja qual for o caminho que o levou lá.

    Antes de qualquer `supabase functions deploy`:

    - **Use `updated_at`, nunca o número da versão.** Criar ou alterar um
      segredo do projeto reinstancia TODAS as funções com o ambiente novo e
      soma 1 na versão de cada uma, sem tocar no código nem no `updated_at`.
      Observado em 09/09/2026: um único `POST /secrets` levou
      `eas-build-webhook` de v33 para v34 e `whatsapp-webhook` de v68 para
      v69, com os dois carimbos intactos. Ler versão como "alguém publicou
      isso" leva a conclusão errada.
    - **Compare o carimbo do que está no ar com o histórico do arquivo.**
      `GET https://api.supabase.com/v1/projects/<ref>/functions` devolve
      `version` e `updated_at` de cada função; `git log -3 -- <caminho da
      função>` devolve quando o fonte mudou por aqui. Um deploy sem commit
      correspondente por perto é o sinal de que alguém mexeu direto na
      produção, e aí o deploy PRECISA parar até isso ser reconciliado.
    - **Baixe e guarde o que está no ar antes de sobrescrever.**
      `GET /v1/projects/<ref>/functions/<slug>/body` devolve o pacote
      publicado. Ele vem em ESZIP comprimido, então `grep` nele não prova
      ausência de nada — serve como artefato de retorno, não como diff.
    - **Rode `deno check` na função.** O `tsc` do app não olha
      `supabase/functions/`; um erro de tipo só apareceria em produção.

    E vale o mesmo cuidado do outro lado: `supabase functions deploy` sem
    nomear a função publica TODAS as funções da pasta. Nomeie sempre as que
    você quer, uma a uma.

    **Um caso específico que já esteve a um comando de quebrar o bot:** o
    `whatsapp-webhook` roda com `verify_jwt=false`, porque quem faz POST nele
    é a Meta, que não tem como mandar um JWT do Supabase. Esse ajuste vive no
    servidor. Este repositório **não tem `supabase/config.toml`**, então a CLI
    não tem de onde ler a exceção e usa o padrão dela, `verify_jwt=true` —
    publicar aquela função sem cuidado passa a exigir JWT e faz o webhook
    recusar toda mensagem da Meta, com o sintoma de "o bot parou de responder"
    e nenhuma pista no código. Confira `verify_jwt` de cada função em
    `GET /v1/projects/<ref>/functions` ANTES de publicar, e publique só o que
    de fato mudou.

12. **Todo registro do projeto vai para o vault do Obsidian, em
    `G:\Meu Drive\Obsidian\Gabriel\Grana` — menos arquivo sensível.** Regra
    dada pelo autor em 10/09/2026, nas duas metades: registrar ali todas as
    informações do projeto, e **nunca** levar para lá `.env` ou semelhante.

    A segunda metade é a que exige cuidado ativo, porque o vault fica **dentro
    do Google Drive** e portanto sincroniza para a nuvem. Não escreva ali
    credencial, token, chave de API, segredo de webhook nem conteúdo do
    `.env`, nem sequer dentro de um comando copiado de uma sessão. Quando uma
    nota precisar falar de uma credencial, cite o NOME da variável e onde ela
    mora, jamais o valor. Vale o mesmo para `Feedbacks/` e `Screenshots/`, que
    contêm dado financeiro de terceiro e continuam apenas na máquina local.

    **A letra do drive MUDA entre as máquinas.** O Google Drive monta em `G:`
    na M1 e em `H:` na M2. Esta regra dava só `G:` até 11/09/2026, e uma sessão
    na M2 concluiu que o vault não existia antes de procurar. Não confie na
    letra escrita aqui: varra os drives montados atrás de
    `<letra>:/Meu Drive/Obsidian` antes de desistir. O resto do caminho é
    idêntico nas duas máquinas.

    **Como é o acesso.** O vault raiz é `<letra>:\Meu Drive\Obsidian`; o material do
    projeto vive em `Gabriel/Grana`, organizado em pastas numeradas
    (`01 - Código`, `02 - Design System`, `03 - Marketing`, `04 - Tráfego`,
    `05 - Vendas`, `06 - Produto`). A porta de entrada é a nota `Grana`, na
    raiz de `Gabriel/Grana`, e **as regras de como escrever ali estão na nota
    `00 - Convenções do Vault` — leia antes de criar ou editar nota.** Em
    resumo: nota nova entra na pasta do assunto, sem sufixo de categoria no
    nome e sem data no título, declarando `tipo` no frontmatter (`perene`,
    `registro`, `espelho` ou `indice`); registro leva `data` e nunca é
    corrigido; perene conferido contra a fonte leva `revisado`. Preço só é
    afirmado no presente por uma nota, `Preço Vigente e Parcelamento - Cakto`,
    e as outras apontam para ela. O servidor MCP é o
    `mcpvault`, rodado por
    `npx -y @bitbonsai/mcpvault@latest "G:\Meu Drive\Obsidian"`, apontado para
    a RAIZ do vault e não para a subpasta, para os links internos do Obsidian
    continuarem resolvendo. Servidor MCP acrescentado no meio de uma sessão só
    aparece depois de reiniciar; enquanto isso o vault é alcançável como pasta
    comum do sistema de arquivos.

    **Três arquivos são espelhados automaticamente**, do repositório para o
    vault, todos em `01 - Código`: o `context.md` como
    `Contexto do Projeto - Grana.md`, o próprio `AGENTS.md` como
    `Regras para Agentes - Grana.md`, e o `PRODUCT.md` como
    `Produto - Estado Atual - Grana.md`. Quem faz isso é o
    `scripts/espelhar-vault.sh`, versionado aqui e chamado por um `hook` de
    `Stop` em `.claude/settings.local.json`, que passa a pasta de destino como
    argumento — o arquivo de settings é ignorado pelo git de propósito, porque
    o caminho do vault muda de máquina, mas o script é o mesmo para as duas. A
    outra máquina precisa só do próprio `hook`, apontando o caminho dela.

    O script compara antes de escrever, para não provocar sincronização do
    Drive à toa, e sai com código zero mesmo com o vault desmontado. Cada
    cópia sai com frontmatter (`tipo: espelho`, `somente_leitura: true`) e um
    alerta no topo, porque dentro do Obsidian nada mais indicaria que aquele
    arquivo é gerado. **A direção é uma só: o repositório manda.** Editar
    qualquer uma das três notas dentro do Obsidian não volta para cá e será
    sobrescrita no fim do próximo turno.

    **Uma nota por sessão, em `00 - Sessões`.** Toda sessão que mexer em
    código ou no vault termina criando a sua, nomeada
    `AAAA-MM-DD - Mn - assunto`, e toda sessão começa lendo as notas de lá que
    são da OUTRA máquina. M1 é a máquina cujo repositório fica em
    `E:\GranaPonto`; M2 é a outra — não há sinal automático confiável, porque
    o nome de rede das duas é genérico e o autor do commit é o mesmo, então
    quem decide é o caminho do repositório. A data vem do relógio da máquina,
    o mesmo que carimba o commit, para a ordem das notas bater com a do
    `git log`.

    A nota de sessão não repete o `context.md`: ela carrega o que o commit não
    carrega bem, ou seja, por que foi feito assim, o que foi descartado no
    caminho, o que deu errado, e o que ficou em aberto. O roteiro completo está
    em `00 - Índice - Sessões`.

    **Toda mexida dentro do aplicativo entra na nota de sessão, em detalhe, na
    hora.** Regra dada pelo autor em 12/09/2026. Vale para qualquer alteração
    de ferramenta, feature, tela, comportamento ou configuração do produto, por
    menor que pareça, e não só para o trabalho "principal" da sessão. Não
    espere o fim da sessão para lembrar: registre junto com a mudança, porque o
    que se perde primeiro é justamente o motivo.

    O que "em detalhe" quer dizer, na prática, é responder a estas seis coisas
    para cada mudança:

    1. **O pedido como ele chegou**, incluindo a frase do autor ou do usuário
       quando houver. É o que permite a uma sessão futura julgar se a solução
       ainda serve ao problema.
    2. **O sintoma e a causa, separados.** Sintoma é o que se vê; causa é o
       mecanismo. Se a causa não foi encontrada, dizer isso com todas as letras
       em vez de deixar a hipótese passar por fato.
    3. **Arquivos e identificadores concretos**: caminho do arquivo, nome da
       função, `hash` do commit. Sem isso a nota vira lembrança vaga e a
       próxima sessão refaz a busca do zero.
    4. **O que foi DESCARTADO e por quê.** Alternativa recusada é metade do
       valor da nota: sem ela, a sessão seguinte tenta o caminho que já se
       provou ruim. Vale também para pedido do autor que não foi seguido à
       risca, com o motivo.
    5. **O que deu errado no caminho**, inclusive erro do próprio agente. A
       correção de 12/09 sobre o teclado só faz sentido registrada junto com a
       tentativa anterior, que abriu um vão na tela e teve de ser refeita.
    6. **O que ficou sem verificação.** Separar "testado no aparelho" de
       "passou no `tsc` e na suíte" de "conferido lendo o código", como manda a
       regra 9.

    Quando a mudança criar, mover ou apagar arquivo que alguma nota perene
    descreve, atualizar a nota perene TAMBÉM, e carimbar `revisado`. O
    `scripts/verificar-vault.mjs` acusa quem esquecer.

    A alternativa que o autor levantou, separar o vault em pastas por máquina,
    foi descartada de propósito: arquivaria o conhecimento por autor, e o mesmo
    assunto passaria a existir dos dois lados quando uma máquina continuasse o
    trabalho da outra. A nota por sessão entrega o benefício que interessava
    naquela ideia, que é nunca ter duas máquinas editando o mesmo arquivo
    dentro do Google Drive, onde não existe fusão de edição concorrente.

    **O vault envelhece em silêncio, e existe script para isso.** Toda nota
    perene declara em `fonte` os caminhos do repositório que ela descreve, e
    `scripts/verificar-vault.mjs` compara o `revisado` da nota com o último
    commit que tocou aqueles caminhos:

        node scripts/verificar-vault.mjs "<pasta do vault>"

    Ele lista, além das notas atrasadas, link apontando para nota inexistente,
    nota sem link de entrada e fonte que sumiu do repositório. Rodar antes de
    dar por encerrado qualquer trabalho que mexeu no vault. Duas armadilhas já
    resolvidas dentro dele, para ninguém reescrever pior: link entre crases não
    é link, e dentro de tabela o apelido usa `\|`.

    **Data vem da hora local**, nunca de UTC. Depois das 21h em Brasília, UTC
    já virou o dia seguinte, e foi assim que uma leva de notas nasceu com um
    dia a mais que o commit correspondente.

    **Renomeou nota por fora com o Obsidian aberto? Recarregue o aplicativo.**
    O índice dele fica defasado, e clicar num link antigo **cria uma nota
    vazia** em vez de avisar que o alvo sumiu. Já apareceram quatro arquivos de
    zero byte na raiz do vault por causa disso.

    Isso **não** substitui a regra 6: o `context.md` do repositório continua
    obrigatório, porque é por ele que a outra máquina fica sabendo o que
    aconteceu aqui, pelo GitHub. O vault é registro adicional.

13. **Lançamento por voz é UMA ferramenta, com UMA configuração, dentro do
    app e no widget. As regras e o comportamento precisam ser EXATAMENTE
    IGUAIS nos dois caminhos.** Regra explícita do autor em 11/09/2026.

    - **Uma única fonte de verdade executável.** Configuração de voz,
      transcrição, normalização, interpretação de valores, categorias,
      carteiras, cartões, parcelas, recorrência, validação, confiança,
      confirmação, persistência, idempotência, offline, retomada e tratamento
      de erros pertencem ao mesmo núcleo compartilhado. Não duplique lógica
      nem mantenha ajustes independentes por origem (`app` ou `widget`).
    - **Corrigiu em um, corrigiu nos dois.** Toda correção deve ser aplicada
      no núcleo comum e alcançar automaticamente ambas as entradas. Uma
      proteção aplicada só no widget ou só no botão do app é uma correção
      incompleta, nunca trabalho pronto.
    - **Mesma entrada, mesma decisão.** Com a mesma fala, dados do usuário e
      condições, os dois caminhos devem produzir o mesmo valor, destino,
      interpretação e decisão de salvar, pedir confirmação ou recusar.
      Nenhuma entrada pode aceitar silenciosamente o que a outra considera
      ambíguo, nem ter timeout, fallback ou política de retenção próprios.
    - **Só a apresentação se adapta à superfície.** Microfone, ciclo de vida
      Android, tela e notificação podem exigir adaptadores técnicos; eles não
      podem redefinir regras financeiras ou de segurança. Uma confirmação
      necessária continua necessária no widget, que deve abrir/encaminhar a
      revisão equivalente, nunca contorná-la por não estar dentro do app.
    - **Testes de paridade são obrigatórios.** Todo bug de voz vira regressão
      testada nas DUAS entradas, exercitando os módulos reais e comparando
      decisões, valores e efeitos de gravação, fila, descarte e confirmação.
      Testar somente o parser ou uma das superfícies não comprova a correção.
    - **Divergência existente é dívida, não exceção autorizada.** Descrições
      históricas no `context.md`, comentários ou implementações anteriores
      que justifiquem comportamentos diferentes não prevalecem sobre esta
      regra. Ao encontrá-los, registrar a divergência e resolvê-la no núcleo
      compartilhado, sem introduzir outro remendo específico de superfície.

14. **Mudança de estrutura ou posição na interface vai em COMMIT PRÓPRIO, e
    nunca de carona num commit sobre outro assunto.** Regra pedida pelo autor
    em 12/09/2026, depois de abrir o aplicativo e achar o botão do Granabô
    solto acima da barra de abas, com a fileira de ícones sem o item central.

    A mudança tinha entrado no commit `29cd70c`, cujo assunto declarado era
    "completa a migração de Modal cru para AppModal, e acessibilidade em
    chips". Ninguém revisou aquilo como mudança de layout, porque nada no
    assunto do commit dizia que havia uma. O autor descobriu pela tela.

    Na prática: se ao fazer outra coisa você mexer em posicionamento,
    hierarquia, navegação ou estrutura de tela, isso sai num commit separado,
    com o assunto dizendo o que mudou na tela. Vale mesmo quando parece
    pequeno — revisar um commit a mais custa muito menos que descobrir a
    regressão pela reclamação de quem usa.

    **E o defeito em si, que é a outra metade da regra: elemento não se
    posiciona por cima de outro com a medida dele copiada à mão.** O botão
    virou `<View>` absoluta com `bottom: margem + 68 + spacing.xs`, onde `68`
    é a altura da barra escrita na mão, que alguém teria de manter em sincronia
    com `TAB_BAR_ALTURA` para sempre. Quando um elemento precisa se posicionar
    em relação a outro, ele entra no FLUXO daquele outro (dentro da fileira,
    dentro do container). O flex resolve em qualquer altura, em qualquer escala
    de fonte do sistema e em qualquer resolução, sem constante sincronizada.
    Foi colando medida na mão que a janela de lançamento quebrou em tela
    pequena no mesmo dia, na conta do teclado — é a mesma classe de defeito.

15. **O repositório `Gabriouss/Grana.` é PÚBLICO no GitHub. Tudo o que entra
    no git — código, `context.md`, planos em `docs/`, testes, mensagens de
    commit — pode ser lido por qualquer pessoa, sem login, inclusive nas
    versões antigas.** Conferido em 16/09/2026 pela API do GitHub
    (`private: false`). A visibilidade tem motivo: o download permanente do
    APK passa pelas Releases do GitHub (`vercel.json` →
    `releases/latest/download/grana.apk`), e uma Release só abre sem login em
    repositório público.

    Já custou uma senha. O plano
    `docs/superpowers/specs/2026-09-06-plano-codex-ciclo-fatura-cartao.md`
    (commit `14ef2d2`) trazia o e-mail e a senha da conta de teste em texto
    puro, e ficou dez dias aberto a qualquer um. Tirar do arquivo (`eb3b3ad`)
    não tira do histórico: a versão antiga continua acessível pelo hash.

    Na prática:

    - **Credencial só mora no `.env` local, ou nos secrets do Supabase e do
      EAS.** Em arquivo versionado, cite o NOME da variável — a mesma regra do
      vault (regra 12), pelo mesmo motivo. Vale para plano, roteiro de QA,
      comentário, mensagem de commit e saída de comando colada em registro.
    - **O login da conta de teste é `E2E_TEST_EMAIL` e `E2E_TEST_PASSWORD`**,
      no `.env` de cada máquina, e é isso que os roteiros do Maestro leem.
      Nunca com prefixo `EXPO_PUBLIC_`, que embute o valor no app.
    - **O `.easignore` precisa continuar excluindo o `.env`.** Com
      `.easignore` presente, o EAS não lê o `.gitignore` e copia a pasta de
      trabalho inteira para a build — conferido no código do `eas-cli` 24.3.0.
      Aconteceu em toda build de 01/09 (`00de222`, quando o `.easignore`
      nasceu) a 16/09 (`4ce2242`). A 1.10.2, disparada da M1 em 12/09, levou
      para o servidor do EAS um `.env` com `CAKTO_CLIENT_ID`,
      `CAKTO_CLIENT_SECRET`, `GITHUB_TOKEN`, `SUPABASE_ACCESS_TOKEN` e
      `VERCEL_TOKEN` — o log da build lista os nomes (`env: export …`). Nada
      disso entrou no APK, porque só `EXPO_PUBLIC_` é embutido. As builds
      recebem as `EXPO_PUBLIC_` pelo `eas.json` e pelas variáveis do EAS
      (`eas env:list`), não pelo `.env`. Para conferir uma build, procure
      `env: load .env` no log dela. **Trava:** `npm run build:preparar`
      chama `scripts/env-fora-da-build.ts` e se recusa a preparar a build se
      algum `.env*` da raiz fosse no pacote (`abf329a`). Não a contorne; se
      ela acusar, corrija o `.easignore`.
    - **Segredo que vazou se troca; não se tenta apagar.** O que esteve
      público deve ser tratado como conhecido. Reescrever o histórico exige
      `push --force` e desencontra a outra máquina (regras 1, 2 e 10): só com
      pedido explícito do autor, e mesmo assim depois da troca. Exceção
      decidida pelo autor em 16/09/2026: a senha da conta de teste não é
      importante e não precisa ser trocada.

16. **O Codex é REVISOR do trabalho do Claude neste projeto. O que ele acha é
    hipótese até alguém conferir no código.** Decisão do autor em 18/09/2026:
    "vamos utilizar o codex como um revisor do trabalho do claude e vocês irão
    trabalhar em conjunto". O plugin é o `codex@openai-codex`
    (`openai/codex-plugin-cc`, organização verificada da OpenAI, licença
    Apache-2.0), e o `codex` da linha de comando é o `@openai/codex`, já
    logado com a conta do ChatGPT do autor.

    Por que hipótese e não veredito: em 07/09/2026 uma revisão das correções do
    Codex achou duas regressões introduzidas por outro agente na mesma semana,
    e a regra 9 nasceu disso. O revisor erra como qualquer um, e um achado
    aceito sem conferência vira remendo em cima de um defeito que não existia.

    Na prática:

    - **Antes de agir sobre um achado, leia o trecho que ele cita** e diga, em
      uma frase, se procede, se não procede ou se não deu para confirmar. Achado
      que não procede não vira mudança; registre o porquê na nota da sessão, que
      é o que impede a próxima sessão de refazer a mesma discussão.
    - **Correção que o Codex escrever (`/codex:rescue`) segue as mesmas regras
      de qualquer outra:** verificação da regra 9, mudança de layout em commit
      próprio (regra 14), voz nas duas entradas (regra 13), uma linha de
      trabalho só, sem branch, sem worktree e sem stash (regra 10). Trabalho do
      Codex sem commit no fim da sessão é o mesmo defeito da regra 10.
    - **Onde a revisão vale a pena:** antes de publicar Edge Function ou
      migration (regra 11), depois de mudança em dinheiro, fatura, assinatura ou
      voz, e antes de fechar uma varredura grande. Não é etapa de todo commit:
      cada revisão gasta o limite do plano do autor.
    - **O `review gate` fica DESLIGADO.** Ligado, um gancho de `Stop` faz o
      Codex revisar cada resposta e pode bloquear a saída em laço, gastando o
      limite rápido. Só com pedido explícito do autor e com ele acompanhando a
      sessão. Confira com `/codex:setup`.
    - **`/codex:transfer` entrega o histórico da sessão ao Codex.** Esse
      histórico pode ter texto colado pelo autor. Não use em sessão em que
      apareceu credencial (regra 15).
    - **O plugin está instalado no escopo `user` da M1, ou seja, vale em TODOS
      os projetos daquela máquina, não só no Grana.** Foi instalado em
      18/09/2026 pelos comandos `/plugin marketplace add openai/codex-plugin-cc`
      e `/plugin install codex@openai-codex`, seguidos de `/reload-plugins` e
      `/codex:setup`, que respondeu que o Codex está pronto e que o review
      gate está desligado. Os ganchos de início e fim de sessão dele rodam em
      qualquer pasta aberta na M1. **Declarar o plugin em
      `.claude/settings.local.json` NÃO o instala:** foi tentado primeiro, e o
      Claude Code não baixou o marketplace nem instalou nada. Só os comandos
      `/plugin` instalam. A M2 não recebe nada por `git pull` e precisa rodar
      os mesmos comandos, se o autor quiser o Codex lá.
    - **O plugin revisa trabalho AINDA NÃO COMMITADO, não um commit isolado.**
      `/codex:review` só aceita o estado local (`--scope working-tree`) ou tudo
      contra uma branch base (`--base <ref>`); não existe alvo de commit único,
      conferido no código do plugin em 18/09/2026. Como este projeto trabalha
      numa linha só e commita logo, a revisão útil é a que roda ANTES do
      commit, sobre a árvore de trabalho. Para olhar um commit já feito, só o
      `codex review --commit <hash>` da linha de comando, fora do plugin.
    - **Antes de rodar uma revisão, PERGUNTE ao autor, e diga o tamanho.** O
      limite de uso do Codex é do plano do autor e é curto: o primeiro teste,
      em 18/09/2026, morreu na primeira chamada com "You've hit your usage
      limit", com retorno só às 9h53 do dia seguinte, e o Codex usava o esforço
      de raciocínio `xhigh`, o mais caro. Uma revisão que falha por limite não
      revisa nada e não deixa recibo, então não conte com ela como etapa
      obrigatória de nada: se acabar, o trabalho segue pela verificação da
      regra 9 e o registro diz que a revisão não aconteceu.
    - **Citar o revisor no commit é opcional; citar o que foi conferido não é.**
      "Achado do Codex confirmado no trecho X" é registro útil.
      "Corrigido conforme o Codex" não diz nada.

17. **Verificação do app no emulador Android, depois de iniciada, vai até 100%
    do aplicativo: sem parar, sem perguntar e sem pausar.** Regra dada pelo
    autor em 19/09/2026: "Uma vez que você inicia uma verificação na emulação
    do app do Android, você não para, não pergunta nem pausa nada, você
    verifica, encontra erros, documenta e continua até verificar 100% do app."
    E, na mesma mensagem: "você vai pedir auxílio de todas as skills
    disponíveis para ajudar na auditoria".

    O motivo é o que aconteceu nas varreduras de 18 e 19/09/2026: o autor
    precisou mandar "continue a auditoria", "continue a verificação" e
    "verifique tudo até o final" várias vezes, porque a sessão parava no meio
    para relatar, perguntar ou esperar, e a parte não vista do app ficava sem
    ninguém saber que não tinha sido vista.

    - **Antes de abrir o emulador, escolha as skills e diga quais.** Procure na
      biblioteca (regra 7: `.claude/skills/`, `.agents/skills/` e as globais)
      tudo o que ajuda a auditar, carregue e use como apoio durante a
      verificação, não só no relatório. As que servem hoje: visual e
      usabilidade, `ui-visual-composition`, `impeccable`, `interface-design`,
      `apple-design` e `emil-design-eng`; movimento, `review-animations`,
      `animation-vocabulary` e `find-animation-opportunities`; texto na tela,
      `copywriting` e `grammar-check` (com a regra de copy sem travessão e sem
      "não é X, é Y"); roteiro e cobertura, `test-scenarios`; comportamento
      prometido contra o entregue, `intended-vs-implemented`; a landing no
      navegador, `webapp-testing`. A lista envelhece: confira a biblioteca a
      cada verificação, e registre na nota da sessão qual skill foi usada em
      quê.
    - **Monte a lista de cobertura ANTES de começar e marque conforme avança.**
      "100%" quer dizer cada tela, cada botão, cada modal e folha, e os estados
      de cada tela: vazia, carregando, com erro, sem rede, com texto longo,
      fonte grande do sistema, valores ocultos. **Não há tema claro nem tela
      deitada, e nunca haverá** (decisão do autor em 19/09/2026: "O app não
      terá tela deitada e nem modo claro nunca"): o app é só escuro
      (`userInterfaceStyle: "dark"`) e só retrato (`orientation: "portrait"`
      no `app.json`). Não entram na cobertura nem viram achado; o que entra é
      qualquer resto que sugira o contrário. Inclui login, cadastro,
      assinatura, Início, Lançamentos, Crédito, Gráficos, Carteiras, Metas,
      Desafios, Perfil com tudo o que abre dali, Granabô, voz no app e no
      widget, os widgets da tela inicial e as notificações. A lista fica na
      nota da sessão, no vault; é por ela que se afirma 100%, e é dela que a
      sessão seguinte retoma se o contexto acabar no meio.
    - **O que o emulador não alcança não some da lista.** Pagamento real, push
      pelo FCM, microfone de aparelho físico: marque "não verificável no
      emulador", com o motivo, e siga. Item pulado em silêncio é o defeito que
      esta regra existe para impedir.
    - **Documente cada achado na hora, não no fim.** Na nota da sessão: tela,
      passos para reproduzir, o que se esperava, o que apareceu, gravidade, e o
      caminho do print. Os prints ficam na pasta de temporários da sessão, fora
      do repositório e fora do vault.
    - **Achado confirmado no código é corrigido durante a varredura; o incerto
      fica registrado.** Decisão do autor em 23/09/2026, que substitui o
      "verificação não é correção" de 19/09: "Se o achado for constatado como
      problemático para a usabilidade do produto ou para as questões visuais
      do produto, eu quero que seja corrigido imediatamente [...] Caso o
      achado dele for só uma teoria, um erro de navegação, algo que você não
      tem certeza, pode deixar documentado e depois me informe que esses
      achados não possuíam confiabilidade suficiente."
      Na prática: quem varre continua sem parar e sem corrigir; cada achado é
      conferido no código por quem coordena; o **confirmado** vai na hora ao
      dono da área (app, visual, banco), em commit próprio, e a tela é
      reverificada por quem varre antes do fim; o **não confirmado** fica
      marcado "sem confiabilidade suficiente" e entra no relatório final ao
      autor. Correção durante a varredura segue todas as outras regras (9,
      11, 13, 14 e 15), e a tela corrigida é revista no fim da varredura,
      porque o app mudou depois de ter sido visto.
    - **Falha técnica não é motivo para parar.** App que fecha, Metro com erro,
      emulador lento: reinicie o que for preciso (app, Metro, inicialização a
      frio do emulador) e retome do item em que parou. Se quem fechou foi o
      app, isso é achado.
    - **Pergunta ao autor vai para o relatório final, não interrompe.** Se um
      achado depende de decisão dele, anote a pergunta e continue.
    - **"Sem parar" não suspende as outras regras.** Nada de `eas build`
      (regra 4), publicação de Edge Function ou migration (regra 11) nem
      credencial fora do `.env` (regra 15) no meio da varredura. Ação que
      grava ou apaga dado só na conta de teste, com dado inventado marcado
      "AUDIT", apagado no fim. Se um achado pedir uma dessas ações, ele é
      documentado e a varredura continua.

18. **Para ver ou operar o app no emulador, use `scripts/emulador.cjs` e siga
    `docs/operar-o-app-no-emulador.md`; o mapa das telas, as armadilhas do
    ambiente e as classes de defeito da auditoria de 19/09/2026 estão em
    `docs/mapa-do-app-para-agentes.md`. Vale para Claude e para o Codex, e
    cada agente roda o passo a passo ele mesmo.** Regra dada pelo autor em
    19/09/2026, depois de ver o Codex digitar "undefined" no campo de e-mail do
    Expo Go: ele não tinha como ler a conta de teste, porque agente nenhum lê o
    `.env`, e montou o texto com a variável vazia.

    - **O login é `node scripts/emulador.cjs login`.** O script lê
      `E2E_TEST_EMAIL` e `E2E_TEST_PASSWORD` dentro do próprio processo e manda
      o valor direto para o `adb`, sem imprimir. É a única forma aceita: nunca
      digite credencial à mão, nunca a interpole num comando, nunca a copie
      para arquivo, log ou registro (regras 12 e 15). Se o script disser que a
      variável está ausente, pare e avise o autor.
    - **Quem precisa do app faz o login e a navegação por conta própria.** Não
      peça a outro agente nem ao autor para entrar por você, e não delegue esse
      passo: a ferramenta existe para isso.
    - **Antes de instruir outro agente, dê o caminho, não a resposta.** Ao
      delegar trabalho que precise ver o app (por exemplo ao Codex), cite o
      guia e o script no pedido, e não leia nem cole a credencial no pedido. O
      pedido de 19/09/2026 proibia ler o `.env` e não dizia como entrar: foi a
      lacuna que quebrou o login.
    - **Expo Go tem só um conjunto fixo de módulos nativos.** Tela branca com o
      Metro limpo é módulo ausente, não bug de código: use
      `node scripts/emulador.cjs abrir dev` (APK de desenvolvimento) antes de
      depurar.

19. **Este terminal do Codex nunca realiza o trabalho diretamente.** Ele apenas
    encaminha cada tarefa ao agente específico adequado, coordena a execução e,
    ao final, apresenta ao autor um resumo consolidado dos achados de todos os
    agentes envolvidos.

    **No Maestri, "Codex" é o nome do terminal maestro, e ele pode estar
    rodando uma sessão do Claude.** A regra vale para quem estiver nesse
    terminal, seja qual for o modelo: não corrige código, não escreve
    rascunho para outro agente terminar e não escreve registro. Em 23/09/2026
    a sessão maestro começou uma correção sozinha e escreveu nota de sessão e
    entrada de `context.md`, enquanto cada agente também documentava por conta
    própria; o dono da documentação não recebeu nada até o autor cobrar.

    **Documentação é do Ledger** (Documentation/Vault): `context.md`, vault do
    Obsidian e notas de sessão. Os outros agentes não editam esses arquivos;
    mandam o relatório ao maestro, num arquivo da pasta de trabalho da rodada
    (`E:\Grana-temporarios\<rodada>\relatorio-<agente>-<etapa>.md`),
    respondendo às seis perguntas da regra 12, e o maestro repassa ao Ledger.
    Quando o Ledger não estiver no canvas, o maestro delega o registro a outro
    agente, e não o escreve ele mesmo.

20. **"Saldo atual" e "Livre para gastar" usam SÓ o mês vigente. Nunca saldo
    acumulado de meses anteriores, nunca `initial_balance`.** Decisão do autor
    em 24/09/2026: "não quero saldo acumulado, quero saldo apenas do mês
    vigente", e, na mesma noite, "anote isso como uma regra, não deveremos
    regredir para isso novamente".

    O motivo é a regressão que esta regra desfaz. Em 19/09/2026, o achado A12
    mostrou que o "Saldo atual" da Início (só o mês) e o seletor de carteira
    (acumulado) davam dois números diferentes para a mesma palavra. A correção
    daquele dia, o `867e1b5`, escolheu o lado errado: passou a somar
    `initial_balance` e todo o histórico. Com histórico importado incompleto,
    o saldo acumulado ficou muito acima da realidade, e o número que o Grana.
    mostrava como "saldo" deixou de ter relação com o dinheiro da pessoa. A
    conta real do autor não tem os valores registrados aqui, de propósito
    (regra 15).

    As regras que andam junto com esta:

    - **Compra no crédito fica fora do caixa, e a fatura só conta quando é
      paga**, como saída de caixa no mês do pagamento. Reafirmado pelo autor
      em 24/09/2026; a proposta de descontar a fatura fechada e ainda não paga
      foi recusada duas vezes.
    - **A mesma palavra mostra o mesmo número em todo lugar.** "Saldo" e
      "Livre para gastar" têm um valor só na Início, no seletor de carteira,
      nos widgets e no Granabô. É a lição do A12 que continua valendo: o
      defeito dele não era o cálculo, era haver dois. Corrigir um lado e
      deixar o outro é a regressão de volta.
    - **Qualquer mudança nesse cálculo exige pedido explícito do autor na
      sessão.** Achado de auditoria, sugestão de outro agente ou "parece mais
      correto contabilmente" não bastam: foi assim que o `867e1b5` entrou.
    - **O teste de trava desse cálculo não se afrouxa para passar.** Se ele
      falhar depois de uma mudança, a mudança está errada, ou falta o pedido
      do autor que a autoriza. Editar a asserção para caber no código novo é o
      mesmo que apagar esta regra.

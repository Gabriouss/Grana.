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
    dada pelo autor em 11/09/2026, nas duas metades: registrar ali todas as
    informações do projeto, e **nunca** levar para lá `.env` ou semelhante.

    A segunda metade é a que exige cuidado ativo, porque o vault fica **dentro
    do Google Drive** e portanto sincroniza para a nuvem. Não escreva ali
    credencial, token, chave de API, segredo de webhook nem conteúdo do
    `.env`, nem sequer dentro de um comando copiado de uma sessão. Quando uma
    nota precisar falar de uma credencial, cite o NOME da variável e onde ela
    mora, jamais o valor. Vale o mesmo para `Feedbacks/` e `Screenshots/`, que
    contêm dado financeiro de terceiro e continuam apenas na máquina local.

    **Como é o acesso.** O vault raiz é `G:\Meu Drive\Obsidian`; o material do
    projeto vive em `Gabriel/Grana`, organizado em pastas numeradas
    (`01 - Código`, `02 - Design System`, `03 - Marketing`, `04 - Tráfego`,
    `05 - Vendas`, `06 - Produto`). Nota nova entra na pasta do assunto,
    seguindo os nomes descritivos que já existem. O servidor MCP é o
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
    `Produto - Estado Atual - Grana.md`. Quem faz isso é um `hook` de
    `Stop` em `.claude/settings.local.json` — arquivo ignorado pelo git de
    propósito, porque o caminho do vault só existe nesta máquina. Ele compara
    antes de copiar, para não provocar sincronização do Drive à toa, e sai com
    código zero mesmo com o vault desmontado. **A direção é uma só: o
    repositório manda.** Editar qualquer uma dessas duas notas dentro do
    Obsidian não volta para cá e será sobrescrita no fim do próximo turno. Se
    a outra máquina for usar o vault, ela precisa do próprio `hook`, com o
    caminho dela.

    Isso **não** substitui a regra 6: o `context.md` do repositório continua
    obrigatório, porque é por ele que a outra máquina fica sabendo o que
    aconteceu aqui, pelo GitHub. O vault é registro adicional.

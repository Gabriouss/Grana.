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

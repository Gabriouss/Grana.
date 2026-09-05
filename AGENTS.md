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

5. **Suba `expo.version` no `app.json` ANTES de todo build de release.**
   Não é burocracia de versionamento: é o que faz o aviso de atualização
   funcionar. Quem já tem o app instalado só descobre que saiu versão nova
   pelo banner de `lib/atualizacao.ts`, e ele compara a versão da linha
   `app_release` com a versão embutida na build instalada. A linha
   `app_release` é escrita pela Edge Function `eas-build-webhook`, que
   **recusa** um build cuja versão não seja maior que a já anunciada
   (responde `older version ignored`).

   Ou seja, buildar sem subir a versão não gera erro nenhum — o build sai,
   instala e funciona — mas ninguém é avisado, e o silêncio é
   indistinguível de "não saiu build". Foi exatamente o que aconteceu entre
   1.1.1 e 1.2.0: várias builds seguidas com a mesma versão, todas
   ignoradas pelo webhook.

6. **A mensagem do build é COPY DE PRODUTO, não changelog técnico — e tem
   verificador.** O texto do `--message` vai literalmente para o pop-up "O que
   mudou no Grana.", na cara de todo mundo que atualiza. Antes de buildar:

   ```
   npm run notas:check "Corrige tela branca após desbloqueio por digital"
   ```

   Reprovado, ele diz palavra por palavra o que está errado e sai com código 1.

   Isto não é preciosismo: a 1.4.1 foi ao ar com "apos" sem acento no pop-up.
   A causa não foi distração — é que os commits deste repositório são escritos
   SEM ACENTO por convenção, e quando o `eas build` roda sem `--message` o EAS
   preenche a mensagem do build com a mensagem do commit. Ou seja, o caminho
   padrão publica texto interno como copy de produto. Escreva sempre
   `--message`, com acentuação de português de verdade.

   A Edge Function `eas-build-webhook` roda a mesma checagem
   (`lib/notas-release.ts`, copiado lá dentro e vigiado por
   `__tests__/sync-parser.js`). Se a nota for reprovada ela publica a versão
   assim mesmo, porém SEM notas — o aviso de atualização da regra 5 nunca
   pode depender de ortografia —, e a recusa aparece no log da função e na
   tela de webhooks do EAS.

7. **Ao iniciar o trabalho numa sessão, leia o `context.md` primeiro.** Ele é
   a visão técnica/operacional do projeto e o estado de onde a última sessão
   parou. Ao encerrar uma sessão que mexeu em código, atualize o `context.md`
   com o que mudou e o estado atual, e suba isso no GitHub junto com o resto
   do commit — é assim que a outra máquina fica sabendo o que aconteceu aqui.

8. **Antes de agir sobre qualquer pedido do autor, procure na biblioteca de
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

9. **`eas.json`: `preview` e `production` têm que continuar gerando o mesmo
   tipo de artefato (`distribution: internal`, `android.buildType: apk`).**
   O pop-up de atualização (`lib/atualizacao.ts`) só funciona se o link do
   build for um `.apk` instalável direto — um `.aab` (o padrão do Expo pra
   builds sem esses dois campos) chega ao aviso mas não instala. Os dois
   perfis foram alinhados em 05/09/2026 por causa disso; se `production`
   voltar a divergir de `preview`, o próximo build feito com o perfil
   errado quebra o aviso silenciosamente.

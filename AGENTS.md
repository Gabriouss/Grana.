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

6. **Ao iniciar o trabalho numa sessão, leia o `context.md` primeiro.** Ele é
   a visão técnica/operacional do projeto e o estado de onde a última sessão
   parou. Ao encerrar uma sessão que mexeu em código, atualize o `context.md`
   com o que mudou e o estado atual, e suba isso no GitHub junto com o resto
   do commit — é assim que a outra máquina fica sabendo o que aconteceu aqui.

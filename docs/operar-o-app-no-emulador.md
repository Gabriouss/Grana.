# Como operar o Grana. no emulador Android (guia para agentes, Codex inclusive)

Escrito em 19/09/2026 porque o Codex não conseguia entrar no app: digitou
"undefined" no campo de e-mail. A causa é que a conta de teste mora no `.env`,
agentes não leem o `.env`, e quem monta o texto de login sem ter o valor acaba
com a variável vazia. O caminho abaixo resolve isso sem expor a senha.

**Regra de ouro: rode você mesmo, do começo ao fim.** Este guia é para ser
seguido pelo agente que precisa ver o app. Não peça a outro agente nem ao autor
para abrir, entrar ou navegar por você. Se um passo falhar, leia a seção
"Quando dá errado" antes de desistir.

## Ferramenta

Tudo passa por um script só, `scripts/emulador.cjs`, que já sabe achar o `adb`,
ler a tela e tocar por texto. Rode a partir da raiz do repositório:

    node scripts/emulador.cjs            (sem argumento: lista os comandos)

## Passo a passo

1. **Conferir o ambiente:**

       node scripts/emulador.cjs estado

   Mostra se há emulador, se o Expo Go e o APK de desenvolvimento estão
   instalados, qual app está na frente, se o `adb reverse` da porta 8081 existe
   e se o Metro responde. Sem emulador, o autor precisa abrir o `Pixel_8` no
   Android Studio: não há como você ligar um aparelho.

2. **Metro rodando.** Se `estado` disser que o Metro não respondeu, suba em
   outro terminal e deixe aberto (é um processo longo, use segundo plano):

       npx expo start -c

   Antes de escrever código, leia a documentação do Expo 57 (regra do topo do
   `AGENTS.md`).

3. **Abrir o app:**

       node scripts/emulador.cjs abrir go      (Expo Go)
       node scripts/emulador.cjs abrir dev     (APK de desenvolvimento)

   O primeiro bundle leva de 20 a 60 s. Espere com
   `node scripts/emulador.cjs tem "Entrar"` até responder `SIM`.

   **Qual usar:** o APK de desenvolvimento (`com.gabriouss.grana`) tem todos os
   módulos nativos do app (widgets, voz, câmera). O Expo Go só tem um conjunto
   fixo, e módulo nativo ausente falha em SILÊNCIO: tela branca com o Metro
   limpo. Se algo aparece em branco no Expo Go, troque para `abrir dev` antes de
   procurar bug no código.

4. **Entrar na conta de teste:**

       node scripts/emulador.cjs login

   O script lê `E2E_TEST_EMAIL` e `E2E_TEST_PASSWORD` do `.env` **por dentro do
   próprio processo**, limpa os dois campos, digita, fecha o teclado e toca em
   "Entrar". Nada do valor é impresso. **Você não lê o `.env` e não copia esses
   valores para lugar nenhum**: nem no comando, nem em log, nem em arquivo
   versionado (regras 12 e 15 do `AGENTS.md`, o repositório é público).
   Confirme com `node scripts/emulador.cjs tem "Início"`.

   Se o script disser que a variável está ausente, o `.env` desta máquina não
   tem a conta de teste. Pare e avise o autor; não invente e-mail nem senha.

5. **Navegar e ver:**

       node scripts/emulador.cjs listar             (o que há na tela, com posição)
       node scripts/emulador.cjs tocar "Lançamentos"
       node scripts/emulador.cjs tocar "Salvar" 1   (o segundo elemento com esse texto)
       node scripts/emulador.cjs digitar "AUDIT almoço"
       node scripts/emulador.cjs voltar
       node scripts/emulador.cjs print nome-da-tela

   Os prints vão para `E:\Grana-temporarios\prints`, fora do repositório. Abra
   o arquivo para ver a tela de fato: `listar` mostra texto, não aparência.

## O que NÃO fazer

- **Não digite credencial à mão** (`adb shell input text <senha>`). É assim que
  ela vaza para o histórico do terminal, e é assim que nasce o "undefined".
- **Não interpole variável de ambiente num comando** para montar e-mail ou
  senha: se a variável não existir no seu processo, o resultado é a palavra
  "undefined" ou uma string vazia, sem erro.
- **Não use dado real.** Tudo que você criar na conta de teste leva o prefixo
  `AUDIT` e é apagado no fim.
- **Não rode `eas build`, não publique Edge Function nem aplique migration**
  para "fazer funcionar" (regras 4 e 11).
- **Não limpe os dados do app** (`pm clear`) sem necessidade: derruba a sessão e
  o app volta ao login com configurações padrão.

## Quando dá errado

| Sintoma | O que fazer |
|---|---|
| E-mail ou senha errados na tela | Confira com `listar` o que foi digitado no campo de e-mail (a senha aparece como bolinhas). Se apareceu "undefined", você digitou por fora do script: use `login`. Se os valores estão certos e o erro persiste, avise o autor: a senha da conta pode ter mudado |
| `tem "Entrar"` nunca vira `SIM` | O app ainda carrega, travou ou já está logado. Rode `listar` e `print` para ver a tela |
| Tela branca com Metro limpo | Módulo nativo ausente no Expo Go. Use `abrir dev` |
| "Unable to load script" ou vermelho de rede | Falta o `adb reverse`: rode `abrir go` ou `abrir dev` de novo, ou `adb reverse tcp:8081 tcp:8081` |
| Bundle antigo aparece | Metro velho. Reinicie com `npx expo start -c` |
| Faixa de debug do Metro cobre a barra de abas | Toque no X da faixa (canto direito, perto de x=996, y=2208 no Pixel_8) |
| Teclado cobre um botão | `node scripts/emulador.cjs voltar` fecha só o teclado |
| Toque não faz nada | Rode `listar` de novo: a posição muda quando a tela rola |

## Regras que continuam valendo enquanto você usa o app

Verificação não é correção: durante uma varredura (regra 17) você registra o
achado e segue. Corrija depois, com a suíte (`npm run test:ci`) e `tsc` verdes.
Mudança de layout vai em commit próprio (regra 14) e todo trabalho fica em
commit publicado no fim (regras 3 e 10).

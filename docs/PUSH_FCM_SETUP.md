# Ligar o push remoto (FCM) do Grana.

> **Estado em 07/09/2026 (fim do dia): a configuração está FEITA e
> verificada. Falta apenas uma build nova.** O autor pediu para segurar a
> build e soltar junto com as próximas melhorias, para não atualizar tantas
> vezes em pouco tempo. Enquanto essa build não sair, `push_tokens` continua
> vazia — isso é esperado, **não é mais um bug a investigar**.
>
> O que foi feito e conferido:
> - Projeto Firebase `granaponto` criado, app Android registrado com o pacote
>   `com.gabriouss.grana`.
> - `google-services.json` no repositório, e a chave de API dele restringida
>   no Google Cloud Console por pacote + SHA-1 do keystore do EAS
>   (`13:F8:38:A1:0E:86:72:04:1C:B9:F4:60:A6:70:20:30:DF:E5:1F:A7`).
> - `app.json` aponta `android.googleServicesFile`.
> - Chave de conta de serviço enviada ao EAS via `eas credentials` e
>   **verificada por consulta à API**: `googleServiceAccountKeyForFcmV1` saiu
>   de `null` para `firebase-adminsdk-fbsvc@granaponto.iam.gserviceaccount.com`
>   (projeto `granaponto`). A chave privada NÃO está no repositório.
>
> O que falta, em ordem: disparar uma build (o `google-services.json` só entra
> no APK em tempo de compilação), abrir o app uma vez no aparelho, e então
> rodar a verificação da seção "Depois" abaixo.

## Contexto histórico: por que o push nunca funcionou até aqui

Todo o backend já estava pronto e rodando há dias — o cron dispara a cada 5
minutos, a Edge Function `enviar-lembretes-habito` responde, as tabelas
`push_tokens` e `push_habit_deliveries` existem com RLS e as colunas das duas
janelas (`almoco_ativo`, `janela`) aplicadas. Faltava só a configuração do
Firebase, sem a qual `getExpoPushTokenAsync` sempre falhava no Android e
nenhum aparelho chegava a se cadastrar.

## Os passos que dependiam da conta Google e da Expo (já executados)

Ficam registrados porque serão necessários de novo se o projeto Firebase for
recriado, ou se alguém precisar repetir isso em outro ambiente.

### 1. Criar o app Android no Firebase

1. Abrir o [console do Firebase](https://console.firebase.google.com) e criar
   um projeto (ou reaproveitar um existente).
2. Adicionar um app **Android** com o nome de pacote exato:
   `com.gabriouss.grana`. Precisa ser idêntico ao `expo.android.package` do
   `app.json` — qualquer diferença faz o token nunca registrar.
3. Baixar o `google-services.json` gerado.

### 2. Colocar o arquivo no projeto

O repositório é **público** (`github.com/Gabriouss/Grana.`). O
`google-services.json` não guarda segredo de servidor — ele já viaja dentro
de todo APK —, mas commitá-lo num repositório público deixa a chave de API
colhível sem nem baixar o APK. Duas saídas, em ordem de preferência:

**a) Secret de arquivo no EAS (recomendado)**

```
npx eas-cli secret:create --scope project --name GOOGLE_SERVICES_JSON \
  --type file --value ./google-services.json
```

Isso exige trocar `app.json` por `app.config.js` para poder ler
`process.env.GOOGLE_SERVICES_JSON`. É a mudança mais invasiva das duas, então
vale fazer com calma e uma build de teste logo em seguida.

**b) Commitar o arquivo (mais simples)**

Colocar `google-services.json` na raiz de `grana-app/` e acrescentar uma
linha ao bloco `android` do `app.json`:

```json
"android": {
  "package": "com.gabriouss.grana",
  "googleServicesFile": "./google-services.json",
  ...
}
```

Se escolher esta, restringir a chave de API no Google Cloud Console
(APIs & Services → Credentials → a chave do Android → restringir por nome de
pacote e impressão digital SHA-1), senão ela fica livre para uso de
terceiros.

> **Atenção:** não adicione `googleServicesFile` ao `app.json` antes de o
> arquivo existir. Apontar para um arquivo ausente quebra a build.

### 3. Subir a credencial FCM v1 no EAS

```
npx eas-cli credentials --platform android
```

Escolher o perfil de build, depois **Google Service Account** → **Manage your
Google Service Account Key for Push Notifications (FCM V1)** → **Set up a
Google Service Account Key**. A chave sai do Firebase em
Configurações do projeto → Contas de serviço → Gerar nova chave privada.

O comando só existe em modo interativo (não tem `--non-interactive`), por
isso este passo não pode ser automatizado daqui.

## Depois: uma build e a verificação que sempre faltou

O `google-services.json` entra no APK em tempo de build, então é obrigatório
gerar uma build nova e **abrir o app uma vez no aparelho** para o primeiro
token se cadastrar.

A verificação decisiva, que nunca foi feita nas tentativas anteriores, é
confirmar que o token realmente chegou ao banco. Com um token de acesso do
Supabase:

```
curl -s -X POST "https://api.supabase.com/v1/projects/cjnuzfbvfuauvlzfoutv/database/query" \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"query":"select plataforma, ativo, almoco_ativo, timezone, horario_hora, horario_minuto from public.push_tokens;"}'
```

- Voltou vazio: o registro ainda está falhando. O app agora loga o motivo —
  `adb logcat | grep "\[push\]"` mostra a exceção real (desde `8b1fea4`, o
  `catch` deixou de ser silencioso).
- Voltou uma linha: o cadastro funcionou. A partir daí, conferir
  `push_habit_deliveries` depois do primeiro horário vencido (12h em dia
  útil, ou o horário escolhido em Perfil).

## Por que isso passou despercebido por tanto tempo

O `catch` em `lib/push-notifications.ts` engolia a exceção sem log, então um
push que nunca funcionou ficava indistinguível de um push desligado por
escolha do usuário. O bloqueio chegou a ser anotado no `context.md` em
04/09/2026 e nunca foi fechado. Corrigido em `8b1fea4`: a falha agora aparece
no log, e o lembrete local deixou de depender de qual tela abriu primeiro.

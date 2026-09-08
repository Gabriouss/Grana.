# Ligar o push remoto (FCM) do Grana.

Estado em 07/09/2026: **o push remoto nunca funcionou**. Todo o resto do
caminho está pronto e rodando — o cron dispara a cada 5 minutos, a Edge
Function `enviar-lembretes-habito` responde, as tabelas `push_tokens` e
`push_habit_deliveries` existem com RLS e as colunas das duas janelas
(`almoco_ativo`, `janela`) aplicadas. O que falta é só a configuração do
Firebase, sem a qual `getExpoPushTokenAsync` sempre falha no Android e
nenhum aparelho chega a se cadastrar.

Sintoma exato enquanto isso não for feito: `push_tokens` fica vazia,
`push_habit_deliveries` não recebe uma linha sequer, e os lembretes de almoço
e noite vivem apenas do agendamento local do aparelho.

## O que só o autor pode fazer

Estes três passos dependem da conta Google e da conta Expo — não há como
fazê-los por código.

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

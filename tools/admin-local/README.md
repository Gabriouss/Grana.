# Grana. Admin, o painel administrativo local

Painel para administrar o Grana. a partir deste computador: Supabase, Vercel,
EAS, GitHub, vendas da Cakto, estado do git e o marketing (documento,
aprovação, feed simulado, calendário, tráfego pago, acervo e design system).

Ele roda **só neste computador**. O servidor escuta em `127.0.0.1:4317`, que
nenhum outro aparelho da rede alcança, e não é publicado na Vercel, no EAS nem
em lugar nenhum.

## Como abrir

**Sempre pelo atalho Grana. Admin**, na Área de Trabalho, ou por
`scripts\abrir-painel.cmd`. O endereço é <http://127.0.0.1:4317/>, mas digitar
o endereço não basta: o atalho é quem pareia o navegador com o painel.

1. **Primeira vez:** o atalho abre um terminal e pede para criar a conta admin.
   Você escolhe a senha, e a tela mostra uma chave para cadastrar no app
   autenticador do celular (Google Authenticator, Microsoft Authenticator,
   1Password etc.). A conta só é gravada depois que o primeiro código do app
   confere.
2. O atalho sobe o servidor numa janela minimizada chamada "Grana. Admin" e
   abre o navegador já pareado.
3. Na tela do painel: **senha** e, em seguida, o **código de 6 dígitos** do app.

O login vence com 10 minutos sem uso e, de qualquer forma, 1 hora depois de
entrar. Redeploy e preparar build pedem o código do app de novo quando o
último código tem mais de 5 minutos. **Para desligar o painel, feche a janela
"Grana. Admin".**

Perdeu o celular ou trocou de app autenticador:
`node tools/admin-local/configurar-login.cjs --refazer-totp` (pede a senha
atual). Para recriar a conta inteira, `--refazer`. Não há recuperação pelo
navegador, de propósito.

O atalho sumiu? `scripts\abrir-painel.cmd --criar-atalho` cria de novo.

## Onde ficam os dados do painel

Em `%APPDATA%\grana-admin\`, fora do repositório, do EAS e do Google Drive. A
permissão da pasta fica só com o seu usuário do Windows.

| Arquivo | Conteúdo |
|---|---|
| `conta.json` | Usuário, hash scrypt da senha e segredo do autenticador |
| `bloqueio.json` | Contadores de tentativas erradas (o bloqueio sobrevive a reinício) |
| `pareamento-4317.txt` | Código de pareamento de uso único, apagado quando o painel desliga |
| `auditoria.log` | Uma linha por login, pareamento e ação, sem senha, código ou token |

## De onde vêm as credenciais das integrações

O servidor lê o `.env` da raiz do repositório com um parser próprio. Os valores
**ficam dentro do processo do servidor**: não vão para o navegador, para
resposta da API, para log nem para arquivo. A tela mostra só se cada integração
está `ok`, `ausente` (falta a variável) ou com `erro`.

| Integração | Variáveis usadas (só os nomes) | O que o painel faz |
|---|---|---|
| Supabase | `SUPABASE_ACCESS_TOKEN`, `EXPO_PUBLIC_SUPABASE_URL` | Lê projeto, Edge Functions e contagens por consultas SQL fixas, escritas no código |
| Vercel | `VERCEL_TOKEN` | Lê deployments e domínios; redeploy do último deployment de produção |
| EAS | login da CLI nesta máquina (`npx eas-cli login`) | Lista builds; prepara build sem disparar |
| GitHub | `GITHUB_TOKEN` (opcional, o repositório é público) | Lê releases do APK |
| Cakto | `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET` | Lê pedidos dos últimos 30 dias, agregados |
| Git | nenhuma | Lê branch, último commit e distância de `origin/main`, sem `fetch` |

Trocou um segredo no `.env`? Reinicie o painel (feche a janela e abra pelo atalho).

## O que o painel faz e o que ele não faz

Ações disponíveis, todas com frase de confirmação digitada na tela:

- **Redeploy de produção na Vercel** (`REDEPLOY`), só do último deployment de
  produção pronto. Preview nunca vai para produção por aqui.
- **Preparar build** (`PREPARAR BUILD`). Roda o mesmo script do
  `npm run build:preparar` (regra 5), que valida a nota, respeita o teto de 3
  builds por semana (regra 22) e sobe a versão do `app.json`. **O painel não
  dispara o `eas build`** (regra 4): ele devolve o comando pronto para colar no
  terminal. Se já houver um preparo não commitado (o `app.json` da pasta
  diferente do último commit), o painel recusa preparar outro.
- **Aprovar peça, pedir ajuste, planejar no calendário e editar campanha de
  tráfego.** Grava só arquivos em `docs/marketing/painel/`, que **vão para o
  GitHub público** no próximo commit. Por isso o painel recusa texto que
  pareça senha, token ou chave. Nada é publicado no Instagram nem enviado à Meta.

Fora do painel, de propósito: deploy de Edge Function e migration (regra 11),
SQL livre, comando livre, proxy para qualquer URL e leitura de arquivo fora das
pastas liberadas.

## Segurança, camada por camada

1. **Rede:** escuta só em `127.0.0.1` e derruba conexão que não venha da
   própria máquina.
2. **Host e origem:** só `127.0.0.1:4317` (e `localhost:4317`, que redireciona
   para ele). Outro nome recebe 421, Host duplicado recebe 400, `Origin` de outro
   site e `Sec-Fetch-Site: cross-site/same-site` recebem 403.
3. **Pareamento:** abrir a página não cria sessão. O servidor gera um código de
   uso único, que gira a cada 10 minutos e é gravado só na pasta protegida. O
   atalho abre o navegador com o código no fragmento (`#par=`), que o navegador
   nunca manda ao servidor nem grava em histórico de rede. Cinco códigos errados
   em 10 minutos bloqueiam o pareamento.
4. **Login:** senha com scrypt (N=131072, r=8, p=1) e código TOTP obrigatório
   (RFC 6238), com proteção contra reuso do mesmo código. A tela da senha nunca
   diz se ela está certa: o veredito sai só depois do código, com a mesma
   mensagem para os dois erros. Três erros bloqueiam por 30s, e o tempo dobra a
   cada erro até 24h, com contadores separados para senha e código, gravados
   em disco.
5. **Sessão:** cookie `HttpOnly; SameSite=Strict`, sem `Domain`, com id trocado
   no pareamento e no login. Morre com o servidor, com 10 minutos sem gesto da
   pessoa (consulta automática não conta) e 1 hora depois do login.
6. **Ações:** POST em JSON com `X-Grana-Admin: 1` e `X-CSRF-Token` ligado à
   sessão. Redeploy e preparar build exigem um código do app dos últimos
   5 minutos, no máximo 3 vezes em 10 minutos por ação. Gravações de marketing:
   30 por minuto. Corpo acima de 64 KB recebe 413.
7. **Arquivos:** só pastas e extensões enumeradas, com `realpath` contra junção.
   `..`, `:` (fluxo alternativo do NTFS), `\`, `//`, controle, nome reservado
   (`CON`, `NUL`...), nome curto `~1`, ponto ou espaço no fim e unicode que se
   normaliza para outro caractere são recusados. SVG, HTML e texto vindos do
   repositório saem em `Content-Security-Policy: sandbox`: nenhum script roda.
   Acervo e design system exigem login.
8. **Segredos:** toda resposta e todo log passam por um filtro que troca
   qualquer valor do `.env` (e tokens obtidos em tempo de execução) por
   `[oculto]`. Erro de provedor não carrega corpo de resposta.
9. **Cabeçalhos:** CSP sem script inline, `frame-ancestors 'none'`,
   `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, COOP e CORP
   `same-origin`, `Permissions-Policy` desligando câmera, microfone e
   localização, `no-store` na API.

O que esse desenho não cobre: alguém com controle do seu usuário do Windows.
Um programa malicioso rodando como você lê a pasta `%APPDATA%\grana-admin`.

## Variáveis do servidor (para teste)

| Variável | Efeito |
|---|---|
| `GRANA_ADMIN_PORTA=43xx` | Usa outra porta. O atalho sempre usa 4317. |
| `GRANA_ADMIN_SIMULAR=1` | Redeploy e preparar build só simulam: nada vai à Vercel e o `app.json` não muda. |
| `GRANA_ADMIN_RAIZ_DADOS=<pasta>` | Lê e grava o marketing numa cópia, sem tocar no `docs/marketing/painel/` real. |
| `GRANA_ADMIN_PASTA_CONTA=<pasta>` | Usa outra conta admin, outro pareamento e outra auditoria. |

## Arquivos

| Caminho | Papel |
|---|---|
| `server.cjs` | Servidor HTTP, estáticos, redirecionamento para a origem canônica |
| `seguranca.cjs` | Host, Origin, pareamento, sessão, CSRF, limites e lista de arquivos servidos |
| `autenticacao.cjs` | Senha (scrypt), TOTP, bloqueio progressivo |
| `configurar-login.cjs` | Cadastro da conta no terminal |
| `auditoria.cjs` | Log local de auditoria |
| `config.cjs` | Leitura do `.env` e ocultação de valores |
| `rotas.cjs` | Rotas da API, camadas de autorização, montagem do marketing |
| `adaptadores/*.cjs` | Uma integração por arquivo, com prazo de 15s (90s para a CLI do EAS) |
| `marketing/*.cjs` | Catálogo, aprovações, calendário e tráfego |
| `web/` | Interface |
| `../../scripts/abrir-painel.cmd` | Lançador, pareamento e criação do atalho |

## API

Envelope: `{ ok: true, dados, atualizadoEm }` ou `{ ok: false, erro: { codigo, mensagem, tentarEmSeg? } }`.
Todo pedido leva `X-Grana-Admin: 1`, menos `/api/saude`.

- Sessão: `GET /api/sessao`, `POST /api/parear`, `POST /api/login`, `POST /api/login/totp`,
  `POST /api/sessao/renovar`, `POST /api/sair`. Contrato detalhado com o front em
  `E:/Grana-temporarios/2026-10-07-admin-panel/INTERFACE-login-anvil-keel.md`.
- Leitura (login completo): `/api/visao-geral`, `/api/supabase/{resumo,funcoes,migrations,app-release}`,
  `/api/vercel/{deployments,projeto}`, `/api/eas/builds`, `/api/github/releases`,
  `/api/cakto/resumo`, `/api/git/estado`, `/api/design-system`,
  `/api/marketing/{pecas,feed,documento,calendario?mes=AAAA-MM,trafego}`.
  `?atualizar=1` ignora o cache curto, no máximo 6 vezes por minuto.
- Ações (`POST`, login completo + CSRF): `/api/marketing/pecas/:id/{aprovar,ajuste}`,
  `/api/marketing/calendario`, `/api/marketing/trafego`, `/api/vercel/redeploy`,
  `/api/eas/preparar-build`.

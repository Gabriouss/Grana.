# Grana. Admin, o painel administrativo local

Painel para administrar o Grana. a partir deste computador: Supabase, Vercel,
EAS, GitHub, vendas da Cakto, estado do git e o marketing (documento,
aprovação, feed simulado, calendário, tráfego pago, acervo e design system).

Ele roda **só neste computador**. O servidor escuta em `127.0.0.1:4317`, que
nenhum outro aparelho da rede alcança, e não é publicado na Vercel, no EAS nem
em lugar nenhum.

## Como abrir

- **Atalho:** dois cliques em **Grana. Admin**, na Área de Trabalho.
- **Pelo terminal:** `scripts\abrir-painel.cmd`.
- **Endereço:** <http://localhost:4317/>.

O lançador confere se o painel já está no ar. Se estiver, só abre o navegador.
Se não estiver, sobe o servidor numa janela minimizada chamada "Grana. Admin" e
abre o navegador quando ele responder. **Para desligar o painel, feche essa
janela.** Se a porta 4317 estiver ocupada por outro programa, o lançador avisa e
não encerra nada.

O atalho sumiu? `scripts\abrir-painel.cmd --criar-atalho` cria de novo.

Sem o lançador: `node tools/admin-local/server.cjs`.

## De onde vêm as credenciais

O servidor lê o `.env` da raiz do repositório com um parser próprio. Os valores
**ficam dentro do processo do servidor**: não vão para o navegador, para
resposta da API, para log nem para arquivo. A tela mostra só se cada integração
está `ok`, `ausente` (falta a variável) ou com `erro`.

| Integração | Variáveis usadas (só os nomes) | O que o painel faz |
|---|---|---|
| Supabase | `SUPABASE_ACCESS_TOKEN`, `EXPO_PUBLIC_SUPABASE_URL` | Lê projeto, Edge Functions e contagens por consultas SQL fixas, escritas no código |
| Vercel | `VERCEL_TOKEN` | Lê deployments e domínios; redeploy de produção com confirmação |
| EAS | login da CLI nesta máquina (`npx eas-cli login`) | Lista builds; prepara build sem disparar |
| GitHub | `GITHUB_TOKEN` (opcional, o repositório é público) | Lê releases do APK |
| Cakto | `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET` | Lê pedidos dos últimos 30 dias, agregados |
| Git | nenhuma | Lê branch, último commit e distância de `origin/main`, sem `fetch` |

Trocou um segredo no `.env`? Reinicie o painel (feche a janela e abra pelo atalho).

## O que o painel faz e o que ele não faz

Ações disponíveis, todas com frase de confirmação digitada na tela:

- **Redeploy de produção na Vercel** (`REDEPLOY`), só de um dos 15 últimos
  deployments do projeto do Grana.
- **Preparar build** (`PREPARAR BUILD`). Roda o mesmo script do
  `npm run build:preparar` (regra 5), que valida a nota, respeita o teto de 3
  builds por semana (regra 22) e sobe a versão do `app.json`. **O painel não
  dispara o `eas build`** (regra 4): ele devolve o comando pronto para colar no
  terminal. Depois do preparo o `app.json` mudou e precisa ser commitado.
- **Aprovar peça, pedir ajuste, planejar no calendário e editar campanha de
  tráfego.** Tudo isso grava só arquivos locais em `docs/marketing/painel/`.
  Nada é publicado no Instagram nem enviado à Meta.

Fora do painel, de propósito:

- **Deploy de Edge Function e migration.** A regra 11 exige comparar a produção
  com o histórico e baixar o que está no ar antes. A tela de funções mostra essa
  comparação para ajudar, mas a publicação continua pelo terminal.
- SQL livre, comando livre, proxy para qualquer URL e leitura de arquivo fora
  das pastas liberadas.

## Segurança

- Escuta só em `127.0.0.1`, e recusa conexão que não venha da própria máquina.
- Aceita só os endereços `localhost:4317` e `127.0.0.1:4317`. Qualquer outro
  nome recebe 421, o que barra um site externo que tente se passar pelo painel
  (DNS rebinding).
- `Origin` de outro site recebe 403.
- Toda ação é `POST` em JSON, com o cabeçalho `X-Grana-Admin: 1`, o cookie de
  sessão (`HttpOnly`, `SameSite=Strict`, emitido ao abrir a página) e o
  `X-CSRF-Token` ligado a essa sessão (`GET /api/sessao`). Formulário de outro
  site não consegue mandar nada disso.
- CSP restrita, sem script nem fonte de fora. `Cache-Control: no-store` na API.
- Arquivos servidos só de `tools/admin-local/web/`, das pastas `marca`,
  `tokens`, `pagina`, `previews` e `marketing-mockups` do `design-system/`, de
  `design-system/TOM_DE_VOZ.md`, de `assets/fonts/` e das mídias de
  `docs/marketing/`. `..`, caminho absoluto, arquivo oculto, `.env*` e atalho
  que aponte para fora são recusados.
- Do comprador e do usuário, sai só o e-mail mascarado (`g***@gmail.com`).

O que esse desenho não cobre: alguém com acesso a este computador. A proteção
é contra outro aparelho da rede e contra site aberto no navegador.

## Variáveis do servidor

| Variável | Efeito |
|---|---|
| `GRANA_ADMIN_PORTA=43xx` | Usa outra porta (para teste em paralelo). O lançador sempre usa 4317. |
| `GRANA_ADMIN_SIMULAR=1` | Redeploy e preparar build só simulam: nada vai à Vercel e o `app.json` não muda. |

## Arquivos

| Caminho | Papel |
|---|---|
| `server.cjs` | Servidor HTTP, estáticos e despacho para a API |
| `seguranca.cjs` | Host, Origin, sessão, CSRF, cabeçalhos e lista de arquivos servidos |
| `config.cjs` | Leitura do `.env` e ocultação de valores |
| `rotas.cjs` | Rotas da API e montagem dos módulos de marketing |
| `adaptadores/*.cjs` | Uma integração por arquivo, com prazo de 15s (90s para a CLI do EAS) |
| `marketing/*.cjs` | Catálogo, aprovações, calendário e tráfego |
| `web/` | Interface |
| `../../scripts/abrir-painel.cmd` | Lançador e criação do atalho |

## API

Envelope: `{ ok: true, dados, atualizadoEm }` ou `{ ok: false, erro: { codigo, mensagem } }`.
Acrescente `?atualizar=1` para ignorar o cache curto (30 a 60s) das leituras externas.

Leitura: `/api/saude`, `/api/sessao`, `/api/visao-geral`, `/api/supabase/resumo`,
`/api/supabase/funcoes`, `/api/supabase/migrations`, `/api/supabase/app-release`,
`/api/vercel/deployments`, `/api/vercel/projeto`, `/api/eas/builds`,
`/api/github/releases`, `/api/cakto/resumo`, `/api/git/estado`,
`/api/design-system`, `/api/marketing/pecas`, `/api/marketing/feed`,
`/api/marketing/documento`, `/api/marketing/calendario?mes=AAAA-MM`,
`/api/marketing/trafego`.

Ações (`POST`): `/api/marketing/pecas/:id/aprovar`, `/api/marketing/pecas/:id/ajuste`,
`/api/marketing/calendario`, `/api/marketing/trafego`, `/api/vercel/redeploy`,
`/api/eas/preparar-build`.

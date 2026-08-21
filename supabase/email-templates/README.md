# Templates de e-mail de autenticação

O Supabase não versiona os templates de e-mail junto com o schema — eles vivem
só no painel (Authentication → Email Templates). Estes arquivos são a fonte
de verdade em texto; sempre que editar um template no painel, atualize o
arquivo correspondente aqui também, pra não haver divergência entre o que
está em produção e o que o repositório documenta.

## Como aplicar

1. https://supabase.com/dashboard/project/cjnuzfbvfuauvlzfoutv/auth/templates
2. Escolha o tipo de template (a lista à esquerda).
3. Cole o conteúdo do arquivo correspondente no editor HTML.
4. Ajuste o campo "Subject heading" com o assunto sugerido no comentário do
   topo do arquivo.
5. Save.

| Template no painel | Arquivo                | Assunto sugerido                          |
|---------------------|-------------------------|---------------------------------------------|
| Confirm signup       | `confirmar-email.html`  | Confirme seu e-mail para usar o Grana.      |
| Reset Password        | `redefinir-senha.html`  | Defina uma nova senha para o Grana.         |

Os outros tipos (Invite user, Magic Link, Change Email Address,
Reauthentication) ficam com o padrão do Supabase — nenhum fluxo do app usa
convite, magic link, troca de e-mail ou reautenticação hoje. Se algum desses
entrar em uso, criar o arquivo aqui antes de mexer no painel.

## Por que a fonte da marca não aparece

Clientes de e-mail (Gmail, Outlook, Apple Mail) bloqueiam `@font-face` quase
universalmente — não tem como carregar Neue Machina. O corpo do e-mail usa
uma pilha de fontes de sistema (`-apple-system, Segoe UI, Roboto...`).

## O logotipo no cabeçalho

O SVG do logotipo (`components/BrandLogotype.tsx`) não pode ir direto no
e-mail — SVG inline não renderiza de forma confiável fora do navegador
(Outlook desktop, sobretudo, ignora). Em vez disso,
`public/email/grana-logo.png` é o mesmo path e gradiente renderizados num
navegador e recortados em PNG, já sobre o fundo do cartão (`#0b2d35`) pra
colar sem costura. A pasta `public/` é copiada literalmente pro `dist/` no
export web (`npx expo export --platform web`), então o arquivo fica
publicado em `https://granaponto.com.br/email/grana-logo.png` — mesmo
domínio do app, sem precisar de um bucket de Storage à parte.

Se o logotipo do componente mudar, regenerar o PNG e trocar o arquivo aqui.

Muitos clientes de e-mail bloqueiam imagem remota até a pessoa clicar em
"mostrar imagens" — por isso o `<img>` sempre leva `alt="Grana."`, que é o
que aparece nesse meio-tempo.

## Por que o remetente continua "Supabase Auth"

O template controla o CONTEÚDO do e-mail, não quem aparece como remetente.
Isso é decidido pelo servidor de envio: no SMTP compartilhado que o Supabase
usa por padrão no plano Free, o nome do remetente é fixo e não editável.
Trocar por "Grana." exige configurar um SMTP próprio em Project Settings →
Authentication → SMTP Settings — funciona no Free Plan, só depende de um
provedor de envio externo (ver conversa da sessão de 21/08/2026 pra contexto
da recomendação).

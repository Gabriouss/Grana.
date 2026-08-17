// Grana. — página pública de instruções de exclusão de dados.
// É o que a Meta pede no campo "Exclusão de dados do usuário -> URL de
// instruções de exclusão de dados" nas Configurações do app. O Grana. já
// tem exclusão de conta self-service (Perfil -> Excluir conta), então esta
// página só documenta esse caminho — não implementa o callback automático
// de exclusão (a outra opção que a Meta oferece), que não é necessário
// enquanto o self-service já cobre o pedido.
//
// Deploy: supabase functions deploy data-deletion --no-verify-jwt
// URL pública: https://cjnuzfbvfuauvlzfoutv.supabase.co/functions/v1/data-deletion

const HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Exclusão de dados — Grana.</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    padding: 2.5rem 1.25rem 4rem;
    background: #fbfaf7;
    color: #0d2b30;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.6;
  }
  main { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .atualizado { color: #6b7a7d; font-size: 0.85rem; margin-bottom: 2rem; }
  h2 { font-size: 1.05rem; margin-top: 2rem; border-top: 1px solid #e2ded4; padding-top: 1.25rem; }
  p, li { font-size: 0.92rem; }
  ol, ul { padding-left: 1.2rem; }
  a { color: #0b6b74; }
  .passo { background: #efece3; border-radius: 8px; padding: 1rem 1.25rem; margin: 1rem 0; }
  @media (prefers-color-scheme: dark) {
    body { background: #0d1b1d; color: #eef2f0; }
    .atualizado { color: #9fb0b3; }
    h2 { border-top-color: #24393c; }
    .passo { background: #17282a; }
  }
</style>
</head>
<body>
<main>
  <h1>Como excluir seus dados do Grana.</h1>
  <p class="atualizado">Última atualização: 17 de agosto de 2026</p>

  <p>
    Você pode excluir permanentemente sua conta e todos os dados associados a ela a
    qualquer momento, de duas formas.
  </p>

  <h2>Opção 1 — Direto no aplicativo (recomendado)</h2>
  <div class="passo">
    <ol>
      <li>Abra o Grana. e entre na sua conta;</li>
      <li>Vá em <strong>Perfil</strong>;</li>
      <li>Toque em <strong>Excluir conta</strong>;</li>
      <li>Confirme sua senha quando solicitado.</li>
    </ol>
  </div>
  <p>A exclusão é imediata e definitiva. Não é possível desfazer.</p>

  <h2>Opção 2 — Por e-mail</h2>
  <p>
    Se você não tiver mais acesso ao aplicativo, envie um e-mail para
    <a href="mailto:gbr.design30@gmail.com">gbr.design30@gmail.com</a> a partir do endereço
    cadastrado na sua conta, pedindo a exclusão. Vamos confirmar sua identidade e excluir os
    dados em até 15 dias.
  </p>

  <h2>O que é excluído</h2>
  <ul>
    <li>Sua conta de login (e-mail e senha);</li>
    <li>Todos os lançamentos, contas a pagar, orçamentos e categorias personalizadas;</li>
    <li>Foto de perfil e nome de exibição;</li>
    <li>Vínculo com o WhatsApp, se houver.</li>
  </ul>
  <p>
    Nada fica retido após a exclusão — não mantemos cópias de backup dos dados apagados.
    Mais detalhes sobre quais dados coletamos e por quê estão na nossa
    <a href="https://cjnuzfbvfuauvlzfoutv.supabase.co/functions/v1/privacy-policy">Política de Privacidade</a>.
  </p>
</main>
</body>
</html>`;

Deno.serve(() => {
  return new Response(HTML, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});

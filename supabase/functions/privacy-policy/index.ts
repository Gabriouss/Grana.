// Grana. — página pública de Política de Privacidade.
//
// Existe como Edge Function (em vez de um arquivo estático em algum host à
// parte) porque precisava de uma URL pública, estável e HTTPS o quanto antes
// — a Meta exige uma ao ativar o app do WhatsApp ("Ao vivo"), e a Play Store
// vai exigir o mesmo na hora da submissão (ver eas.json → submit). Servir a
// partir do mesmo projeto Supabase evita depender de mais uma conta/host só
// pra isso.
//
// Deploy: supabase functions deploy privacy-policy --no-verify-jwt
// URL pública: https://cjnuzfbvfuauvlzfoutv.supabase.co/functions/v1/privacy-policy
//
// O conteúdo é texto fixo (sem dado de usuário nenhum) — se a lista de dados
// coletados mudar (nova tabela, novo campo sensível, novo terceiro
// integrado), atualize o HTML abaixo e rode o deploy de novo.

const HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Política de Privacidade — Grana.</title>
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
  ul { padding-left: 1.2rem; }
  a { color: #0b6b74; }
  code { background: #efece3; padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.85em; }
  @media (prefers-color-scheme: dark) {
    body { background: #0d1b1d; color: #eef2f0; }
    .atualizado { color: #9fb0b3; }
    h2 { border-top-color: #24393c; }
    code { background: #17282a; }
  }
</style>
</head>
<body>
<main>
  <h1>Política de Privacidade — Grana.</h1>
  <p class="atualizado">Última atualização: 17 de agosto de 2026</p>

  <p>
    Grana. é um aplicativo de controle financeiro pessoal. Esta política explica quais
    dados o aplicativo coleta, para que servem, com quem podem ser compartilhados e como
    você pode acessá-los, corrigi-los ou excluí-los, em conformidade com a Lei Geral de
    Proteção de Dados (LGPD — Lei nº 13.709/2018).
  </p>

  <h2>1. Quem é o responsável pelos dados</h2>
  <p>
    O Grana. é desenvolvido e operado de forma independente. Dúvidas, solicitações sobre
    seus dados ou pedidos de exclusão podem ser enviados para
    <a href="mailto:gbr.design30@gmail.com">gbr.design30@gmail.com</a>.
  </p>

  <h2>2. Quais dados coletamos</h2>
  <ul>
    <li><strong>Conta:</strong> e-mail e senha (a senha nunca é armazenada em texto puro — a autenticação é feita pelo Supabase Auth).</li>
    <li><strong>Perfil:</strong> nome de exibição e, opcionalmente, uma foto de perfil.</li>
    <li><strong>Dados financeiros que você registra:</strong> lançamentos (descrição, valor, categoria, data), contas a pagar, orçamentos por categoria e categorias personalizadas. Esses dados existem só para o app funcionar — o Grana. não tem finalidade de análise de crédito, publicidade ou repasse a terceiros para fins comerciais.</li>
    <li><strong>Vínculo de WhatsApp (opcional):</strong> se você ativar o lançamento por WhatsApp, guardamos o número de telefone informado e um código de pareamento temporário, usados só para confirmar que aquele número é seu.</li>
    <li><strong>Dados técnicos mínimos:</strong> identificador interno da conta e horários de criação/atualização dos seus registros, para o funcionamento normal do banco de dados.</li>
  </ul>
  <p>
    O bloqueio do app por biometria/senha do aparelho (quando ativado) é verificado
    inteiramente pelo sistema operacional do seu celular — o Grana. não recebe nem
    armazena nenhum dado biométrico.
  </p>

  <h2>3. Para que usamos esses dados</h2>
  <ul>
    <li>Exibir seus lançamentos, contas, orçamentos e o diagnóstico financeiro dentro do próprio app.</li>
    <li>Enviar lembretes de vencimento de contas (notificações geradas e agendadas no próprio aparelho).</li>
    <li>Permitir o registro de lançamentos por voz, por texto colado ou pelo WhatsApp, quando você opta por usar esses recursos.</li>
    <li>Manter sua sessão conectada com segurança entre usos do app.</li>
  </ul>
  <p>Não usamos seus dados para publicidade, não os vendemos e não fazemos perfilamento para terceiros.</p>

  <h2>4. Com quem os dados são compartilhados</h2>
  <ul>
    <li><strong>Supabase</strong> (banco de dados, autenticação e armazenamento de arquivos) — infraestrutura que hospeda todos os dados descritos acima.</li>
    <li><strong>Meta / WhatsApp Cloud API</strong> — somente se você vincular um número de WhatsApp: as mensagens que você envia para registrar lançamentos passam pela API oficial da Meta até chegarem ao nosso servidor.</li>
    <li><strong>OpenAI (Whisper)</strong> — somente para transcrever mensagens de áudio enviadas pelo WhatsApp, quando esse canal está em uso. O áudio é enviado só para a transcrição e não é retido por nós após o processamento.</li>
  </ul>
  <p>Nenhum desses terceiros recebe mais dados do que o estritamente necessário para a função específica descrita.</p>

  <h2>5. Por quanto tempo guardamos seus dados</h2>
  <p>
    Seus dados ficam armazenados enquanto sua conta existir. Você pode excluir a conta a
    qualquer momento diretamente no app (Perfil → Excluir conta), o que apaga
    permanentemente seus lançamentos, contas, orçamentos, categorias e vínculo de
    WhatsApp, sem necessidade de contato prévio.
  </p>

  <h2>6. Seus direitos (LGPD, art. 18)</h2>
  <p>Você pode, a qualquer momento:</p>
  <ul>
    <li>Confirmar a existência e acessar os dados que temos sobre você;</li>
    <li>Corrigir dados incompletos, inexatos ou desatualizados (editando-os diretamente no app);</li>
    <li>Solicitar a exclusão de dados desnecessários ou excessivos;</li>
    <li>Excluir sua conta e todos os dados associados, pelo próprio app ou pelo e-mail de contato acima;</li>
    <li>Solicitar informações sobre com quem seus dados são compartilhados.</li>
  </ul>

  <h2>7. Segurança</h2>
  <p>
    O acesso aos seus dados no banco é restrito por políticas de Row Level Security — cada
    conta só enxerga os próprios dados, mesmo internamente. No aparelho, a sessão de login
    é armazenada de forma criptografada, e capturas de tela são bloqueadas nas telas com
    informação financeira.
  </p>

  <h2>8. Crianças e adolescentes</h2>
  <p>O Grana. não é direcionado a menores de 18 anos e não coleta intencionalmente dados de crianças.</p>

  <h2>9. Alterações desta política</h2>
  <p>
    Podemos atualizar este documento quando o app ganhar novas funcionalidades que
    envolvam dados pessoais. A data no topo desta página sempre reflete a versão vigente.
  </p>

  <h2>10. Contato</h2>
  <p>
    Para qualquer solicitação relacionada aos seus dados pessoais:
    <a href="mailto:gbr.design30@gmail.com">gbr.design30@gmail.com</a>.
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

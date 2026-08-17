// Grana. — página pública de Termos de Serviço.
// Mesma lógica do privacy-policy: Edge Function pública porque precisa de
// uma URL HTTPS estável, e a Meta exige uma pra manter o app "Ao vivo".
//
// Deploy: supabase functions deploy terms-of-service --no-verify-jwt
// URL pública: https://cjnuzfbvfuauvlzfoutv.supabase.co/functions/v1/terms-of-service

const HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Termos de Serviço — Grana.</title>
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
  @media (prefers-color-scheme: dark) {
    body { background: #0d1b1d; color: #eef2f0; }
    .atualizado { color: #9fb0b3; }
    h2 { border-top-color: #24393c; }
  }
</style>
</head>
<body>
<main>
  <h1>Termos de Serviço — Grana.</h1>
  <p class="atualizado">Última atualização: 17 de agosto de 2026</p>

  <p>
    Estes Termos regem o uso do Grana., um aplicativo de controle financeiro pessoal. Ao
    criar uma conta ou usar o aplicativo, você concorda com o que está descrito aqui. Para
    saber quais dados coletamos e como os tratamos, veja também a nossa
    <a href="https://cjnuzfbvfuauvlzfoutv.supabase.co/functions/v1/privacy-policy">Política de Privacidade</a>.
  </p>

  <h2>1. O que é o Grana.</h2>
  <p>
    O Grana. é uma ferramenta de organização financeira pessoal: registro de lançamentos,
    contas a pagar, orçamentos por categoria e um diagnóstico gerado a partir desses dados.
    O aplicativo não é uma instituição financeira, não movimenta dinheiro de verdade, não
    processa pagamentos e não oferece consultoria de investimentos. Tudo que ele mostra é
    um reflexo do que você mesmo registra — a exatidão dos números depende do que é
    informado.
  </p>

  <h2>2. Sua conta</h2>
  <ul>
    <li>Você precisa ter 18 anos ou mais para usar o Grana.</li>
    <li>Você é responsável por manter sua senha em sigilo e por tudo que acontecer na sua conta.</li>
    <li>As informações fornecidas (e-mail, nome) devem ser verdadeiras.</li>
    <li>Você pode excluir sua conta a qualquer momento, direto no app (Perfil → Excluir conta) — isso apaga permanentemente seus dados, de forma irreversível.</li>
  </ul>

  <h2>3. Uso aceitável</h2>
  <p>Ao usar o Grana., você concorda em não:</p>
  <ul>
    <li>Tentar acessar dados de outras contas ou burlar as proteções do aplicativo;</li>
    <li>Usar o canal de lançamento por WhatsApp para enviar conteúdo abusivo, spam ou tentar sobrecarregar o serviço;</li>
    <li>Usar o aplicativo para qualquer finalidade ilegal.</li>
  </ul>
  <p>Contas que violem isso podem ser suspensas ou encerradas.</p>

  <h2>4. Recursos que dependem de terceiros</h2>
  <p>
    Alguns recursos (lançamento por WhatsApp e transcrição de áudio) dependem de serviços de
    terceiros — Meta (WhatsApp Cloud API) e OpenAI (Whisper). Interrupções, mudanças de
    política ou indisponibilidade desses serviços podem afetar esses recursos específicos
    sem que isso dependa de nós.
  </p>

  <h2>5. Sem garantias</h2>
  <p>
    O Grana. é fornecido "como está". Fazemos o possível para manter o serviço no ar e os
    dados corretos, mas não garantimos disponibilidade contínua nem ausência total de erros
    — inclusive nas heurísticas automáticas de categorização e leitura de valores (por
    texto, voz ou WhatsApp), que são estimativas e podem errar. Revise os lançamentos
    importantes antes de tomar decisões financeiras com base neles.
  </p>

  <h2>6. Limitação de responsabilidade</h2>
  <p>
    Na máxima medida permitida por lei, o Grana. não se responsabiliza por decisões
    financeiras tomadas com base nas informações do aplicativo, nem por perdas indiretas
    decorrentes do uso ou da indisponibilidade do serviço.
  </p>

  <h2>7. Alterações</h2>
  <p>
    Podemos atualizar estes Termos quando o aplicativo mudar de forma relevante. A data no
    topo desta página sempre reflete a versão vigente.
  </p>

  <h2>8. Contato</h2>
  <p>
    Dúvidas sobre estes Termos: <a href="mailto:gbr.design30@gmail.com">gbr.design30@gmail.com</a>.
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

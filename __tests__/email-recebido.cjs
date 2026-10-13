/* Encaminhamento dos e-mails recebidos em @granaponto.com.br (Edge Function
 * `email-recebido`). Roda o MÓDULO REAL, transpilado em memória e executado em
 * `vm` com `Deno`, `fetch` e o relógio dublados. As asserções olham QUAIS
 * chamadas à Resend aconteceram, porque cada POST /emails é um e-mail na caixa
 * do autor: assinatura inválida não pode chamar nada, e falha temporária não
 * pode enviar aviso de falha.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const nodeCrypto = require('node:crypto');
const ts = require('typescript');
const assert = require('node:assert/strict');

const ARQ = 'supabase/functions/email-recebido/index.ts';
const SEGREDO_BRUTO = Buffer.from('segredo-ficticio-de-teste-0123456789');
const SEGREDO = 'whsec_' + SEGREDO_BRUTO.toString('base64');
const AGORA = 1_760_000_000_000;

function assinar(id, carimbo, corpo) {
  return 'v1,' + nodeCrypto.createHmac('sha256', SEGREDO_BRUTO).update(`${id}.${carimbo}.${corpo}`).digest('base64');
}

function carregar({ env = {}, rotas }) {
  const chamadas = [];
  let handler;
  const fetch = async (url, init = {}) => {
    const chamada = { url, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : null };
    chamadas.push(chamada);
    const r = rotas(chamada);
    if (r instanceof Error) throw r;
    return new Response(r.bytes ?? JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  };
  const codigo = ts.transpileModule(fs.readFileSync(ARQ, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const ambiente = {
    RESEND_API_KEY: 'chave-ficticia', RESEND_WEBHOOK_SECRET: SEGREDO, EMAIL_ENCAMINHAR_PARA: 'caixa@exemplo.com', ...env,
  };
  vm.runInNewContext(codigo, {
    exports: {},
    require: (nome) => {
      if (nome !== '../_shared/seguranca.ts') throw new Error('import inesperado: ' + nome);
      return { timingSafeEqual: (a, b) => a.length === b.length && nodeCrypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)) };
    },
    Deno: { env: { get: (k) => ambiente[k] }, serve: (fn) => { handler = fn; } },
    fetch, crypto: globalThis.crypto, atob, btoa, TextEncoder, Uint8Array, AbortController,
    setTimeout, clearTimeout, Response, JSON, String, Number, Math, Array, Error, console: { error: () => {} },
    Date: { now: () => AGORA },
  });
  return { chamadas, chamar: (req) => handler(req) };
}

function pedido(evento, { carimbo = String(AGORA / 1000), assinatura } = {}) {
  const corpo = JSON.stringify(evento);
  const id = 'msg_teste_1';
  return new Request('https://x/functions/v1/email-recebido', {
    method: 'POST',
    headers: { 'svix-id': id, 'svix-timestamp': carimbo, 'svix-signature': assinatura ?? assinar(id, carimbo, corpo) },
    body: corpo,
  });
}

const RECEBIDO = { type: 'email.received', data: { email_id: 'abc12345-0000-4000-8000-000000000001', from: 'Cliente <cliente@exemplo.org>', to: ['suporte@granaponto.com.br'], subject: 'Dúvida' } };
const EMAIL = {
  from: 'Maria Silva <maria@exemplo.org>', to: ['Suporte <SUPORTE@granaponto.com.br>'], subject: 'Dúvida na fatura',
  html: '<p>Olá</p>', text: 'Olá', attachments: [{ id: 'a1', size: 3 }, { id: 'a2', size: 5 }],
};
const ANEXOS = { data: [
  { filename: 'nota.pdf', content_type: 'application/pdf', content_disposition: 'attachment', size: 3, download_url: 'https://dl/a1' },
  { filename: 'logo.png', content_type: 'image/png', content_disposition: 'inline', content_id: 'logo', size: 5, download_url: 'https://dl/a2' },
] };
const ID = RECEBIDO.data.email_id;

function rotasOk(extra = {}) {
  return (c) => {
    if (c.url.endsWith(`/emails/receiving/${ID}`)) return extra.email ?? { json: EMAIL };
    if (c.url.includes(`/emails/receiving/${ID}/attachments`)) return extra.anexos ?? { json: ANEXOS };
    if (c.url === 'https://dl/a1') return { bytes: new Uint8Array([1, 2, 3]) };
    if (c.url === 'https://dl/a2') throw new Error('anexo inline não deveria ser baixado');
    if (c.url.endsWith('/emails') && c.method === 'POST') return extra.envio?.(c) ?? { json: { id: 'enviado' } };
    throw new Error('rota inesperada ' + c.url);
  };
}

(async () => {
  // 1. Assinatura errada, carimbo velho e configuração ausente: nenhuma chamada.
  for (const [nome, req, env, status] of [
    ['assinatura errada', pedido(RECEBIDO, { assinatura: 'v1,AAAA' }), {}, 401],
    ['carimbo de 10 min atrás', pedido(RECEBIDO, { carimbo: String(AGORA / 1000 - 600) }), {}, 401],
    ['sem segredo configurado', pedido(RECEBIDO), { RESEND_WEBHOOK_SECRET: '' }, 500],
  ]) {
    const f = carregar({ env, rotas: rotasOk() });
    const r = await f.chamar(req);
    assert.equal(r.status, status, nome);
    assert.equal(f.chamadas.length, 0, `${nome}: não pode chamar a Resend`);
  }

  // 2. Assinatura com várias versões no cabeçalho (rotação de segredo) passa.
  {
    const f = carregar({ rotas: (c) => { throw new Error('não chama: ' + c.url); } });
    const corpo = JSON.stringify({ type: 'email.sent', data: {} });
    const carimbo = String(AGORA / 1000);
    const r = await f.chamar(new Request('https://x', { method: 'POST', body: corpo, headers: {
      'svix-id': 'msg_teste_1', 'svix-timestamp': carimbo, 'svix-signature': `v1,AAAA ${assinar('msg_teste_1', carimbo, corpo)}`,
    } }));
    assert.equal(r.status, 200, 'evento de outro tipo é ignorado com 200');
    assert.equal(f.chamadas.length, 0);
  }

  // 3. Caminho feliz: suporte@, anexo comum encaminhado, inline não baixado.
  {
    const f = carregar({ rotas: rotasOk() });
    const r = await f.chamar(pedido(RECEBIDO));
    assert.equal(r.status, 200);
    const envios = f.chamadas.filter((c) => c.method === 'POST');
    assert.equal(envios.length, 1, 'um e-mail encaminhado, nem mais nem menos');
    const e = envios[0];
    assert.equal(e.headers['Idempotency-Key'], `encaminhar/${ID}`);
    assert.equal(e.body.from, 'Grana. suporte <suporte@granaponto.com.br>');
    assert.doesNotMatch(e.body.from, /Maria|exemplo\.org/, 'remetente original no From pareceu phishing para a Resend (12/10/2026)');
    assert.deepEqual(e.body.to, ['caixa@exemplo.com']);
    assert.deepEqual(e.body.reply_to, ['Maria Silva <maria@exemplo.org>'], 'responder vai para o cliente, não para suporte@');
    assert.equal(e.body.subject, 'Dúvida na fatura');
    assert.match(e.body.html, /^<p [^>]*>Recebido em suporte@granaponto\.com\.br, de Maria Silva &lt;maria@exemplo\.org&gt;\.<\/p><p>Olá<\/p>$/);
    assert.deepEqual(e.body.attachments, [{ filename: 'nota.pdf', content: Buffer.from([1, 2, 3]).toString('base64'), content_type: 'application/pdf' }]);
  }

  // 4. Reply-To do cliente tem prioridade; caixa desconhecida vira contato@.
  {
    const f = carregar({ rotas: rotasOk({ email: { json: { ...EMAIL, to: ['outro@granaponto.com.br'], reply_to: ['resp@exemplo.org'], attachments: [], subject: '' } } }) });
    await f.chamar(pedido(RECEBIDO));
    const e = f.chamadas.find((c) => c.method === 'POST').body;
    assert.equal(e.from, 'Grana. contato <contato@granaponto.com.br>');
    assert.deepEqual(e.reply_to, ['resp@exemplo.org']);
    assert.equal(e.subject, '(sem assunto)');
    assert.ok(!f.chamadas.some((c) => c.url.includes('/attachments')), 'sem anexo, não lista anexos');
  }

  // 4b. marketing@ só envia: sozinho é descartado, acompanhado vai pela outra caixa.
  {
    const f = carregar({ rotas: rotasOk({ email: { json: { ...EMAIL, to: ['marketing@granaponto.com.br'], attachments: [] } } }) });
    const r = await f.chamar(pedido(RECEBIDO));
    assert.equal(r.status, 200);
    assert.equal(f.chamadas.filter((c) => c.method === 'POST').length, 0, 'marketing@ sozinho não chega na caixa do autor');
  }
  {
    const f = carregar({ rotas: rotasOk({ email: { json: { ...EMAIL, to: ['marketing@granaponto.com.br'], cc: ['suporte@granaponto.com.br'], attachments: [] } } }) });
    await f.chamar(pedido(RECEBIDO));
    assert.match(f.chamadas.find((c) => c.method === 'POST').body.from, /^Grana\. suporte <suporte@/);
  }

  // 4c. admin@ é caixa própria, não cai em contato@.
  {
    const f = carregar({ rotas: rotasOk({ email: { json: { ...EMAIL, to: ['admin@granaponto.com.br'], attachments: [] } } }) });
    await f.chamar(pedido(RECEBIDO));
    assert.equal(f.chamadas.find((c) => c.method === 'POST').body.from, 'Grana. admin <admin@granaponto.com.br>');
  }

  // 5. Anexos grandes demais: encaminha sem eles e avisa no topo.
  {
    const grande = { json: { data: [{ ...ANEXOS.data[0], size: 30 * 1024 * 1024, download_url: 'https://dl/grande' }] } };
    const f = carregar({ rotas: rotasOk({ anexos: grande }) });
    assert.equal((await f.chamar(pedido(RECEBIDO))).status, 200);
    const e = f.chamadas.find((c) => c.method === 'POST').body;
    assert.deepEqual(e.attachments, []);
    assert.match(e.text, /grandes demais para encaminhar/);
    assert.ok(!f.chamadas.some((c) => c.url === 'https://dl/grande'), 'não baixa o que não vai mandar');
  }

  // 6. Resend fora do ar ao ler: 500 para a Resend repetir, e nenhum envio.
  {
    const f = carregar({ rotas: rotasOk({ email: { status: 503, json: { erro: 1 } } }) });
    assert.equal((await f.chamar(pedido(RECEBIDO))).status, 500);
    assert.equal(f.chamadas.filter((c) => c.method === 'POST').length, 0, 'falha temporária não manda aviso');
  }

  // 7. Rede caindo no meio do envio: também temporária.
  {
    const f = carregar({ rotas: rotasOk({ envio: () => new Error('rede') }) });
    assert.equal((await f.chamar(pedido(RECEBIDO))).status, 500);
  }

  // 8. Envio recusado de vez (422): manda o recibo de falha, com chave própria.
  {
    let n = 0;
    const f = carregar({ rotas: rotasOk({ envio: () => (++n === 1 ? { status: 422, json: { message: 'inválido' } } : { json: { id: 'aviso' } }) }) });
    const r = await f.chamar(pedido(RECEBIDO));
    assert.equal(r.status, 200);
    const envios = f.chamadas.filter((c) => c.method === 'POST');
    assert.equal(envios.length, 2, 'tentativa + aviso de falha');
    assert.equal(envios[1].headers['Idempotency-Key'], `falha/${ID}`);
    assert.match(envios[1].body.subject, /^Falha ao encaminhar: Dúvida$/);
    assert.match(envios[1].body.text, /Para: suporte@granaponto\.com\.br/);
    assert.match(envios[1].body.text, /painel da Resend/);
  }

  // 9. Aviso de falha também falhando: 500, para a Resend tentar de novo.
  {
    const f = carregar({ rotas: rotasOk({ envio: () => ({ status: 422, json: {} }) }) });
    assert.equal((await f.chamar(pedido(RECEBIDO))).status, 500);
  }

  // 10. id fora do formato não vira URL.
  {
    const f = carregar({ rotas: rotasOk() });
    const r = await f.chamar(pedido({ type: 'email.received', data: { email_id: '../../domains' } }));
    assert.equal(r.status, 400);
    assert.equal(f.chamadas.length, 0);
  }

  console.log('email-recebido: assinatura, encaminhamento, anexos, retry e recibo de falha OK; Resend somente dublê');
})().catch((e) => { console.error(e); process.exit(1); });

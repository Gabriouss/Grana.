/* Tradução do webhook da Cakto para a forma neutra de assinatura.
 *
 * Roda os MÓDULOS REAIS (`_shared/cakto.ts` e `_shared/normalizar-webhook.ts`),
 * transpilados em memória e executados em `vm` — eles são Deno e não carregam
 * no Node. Testar uma cópia passaria mesmo com a produção errada, que é o erro
 * que `__tests__/sync-parser.js` existe para impedir.
 *
 * O payload base segue o exemplo da documentação oficial da Cakto
 * ("Pagamento Recorrente"), com segredo fictício de teste: se o formato deles mudar, é aqui
 * que se descobre, e não em produção com alguém sem acesso.
 *
 * Contexto de risco, registrado porque molda o que se testa: a Cakto manda o
 * segredo DENTRO do corpo, e não reenvia evento nenhum. Um evento mal
 * traduzido é um evento perdido para sempre.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

function carregar(caminho, requireStub) {
  const api = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(caminho, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    { exports: api, console, Date, JSON, String, Set, require: requireStub ?? (() => ({})) }
  );
  return api;
}

const helpers = carregar('supabase/functions/_shared/normalizar-webhook.ts');
const cakto = carregar('supabase/functions/_shared/cakto.ts', (nome) => {
  if (!nome.includes('normalizar-webhook')) throw new Error('import inesperado: ' + nome);
  return helpers;
});

/* Exemplo da documentação da Cakto, com segredo fictício de teste. */
const BASE = {
  secret: 'SEGREDO_FICTICIO_APENAS_PARA_TESTE',
  event: 'purchase_approved',
  data: {
    id: '1f1c81d2-088a-412d-8bb7-3d5269d64f58',
    refId: '6HngVo6',
    customer: { name: 'Tulio sabino', email: 'Tokipi8246@GameBcs.com', phone: '5534991462388', docNumber: '59089477098' },
    offer: { id: 'jbwjmis', name: 'Subscription [Stg]', price: 5 },
    product: { name: 'Grana. Completo', id: 'f947c21c-d8f0-41a1-a0a6-fede9f27b3b7', short_id: '6dRMZ6z', type: 'subscription' },
    parent_order: 'PEtfqq3',
    subscription: {
      id: 'd464132a-fcfa-4693-a6aa-a99483f06740',
      status: 'active',
      amount: '5.00',
      paymentMethod: 'credit_card',
      next_payment_date: '2025-04-08T14:43:39.724743-03:00',
      createdAt: '2025-04-08T14:41:42.247628-03:00',
      canceledAt: null,
    },
    status: 'paid',
    amount: 5,
    paymentMethod: 'credit_card',
    paidAt: '2025-04-08T14:43:43.575271-03:00',
    createdAt: '2025-04-08T14:43:43.022292-03:00',
  },
};

const clone = (extra = {}, dataExtra = {}) => ({
  ...BASE, ...extra,
  data: { ...BASE.data, ...dataExtra },
});

let falhas = 0;
let total = 0;
function checar(rotulo, obtido, esperado) {
  total++;
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) {
    falhas++;
    console.log(`FALHA  [${rotulo}]\n  obtido:   ${JSON.stringify(obtido)}\n  esperado: ${JSON.stringify(esperado)}`);
  }
}

// ---- o caminho principal: cobrança aprovada de assinatura ----
const aprovado = cakto.normalizarEventoCakto(BASE);
checar('tipo', aprovado.type, 'approved');
checar('id do pedido', aprovado.orderId, '1f1c81d2-088a-412d-8bb7-3d5269d64f58');
checar('id da assinatura', aprovado.subscriptionId, 'd464132a-fcfa-4693-a6aa-a99483f06740');
checar('plano vem do produto, não da oferta', aprovado.plan, 'Grana. Completo');
// E-mail entra minúsculo porque a coluna compara com o e-mail da conta.
checar('e-mail normalizado', aprovado.email, 'tokipi8246@gamebcs.com');
// A Cakto manda com fuso -03:00; a coluna é timestamptz e espera UTC.
checar('data do evento em UTC', aprovado.eventAt, '2025-04-08T17:43:43.575Z');
checar('acesso até a próxima cobrança, em UTC', aprovado.accessUntil, '2025-04-08T17:43:39.724Z');
/* Id de evento montado aqui: a Cakto não manda um. Precisa ser estável para a
   deduplicação não depender do hash do payload, que muda a cada campo novo. */
checar('id do evento é evento:pedido', aprovado.eventId, 'purchase_approved:1f1c81d2-088a-412d-8bb7-3d5269d64f58');

// ---- demais eventos que mexem em acesso ----
checar('renovação', cakto.normalizarEventoCakto(clone({ event: 'subscription_renewed' })).type, 'renewed');
checar('reembolso', cakto.normalizarEventoCakto(clone({ event: 'refund' })).type, 'refunded');
checar('chargeback', cakto.normalizarEventoCakto(clone({ event: 'chargeback' })).type, 'chargeback');

/* No cancelamento a Cakto zera `next_payment_date` e preenche `canceledAt`.
   Quem decide o fim do acesso é a função do banco, não este tradutor. */
const cancelado = cakto.normalizarEventoCakto(clone({ event: 'subscription_canceled' }, {
  paidAt: null,
  subscription: { ...BASE.data.subscription, status: 'canceled', next_payment_date: null, canceledAt: '2025-04-10T09:00:00.000000-03:00' },
}));
checar('cancelamento', cancelado.type, 'canceled');
checar('cancelamento usa canceledAt como data', cancelado.eventAt, '2025-04-10T12:00:00.000Z');
checar('cancelamento não promete acesso futuro', cancelado.accessUntil, null);

/* Recusa só vira atraso quando é RENOVAÇÃO. Recusa de primeira compra não pode
   criar assinatura fantasma para quem nunca pagou. */
checar('recusa com assinatura vira atraso', cakto.normalizarEventoCakto(clone({ event: 'purchase_refused' })).type, 'late');
const recusaAvulsa = clone({ event: 'purchase_refused' });
delete recusaAvulsa.data.subscription;
checar('recusa sem assinatura é ignorada', cakto.normalizarEventoCakto(recusaAvulsa), null);

// ---- eventos que não mexem em acesso ----
for (const evento of ['pix_gerado', 'boleto_gerado', 'picpay_gerado', 'checkout_abandonment']) {
  checar(`"${evento}" é ignorado`, cakto.normalizarEventoCakto(clone({ event: evento })), null);
}
checar('evento desconhecido é ignorado', cakto.normalizarEventoCakto(clone({ event: 'algo_novo_deles' })), null);
checar('payload sem evento é ignorado', cakto.normalizarEventoCakto({ secret: 'x', data: {} }), null);

/* ---- a data do evento tem que ser a DO EVENTO ----
 *
 * `processar_evento_assinatura` descarta evento mais antigo que o ultimo
 * processado, como desatualizado. Ler `paidAt` num reembolso entregaria a data
 * do pagamento ORIGINAL, o evento seria considerado velho e ignorado calado: o
 * dinheiro voltava e o acesso continuava de pe.
 *
 * Os nomes de campo abaixo vieram do modelo exibido no painel da Cakto, que
 * traz `refundedAt`, `chargedbackAt` e `canceledAt` no nivel de `data` — coisa
 * que o exemplo da documentacao publica nao mostrava. */
const PAGO_EM = '2026-06-26T12:00:00.000000+00:00';
const DEPOIS = '2026-07-10T09:30:00.000000+00:00';

const reembolso = cakto.normalizarEventoCakto(clone({ event: 'refund' }, {
  paidAt: PAGO_EM, refundedAt: DEPOIS,
}));
checar('reembolso usa refundedAt, não paidAt', reembolso.eventAt, '2026-07-10T09:30:00.000Z');

const estorno = cakto.normalizarEventoCakto(clone({ event: 'chargeback' }, {
  paidAt: PAGO_EM, chargedbackAt: DEPOIS,
}));
checar('chargeback usa chargedbackAt', estorno.eventAt, '2026-07-10T09:30:00.000Z');

const cancelaTopo = cakto.normalizarEventoCakto(clone({ event: 'subscription_canceled' }, {
  paidAt: PAGO_EM, canceledAt: DEPOIS,
}));
checar('cancelamento usa canceledAt do nível de data', cancelaTopo.eventAt, '2026-07-10T09:30:00.000Z');

// Aprovação continua usando a data do pagamento, que é a correta para ela.
checar('aprovação segue usando paidAt', cakto.normalizarEventoCakto(clone({}, { paidAt: PAGO_EM })).eventAt, '2026-06-26T12:00:00.000Z');

/* O modelo do painel traz `subscription: null` para produto de pagamento
   único. Não pode derrubar a leitura: o id do pedido sustenta o evento. */
const semAssinatura = cakto.normalizarEventoCakto(clone({}, { subscription: null }));
checar('subscription nula não quebra', semAssinatura.type, 'approved');
checar('subscription nula deixa o id nulo', semAssinatura.subscriptionId, null);
checar('subscription nula não promete acesso', semAssinatura.accessUntil, null);
checar('subscription nula mantém o id do pedido', semAssinatura.orderId, '1f1c81d2-088a-412d-8bb7-3d5269d64f58');

/* ---- plano ANUAL: o acesso não pode encolher para 92 dias ----
 *
 * `processar_evento_assinatura` cai num padrão de 92 dias quando o provedor não
 * manda `next_payment_date`. Esse número foi escolhido quando só existia plano
 * mensal. Numa assinatura anual significaria receber doze meses e cortar o
 * acesso em tres — o cliente paga e fica sem, sem erro em lugar nenhum.
 *
 * Por isso, faltando a data, o periodo e derivado de `recurrence_period`, que a
 * Cakto documenta como o intervalo em DIAS entre cobrancas. */
const semData = (recurrence, extra = {}) => clone(extra, {
  subscription: { ...BASE.data.subscription, next_payment_date: null, recurrence_period: recurrence },
});

// Anual: 365 dias a partir do pagamento (08/04/2025 17:43 UTC -> 08/04/2026).
checar('anual sem data explícita usa recurrence_period',
  cakto.normalizarEventoCakto(semData(365)).accessUntil, '2026-04-08T17:43:43.575Z');

// Mensal: mesma regra, 30 dias.
checar('mensal sem data explícita usa recurrence_period',
  cakto.normalizarEventoCakto(semData(30)).accessUntil, '2025-05-08T17:43:43.575Z');

// A data explícita continua mandando quando existe.
checar('next_payment_date vence recurrence_period',
  cakto.normalizarEventoCakto(clone({}, {
    subscription: { ...BASE.data.subscription, recurrence_period: 365 },
  })).accessUntil, '2025-04-08T17:43:39.724Z');

/* Valor absurdo do provedor não pode virar acesso perpétuo, e valor ausente ou
   inválido devolve a decisão para o banco em vez de inventar data. */
for (const ruim of [5000, 0, -30, null, 'anual']) {
  checar(`recurrence_period inválido (${JSON.stringify(ruim)}) não inventa data`,
    cakto.normalizarEventoCakto(semData(ruim)).accessUntil, null);
}

/* Só evento que ESTENDE acesso ganha data derivada. Cancelamento e reembolso
   não podem receber acesso futuro por dedução. */
for (const [evento, rotulo] of [['subscription_canceled', 'cancelamento'], ['refund', 'reembolso'], ['chargeback', 'chargeback']]) {
  checar(`${rotulo} não ganha acesso futuro por dedução`,
    cakto.normalizarEventoCakto(semData(365, { event: evento })).accessUntil, null);
}

// Renovação anual também estende.
checar('renovação anual estende',
  cakto.normalizarEventoCakto(semData(365, { event: 'subscription_renewed' })).accessUntil, '2026-04-08T17:43:43.575Z');

// ---- validação do segredo ----
const comparar = (a, b) => a === b;
const SEGREDO = 'SEGREDO_FICTICIO_APENAS_PARA_TESTE';
checar('segredo correto', cakto.segredoCaktoValido(BASE, SEGREDO, comparar), true);
checar('segredo errado', cakto.segredoCaktoValido(clone({ secret: 'outro' }), SEGREDO, comparar), false);
checar('segredo ausente', cakto.segredoCaktoValido({ event: 'purchase_approved' }, SEGREDO, comparar), false);
checar('segredo vazio no payload', cakto.segredoCaktoValido(clone({ secret: '' }), SEGREDO, comparar), false);
/* Sem segredo configurado do nosso lado, NADA passa — senão um deploy sem a
   variável aceitaria qualquer requisição da internet como venda aprovada. */
checar('sem segredo configurado, recusa tudo', cakto.segredoCaktoValido(BASE, '', comparar), false);

// ---- livro-razão de cobrança (B2, 15/10/2026) ----
/* Valor e origem de cada evento, para contar receita por período. Nomes de
   campo do pedido na API pública da Cakto; ainda não vistos num webhook real. */
const pedidoCompleto = clone({}, {
  baseAmount: 29.9, discount: '5.00', fees: 2.49, amount: 24.9, installments: 1,
  couponCode: 'BEMVINDO', utm_source: 'instagram', utm_medium: 'reels', utm_campaign: 'r13',
  utm_term: null, utm_content: '', sck: 'bio',
});
const evAprov = cakto.normalizarEventoCakto(pedidoCompleto);
const linha = cakto.linhaCobrancaCakto(pedidoCompleto, evAprov, evAprov.eventId);
checar('livro: provedor', linha.provider, 'cakto');
checar('livro: id do evento igual ao da assinatura', linha.event_id, 'purchase_approved:1f1c81d2-088a-412d-8bb7-3d5269d64f58');
checar('livro: tipo', linha.event_type, 'approved');
checar('livro: data do evento em UTC', linha.event_at, '2025-04-08T17:43:43.575Z');
checar('livro: valores', [linha.valor_bruto, linha.desconto, linha.taxas, linha.valor], [29.9, 5, 2.49, 24.9]);
checar('livro: moeda', linha.moeda, 'BRL');
checar('livro: pedido pai e assinatura', [linha.parent_order_id, linha.subscription_id], ['PEtfqq3', 'd464132a-fcfa-4693-a6aa-a99483f06740']);
checar('livro: compra aprovada é primeira compra', linha.primeira_compra, true);
/* Cupom, UTM e sck ficam fora do livro (revisão do Watchtower, 16/10/2026):
   texto livre que pode conter dado pessoal. Ver cobranca-eventos-lgpd.cjs. */
checar('livro: sem cupom, UTM nem sck', Object.keys(linha).filter((k) => /utm|cupom|sck/.test(k)), []);
checar('livro: oferta, produto, método, parcelas',
  [linha.oferta_id, linha.produto_id, linha.metodo_pagamento, linha.parcelas],
  ['jbwjmis', 'f947c21c-d8f0-41a1-a0a6-fede9f27b3b7', 'credit_card', 1]);
/* Nenhum dado pessoal entra no livro: nome, e-mail, telefone e documento do
   comprador estão no payload e não podem aparecer em campo nenhum. */
const textoDaLinha = JSON.stringify(linha).toLowerCase();
for (const pessoal of ['tulio', 'tokipi8246', '5534991462388', '59089477098']) {
  checar(`livro: sem dado pessoal (${pessoal.slice(0, 4)}…)`, textoDaLinha.includes(pessoal), false);
}
checar('livro: nenhuma chave de dado pessoal', Object.keys(linha).filter((k) => /mail|nome|name|phone|telefone|doc|cpf|endereco|address/.test(k)), []);

const renov = cakto.normalizarEventoCakto(clone({ event: 'subscription_renewed' }));
checar('livro: renovação não é primeira compra', cakto.linhaCobrancaCakto(clone({ event: 'subscription_renewed' }), renov, renov.eventId).primeira_compra, false);

/* Valor ausente ou lixo vira nulo, nunca erro: a Cakto não reenvia. */
const semValor = clone({}, { amount: 'abc', baseAmount: undefined, fees: { x: 1 }, discount: true, installments: 99 });
const evSem = cakto.normalizarEventoCakto(semValor);
const linhaSem = cakto.linhaCobrancaCakto(semValor, evSem, evSem.eventId);
checar('livro: valor inválido vira nulo, sem inventar a partir de outro campo', [linhaSem.valor_bruto, linhaSem.desconto, linhaSem.taxas, linhaSem.valor], [null, null, null, null]);
const soAssinatura = clone({}, { amount: undefined });
const evSo = cakto.normalizarEventoCakto(soAssinatura);
checar('livro: sem amount no pedido usa o da assinatura', cakto.linhaCobrancaCakto(soAssinatura, evSo, evSo.eventId).valor, 5);
checar('livro: parcelas fora da faixa vira nulo', linhaSem.parcelas, null);
checar('livro: valor absurdo vira nulo', cakto.linhaCobrancaCakto(clone({}, { amount: 1e9 }), evAprov, 'x').valor, null);

/* O webhook grava o livro sem bloquear a assinatura, e a migration deixa a
   tabela só para o servidor e só para inserção. Checagem de texto. */
const fonteWebhook = fs.readFileSync('supabase/functions/cakto-webhook/index.ts', 'utf8');
const sqlLivroBruto = fs.readFileSync('supabase/migrations/20261015233000_cobranca_eventos.sql', 'utf8');
const posLivro = fonteWebhook.indexOf(".rpc('registrar_cobranca_evento'");
const posAssinatura = fonteWebhook.indexOf("rpc('processar_evento_assinatura'");
checar('webhook: grava o livro DEPOIS da assinatura aceitar o evento', posLivro > posAssinatura && posAssinatura > 0, true);
checar('webhook: só grava o livro para evento novo (reenvio duplicate não recria a linha)', /if \(data !== 'duplicate'\) \{[\s\S]{0,200}rpc\('registrar_cobranca_evento'/.test(fonteWebhook), true);
checar('webhook: o livro não é escrito direto na tabela (só pela função, sob a trava da exclusão)', /from\('cobranca_eventos'\)/.test(fonteWebhook), false);
checar('migration: livro idempotente pelo id do evento', /on conflict \(provider, event_id\) do nothing/.test(sqlLivroBruto), true);
const trechoLivro = fonteWebhook.slice(posLivro - 200, fonteWebhook.indexOf("if (data === 'subscription_not_found')"));
checar('webhook: falha do livro não devolve resposta (não bloqueia o acesso)', /return resposta/.test(trechoLivro), false);
checar('webhook: falha do livro deixa log', (trechoLivro.match(/livro-razão NÃO gravado/g) || []).length, 2);
checar('webhook: o corpo nunca vai para o log do livro', /console\.error\([^)]*(rawBody|body\b)/.test(trechoLivro), false);

const migLivro = fs.readdirSync('supabase/migrations').find((f) => /_cobranca_eventos\.sql$/.test(f));
const sqlLivro = migLivro ? fs.readFileSync(`supabase/migrations/${migLivro}`, 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase() : '';
checar('migration do livro existe', Boolean(migLivro), true);
checar('migration: chave única provider + event_id', sqlLivro.includes('unique (provider, event_id)'), true);
checar('migration: RLS ligada', sqlLivro.includes('alter table public.cobranca_eventos enable row level security'), true);
checar('migration: revoga tudo de todos os papéis da API, inclusive o herdado', sqlLivro.includes('revoke all on table public.cobranca_eventos from public, anon, authenticated, service_role'), true);
checar('migration: nenhuma política aberta', /create policy/.test(sqlLivro), false);
checar('migration: só inserção (gatilho barra update e delete)', /before update or delete on public\.cobranca_eventos/.test(sqlLivro), true);
checar('migration: sem coluna de dado pessoal', /\b(email|e_mail|nome|telefone|phone|documento|cpf|endereco)\b/.test(sqlLivro.replace(/comment on table[^;]*;/, '')), false);
/* Toda coluna gravada pelo webhook existe na tabela, senão o insert falha
   em produção e só o log percebe. */
for (const chave of Object.keys(linha)) {
  checar(`migration tem a coluna gravada "${chave}"`, new RegExp(`\\b${chave} `).test(sqlLivro), true);
}

console.log(`\n${total - falhas}/${total} checagens do webhook da Cakto passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);

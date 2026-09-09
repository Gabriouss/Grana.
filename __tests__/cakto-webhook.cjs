/* Tradução do webhook da Cakto para a forma neutra de assinatura.
 *
 * Roda os MÓDULOS REAIS (`_shared/cakto.ts` e `_shared/normalizar-webhook.ts`),
 * transpilados em memória e executados em `vm` — eles são Deno e não carregam
 * no Node. Testar uma cópia passaria mesmo com a produção errada, que é o erro
 * que `__tests__/sync-parser.js` existe para impedir.
 *
 * O payload base é o exemplo LITERAL da documentação oficial da Cakto
 * ("Pagamento Recorrente"), não um inventado: se o formato deles mudar, é aqui
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

/* Exemplo literal da documentação da Cakto. */
const BASE = {
  secret: '8402b43f-c839-4090-bbd1-186725d185c7',
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

// ---- validação do segredo ----
const comparar = (a, b) => a === b;
const SEGREDO = '8402b43f-c839-4090-bbd1-186725d185c7';
checar('segredo correto', cakto.segredoCaktoValido(BASE, SEGREDO, comparar), true);
checar('segredo errado', cakto.segredoCaktoValido(clone({ secret: 'outro' }), SEGREDO, comparar), false);
checar('segredo ausente', cakto.segredoCaktoValido({ event: 'purchase_approved' }, SEGREDO, comparar), false);
checar('segredo vazio no payload', cakto.segredoCaktoValido(clone({ secret: '' }), SEGREDO, comparar), false);
/* Sem segredo configurado do nosso lado, NADA passa — senão um deploy sem a
   variável aceitaria qualquer requisição da internet como venda aprovada. */
checar('sem segredo configurado, recusa tudo', cakto.segredoCaktoValido(BASE, '', comparar), false);

console.log(`\n${total - falhas}/${total} checagens do webhook da Cakto passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);

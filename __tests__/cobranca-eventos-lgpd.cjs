// B2 / revisão do Watchtower (16/10/2026, item 4 bloqueado): o livro-razão de
// cobrança não pode guardar atribuição de marketing em texto livre, e os IDs que
// ligam a venda à pessoa precisam de um caminho restrito para sair.
//
// 1. `linhaCobrancaCakto` REAL com sentinela de e-mail em cupom, UTM e sck.
// 2. A migration REAL num Postgres embutido: o gatilho continua barrando
//    alteração e exclusão, e só aceita a anonimização feita por
//    `anonimizar_cobranca_eventos`, que só o servidor executa.
// 3. `delete-account/index.ts` REAL com cliente dublado: anonimiza o livro antes
//    de apagar a conta, tolera a migration ainda não aplicada (PGRST202) e barra
//    a exclusão em qualquer outra falha.
// Nada de rede, banco real nem segredo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const raiz = path.join(__dirname, '..');
let passou = 0;
const ok = (c, nome) => { assert.ok(c, nome); passou++; };
const transpilar = (f) => ts.transpileModule(fs.readFileSync(path.join(raiz, f), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function carregar(f, req = () => ({})) {
  const api = {};
  vm.runInNewContext(transpilar(f), { exports: api, console, Date, JSON, String, Set, setTimeout, clearTimeout, Uint8Array, TextDecoder, TextEncoder, Response, Error, Promise, Number, Math, crypto, require: req });
  return api;
}

// ---- 1. a linha não leva atribuição de marketing ----
const helpers = carregar('supabase/functions/_shared/normalizar-webhook.ts');
const cakto = carregar('supabase/functions/_shared/cakto.ts', () => helpers);
const SENTINELA = 'sentinela.audit@exemplo.invalid';
const body = {
  secret: 'x', event: 'purchase_approved',
  data: {
    id: 'pedido-AUDIT', status: 'paid', paidAt: '2026-10-16T12:00:00Z', amount: 24.9, baseAmount: 29.9,
    customer: { email: 'comprador@exemplo.invalid' }, subscription: { id: 'assinatura-AUDIT' },
    couponCode: SENTINELA, utm_source: SENTINELA, utm_medium: SENTINELA, utm_campaign: SENTINELA,
    utm_term: SENTINELA, utm_content: SENTINELA, sck: SENTINELA,
  },
};
const evento = cakto.normalizarEventoCakto(body);
ok(evento && evento.type === 'approved', 'fixture vira evento aprovado');
const linha = cakto.linhaCobrancaCakto(body, evento, evento.eventId);
ok(!JSON.stringify(linha).includes(SENTINELA), 'nenhum campo de atribuição chega ao livro (sentinela ausente)');
ok(Object.keys(linha).filter((k) => /utm|cupom|sck/.test(k)).length === 0, 'a linha não tem chave de cupom, UTM nem sck');
ok(linha.valor === 24.9 && linha.valor_bruto === 29.9, 'os valores continuam no livro');

// ---- 2. migration real ----
(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;`);
    const sql = fs.readFileSync(path.join(raiz, 'supabase/migrations/20261015233000_cobranca_eventos.sql'), 'utf8');
    await db.exec(sql);
    const cols = (await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name='cobranca_eventos'`)).rows.map((r) => r.column_name);
    ok(!cols.some((c) => /utm|cupom|sck/.test(c)), 'a tabela não tem coluna de cupom, UTM nem sck');
    for (const chave of Object.keys(linha)) ok(cols.includes(chave), `toda coluna gravada pelo webhook existe: ${chave}`);

    await db.exec(`insert into public.cobranca_eventos (provider, event_id, event_type, event_at, order_id, parent_order_id, subscription_id, valor)
      values ('cakto', 'purchase_approved:pedido-AUDIT', 'approved', now(), 'pedido-AUDIT', 'pai-AUDIT', 'assinatura-AUDIT', 24.90),
             ('cakto', 'e2', 'renewed', now(), 'outro-AUDIT', null, 'outra-assinatura', 24.90)`);
    const E1 = `event_id='purchase_approved:pedido-AUDIT'`;
    const recusa = async (q, nome) => {
      let codigo = null;
      try { await db.exec(q); } catch (e) { codigo = e.code; }
      ok(codigo === '42501', `${nome} é recusado (${codigo})`);
    };
    await recusa(`delete from public.cobranca_eventos where ${E1}`, 'DELETE');
    await recusa(`update public.cobranca_eventos set valor = 1 where ${E1}`, 'UPDATE de valor');
    await recusa(`update public.cobranca_eventos set subscription_id = null, order_id = null, parent_order_id = null where ${E1}`, 'tirar IDs sem marcar anonimizado_em');
    await recusa(`update public.cobranca_eventos set subscription_id = null, order_id = null, parent_order_id = null, event_id = 'anonimizado:' || id::text, anonimizado_em = now(), valor = 0 where ${E1}`, 'anonimizar mudando o valor junto');
    await recusa(`update public.cobranca_eventos set subscription_id = null, order_id = null, parent_order_id = null, anonimizado_em = now() where ${E1}`, 'anonimizar deixando o código do pedido no event_id');
    await recusa(`update public.cobranca_eventos set subscription_id = null, order_id = null, parent_order_id = null, event_id = md5('pedido-AUDIT'), anonimizado_em = now() where ${E1}`, 'trocar o event_id por outra forma do código (hash)');

    const pode = async (papel, priv) => (await db.query(`select has_function_privilege($1, 'public.anonimizar_cobranca_eventos(text[],text[])', $2) as p`, [papel, priv])).rows[0].p;
    ok(!(await pode('anon', 'EXECUTE')) && !(await pode('authenticated', 'EXECUTE')), 'anon e authenticated não executam a anonimização');
    ok(await pode('service_role', 'EXECUTE'), 'service_role executa a anonimização');
    ok(!(await db.query(`select has_table_privilege('service_role','public.cobranca_eventos','UPDATE') as p`)).rows[0].p, 'service_role não ganha UPDATE direto na tabela');

    const n = (await db.query(`select public.anonimizar_cobranca_eventos(array['assinatura-AUDIT'], null) as n`)).rows[0].n;
    ok(n === 1, `anonimiza só a linha da assinatura pedida (${n})`);
    const [a, b] = (await db.query(`select * from public.cobranca_eventos order by id`)).rows;
    ok(a.order_id === null && a.parent_order_id === null && a.subscription_id === null && a.anonimizado_em !== null, 'IDs saem e anonimizado_em registra quando');
    ok(a.event_id === `anonimizado:${a.id}`, `o event_id vira anonimizado:<id da linha> (${a.event_id})`);
    ok(!/pedido-AUDIT|pai-AUDIT|assinatura-AUDIT/.test(JSON.stringify(a)), 'nenhum resíduo do pedido, do pai ou da assinatura em coluna NENHUMA da linha');
    ok(Number(a.valor) === 24.9 && a.event_type === 'approved' && a.event_at !== null && a.recebido_em !== null, 'valor, tipo e datas ficam');
    ok(b.subscription_id === 'outra-assinatura' && b.anonimizado_em === null && b.event_id === 'e2', 'a linha de outra pessoa não é tocada');
    ok((await db.query(`select public.anonimizar_cobranca_eventos(array['assinatura-AUDIT'], array['pedido-AUDIT']) as n`)).rows[0].n === 0, 'repetir não altera nada');
    await recusa(`update public.cobranca_eventos set anonimizado_em = now() where id = ${a.id}`, 'regravar anonimizado_em');
    ok((await db.query(`select public.anonimizar_cobranca_eventos(null, array['outro-AUDIT']) as n`)).rows[0].n === 1, 'também anonimiza pelo ID do pedido');
  } finally {
    await db.close();
  }

  // ---- 3. delete-account real ----
  async function excluir({ erroRpc = null, assinaturas = [{ provider_subscription_id: 'assinatura-AUDIT', provider_order_id: 'pedido-AUDIT' }] } = {}) {
    const chamadas = [];
    let handler;
    const admin = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'u-AUDIT' } }, error: null }),
        admin: { deleteUser: async (id) => { chamadas.push(['deleteUser', id]); return { error: null }; } },
      },
      storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ error: null }) }) },
      from: (tabela) => {
        if (tabela === 'subscriptions') {
          return { select: () => ({ eq: async (col, v) => { chamadas.push(['subscriptions', col, v]); return { data: assinaturas, error: null }; } }) };
        }
        if (tabela === 'feedbacks') return { update: () => ({ eq: async () => { chamadas.push(['feedbacks']); return { error: null }; } }) };
        throw new Error('tabela inesperada: ' + tabela);
      },
      rpc: async (nome, args) => { chamadas.push(['rpc', nome, args]); return { data: 1, error: erroRpc }; },
    };
    const silencioso = { ...console, warn: () => {}, error: () => {} };
    vm.runInNewContext(transpilar('supabase/functions/delete-account/index.ts'), {
      exports: {}, console: silencioso, Response, JSON, Object, Error, String,
      Deno: { env: { get: (k) => ({ SUPABASE_URL: 'https://t.invalid', SUPABASE_SERVICE_ROLE_KEY: 'chave-ficticia' })[k] }, serve: (fn) => { handler = fn; } },
      require: (id) => {
        if (id.startsWith('npm:@supabase/supabase-js')) return { createClient: () => admin };
        if (id.endsWith('reautenticacao.ts')) return { sessaoReautenticouRecentemente: () => true };
        throw new Error('import inesperado: ' + id);
      },
    });
    const resp = await handler(new Request('https://t.invalid/delete-account', { method: 'POST', headers: { Authorization: 'Bearer tok' } }));
    return { status: resp.status, chamadas };
  }

  const normal = await excluir();
  const iRpc = normal.chamadas.findIndex((c) => c[0] === 'rpc');
  const iDel = normal.chamadas.findIndex((c) => c[0] === 'deleteUser');
  ok(normal.status === 200, `exclusão normal completa (${normal.status})`);
  ok(iRpc >= 0 && iRpc < iDel, 'anonimiza o livro ANTES de apagar a conta');
  ok(JSON.stringify(normal.chamadas[iRpc]) === JSON.stringify(['rpc', 'anonimizar_cobranca_eventos', { p_subscription_ids: ['assinatura-AUDIT'], p_order_ids: ['pedido-AUDIT'] }]), 'manda os IDs da assinatura da própria conta');
  ok(normal.chamadas.some((c) => c[0] === 'subscriptions' && c[1] === 'user_id' && c[2] === 'u-AUDIT'), 'lê só as assinaturas da conta que pede a exclusão');

  const semAssinatura = await excluir({ assinaturas: [] });
  ok(semAssinatura.status === 200 && !semAssinatura.chamadas.some((c) => c[0] === 'rpc'), 'sem assinatura, não chama a anonimização e exclui');

  const semMigration = await excluir({ erroRpc: { code: 'PGRST202', message: 'not found' } });
  ok(semMigration.status === 200 && semMigration.chamadas.some((c) => c[0] === 'deleteUser'), 'livro ainda não aplicado (PGRST202) não barra a exclusão');

  const falha = await excluir({ erroRpc: { code: '42501', message: 'x' } });
  ok(falha.status === 500 && !falha.chamadas.some((c) => c[0] === 'deleteUser'), 'outra falha na anonimização barra a exclusão (não promete exclusão parcial)');

  // ---- 4. cakto-webhook real: reenvio não recria a linha anonimizada ----
  /* Depois da anonimização o livro não guarda o event_id original, então ele
     sozinho não reconhece o reenvio. O webhook só grava evento que a assinatura
     aceitou como novo; o reenvio volta 'duplicate' (webhook_events, 30 dias). */
  async function chamarWebhook(resultado) {
    const chamadas = [];
    let handler;
    const supabase = {
      from: (tabela) => ({ upsert: async (linha) => { chamadas.push(['livro', tabela, linha.event_id]); return { error: null }; } }),
      rpc: async (nome) => { chamadas.push(['rpc', nome]); return nome === 'processar_evento_assinatura' ? { data: resultado, error: null } : { data: null, error: null }; },
    };
    const SEGREDO = 'segredo-ficticio-AUDIT';
    const modulos = {
      '../_shared/request-body.ts': carregar('supabase/functions/_shared/request-body.ts'),
      '../_shared/cakto.ts': cakto,
      '../_shared/seguranca.ts': carregar('supabase/functions/_shared/seguranca.ts'),
    };
    vm.runInNewContext(transpilar('supabase/functions/cakto-webhook/index.ts'), {
      exports: {}, console: { ...console, error: () => {}, warn: () => {} }, Response, JSON, Object, Error, String, TextDecoder, TextEncoder, crypto, Uint8Array, Array,
      Deno: { env: { get: (k) => ({ SUPABASE_URL: 'https://t.invalid', SUPABASE_SERVICE_ROLE_KEY: 'chave-ficticia', CAKTO_WEBHOOK_SECRET: SEGREDO })[k] }, serve: (fn) => { handler = fn; } },
      require: (id) => {
        if (id.startsWith('npm:@supabase/supabase-js')) return { createClient: () => supabase };
        if (id in modulos) return modulos[id];
        throw new Error('import inesperado: ' + id);
      },
    });
    const resp = await handler(new Request('https://t.invalid/cakto-webhook', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, secret: SEGREDO }),
    }));
    return { status: resp.status, chamadas };
  }
  const novo = await chamarWebhook('processed');
  ok(novo.status === 200 && novo.chamadas.some((c) => c[0] === 'livro'), `evento novo grava o livro (${novo.status})`);
  ok(novo.chamadas.findIndex((c) => c[1] === 'processar_evento_assinatura') < novo.chamadas.findIndex((c) => c[0] === 'livro'), 'o livro é gravado depois de a assinatura aceitar o evento');
  const reenvio = await chamarWebhook('duplicate');
  ok(reenvio.status === 200 && !reenvio.chamadas.some((c) => c[0] === 'livro'), 'reenvio (duplicate) NÃO grava o livro: a linha anonimizada não volta com o vínculo');

  // ---- política e log ----
  const legal = fs.readFileSync(path.join(raiz, 'lib/legal-content.ts'), 'utf8');
  ok(/Há três exceções/.test(legal) && /registros de pagamento da assinatura/.test(legal), 'a Política de Privacidade declara o livro como exceção na exclusão');
  const webhook = fs.readFileSync(path.join(raiz, 'supabase/functions/cakto-webhook/index.ts'), 'utf8');
  ok(!/String\(e\)/.test(webhook), 'cakto-webhook não manda String(e) ao log');

  console.log(`cobranca-eventos-lgpd: ${passou} checagens passaram — 0 falhas`);
})().catch((e) => { console.error(e); process.exit(1); });

// B2 / revisão do Watchtower (16/10/2026, item 4 bloqueado): o livro-razão de
// cobrança não pode guardar atribuição de marketing em texto livre, e os IDs que
// ligam a venda à pessoa precisam de um caminho restrito para sair.
//
// 1. `linhaCobrancaCakto` REAL com sentinela de e-mail em cupom, UTM e sck.
// 2. A migration REAL num Postgres embutido: o gatilho continua barrando
//    alteração e exclusão, e só aceita a anonimização feita por
//    `anonimizar_cobranca_eventos`/`encerrar_vinculo_cobranca`, que só o
//    servidor executa. Com o default ACL do Supabase modelado, nenhum papel da
//    API altera, apaga ou trunca a tabela; o serviço só lê e grava pela função
//    (B2-2, revisão do Watchtower de 17/10/2026).
// 3. `delete-account/index.ts` REAL com cliente dublado: encerra o vínculo no
//    banco antes de apagar a conta e barra a exclusão em QUALQUER falha,
//    inclusive PGRST202.
// 4. A corrida do B2-1 com os dois handlers reais e o SQL real, nas quatro
//    ordens possíveis: depois da exclusão, nenhum ID da pessoa sobra no livro.
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

(async () => {
  // Os handlers reais, com o cliente do Supabase trocado por um dublê.
  const SEGREDO = 'segredo-ficticio-AUDIT';
  const silencioso = { ...console, warn: () => {}, error: () => {} };
  function carregarExclusao(cliente) {
    let handler;
    vm.runInNewContext(transpilar('supabase/functions/delete-account/index.ts'), {
      exports: {}, console: silencioso, Response, JSON, Object, Error, String,
      Deno: { env: { get: (k) => ({ SUPABASE_URL: 'https://t.invalid', SUPABASE_SERVICE_ROLE_KEY: 'chave-ficticia' })[k] }, serve: (fn) => { handler = fn; } },
      require: (id) => {
        if (id.startsWith('npm:@supabase/supabase-js')) return { createClient: () => cliente };
        if (id.endsWith('reautenticacao.ts')) return { sessaoReautenticouRecentemente: () => true };
        throw new Error('import inesperado: ' + id);
      },
    });
    return handler;
  }
  function carregarWebhook(cliente) {
    let handler;
    const modulos = {
      '../_shared/request-body.ts': carregar('supabase/functions/_shared/request-body.ts'),
      '../_shared/cakto.ts': cakto,
      '../_shared/seguranca.ts': carregar('supabase/functions/_shared/seguranca.ts'),
    };
    vm.runInNewContext(transpilar('supabase/functions/cakto-webhook/index.ts'), {
      exports: {}, console: silencioso, Response, JSON, Object, Error, String, TextDecoder, TextEncoder, crypto, Uint8Array, Array,
      Deno: { env: { get: (k) => ({ SUPABASE_URL: 'https://t.invalid', SUPABASE_SERVICE_ROLE_KEY: 'chave-ficticia', CAKTO_WEBHOOK_SECRET: SEGREDO })[k] }, serve: (fn) => { handler = fn; } },
      require: (id) => {
        if (id.startsWith('npm:@supabase/supabase-js')) return { createClient: () => cliente };
        if (id in modulos) return modulos[id];
        throw new Error('import inesperado: ' + id);
      },
    });
    return handler;
  }

  // ---- 2. migration real, com o default ACL do Supabase ----
  /* B2-2 (revisão do Watchtower, 17/10/2026): GRANT não remove o que veio
     herdado. O banco aqui reproduz o padrão do Supabase, que dá ALL em tabela,
     sequência e função nova aos três papéis da API, para provar que a
     migration tira tudo e deixa só o mínimo. Não é sonda da produção. */
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const comoServico = async (sql, params = []) => {
    await db.exec('set role service_role');
    try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
  };
  const recusa = async (q, nome, papel = null) => {
    let codigo = null;
    try { if (papel) await comoServico(q); else await db.exec(q); } catch (e) { codigo = e.code; }
    ok(codigo === '42501', `${nome} é recusado (${codigo})`);
  };
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      create schema auth;
      create table auth.users (id uuid primary key);
      create table public.subscriptions (
        id uuid primary key default gen_random_uuid(),
        user_id uuid references auth.users(id) on delete cascade,
        provider text not null, provider_order_id text not null, provider_subscription_id text
      );`);
    const sql = fs.readFileSync(path.join(raiz, 'supabase/migrations/20261015233000_cobranca_eventos.sql'), 'utf8');
    await db.exec(sql);
    const cols = (await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name='cobranca_eventos'`)).rows.map((r) => r.column_name);
    ok(!cols.some((c) => /utm|cupom|sck/.test(c)), 'a tabela não tem coluna de cupom, UTM nem sck');
    for (const chave of Object.keys(linha)) ok(cols.includes(chave), `toda coluna gravada pelo webhook existe: ${chave}`);

    const tem = async (papel, priv) => (await db.query(`select has_table_privilege($1, 'public.cobranca_eventos', $2) as p`, [papel, priv])).rows[0].p;
    const seq = (await db.query(`select pg_get_serial_sequence('public.cobranca_eventos', 'id') as s`)).rows[0].s;
    for (const papel of ['anon', 'authenticated', 'service_role']) {
      for (const priv of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        ok(!(await tem(papel, priv)), `${papel} não tem ${priv} na tabela, nem herdado do default ACL`);
      }
      for (const priv of ['USAGE', 'SELECT', 'UPDATE']) {
        ok(!(await db.query(`select has_sequence_privilege($1, $2, $3) as p`, [papel, seq, priv])).rows[0].p, `${papel} não tem ${priv} na sequência do id`);
      }
    }
    ok(await tem('service_role', 'SELECT') && !(await tem('anon', 'SELECT')) && !(await tem('authenticated', 'SELECT')), 'só service_role lê');
    const exec = async (papel, fn) => (await db.query(`select has_function_privilege($1, $2, 'EXECUTE') as p`, [papel, fn])).rows[0].p;
    for (const fn of ['public.registrar_cobranca_evento(jsonb)', 'public.encerrar_vinculo_cobranca(uuid)', 'public.anonimizar_cobranca_eventos(text[],text[])']) {
      ok(await exec('service_role', fn) && !(await exec('anon', fn)) && !(await exec('authenticated', fn)), `só service_role executa ${fn}`);
    }
    ok(!(await exec('service_role', 'public.cobranca_eventos_imutavel()')), 'ninguém da API executa a função do gatilho');

    await db.exec(`insert into public.cobranca_eventos (provider, event_id, event_type, event_at, order_id, parent_order_id, subscription_id, valor)
      values ('cakto', 'purchase_approved:pedido-AUDIT', 'approved', now(), 'pedido-AUDIT', 'pai-AUDIT', 'assinatura-AUDIT', 24.90),
             ('cakto', 'e2', 'renewed', now(), 'outro-AUDIT', null, 'outra-assinatura', 24.90)`);
    const E1 = `event_id='purchase_approved:pedido-AUDIT'`;
    await recusa(`delete from public.cobranca_eventos where ${E1}`, 'DELETE');
    await recusa(`truncate public.cobranca_eventos`, 'TRUNCATE pelo dono');
    await recusa(`truncate public.cobranca_eventos`, 'TRUNCATE pelo service_role', 'service_role');
    await recusa(`delete from public.cobranca_eventos`, 'DELETE pelo service_role', 'service_role');
    await recusa(`update public.cobranca_eventos set valor = 1`, 'UPDATE pelo service_role', 'service_role');
    await recusa(`insert into public.cobranca_eventos (provider, event_id, event_type, event_at) values ('cakto', 'x', 'approved', now())`, 'INSERT direto pelo service_role', 'service_role');
    ok((await db.query(`select count(*)::int as n from public.cobranca_eventos`)).rows[0].n === 2, 'depois das recusas o livro continua inteiro');
    await recusa(`update public.cobranca_eventos set valor = 1 where ${E1}`, 'UPDATE de valor');
    await recusa(`update public.cobranca_eventos set subscription_id = null, order_id = null, parent_order_id = null where ${E1}`, 'tirar IDs sem marcar anonimizado_em');
    await recusa(`update public.cobranca_eventos set subscription_id = null, order_id = null, parent_order_id = null, event_id = 'anonimizado:' || id::text, anonimizado_em = now(), valor = 0 where ${E1}`, 'anonimizar mudando o valor junto');
    await recusa(`update public.cobranca_eventos set subscription_id = null, order_id = null, parent_order_id = null, anonimizado_em = now() where ${E1}`, 'anonimizar deixando o código do pedido no event_id');
    await recusa(`update public.cobranca_eventos set subscription_id = null, order_id = null, parent_order_id = null, event_id = md5('pedido-AUDIT'), anonimizado_em = now() where ${E1}`, 'trocar o event_id por outra forma do código (hash)');

    const n = (await comoServico(`select public.anonimizar_cobranca_eventos(array['assinatura-AUDIT'], null) as n`))[0].n;
    ok(n === 1, `a pedido, anonimiza só a linha da assinatura pedida (${n})`);
    const [a, b] = (await db.query(`select * from public.cobranca_eventos order by id`)).rows;
    ok(a.order_id === null && a.parent_order_id === null && a.subscription_id === null && a.anonimizado_em !== null, 'IDs saem e anonimizado_em registra quando');
    ok(a.event_id === `anonimizado:${a.id}`, `o event_id vira anonimizado:<id da linha> (${a.event_id})`);
    ok(!/pedido-AUDIT|pai-AUDIT|assinatura-AUDIT/.test(JSON.stringify(a)), 'nenhum resíduo do pedido, do pai ou da assinatura em coluna NENHUMA da linha');
    ok(Number(a.valor) === 24.9 && a.event_type === 'approved' && a.event_at !== null && a.recebido_em !== null, 'valor, tipo e datas ficam');
    ok(b.subscription_id === 'outra-assinatura' && b.anonimizado_em === null && b.event_id === 'e2', 'a linha de outra pessoa não é tocada');
    await recusa(`update public.cobranca_eventos set anonimizado_em = now() where id = ${a.id}`, 'regravar anonimizado_em');

    // ---- 3. registrar e encerrar, direto no SQL ----
    const PESSOA = '00000000-0000-4000-8000-0000000000a1';
    await db.exec(`insert into auth.users values ('${PESSOA}');
      insert into public.subscriptions (user_id, provider, provider_order_id, provider_subscription_id)
      values ('${PESSOA}', 'cakto', 'pedido-AUDIT', 'assinatura-AUDIT')`);
    const registrar = async (l) => (await comoServico(`select public.registrar_cobranca_evento($1::jsonb) as r`, [JSON.stringify(l)]))[0].r;
    const renovacao = { ...linha, event_id: 'subscription_renewed:pedido-2-AUDIT', event_type: 'renewed', order_id: 'pedido-2-AUDIT', parent_order_id: 'pedido-AUDIT' };
    ok(await registrar(renovacao) === 'gravado', 'service_role grava pela função');
    ok(await registrar(renovacao) === 'duplicado', 'o mesmo evento não grava duas vezes');
    const gravada = (await db.query(`select * from public.cobranca_eventos where event_id = $1`, [renovacao.event_id])).rows[0];
    ok(gravada.subscription_id === 'assinatura-AUDIT' && gravada.parent_order_id === 'pedido-AUDIT' && gravada.anonimizado_em === null, 'com assinatura viva, os IDs ficam para conciliar');
    const semVinculo = { ...linha, event_id: 'purchase_approved:orfa-AUDIT', order_id: 'orfa-AUDIT', subscription_id: 'orfa-sub-AUDIT', parent_order_id: null };
    ok(await registrar(semVinculo) === 'anonimizado', 'sem assinatura viva, a linha nasce anonimizada');
    ok((await db.query(`select count(*)::int as n from public.cobranca_eventos where event_id like '%orfa%' or order_id like '%orfa%'`)).rows[0].n === 0, 'e nenhum ID da compra sem vínculo fica gravado');

    // ---- 5. a corrida do B2-1, com os handlers reais ----
    /* Reprodução do Watchtower (17/10/2026): a assinatura aceita o evento, a
       gravação do livro fica parada no limite HTTP, e a exclusão roda inteira
       nesse meio. Aqui as quatro ordens possíveis, com o SQL real como
       service_role. Depois de a exclusão concluir, nenhum ID da pessoa pode
       existir em coluna nenhuma do livro. */
    async function cenario(nome, ordem) {
      // Só o teste limpa, desligando o gatilho de propósito: a migration não deixa ninguém truncar.
      await db.exec(`alter table public.cobranca_eventos disable trigger cobranca_eventos_sem_truncate; truncate public.cobranca_eventos; alter table public.cobranca_eventos enable trigger cobranca_eventos_sem_truncate`);
      await db.exec(`truncate auth.users cascade`);
      await db.exec(`insert into auth.users values ('${PESSOA}')`);
      const chamadas = [];
      let pendente = null;
      let webhookNoMeio = null;
      const servidor = {
        rpc: async (fn, args) => {
          chamadas.push(fn);
          if (fn === 'encerrar_vinculo_cobranca') {
            const r = await comoServico(`select public.encerrar_vinculo_cobranca($1::uuid) as n`, [args.p_user_id]);
            if (ordem === 'webhook-entre-encerrar-e-apagar') webhookNoMeio = await chamarWebhookReal();
            return { data: r[0].n, error: null };
          }
          if (fn === 'registrar_cobranca_evento') {
            if (ordem === 'exclusao-durante-gravacao') pendente = await excluirReal();
            await comoServico(`select public.registrar_cobranca_evento($1::jsonb) as r`, [JSON.stringify(args.p_linha)]);
            return { data: null, error: null };
          }
          if (fn === 'processar_evento_assinatura') {
            // Dublê da assinatura: aprovação cria ou atualiza a linha, como o SQL real faz.
            await db.query(`insert into public.subscriptions (user_id, provider, provider_order_id, provider_subscription_id)
              select null, 'cakto', $1::text, $2::text where not exists (select 1 from public.subscriptions where provider_order_id = $1::text)`,
              [args.p_order_id, args.p_subscription_id]);
            return { data: 'processed', error: null };
          }
          return { data: null, error: null };
        },
        auth: {
          getUser: async () => ({ data: { user: { id: PESSOA } }, error: null }),
          admin: { deleteUser: async (id) => { chamadas.push('deleteUser'); await db.query(`delete from auth.users where id = $1`, [id]); return { error: null }; } },
        },
        storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ error: null }) }) },
        from: (t) => {
          if (t === 'feedbacks') return { update: () => ({ eq: async () => ({ error: null }) }) };
          throw new Error('acesso direto inesperado à tabela ' + t);
        },
      };
      async function excluirReal() {
        const r = await carregarExclusao(servidor)(new Request('https://t.invalid/delete-account', { method: 'POST', headers: { Authorization: 'Bearer tok' } }));
        return r.status;
      }
      async function chamarWebhookReal() {
        const r = await carregarWebhook(servidor)(new Request('https://t.invalid/cakto-webhook', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, secret: SEGREDO }),
        }));
        return r.status;
      }
      await db.exec(`insert into public.subscriptions (user_id, provider, provider_order_id, provider_subscription_id) values ('${PESSOA}', 'cakto', 'pedido-AUDIT', 'assinatura-AUDIT')`);
      let statusExclusao, statusWebhook;
      if (ordem === 'webhook-antes') { statusWebhook = await chamarWebhookReal(); statusExclusao = await excluirReal(); }
      else if (ordem === 'exclusao-durante-gravacao') { statusWebhook = await chamarWebhookReal(); statusExclusao = pendente; }
      else { statusExclusao = await excluirReal(); statusWebhook = webhookNoMeio; }
      const livro = (await db.query(`select * from public.cobranca_eventos`)).rows;
      const tudo = JSON.stringify(livro);
      ok(statusExclusao === 200 && statusWebhook === 200, `${nome}: exclusão e webhook respondem 200 (${statusExclusao}, ${statusWebhook})`);
      ok(chamadas.indexOf('encerrar_vinculo_cobranca') >= 0 && chamadas.indexOf('encerrar_vinculo_cobranca') < chamadas.indexOf('deleteUser'), `${nome}: encerra o vínculo antes de apagar a conta`);
      ok(!/pedido-AUDIT|assinatura-AUDIT/.test(tudo), `${nome}: nenhum ID da pessoa sobra no livro depois da exclusão`);
      ok(livro.length === 1 && livro[0].anonimizado_em !== null && Number(livro[0].valor) === 24.9, `${nome}: a venda fica no livro, só com valores e datas`);
    }
    for (const [nome, ordem] of [
      ['webhook inteiro antes da exclusão', 'webhook-antes'],
      ['exclusão inteira durante a gravação do livro (a reprodução do Watchtower)', 'exclusao-durante-gravacao'],
      ['webhook inteiro entre encerrar o vínculo e apagar a conta', 'webhook-entre-encerrar-e-apagar'],
    ]) await cenario(nome, ordem);
  } finally {
    await db.close();
  }

  // ---- 4. delete-account real, contrato com o servidor ----
  async function excluir({ erroRpc = null } = {}) {
    const chamadas = [];
    const admin = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'u-AUDIT' } }, error: null }),
        admin: { deleteUser: async (id) => { chamadas.push(['deleteUser', id]); return { error: null }; } },
      },
      storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ error: null }) }) },
      from: (tabela) => {
        if (tabela === 'feedbacks') return { update: () => ({ eq: async () => { chamadas.push(['feedbacks']); return { error: null }; } }) };
        throw new Error('tabela inesperada: ' + tabela);
      },
      rpc: async (nome, args) => { chamadas.push(['rpc', nome, args]); return { data: 1, error: erroRpc }; },
    };
    const resp = await carregarExclusao(admin)(new Request('https://t.invalid/delete-account', { method: 'POST', headers: { Authorization: 'Bearer tok' } }));
    return { status: resp.status, chamadas };
  }

  const normal = await excluir();
  const iRpc = normal.chamadas.findIndex((c) => c[0] === 'rpc');
  const iDel = normal.chamadas.findIndex((c) => c[0] === 'deleteUser');
  ok(normal.status === 200, `exclusão normal completa (${normal.status})`);
  ok(iRpc >= 0 && iRpc < iDel, 'encerra o vínculo do livro ANTES de apagar a conta');
  ok(JSON.stringify(normal.chamadas[iRpc]) === JSON.stringify(['rpc', 'encerrar_vinculo_cobranca', { p_user_id: 'u-AUDIT' }]), 'manda só a conta; os IDs são lidos no banco, sob a trava');

  const semMigration = await excluir({ erroRpc: { code: 'PGRST202', message: 'not found' } });
  ok(semMigration.status === 500 && !semMigration.chamadas.some((c) => c[0] === 'deleteUser'), 'função ausente na API (PGRST202) barra a exclusão: falha fechada, não prova que o livro não existe');

  const falha = await excluir({ erroRpc: { code: '42501', message: 'x' } });
  ok(falha.status === 500 && !falha.chamadas.some((c) => c[0] === 'deleteUser'), 'outra falha na anonimização barra a exclusão (não promete exclusão parcial)');

  // ---- 4b. cakto-webhook real: reenvio não recria a linha anonimizada ----
  async function chamarWebhook(resultado) {
    const chamadas = [];
    const supabase = {
      from: (tabela) => { throw new Error('acesso direto inesperado à tabela ' + tabela); },
      rpc: async (nome, args) => {
        chamadas.push(['rpc', nome, args?.p_linha?.event_id]);
        return nome === 'processar_evento_assinatura' ? { data: resultado, error: null } : { data: null, error: null };
      },
    };
    const resp = await carregarWebhook(supabase)(new Request('https://t.invalid/cakto-webhook', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, secret: SEGREDO }),
    }));
    return { status: resp.status, chamadas };
  }
  const grava = (c) => c[1] === 'registrar_cobranca_evento';
  const novo = await chamarWebhook('processed');
  ok(novo.status === 200 && novo.chamadas.some(grava), `evento novo grava o livro pela função do banco (${novo.status})`);
  ok(novo.chamadas.findIndex((c) => c[1] === 'processar_evento_assinatura') < novo.chamadas.findIndex(grava), 'o livro é gravado depois de a assinatura aceitar o evento');
  const reenvio = await chamarWebhook('duplicate');
  ok(reenvio.status === 200 && !reenvio.chamadas.some(grava), 'reenvio (duplicate) NÃO grava o livro: a linha anonimizada não volta com o vínculo');

  // ---- política e log ----
  const legal = fs.readFileSync(path.join(raiz, 'lib/legal-content.ts'), 'utf8');
  ok(/Há três exceções/.test(legal) && /registros de pagamento da assinatura/.test(legal), 'a Política de Privacidade declara o livro como exceção na exclusão');
  const webhook = fs.readFileSync(path.join(raiz, 'supabase/functions/cakto-webhook/index.ts'), 'utf8');
  ok(!/String\(e\)/.test(webhook), 'cakto-webhook não manda String(e) ao log');

  console.log(`cobranca-eventos-lgpd: ${passou} checagens passaram — 0 falhas`);
})().catch((e) => { console.error(e); process.exit(1); });

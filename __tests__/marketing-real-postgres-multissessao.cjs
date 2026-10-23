'use strict';
// Opt-in PostgreSQL REAL: never consumes .env, Supabase or the running admin.
// A new database is created and dropped per run; two workers plus a lock observer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Module = require('node:module');
const ts = require('typescript');
const { Client } = require(process.env.GRANA_QA_PG_MODULE || 'pg');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.GRANA_QA_PG_PORT);
assert(Number.isInteger(port) && port >= 1024 && port <= 65535, 'Set GRANA_QA_PG_PORT for the disposable loopback server');
const config = { host: '127.0.0.1', port, user: 'qa_fixture', database: 'postgres',
  connectionTimeoutMillis: 60000, statement_timeout: 15000, application_name: 'grana-qa-disposable' };
const database = 'qa_meta_' + randomUUID().replaceAll('-', '');
const baseline = process.argv.includes('--baseline');
const migrations = [
  '20261015190000_admin_marketing_fundacao.sql', '20261016140000_admin_marketing_operacoes.sql',
  '20261018001000_admin_marketing_real.sql', '20261018230000_admin_marketing_renovacao.sql',
  '20261019120000_admin_marketing_consultar_preparo.sql', '20261019210000_admin_marketing_real_v2_aditiva.sql',
  '20261020120000_admin_marketing_real_recuperacao_v1.sql', '20261021083000_admin_marketing_real_midia_formato.sql',
];
let checks = 0;
const eq = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const rpc = async (c, name, args = []) => (await c.query(
  `select public.admin_marketing_real_${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) r`,
  args.map(v => v && typeof v === 'object' ? JSON.stringify(v) : v))).rows[0].r;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const moduleCache = new Map();
function realModule(relative) {
  const absolute = path.resolve(root, relative);
  if (moduleCache.has(absolute)) return moduleCache.get(absolute).exports;
  const m = new Module(absolute, module); moduleCache.set(absolute, m);
  m.require = id => id.startsWith('npm:') ? {} : realModule(path.relative(root, path.resolve(path.dirname(absolute), id)));
  m._compile(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, absolute);
  return m.exports;
}

async function main() {
  const control = new Client(config), clients = [];
  let created = false;
  await control.connect();
  try {
    const identity = (await control.query('select host(inet_server_addr()) host, current_user, version()')).rows[0];
    eq(identity.host, '127.0.0.1', 'server is loopback');
    eq(identity.current_user, 'qa_fixture', 'dedicated fictitious role');
    assert.match(identity.version, /^PostgreSQL /);
    console.log(JSON.stringify({ database, server: identity.version, host: identity.host }));
    await control.query('set statement_timeout=120000');
    await control.query(`create database ${database}`); created = true;
    for (let i = 0; i < 3; i++) {
      const c = new Client({ ...config, database, application_name: 'grana-qa-' + ['A', 'B', 'observer'][i] });
      await c.connect(); clients.push(c);
    }
    const [a, b, observer] = clients;
    const pid = async c => (await c.query('select pg_backend_pid() p')).rows[0].p;
    const pids = await Promise.all(clients.map(pid));
    eq(new Set(pids).size, 3, 'independent PostgreSQL sessions');
    console.log('Independent backend PIDs:', pids.join(', '));
    await a.query(`do $$ begin
      if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
      end $$;
      grant usage on schema public to anon,authenticated,service_role;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    for (const file of migrations) await a.query(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
    const admin = randomUUID(), ig = randomUUID(), fb = randomUUID();
    const capabilities = JSON.stringify(['feed', 'carrossel', 'reels'].map(formato => ({ formato, estado: 'disponivel', revisao: 1 })));
    await a.query(`insert into public.admin_marketing_real_contas
      (id,rede,remoto_id,rotulo,credencial_ref,conexao,valida_ate,pausada,capacidades)
      values($1,'instagram','123','IG fixture','MARKETING_IG_TOKEN','verificada',now()+interval '1 day',false,$3),
      ($2,'facebook','456','FB fixture','MARKETING_FB_TOKEN','verificada',now()+interval '1 day',false,$3)`, [ig, fb, capabilities]);
    await a.query(`update public.admin_marketing_controles set habilitado=true,pausa_global=false,
      pausa_instagram=false,pausa_facebook=false,recuperacao_pendente=false,
      capacidade_validada_em=now(),margem_validada_ate=now()+interval '1 day'`);
    await a.query('set role service_role'); await b.query('set role service_role');
    let serial = 0;
    let withPolicy = false;
    async function preview(formato = 'feed', editorial = false) {
      const hex = (++serial).toString(16).padStart(16, '0');
      const contentId = editorial ? randomUUID() : null;
      if (editorial) for (const [operacao, geracaoEsperada] of [['iniciarRevisao', 0], ['registrarVersao', 1], ['registrarAceite', 1]]) {
        await rpc(a, 'editorial_v2', [admin, { operacao, geracaoEsperada, conteudoId: contentId,
          idempotencia: randomUUID(), pecaId: hex, versao: hex.padStart(40, '0') }]);
      }
      const midias = Array.from({ length: formato === 'carrossel' ? 3 : 1 }, (_, ordem) => ({
        ordem, tipo: formato === 'reels' ? 'video' : 'imagem',
        mime: formato === 'reels' ? 'video/mp4' : 'image/jpeg', bytes: 100,
        sha256: (ordem + 1).toString(16).repeat(64), largura: 1080, altura: 1920,
      }));
      let s = await rpc(a, editorial ? 'snapshot_iniciar_v2' : 'snapshot_iniciar', [admin, { pecaId: hex, versao: hex.padStart(40, '0'),
        ...(editorial ? { conteudoId: contentId, geracaoEditorial: 1 } : {}),
        aceiteId: 'fixture', aceiteRevisao: 1, legenda: 'Legenda fictícia.', legendaSha256: 'a'.repeat(64), midias, capa: null }]);
      s = await rpc(a, 'snapshot_finalizar', [admin, s.id, 1, { identidade: s.identidade, midias: s.dados.midias, capa: null }]);
      const p = await rpc(a, editorial ? 'previa_v2' : 'previa', [admin, { snapshotId: s.id, snapshotRevisao: s.revisao,
        ...(withPolicy ? { politicaExecucao: 'recuperacao-2h-v1', capacidadesCliente: ['execucao-2h-v1'], consentimentoExecucao: true } : {}),
        destinos: [ig, fb].map(contaId => ({ contaId, formato,
          publicarEm: new Date(Date.now() + 7200000).toISOString(), fuso: 'America/Sao_Paulo' })) }]);
      return { ...p, qaV2: editorial, qaEditorial: { conteudoId: contentId, pecaId: hex, versao: hex.padStart(40, '0') } };
    }
    const confirm = (c, p, key) => p.destinos[0].politicaExecucao === 'recuperacao-2h-v1'
      ? rpc(c, 'confirmar_politica', [admin, p.id, p.hash, 1, key, ['execucao-2h-v1'], p.qaV2 ? 'e5.real.v2' : 'e5.real.v1'])
      : rpc(c, p.qaV2 ? 'confirmar_v2' : 'confirmar', [admin, p.id, p.hash, 1, key]);
    const rows = async loteId => (await observer.query('select * from public.admin_marketing_agendamentos where lote_id=$1 order by id', [loteId])).rows;
    if (!baseline) {
      // A legacy lot genuinely exists BEFORE migration, rather than being relabelled afterwards.
      const legacyPreview = await preview(), legacyLot = await confirm(a, legacyPreview, randomUUID());
      const oldRows = (await observer.query(`select a.* from public.admin_marketing_autorizacoes a
        join public.admin_marketing_agendamentos j on j.autorizacao_id=a.id where j.lote_id=$1 order by a.id`, [legacyLot.loteId])).rows;
      await observer.query(fs.readFileSync(path.join(root, 'supabase/migrations/20261022120000_admin_marketing_confiabilidade.sql'), 'utf8'));
      const newRows = (await observer.query(`select a.* from public.admin_marketing_autorizacoes a
        join public.admin_marketing_agendamentos j on j.autorizacao_id=a.id where j.lote_id=$1 order by a.id`, [legacyLot.loteId])).rows;
      for (let i = 0; i < oldRows.length; i++) {
        const { politica_execucao, executar_ate, ...preserved } = newRows[i];
        eq(preserved, oldRows[i], 'migration preserves existing authorization fields');
        eq(politica_execucao, 'legado-15min', 'existing authorization is not silently expanded');
        eq(executar_ate - newRows[i].publicar_em, 900000, 'legacy deadline is original +15m');
      }
      // Readiness signals are fictitious rows in this disposable DB, never real emails or pings.
      eq(await rpc(a, 'politica_pronta'), false, 'new recovery policy defaults disabled');
      eq(await rpc(a, 'email_liberado'), false, 'email defaults blocked before fictitious consent');
      eq(await rpc(a, 'email_liberar', [randomUUID()]), true, 'disposable fixture explicitly authorizes its fictitious channel');
      eq(await rpc(a, 'email_liberado'), true, 'fixture consent is persisted before simulating healthy delivery');
      await observer.query(`update public.admin_marketing_controles set politica_2h_habilitada=true;
        insert into public.admin_marketing_monitor_saude(id,concluido_em) values(true,now());
        insert into public.admin_marketing_email_saude(id,configurado,saudavel) values(true,true,true);
        insert into public.admin_marketing_integracoes_saude(id,worker_hc_em,monitor_hc_em,email_aceito_em)
        values(true,now(),now(),now());`);
      eq(await rpc(a, 'politica_pronta'), true, 'fixture readiness permits new explicit intent');
      const t0 = '2026-10-22T12:00:00.000Z';
      for (const [policy, milliseconds] of [['legado-15min', 900000], ['recuperacao-2h-v1', 7200000]]) {
        for (const [offset, accepted] of [[-1, true], [0, true], [1, false]]) {
          eq(await rpc(a, 'prazo_valido', [t0, policy, new Date(Date.parse(t0) + milliseconds + offset).toISOString()]),
            accepted, policy + ' exact absolute deadline boundary ' + offset + 'ms');
        }
      }
      withPolicy = true;
    }
    async function blockedByA() {
      for (let i = 0; i < 100; i++) {
        const r = await observer.query('select $1::int = any(pg_blocking_pids($2)) blocked', [pids[0], pids[1]]);
        if (r.rows[0].blocked) { checks++; return; }
        await sleep(20);
      }
      assert.fail('session B must actually wait on a lock held by session A');
    }
    // A keeps its transaction open: B cannot merely be serialized by the JS driver.
    for (const format of ['feed', 'carrossel', 'reels']) {
      const p = await preview(format), key = randomUUID();
      eq(p.destinos.map(d => d.formato), [format, format], format + ' both destinations preflight');
      await a.query('begin');
      const first = await confirm(a, p, key);
      const pending = confirm(b, p, key).then(value => ({ value }), error => ({ error }));
      await blockedByA(); await a.query('commit');
      const second = await pending; assert.ifError(second.error);
      eq(second.value.loteId, first.loteId, 'lost-response replay across sessions');
      eq(second.value.replay, true, 'replay identifies existing lot');
      eq((await rows(first.loteId)).length, 2, 'exactly two independent destination jobs');
      if (!baseline) {
        const deadlines = (await observer.query(`select a.politica_execucao,a.publicar_em,a.executar_ate
          from public.admin_marketing_autorizacoes a join public.admin_marketing_agendamentos j
          on j.autorizacao_id=a.id where j.lote_id=$1`, [first.loteId])).rows;
        for (const d of deadlines) {
          eq(d.politica_execucao, 'recuperacao-2h-v1', 'explicit recovery policy persisted');
          eq(d.executar_ate - d.publicar_em, 7200000, 'new deadline remains original time +2h');
        }
      }
      eq((await observer.query('select count(*)::int n from public.admin_marketing_real_lotes where idempotencia=$1', [key])).rows[0].n, 1, 'one lot');
    }
    // Isolate the worker queue to one job per concurrency case.
    const isolate = async id => {
      await observer.query(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now()+interval '1 day'`);
      // Independent scenarios do not share the production 12-starts/minute
      // budget: age only these fictitious attempt timestamps, retaining leases.
      await observer.query(`update public.admin_marketing_envios set iniciado_em=least(iniciado_em,now()-interval '2 minutes')`);
      await observer.query(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now()-interval '1 second' where id=$1`, [id]);
    };
    const newJob = async () => { const p = await preview(); const l = await confirm(a, p, randomUUID()); return (await rows(l.loteId))[0]; };
    const row = async id => (await observer.query('select * from public.admin_marketing_agendamentos where id=$1', [id])).rows[0];
    const command = (c, job, acao) => rpc(c, 'comando', [admin, { acao, jobId: job.id, revisaoEsperada: job.revisao, idempotencia: randomUUID() }]);
    let job = await newJob(); await isolate(job.id);
    const workerA = randomUUID(), workerB = randomUUID();
    await a.query('begin'); const firstClaim = await rpc(a, 'claim', [workerA, 1]);
    eq(firstClaim.length, 1, 'first worker claims');
    const claimB = rpc(b, 'claim', [workerB, 1]).then(value => ({ value }), error => ({ error }));
    await blockedByA(); await a.query('commit');
    const otherClaim = await claimB; assert.ifError(otherClaim.error);
    eq(otherClaim.value, [], 'second worker cannot claim same active lease');
    eq((await observer.query('select count(*)::int n from public.admin_marketing_envios where agendamento_id=$1', [job.id])).rows[0].n, 1, 'one attempt only');
    // Cancellation wins before claim: the waiting worker never acquires a lease.
    job = await newJob(); await isolate(job.id);
    await a.query('begin'); await command(a, job, 'cancelar');
    const admission = rpc(b, 'claim', [randomUUID(), 1]).then(value => ({ value }), error => ({ error }));
    await blockedByA(); await a.query('commit');
    const admitted = await admission; assert.ifError(admitted.error);
    eq(admitted.value, [], 'cancel committed before claim fences delayed worker');
    eq((await row(job.id)).estado, 'cancelado', 'visible cancellation persists');
    eq((await observer.query('select count(*)::int n from public.admin_marketing_envios where agendamento_id=$1 and efeito_admitido_em is not null', [job.id])).rows[0].n, 0, 'no admitted effect after cancellation');
    // Claim wins: cancellation cannot pretend that a running operation was cancelled.
    job = await newJob(); await isolate(job.id);
    await a.query('begin'); await rpc(a, 'claim', [randomUUID(), 1]);
    const cancellation = command(b, job, 'cancelar').then(value => ({ value }), error => ({ error }));
    await blockedByA(); await a.query('commit');
    const refused = await cancellation;
    assert.match(refused.error?.message || '', /revisao-divergente|operacao-em-andamento/); checks++;
    assert.notEqual((await row(job.id)).estado, 'cancelado'); checks++;
    // Global pause and admission contend on real locks, in the opposite order.
    job = await newJob(); await isolate(job.id);
    const w2 = randomUUID(), [c2] = await rpc(a, 'claim', [w2, 1]);
    const controlRevision = (await observer.query('select revisao from public.admin_marketing_controles')).rows[0].revisao;
    await a.query('begin');
    await rpc(a, 'comando', [admin, { acao: 'pausar', escopo: 'global', revisaoEsperada: controlRevision, idempotencia: randomUUID() }]);
    const pausedAdmission = rpc(b, 'admitir', [w2, c2.jobId, c2.leaseId, c2.revisao]).then(value => ({ value }), error => ({ error }));
    await blockedByA(); await a.query('commit');
    const result = await pausedAdmission; assert.ifError(result.error);
    eq(result.value, false, 'committed global pause blocks pending admission');
    if (!baseline) {
      await observer.query('update public.admin_marketing_controles set pausa_global=false');
      // An explicitly reconfirmed reschedule creates a NEW authorization. It must
      // never mutate or silently extend the authorization of the original intent.
      const rescheduleJob = await newJob();
      const originalAuthorization = (await observer.query('select * from public.admin_marketing_autorizacoes where id=$1', [rescheduleJob.autorizacao_id])).rows[0];
      const newTime = new Date(Date.now() + 10800000).toISOString();
      const reschedulePreview = await rpc(a, 'previa', [admin, { jobId: rescheduleJob.id,
        destinos: [{ contaId: rescheduleJob.conta_id, formato: 'feed', publicarEm: newTime, fuso: 'America/Sao_Paulo' }],
        politicaExecucao: 'recuperacao-2h-v1', capacidadesCliente: ['execucao-2h-v1'], consentimentoExecucao: true }]);
      const rescheduled = await rpc(a, 'comando', [admin, { acao: 'reagendar', jobId: rescheduleJob.id,
        revisaoEsperada: rescheduleJob.revisao, idempotencia: randomUUID(), publicarEm: newTime,
        fuso: 'America/Sao_Paulo', previaId: reschedulePreview.id, previaHash: reschedulePreview.hash,
        capacidadesCliente: ['execucao-2h-v1'], confirmacao: true }]);
      const successor = await row(rescheduled.jobs[0].jobId);
      assert.notEqual(successor.autorizacao_id, originalAuthorization.id); checks++;
      eq(successor.substitui_id, rescheduleJob.id, 'new explicitly confirmed schedule is a linked successor');
      const successorAuthorization = (await observer.query('select * from public.admin_marketing_autorizacoes where id=$1', [successor.autorizacao_id])).rows[0];
      eq(successorAuthorization.publicar_em.toISOString(), newTime, 'successor uses newly confirmed schedule');
      eq(successorAuthorization.executar_ate - successorAuthorization.publicar_em, 7200000, 'successor has its own original time +2h');
      eq((await observer.query('select * from public.admin_marketing_autorizacoes where id=$1', [originalAuthorization.id])).rows[0], originalAuthorization,
        'rescheduling preserves every field of the previous authorization');
      // now() is frozen by a real transaction: test the inclusive boundary in
      // actual claim/admit functions, retaining PostgreSQL microsecond precision.
      for (const offsetMs of [0, -1]) {
        const j = await newJob(); await isolate(j.id);
        await a.query('begin'); await a.query('reset role');
        await a.query('alter table public.admin_marketing_autorizacoes disable trigger admin_marketing_autorizacao_prazo');
        await a.query(`update public.admin_marketing_autorizacoes set
          publicar_em=now()-interval '2 hours'+$2*interval '1 millisecond',
          confirmado_em=now()-interval '3 hours',executar_ate=now()+$2*interval '1 millisecond' where id=$1`, [j.autorizacao_id, offsetMs]);
        await a.query('alter table public.admin_marketing_autorizacoes enable trigger admin_marketing_autorizacao_prazo');
        await a.query('set role service_role');
        const w = randomUUID(), claimed = await rpc(a, 'claim', [w, 1]);
        eq(claimed.length, offsetMs === 0 ? 1 : 0, 'claim uses inclusive absolute deadline ' + offsetMs + 'ms');
        if (offsetMs === 0) eq(await rpc(a, 'admitir', [w, claimed[0].jobId, claimed[0].leaseId, claimed[0].revisao]), true,
          'admission agrees with claim at the exact inclusive boundary');
        await a.query('commit');
      }
      // Review and admission compete on independent connections, in both lock
      // orders. An already admitted effect remains recorded; review fences future ones.
      for (const reviewFirst of [true, false]) {
        const p = await preview('feed', true), lot = await confirm(a, p, randomUUID());
        const j = (await rows(lot.loteId))[0]; await isolate(j.id);
        const w = randomUUID(), [claim] = await rpc(a, 'claim_v2', [w, 1]);
        const review = c => rpc(c, 'editorial_v2', [admin, { ...p.qaEditorial,
          operacao: 'iniciarRevisao', geracaoEsperada: 1, idempotencia: randomUUID() }]);
        const admit = c => rpc(c, 'admitir_v2', [w, claim.jobId, claim.leaseId, claim.revisao]);
        await a.query('begin');
        if (reviewFirst) await review(a);
        else eq(await admit(a), true, 'admission may win before review begins');
        const pending = (reviewFirst ? admit(b) : review(b)).then(value => ({ value }), error => ({ error }));
        await blockedByA(); await a.query('commit');
        const outcome = await pending; assert.ifError(outcome.error);
        if (reviewFirst) eq(outcome.value, false, 'committed review prevents waiting worker effect');
        else eq(outcome.value.estadoEditorial, 'em-revisao', 'review follows committed admission without erasing it');
        eq((await row(j.id)).pausado, true, 'review persistently suspends the old destination');
        assert((await row(j.id)).aceite_revogado_em, 'review revokes previous acceptance'); checks++;
        eq((await observer.query(`select count(*)::int n from public.admin_marketing_envios
          where agendamento_id=$1 and efeito_admitido_em is not null`, [j.id])).rows[0].n,
          reviewFirst ? 0 : 1, 'admission history matches the real lock winner');
        eq(await admit(b), false, 'review blocks every later effect using stale editorial generation');
      }
      console.log('PostgreSQL checkpoint: reschedule successor, exact deadline, review/admission lock orders passed;', checks, 'assertions');
      // Actual executor + actual RPCs/SQL. Only Graph transport is fake; one receipt
      // fails inside PostgreSQL AFTER the journal has committed, then process restarts.
      const p = await preview(), lot = await confirm(a, p, randomUUID());
      const targets = await rows(lot.loteId);
      const targetIG = targets.find(j => j.conta_id === ig);
      const targetFB = targets.find(j => j.conta_id === fb);
      await observer.query(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now()+interval '1 day'`);
      // Fixture clock: emulate elapsed time on these authorizations only. Production
      // immutability is explicitly tested below before bypassing it as fixture owner.
      await assert.rejects(observer.query('update public.admin_marketing_autorizacoes set executar_ate=executar_ate+interval \'1 minute\' where id=$1', [targetIG.autorizacao_id]), /autorizacao-imutavel/); checks++;
      async function fixtureTime(ids, hoursAgo) {
        await observer.query('begin');
        try {
          await observer.query('alter table public.admin_marketing_autorizacoes disable trigger admin_marketing_autorizacao_prazo');
          await observer.query(`update public.admin_marketing_autorizacoes set
            publicar_em=now()-make_interval(secs=>$2::int),
            confirmado_em=now()-make_interval(secs=>$2::int)-interval '1 minute',
            executar_ate=now()-make_interval(secs=>$2::int)+case politica_execucao
              when 'recuperacao-2h-v1' then interval '2 hours' else interval '15 minutes' end
            where id=any($1::uuid[])`, [ids, Math.round(hoursAgo * 3600)]);
          await observer.query('alter table public.admin_marketing_autorizacoes enable trigger admin_marketing_autorizacao_prazo');
          await observer.query('commit');
        } catch (error) { await observer.query('rollback'); throw error; }
      }
      await fixtureTime(targets.map(j => j.autorizacao_id), 1 / 60);
      await observer.query(`update public.admin_marketing_agendamentos set etapa='publicar',
        processamento='{"container":"700","itens":["700"]}',proxima_verificacao_em=now() where lote_id=$1`, [lot.loteId]);
      await observer.query(`create function public.qa_receipt_failure() returns trigger language plpgsql as $$
        begin raise exception 'qa-receipt-db-failure'; end $$;
        create trigger qa_receipt_failure before update on public.admin_marketing_agendamentos
        for each row when(old.id='${targetIG.id}'::uuid and new.lease_id is null)
        execute function public.qa_receipt_failure();`);
      const signatures = {
        claim: ['p_worker', 'p_limite'], admitir: ['p_worker', 'p_job', 'p_lease', 'p_revisao'],
        recibo: ['p_worker', 'p_job', 'p_lease', 'p_revisao', 'p_resultado'],
        diario: ['p_worker', 'p_job', 'p_lease', 'p_revisao', 'p_resultado'],
        monitor: ['p_worker', 'p_admin'], integracao_recibo: ['p_alvo'],
        worker_concluido_v2: ['p_resultado'],
        renovacao_iniciar: ['p_worker'], renovacao_registrar: ['p_worker', 'p_renovacao', 'p_lease', 'p_resultado'],
      };
      const rpcCalls = [], networkCalls = [], logs = [];
      const bridge = {
        rpc(name, args) { return { abortSignal: async signal => {
          signal?.throwIfAborted(); const short = name.replace('admin_marketing_real_', '');
          assert(signatures[short], 'known real RPC ' + name); rpcCalls.push({ name: short, args });
          try { return { data: await rpc(a, short, signatures[short].map(k => args[k])), error: null }; }
          catch (error) { return { data: null, error: { message: error.message, code: error.code } }; }
        } }; },
        from(table) {
          assert.equal(table, 'admin_marketing_real_snapshots'); let id;
          const q = { select: () => q, eq: (_, v) => { id = v; return q; }, abortSignal: () => q,
            single: async () => ({ data: (await a.query('select estado,dados from public.admin_marketing_real_snapshots where id=$1', [id])).rows[0], error: null }) };
          return q;
        },
      };
      const secret = 'qa-executor-fictitious-secret-'.repeat(2);
      const env = { MARKETING_REAL_EXECUTOR_ATIVO: 'true', MARKETING_REAL_EXECUTOR_SECRET: secret,
        META_GRAPH_API_VERSION: 'v25.0', MARKETING_IG_TOKEN: 'qa-fictitious-token', MARKETING_FB_TOKEN: 'qa-fictitious-token' };
      const transport = async (input, init) => {
        const u = new URL(String(input)); networkCalls.push({ path: u.pathname, method: init.method });
        if (init.method === 'POST' && u.pathname === '/v25.0/123/media_publish') return Response.json({ id: '901' });
        if (init.method === 'POST' && u.pathname === '/v25.0/456/feed') return Response.json({ id: '902' });
        if (init.method === 'GET' && u.pathname === '/v25.0/901') return Response.json({ id: '901', media_product_type: 'FEED', permalink: 'https://www.instagram.com/p/fixture/' });
        if (init.method === 'GET' && u.pathname === '/v25.0/902') return Response.json({ id: '902', is_published: true, permalink_url: 'https://www.facebook.com/902' });
        throw new Error('unexpected external transport ' + u.hostname + u.pathname);
      };
      const runExecutor = async () => {
        const handler = realModule('supabase/functions/_shared/marketing-real-executor.ts').criarExecutorReal({
          env: name => env[name], cliente: () => bridge, rede: transport, log: line => logs.push(line) });
        return handler(new Request('https://qa.invalid', { method: 'POST',
          headers: { 'x-marketing-real-secret': secret, 'content-type': 'application/json' }, body: '{}' }));
      };
      const failedReceipt = await runExecutor();
      eq(failedReceipt.status, 503, 'real DB receipt failure is visible as 503');
      eq((await failedReceipt.json()).codigo, 'recibo-pendente', 'no false completion');
      eq(networkCalls.filter(c => c.method === 'POST').length, 2, 'one POST per destination before DB failure');
      eq((await observer.query('select count(*)::int n from public.admin_marketing_ids_diario where agendamento_id=any($1::uuid[])', [targets.map(j => j.id)])).rows[0].n, 2, 'both remote outcomes durably journalled');
      eq((await row(targetIG.id)).etapa, 'publicar', 'failed receipt rolled back job transition');
      eq((await row(targetFB.id)).etapa, 'verificar-publicacao', 'other destination advances independently');
      await observer.query('drop trigger qa_receipt_failure on public.admin_marketing_agendamentos; drop function public.qa_receipt_failure()');
      await observer.query(`update public.admin_marketing_agendamentos set lease_expira_em=now()-interval '1 second' where id=$1`, [targetIG.id]);
      await observer.query(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now()+interval '1 day' where lote_id=$1`, [lot.loteId]);
      await a.query('begin');
      await rpc(a, 'claim', [randomUUID(), 1]);
      const recovery = rpc(b, 'claim', [randomUUID(), 1]).then(value => ({ value }), error => ({ error }));
      await blockedByA(); await a.query('commit');
      const recoveryResult = await recovery; assert.ifError(recoveryResult.error);
      eq((await row(targetIG.id)).remoto_id, '901', 'journal recovers known remote ID across sessions');
      eq((await row(targetIG.id)).etapa, 'verificar-publicacao', 'recovery advances to readback, not another publish');
      await observer.query(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now() where lote_id=$1`, [lot.loteId]);
      const restarted = await runExecutor(); eq(restarted.status, 200, 'new executor invocation completes readbacks');
      eq(networkCalls.filter(c => c.method === 'POST').length, 2, 'restart performs no extra POST to either network');
      eq((await rows(lot.loteId)).map(j => j.estado), ['publicado', 'publicado'], 'both destinations have readback');
      assert(rpcCalls.some(c => c.name === 'diario')); checks++;
      // A process dies before admission: two sessions race for a safe recovery.
      job = await newJob(); await isolate(job.id);
      const crashedWorker = randomUUID(), [crashed] = await rpc(a, 'claim', [crashedWorker, 1]);
      await observer.query(`update public.admin_marketing_agendamentos set lease_expira_em=now()-interval '1 second' where id=$1`, [job.id]);
      const recoveringWorker = randomUUID();
      await a.query('begin'); const safeRecovery = await rpc(a, 'claim', [recoveringWorker, 1]);
      const safeRacer = rpc(b, 'claim', [randomUUID(), 1]).then(value => ({ value }), error => ({ error }));
      await blockedByA(); await a.query('commit');
      const safeRacerResult = await safeRacer; assert.ifError(safeRacerResult.error);
      eq(safeRecovery.length, 1, 'unadmitted interrupted operation has one safe recovery');
      eq(safeRacerResult.value, [], 'second session cannot take the recovered lease');
      eq(await rpc(b, 'admitir', [crashedWorker, crashed.jobId, crashed.leaseId, crashed.revisao]), false, 'old process is fenced after safe recovery');
      eq(await rpc(a, 'admitir', [recoveringWorker, safeRecovery[0].jobId, safeRecovery[0].leaseId, safeRecovery[0].revisao]), true, 'new lease admits one effect');
      // A process dies AFTER admission without a journal: never turn uncertainty
      // into an automatic second POST, even with the two-hour policy.
      await observer.query(`update public.admin_marketing_agendamentos set lease_expira_em=now()-interval '1 second' where id=$1`, [job.id]);
      await a.query('begin'); const uncertainRecovery = await rpc(a, 'claim', [randomUUID(), 1]);
      const uncertainRacer = rpc(b, 'claim', [randomUUID(), 1]).then(value => ({ value }), error => ({ error }));
      await blockedByA(); await a.query('commit');
      const uncertainRacerResult = await uncertainRacer; assert.ifError(uncertainRacerResult.error);
      eq(uncertainRecovery, [], 'admitted unknown effect is not automatically repeated');
      eq(uncertainRacerResult.value, [], 'racing worker also refuses uncertain effect');
      eq((await row(job.id)).estado, 'precisa-conferir', 'uncertainty is visible and durable');
      eq((await observer.query('select count(*)::int n from public.admin_marketing_envios where agendamento_id=$1', [job.id])).rows[0].n, 2, 'only original and pre-admission recovery attempts exist');
      // Expiry during a live lease: the monitor must not violate queue constraints.
      job = await newJob(); await isolate(job.id);
      const expiryWorker = randomUUID(), [expiryClaim] = await rpc(a, 'claim', [expiryWorker, 1]);
      assert(expiryClaim, 'deadline fixture needs an active lease'); checks++;
      await fixtureTime([job.autorizacao_id], 2 + 1 / 3600);
      const immutableDeadline = (await observer.query('select executar_ate from public.admin_marketing_autorizacoes where id=$1', [job.autorizacao_id])).rows[0].executar_ate;
      eq(await rpc(a, 'admitir', [expiryWorker, expiryClaim.jobId, expiryClaim.leaseId, expiryClaim.revisao]), false, 'expiry fences a live lease before POST');
      await rpc(b, 'monitor', [randomUUID(), admin]);
      const monitored = await row(job.id);
      assert(monitored.lease_id === null || monitored.estado === 'preparando', 'monitor preserves lease/state invariant'); checks++;
      eq((await observer.query('select executar_ate from public.admin_marketing_autorizacoes where id=$1', [job.autorizacao_id])).rows[0].executar_ate, immutableDeadline, 'monitor never extends deadline');
      const incidents = await rpc(a, 'incidentes', [admin]);
      assert(incidents.incidentes.some(i => i.jobId === job.id && !i.resolvidoEm), 'deadline failure has a visible persisted incident'); checks++;
      // A healthy RPC transport cannot mask a broken independent email dispatcher.
      await observer.query(`update public.admin_marketing_email_outbox set estado='falhou',codigo_erro='qa-email-recusado';
        update public.admin_marketing_integracoes_saude set email_falhou_em=now(),email_aceito_em=now()-interval '1 minute'`);
      const heartbeatCalls = [];
      const monitorEnv = { ...env, ADMIN_MARKETING_USER_ID: admin, MARKETING_MONITOR_SECRET: secret,
        MARKETING_HEALTHCHECKS_MONITOR_URL: 'https://hc-ping.com/11111111-1111-4111-8111-111111111111' };
      const monitor = realModule('supabase/functions/_shared/marketing-real-incidentes.ts').criarOperadorIncidentes('monitor', {
        env: name => monitorEnv[name], cliente: () => bridge, log: line => logs.push(line),
        rede: async (input, init) => {
          const u = new URL(String(input)); assert.equal(u.hostname, 'hc-ping.com');
          heartbeatCalls.push({ path: u.pathname, method: init.method }); return new Response(null, { status: 204 });
        },
      });
      await monitor(new Request('https://qa.invalid', { method: 'POST',
        headers: { 'x-marketing-ops-secret': secret, 'content-type': 'application/json' }, body: '{}' }));
      eq(heartbeatCalls.length, 1, 'monitor emits one independent heartbeat');
      eq(heartbeatCalls[0].path.endsWith('/fail'), true, 'email provider failure cannot produce a green monitor heartbeat');
    }
    console.log(`PostgreSQL multissessao: ${checks} assertions; real locks, 3 formats x 2 networks, replay, claim, cancellation, pause`);
  } finally {
    for (const client of clients) {
      await client.query('rollback').catch(() => {});
      await client.end();
    }
    if (created) await control.query(`drop database ${database} with (force)`);
    await control.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

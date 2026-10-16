const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
let checks = 0;
const eq = (a, b, msg) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg); checks++; };
const ADMIN = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const ID = '33333333-3333-3333-3333-333333333333';
const WHEN = '2026-10-16T15:00:00.000Z';
function harness({ sub = ADMIN, aal = 'aal2', totp = true, revoked = false } = {}) {
  const calls = [], keys = [], logs = [], cache = new Map();
  let handler;
  const client = {
    storage: { from: bucket => ({ createSignedUrl: async (objeto, seconds) => {
      calls.push({ bucket,objeto,seconds }); return { data: { signedUrl: 'https://fake.invalid/signed?token=temporary' } };
    } }) },
    auth: { getUser: async () => ({ data: { user: revoked ? null : { id: sub,
      factors: totp ? [{ factor_type: 'totp', status: 'verified' }] : [] } }, error: null }) },
    from: table => {
      const call = { table, ops: [] }; calls.push(call);
      const q = {};
      for (const op of ['select','update','eq','gt','is','in','or','order','limit','abortSignal','maybeSingle']) q[op] = (...args) => { call.ops.push([op,args]); return q; };
      q.then = (ok, ko) => Promise.resolve({ error: null, count: 1, data: table === 'admin_marketing_midias' ? { objeto:'fixture/video.mp4', removido_em:null } : call.ops.some(x => x[0] === 'update') ? [{ id: ID }] : [
        { id: ID, codigo: 'envio-incerto', importancia: 'critica', agendamento_id: null,
          criado_em: WHEN, lida_em: null, resolvida_em: null, segredo: 'SENTINELA' },
      ] }).then(ok, ko);
      return q;
    },
  };
  function load(file) {
    file = path.resolve(file); if (cache.has(file)) return cache.get(file);
    const api = {}; cache.set(file, api);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      exports: api, Request, Response, Headers, URL, AbortController, TextEncoder, TextDecoder,
      atob, Date, Error, crypto: webcrypto, setTimeout, clearTimeout,
      console: { log: s => logs.push(s) },
      fetch: () => { throw new Error('network forbidden'); },
      Deno: { env: { get: k => ({ ADMIN_USER_IDS: ADMIN, SUPABASE_URL: 'https://fake.invalid',
        SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' })[k] }, serve: h => { handler = h; } },
      require: id => id.startsWith('npm:') ? { createClient: (_url, key) => { keys.push(key); return client; } }
        : load(path.resolve(path.dirname(file), id)),
    });
    return api;
  }
  const api = load('supabase/functions/_shared/admin-marketing.ts');
  load('supabase/functions/admin-marketing/index.ts');
  const token = 'valid.' + Buffer.from(JSON.stringify({ sub, aal })).toString('base64url') + '.signature';
  return { api, calls, keys, logs, request: async (body, origin = 'https://granaponto.com.br') => {
    const r = await handler(new Request('https://fake.invalid', { method: 'POST', headers: {
      Origin: origin, Authorization: 'Bearer '+token, 'Content-Type': 'application/json',
    }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json() };
  } };
}

async function main() {
  for (const [opts, status] of [[{ sub: OTHER },403],[{ aal: 'aal1' },403],[{ totp: false },403],[{ revoked: true },401]]) {
    for (const recurso of ['marketing-notificacoes','marketing-ler','marketing-resolver']) {
      const h = harness(opts);
      eq((await h.request({ recurso, ...(recurso === 'marketing-notificacoes' ? {} : { ids: [ID] }) })).status,status);
      eq(h.calls.length,0); eq(h.keys.includes('service'),false);
    }
  }
  const h = harness();
  eq((await h.request({ recurso: 'marketing-notificacoes' }, 'https://attacker.invalid')).status,403);
  eq(h.calls.length,0);
  eq((await h.request({ recurso: 'marketing-notificacoes', userId: OTHER })).status,400);
  const list = await h.request({ recurso: 'marketing-notificacoes' });
  eq(list.status,200); eq(list.body.dados.naoLidas,1);
  eq(h.calls.some(x => x.ops.some(o => o[0] === 'update')),false,'abrir sino nao marca leitura');
  eq(JSON.stringify(list.body).includes('SENTINELA'),false);
  const media = harness();
  eq((await media.request({ recurso:'marketing-midia',midiaId:ID })).status,200);
  eq(media.calls[1],{ bucket:'marketing-remoto',objeto:'fixture/video.mp4',seconds:300 });
  eq(JSON.stringify(media.logs).includes('temporary'),false);
  for (const recurso of ['marketing-ler','marketing-resolver']) {
    const x = harness(); eq((await x.request({ recurso, ids: [ID] })).status,200);
    eq(x.calls[0].ops.find(o => o[0] === 'eq')[1],['destinatario_id',ADMIN]);
    eq(Object.keys(x.calls[0].ops.find(o => o[0] === 'update')[1][0]),[recurso === 'marketing-ler' ? 'lida_em' : 'resolvida_em']);
  }
  const good = { medidoEm: WHEN, carencia: false, bancoBytes: 35e6, storageBytes: 13e6,
    egressBytes: 1e6, egressCacheBytes: 1e6, invocacoes: 10000, cronLimpo: true, projecao90DiasSegura: true };
  eq(h.api.bloqueiosCapacidade(good,new Date(WHEN)),[]);
  for (const field of Object.keys(good)) {
    const bad = { ...good }; delete bad[field];
    eq(h.api.bloqueiosCapacidade(bad,new Date(WHEN)).length > 0,true,field+' ausente bloqueia');
  }
  eq(h.api.bloqueiosCapacidade({ ...good, bancoBytes: 350e6 },new Date(WHEN)).includes('bancoBytes'),true);

  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role;');
    await db.exec('create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
    await db.exec(fs.readFileSync('supabase/migrations/20261015190000_admin_marketing_fundacao.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20261016140000_admin_marketing_operacoes.sql','utf8'));
    eq((await db.query("select public,file_size_limit::integer as limite from storage.buckets where id='marketing-remoto'")).rows[0],{ public:false,limite:47185919 });
    for (const role of ['anon','authenticated']) {
      await db.exec('set role '+role);
      for (const rpc of ['reservar','limpar','midias_vencidas','bloquear_recuperacao']) {
        await assert.rejects(db.query('select * from public.admin_marketing_'+rpc+'()'),/permission denied/); checks++;
      }
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    eq((await db.query('select * from public.admin_marketing_reservar()')).rows,[],'nasce bloqueado');
    await db.query(`update public.admin_marketing_controles set habilitado=true,pausa_global=false,pausa_instagram=false,
      capacidade_validada_em=now(),margem_validada_ate=now()+interval '1 hour',recuperacao_pendente=false`);
    const auth = (await db.query(`insert into public.admin_marketing_autorizacoes(chave,admin_id,peca_id,versao,manifesto,rede,conta_destino,formato,publicar_em,confirmado_em)
      values($1,$2,$3,$4,'{}','instagram','123','feed',now()-interval '1 minute',now()-interval '1 day') returning id`,
      ['a'.repeat(64),ADMIN,'b'.repeat(16),'c'.repeat(40)])).rows[0];
    const agenda = (await db.query(`insert into public.admin_marketing_agendamentos(autorizacao_id,estrategia,estado) values($1,'executor-remoto','programado-no-painel') returning id`,[auth.id])).rows[0];
    const claims = await Promise.all([db.query('select * from public.admin_marketing_reservar()'),db.query('select * from public.admin_marketing_reservar()')]);
    eq(claims.reduce((n,r)=>n+r.rows.length,0),1,'duas reservas, um recibo');
    eq((await db.query('select count(*)::integer as n from public.admin_marketing_envios')).rows[0].n,1);
    await db.query(`update public.admin_marketing_agendamentos set lease_expira_em=now()-interval '1 second' where id=$1`,[agenda.id]);
    eq((await db.query('select * from public.admin_marketing_reservar()')).rows,[]);
    eq((await db.query('select estado from public.admin_marketing_agendamentos')).rows[0].estado,'precisa-conferir');
    eq((await db.query('select estado from public.admin_marketing_envios')).rows[0].estado,'incerto');
    await db.query(`insert into public.admin_marketing_eventos(chave,origem,codigo,criado_em,expira_em)
      values($1,'painel','fixture',now()-interval '91 days',now()-interval '1 day')`,['d'.repeat(64)]);
    await db.query(`insert into public.admin_marketing_eventos(chave,origem,codigo) values($1,'painel','fixture')`,['e'.repeat(64)]);
    await db.query(`insert into public.admin_marketing_eventos(chave,origem,codigo) values($1,'painel','fixture')`,['e'.repeat(64)]);
    eq((await db.query('select count(*)::int as n from public.admin_marketing_eventos')).rows[0].n,2,'evento deduplicado');
    eq((await db.query('select public.admin_marketing_limpar() as r')).rows[0].r.eventos,1);
    eq((await db.query('select count(*)::int as n from public.admin_marketing_autorizacoes')).rows[0].n,1,'aceite preservado');
    await db.query(`insert into public.admin_marketing_eventos(chave,origem,codigo)
      select encode(sha256(convert_to('limite-'||i,'UTF8')),'hex'),'painel','fixture' from generate_series(1,999) i`);
    await assert.rejects(db.query(`insert into public.admin_marketing_eventos(chave,origem,codigo) values($1,'painel','fixture')`,['f'.repeat(64)]),/marketing-eventos-limite/); checks++;
    await db.query(`insert into public.admin_marketing_eventos(chave,origem,codigo) values($1,'painel','fixture')`,['e'.repeat(64)]);
    eq((await db.query('select count(*)::int as n from public.admin_marketing_eventos')).rows[0].n,1000,'duplicata no teto nao custa evento');
    await db.query(`insert into public.admin_marketing_notificacoes(destinatario_id,chave,codigo,importancia,criado_em,expira_em)
      select $1,encode(sha256(convert_to('notificacao-'||i,'UTF8')),'hex'),'fixture','informacao',now()-interval '91 days',now()-interval '1 day'
      from generate_series(1,501) i`,[ADMIN]);
    eq((await db.query('select public.admin_marketing_limpar() as r')).rows[0].r.notificacoes,500,'limpeza limitada a 500');
    eq((await db.query('select public.admin_marketing_limpar() as r')).rows[0].r.notificacoes,1,'retomada da limpeza');
    await db.query(`insert into public.admin_marketing_agregados(dia,origem,metrica,quantidade)
      values((current_date-interval '13 months')::date,'meta','fixture',1),
      ((current_date-interval '13 months')::date-1,'meta','fixture',1)`);
    eq((await db.query('select public.admin_marketing_limpar() as r')).rows[0].r.agregados,1,'fronteira 13 meses');
    await db.query(`update public.admin_marketing_agendamentos set estado='publicado',remoto_id='123',concluido_em=now()-interval '8 days' where id=$1`,[agenda.id]);
    await db.query(`insert into public.admin_marketing_midias(agendamento_id,objeto,sha256,bytes,terminal_confirmado_em,excluir_apos)
      select id,'fixture/video.mp4',$2,1,concluido_em,concluido_em+interval '7 days' from public.admin_marketing_agendamentos where id=$1`,[agenda.id,'f'.repeat(64)]);
    eq((await db.query('select * from public.admin_marketing_midias_vencidas()')).rows.length,1);
    await db.query(`update public.admin_marketing_agendamentos set estado='cancelamento-pendente',concluido_em=null where id=$1`,[agenda.id]);
    eq((await db.query('select * from public.admin_marketing_midias_vencidas()')).rows.length,0,'pendente nunca perde midia');
    await db.query('select public.admin_marketing_bloquear_recuperacao()');
    eq((await db.query('select * from public.admin_marketing_reservar()')).rows,[],'restauracao bloqueada');
    eq((await db.query('select recuperacao_pendente,habilitado from public.admin_marketing_controles')).rows[0],{ recuperacao_pendente:true,habilitado:false });
  } finally { await db.close(); }
  console.log(`admin-marketing-remoto: ${checks} verificacoes, modulos reais + SQL isolado`);
}
main().catch(e=>{ console.error(e); process.exitCode=1; });

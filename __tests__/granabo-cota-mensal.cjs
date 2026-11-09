// Handler, helper, cliente e SQL reais; nenhum acesso à rede ou ao Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const { carregar, pedido } = require('./granabo-recusa-conta-bloqueada.cjs');
const migration = 'supabase/migrations/20261109100000_granabo_cota_mensal.sql';
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

(async () => {
  for (const [motivo, status, chamadas] of [['mes', 429, 0], ['minuto', 429, 0], [null, 200, 1]]) {
    const c = carregar({ acesso: true, cotaResposta: [{ permitido: !motivo, motivo, minuto_restante: 9, dia_restante: 0 }] });
    const res = await c.handler(pedido()), body = await res.json();
    assert.equal(res.status, status);
    assert.equal(c.diario.cota, 1);
    assert.equal(c.diario.modelo, chamadas, 'provedor só é chamado quando a RPC autoriza');
    assert.equal(JSON.stringify(c.diario.provedores), JSON.stringify(motivo ? [] : [{
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', modelo: 'gemini-3.5-flash-lite',
    }]), 'nenhuma chamada à Groq/fallback ou ao Gemini quando recusado');
    if (motivo === 'mes') {
      assert.match(body.mensagem, /limite mensal/);
      assert.match(body.mensagem, /\d{2}\/\d{2}\/\d{4}/);
      const api = {};
      vm.runInNewContext(compile('lib/assistente.ts'), { exports: api, process, console,
        require: nome => nome === './modo-teste' ? { MODO_TESTE: false } : nome === './supabase'
          ? { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'fixture' } } }) } } } : {},
        fetch: async () => new Response(JSON.stringify(body), { status: 429 }) });
      await assert.rejects(api.enviarPergunta('fixture'), e => e.message === body.mensagem,
        'cliente antigo preserva exatamente o texto do servidor');
    }
  }
  const falha = carregar({ acesso: true, cotaError: { code: 'PGRST202', message: 'fixture' } });
  assert.equal((await falha.handler(pedido())).status, 503);
  assert.equal(falha.diario.modelo, 0);
  assert.ok(falha.diario.erros.length);

  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create role anon; create role authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('qa.uid', true), '')::uuid $$;
      insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
      set qa.uid = '00000000-0000-0000-0000-000000000001';`);
    await db.exec(fs.readFileSync('supabase/migrations/20260908140000_ai_usage_quotas.sql', 'utf8'));
    await db.exec(fs.readFileSync(migration, 'utf8'));
    const quota = async tipo => (await db.query('select * from public.consumir_cota_ia($1)', [tipo])).rows[0];
    const mes = "date_trunc('month', statement_timestamp() at time zone 'America/Sao_Paulo')::date";
    assert.equal((await quota('assistente')).permitido, true);
    await db.exec(`update public.ai_usage_counters set mes_usos=199, minuto_usos=0 where tipo='assistente'`);
    assert.equal((await quota('assistente')).permitido, true, 'pergunta 200 permitida');
    const recusas = await Promise.all(Array.from({ length: 4 }, () => quota('assistente')));
    assert.ok(recusas.every(r => !r.permitido && r.motivo === 'mes'), '201 e seguintes recusadas');
    assert.equal((await db.query("select mes_usos from public.ai_usage_counters where tipo='assistente'")).rows[0].mes_usos, 200);
    await db.exec(`update public.ai_usage_counters set mes_inicio=(${mes} - interval '1 month')::date, minuto_usos=0 where tipo='assistente'`);
    assert.equal((await quota('assistente')).permitido, true, 'mês novo renova');
    await db.exec("update public.ai_usage_counters set minuto_usos=10 where tipo='assistente'");
    assert.equal((await quota('assistente')).motivo, 'minuto');
    assert.equal((await db.query("select mes_usos from public.ai_usage_counters where tipo='assistente'")).rows[0].mes_usos, 1,
      'recusa por minuto não debita o mês');
    await db.exec(`update public.ai_usage_counters set minuto_usos=0, dia_usos=999 where tipo='assistente'`);
    assert.equal((await quota('assistente')).permitido, true, 'não existe limite diário do Granabô');
    await db.exec("set qa.uid = '00000000-0000-0000-0000-000000000002'");
    assert.equal((await quota('assistente')).permitido, true, 'outro dono tem contador separado');
    await assert.rejects(quota('invalido'), /Tipo de cota inválido/);
    assert.equal((await quota('voz')).permitido, true);
    await db.exec("update public.ai_usage_counters set dia_usos=60 where tipo='voz'");
    assert.equal((await quota('voz')).motivo, 'dia', 'voz preserva 60/dia');
    await db.exec("update public.ai_usage_counters set dia_usos=0, minuto_usos=12 where tipo='voz'");
    assert.equal((await quota('voz')).motivo, 'minuto', 'voz preserva 12/minuto');
    await db.exec("set qa.uid = ''");
    await assert.rejects(quota('assistente'), /Não autenticado/);
    await db.exec("set role authenticated");
    await assert.rejects(db.query('select * from public.ai_usage_counters'), /permission denied/);
  } finally { await db.close(); }
  console.log('OK cota mensal: SQL, handler, provedor e cliente reais; nenhum provedor na recusa.');
})().catch(e => { console.error(e); process.exitCode = 1; });

/* Fronteira agregada de auth.users para o /admin, executada num Postgres embutido.
 * Prova que a funcao devolve so tres numeros, ignora conta apagada e anonima, e que
 * anon/authenticated nao a executam.
 *
 *   node __tests__/admin-contar-contas-migration.cjs */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261008183000_admin_contar_contas.sql'), 'utf8');
let passou = 0;
const ok = (c, n) => { assert.ok(c, n); passou++; console.log('OK ' + n); };
const falha = async (p, re, n) => { await assert.rejects(p, re); passou++; console.log('OK ' + n); };

(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  // Dublê minimo de auth.users com as colunas que a funcao le (as do Supabase hospedado).
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text,
      created_at timestamptz not null, deleted_at timestamptz, is_anonymous boolean not null default false);
    revoke all on schema auth from public;
    insert into auth.users (email, created_at) values
      ('a@x', now() - interval '1 day'), ('b@x', now() - interval '10 days'), ('c@x', now() - interval '40 days');
    insert into auth.users (email, created_at, deleted_at) values ('d@x', now() - interval '1 day', now());
    insert into auth.users (created_at, is_anonymous) values (now() - interval '1 day', true);`);
  await db.exec(sql);
  await db.exec(sql); ok(true, 'migration roda duas vezes sem erro');

  await db.exec('set role service_role');
  const { rows: [r] } = await db.query('select public.admin_contar_contas() as v');
  ok(JSON.stringify(Object.keys(r.v).sort()) === '["novas30d","novas7d","total"]', 'devolve so tres chaves');
  ok(r.v.total === 3 && r.v.novas7d === 1 && r.v.novas30d === 2, 'conta 3 total, 1 em 7d, 2 em 30d; apagada e anonima fora');
  ok(!JSON.stringify(r.v).includes('@'), 'nenhum e-mail no retorno');
  await falha(db.query('select count(*) from auth.users'), /permission denied/, 'service_role continua sem ler auth.users direto');

  for (const papel of ['anon', 'authenticated']) {
    await db.exec(`reset role; set role ${papel}`);
    await falha(db.query('select public.admin_contar_contas()'), /permission denied/, `${papel} nao executa`);
  }
  await db.exec('reset role');
  const { rows: [cfg] } = await db.query(`select prosecdef, proconfig from pg_proc where proname = 'admin_contar_contas'`);
  ok(cfg.prosecdef === true && (cfg.proconfig || []).some((c) => /^search_path=("")?$/.test(c)), 'security definer com search_path vazio');

  console.log(`admin-contar-contas-migration: ${passou} verificacoes verdes`);
})().catch((e) => { console.error(e); process.exitCode = 1; });

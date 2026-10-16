// Executa os SQLs reais num Postgres embutido. Não usa credenciais nem rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const raiz = path.join(__dirname, '..', 'supabase/migrations');
let passou = 0;
function ok(c, nome) { assert.ok(c, nome); passou++; }
(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;`);
    const tabelas = ['feedbacks', 'subscriptions', 'app_release', 'credit_card_invoices', 'whatsapp_pending', 'transactions'];
    for (const tabela of tabelas) await db.exec(`create table public.${tabela} (id integer)`);
    // Replica o ACL real capturado: PUBLIC + anon + authenticated + service_role.
    await db.exec(`create function public.buscar_exemplos_similares(uuid,text,integer) returns integer language sql as 'select 1';
      create function public.registrar_memoria_assistente(uuid,text,text,text) returns integer language sql as 'select 1';
      create function public.validar_wallet_do_usuario() returns trigger language plpgsql as 'begin return new; end';`);
    const funcoes = ['buscar_exemplos_similares(uuid,text,integer)', 'registrar_memoria_assistente(uuid,text,text,text)', 'validar_wallet_do_usuario()'];
    const privilegio = async (papel, objeto, tipo, funcao = false) => {
      const { rows: [r] } = await db.query(`select ${funcao ? 'has_function_privilege' : 'has_table_privilege'}($1,$2,$3) as pode`, [papel, `public.${objeto}`, tipo]);
      return r.pode;
    };
    for (const fn of funcoes) ok(await privilegio('anon', fn, 'EXECUTE', true), `fixture replica EXECUTE anônimo de ${fn}`);
    const sql = fs.readFileSync(path.join(raiz, '20261015200000_revoga_privilegios_indevidos.sql'), 'utf8');
    await db.exec(sql);
    await db.exec(sql); // reaplicação não reabre acesso
    for (const fn of funcoes) {
      ok(!await privilegio('anon', fn, 'EXECUTE', true), `anon perde EXECUTE efetivo de ${fn}, inclusive via PUBLIC`);
      ok(await privilegio('authenticated', fn, 'EXECUTE', true), `authenticated preservado em ${fn}`);
      ok(await privilegio('service_role', fn, 'EXECUTE', true), `service_role preservado em ${fn}`);
    }
    for (const papel of ['anon', 'authenticated']) {
      for (const tipo of ['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) {
        ok(!await privilegio(papel, 'transactions', tipo), `${papel} perde ${tipo}`);
      }
    }
    ok(await privilegio('authenticated', 'feedbacks', 'INSERT'), 'feedback continua gravável pelo cliente');
    ok(await privilegio('authenticated', 'subscriptions', 'SELECT'), 'exportação mantém leitura de subscriptions');
    ok(await privilegio('authenticated', 'transactions', 'INSERT'), 'escrita do app preservada');
    ok(await privilegio('service_role', 'subscriptions', 'UPDATE'), 'webhook mantém escrita de assinatura');
    ok(!await privilegio('authenticated', 'whatsapp_pending', 'SELECT'), 'fila WhatsApp segue só servidor');
    await db.exec('create table public.fixture_tabela_futura (id integer)');
    for (const papel of ['anon', 'authenticated']) for (const tipo of ['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) {
      ok(!await privilegio(papel, 'fixture_tabela_futura', tipo), `tabela futura não entrega ${tipo} a ${papel}`);
    }
    for (const tipo of ['INSERT', 'UPDATE', 'DELETE']) ok(!await privilegio('anon', 'fixture_tabela_futura', tipo), `futura sem ${tipo} de anon`);

    // O UPDATE real da V-2 preserva o bucket avatars e todos os objetos.
    await db.exec(`create schema storage;
      create table storage.buckets (id text primary key, public boolean, file_size_limit integer);
      create table storage.objects (id integer primary key, bucket_id text);
      insert into storage.buckets values ('marketing',true,123),('avatars',true,456);
      insert into storage.objects values (1,'marketing'),(2,'avatars');`);
    const { rows: antes } = await db.query('select * from storage.objects order by id');
    const bucketSql = fs.readFileSync(path.join(raiz, '20261015200100_bucket_marketing_privado.sql'), 'utf8');
    await db.exec(bucketSql); await db.exec(bucketSql);
    const { rows: buckets } = await db.query('select * from storage.buckets order by id');
    assert.deepEqual(buckets, [ { id: 'avatars', public: true, file_size_limit: 456 }, { id: 'marketing', public: false, file_size_limit: 123 } ]);
    passou++;
    const { rows: depois } = await db.query('select * from storage.objects order by id');
    assert.deepEqual(depois, antes); passou++;
    console.log(`OK seguranca-migrations-execucao: ${passou} verificações locais; nenhuma aplicação em produção.`);
  } finally { await db.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });

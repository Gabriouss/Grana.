/*
 * Parte do T8 (__tests__/sobra-lancamento-servidor.cjs), do parecer do Lynx de
 * 22/11/2026: executa o SQL de VOLTA real em ida e volta, com os cenários das
 * sondas (A1, A1b), o seletor de carteira (A2), o espelho do schema.sql (A6) e
 * a migration como transação (A7). Tudo em PGlite, com os arquivos reais.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { migration, novoUsuario, tentar } = require('./postgres-t5.cjs');

const ARQUIVO_VOLTA = path.join(__dirname, '..', '..', 'supabase', 'volta', '20261121120000_sobra_vira_lancamento.volta.sql');
const volta = () => fs.readFileSync(ARQUIVO_VOLTA, 'utf8').replace(/\r\n/g, '\n');
const linhas = async (db, sql, args) => (await db.query(sql, args)).rows;

/* Tudo o que é dinheiro, linha a linha, para provar que abortar não mexeu em nada. */
const dinheiro = async (db) => JSON.stringify([
  await linhas(db, 'select to_jsonb(s) j from public.sobra_do_mes s order by user_id, mes'),
  await linhas(db, 'select to_jsonb(t) j from public.transactions t order by id'),
]);

/* O que a migration mexe no catálogo: a volta tem de devolver igual. */
const catalogo = async (db) => ({
  funcoes: await linhas(db, `select p.proname, pg_get_functiondef(p.oid) def, p.proacl::text acl, obj_description(p.oid) obs from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname ~ '(sobra|entradas_por_carteira|get_gamification_summary)' order by 1`),
  colunas: await linhas(db, "select column_name, data_type from information_schema.columns where table_name = 'sobra_do_mes' order by 1"),
  restricoes: await linhas(db, "select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid = 'public.sobra_do_mes'::regclass order by 1"),
  indices: await linhas(db, "select indexname from pg_indexes where tablename = 'sobra_do_mes' order by 1"),
});

async function rodar(db, sql) {
  const r = await tentar(() => db.exec(sql));
  if (!r.ok) await db.exec('rollback');
  return r;
}

module.exports = async function idaEVolta({ ok, preparar, como, rpc, carteira, lancs, sobra, trecho }) {
  /* Um dono com Principal e outra carteira, a sobra legada, já migrado. */
  async function migrado(legada = 50) {
    let u, o;
    const db = await preparar({ antes: async (d) => {
      u = await novoUsuario(d);
      await carteira(d, u, true, 'Principal');
      o = await carteira(d, u, false, 'Outra');
      if (legada !== null) await d.query("insert into public.sobra_do_mes (user_id, mes, valor) values ($1,'2026-11',$2)", [u, legada]);
    } });
    return { db, u, o };
  }

  // A2 e A6.
  {
    let u, p, o, antes;
    const ler = (db) => como(db, u, () => linhas(db, 'select wallet_id, entradas::float8 entradas from public.entradas_por_carteira() order by entradas'));
    const db = await preparar({ antes: async (d) => {
      u = await novoUsuario(d); p = await carteira(d, u, true, 'Principal'); o = await carteira(d, u, false, 'Outra');
      await d.query("insert into public.transactions (user_id,type,description,amount,category,occurred_on,wallet_id) values ($1,'in','AUDIT',5000,'Salário','2026-10-05',$2), ($1,'in','AUDIT',70,'Outros','2026-10-06',$3)", [u, p, o]);
      await d.query("insert into public.sobra_do_mes (user_id, mes, valor) values ($1,'2026-11',300)", [u]);
      antes = await ler(d);
    } });
    try {
      assert.equal(antes.length, 2, 'fixture do seletor');
      const igualAntes = async () => JSON.stringify(await ler(db)) === JSON.stringify(antes);
      ok(await igualAntes(), 'A2 seletor: 5000 continuam 5000 depois da migration');
      await como(db, u, () => rpc(db, '2026-12', 200));
      ok(await igualAntes(), 'A2 seletor: a sobra de dezembro não acumula');
      await db.query("update public.transactions set category='Outros' where user_id=$1 and amount=200", [u]);
      ok((await ler(db)).some((l) => l.wallet_id === p && l.entradas === 5200), 'A2 seletor: recategorizada vira entrada comum');

      for (const nome of ['entradas_por_carteira', 'get_gamification_summary']) {
        const def = async () => (await linhas(db, 'select pg_get_functiondef($1::regprocedure) d', [`public.${nome}()`]))[0].d;
        const daMigration = await def();
        await db.exec(trecho(new RegExp(`create or replace function public\\.${nome}\\(\\)[\\s\\S]*?\\n\\$\\$;`), nome));
        ok(await def() === daMigration, `A6 reaplicar o schema.sql não desfaz ${nome}`);
      }
    } finally { await db.close(); }
  }

  // A1: ida e volta sem edição devolve o banco de antes, e reaplicar converte de novo.
  {
    const db = await preparar({ migrar: false });
    try {
      const u = await novoUsuario(db);
      await carteira(db, u, true, 'Principal');
      await db.query("insert into public.sobra_do_mes (user_id, mes, valor) values ($1,'2026-11',50), ($1,'2026-10',0)", [u]);
      const antes = await catalogo(db);
      await db.exec(migration('20261121120000'));
      const r = await rodar(db, volta());
      const s = await linhas(db, 'select mes, valor::float8 v from public.sobra_do_mes order by mes');
      ok(r.ok && JSON.stringify(s) === JSON.stringify([{ mes: '2026-10', v: 0 }, { mes: '2026-11', v: 50 }]), 'A1 volta sem edição: repõe 50 e o zero segue zero');
      ok((await lancs(db, u)).length === 0, 'A1 volta sem edição: o lançamento ligado sai');
      const depois = await catalogo(db);
      for (const parte of Object.keys(antes)) ok(JSON.stringify(depois[parte]) === JSON.stringify(antes[parte]), `A1 volta devolve ${parte} como antes da migration`);
      await db.exec(migration('20261121120000'));
      ok((await lancs(db, u))[0]?.amount === 50 && (await sobra(db, u, '2026-11')).valor === 0, 'A1 reaplicar depois da volta converte os mesmos 50');
    } finally { await db.close(); }
  }

  // A1: edições que continuam sendo a sobra levam o valor atual.
  for (const [nome, sql, esperado] of [
    ['valor editado para 80', 'update public.transactions set amount=80', 80],
    ['descrição e cor editadas', "update public.transactions set description='AUDIT', color='#12a8de'", 50],
    ['legado sem carteira', 'update public.transactions set wallet_id=null', 50],
    ['pagamento em débito', "update public.transactions set payment_method='debit'", 50],
    ['lançamento apagado', 'delete from public.transactions', 0],
  ]) {
    const { db, u } = await migrado();
    try {
      await db.exec(sql);
      const r = await rodar(db, volta());
      const [s] = await linhas(db, 'select valor::float8 v from public.sobra_do_mes');
      ok(r.ok && s.v === esperado && (await lancs(db, u)).length === 0, `A1 volta, ${nome}: repõe ${esperado} (veio ${s.v})`);
    } finally { await db.close(); }
  }

  // A1b: mudou de natureza, aborta inteira sem apagar.
  const ligarFilho = async ({ db, u }) => {
    const [pai] = await lancs(db, u);
    await db.query("insert into public.transactions (user_id,type,description,amount,category,occurred_on,parent_id) values ($1,'in','AUDIT',50,'Sobra do mês','2026-12-01',$2)", [u, pai.id]);
  };
  for (const [nome, mudar] of [
    ['virou saída de 50', ({ db }) => db.exec("update public.transactions set type='out', category='Outros'")],
    ['só virou saída', ({ db }) => db.exec("update public.transactions set type='out'")],
    ['virou série com outro mês', async (c) => { await c.db.exec('update public.transactions set recurring=true'); await ligarFilho(c); }],
    ['recorrente ainda sem filhos', ({ db }) => db.exec('update public.transactions set recurring=true')],
    ['tem filho sem ser recorrente', ligarFilho],
    ['virou filho de outro lançamento', async ({ db, u }) => {
      const [pai] = await linhas(db, "insert into public.transactions (user_id,type,description,amount,category,occurred_on) values ($1,'in','AUDIT',9,'Outros','2026-09-01') returning id", [u]);
      await db.query("update public.transactions set parent_id=$1 where category='Sobra do mês'", [pai.id]);
    }],
    ['virou parcela', ({ db }) => db.exec('update public.transactions set installment_current=1, installment_total=3')],
    ['mudou de mês', ({ db }) => db.exec("update public.transactions set occurred_on='2026-12-01'")],
    ['saiu do dia 1', ({ db }) => db.exec("update public.transactions set occurred_on='2026-11-02'")],
    ['mudou de carteira', ({ db, o }) => db.query('update public.transactions set wallet_id=$1', [o])],
    ['mudou de categoria', ({ db }) => db.exec("update public.transactions set category='Salário'")],
    ['foi para o crédito', ({ db }) => db.exec("update public.transactions set payment_method='credit'")],
    ['passou do teto da sobra', ({ db }) => db.exec('update public.transactions set amount=100000000')],
  ]) {
    const c = await migrado();
    try {
      await mudar(c);
      const antes = await dinheiro(c.db);
      const r = await rodar(c.db, volta());
      ok(!r.ok && /volta abortada/.test(r.message) && await dinheiro(c.db) === antes, `A1b volta, ${nome}: aborta sem apagar nem alterar`);
    } finally { await c.db.close(); }
  }

  // A1b: um problema numa conta segura a volta de todas.
  {
    const c = await migrado();
    try {
      const b = await novoUsuario(c.db);
      await carteira(c.db, b, true);
      await como(c.db, b, () => rpc(c.db, '2026-11', 120));
      await c.db.query("update public.transactions set type='out' where user_id=$1", [b]);
      const antes = await dinheiro(c.db);
      ok(!(await rodar(c.db, volta())).ok && await dinheiro(c.db) === antes, 'A1b uma linha divergente: nenhuma conta é revertida pela metade');
    } finally { await c.db.close(); }
  }

  // A1b: trava antes de ler, e confirmação no meio (sonda D; ordem simulada numa conexão).
  {
    const c = await migrado(null);
    try {
      const sql = volta();
      const trava = sql.match(/^lock table[^;]*;/m);
      ok(!!trava && sql.indexOf(trava[0]) < sql.search(/^(update|delete|create|alter|drop|do) /m), 'A1b a trava vem antes de qualquer leitura ou escrita da volta');
      if (trava) {
        await c.db.exec(sql.slice(0, sql.indexOf(trava[0]) + trava[0].length));
        const l = await linhas(c.db, "select c.relname from pg_locks l join pg_class c on c.oid = l.relation where l.mode = 'AccessExclusiveLock' and c.relname in ('sobra_do_mes','transactions')");
        const [{ t }] = await linhas(c.db, "select current_setting('lock_timeout') t");
        await c.db.exec('rollback');
        ok(l.length === 2, 'A1b trava exclusiva nas duas tabelas');
        ok(t === '5s', 'A1b a volta desiste em 5 s se não pegar a trava');
      }
      const corte = sql.indexOf('-- 4. Repõe');
      ok(corte > 0, 'A1b a lista de ids é fixada antes de repor o valor');
      if (corte > 0) {
        await c.db.exec(sql.slice(0, corte));
        await c.db.query("select set_config('app.uid', $1, true)", [c.u]);
        await rpc(c.db, '2026-12', 120);
        await c.db.exec(sql.slice(corte));
        const [s] = await linhas(c.db, 'select coalesce(sum(valor),0)::float8 v from public.sobra_do_mes');
        const [l] = await linhas(c.db, 'select coalesce(sum(amount),0)::float8 v from public.transactions');
        ok(s.v + l.v === 120, `A1b confirmação no meio da volta: os 120 existem uma vez (sobra ${s.v}, lançamento ${l.v})`);
      }
    } finally { await c.db.close(); }
  }

  // A1b: só sai o que está ligado; a legada de cliente antigo fica.
  {
    const c = await migrado();
    try {
      await c.db.query("insert into public.sobra_do_mes (user_id, mes, valor) values ($1,'2026-12',33)", [c.u]);
      await c.db.query("insert into public.transactions (user_id,type,description,amount,category,occurred_on) values ($1,'in','AUDIT',7,'Sobra do mês','2026-11-09')", [c.u]);
      const r = await rodar(c.db, volta());
      const [s] = await linhas(c.db, "select valor::float8 v from public.sobra_do_mes where mes='2026-12'");
      ok(r.ok && s.v === 33 && (await lancs(c.db, c.u)).map((l) => l.amount).join() === '7', 'A1b a volta só apaga o que está ligado e mantém a legada');
    } finally { await c.db.close(); }
  }

  // A7.
  const legado = async (d) => {
    const u = await novoUsuario(d);
    await carteira(d, u, true);
    await d.query("insert into public.sobra_do_mes (user_id, mes, valor) values ($1,'2026-11',266.31), ($1,'2026-12',40)", [u]);
  };
  const intacto = async (db) => {
    const [r] = await linhas(db, "select (select sum(valor) from public.sobra_do_mes)::float8 v, (select count(*) from public.transactions)::int t, (select count(*) from information_schema.columns where table_name='sobra_do_mes' and column_name='convertida')::int c");
    return r.v === 306.31 && r.t === 0 && r.c === 0;
  };
  const sql = migration('20261121120000');
  {
    /* Cliente em autocommit: um comando por vez, e segue depois do erro. */
    const db = await preparar({ migrar: false, antes: legado });
    try {
      const comandos = sql.replace(/^\s*--.*$/gm, '').match(/(?:\$\$[\s\S]*?\$\$|[^;])+;/g).map((c) => c.trim());
      const fim = comandos.at(-1) === 'commit;' ? comandos.length - 1 : comandos.length;
      comandos.splice(fim, 0, 'select 1/0;');
      for (const comando of comandos) await tentar(() => db.exec(comando));
      await tentar(() => db.exec('rollback'));
      ok(await intacto(db), 'A7 erro no fim em autocommit: nada fica pela metade');
    } finally { await db.close(); }
  }
  {
    const db = await preparar({ migrar: false, antes: legado });
    try {
      const corte = sql.lastIndexOf('\ncommit;');
      let t = null;
      if (corte > 0) {
        await db.exec(sql.slice(0, corte));
        t = (await linhas(db, "select current_setting('lock_timeout') t"))[0].t;
        await db.exec('rollback');
      }
      ok(t === '5s', 'A7 migration numa transação, com lock_timeout de 5 s');
    } finally { await db.close(); }
  }
  for (const [nome, corpo] of [
    ['gatilho arredonda o valor', 'new.amount := round(new.amount); return new;'],
    ['gatilho engole o lançamento', 'return null;'],
    ['gatilho troca o tipo', "new.type := 'out'; return new;"],
  ]) {
    const db = await preparar({ migrar: false, antes: async (d) => {
      await legado(d);
      await d.exec(`create function public.interfere() returns trigger language plpgsql as $$ begin ${corpo} end $$;
        create trigger interfere before insert on public.transactions for each row execute function public.interfere();`);
    } });
    try {
      const r = await rodar(db, sql);
      ok(!r.ok && /soma convertida/.test(r.message) && await intacto(db), `A7 ${nome}: soma diferente aborta tudo`);
    } finally { await db.close(); }
  }
};

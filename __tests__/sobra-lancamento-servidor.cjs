/*
 * Sobra do mês vira lançamento: migration 20261121120000 num Postgres de
 * verdade (PGlite), com RLS e permissões de coluna (T8 do plano de 21/11/2026).
 *
 *   node __tests__/sobra-lancamento-servidor.cjs
 *
 * Migrations REAIS: 20261107120000 (tabela sobra_do_mes) e 20261121120000.
 * `transactions`, `wallets`, a policy e as permissões de coluna de
 * `transactions` saem do supabase/schema.sql. Stubs: auth.uid(),
 * tem_direito_acesso() (controlado por app.acesso) e uma `bills` mínima para
 * o resumo de conquistas. Afirma QUANTOS lançamentos existem depois de cada
 * chamada. Inclui um mutante do gatilho (restaurar transaction_id) para provar
 * que o teste de apagar o pega. A ida e volta, o seletor e a transação ficam
 * em helpers/sobra-ida-e-volta.cjs, executado aqui.
 */
const fs = require('node:fs');
const path = require('node:path');
const { novoBanco, aplicar, migration, novoUsuario, tentar } = require('./helpers/postgres-t5.cjs');
const idaEVolta = require('./helpers/sobra-ida-e-volta.cjs');

const watchdog = setTimeout(() => { console.error('sobra-lancamento-servidor: não concluiu'); process.exit(1); }, 180000);
const raiz = path.join(__dirname, '..');
const schema = fs.readFileSync(path.join(raiz, 'supabase', 'schema.sql'), 'utf8').replace(/\r\n/g, '\n');
const trecho = (re, nome) => { const m = schema.match(re); if (!m) throw new Error('schema.sql sem ' + nome); return m[0]; };
let checagens = 0, falhas = 0;
/* Não para na primeira: o RED mostra todos os achados de uma vez. */
const ok = (c, nome) => { if (c) { checagens++; console.log('  ok  ' + nome); } else { falhas++; console.error('  FALHA  ' + nome); } };
const COR = '#b0f7d4'; // escolha de 22/11/2026, medida contra as nove cores padrão
/* `get_gamification_summary` anterior a esta migration (b34be610): é o estado a que a volta retorna. */
const GAMIFICACAO_ANTES = `create or replace function public.get_gamification_summary()
returns table (
  transaction_count bigint,
  income_count bigint,
  expense_count bigint,
  income_total numeric,
  expense_category_count bigint,
  paid_bill_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*) from public.transactions t where t.user_id = (select auth.uid())),
    (select count(*) from public.transactions t where t.user_id = (select auth.uid()) and t.type = 'in'),
    (select count(*) from public.transactions t where t.user_id = (select auth.uid()) and t.type = 'out'),
    (select coalesce(sum(t.amount), 0) from public.transactions t where t.user_id = (select auth.uid()) and t.type = 'in'),
    (select count(distinct t.category) from public.transactions t where t.user_id = (select auth.uid()) and t.type = 'out'),
    (select count(*) from public.bills b where b.user_id = (select auth.uid()) and b.status = 'paid');
$$;
revoke all on function public.get_gamification_summary() from public, anon;
grant execute on function public.get_gamification_summary() to authenticated, service_role;`;

async function preparar({ mutante = false, antes, migrar = true } = {}) {
  const db = await novoBanco();
  await db.exec(`
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.bills (id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null default 'pending');
    create function public.tem_direito_acesso() returns boolean language sql stable
      as $$ select (select auth.uid()) is not null and coalesce(current_setting('app.acesso', true), 'sim') <> 'nao' $$;
    grant execute on function public.tem_direito_acesso() to authenticated;
    -- Colunas citadas nas permissões de coluna e fora do recorte do helper.
    alter table public.transactions add column if not exists bank text, add column if not exists fitid text;
    alter table public.transactions enable row level security;
    grant select, delete on public.transactions to authenticated;
    alter table public.wallets enable row level security;
    create policy carteira_dono on public.wallets for select to authenticated using ((select auth.uid()) = user_id);
    grant select on public.wallets to authenticated;
    grant select on public.bills to authenticated;
  `);
  await db.exec(trecho(/create policy "transactions: dono com acesso"[\s\S]*?\);\n/, 'policy de transactions'));
  await db.exec(trecho(/revoke insert on public\.transactions from authenticated;[\s\S]*?on public\.transactions to authenticated;\nrevoke update[\s\S]*?on public\.transactions to authenticated;/, 'permissões de coluna'));
  await db.exec(migration('20261107120000'));
  await db.exec(migration('20260925000000'));
  await db.exec(GAMIFICACAO_ANTES);
  await db.exec(migration('20260904190000').match(/create or replace function public\.contextos_push_habito[\s\S]*?to service_role;/)[0]);
  if (antes) await antes(db);
  if (!migrar) return db;
  const trocas = mutante ? [['new.convertida := true;', 'new.convertida := true;\n    new.transaction_id := old.transaction_id;']] : [];
  await aplicar(db, '20261121120000', trocas);
  return db;
}

async function como(db, uid, fn, acesso = 'sim') {
  await db.exec('set role authenticated');
  await db.query("select set_config('app.uid', $1, false), set_config('app.acesso', $2, false)", [uid, acesso]);
  try { return await fn(); } finally { await db.exec('reset role'); await db.query("select set_config('app.uid', '', false)"); }
}
const rpc = (db, mes, valor) => db.query('select public.confirmar_sobra_do_mes($1, $2) r', [mes, valor]).then((x) => x.rows[0].r);
const sobra = async (db, u, mes) => (await db.query('select valor::float8 valor, transaction_id, convertida from public.sobra_do_mes where user_id=$1 and mes=$2', [u, mes])).rows[0];
const lancs = async (db, u) => (await db.query("select id, type, amount::float8 amount, category, color, description, to_char(occurred_on,'YYYY-MM-DD') dia, wallet_id, payment_method, card_id, recurring from public.transactions where user_id=$1 and category='Sobra do mês' order by occurred_on", [u])).rows;
async function carteira(db, u, padrao, nome = 'AUDIT') {
  return (await db.query('insert into public.wallets (user_id, name, is_default) values ($1,$2,$3) returning id', [u, nome, padrao])).rows[0].id;
}

async function principal() {
  // Sobras legadas confirmadas antes da migration (cliente de 07/11).
  let legadoA, legadoSemPadrao, legadoZero;
  const db = await preparar({ antes: async (d) => {
    legadoA = await novoUsuario(d); legadoSemPadrao = await novoUsuario(d); legadoZero = await novoUsuario(d);
    await carteira(d, legadoA, false, 'Outra');
    const principalA = await carteira(d, legadoA, true, 'Principal');
    d.principalA = principalA;
    await d.query("insert into public.sobra_do_mes (user_id, mes, valor) values ($1,'2026-11',266.31), ($2,'2026-11',40), ($3,'2026-11',0)", [legadoA, legadoSemPadrao, legadoZero]);
  } });
  try {
    // Conversão da migration.
    {
      const [l] = await lancs(db, legadoA);
      const s = await sobra(db, legadoA, '2026-11');
      ok(l && l.amount === 266.31 && l.type === 'in' && l.dia === '2026-11-01', 'conversão: sobra legada vira entrada de R$ 266,31 no dia 1');
      ok(l.description === 'Sobra de outubro' && l.color === COR && l.wallet_id === db.principalA, 'conversão: "Sobra de outubro", cor da paleta, Principal pelo is_default');
      ok(l.payment_method === null && l.card_id === null && l.recurring === false, 'conversão: fora do crédito e sem recorrência');
      ok(s.valor === 0 && s.convertida === true && s.transaction_id === l.id, 'conversão: linha fica valor 0, convertida e ligada');
      const [sp] = await lancs(db, legadoSemPadrao);
      ok(sp && sp.wallet_id === null, 'conversão: dono sem carteira padrão recebe wallet_id nulo');
      ok((await lancs(db, legadoZero)).length === 0 && (await sobra(db, legadoZero, '2026-11')).convertida, 'conversão: sobra 0 só fica convertida, sem lançamento');
      await db.exec(migration('20261121120000'));
      ok((await lancs(db, legadoA)).length === 1 && (await lancs(db, legadoSemPadrao)).length === 1, 'conversão idempotente: rodar a migration de novo não duplica');
    }

    const a = await novoUsuario(db), b = await novoUsuario(db);
    const pa = await carteira(db, a, true, 'Principal');
    await carteira(db, b, true, 'Principal');

    // Confirmar: um lançamento, idempotente.
    {
      const r = await como(db, a, () => rpc(db, '2026-11', 150.005));
      const l = await lancs(db, a);
      ok(r.estado === 'convertida' && l.length === 1 && l[0].amount === 150.01 && l[0].wallet_id === pa, 'confirmar: um lançamento, centavos arredondados, na Principal');
      const r2 = await como(db, a, () => rpc(db, '2026-11', 999));
      ok(r2.estado === 'convertida' && r2.transaction_id === l[0].id && (await lancs(db, a)).length === 1, 'segunda chamada (outro aparelho, clique duplo): nada novo');
      const s = await sobra(db, a, '2026-11');
      ok(s.valor === 0 && s.transaction_id === l[0].id, 'linha respondida aponta para o lançamento');
    }
    // Cliente antigo com estado velho: upsert de valor numa linha convertida.
    {
      await como(db, a, () => db.query("insert into public.sobra_do_mes (user_id, mes, valor) values ($1,'2026-11',150.01) on conflict (user_id, mes) do update set valor = excluded.valor", [a]));
      const s = await sobra(db, a, '2026-11');
      ok(s.valor === 0 && s.convertida === true, 'gatilho: upsert antigo sobre linha convertida não regrava o valor');
    }
    // Apagar o lançamento: a ligação some, a pergunta não volta (P3).
    {
      const [l] = await lancs(db, a);
      const r = await tentar(() => como(db, a, () => db.query('delete from public.transactions where id=$1', [l.id])));
      ok(r.ok, 'apagar o lançamento funciona com o gatilho (sem violação de chave): ' + (r.message || ''));
      const s = await sobra(db, a, '2026-11');
      ok(s.transaction_id === null && s.convertida === true && s.valor === 0, 'depois de apagar: sem ligação, continua respondida');
      await como(db, a, () => rpc(db, '2026-11', 80));
      ok((await lancs(db, a)).length === 0, 'confirmar de novo no mesmo mês não recria (a pergunta não volta)');
    }
    // Valor 0: responde sem lançamento.
    {
      const r = await como(db, a, () => rpc(db, '2026-12', 0));
      const s = await sobra(db, a, '2026-12');
      ok(r.estado === 'convertida' && s.convertida && s.transaction_id === null && (await lancs(db, a)).length === 0, 'sobra 0: linha respondida, nenhum lançamento');
    }
    // Linha legada criada por cliente antigo DEPOIS da migration: conversão sob demanda.
    {
      await como(db, b, () => db.query("insert into public.sobra_do_mes (user_id, mes, valor) values ($1,'2026-11',50)", [b]));
      const antes = await sobra(db, b, '2026-11');
      ok(antes.valor === 50 && antes.convertida === false, 'cliente antigo ainda grava a linha legada');
      const pendente = await como(db, b, () => rpc(db, '2026-10', null));
      ok(pendente.estado === 'pendente' && !(await sobra(db, b, '2026-10')), 'converter sem linha: pendente, nada gravado');
      await como(db, b, () => rpc(db, '2026-11', null));
      const [l] = await lancs(db, b);
      ok(l && l.amount === 50 && (await sobra(db, b, '2026-11')).valor === 0, 'converter (p_valor nulo) transforma a legada em lançamento de R$ 50');
      await como(db, b, () => db.query("insert into public.sobra_do_mes (user_id, mes, valor) values ($1,'2027-01',30)", [b]));
      await como(db, b, () => rpc(db, '2027-01', 70));
      const l2 = (await lancs(db, b)).find((x) => x.dia === '2027-01-01');
      ok(l2 && l2.amount === 30 && l2.description === 'Sobra de dezembro', 'linha legada já respondida: vale o valor dela, não o novo; virada de ano no nome');
    }
    // RLS e dono.
    {
      const outra = await como(db, b, () => db.query('select count(*)::int n from public.sobra_do_mes where user_id=$1', [a]));
      ok(outra.rows[0].n === 0, 'RLS: B não vê a sobra de A');
      await como(db, b, () => rpc(db, '2027-02', 10));
      ok((await lancs(db, a)).length === 0 && (await sobra(db, a, '2027-02')) === undefined, 'RPC de B só grava para B');
      const txA = (await como(db, a, () => rpc(db, '2027-03', 5))).transaction_id;
      await db.query("insert into public.sobra_do_mes (user_id, mes, valor) values ($1,'2027-04',0)", [b]);
      const forjar = await tentar(() => como(db, b, () => db.query("update public.sobra_do_mes set transaction_id=$1 where user_id=$2 and mes='2027-04'", [txA, b])));
      ok(!forjar.ok, 'chave composta: B não liga a própria sobra a um lançamento de A');
      const semAcesso = await tentar(() => como(db, a, () => rpc(db, '2027-05', 10), 'nao'));
      ok(!semAcesso.ok && semAcesso.code === '42501', 'tem_direito_acesso falso: RPC recusa com 42501');
      const semSessao = await tentar(() => rpc(db, '2027-05', 10));
      ok(!semSessao.ok && semSessao.code === '42501', 'sem sessão: RPC recusa');
      const invalido = await tentar(() => como(db, a, () => rpc(db, '2027-13', 10)));
      ok(!invalido.ok && invalido.code === '22023', 'mês inválido: recusa');
      const acl = (await db.query("select has_function_privilege('anon','public.confirmar_sobra_do_mes(text,numeric)','execute') a")).rows[0];
      ok(acl.a === false, 'anon não executa a RPC');
    }
    // P4: conquistas sem a sobra.
    {
      const c = await novoUsuario(db);
      await carteira(db, c, true);
      await db.query("insert into public.transactions (user_id,type,description,amount,category,occurred_on) values ($1,'in','Salário',1000,'Salário','2026-11-05')", [c]);
      await como(db, c, () => rpc(db, '2026-11', 300));
      const g = await como(db, c, () => db.query('select * from public.get_gamification_summary()').then((x) => x.rows[0]));
      ok(Number(g.income_count) === 1 && Number(g.income_total) === 1000 && Number(g.transaction_count) === 1, 'conquistas: a sobra fica fora da contagem e do total de receitas');
    }
  } finally { await db.close(); }

  // Mutante: gatilho que restaura transaction_id quebra o apagar. O teste acima tem de pegar.
  {
    const m = await preparar({ mutante: true });
    try {
      const u = await novoUsuario(m);
      await carteira(m, u, true);
      await como(m, u, () => rpc(m, '2026-11', 10));
      const [l] = await lancs(m, u);
      const r = await tentar(() => como(m, u, () => m.query('delete from public.transactions where id=$1', [l.id])));
      const s = await sobra(m, u, '2026-11');
      /* Medido em 21/11/2026 (PG 18 do PGlite): o Postgres NÃO dá erro; apaga o
         lançamento e deixa a ligação pendurada em silêncio. É a checagem
         "sem ligação depois de apagar" acima que pega o mutante. */
      ok(!r.ok || s.transaction_id !== null, 'mutante (gatilho restaura transaction_id): ligação fica pendurada, e a checagem de apagar acima o pega');
    } finally { await m.close(); }
  }
  await idaEVolta({ ok, preparar, como, rpc, carteira, lancs, sobra, trecho });
  if (falhas) process.exitCode = 1;
  console.log(`\nsobra-lancamento-servidor: ${checagens} checagens ok, ${falhas} falhas`);
}
principal().then(() => clearTimeout(watchdog), (e) => { clearTimeout(watchdog); console.error(e); process.exitCode = 1; });

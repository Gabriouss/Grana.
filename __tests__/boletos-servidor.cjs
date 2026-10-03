/*
 * Boletos (bills) no servidor, num Postgres de verdade (PGlite), com as RPCs e
 * migrations REAIS: 20260919150000 (reabrir desfaz a proxima), 20261002120000
 * (apagar a cabeca promove outra) e as quatro de 02/10/2026:
 *
 *   B3 20261002140000  a serie mantem o dia desejado (31/01 -> 28/02 -> 31/03)
 *   B6 20261002150000  reabrir so apaga a proxima se ela segue como foi criada
 *   B5 20261002160000  apagar a saida vinculada reabre o boleto
 *   B4 20261002170000  editar boleto pago atualiza a saida vinculada
 *
 *   node __tests__/boletos-servidor.cjs
 *
 * Cada mutante quebra UMA linha de uma migration e o mesmo roteiro tem de
 * FALHAR. Nunca conecta a producao.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { novoBanco, aplicar, novoUsuario, tentar } = require('./helpers/postgres-t5.cjs');

const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8').replace(/\r\n/g, '\n');
const trecho = (regex, nome) => {
  const m = schema.match(regex);
  if (!m) throw new Error('trecho do schema.sql nao encontrado: ' + nome + ' (o schema mudou?)');
  return m[0];
};

const MIGRATIONS = ['20260919150000', '20261002120000', '20261002140000', '20261002150000', '20261002160000', '20261002170000'];
let aprovadas = 0;
const ok = (r) => { aprovadas++; console.log('  ok  ' + r); };

async function preparar(trocas = {}) {
  const db = await novoBanco();
  await db.exec(trecho(/create table if not exists bills \([\s\S]*?\n\);/, 'bills'));
  for (const col of ['recurring', 'paid_transaction_id', 'wallet_id']) {
    await db.exec(trecho(new RegExp('alter table bills add column if not exists ' + col + '[^;]*;'), col));
  }
  await db.exec(trecho(/alter table public\.bills add column if not exists parent_id[^;]*;/, 'parent_id'));
  for (const nome of ['bills_user_id_id_uniq', 'bills_recurrence_occurrence_uniq']) {
    await db.exec(trecho(new RegExp('create unique index if not exists ' + nome + '[^;]*;'), nome));
  }
  await db.exec(trecho(/alter table public\.bills\n\s+add constraint bills_parent_same_owner_fkey[^;]*;/, 'parent same owner'));
  await db.exec('create function public.tem_direito_acesso() returns boolean language sql as $$ select true $$;');
  await db.exec(trecho(/create or replace function public\.somar_meses_data\([\s\S]*?\n\$\$;/, 'somar_meses_data'));
  for (const m of MIGRATIONS) await aplicar(db, m, trocas[m] || []);
  return db;
}

function ferramentas(db, u) {
  const bill = async (data, extra = {}) => {
    const l = { user_id: u, description: 'AUDIT boleto', amount: 100, category: 'Outros', due_date: data, recurring: true, ...extra };
    const cols = Object.keys(l);
    return (await db.query(
      'insert into public.bills (' + cols.join(',') + ') values (' + cols.map((_, i) => '$' + (i + 1)).join(',') + ') returning id',
      cols.map((c) => l[c]))).rows[0].id;
  };
  const row = async (id) => (await db.query('select *, due_date::text due from public.bills where id=$1', [id])).rows[0];
  const tx = async (id) => (await db.query('select * from public.transactions where id=$1', [id])).rows[0];
  const pagar = async (id, em = '2026-01-31') => (await db.query('select (public.pagar_conta($1,$2)).*', [id, em])).rows[0];
  const reabrir = async (id) => (await db.query('select (public.reabrir_conta($1)).*', [id])).rows[0];
  const contar = async (where = 'true') => Number((await db.query('select count(*)::int n from public.bills where user_id=$1 and ' + where, [u])).rows[0].n);
  // paga e devolve o id da conta seguinte
  const avancar = async (id) => (await pagar(id)).next_bill_id;
  return { bill, row, tx, pagar, reabrir, contar, avancar };
}

async function roteiro(db) {
  const novo = async () => {
    const u = await novoUsuario(db);
    await db.query("select set_config('app.uid', $1, false)", [u]);
    return { u, ...ferramentas(db, u) };
  };

  // B3 - o dia desejado nao se perde.
  {
    const { bill, row, avancar } = await novo();
    let id = await bill('2026-01-31');
    const dias = [];
    for (let i = 0; i < 5; i++) { id = await avancar(id); dias.push((await row(id)).due); }
    assert.deepEqual(dias, ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30'], 'B3: 31/01 mantem o 31');
  }
  {
    const { bill, row, avancar } = await novo();
    let id = await bill('2028-01-31'); // bissexto
    const dias = [];
    for (let i = 0; i < 2; i++) { id = await avancar(id); dias.push((await row(id)).due); }
    assert.deepEqual(dias, ['2028-02-29', '2028-03-31'], 'B3: ano bissexto');
  }
  {
    const { bill, row, avancar } = await novo();
    let id = await bill('2027-01-30');
    const dias = [];
    for (let i = 0; i < 2; i++) { id = await avancar(id); dias.push((await row(id)).due); }
    assert.deepEqual(dias, ['2027-02-28', '2027-03-30'], 'B3: dia 30');
    const { bill: b2, row: r2, avancar: a2 } = await novo();
    let j = await b2('2027-01-29');
    const d2 = [];
    for (let i = 0; i < 2; i++) { j = await a2(j); d2.push((await r2(j)).due); }
    assert.deepEqual(d2, ['2027-02-28', '2027-03-29'], 'B3: dia 29');
    const { bill: b3, row: r3, avancar: a3 } = await novo();
    let k = await b3('2026-05-15');
    k = await a3(k);
    assert.equal((await r3(k)).due, '2026-06-15', 'B3: dia comum segue igual');
  }
  // B3 - vencimento editado a mao vence o dia guardado.
  {
    const { bill, row, avancar } = await novo();
    const a = await bill('2026-01-31');
    const b = await avancar(a); // 28/02, guardado 31
    await db.query("update public.bills set due_date='2026-02-10' where id=$1", [b]);
    const c = await avancar(b);
    assert.equal((await row(c)).due, '2026-03-10', 'B3: a data editada na mao manda');
  }
  // B3 - apagar a cabeca de uma serie antiga (sem o dia guardado) nao perde o 31.
  {
    const { bill, row, avancar } = await novo();
    const a = await bill('2026-01-31');
    const b = await avancar(a);
    await db.query('update public.bills set recurrence_day = null where user_id = (select user_id from public.bills where id=$1)', [a]);
    await db.query('delete from public.bills where id=$1', [a]);
    assert.equal((await row(b)).recurrence_day, 31, 'B3: a promocao grava o dia desejado');
    const c = await avancar(b);
    assert.equal((await row(c)).due, '2026-03-31', 'B3: depois de promover a cabeca, segue no 31');
  }
  // Controle: pagar duas vezes nao duplica nem gera outra.
  {
    const { bill, pagar, contar, tx } = await novo();
    const a = await bill('2026-01-31');
    const p1 = await pagar(a);
    const p2 = await pagar(a);
    assert.equal(p2.next_bill_id, p1.next_bill_id);
    assert.equal(await contar(), 2, 'pagar duas vezes nao cria outra conta');
    assert.equal((await db.query('select count(*)::int n from public.transactions')).rows[0].n >= 1, true);
    assert.ok(await tx(p1.paid_transaction_id));
  }
  // Controle: conta nao recorrente nao gera proxima.
  {
    const { bill, pagar, contar } = await novo();
    const a = await bill('2026-01-31', { recurring: false });
    const p = await pagar(a);
    assert.equal(p.next_bill_id, null);
    assert.equal(await contar(), 1);
  }

  // B6 - reabrir: a proxima intacta sai; editada, paga ou com data mudada, fica.
  {
    const { bill, row, avancar, reabrir, contar } = await novo();
    const a = await bill('2026-04-15');
    const b = await avancar(a);
    await reabrir(a);
    assert.equal(await row(b), undefined, 'B6 controle: proxima intacta e apagada');
    assert.equal((await row(a)).status, 'due');
    assert.equal(await contar(), 1);
  }
  for (const [rotulo, sql] of [
    ['valor', 'update public.bills set amount=222 where id=$1'],
    ['descricao', "update public.bills set description='AUDIT outra' where id=$1"],
    ['categoria', "update public.bills set category='Casa' where id=$1"],
    ['cor', "update public.bills set color='#ff0000' where id=$1"],
    ['vencimento', "update public.bills set due_date='2026-05-20' where id=$1"],
    ['recorrencia', 'update public.bills set recurring=false where id=$1'],
  ]) {
    const { bill, row, avancar, reabrir } = await novo();
    const a = await bill('2026-04-15');
    const b = await avancar(a);
    await db.query(sql, [b]);
    const r = await reabrir(a);
    assert.ok(await row(b), 'B6: proxima com ' + rotulo + ' editado nao pode ser apagada');
    assert.equal(r.status, 'due');
    assert.equal(r.next_bill_id, null, 'B6: o vinculo e solto mesmo assim');
  }
  {
    const { bill, row, avancar, pagar, reabrir } = await novo();
    const a = await bill('2026-04-15');
    const b = await avancar(a);
    await pagar(b);
    await reabrir(a);
    assert.equal((await row(b)).status, 'paid', 'B6 controle: proxima paga fica');
  }
  {
    // controle com serie de fim de mes: reabrir fevereiro apaga marco (dia 31)
    const { bill, row, avancar, reabrir } = await novo();
    const a = await bill('2026-01-31');
    const b = await avancar(a);
    const c = await avancar(b);
    await reabrir(b);
    assert.equal(await row(c), undefined, 'B6: fim de mes, a proxima intacta sai');
    assert.ok(await row(a));
  }

  // B5 - apagar a saida reabre o boleto.
  {
    const { bill, row, avancar, reabrir, pagar, contar } = await novo();
    const a = await bill('2026-04-15');
    const pago = await pagar(a);
    const b = pago.next_bill_id;
    const r = await tentar(() => db.query('delete from public.transactions where id=$1', [pago.paid_transaction_id]));
    assert.equal(r.ok, true, 'B5: delete simples: ' + (r.message || ''));
    const depois = await row(a);
    assert.equal(depois.status, 'due', 'B5: boleto reaberto');
    assert.equal(depois.paid_transaction_id, null);
    assert.equal(depois.next_bill_id, null);
    assert.ok(await row(b), 'B5: a proxima nao e apagada');
    assert.equal(await contar(), 2);
    // pode ser paga de novo, e reabrir ainda funciona
    const p2 = await pagar(a);
    assert.ok(p2.paid_transaction_id);
    const r2 = await reabrir(a);
    assert.equal(r2.status, 'due');
  }
  {
    // delete em lote de varias saidas (e de uma sem boleto) nao da 27000
    const { u, bill, row, pagar } = await novo();
    const a = await bill('2026-01-10', { recurring: false });
    const b = await bill('2026-01-11', { recurring: false });
    await pagar(a); await pagar(b);
    await db.query("insert into public.transactions (user_id,type,description,amount,category,occurred_on) values ($1,'out','AUDIT avulsa',1,'Outros','2026-01-12')", [u]);
    const r = await tentar(() => db.query('delete from public.transactions where user_id=$1', [u]));
    assert.equal(r.ok, true, 'B5: delete em lote: ' + (r.message || ''));
    assert.equal((await row(a)).status, 'due');
    assert.equal((await row(b)).status, 'due');
  }
  {
    // apagar o boleto e depois a saida (ordem inversa) tambem passa
    const { bill, pagar, row } = await novo();
    const a = await bill('2026-01-10', { recurring: false });
    const p = await pagar(a);
    await db.query('delete from public.bills where id=$1', [a]);
    const r = await tentar(() => db.query('delete from public.transactions where id=$1', [p.paid_transaction_id]));
    assert.equal(r.ok, true);
    assert.equal(await row(a), undefined);
  }

  // B4 - editar a conta paga atualiza a saida.
  {
    const { u, bill, row, tx, pagar, reabrir } = await novo();
    const carteira = (await db.query("insert into public.wallets (user_id,name) values ($1,'AUDIT carteira') returning id", [u])).rows[0].id;
    const a = await bill('2026-04-15', { recurring: false });
    const p = await pagar(a);
    await db.query("update public.bills set amount=120, description='AUDIT editada', category='Casa', color='#00ff00', wallet_id=$2 where id=$1", [a, carteira]);
    const t = await tx(p.paid_transaction_id);
    assert.equal(Number(t.amount), 120, 'B4: valor');
    assert.equal(t.description, 'AUDIT editada', 'B4: descricao');
    assert.equal(t.category, 'Casa', 'B4: categoria');
    assert.equal(t.wallet_id, carteira, 'B4: carteira');
    assert.equal(t.occurred_on.toISOString().slice(0, 10), '2026-01-31', 'B4: a data da saida nao muda');
    await db.query("update public.bills set due_date='2026-05-01' where id=$1", [a]);
    assert.equal((await tx(p.paid_transaction_id)).occurred_on.toISOString().slice(0, 10), '2026-01-31', 'B4: vencimento nao mexe na data da saida');
    // controle: editar conta em aberto nao cria nem mexe em saida
    const b = await bill('2026-06-15', { recurring: false });
    const antes = Number((await db.query('select count(*)::int n from public.transactions')).rows[0].n);
    await db.query('update public.bills set amount=7 where id=$1', [b]);
    assert.equal(Number((await db.query('select count(*)::int n from public.transactions')).rows[0].n), antes, 'B4: conta em aberto nao toca saida');
    // controle: reabrir apos a edicao apaga a saida (a editada) e solta a conta
    const r = await reabrir(a);
    assert.equal(r.status, 'due');
    assert.equal(await tx(p.paid_transaction_id), undefined);
    assert.equal((await row(a)).paid_transaction_id, null);
  }
  {
    // B4 sem laco: pagar de novo uma conta reaberta e editar em seguida
    const { bill, tx, pagar, reabrir } = await novo();
    const a = await bill('2026-04-15', { recurring: false });
    await pagar(a); await reabrir(a);
    const p = await pagar(a);
    await db.query('update public.bills set amount=55 where id=$1', [a]);
    assert.equal(Number((await tx(p.paid_transaction_id)).amount), 55);
  }

  // Controle: excluir a conta do usuario (cascade) termina sem 27000 e sem sobras.
  {
    const { u, bill, avancar, pagar } = await novo();
    const a = await bill('2026-01-31');
    const b = await avancar(a);
    await pagar(b);
    const r = await tentar(() => db.query('delete from auth.users where id=$1', [u]));
    assert.equal(r.ok, true, 'exclusao da conta: ' + (r.message || ''));
    assert.equal(Number((await db.query('select count(*)::int n from public.bills where user_id=$1', [u])).rows[0].n), 0);
    assert.equal(Number((await db.query('select count(*)::int n from public.transactions where user_id=$1', [u])).rows[0].n), 0);
  }
  // Controle: o dia guardado so e escrito pelo servidor.
  assert.match(
    schema.match(/grant update \(description, amount, category, color, due_date, recurring, wallet_id\)\n\s+on public\.bills/)?.[0] || '',
    /on public\.bills/, 'o grant de update de bills nao inclui recurrence_day');
}

(async () => {
  const real = await preparar();
  await roteiro(real);
  ok('roteiro completo no SQL real (B3 dia desejado, B6 reabrir preserva editada, B5 saida apagada reabre, B4 edicao sincroniza, controles)');

  const MUTANTES = [
    ['B3: proximo vencimento volta a usar o dia da conta paga', { '20261002140000': [['v_bill.due_date, v_dia);', 'v_bill.due_date, extract(day from v_bill.due_date)::integer);']] }],
    ['B3: a promocao da cabeca nao leva o dia', { '20261002140000': [['recurrence_day = coalesce(recurrence_day, old.recurrence_day,\n                                   extract(day from old.due_date)::integer)', 'recurrence_day = recurrence_day']] }],
    ['B6: reabrir apaga a proxima mesmo editada (sem comparar valor)', { '20261002150000': [['and n.amount = v_bill.amount', 'and true']] }],
    ['B6: reabrir apaga a proxima mesmo com vencimento editado', { '20261002150000': [['and n.due_date = public.proximo_vencimento_da_serie(v_bill.due_date, v_dia);', 'and true;']] }],
    ['B5: A0_ vira Z_ (gatilho depois do cascade da FK)', { '20261002160000': [['"A0_reabrir_conta_da_saida_apagada"', '"Z_reabrir_conta_da_saida_apagada"']] }],
    ['B5: AFTER DELETE vira BEFORE DELETE (27000)', { '20261002160000': [['after delete on public.transactions', 'before delete on public.transactions']] }],
    ['B4: a saida nao recebe o valor', { '20261002170000': [['amount = new.amount,', 'amount = amount,']] }],
    ['B4: a saida nao recebe a carteira', { '20261002170000': [['wallet_id = new.wallet_id\n   where id', 'wallet_id = wallet_id\n   where id']] }],
  ];
  for (const [nome, trocas] of MUTANTES) {
    const db = await preparar(trocas);
    const r = await tentar(() => roteiro(db));
    assert.equal(r.ok, false, 'MUTANTE SOBREVIVEU (o teste nao pega): ' + nome);
    ok('mutante morto: ' + nome);
  }
  console.log('\n' + aprovadas + '/' + aprovadas + ' checagens de boletos-servidor passaram\n');
})().catch((e) => { console.error('FALHOU: ' + (e.stack || e)); process.exit(1); });

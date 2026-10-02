/*
 * Exigencia de cartao no credito, executada num Postgres de verdade (PGlite),
 * com as migrations REAIS 20260923230400 (gatilho) e 20260926130000
 * (restricao "entrada nunca no cartao").
 *
 *   node __tests__/cartao-servidor.cjs
 *
 * O cliente depende exatamente do par 23514 + hint `cartao_obrigatorio`
 * (`ehRecusaCartaoObrigatorio`); aqui o par e conferido no servidor. Os
 * testes antigos (credito-exige-cartao.cjs) usam duble do cliente, e
 * migration-sem-entrada-no-cartao.cjs so le o texto do SQL.
 *
 * NAO coberto aqui (dito de proposito): a RPC `registrar_operacao_voz`
 * (20260923230300) depende de voice_operations, wallets, credit_cards,
 * tem_direito_acesso(), extensions.digest e bills; subir isso num banco
 * descartavel e outra rodada. A recusa de cartao dentro dela segue sem teste
 * executado de ponta a ponta, e a paridade app x widget da recusa tambem.
 */
const assert = require('node:assert/strict');
const { novoBanco, aplicar, novoUsuario, inserir, tentar } = require('./helpers/postgres-t5.cjs');

let aprovadas = 0;
const ok = (r) => { aprovadas++; console.log('  ok  ' + r); };

async function cartao(db, user) {
  const r = await db.query(
    "insert into public.credit_cards (user_id,name,bank,limit_amount,closing_day,due_day) values ($1,'AUDIT','Banco',1000,10,20) returning id", [user]);
  return r.rows[0].id;
}
async function preparar(trocas = {}) {
  const db = await novoBanco();
  await aplicar(db, '20260923230400', trocas['20260923230400'] || []);
  await aplicar(db, '20260926130000', trocas['20260926130000'] || []);
  return db;
}

async function roteiro(db) {
  const u = await novoUsuario(db);
  const c = await cartao(db, u);

  // Credito sem cartao: 23514 + hint, o par que o cliente le.
  let r = await tentar(() => inserir(db, u, { payment_method: 'credit' }));
  assert.equal(r.ok, false);
  assert.equal(r.code, '23514');
  assert.equal(r.hint, 'cartao_obrigatorio', 'o hint e o que o app usa para perguntar "Qual cartao?"');

  // Credito com cartao entra.
  r = await tentar(() => inserir(db, u, { payment_method: 'credit', card_id: c }));
  assert.equal(r.ok, true, r.message);

  // Entrada com cartao: recusada pela restricao (23514, sem o hint de cartao obrigatorio).
  r = await tentar(() => inserir(db, u, { type: 'in', payment_method: 'credit', card_id: c }));
  assert.equal(r.ok, false);
  assert.equal(r.code, '23514');
  assert.notEqual(r.hint, 'cartao_obrigatorio', 'entrada no cartao nao e "falta cartao"');
  r = await tentar(() => inserir(db, u, { type: 'in', card_id: c }));
  assert.equal(r.ok, false, 'entrada com card_id e recusada mesmo sem payment_method credit');
  assert.equal(r.code, '23514');

  // Entrada comum (pix) segue entrando.
  r = await tentar(() => inserir(db, u, { type: 'in', payment_method: 'pix' }));
  assert.equal(r.ok, true, r.message);

  // Debito e Pix sem cartao entram.
  for (const pm of ['debit', 'pix', 'cash']) {
    r = await tentar(() => inserir(db, u, { payment_method: pm }));
    assert.equal(r.ok, true, pm + ': ' + r.message);
  }
}

(async () => {
  const real = await preparar();
  await roteiro(real);
  ok('INSERT: credito sem cartao (23514 + cartao_obrigatorio), com cartao, entrada no cartao, debito/pix/dinheiro');

  // Continuacao de serie orfa (o cartao foi excluido; a FK pos card_id = null): excecao documentada.
  {
    const u = await novoUsuario(real);
    const cab = await inserir(real, u, { payment_method: 'credit', card_id: await cartao(real, u), recurring: true });
    await real.query('delete from public.credit_cards where user_id=$1', [u]);
    assert.equal((await real.query('select card_id from public.transactions where id=$1', [cab])).rows[0].card_id, null, 'a FK zerou o card_id da cabeca');
    const r = await tentar(() => inserir(real, u, { payment_method: 'credit', occurred_on: '2026-02-05', recurring: true, parent_id: cab }));
    assert.equal(r.ok, true, 'continuacao de serie orfa passa (excecao da 230400): ' + (r.message || ''));
    const solto = await tentar(() => inserir(real, u, { payment_method: 'credit', occurred_on: '2026-03-05' }));
    assert.equal(solto.ok, false, 'a excecao so vale para filha de cabeca orfa, nao para lancamento solto');
    ok('excecao da serie orfa: filha passa, lancamento solto continua recusado');
  }

  // Legado: o gatilho e so de INSERT. Linhas antigas sem cartao e UPDATEs ficam como estao (limite documentado, nao protecao).
  {
    const db = await novoBanco();
    const u = await novoUsuario(db);
    const legado = await inserir(db, u, { payment_method: 'credit' });          // antes das migrations
    await aplicar(db, '20260923230400');
    await aplicar(db, '20260926130000');                                          // restricao nasce valida com o legado la
    let r = await tentar(() => db.query("update public.transactions set description='editada' where id=$1", [legado]));
    assert.equal(r.ok, true, 'editar a descricao de um legado sem cartao nao e recusado');
    const avulso = await inserir(db, u, { payment_method: 'pix' });
    r = await tentar(() => db.query("update public.transactions set payment_method='credit' where id=$1", [avulso]));
    assert.equal(r.ok, true, 'LIMITE CONHECIDO (Keel B6): UPDATE para credito sem cartao NAO e barrado pelo gatilho de INSERT');
    const c = await cartao(db, u);
    r = await tentar(() => db.query("update public.transactions set type='in', card_id=$2 where id=$1", [avulso, c]));
    assert.equal(r.ok, false, 'UPDATE que vira entrada no cartao e barrado pela restricao');
    assert.equal(r.code, '23514');
    ok('legado: UPDATE nao e barrado pelo gatilho (limite documentado); a restricao barra entrada no cartao');
  }

  const MUTANTES = [
    ['gatilho deixa de olhar credito', { '20260923230400': [["new.payment_method = 'credit' and new.card_id is null", "new.payment_method = 'creditx' and new.card_id is null"]] }],
    ['gatilho perde o hint', { '20260923230400': [["hint = 'cartao_obrigatorio'", "hint = 'outro'"]] }],
    ['restricao deixa passar entrada com cartao', { '20260926130000': [["card_id is null and payment_method", "card_id is null or payment_method"]] }],
  ];
  for (const [nome, trocas] of MUTANTES) {
    const db = await preparar(trocas);
    const r = await tentar(() => roteiro(db));
    assert.equal(r.ok, false, 'MUTANTE SOBREVIVEU (o teste nao pega): ' + nome);
    ok('mutante morto: ' + nome);
  }
  console.log('\n' + aprovadas + '/' + aprovadas + ' checagens de cartao-servidor passaram\n');
})().catch((e) => { console.error('FALHOU: ' + (e.stack || e)); process.exit(1); });

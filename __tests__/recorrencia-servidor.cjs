/*
 * Gatilhos de recorrencia executados num Postgres de verdade (PGlite), com as
 * migrations REAIS 20261001120000, 20261001130000 e 20261001140000.
 *
 *   node __tests__/recorrencia-servidor.cjs
 *
 * Por que existe: os testes antigos (excluir-lancamento.cjs) so conferem o
 * TEXTO do SQL por regex. O bug de 01/10/2026 era de comportamento no servidor
 * (o mes apagado voltava), e um regex nao o pegaria de volta. Aqui o gatilho
 * roda de fato.
 *
 * Cada mutante abaixo quebra UMA linha do SQL e o mesmo roteiro tem de FALHAR.
 * Um teste que passa com o gatilho quebrado nao prova nada.
 */
const assert = require('node:assert/strict');
const { novoBanco, aplicar, novoUsuario, inserir, tentar } = require('./helpers/postgres-t5.cjs');

const MIGRATIONS = ['20261001120000', '20261001130000', '20261001140000'];
let aprovadas = 0;
const ok = (r) => { aprovadas++; console.log('  ok  ' + r); };

async function preparar(trocas = {}) {
  const db = await novoBanco();
  for (const m of MIGRATIONS) await aplicar(db, m, trocas[m] || []);
  return db;
}
const meses = async (db, id) => (await db.query('select recurrence_skipped_months m from public.transactions where id=$1', [id])).rows[0]?.m;
const contar = async (db, user, where = 'true') =>
  Number((await db.query('select count(*)::int n from public.transactions where user_id=$1 and ' + where, [user])).rows[0].n);
const serie = async (db, u, { recurring = true, meses: ms = ['2026-02-05', '2026-03-05', '2026-04-05'] } = {}) => {
  const cab = await inserir(db, u, { recurring });
  const filhas = [];
  for (const d of ms) filhas.push(await inserir(db, u, { occurred_on: d, recurring: true, parent_id: cab }));
  return { cab, filhas };
};

/* O roteiro inteiro. Lanca na primeira regra quebrada. */
async function roteiro(db) {
  // 1. Apagar a ocorrencia marca o mes na cabeca.
  {
    const u = await novoUsuario(db);
    const { cab, filhas } = await serie(db, u);
    await db.query('delete from public.transactions where id=$1', [filhas[0]]);
    assert.deepEqual(await meses(db, cab), ['2026-02'], 'apagar a ocorrencia marca o mes');
    await db.query('delete from public.transactions where id=$1', [filhas[1]]);
    assert.deepEqual(await meses(db, cab), ['2026-02', '2026-03'], 'marcas ordenadas e sem repeticao');
  }
  // 2. Recriar o mes pulado e descartado sem erro; lote misto insere o resto.
  {
    const u = await novoUsuario(db);
    const { cab, filhas } = await serie(db, u);
    const outra = await serie(db, u, { meses: [] });
    await db.query('delete from public.transactions where id=$1', [filhas[0]]);
    const antes = await contar(db, u);
    const r = await tentar(() => db.query(
      `insert into public.transactions (user_id,type,description,amount,category,occurred_on,recurring,parent_id) values
         ($1,'out','T5',1,'Outros','2026-02-05',true,$2),
         ($1,'out','T5',1,'Outros','2026-05-05',true,$2),
         ($1,'out','T5',1,'Outros','2026-02-05',true,$3)`, [u, cab, outra.cab]));
    assert.equal(r.ok, true, 'lote com mes pulado nao pode derrubar o lote: ' + (r.message || ''));
    assert.equal(await contar(db, u), antes + 2, 'so a linha do mes pulado e descartada (maio e a outra serie entram)');
    assert.equal(await contar(db, u, "occurred_on='2026-02-05' and parent_id='" + cab + "'"), 0, 'fevereiro da serie apagada nao volta');
  }
  // 3. Parcela e avulso intocados.
  {
    const u = await novoUsuario(db);
    const cab = await inserir(db, u, { installment_total: 3, installment_current: 1 });
    const p2 = await inserir(db, u, { occurred_on: '2026-02-05', installment_total: 3, installment_current: 2, parent_id: cab });
    await db.query('delete from public.transactions where id=$1', [p2]);
    assert.deepEqual(await meses(db, cab), [], 'apagar parcela nao marca mes');
    const avulso = await inserir(db, u);
    await db.query('delete from public.transactions where id=$1', [avulso]);
    assert.equal(await contar(db, u), 1, 'avulso apagado nao toca nas outras linhas');
  }
  // 4. Isolamento: filha de um dono apontando para a cabeca de outro e recusada pelo FK composto.
  {
    const a = await novoUsuario(db), b = await novoUsuario(db);
    const { cab } = await serie(db, a, { meses: [] });
    const r = await tentar(() => inserir(db, b, { occurred_on: '2026-02-05', recurring: true, parent_id: cab }));
    assert.equal(r.ok, false);
    assert.equal(r.code, '23503', 'cabeca de outro dono: FK composto recusa');
    assert.deepEqual(await meses(db, cab), [], 'a cabeca de A segue intacta');
  }
  // 5. Origem encerrada solta as filhas (140000); serie ativa leva tudo; parcela leva as parcelas.
  {
    const u = await novoUsuario(db);
    const enc = await serie(db, u, { recurring: false });
    await db.query('delete from public.transactions where id=$1', [enc.cab]);
    const soltas = (await db.query('select parent_id, recurring from public.transactions where id = any($1)', [enc.filhas])).rows;
    assert.equal(soltas.length, 3, 'as filhas de origem encerrada sobrevivem');
    assert.ok(soltas.every((s) => s.parent_id === null && s.recurring === false), 'viram lancamentos comuns, sem virar cabeca de serie nova');

    const ativa = await serie(db, u, { recurring: true });
    await db.query('delete from public.transactions where id=$1', [ativa.cab]);
    assert.equal((await db.query('select 1 from public.transactions where id = any($1)', [ativa.filhas])).rows.length, 0, 'Excluir a serie inteira continua levando tudo');

    const cab = await inserir(db, u, { installment_total: 3, installment_current: 1, recurring: false });
    const p2 = await inserir(db, u, { occurred_on: '2026-02-05', installment_total: 3, installment_current: 2, parent_id: cab });
    await db.query('delete from public.transactions where id=$1', [cab]);
    assert.equal((await db.query('select 1 from public.transactions where id=$1', [p2])).rows.length, 0, 'cabeca de compra parcelada leva as parcelas');
  }
  // 6. Delete em lote (exclusao de conta): cabeca encerrada e filhas no mesmo comando.
  {
    const u = await novoUsuario(db);
    await serie(db, u, { recurring: false });
    await serie(db, u, { recurring: true });
    const r = await tentar(() => db.query('delete from public.transactions where user_id=$1', [u]));
    assert.equal(r.ok, true, 'delete em lote nao pode dar 27000: ' + (r.message || ''));
    assert.equal(await contar(db, u), 0, 'conta apagada por inteiro');
  }
  // 7. "Este e os proximos" + apagar a origem depois.
  {
    const u = await novoUsuario(db);
    const { cab, filhas } = await serie(db, u, { meses: ['2026-02-05', '2026-03-05', '2026-04-05', '2026-05-05'] });
    await db.query('update public.transactions set recurring=false where id=$1', [cab]);
    await db.query("delete from public.transactions where parent_id=$1 and occurred_on >= '2026-04-05'", [cab]);
    assert.deepEqual(await meses(db, cab), ['2026-04', '2026-05'], 'meses marcados = exatamente os apagados, sem repeticao');
    await db.query("delete from public.transactions where parent_id=$1 and occurred_on >= '2026-04-05'", [cab]);
    assert.deepEqual(await meses(db, cab), ['2026-04', '2026-05'], 'repetir o gesto e idempotente');
    await db.query('delete from public.transactions where id=$1', [cab]);
    const sobra = (await db.query('select occurred_on::text d, parent_id, recurring from public.transactions where id = any($1) order by occurred_on', [filhas])).rows;
    assert.deepEqual(sobra.map((s) => s.d), ['2026-02-05', '2026-03-05'], 'os meses antigos ficam');
    assert.ok(sobra.every((s) => s.parent_id === null && s.recurring === false));
  }
}

(async () => {
  const real = await preparar();
  await roteiro(real);
  ok('roteiro completo no SQL real (7 grupos: marcar mes, lote misto, parcela/avulso, dono, origem encerrada, delete em lote, este e os proximos)');

  const MUTANTES = [
    ['A0_ vira Z_ (gatilho depois do cascade da FK)', { '20261001140000': [['"A0_soltar_filhas_da_origem_encerrada"', '"Z_soltar_filhas_da_origem_encerrada"']] }],
    ['AFTER DELETE vira BEFORE DELETE (27000 no lote)', { '20261001140000': [['after delete on public.transactions\n  for each row execute function public.soltar_filhas', 'before delete on public.transactions\n  for each row execute function public.soltar_filhas']] }],
    ['descarte do mes pulado vira return new', { '20261001130000': [['then\n    return null;\n  end if;\n\n  return new;', 'then\n    return new;\n  end if;\n\n  return new;']] }],
    ['gatilho de marcar mes sem o filtro de parcela', { '20261001130000': [['if old.parent_id is null or coalesce(old.installment_total, 1) > 1 then', 'if old.parent_id is null then']] }],
  ];
  for (const [nome, trocas] of MUTANTES) {
    const db = await preparar(trocas);
    const r = await tentar(() => roteiro(db));
    assert.equal(r.ok, false, 'MUTANTE SOBREVIVEU (o teste nao pega): ' + nome);
    ok('mutante morto: ' + nome);
  }
  console.log('\n' + aprovadas + '/' + aprovadas + ' checagens de recorrencia-servidor passaram\n');
})().catch((e) => { console.error('FALHOU: ' + (e.stack || e)); process.exit(1); });

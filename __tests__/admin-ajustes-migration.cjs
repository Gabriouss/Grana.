/* Migration da fila de ajustes (frente C), executada num Postgres embutido.
 * Aplicada em producao em 08/10/2026 a pedido do autor; este teste prova que o texto
 * versionado roda de novo sem erro e que as travas de acesso continuam valendo.
 *
 *   node __tests__/admin-ajustes-migration.cjs */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ARQ = 'supabase/migrations/20261008150000_admin_ajustes_fila.sql';
const sql = fs.readFileSync(path.join(__dirname, '..', ARQ), 'utf8');
let passou = 0;
const ok = (c, n) => { assert.ok(c, n); passou++; console.log('OK ' + n); };
const falha = async (p, re, n) => { await assert.rejects(p, re); passou++; console.log('OK ' + n); };

(async () => {
  ok(!fs.existsSync(path.join(__dirname, '..', 'docs/admin/migrations-propostas', path.basename(ARQ))), 'sem copia esquecida em migrations-propostas');
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;`);
  await db.exec(sql);
  await db.exec(sql); ok(true, 'migration roda duas vezes sem erro');

  const P = 'a'.repeat(16), V = 'b'.repeat(40);
  await db.exec('set role anon');
  await falha(db.query('select * from public.admin_ajuste_pedidos'), /permission denied/, 'anon nao le a fila');
  await falha(db.query('select * from public.admin_ajuste_claim($1)', ['x']), /permission denied/, 'anon nao executa claim');
  await db.exec('reset role; set role authenticated');
  await falha(db.query(`insert into public.admin_ajuste_pedidos (peca_id, caminho, versao_alvo, texto_original) values ($1,'c',$2,'t')`, [P, V]), /permission denied/, 'authenticated nao grava');
  await db.exec('reset role; set role service_role');

  const { rows: [r1] } = await db.query(`insert into public.admin_ajuste_pedidos (peca_id, caminho, versao_alvo, texto_original) values ($1,'c',$2,'AUDIT texto') returning id`, [P, V]);
  await falha(db.query(`insert into public.admin_ajuste_pedidos (peca_id, caminho, versao_alvo, texto_original) values ('x','c',$1,'t')`, [V]), /check/, 'peca_id fora do formato recusado');
  await falha(db.query(`update public.admin_ajuste_pedidos set texto_original = 'outro' where id = $1`, [r1.id]), /imutavel/, 'texto do autor imutavel');
  await falha(db.query(`delete from public.admin_ajuste_pedidos where id = $1`, [r1.id]), /permission denied/, 'service_role nao apaga pedido');
  await falha(db.query(`update public.admin_ajuste_pedidos set estado = 'aceito' where id = $1`, [r1.id]), /check/, 'aceite sem versao corrigida recusado');

  const { rows: c1 } = await db.query('select * from public.admin_ajuste_claim($1)', ['Beacon']);
  ok(c1.length === 1 && c1[0].estado === 'em-correcao' && c1[0].tentativas === 1 && c1[0].lease_id, 'claim pega um pedido com lease');
  const { rows: c2 } = await db.query('select * from public.admin_ajuste_claim($1)', ['Beacon']);
  ok(c2.length === 0, 'segundo claim nao repete o pedido em correcao');

  await db.exec(`reset role; update public.admin_ajuste_pedidos set lease_expira_em = now() - interval '1 second'; set role service_role`);
  const { rows: c3 } = await db.query('select * from public.admin_ajuste_claim($1)', ['Beacon']);
  ok(c3.length === 1 && c3[0].lease_id !== c1[0].lease_id && c3[0].tentativas === 2, 'lease vencido volta a fila e ganha lease novo');
  const { rows: ev } = await db.query('select codigo from public.admin_ajuste_eventos where pedido_id = $1 order by id', [r1.id]);
  ok(JSON.stringify(ev.map((e) => e.codigo)) === '["claim","lease-expirado","claim"]', 'eventos registram claim e expiracao');
  ok(!JSON.stringify(ev).includes('AUDIT texto'), 'evento nao repete o texto do autor');
  await falha(db.query('delete from public.admin_ajuste_eventos'), /permission denied/, 'eventos append-only (sem delete)');
  await falha(db.query(`update public.admin_ajuste_eventos set codigo = 'x'`), /permission denied/, 'eventos append-only (sem update)');

  await db.exec(`reset role; update public.admin_ajuste_pedidos set lease_expira_em = now() - interval '1 second'; set role service_role`);
  await db.query('select * from public.admin_ajuste_claim($1)', ['Beacon']);
  await db.exec(`reset role; update public.admin_ajuste_pedidos set lease_expira_em = now() - interval '1 second'; set role service_role`);
  const { rows: c4 } = await db.query('select * from public.admin_ajuste_claim($1)', ['Beacon']);
  const { rows: [fim] } = await db.query('select estado, lease_id from public.admin_ajuste_pedidos where id = $1', [r1.id]);
  ok(c4.length === 0 && fim.estado === 'precisa-de-atencao' && fim.lease_id === null, 'tres leases vencidos levam a precisa-de-atencao');

  console.log(`admin-ajustes-migration: ${passou} verificacoes verdes`);
})().catch((e) => { console.error(e); process.exitCode = 1; });

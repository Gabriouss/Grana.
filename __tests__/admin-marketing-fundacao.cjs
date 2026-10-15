// M3: contrato estático do rascunho + SQL real em Postgres embutido, sem rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261015190000_admin_marketing_fundacao.sql'), 'utf8');
const fonte = sql.replace(/--.*$/gm, '');
let passou = 0;
function ok(condicao, nome) { assert.ok(condicao, nome); passou++; }
async function recusa(db, comando, valores = []) {
  await assert.rejects(db.query(comando, valores), /permission denied|row-level security|check constraint|unique constraint/);
  passou++;
}

(async () => {
  ok(sql.startsWith('-- NÃO APLICADA, aguarda autor.'), 'aviso no topo');
  const tabelas = [...fonte.matchAll(/create table public\.(admin_marketing_\w+)/g)].map(m => m[1]);
  assert.deepEqual(tabelas.map(t => t.replace('admin_marketing_', '')), [
    'autorizacoes', 'agendamentos', 'envios', 'midias', 'eventos', 'notificacoes', 'auditoria', 'agregados', 'controles',
  ]);
  passou++;
  for (const tabela of tabelas) {
    ok(fonte.includes(`alter table public.${tabela} enable row level security;`), `RLS em ${tabela}`);
    ok(new RegExp(`revoke all on [^;]*public\\.${tabela}\\b[^;]*from public, anon, authenticated, service_role;`).test(fonte), `revoga privilégios herdados em ${tabela}`);
  }
  ok(!/create\s+policy|security\s+definer|cron\.schedule|net\.http|storage\.|create\s+extension/i.test(fonte), 'sem API, policy de cliente, cron, HTTP ou storage');
  ok(!/grant[^;]*\bto\s+(?:public|anon|authenticated)\b/i.test(fonte), 'sem acesso direto do navegador');
  ok(/interval '7 days'/.test(fonte) && /interval '90 days'/.test(fonte) && /interval '13 months'/.test(sql), 'retenção especificada');
  ok(/habilitado boolean not null default false/.test(fonte) && /pausa_global boolean not null default true/.test(fonte), 'desligado por padrão');

  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;`);
    await db.exec(sql);
    passou++;
    const { rows } = await db.query(`select relname, relrowsecurity from pg_class where relname = any($1)`, [tabelas]);
    ok(rows.length === tabelas.length && rows.every(r => r.relrowsecurity), 'RLS realmente ativada nas nove tabelas');
    const { rows: policies } = await db.query(`select * from pg_policies where tablename = any($1)`, [tabelas]);
    ok(policies.length === 0, 'nenhuma policy permite acesso de clientes');
    for (const papel of ['anon', 'authenticated']) {
      await db.exec(`set role ${papel}`);
      for (const tabela of tabelas) {
        await recusa(db, `select * from public.${tabela}`);
        await recusa(db, `insert into public.${tabela} default values`);
        await recusa(db, `delete from public.${tabela}`);
        const { rows: [priv] } = await db.query(`select has_any_column_privilege(current_user, $1, 'UPDATE') as pode`, [`public.${tabela}`]);
        ok(!priv.pode, `${papel} não atualiza ${tabela}`);
      }
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const dados = ['a'.repeat(64), '11111111-1111-1111-1111-111111111111', 'b'.repeat(16), 'c'.repeat(40)];
    const autorizar = `insert into public.admin_marketing_autorizacoes
      (chave, admin_id, peca_id, versao, manifesto, rede, conta_destino, formato, publicar_em)
      values ($1,$2,$3,$4,'{"legenda":"fixture","midias":[]}', 'instagram','123','feed',now()+interval '1 day') returning id`;
    const { rows: [autorizacao] } = await db.query(autorizar, dados);
    passou++;
    await recusa(db, autorizar, dados);
    await recusa(db, `update public.admin_marketing_autorizacoes set manifesto = '{}' where id = $1`, [autorizacao.id]);
    await recusa(db, 'delete from public.admin_marketing_autorizacoes');
    const { rows: [agenda] } = await db.query(`insert into public.admin_marketing_agendamentos (autorizacao_id, estrategia)
      values ($1, 'executor-remoto') returning id`, [autorizacao.id]);
    await recusa(db, `insert into public.admin_marketing_agendamentos (autorizacao_id, estrategia) values ($1,'executor-remoto')`, [autorizacao.id]);
    await recusa(db, `update public.admin_marketing_agendamentos set estado='agendado-na-meta' where id=$1`, [agenda.id]);
    await recusa(db, `update public.admin_marketing_agendamentos set estado='publicado', concluido_em=now() where id=$1`, [agenda.id]);
    await recusa(db, `update public.admin_marketing_agendamentos set autorizacao_id=gen_random_uuid() where id=$1`, [agenda.id]);
    await recusa(db, `insert into public.admin_marketing_envios (agendamento_id,chave,tentativa,operacao,estado,terminado_em)
      values ($1,$2,1,'publicar','confirmado',now())`, [agenda.id, 'd'.repeat(64)]);
    const { rows: [envio] } = await db.query(`insert into public.admin_marketing_envios
      (agendamento_id,chave,tentativa,operacao,estado,terminado_em) values ($1,$2,1,'publicar','incerto',now()) returning id`, [agenda.id, 'd'.repeat(64)]);
    ok(!!envio.id, 'resultado incerto persiste');
    await recusa(db, `insert into public.admin_marketing_envios (agendamento_id,chave,tentativa,operacao)
      values ($1,$2,1,'publicar')`, [agenda.id, 'e'.repeat(64)]);
    await recusa(db, `insert into public.admin_marketing_midias (agendamento_id,objeto,sha256,bytes,removido_em)
      values ($1,'fixture/video.mp4',$2,1,now())`, [agenda.id, 'f'.repeat(64)]);
    const { rows: [notificacao] } = await db.query(`insert into public.admin_marketing_notificacoes
      (destinatario_id,chave,codigo,importancia) values ($1,$2,'envio-incerto','critica') returning id`, [dados[1], dados[0]]);
    await db.query('update public.admin_marketing_notificacoes set lida_em=now() where id=$1', [notificacao.id]);
    const { rows: [lida] } = await db.query('select lida_em,resolvida_em from public.admin_marketing_notificacoes where id=$1', [notificacao.id]);
    ok(lida.lida_em && lida.resolvida_em === null, 'leitura não resolve incidente');
    await recusa(db, `insert into public.admin_marketing_notificacoes (destinatario_id,chave,codigo,importancia)
      values ($1,$2,'envio-incerto','critica')`, [dados[1], dados[0]]);
    await recusa(db, 'delete from public.admin_marketing_auditoria');
    await recusa(db, `insert into public.admin_marketing_eventos (chave,origem,codigo,expira_em)
      values ($1,'executor','fixture',now()+interval '1 day')`, [dados[0]]);
    const { rows: [controle] } = await db.query('insert into public.admin_marketing_controles default values returning *');
    ok(!controle.habilitado && controle.pausa_global && controle.pausa_facebook && controle.pausa_instagram, 'controle nasce pausado');
    await recusa(db, 'update public.admin_marketing_controles set habilitado=true');
    console.log(`OK admin-marketing-fundacao: ${passou} verificações (estático + Postgres embutido, sem produção).`);
  } finally { await db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

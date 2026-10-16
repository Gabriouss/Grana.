/*
 * Entrega 3 (16/10/2026): migration `feedback_gestao`, executando o SQL real num Postgres embutido.
 *
 *   node __tests__/feedback-gestao-migration.cjs
 *
 * Trava: metadado separado (nenhuma coluna nova em `feedbacks`, conteúdo intacto), estados e
 * limites, resolvido só com evidência, histórico na mesma transação, privilégios só do
 * service_role, exclusão do feedback leva a gestão junto, reaplicar é inofensivo.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let passou = 0;
const ok = (c, nome) => { assert.ok(c, nome); passou++; };
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261016020000_feedback_gestao.sql'), 'utf8');
ok(/N[ÃA]O APLICADA/.test(sql), 'marcada como não aplicada');
const F = '55555555-5555-4555-8555-000000000001';
const ADMIN = '11111111-1111-4111-8111-111111111111';

(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      create table public.feedbacks (id uuid primary key, message text not null, user_id uuid, device_info text, status text default 'pending');
      insert into public.feedbacks values ('${F}', 'texto original', null, null, 'pending');`);
    await db.exec(sql);
    await db.exec(sql);

    const cols = (await db.query(`select column_name from information_schema.columns where table_name='feedbacks' order by 1`)).rows.map((r) => r.column_name);
    ok(cols.join() === 'device_info,id,message,status,user_id', 'feedbacks não ganhou nenhuma coluna');

    const atualizar = (patch, id = F) => db.query(`select * from public.feedback_gestao_atualizar($1::uuid, $2::uuid, $3::jsonb)`, [id, ADMIN, JSON.stringify(patch)]);
    const recusa = async (patch, id = F) => { try { await atualizar(patch, id); return false; } catch { return true; } };

    const a = (await atualizar({ estado: 'em_analise', prioridade: 'alta', responsavel: 'Gabriel', etiquetas: ['voz', 'android'] })).rows[0];
    ok(a.estado === 'em_analise' && a.prioridade === 'alta' && a.responsavel === 'Gabriel' && a.etiquetas.join() === 'voz,android', 'primeira triagem cria a linha com os campos');
    ok(a.atualizado_por === ADMIN, 'registra quem mudou');
    ok((await db.query(`select message from public.feedbacks where id='${F}'`)).rows[0].message === 'texto original', 'conteúdo original intacto');

    let h = (await db.query(`select campo, de, para from public.feedback_gestao_historico order by id`)).rows;
    ok(h.some((x) => x.campo === 'estado' && x.de === 'novo' && x.para === 'em_analise'), 'histórico: estado novo → em_analise');
    ok(h.length === 4, 'histórico só dos campos que mudaram (estado, prioridade, responsável, etiquetas)');

    await atualizar({ estado: 'em_analise' });
    ok((await db.query(`select count(*)::int c from public.feedback_gestao_historico`)).rows[0].c === 4, 'repetir o mesmo valor não gera histórico');

    ok(await recusa({ estado: 'resolvido' }), 'resolvido sem evidência é recusado');
    ok((await db.query(`select estado from public.feedback_gestao where feedback_id='${F}'`)).rows[0].estado === 'em_analise', 'recusa não mudou o estado');
    ok((await db.query(`select count(*)::int c from public.feedback_gestao_historico`)).rows[0].c === 4, 'recusa não deixou histórico (mesma transação)');

    const r = (await atualizar({ estado: 'resolvido', evidencia: 'Corrigido no commit 02235ca', versao_resolucao: '1.11.0' })).rows[0];
    ok(r.estado === 'resolvido' && r.evidencia && r.versao_resolucao === '1.11.0', 'resolvido com evidência e versão');
    const fim = (await atualizar({ prioridade: null })).rows[0];
    ok(fim.prioridade === null && fim.estado === 'resolvido' && fim.evidencia, 'patch parcial só mexe no que veio; null limpa o campo');

    // E3-R1 (Watchtower, 16/10): Resolvido exige evidência E versão no estado resultante.
    const F2 = '55555555-5555-4555-8555-000000000002';
    await db.exec(`insert into public.feedbacks values ('${F2}', 'outro texto', null, null, 'pending')`);
    ok(await recusa({ estado: 'resolvido', evidencia: 'Commit fictício auditado' }, F2), 'R1: primeira resolução sem versão é recusada');
    ok(await recusa({ estado: 'resolvido', versao_resolucao: '1.11.0' }, F2), 'R1: primeira resolução sem evidência é recusada');
    ok((await db.query(`select count(*)::int c from public.feedback_gestao_historico where feedback_id='${F2}'`)).rows[0].c === 0, 'R1: recusa não deixa histórico');
    ok(await recusa({ estado: 'resolvido', evidencia: '', versao_resolucao: '1.11.0' }, F2), 'R1: evidência vazia não vale');
    ok(await recusa({ versao_resolucao: null }), 'R1: limpar a versão de um item já resolvido é recusado');
    ok(await recusa({ evidencia: null }), 'R1: limpar a evidência de um item já resolvido é recusado');
    const conserva = (await atualizar({ prioridade: 'baixa', etiquetas: ['voz'] })).rows[0];
    ok(conserva.estado === 'resolvido' && conserva.versao_resolucao === '1.11.0' && conserva.evidencia, 'R1: patch parcial de outro campo conserva evidência e versão gravadas');
    const reabre = (await atualizar({ estado: 'planejado', versao_resolucao: null })).rows[0];
    ok(reabre.estado === 'planejado' && reabre.versao_resolucao === null, 'R1: reabrir o item libera limpar a versão');
    const reresolve = (await atualizar({ estado: 'resolvido', evidencia: 'Novo commit', versao_resolucao: '1.11.1' })).rows[0];
    ok(reresolve.estado === 'resolvido' && reresolve.versao_resolucao === '1.11.1', 'R1: resolver de novo, agora com versão nova, é aceito');
    const valida = (await atualizar({ estado: 'resolvido', evidencia: 'Commit 02235ca', versao_resolucao: '1.11.0' }, F2)).rows[0];
    ok(valida.estado === 'resolvido' && valida.versao_resolucao === '1.11.0', 'R1: resolução válida, com evidência e versão, é aceita');
    await atualizar({ estado: 'novo' }, F2); // devolve ao padrão para o resto do roteiro

    // Concorrência da primeira triagem: duas primeiras alterações ao mesmo tempo não perdem nenhuma.
    const F3 = '55555555-5555-4555-8555-000000000003';
    await db.exec(`insert into public.feedbacks values ('${F3}', 'terceiro', null, null, 'pending')`);
    await Promise.all([atualizar({ prioridade: 'alta' }, F3), atualizar({ responsavel: 'Gabriel' }, F3)]);
    const dois = (await db.query(`select prioridade, responsavel from public.feedback_gestao where feedback_id='${F3}'`)).rows[0];
    ok(dois.prioridade === 'alta' && dois.responsavel === 'Gabriel', 'R1: duas primeiras triagens simultâneas preservam as duas mudanças');

    ok(await recusa({ estado: 'inventado' }), 'estado fora da lista é recusado');
    ok(await recusa({ prioridade: 'urgentissima' }), 'prioridade fora da lista é recusada');
    ok(await recusa({ responsavel: 'x'.repeat(81) }), 'responsável acima de 80 é recusado');
    ok(await recusa({ etiquetas: Array.from({ length: 9 }, (_, i) => 'e' + i) }), 'mais de 8 etiquetas é recusado');
    ok(await recusa({ message: 'trocar o texto' }), 'campo desconhecido (inclusive o texto do feedback) é recusado');
    ok(await recusa({ estado: 'novo' }, '99999999-9999-4999-8999-999999999999'), 'feedback inexistente é recusado');
    ok(await recusa([]), 'patch que não é objeto é recusado');

    // Privilégios: só service_role executa e lê.
    const pode = async (papel, consulta) => {
      await db.exec(`set role ${papel}`);
      try { await db.query(consulta); return true; } catch { return false; } finally { await db.exec('reset role'); }
    };
    for (const papel of ['anon', 'authenticated']) {
      ok(!(await pode(papel, 'select * from public.feedback_gestao')), `${papel} não lê a gestão`);
      ok(!(await pode(papel, 'select * from public.feedback_gestao_historico')), `${papel} não lê o histórico`);
      ok(!(await pode(papel, `select public.feedback_gestao_atualizar('${F}', '${ADMIN}', '{"estado":"arquivado"}')`)), `${papel} não executa a função`);
    }
    ok(await pode('service_role', `select public.feedback_gestao_atualizar('${F}', '${ADMIN}', '{"estado":"arquivado"}')`), 'service_role executa');

    await db.exec(`delete from public.feedbacks where id='${F}'`);
    ok((await db.query(`select count(*)::int c from public.feedback_gestao where feedback_id='${F}'`)).rows[0].c === 0
      && (await db.query(`select count(*)::int c from public.feedback_gestao_historico where feedback_id='${F}'`)).rows[0].c === 0, 'apagar o feedback leva a gestão e o histórico junto');

    console.log(`feedback-gestao-migration: ${passou} checagens passaram — 0 falhas`);
  } finally { await db.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

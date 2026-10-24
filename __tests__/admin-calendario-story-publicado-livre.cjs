// Story publicado não prende a peça (autor, 24/10/2026: as "Capas dos destaques" saíram como Story errado
// e não ficaram no perfil; a peça precisa voltar para "Aprovados sem data").
// Módulos reais: projetarCalendario (web/telas/calendario.js) e voltarSemData (marketing/calendario.cjs).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fonte = fs.readFileSync('tools/admin-local/web/telas/calendario.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace(/export (async )?function /g, '$1function ');
const dominio = { Date, Intl, URLSearchParams };
vm.runInNewContext(fs.readFileSync('tools/admin-local/web/telas/_publicacoes-reais.js', 'utf8').replace(/^export /gm, ''), dominio);
const sandbox = { console, Date, Intl, URL, URLSearchParams,
  estadoApresentacaoJob: dominio.estadoApresentacaoJob, descreverJobReal: dominio.descreverJobReal };
vm.runInNewContext(fonte, sandbox);
const cal = require('../tools/admin-local/marketing/calendario.cjs');

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; console.log('  ok  ' + m); };
const p = { id: 'e'.repeat(16), versao: 'f'.repeat(40), titulo: 'Capas dos destaques fixture' };
const job = (estado, formato) => ({ jobId: `${estado}-${formato}`, revisao: 1, peca: { pecaId: p.id, versao: p.versao },
  confirmadoEm: '2026-10-23T12:00:00Z', estado, destino: { rede: 'instagram', formato, publicarEm: '2026-10-24T01:25:00Z' } });
const semData = (jobs) => sandbox.projetarCalendario({ mes: '2026-10', itens: [], aprovadosSemData: [p] }, jobs, 'ambos').aprovadosSemData.some((x) => x.id === p.id);

(async () => {
  // Tela
  ok(semData([job('publicado', 'stories')]), 'Story publicado: a peça volta para Aprovados sem data');
  const projecao = sandbox.projetarCalendario({ mes: '2026-10', itens: [], aprovadosSemData: [p] }, [job('publicado', 'stories')], 'ambos');
  ok(projecao.itens.some((i) => i.data === '2026-10-23' && i.jobs.length === 1), 'o Story continua no calendário, no dia em que saiu');
  ok(!semData([job('programado-no-painel', 'stories')]), 'Story ainda agendado continua prendendo a peça');
  ok(!semData([job('precisa-conferir', 'stories')]), 'Story que precisa de conferência continua prendendo');
  ok(!semData([job('publicado', 'feed')]), 'post de feed publicado continua prendendo');
  ok(!semData([job('publicado', 'stories'), job('programado-no-painel', 'feed')]), 'Story publicado + feed agendado: o feed prende');

  // Servidor: a trava de voltarSemData passa a ignorar só o Story publicado. A recusa seguinte
  // ("só peça planejada com data") prova que a checagem real foi superada; o caso planejado
  // ponta a ponta está em admin-calendario-voltar-sem-data.cjs.
  const listar = (...jobs) => async () => ({ jobs, limitado: false });
  const codigo = async (jobs) => { try { await cal.voltarSemData('Z:/raiz-inexistente', { id: p.id, versao: p.versao }, { listar: listar(...jobs) }); return 'ok'; } catch (e) { return e.message; } };
  ok((await codigo([job('publicado', 'stories')])) !== 'Esta peça já tem publicação programada, agendada ou publicada. Use o cancelamento com recibo.', 'servidor: Story publicado não recusa pela trava de estado real');
  for (const [estado, formato] of [['publicado', 'feed'], ['programado-no-painel', 'stories'], ['agendado-na-meta', 'stories']]) {
    ok((await codigo([job(estado, formato)])).startsWith('Esta peça já tem publicação'), `servidor: ${formato} ${estado} continua recusando`);
  }
  console.log(`admin-calendario-story-publicado-livre: ${checks} checagens, 0 falhas`);
})().catch((e) => { console.error(e); process.exitCode = 1; });

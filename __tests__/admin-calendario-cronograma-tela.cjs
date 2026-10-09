const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('tools/admin-local/web/telas/calendario.js', 'utf8').replace(/^import .*\n/m, '').replace(/export (async )?function /g, '$1function ');
const node = (tag, attrs = {}, ...children) => ({ tag, attrs, children: children.flat(Infinity).filter(Boolean) });
const text = (n) => n == null ? '' : typeof n === 'object' ? [n.attrs?.texto || '', ...(n.children || []).map(text)].join(' ') : String(n);
const ctx = { h: node, alerta: (tipo, texto) => node('p', { tipo, texto }), formatar: { data: (s) => s.split('-').reverse().join('/'), dataHora: (s) => `data formatada ${s.slice(0, 10)}` } };
const sandbox = { ctx, rotuloCanal: (s) => s || 'sem canal', console };
vm.runInNewContext(source, sandbox);
function render(previsao) { sandbox.previsao = previsao; return text(vm.runInNewContext('detalhesCronograma(ctx,previsao)', sandbox)); }
assert.equal(render(null), '');
const origem = { manifestoId: 'campanha-grana', itemId: 'reels-widget-padaria', manifestoVersao: 2 };
const previsto = { origem, dataPrevista: { modo: 'diaD', diasUteis: 4, hora: '19:00', canal: 'reels' }, estado: 'aguardando-dia-d' };
let t = render(previsto);
assert.ok(t.includes('D+4 dias úteis às 19:00'));
assert.ok(t.includes('Aguardando dia D'));
assert.ok(t.includes('reels-widget-padaria'));
assert.equal(/\d{2}\/\d{2}\/\d{4}/.test(t), false, 'não inventa data absoluta');
t = render({ ...previsto, estado: 'planejado', dataPrevista: { ...previsto.dataPrevista, dataResolvida: '2026-10-15' }, substituicaoManual: { data: '2026-10-16', hora: '20:00', canal: 'stories' }, recibo: { tipo: 'aceite-autor', versaoPeca: 'versao-ficticia', aprovadoEm: '2026-10-07T10:31:32-03:00', evidencia: 'aceite fictício no painel' } });
assert.ok(t.includes('15/10/2026'));
assert.ok(t.includes('Data alterada pelo autor: 16/10/2026 às 20:00'));
assert.ok(t.includes('previsão de origem foi preservada'));
assert.ok(t.includes('Recibo do aceite: aceite-autor'));
assert.ok(t.includes('versao-ficticia'));
assert.ok(t.includes('data formatada 2026-10-07'));
assert.ok(t.includes('aceite fictício no painel'));
assert.ok(t.includes('Não comprova publicação na Meta'));
t = render({ origem, recibos: [{ id: 'recibo-ficticio-entrada', tipo: 'entrada-automatica', em: '2026-10-08T19:00:00-03:00', estado: 'aguardando dia D' }, { acao: 'substituicao-manual', em: '2026-10-09T10:00:00-03:00' }] });
assert.ok(t.includes('Recibo do calendário: entrada-automatica'));
assert.ok(t.includes('recibo-ficticio-entrada'));
assert.ok(t.includes('substituicao-manual'));
assert.equal(t.includes('Recibo do aceite'), false, 'evento operacional não é aceite');
t = render({ dataPrevista: { modo: 'absoluta', data: '2026-10-12', hora: '09:00', canal: 'instagram-feed' }, estado: 'data-passada', avisos: ['Feriado explicitamente registrado no manifesto.'] });
assert.ok(t.includes('12/10/2026 às 09:00'));
assert.ok(t.includes('Nada será publicado imediatamente'));
assert.ok(t.includes('Feriado explicitamente registrado'));
for (const estado of ['sem-data-no-cronograma', 'vinculo-invalido', 'vinculo-pendente', 'duplicado', 'desatualizado']) {
 assert.ok(render({ estado }).length > 60, estado);
}
t = render({ origem: { ...origem, itemId: '<script>fixture</script>' } });
assert.ok(t.includes('<script>fixture</script>')); // literal por textContent no h real
assert.equal(source.includes('innerHTML'), false);
assert.ok(render({ ...previsto, dataPrevista: { ...previsto.dataPrevista, diasUteis: 1 } }).includes('D+1 dia útil'));
assert.equal(render({ origem: {} }).includes('undefined'), false);
assert.ok(render({ estado: 'estado-novo' }).includes('Estado do cronograma: estado-novo'));
assert.ok(render({ dataPrevista: { modo: 'diaD' }, recibos: [null] }).includes('Posição relativa não informada'));
console.log('admin-calendario-cronograma-tela: previsão absoluta/relativa, sem D, origem, data manual, recibo, passado e estados pendentes OK');

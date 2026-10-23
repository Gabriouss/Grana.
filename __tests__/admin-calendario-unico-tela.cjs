const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fonte = fs.readFileSync('tools/admin-local/web/telas/calendario.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace(/export (async )?function /g, '$1function ');
const dominio = { Date, Intl, URLSearchParams };
vm.runInNewContext(fs.readFileSync('tools/admin-local/web/telas/_publicacoes-reais.js', 'utf8').replace(/^export /gm, ''), dominio);
const sandbox = { console, Date, Intl, URL, URLSearchParams,
  estadoApresentacaoJob: dominio.estadoApresentacaoJob, descreverJobReal: dominio.descreverJobReal };
vm.runInNewContext(fonte, sandbox);
const p = { id: 'a'.repeat(16), versao: 'b'.repeat(40), titulo: 'Peça audit' };
const d = { itens: [{ peca: p, data: '2026-10-19' }], aprovadosSemData: [] };
const job = (id, estado, dia = '2026-10-21T01:00:00Z', extra = {}) => ({ jobId: id, revisao: 1, peca: { pecaId: p.id, versao: p.versao }, confirmadoEm: '2026-10-18T12:00:00Z', estado, destino: { rede: 'instagram', formato: 'feed', publicarEm: dia }, ...extra });
const projetar = (jobs, camada = 'ambos') => sandbox.projetarCalendario(d, jobs, camada);
const proximas = sandbox.resumirOperacaoCalendario([job('depois', 'preparando', '2026-10-23T15:00:00Z'), job('antes', 'programado-no-painel'), job('incerto', 'precisa-conferir'), job('publicado', 'publicado'), job('sem-confirmacao', 'preparando', undefined, { confirmadoEm: null })]);
assert.equal(proximas.proximas.map((j) => j.jobId).join(','), 'antes,depois', 'resumo usa somente jobs confirmados, em ordem cronológica');
assert.equal(proximas.atencao.map((j) => j.jobId).join(','), 'incerto,publicado', 'publicado sem prova final também pede conferência, sem falso sucesso');
const suspenso = job('revisao', 'programado-no-painel', undefined, { pausado: true, motivoSuspensao: 'revisao-editorial' });
const resumoSuspenso = sandbox.resumirOperacaoCalendario([suspenso]);
assert.equal(resumoSuspenso.proximas.length, 0, 'A2: suspensão editorial não promete publicação futura');
assert.equal(resumoSuspenso.atencao[0].jobId, 'revisao', 'A2: suspensão aparece em Precisa de atenção');
assert.equal(sandbox.estadoDoIcone({ jobs: [suspenso] }).chave, 'atencao', 'A2: ícone também sinaliza atenção');
assert.equal(suspenso.estado, 'programado-no-painel', 'apresentação não altera o estado do servidor');
assert.equal(sandbox.diaReal(job('a', 'publicado')), '2026-10-20', 'dia é São Paulo, não UTC');
assert.equal(projetar([job('a', 'programado-no-painel')]).itens.length, 1);
assert.equal(projetar([job('a', 'programado-no-painel')]).itens[0].data, '2026-10-20');
assert.equal(projetar([job('a', 'publicado'), job('b', 'precisa-conferir')]).itens[0].jobs.length, 2);
const separados = projetar([job('a', 'publicado'), job('b', 'precisa-conferir', '2026-10-22T15:00:00Z')]).itens;
assert.equal(separados.length, 2);
assert.equal(separados.filter((i) => i.principal).length, 1, 'uma identidade principal, outro dia é marcador de destino');
assert.equal(new Set(separados.flatMap((i) => i.jobs.map((j) => j.jobId))).size, 2);
for (const estado of ['precisa-conferir', 'cancelamento-pendente', 'estado-futuro']) assert.equal(projetar([job('a', estado)]).itens[0].jobs[0].estado, estado);
for (const estado of ['cancelado', 'falhou']) {
  const item = projetar([job('a', estado)]).itens[0];
  assert.equal(item.data, '2026-10-19'); assert.equal(item.historico[0].estado, estado);
}
assert.equal(projetar([job('a', 'publicado', undefined, { confirmadoEm: null })]).itens[0].data, '2026-10-19', 'prévia não move o cartão');
assert.equal(projetar([job('a', 'publicado', undefined, { peca: { pecaId: p.id, versao: 'c'.repeat(40) } })]).itens[0].data, '2026-10-19', 'não vincula outra versão');
assert.equal(projetar([job('a', 'publicado')], 'planejado').itens[0].data, '2026-10-19');
assert.equal(projetar([], 'real').itens.length, 0);
for (const url of [null, 'javascript:alert(1)', 'http://example.org', 'https://user:password@example.org']) assert.equal(sandbox.linkPublicado(url), null);
assert.equal(sandbox.linkPublicado('https://example.org/post/1'), 'https://example.org/post/1');
assert.equal(JSON.stringify(d), JSON.stringify({ itens: [{ peca: p, data: '2026-10-19' }], aprovadosSemData: [] }), 'projeção não muda os dados de origem');
// F1 (Lynx): sem leitura real completa, o botão "Agendar de verdade" não pode aparecer (risco de segundo agendamento)
assert.equal(sandbox.leituraRealCompleta('planejado', { status: 'disponivel', completo: true }), false, 'camada Planejado nem consulta a fila real');
assert.equal(sandbox.leituraRealCompleta('ambos', { status: 'parcial', completo: false }), false, 'leitura parcial');
assert.equal(sandbox.leituraRealCompleta('ambos', { status: 'disponivel', completo: false }), false, 'ainda há páginas');
assert.equal(sandbox.leituraRealCompleta('ambos', { status: 'indisponivel', completo: false }), false);
assert.equal(sandbox.leituraRealCompleta('ambos', { status: 'nao-consultado' }), false);
assert.equal(sandbox.leituraRealCompleta('ambos', undefined), false);
assert.equal(sandbox.leituraRealCompleta('ambos', { status: 'disponivel', completo: true }), true);
assert.equal(sandbox.leituraRealCompleta('real', { status: 'disponivel', completo: true }), true);
// Camada "Publicado na Meta": indisponível ou parcial nunca vira "nada publicado"
assert.equal(sandbox.avisosMeta({ status: 'nao-consultado' }).length, 0);
assert.equal(sandbox.avisosMeta({ status: 'ok', completo: true, redes: { instagram: { status: 'disponivel', completo: true } } }).length, 0);
assert.match(sandbox.avisosMeta({ status: 'falhou' })[0], /não quer dizer que nada foi publicado/);
assert.match(sandbox.avisosMeta({ status: 'ok', completo: false, redes: { facebook: { status: 'indisponivel', motivo: 'token expirado' } } })[0], /Facebook \(token expirado\).*nada foi publicado/);
assert.match(sandbox.avisosMeta({ status: 'ok', completo: false, redes: { instagram: { status: 'nao-configurado' } } })[0], /Instagram não está configurada/);
assert.match(sandbox.avisosMeta({ status: 'ok', completo: false, redes: { instagram: { status: 'disponivel', completo: false } } })[0], /Instagram veio parcial/);
assert.match(sandbox.avisosMeta({ status: 'ok', completo: false, redes: {} })[0], /parcial/);
// Item 4 do autor: data de cartão planejado que já passou (dia em São Paulo) não oferece agendar
const agora = new Date('2026-10-18T02:00:00Z'); // 17/10 23:00 em São Paulo
assert.equal(sandbox.hojeSaoPaulo(agora), '2026-10-17');
assert.equal(sandbox.dataPassou('2026-10-16', agora), true);
assert.equal(sandbox.dataPassou('2026-10-17', agora), false, 'hoje ainda não passou');
assert.equal(sandbox.dataPassou('2026-10-20', agora), false);
assert.equal(sandbox.dataPassou('', agora), false);
assert.equal(sandbox.dataPassou(undefined, agora), false);
// 18/10 noite: "Agendar de verdade" nunca some em silêncio; o motivo diz a saída e o botão fica desabilitado.
const completa = { status: 'disponivel', completo: true };
assert.equal(sandbox.motivoSemAgendar('ambos', completa, '2026-10-17', agora), null, 'hoje com leitura completa agenda');
assert.match(sandbox.motivoSemAgendar('ambos', completa, '2026-10-16', agora), /Data já passou: use "Mudar data"/);
assert.match(sandbox.motivoSemAgendar('planejado', completa, '2026-10-20', agora), /selecione Ambos/);
assert.match(sandbox.motivoSemAgendar('ambos', { status: 'indisponivel' }, '2026-10-20', agora), /Fila real indisponível/);
assert.match(sandbox.motivoSemAgendar('ambos', { status: 'parcial', completo: false }, '2026-10-20', agora), /Carregar mais agendamentos/);
assert.match(sandbox.motivoSemAgendar('ambos', undefined, '', agora), /ainda não consultada/);
for (const [camada, reais] of [['planejado', completa], ['ambos', { status: 'parcial', completo: false }], ['ambos', undefined], ['ambos', completa]]) {
  assert.equal(!!sandbox.motivoSemAgendar(camada, reais, '2026-10-20', agora), !sandbox.leituraRealCompleta(camada, reais), 'F1: só habilita com leitura real completa');
}
console.log('admin-calendario-unico-tela: identidade, confirmação, estados independentes, fuso, marcadores, cancelamento/falha, links seguros e imutabilidade OK');

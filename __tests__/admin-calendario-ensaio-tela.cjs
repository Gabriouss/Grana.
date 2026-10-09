const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('tools/admin-local/web/telas/calendario.js', 'utf8').replace(/^import .*\n/m, '').replace(/export (async )?function /g, '$1function ');
const node = (tag, attrs = {}, ...children) => ({ tag, attrs, children: children.flat(Infinity).filter(Boolean), appendChild(v) { this.children.push(v); }, replaceChildren(...v) { this.children = v; } });
const text = (n) => typeof n === 'object' ? [n.attrs?.texto || '', ...(n.children || []).map(text)].join(' ') : String(n);
const buttons = (n) => [ ...(n.tag === 'button' ? [n] : []), ...(n.children || []).filter((v) => typeof v === 'object').flatMap(buttons) ];
const dto = () => ({ modo: 'ensaio', realHabilitado: false, chamadasMeta: 0, geradoEm: '2026-10-08T21:00:00Z', fuso: 'America/Sao_Paulo', diaD: null, itens: [], bloqueiosGerais: ['dia-d-nao-declarado', 'calendario-sem-planejamentos'], pendenciasReais: ['confirmacao-real-do-autor'] });
function setup(api) {
 const root = node('section'), calls = [], erros = [], logs = [];
 let obsoleta = false;
 const ctx = { h: node, obsoleta: () => obsoleta, api: async (path) => { calls.push(path); return api(); },
   acao: () => { throw Error('escrita proibida'); }, alerta: (tipo, texto) => node('p', { tipo, texto }),
   formatar: { dataHora: (v) => `local ${v}` }, estado: { carregando: (root, texto) => root.replaceChildren(node('p', { texto })), erro: (root, err, retry) => { erros.push(err); root.replaceChildren(node('p', { texto: 'Leitura falhou' }), node('button', { texto: 'Tentar novamente', onclick: retry })); } } };
 const sandbox = { ctx, root, console: { warn: (...v) => logs.push(v) } };
 vm.runInNewContext(source, sandbox);
 return { root, calls, erros, logs, start: () => vm.runInNewContext('montarEnsaioCalendario(root,ctx)', sandbox), obsolete: () => { obsoleta = true; } };
}
(async () => {
 const vazio = setup(async () => ({ dados: dto() })); await vazio.start();
 assert.ok(text(vazio.root).includes('Somente simulação'));
 assert.ok(text(vazio.root).includes('não declarado'));
 assert.ok(text(vazio.root).includes('Leitura: local 2026-10-08T21:00:00Z'), 'Leitura passa pelo formatador local, nao ISO cru');
 assert.ok(text(vazio.root).includes('Nenhum planejamento'));
 assert.deepEqual(vazio.calls, ['/api/marketing/calendario/ensaio']);
 assert.deepEqual(buttons(vazio.root).map((b) => b.attrs.texto), ['Atualizar ensaio']);
 const d = dto(); d.itens = [{ estado: 'ensaio', pecaId: 'peca1', recibo: 'sim-1', versao: 'v1', midias: [{ nome: '<script>alert(1)</script>', tipo: 'imagem' }] }, { estado: 'bloqueado', pecaId: null, recibo: 'sim-2', midias: null, bloqueios: ['data-ou-hora-invalida'] }];
 const itens = setup(async () => ({ dados: d })); await itens.start();
 assert.ok(text(itens.root).includes('Ensaiado, sem agendamento real'));
 assert.ok(text(itens.root).includes('Bloqueado no ensaio'));
 assert.ok(text(itens.root).includes('Não informado'));
 assert.ok(text(itens.root).includes('Recibo de simulação: sim-2'));
 assert.ok(text(itens.root).includes('<script>alert(1)</script>')); // texto, nunca innerHTML
 let fail = true;
 const retry = setup(async () => { if (fail) throw Object.assign(Error('Falha de leitura'), { codigo: 'prazo' }); return { dados: dto() }; });
 await retry.start(); assert.equal(retry.erros.length, 1); assert.equal(retry.logs.length, 1);
 fail = false; await buttons(retry.root)[0].attrs.onclick(); assert.equal(retry.calls.length, 2);
 assert.ok(text(retry.root).includes('Somente simulação'));
 let done;
 const tarde = setup(() => new Promise((r) => { done = r; })); const promise = tarde.start();
 tarde.obsolete(); done({ dados: d }); await promise;
 assert.equal(text(tarde.root).includes('Recibo de simulação'), false);
 const invalido = setup(async () => ({ dados: { ...dto(), realHabilitado: true } })); await invalido.start();
 assert.equal(invalido.erros[0].codigo, 'ensaio-invalido');
 assert.equal(text(invalido.root).includes('Ensaiado'), false);
 console.log('admin-calendario-ensaio-tela: vazio, itens/nulos, texto seguro, falha/retry GET, resposta tardia e gate somente ensaio OK; zero escrita');
})().catch((e) => { console.error(e); process.exitCode = 1; });

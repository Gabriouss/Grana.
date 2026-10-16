'use strict';
// Sino e central do painel local (M6, Lumen): módulos reais. A parte pura do navegador tem paridade
// com lib/admin-notificacoes.ts; o servidor local recusa entrada ruim e só mexe em lidaEm.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const compilar = (f) => ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: f.endsWith('.js') ? 'x.js' : 'x.ts',
}).outputText;
const carregar = (f) => { const m = {}; vm.runInNewContext(compilar(f), { exports: m, URL, Date, console }); return m; };
const igual = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);

const web = carregar('tools/admin-local/web/telas/_notificacoes.js');
const lib = carregar('lib/admin-notificacoes.ts');

// ---- paridade web x lib (lida: boolean na lib, lidaEm no painel local)
const base = new Date(2026, 9, 16, 12, 0);
const iso = (min) => new Date(base.getTime() - min * 60_000).toISOString();
const dia = (d, h) => new Date(2026, 9, d, h, 0).toISOString();
const fixtura = [
  { id: 'a', fonte: 'publicacoes', importancia: 'agir', criadoEm: iso(4), lida: false },
  { id: 'b', fonte: 'feedbacks', importancia: 'informacao', criadoEm: iso(30), lida: false },
  { id: 'c', fonte: 'criativos', importancia: 'agir', criadoEm: dia(15, 23), lida: true },
  { id: 'd', fonte: 'sistema', importancia: 'informacao', criadoEm: dia(14, 8), lida: false },
  { id: 'novo', fonte: 'sistema', importancia: 'agir', criadoEm: new Date(base.getTime() + 5000).toISOString(), lida: false },
];
const paraWeb = fixtura.map((n) => ({ ...n, lidaEm: n.lida ? n.criadoEm : null }));
const ids = (l) => l.map((n) => n.id);

for (const n of [0, 1, 99, 100, 127, null]) igual(web.rotuloContador(n), lib.rotuloContador(n), `contador ${n}`);
for (const n of [0, 1, 3, 127, null]) igual(web.nomeAcessivelSino(n), lib.nomeAcessivelSino(n), `nome ${n}`);
for (const n of [0, 1, 4]) igual(web.textoNaoLidas(n), lib.textoNaoLidas(n));
for (const aba of ['nao-lidas', 'todas']) for (const fonte of ['todas', 'publicacoes', 'feedbacks']) for (const importancia of ['todas', 'agir', 'informacao']) {
  const f = { aba, fonte, importancia };
  igual(ids(web.filtrar(paraWeb, f)), ids(lib.filtrar(fixtura, f)), `filtro ${aba}/${fonte}/${importancia}`);
  igual(web.filtrosAtivos(f), lib.filtrosAtivos(f));
}
igual(web.agrupar(paraWeb, base).map((g) => [g.rotulo, ids(g.itens)]), lib.agrupar(fixtura, base).map((g) => [g.rotulo, ids(g.itens)]), 'agrupamento');
igual(web.contarNaoLidas(paraWeb), lib.contarNaoLidas(fixtura));
const instante = base.getTime();
const idsWeb = web.idsParaMarcarTodas(paraWeb, instante);
igual(idsWeb, lib.marcarTodas(fixtura, instante).ids, 'marcar todas: mesmos ids');
assert.ok(!idsWeb.includes('novo'), 'o que chegou depois do instante não entra');
// aplicar por id sobre a lista de agora preserva o que chegou durante a gravação
const depois = web.marcarIds([...paraWeb, { id: 'chegou', fonte: 'sistema', importancia: 'agir', criadoEm: iso(0), lidaEm: null }], idsWeb, 'T');
igual(depois.filter((n) => !n.lidaEm).map((n) => n.id), ['novo', 'chegou']);
igual(web.rotuloMarcarTodas(1), lib.rotuloMarcarTodas(1));
igual(web.rotuloMarcarTodas(3), lib.rotuloMarcarTodas(3));
// falha não vira zero
igual(web.totalConhecido({ situacao: 'erro', ultima: { lista: paraWeb, atualizadoEm: iso(9) } }), 4);
igual(web.totalConhecido({ situacao: 'erro' }), null);
igual(web.totalConhecido({ situacao: 'carregando' }), null);

// ---- servidor local: dublê em memória
const srv = require('../tools/admin-local/marketing/notificacoes.cjs');
srv._reiniciar();
const l0 = srv.listarNotificacoes();
assert.equal(l0.fonte, 'dados-de-teste');
assert.equal(l0.naoLidas, 3);
assert.match(l0.aviso, /Dados de teste/);
for (const n of l0.notificacoes) {
  assert.ok(srv.CODIGOS[n.codigo], 'todo texto vem da tabela do servidor');
  assert.deepEqual(Object.keys(n).sort(), ['acao', 'codigo', 'criadoEm', 'destino', 'fonte', 'id', 'importancia', 'lidaEm', 'resolvidaEm', 'resumo', 'titulo']);
  assert.ok(n.destino === null || /^#\/marketing\//.test(n.destino), 'destino só interno do painel');
}
// ler: valida entrada e só mexe em lidaEm
for (const ruim of [{}, { ids: [] }, { ids: 'd1' }, { ids: [1] }, { ids: ['../x'] }, { ids: Array.from({ length: 51 }, (_, i) => `n${i}`) }]) {
  assert.throws(() => srv.marcarNotificacoes('.', ruim), (e) => e.codigo === 'ids-invalidos' && e.status === 400, JSON.stringify(ruim).slice(0, 40));
}
const r1 = srv.marcarNotificacoes('.', { ids: ['d1', 'inexistente'] });
assert.equal(r1.atualizados, 1);
assert.equal(r1.naoLidas, 2);
const d1 = r1.notificacoes.find((n) => n.id === 'd1');
assert.ok(d1.lidaEm && d1.resolvidaEm === null, 'ler não resolve');
const r2 = srv.marcarNotificacoes('.', { ids: ['d1'] });
assert.equal(r2.atualizados, 0, 'ler duas vezes não conta de novo');
const r3 = srv.marcarNotificacoes('.', { ids: ['d1'], desfazer: true });
assert.equal(r3.naoLidas, 3);
srv._reiniciar();

// ---- fiação: rotas, casca e segurança do texto
const rotas = fs.readFileSync('tools/admin-local/rotas.cjs', 'utf8');
assert.ok(rotas.includes("'/api/marketing/notificacoes': (req, res) => rotaMarketingGet(res, 'notificacoes', ['listarNotificacoes']"), 'GET registrado');
assert.ok(/MARKETING_POST = new Set\(\[[^\]]*'\/api\/marketing\/notificacoes\/ler'/.test(rotas), 'POST dentro do mesmo guarda (CSRF, limite, credencial)');
assert.ok(rotas.includes("rotaMarketingPost(res, 'notificacoes', ['marcarNotificacoes'], [corpo])"));
const html = fs.readFileSync('tools/admin-local/web/index.html', 'utf8');
assert.ok(html.includes('id="sino-barra"') && html.includes('id="sino-faixa"'), 'dois pontos de encaixe: barra móvel e faixa do conteúdo');
const app = fs.readFileSync('tools/admin-local/web/app.js', 'utf8');
const FIM = String.fromCharCode(10) + '}' + String.fromCharCode(10);
const corpoDe = (nome) => { const i = app.indexOf('function ' + nome + '()'); return app.slice(i, app.indexOf(FIM, i)); };
assert.ok(corpoDe('mostrarPainel').includes('ligarSino()'), 'sino só depois do login');
assert.ok(corpoDe('esconderPainel').includes('desligarSino()'), 'sair ou vencer a sessão derruba o sino e a central');
const tela = fs.readFileSync('tools/admin-local/web/telas/_notificacoes.js', 'utf8');
assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/.test(tela), 'texto da API só entra por textContent');
for (const trecho of ["showModal()", "role: 'tablist'", "'ArrowLeft'", "'aria-haspopup': 'dialog'", "aria-label': 'Fechar notificações'", "nomeAcessivelSino"]) assert.ok(tela.includes(trecho), `tela sem ${trecho}`);
assert.ok(!/fetch\(|XMLHttpRequest/.test(tela), 'a tela só fala com o servidor local pelo api/acao do app');
const css = fs.readFileSync('tools/admin-local/web/estilo.css', 'utf8');
const ini = css.indexOf('Sino global e central de notificações');
const fim = css.indexOf('Resultados de marketing (E4', ini);
const bloco = css.slice(ini, fim > 0 ? fim : undefined);
for (const [, px] of bloco.matchAll(/font-size:\s*(\d+)px/g)) assert.ok(Number(px) >= 15 || px === '11', `texto de ${px}px na central`);
assert.ok(!/animation|transition/.test(bloco), 'a central não anima: nada a desligar em movimento reduzido');

console.log('admin-sino-local: paridade com a lib, dublê do servidor, fiação de rota/casca e texto seguro OK');

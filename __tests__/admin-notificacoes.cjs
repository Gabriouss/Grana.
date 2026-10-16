// M6: sino, central e estados de publicação do /admin web. Módulo real compilado em memória.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const compilar = (f) => ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const m = {};
vm.runInNewContext(compilar('lib/admin-notificacoes.ts'), { exports: m, URL, Date, console });

const igual = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);
const base = new Date(2026, 9, 16, 12, 0);
const iso = (min) => new Date(base.getTime() - min * 60_000).toISOString();
const N = (id, extra = {}) => ({ id, fonte: 'publicacoes', importancia: 'agir', titulo: id, resumo: '', criadoEm: iso(5), lida: false, ...extra });

// Contador: numeral até 99, 99+ acima, zero sem selo, nome acessível com o total completo.
assert.equal(m.rotuloContador(0), null);
assert.equal(m.rotuloContador(1), '1');
assert.equal(m.rotuloContador(99), '99');
assert.equal(m.rotuloContador(127), '99+');
assert.equal(m.rotuloContador(null), null);
assert.equal(m.nomeAcessivelSino(127), 'Notificações, 127 não lidas');
assert.equal(m.nomeAcessivelSino(1), 'Notificações, 1 não lida');
assert.equal(m.nomeAcessivelSino(null), 'Notificações indisponíveis');

// Falha não vira zero: erro com cache mantém o número; sem cache é desconhecido (null), nunca 0.
const lista = [N('a'), N('b'), N('c', { lida: true })];
assert.equal(m.totalConhecido({ situacao: 'ok', lista, atualizadoEm: iso(0) }), 2);
assert.equal(m.totalConhecido({ situacao: 'erro', ultima: { lista, atualizadoEm: iso(9) } }), 2);
assert.equal(m.totalConhecido({ situacao: 'erro' }), null);
assert.equal(m.totalConhecido({ situacao: 'carregando' }), null);

// Marcar uma só mexe em `lida`; resolução fica como estava.
const um = m.marcarLida([N('a', { resolvida: false }), N('b')], 'a');
igual(um.map((n) => n.lida), [true, false]);
assert.equal(um[0].resolvida, false);

// Marcar todas: pega todas as existentes (todos os filtros) e preserva as que chegaram depois do instante.
const instante = base.getTime();
const comNova = [N('a'), N('b', { fonte: 'feedbacks' }), N('nova', { criadoEm: new Date(instante + 5000).toISOString() })];
const r = m.marcarTodas(comNova, instante);
igual(r.ids, ['a', 'b']);
assert.equal(r.lista.find((n) => n.id === 'nova').lida, false);
// Aplicação por id sobre a lista de agora: o que chegou durante a gravação segue não lido.
const depois = m.marcarIds([...comNova, N('chegou-durante')], r.ids);
igual(depois.map((n) => n.lida), [true, true, false, false]);
// Desfazer devolve só os marcados.
igual(m.desfazerMarcacao(r.lista, r.ids).map((n) => n.lida), [false, false, false]);
assert.equal(m.rotuloMarcarTodas(3), 'Marcar 3 como lidas');
assert.equal(m.rotuloMarcarTodas(1), 'Marcar 1 como lida');

// Filtros e agrupamento por dia local.
const mista = [N('x', { fonte: 'feedbacks', importancia: 'informacao' }), N('y'), N('z', { lida: true })];
igual(m.filtrar(mista, { aba: 'nao-lidas', fonte: 'todas', importancia: 'todas' }).map((n) => n.id), ['x', 'y']);
igual(m.filtrar(mista, { aba: 'todas', fonte: 'feedbacks', importancia: 'todas' }).map((n) => n.id), ['x']);
igual(m.filtrar(mista, { aba: 'todas', fonte: 'todas', importancia: 'agir' }).map((n) => n.id), ['y', 'z']);
assert.equal(m.filtrosAtivos({ aba: 'todas', fonte: 'feedbacks', importancia: 'agir' }), 2);
const grupos = m.agrupar([N('h'), N('o', { criadoEm: new Date(2026, 9, 15, 23, 0).toISOString() })], base);
igual(grupos.map((g) => [g.rotulo, g.itens.map((n) => n.id)]), [['Hoje', ['h']], ['Anteriores', ['o']]]);

// Nove estados distintos: rótulo, ícone e evidência.
assert.equal(m.ESTADOS_PUBLICACAO.length, 9);
const ev = { idRemoto: 'r', confirmadoEm: iso(1), consultadoEm: iso(1) };
const selos = m.ESTADOS_PUBLICACAO.map((e) => m.seloDoDestino({ destino: 'X', estado: e, ...ev }));
assert.equal(new Set(selos.map((s) => s.rotulo)).size, 9);
assert.equal(new Set(selos.map((s) => s.icone)).size, 9, 'cada estado tem ícone próprio');
igual(selos.map((s) => s.rotulo), ['Planejado', 'Programado no painel', 'Agendado na Meta', 'Preparando', 'Publicado', 'Cancelamento pendente', 'Cancelado', 'Falhou', 'Precisa conferir']);

// Evidência: sem recibo não há Publicado nem Agendado na Meta; ensaio nunca é remoto.
assert.equal(m.seloDoDestino({ destino: 'X', estado: 'publicado' }).estado, 'precisa-conferir');
assert.equal(m.seloDoDestino({ destino: 'X', estado: 'publicado', idRemoto: 'r' }).estado, 'precisa-conferir');
assert.equal(m.seloDoDestino({ destino: 'X', estado: 'agendado-meta', idRemoto: 'r' }).estado, 'precisa-conferir');
assert.equal(m.seloDoDestino({ destino: 'X', estado: 'agendado-meta', ...ev, ensaio: true }).estado, 'precisa-conferir');
assert.equal(m.seloDoDestino({ destino: 'X', estado: 'agendado-meta', ...ev }).estado, 'agendado-meta');
// Estado desconhecido não vira Planejado, Cancelado nem Publicado.
const desconhecido = m.seloDoDestino({ destino: 'X', estado: 'qualquer-coisa-do-servidor' });
assert.equal(desconhecido.rotulo, 'Estado indisponível');
assert.equal(desconhecido.proximoPasso, 'Conferir atualização');
assert.equal(m.seloDoDestino({ destino: 'X', estado: '' }).rotulo, 'Estado indisponível');

// Execução parcial: dois resultados, sem selo global Publicado, e repetir o Facebook fica bloqueado.
const fb = { destino: 'Facebook', estado: 'publicado', ...ev };
const ig = { destino: 'Instagram', estado: 'precisa-conferir' };
const parcial = m.resumoDestinos([fb, ig]);
assert.equal(parcial.texto, '1 de 2 destinos publicado; 1 precisa conferir');
assert.equal(parcial.todosPublicados, false);
assert.equal(m.podeRepetirEnvio(fb), false);
assert.equal(m.podeRepetirEnvio(ig), false);
assert.equal(m.resumoDestinos([fb, { ...fb, destino: 'Instagram' }]).todosPublicados, true);
for (const e of ['programado', 'agendado-meta', 'preparando', 'publicado', 'cancelamento-pendente', 'precisa-conferir']) {
  assert.equal(m.podeRepetirEnvio({ destino: 'X', estado: e, ...ev }), false, `${e} não repete`);
}
assert.equal(m.podeRepetirEnvio({ destino: 'X', estado: 'falhou' }), true);

// Links externos só https sem credencial.
assert.equal(m.urlSegura('https://facebook.com/p/1'), 'https://facebook.com/p/1');
assert.equal(m.urlSegura('http://facebook.com/p/1'), null);
assert.equal(m.urlSegura('javascript:alert(1)'), null);
assert.equal(m.urlSegura('https://u:p@x.com/'), null);
assert.equal(m.urlSegura(null), null);

// Estrutura da tela (texto do módulo real): diálogo modal, retorno do foco, Esc, fundo inerte, sem nada de segredo.
const central = fs.readFileSync('components/admin/CentralNotificacoes.web.tsx', 'utf8');
for (const trecho of ['role="dialog"', 'aria-modal="true"', "e.key === 'Escape'", "setAttribute('inert'", 'botao.current?.focus()', 'role="tablist"', "'ArrowLeft'", 'aria-label="Fechar notificações"', 'aria-live="polite"']) {
  assert.ok(central.includes(trecho), `central sem ${trecho}`);
}
assert.ok(!/token|secret|service_role|apikey/i.test(central + fs.readFileSync('components/admin/PublicacoesEstados.web.tsx', 'utf8')), 'nenhuma credencial na tela');
assert.ok(!/fetch\(|supabase|functions\.invoke/.test(central), 'dublê: a central não faz chamada de rede');
// Menor texto 15px (11 só no numeral do contador, decorativo: o nome acessível tem o total), sem negrito sintético.
const css = fs.readFileSync('components/admin/central-notificacoes.css', 'utf8');
for (const [, px] of css.matchAll(/font-size:\s*(\d+)px/g)) {
  assert.ok(Number(px) >= 15 || px === '11', `texto de ${px}px fora da escala`);
}
assert.ok(!/font-weight:\s*(bold|[6-9]00)/.test(css), 'sem negrito sintético');

console.log('admin-notificacoes: contador, leitura, marcar todas, 9 estados, evidência e estrutura OK');

'use strict';
/*
 * Aprendizado e relatórios (E7) no painel local, 16/10/2026.
 *
 *   node __tests__/admin-aprendizado-local.cjs
 *
 * Executa o módulo real do servidor (marketing/relatorio-semanal.cjs), o exportador real
 * (lib/admin-relatorio-csv.ts, de Argon) e a tela real (web/telas/aprendizado.js). Só o DOM é dublê.
 * Trava: sem fonte o estado é indisponível (nunca zero), no máximo três recomendações, null nunca vira
 * zero na tela nem no CSV, CSV sai do MESMO objeto da tela, falha de exportação não simula download.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
let passou = 0;
const ok = (c, nome) => { assert.ok(c, nome); passou++; };
const igual = (a, b, nome) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), nome); passou++; };
const lerTela = (arq) => fs.readFileSync(path.join(ROOT, 'tools/admin-local/web/telas', arq), 'utf8');

const mod = require(path.join(ROOT, 'tools/admin-local/marketing/relatorio-semanal.cjs'));
mod._definirFonte(async () => null); // Sem consultar o .env ou a rede real no teste.
const { RELATORIO_DE_TESTE } = (() => {
  const sb = {};
  vm.runInNewContext(lerTela('_relatorio-fixture.js').replace(/^export /gm, '') + '\n;globalThis.RELATORIO_DE_TESTE = RELATORIO_DE_TESTE;', sb);
  return sb;
})();

// exportador direto, para comparar com o que o módulo devolve
const csvDireto = (() => {
  const js = ts.transpileModule(fs.readFileSync(path.join(ROOT, 'lib/admin-relatorio-csv.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; new Function('module', 'exports', js)(m, m.exports); return m.exports;
})();

(async () => {
  // ---------- servidor ----------
  const sem = await mod.lerRelatorio();
  ok(sem.status === 'indisponivel' && sem.relatorio === null && /nenhum número foi calculado/i.test(sem.motivo), 'sem fonte: indisponível com o motivo, sem relatório');
  ok(!JSON.stringify(sem).includes('"0"') && !('metrics' in sem), 'sem fonte não inventa métrica nem zero');
  mod._definirFonte(() => RELATORIO_DE_TESTE);
  const com = await mod.lerRelatorio();
  ok(com.status === 'ok' && com.relatorio.reportId === 'fixture-report-001', 'com fonte devolve o WeeklyReport');
  mod._definirFonte(() => null);

  const exp = await mod.exportarCsv(null, { relatorio: RELATORIO_DE_TESTE });
  ok(exp.conteudo === csvDireto.relatorioSemanalParaCsv(RELATORIO_DE_TESTE), 'CSV do painel é o do exportador de Argon, sem segunda implementação');
  ok(/^relatorio-semanal-2026-10-05-rev2\.csv$/.test(exp.nome), 'nome do arquivo leva semana e revisão');
  const linhas = exp.conteudo.split(/\r?\n/);
  const cab = linhas[0].split(',');
  const iv = cab.indexOf('value'); const ie = cab.indexOf('value_state');
  const gasto = linhas.find((l) => l.includes('meta_ad_spend') && l.includes(',value,'));
  ok(gasto && /,value,,not_configured,/.test(gasto), 'valor nulo sai vazio com estado explícito, nunca zero');
  ok(iv > -1 && ie > -1, 'cabeçalho tem value e value_state');

  const recusa = async (r) => { try { await mod.exportarCsv(null, { relatorio: r }); return null; } catch (e) { return e; } };
  ok((await recusa({ ...RELATORIO_DE_TESTE, contractVersion: 'e6' })).codigo === 'relatorio-invalido', 'outra versão de contrato é recusada');
  ok((await recusa({ ...RELATORIO_DE_TESTE, recommendations: [...RELATORIO_DE_TESTE.recommendations, RELATORIO_DE_TESTE.recommendations[0]] })).status === 400, 'mais de três recomendações é recusado');
  ok((await recusa(null)).status === 400 && (await recusa('x')).status === 400 && (await recusa({})).status === 400, 'corpo que não é relatório é recusado');
  const sujo = JSON.parse(JSON.stringify(RELATORIO_DE_TESTE));
  sujo.recommendations[0].title = 'Contato fulano@exemplo.com em https://x.exemplo/privado?token=abc';
  const limpo = (await mod.exportarCsv(null, { relatorio: sujo })).conteudo;
  ok(!limpo.includes('fulano@exemplo.com') && !limpo.includes('https://x.exemplo'), 'e-mail e URL saem redigidos do CSV');

  // ---------- tela ----------
  const node = (tag, attrs = {}, ...filhos) => ({ tag, attrs, children: filhos.flat(Infinity).filter((x) => x != null && x !== false), appendChild(n) { this.children.push(n); }, replaceChildren(...n) { this.children = n.flat(Infinity); }, remove() {}, click() { sandbox.cliques.push(this.attrs); }, get textContent() { return this.attrs.texto || ''; }, set textContent(v) { this.attrs.texto = v; } });
  const texto = (n) => (n == null ? '' : typeof n === 'object' ? [n.attrs?.texto || '', ...(n.children || []).map(texto)].join(' ') : String(n));
  const walk = (n) => [n, ...(n.children || []).flatMap(walk)];
  const botao = (raiz, rotulo) => walk(raiz).find((n) => n.tag === 'button' && n.attrs.texto === rotulo);
  const fonte = lerTela('aprendizado.js');
  const nomes = [...fonte.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((x) => x[1]);
  const corpoJs = fonte.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const sandbox = { cliques: [], RELATORIO_DE_TESTE, console: { warn: () => {} }, Blob: class { constructor(p) { this.partes = p; } }, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    document: { body: { appendChild() {}, classList: { add() {}, remove() {} } } }, window: { print() { sandbox.impressoes = (sandbox.impressoes || 0) + 1; }, addEventListener() {}, removeEventListener() {} }, setTimeout: () => 0, Date, Intl };
  vm.runInNewContext(`(function(){${corpoJs}\n;Object.assign(globalThis,{${nomes.join(',')}});})()`, sandbox);

  async function tela({ resposta, falha = false, acao = null, depois = null }) {
    const chamadas = [], avisos = [];
    const ctx = {
      h: node, obsoleta: () => false, cabecalho: () => {},
      alerta: (n, t) => node('p', { texto: t }), selo: (n, t) => node('span', { texto: t }),
      secao: (t, ...f) => node('section', {}, node('h2', { texto: t }), f),
      tabela: (colunas, linhas, o) => node('table', { legenda: o && o.legenda }, linhas.map((l) => node('tr', {}, colunas.map((c) => node('td', {}, c.valor(l)))))),
      estado: { carregando: (r, t) => r.replaceChildren(node('p', { texto: t })), erro: (r) => r.replaceChildren(node('p', { texto: 'Falha ao ler' })) },
      api: async (url) => { chamadas.push(['GET', url]); if (falha) throw new Error('x'); return { dados: resposta }; },
      acao: async (url, corpo) => { chamadas.push(['POST', url, corpo]); if (acao instanceof Error) throw acao; return { dados: acao }; },
      aviso: (t, tipo) => avisos.push([t, tipo]),
    };
    const raiz = node('main'); Object.assign(sandbox, { raiz, ctx });
    await vm.runInNewContext('montar(raiz, ctx)', sandbox);
    if (depois) await depois(raiz, chamadas, avisos);
    return { raiz, chamadas, avisos };
  }

  { // indisponível
    const t = await tela({ resposta: { status: 'indisponivel', motivo: mod.MOTIVO_SEM_FONTE, relatorio: null } });
    const x = texto(t.raiz);
    ok(x.includes('Relatório semanal indisponível') && x.includes('Indisponível não é zero') && x.includes('fontes não forneceram métricas'), 'sem fonte: a tela diz indisponível e por quê');
    ok(!x.includes('Exportar CSV') && botao(t.raiz, 'Ver com dados de teste'), 'sem relatório não há exportação; dados de teste só por botão explícito');
  }
  { // erro de leitura não vira vazio
    const t = await tela({ resposta: null, falha: true });
    ok(texto(t.raiz).includes('Falha ao ler') && !texto(t.raiz).includes('indisponível'), 'falha de leitura mostra erro, não "indisponível" nem zero');
  }
  { // dados de teste
    const t = await tela({ resposta: { status: 'ok', relatorio: RELATORIO_DE_TESTE } });
    const x = texto(t.raiz);
    ok(x.includes('Dados de teste') === false, 'relatório vindo do servidor não é marcado como teste');
    ok(x.includes('revisão 2') && x.includes('fixture-origin-001') && x.includes('America/Sao_Paulo'), 'mostra revisão, fotografia e fuso');
    ok(x.includes('05 de out. de 2026') || /05\s+de\s+out/.test(x) || /5\s+de\s+out/.test(x), 'período em português');
    const recs = walk(t.raiz).filter((n) => n.tag === 'article');
    ok(recs.length === 3 && recs.length <= 3, 'no máximo três recomendações, aqui três');
    ok(x.includes('Inconclusiva, ação suspensa') && x.includes('Informativa'), 'estado de cada recomendação em texto');
    ok(x.includes('Amostra pequena') && x.includes('6 observados') && x.includes('política aprovada'), 'amostra com tamanho e política');
    ok(x.includes('Origem desconhecida nunca é tratada como orgânica') && x.includes('Hipótese') && x.includes('Ação sugerida'), 'origem desconhecida e hipótese/ação presentes');
    ok(x.includes('1 candidata ficou de fora'), 'candidata omitida é contada, sem segunda lista');
    // nulo nunca vira zero
    const linhas = walk(t.raiz).filter((n) => n.tag === 'tr').map(texto);
    const gasto = linhas.find((l) => l.includes('Investimento em anúncios'));
    ok(gasto.includes('Sem valor') && gasto.includes('Não configurado') && !/\b0\b/.test(gasto.replace(/\s+/g, ' ').replace('BRL', '')), 'gasto nulo: "Sem valor" + Não configurado, sem zero');
    const receita = linhas.find((l) => l.includes('Receita bruta confirmada'));
    ok(receita.includes('Sem valor') && receita.includes('Indisponível'), 'receita nula indisponível, sem zero');
    const assin = linhas.find((l) => l.includes('Novas assinaturas pagas'));
    ok(assin.includes('12') && assin.includes('Parcial'), 'valor parcial aparece com o selo Parcial');
    const rev = linhas.find((l) => l.includes('Reembolsos e chargebacks'));
    ok(/\b0\b/.test(rev) && rev.includes('Observado'), 'zero só quando observado');
    ok(x.includes('não é lucro'), 'receita bruta não é chamada de lucro');
  }
  { // exportar CSV: manda o MESMO relatório; sucesso
    const t = await tela({ resposta: { status: 'ok', relatorio: RELATORIO_DE_TESTE }, acao: { nome: 'relatorio-semanal-2026-10-05-rev2.csv', tipo: 'text/csv', conteudo: 'a,b' },
      depois: async (raiz) => { await botao(raiz, 'Exportar CSV').attrs.onclick({ currentTarget: botao(raiz, 'Exportar CSV') }); } });
    const post = t.chamadas.find((c) => c[0] === 'POST');
    ok(post[1] === '/api/marketing/aprendizado/csv' && post[2].relatorio.snapshotId === 'fixture-origin-001' && post[2].relatorio.revision === 2, 'exporta o mesmo snapshot e a mesma revisão da tela');
    ok(t.avisos.some((a) => /CSV gerado/.test(a[0]) && a[1] === 'ok') && sandbox.cliques.some((c) => c.download === 'relatorio-semanal-2026-10-05-rev2.csv'), 'recibo de sucesso e download disparado');
  }
  { // exportar CSV: falha não simula download
    sandbox.cliques.length = 0;
    const t = await tela({ resposta: { status: 'ok', relatorio: RELATORIO_DE_TESTE }, acao: Object.assign(new Error('x'), { codigo: 'csv-falhou' }),
      depois: async (raiz) => { await botao(raiz, 'Exportar CSV').attrs.onclick({ currentTarget: botao(raiz, 'Exportar CSV') }); } });
    ok(t.avisos.some((a) => /Nada foi baixado/.test(a[0]) && a[1] === 'erro') && sandbox.cliques.length === 0, 'falha: aviso de erro e nenhum download');
    const t2 = await tela({ resposta: { status: 'ok', relatorio: RELATORIO_DE_TESTE }, acao: { nome: 'x.csv' },
      depois: async (raiz) => { await botao(raiz, 'Exportar CSV').attrs.onclick({ currentTarget: botao(raiz, 'Exportar CSV') }); } });
    ok(t2.avisos.some((a) => a[1] === 'erro') && sandbox.cliques.length === 0, 'resposta fora do formato também não baixa nada');
  }
  { // PDF pela impressão
    sandbox.impressoes = 0;
    await tela({ resposta: { status: 'ok', relatorio: RELATORIO_DE_TESTE }, depois: async (raiz) => { await botao(raiz, 'Salvar como PDF').attrs.onclick(); } });
    ok(sandbox.impressoes === 1, 'Salvar como PDF abre a impressão da mesma tela');
  }
  { // sem recomendações: lista vazia explicada
    const t = await tela({ resposta: { status: 'ok', relatorio: { ...RELATORIO_DE_TESTE, recommendations: [], omittedCandidateCount: 0, experiments: [] } } });
    ok(texto(t.raiz).includes('Nenhuma recomendação nesta semana') && texto(t.raiz).includes('Nenhum experimento nesta semana'), 'zero recomendações e experimentos: dito, sem inventar');
  }
  { // semana parcial avisa
    const t = await tela({ resposta: { status: 'ok', relatorio: { ...RELATORIO_DE_TESTE, periodState: 'partial' } } });
    ok(texto(t.raiz).includes('Semana parcial'), 'semana parcial é sinalizada');
  }
  { // funções puras
    igual(vm.runInNewContext('valorDaMetrica({value:null,unit:"BRL"})', sandbox), 'Sem valor', 'null vira "Sem valor"');
    igual(vm.runInNewContext('valorDaMetrica({value:0,unit:"BRL"})', sandbox), '0 BRL', 'zero observado fica zero');
  }

  // ---------- fiação ----------
  const rotas = fs.readFileSync(path.join(ROOT, 'tools/admin-local/rotas.cjs'), 'utf8');
  ok(rotas.includes("'/api/marketing/aprendizado'") && rotas.includes("'lerRelatorio'") && rotas.includes("'exportarCsv'"), 'rotas ligadas ao módulo');
  ok(/MARKETING_POST = new Set\([^)]*aprendizado\/csv/.test(rotas), 'POST do CSV no conjunto com CSRF e sessão');
  ok(fs.readFileSync(path.join(ROOT, 'tools/admin-local/web/app.js'), 'utf8').includes("'marketing/aprendizado'"), 'tela registrada');
  ok(fs.readFileSync(path.join(ROOT, 'tools/admin-local/web/index.html'), 'utf8').includes('#/marketing/aprendizado'), 'item no menu');
  ok(/@media print/.test(fs.readFileSync(path.join(ROOT, 'tools/admin-local/web/estilo.css'), 'utf8')), 'folha de impressão existe');

  console.log(`admin-aprendizado-local: ${passou} checagens passaram — 0 falhas`);
})().catch((e) => { console.error(e); process.exit(1); });

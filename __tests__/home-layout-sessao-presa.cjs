// Início sem blocos enquanto a sessão renova (07/11/2026): módulos REAIS `lib/home-layout.ts` e
// `lib/sessao-offline.ts` compilados em vm. Só o supabase e o disco são dublês, e o prazo de 2 s
// é encurtado no sandbox para a espera caber em milissegundos. Asserta também QUANTAS vezes o
// servidor foi consultado.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
let chamadasGetSession = 0;
let comportamento = 'pendurado'; // 'pendurado' | 'rejeita' | 'ok'
let sessaoNoDisco = null;
let sessaoDoServidor = null;
let logs = [];
let resolverSessao;
let salvos = [];

const supabaseDublê = {
  supabase: {
    auth: {
      getSession() {
        chamadasGetSession++;
        if (comportamento === 'pendurado') return new Promise(() => {});
        if (comportamento === 'rejeita') return Promise.reject(new Error('fetch failed'));
        if (comportamento === 'controlada') return new Promise((resolve) => { resolverSessao = resolve; });
        return Promise.resolve({ data: { session: sessaoDoServidor }, error: null });
      },
      updateUser: async (input) => { salvos.push(input.data.home_layout); return {}; },
    },
  },
  CHAVE_SESSAO: 'sessao',
  armazenamentoSessao: { getItem: async () => (sessaoNoDisco ? JSON.stringify(sessaoNoDisco) : null) },
};

const cache = new Map();
function carregar(relativo) {
  const arquivo = path.join(root, relativo);
  if (cache.has(arquivo)) return cache.get(arquivo);
  const fonte = fs.readFileSync(arquivo, 'utf8');
  const { outputText } = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  cache.set(arquivo, exports);
  vm.runInNewContext(outputText, {
    exports,
    console: { warn: (...a) => logs.push(a), error: (...a) => logs.push(a) },
    // O prazo de 2 s do app vira 5 ms aqui; a constante de produção não muda.
    setTimeout: (fn, ms) => setTimeout(fn, ms >= 1000 ? 5 : ms),
    clearTimeout,
    require(id) {
      if (id === './supabase') return supabaseDublê;
      if (id === './sessao-offline') return carregar('lib/sessao-offline.ts');
      if (id === '@supabase/supabase-js') return {};
      throw new Error('import sem dublê: ' + id);
    },
  }, { filename: relativo });
  return exports;
}

const layout = carregar('lib/home-layout.ts');
const sessao = carregar('lib/sessao-offline.ts');
const usuario = (home_layout) => ({ id: 'u', user_metadata: home_layout === undefined ? {} : { home_layout } });
const sessaoCom = (home_layout) => ({ access_token: 'a', refresh_token: 'r', user: usuario(home_layout) });
const personalizado = [{ key: 'fluxo', visible: true }, { key: 'saldo', visible: false }];
const chaves = (l) => l.map((b) => b.key + (b.visible ? '' : '!')).join(',');

async function etapas() {
  const aplicados = [];
  await layout.carregarLayoutHomeEmEtapas((l) => aplicados.push(l));
  return aplicados;
}
let n = 0;
const ok = (t) => console.log(`ok ${++n}: ${t}`);

(async () => {
  assert.equal(layout.layoutPadrao().length, 10);

  // 1) getSession pendurado (token vencido, rede ruim): os blocos aparecem, com o layout salvo no aparelho.
  chamadasGetSession = 0; comportamento = 'pendurado'; sessaoNoDisco = sessaoCom(personalizado);
  let aplicados = await etapas();
  assert.equal(aplicados.length, 2, 'as duas etapas aplicam');
  for (const l of aplicados) {
    assert.ok(l.length >= 10, 'nunca lista vazia');
    assert.equal(l[0].key, 'fluxo', 'ordem personalizada preservada');
  }
  assert.equal(chamadasGetSession, 1, 'uma consulta ao servidor, sem laço');
  ok('getSession pendurado: blocos já na primeira etapa, layout salvo preservado, 1 consulta');

  // 2) Enquanto a renovação segue presa, nova carga não pergunta de novo.
  assert.equal(sessao.sessaoEstaTravada(), true);
  aplicados = await etapas();
  assert.equal(chamadasGetSession, 1, 'não empilha consultas enquanto a anterior está presa');
  assert.ok(aplicados.every((l) => l.length >= 10));
  ok('renovação já presa: não consulta o servidor de novo e ainda assim mostra os blocos');

  // 3) getSession rejeita: os blocos ficam (layout do aparelho), nada estoura.
  cache.clear();
  const layout2 = carregar('lib/home-layout.ts');
  comportamento = 'rejeita'; chamadasGetSession = 0; sessaoNoDisco = sessaoCom(personalizado);
  aplicados = [];
  await layout2.carregarLayoutHomeEmEtapas((l) => aplicados.push(l));
  assert.equal(aplicados.length, 2);
  assert.equal(chaves(aplicados.at(-1)), chaves(personalizado.concat(layout2.layoutPadrao().filter((b) => !['fluxo', 'saldo'].includes(b.key)))));
  assert.equal(chamadasGetSession, 1);
  ok('getSession rejeita: blocos ficam, vêm do aparelho, sem exceção');

  // 4) Sessão ok: vale o layout da conta (servidor).
  cache.clear();
  const layout3 = carregar('lib/home-layout.ts');
  comportamento = 'ok'; chamadasGetSession = 0;
  sessaoNoDisco = sessaoCom(undefined);
  sessaoDoServidor = sessaoCom([{ key: 'lancamentos', visible: true }]);
  aplicados = [];
  await layout3.carregarLayoutHomeEmEtapas((l) => aplicados.push(l));
  assert.equal(aplicados[0].length, 10, 'primeira etapa: padrão do aparelho');
  assert.equal(aplicados[1][0].key, 'lancamentos', 'segunda etapa: layout do servidor');
  assert.equal(aplicados[1].length, 10, 'blocos novos entram no fim');
  assert.equal(chamadasGetSession, 1);
  ok('sessão ok: troca pelo layout do servidor e reconcilia blocos novos');

  // 5) Layout salvo vazio ou só com chaves desconhecidas cai no padrão.
  for (const salvo of [[], [{ key: 'inexistente', visible: true }]]) {
    const l = layout3.layoutDoUsuario(usuario(salvo));
    assert.equal(l.length, 10);
    assert.ok(l.every((b) => b.visible));
  }
  assert.equal(layout3.layoutDoUsuario(null).length, 10);
  ok('layout salvo vazio, inválido ou ausente cai no padrão');

  // 6) Sem sessão em lugar nenhum: padrão, nunca vazio.
  comportamento = 'ok'; sessaoDoServidor = null; sessaoNoDisco = null;
  aplicados = [];
  await layout3.carregarLayoutHomeEmEtapas((l) => aplicados.push(l));
  assert.ok(aplicados.every((l) => l.length === 10));
  ok('sem sessão no servidor nem no disco: layout padrão');

  // 7) A tela: nunca nasce vazia e não sobrou chamada sem tratamento de erro.
  const tela = fs.readFileSync(path.join(root, 'app/(app)/index.tsx'), 'utf8');
  assert.match(tela, /useState<HomeBlockConfig\[\]>\(layoutPadrao\)/);
  assert.doesNotMatch(tela, /carregarLayoutHome\(\)\.then\(setHomeLayout\)/);
  assert.equal((tela.match(/void carregarHomeLayout\(\)/g) || []).length, 2);
  ok('Início nasce com layout padrão e as duas cargas usam as etapas com tratamento de erro');

  // D01: consulta iniciada antes do toque não pode desfazer a personalização.
  // Extraímos o handler e o ponto real de carga da tela; só React/setState são fronteiras.
  cache.clear();
  const layoutD01 = carregar('lib/home-layout.ts');
  const ast = ts.createSourceFile('index.tsx', tela, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler, carga, ref, pontoCarga, trocaDono;
  function visitar(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'handleLayoutChange') handler = node;
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'cargaLayoutRef') ref = node;
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'carregarHomeLayout') carga = node;
    if (ts.isIfStatement(node) && node.expression.getText(ast).includes('cargaLayoutRef.current.dono')) trocaDono = node;
    if (!pontoCarga && ts.isCallExpression(node) && node.expression.getText(ast) === 'carregarLayoutHomeEmEtapas') pontoCarga = node;
    ts.forEachChild(node, visitar);
  }
  visitar(ast);
  assert.ok(handler && pontoCarga, 'handler e carga reais presentes');
  let naTela = layoutD01.layoutPadrao();
  const contexto = {
    session: { user: usuario(undefined) },
    useRef: (current) => ({ current }), useCallback: (fn) => fn,
    setHomeLayout: (novo) => { naTela = novo; },
    carregarLayoutHomeEmEtapas: layoutD01.carregarLayoutHomeEmEtapas,
    salvarLayoutHome: layoutD01.salvarLayoutHome,
  };
  const codigo = [
    ref ? `const ${ref.getText(ast)};` : '',
    carga ? `const ${carga.getText(ast)};` : '',
    handler.getText(ast),
    trocaDono ? `globalThis.atualizarDono = () => { ${trocaDono.getText(ast)} };` : '',
    `globalThis.iniciar = ${carga ? 'carregarHomeLayout' : `() => ${pontoCarga.getText(ast)}`};`,
    'globalThis.editar = handleLayoutChange;',
  ].join('\n');
  vm.runInNewContext(ts.transpileModule(codigo, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, contexto);
  comportamento = 'controlada'; chamadasGetSession = 0; salvos = []; resolverSessao = undefined;
  sessaoNoDisco = sessaoCom(undefined);
  const pendente = contexto.iniciar();
  for (let i = 0; i < 30 && !resolverSessao; i++) await Promise.resolve();
  assert.equal(typeof resolverSessao, 'function', 'segunda etapa está pendente');
  assert.equal(naTela[0].key, 'saldo', 'primeira etapa preservada');
  const escolhido = naTela.map((bloco) => bloco.key === 'saldo' ? { ...bloco, visible: false } : bloco);
  contexto.editar(escolhido);
  assert.equal(naTela.find((b) => b.key === 'saldo').visible, false, 'edição aparece imediatamente');
  resolverSessao({ data: { session: sessaoCom(undefined) }, error: null });
  await pendente;
  assert.equal(salvos.length, 1, 'uma gravação real, sem repetição');
  assert.equal(salvos[0].find((b) => b.key === 'saldo').visible, false, 'servidor recebe escolha do usuário');
  assert.equal(naTela.find((b) => b.key === 'saldo').visible, false, 'D01: carga antiga não desfaz edição na tela');
  assert.equal(chamadasGetSession, 1, 'uma consulta ao servidor');
  ok('D01: edição entre etapas permanece na tela e é enviada uma vez para salvar');

  assert.ok(trocaDono, 'troca de dono é guardada no código real');
  resolverSessao = undefined;
  const cargaAntiga = contexto.iniciar();
  for (let i = 0; i < 30 && !resolverSessao; i++) await Promise.resolve();
  assert.equal(typeof resolverSessao, 'function');
  contexto.session = { user: { id: 'outro' } };
  contexto.atualizarDono();
  const telaNovaConta = [{ key: 'saldo', visible: false }];
  naTela = telaNovaConta;
  resolverSessao({ data: { session: sessaoCom(undefined) }, error: null });
  await cargaAntiga;
  assert.equal(naTela, telaNovaConta, 'resultado da conta anterior não altera a nova conta');
  assert.equal(salvos.length, 1, 'troca de dono não grava nenhuma alteração adicional');
  ok('D01: carga antiga é descartada após troca de dono');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

// Denúncia de resposta do Granabô (política da Play para IA generativa).
// Executa o lib/assistente.ts REAL com supabase de dublê; asserta nas chamadas
// (tabela, payload, falha que sobe), e confere a migration e a tela por texto.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

function carregar(supabase, modoTeste) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(root, 'lib/assistente.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const erros = [];
  vm.runInNewContext(js, {
    exports, Date, process: { env: {} }, fetch: async () => { throw new Error('sem rede'); },
    console: { error: (...a) => erros.push(a), log() {} },
    require(id) {
      if (id === './supabase') return { supabase };
      if (id === './modo-teste') return { MODO_TESTE: modoTeste };
      if (id === './assistente-teste') return { respostaDoTeste: () => '' };
      throw new Error('Import não simulado: ' + id);
    },
  }, { filename: 'lib/assistente.ts' });
  return { mod: exports, erros };
}

const UUID = '3f2b8c1e-5a6d-4e7f-8a9b-0c1d2e3f4a5b';

async function testarFormularioReal() {
  let corrente, chamadas = [], alteracoesDesmontadas = 0;
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const React = {
    useState(inicial) {
      const ctx = corrente, i = ctx.cursor++;
      if (!(i in ctx.slots)) ctx.slots[i] = typeof inicial === 'function' ? inicial() : inicial;
      return [ctx.slots[i], v => {
        if (!ctx.ativo) alteracoesDesmontadas++;
        ctx.slots[i] = typeof v === 'function' ? v(ctx.slots[i]) : v;
      }];
    },
    useRef(inicial) { return React.useState(() => ({ current: inicial }))[0]; },
    useEffect(fn) {
      const ctx = corrente, i = ctx.cursor++;
      if (!(i in ctx.slots)) { ctx.slots[i] = true; ctx.efeitos.push(fn); }
    },
  };
  const token = new Proxy({}, { get: () => 16 });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'components/DenunciarRespostaModal.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(id) {
    if (id === 'react') return React;
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (id === 'react-native') return { StyleSheet: { create: s => s }, Text: 'Text', View: 'View', TextInput: 'TextInput' };
    if (id === '@expo/vector-icons/Ionicons') return { __esModule: true, default: 'Icon' };
    if (id === '@/lib/theme') return { theme: token, fonts: token, radius: token, spacing: token, type: token, touchTarget: 48 };
    if (id === '@/lib/assistente') return {
      MOTIVOS_DENUNCIA: [{ valor: 'incorreta', rotulo: 'Incorreta' }], LIMITE_COMENTARIO_DENUNCIA: 300,
      denunciarResposta: (...args) => new Promise((resolve, reject) => chamadas.push({ args, resolve, reject })),
    };
    if (id.startsWith('./')) return { __esModule: true, default: id };
    throw Error('Import inesperado: ' + id);
  } });
  const novo = () => ({ slots: [], cursor: 0, ativo: true, efeitos: [], limpezas: [] });
  function desmontar(ctx) { if (ctx) { ctx.limpezas.forEach(fn => fn()); ctx.ativo = false; } }
  function executar(ctx, fn, props) {
    corrente = ctx; ctx.cursor = 0;
    const no = fn(props);
    ctx.efeitos.splice(0).forEach(fn => { const limpeza = fn(); if (limpeza) ctx.limpezas.push(limpeza); });
    return no;
  }
  function montar() {
    const ctx = novo(); let filho, chave, tipo, mensagem = null;
    const t = { tree: null, render() {
      const no = executar(ctx, exports.default, { mensagem, onClose: () => { mensagem = null; } });
      if (typeof no?.type === 'function') {
        if (no.key !== chave || no.type !== tipo) { desmontar(filho); filho = novo(); chave = no.key; tipo = no.type; }
        t.tree = executar(filho, no.type, no.props);
      } else { desmontar(filho); filho = null; chave = tipo = null; t.tree = no; }
      return t.tree;
    }, abrir(m) { mensagem = m; t.render(); }, desmontar() { desmontar(filho); desmontar(ctx); } };
    return t;
  }
  const texto = no => Array.isArray(no) ? no.map(texto).join(' ') : no && typeof no === 'object' ? texto(no.props?.children) : typeof no === 'string' ? no : '';
  function nos(no, lista = []) { if (Array.isArray(no)) no.forEach(n => nos(n, lista)); else if (no && typeof no === 'object') { lista.push(no); nos(no.props?.children, lista); } return lista; }
  const enviar = t => nos(t.tree).find(n => n.type === './AppPressable' && /Enviar denúncia|Enviando…|Tentar de novo/.test(texto(n)));
  const escolher = t => { nos(t.tree).find(n => n.props.accessibilityRole === 'radio').props.onPress(); t.render(); };
  const A = { id: 'A', texto: 'Resposta A' }, B = { id: 'B', texto: 'Resposta B' };
  for (const falha of [false, true]) for (const fechar of [false, true]) {
    chamadas = [];
    const t = montar(); t.abrir(A); escolher(t);
    assert.ok(enviar(t), JSON.stringify(nos(t.tree).map(n => [n.type, texto(n)])));
    const handler = enviar(t).props.onPress;
    const antiga = handler(); await handler(); // Mesmo handler antes do novo render: só um envio.
    assert.equal(chamadas.length, 1);
    if (fechar) { t.tree.props.onRequestClose(); t.render(); }
    t.abrir(B); escolher(t);
    const nova = enviar(t).props.onPress(); t.render();
    assert.equal(chamadas.length, 2);
    assert.equal(chamadas[0].args[0].id, 'A'); assert.equal(chamadas[1].args[0].id, 'B');
    if (falha) chamadas[0].reject(Error('falha antiga')); else chamadas[0].resolve();
    await antiga; t.render();
    assert.match(texto(t.tree), /Enviando…/); // finally antigo não libera B.
    assert.doesNotMatch(texto(t.tree), /Recebemos sua denúncia|Não foi possível enviar/);
    chamadas[1].resolve(); await nova; t.render();
    assert.match(texto(t.tree), /Recebemos sua denúncia/);
    t.tree.props.onRequestClose(); t.render(); t.abrir(B);
    assert.doesNotMatch(texto(t.tree), /Recebemos sua denúncia|Enviando…/);
    t.desmontar();
  }
  // A termina fechada; reabrir a mesma bolha também deve começar limpa.
  chamadas = []; const t = montar(); t.abrir(A); escolher(t);
  const p = enviar(t).props.onPress(); t.tree.props.onRequestClose(); t.render();
  chamadas[0].resolve(); await p; t.abrir(A);
  assert.doesNotMatch(texto(t.tree), /Recebemos sua denúncia|Enviando…/);
  // Falha da abertura atual continua visível e permite repetir de verdade.
  escolher(t); const erro = enviar(t).props.onPress(); chamadas[1].reject(Error('rede')); await erro; t.render();
  assert.match(texto(t.tree), /Não foi possível enviar/);
  const repetida = enviar(t).props.onPress(); chamadas[2].resolve(); await repetida; t.render();
  assert.match(texto(t.tree), /Recebemos sua denúncia/);
  t.desmontar(); assert.equal(alteracoesDesmontadas, 0, 'sucesso/catch/finally antigos não atualizam componente desmontado');
}

(async () => {
  // 1. Caminho feliz: grava na tabela certa, uuid do banco vai, comentário aparado.
  let chamadas = [];
  let { mod } = carregar({ from(t) { return { insert: async (p) => { chamadas.push([t, p]); return { error: null }; } }; } }, false);
  await mod.denunciarResposta({ id: UUID, texto: ' Resposta X ' }, 'incorreta', '  confuso  ');
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0][0], 'assistant_reports');
  assert.deepEqual({ ...chamadas[0][1] }, { mensagem_id: UUID, motivo: 'incorreta', comentario: 'confuso', texto_resposta: 'Resposta X' });

  // 2. Id local (bolha recém-recebida) vira null; comentário vazio vira null.
  chamadas = [];
  ({ mod } = carregar({ from(t) { return { insert: async (p) => { chamadas.push([t, p]); return { error: null }; } }; } }, false));
  await mod.denunciarResposta({ id: 'local-123', texto: 'ok' }, 'outro', '   ');
  assert.equal(chamadas[0][1].mensagem_id, null);
  assert.equal(chamadas[0][1].comentario, null);

  // 3. Comentário truncado em 300.
  await mod.denunciarResposta({ id: UUID, texto: 'ok' }, 'outro', 'a'.repeat(500));
  assert.equal(chamadas[1][1].comentario.length, 300);

  // 4. Falha do banco SOBE (nunca engolida) e deixa log.
  let r = carregar({ from() { return { insert: async () => ({ error: { code: '42501', message: 'rls' } }) }; } }, false);
  await assert.rejects(r.mod.denunciarResposta({ id: UUID, texto: 'x' }, 'improprio'), /denuncia_nao_enviada/);
  assert.equal(r.erros.length, 1);

  // 5. Texto vazio não chega ao banco.
  chamadas = [];
  ({ mod } = carregar({ from(t) { return { insert: async (p) => { chamadas.push(p); return { error: null }; } }; } }, false));
  await assert.rejects(mod.denunciarResposta({ id: UUID, texto: '  ' }, 'outro'), /denuncia_sem_texto/);
  assert.equal(chamadas.length, 0);

  // 6. Modo teste da landing não grava.
  ({ mod } = carregar({ from() { throw new Error('não devia gravar'); } }, true));
  await mod.denunciarResposta({ id: UUID, texto: 'x' }, 'outro');

  // 7. Motivos da tela == motivos aceitos pelo check da migration.
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261107120100_denuncias_assistente.sql'), 'utf8');
  for (const m of mod.MOTIVOS_DENUNCIA) assert.ok(sql.includes(`'${m.valor}'`), m.valor);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /for insert to authenticated[\s\S]*auth\.uid\(\) = user_id/);
  assert.match(sql, /for select to authenticated[\s\S]*auth\.uid\(\) = user_id/);
  assert.doesNotMatch(sql, /grant[^;]*(update|delete)[^;]*to authenticated/i);

  // 8. Tela: recibo visível na falha, sem catch vazio, e ação presente no Granachat.
  const tela = fs.readFileSync(path.join(root, 'components/DenunciarRespostaModal.tsx'), 'utf8');
  assert.match(tela, /setFalhou\(true\)/);
  assert.match(tela, /Não foi possível enviar a denúncia/);
  const chat = fs.readFileSync(path.join(root, 'components/Granachat.tsx'), 'utf8');
  assert.match(chat, /Denunciar esta resposta/);
  assert.match(chat, /!isUser && !item\.erro/);

  await testarFormularioReal();
  console.log('denunciar-resposta: serviço e formulário reais ok (sucesso/falha/finally, fechar/trocar/reabrir, repetição e toque duplo)');
})().catch((e) => { console.error(e); process.exit(1); });

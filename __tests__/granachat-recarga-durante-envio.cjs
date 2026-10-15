// Achado do Forge (15/10/2026, P1): a recarga do histórico ao reabrir o
// Granachat, se terminasse DEPOIS de um envio começar, trocava o estado inteiro
// e apagava a pergunta nova e a bolha da resposta. Executa os trechos REAIS de
// components/Granachat.tsx (efeito de carga + `enviar`), transpilados, com
// hooks e rede de dublê, na ordem: leitura começa -> envio começa -> leitura
// termina -> envio termina. Asserta na tela final e em quantas vezes o envio
// foi chamado. A mutação (sem o descarte da leitura obsoleta) tem que reprovar.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const fonteReal = fs.readFileSync(path.join(__dirname, '..', 'components', 'Granachat.tsx'), 'utf8');

function trecho(fonte, inicio, fim) {
  const a = fonte.indexOf(inicio);
  const b = fonte.indexOf(fim, a);
  assert.ok(a >= 0 && b > a, `trecho não encontrado: ${inicio}`);
  return fonte.slice(a, b);
}

function adiado() {
  let resolver;
  const promessa = new Promise((r) => { resolver = r; });
  return { promessa, resolver };
}

const tique = () => new Promise((r) => setImmediate(r));

async function cenario(fonte) {
  const codigo =
    trecho(fonte, '  const primeiraCargaRef = useRef(true);', '  /* ── Teclado') +
    trecho(fonte, '  const enviar = useCallback(async () => {', '  const cancelarEnvio') +
    '\nglobalThis.__enviar = enviar;\n';
  const js = ts.transpileModule(codigo, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const antiga = { id: 'antiga', papel: 'assistente', texto: 'resposta antiga', ferramenta_usada: null, criado_em: new Date().toISOString() };
  let tela = [antiga];
  const leitura = adiado();
  const resposta = adiado();
  const envios = [];
  const ctx = {
    console: { error() {}, log() {} },
    Date, setTimeout, clearTimeout, AbortController,
    visivel: true,
    enviando: false,
    texto: 'quanto gastei hoje?',
    mensagens: tela,
    reduzirMovimento: true,
    useRef: (v) => ({ current: v }),
    useEffect: (fn) => { fn(); },
    useCallback: (fn) => fn,
    setMensagens: (v) => { tela = typeof v === 'function' ? v(tela) : v; },
    setEnviando: () => {}, setTexto: () => {}, setCarregando: () => {},
    manterScrollNoFimRef: { current: false },
    requisicaoRef: { current: null },
    inputRef: { current: { focus() {} } },
    fetchMensagens: () => leitura.promessa,
    enviarPergunta: (pergunta, historico) => { envios.push({ pergunta, historico }); return resposta.promessa; },
    dentroDoPrazo: () => true,
    traduzirErro: (e, padrao) => padrao,
  };
  vm.runInNewContext(js, ctx, { filename: 'Granachat-trechos.js' });

  const envio = ctx.__enviar();               // envio começa com a leitura no ar
  await tique();
  leitura.resolver([antiga]);                 // leitura termina depois
  await tique(); await tique();
  resposta.resolver({ resposta: 'Hoje você gastou R$ 10,00.', ferramenta: 'resumo' });
  await envio;
  await tique();
  return { tela, envios };
}

(async () => {
  const { tela, envios } = await cenario(fonteReal);
  assert.equal(envios.length, 1, 'uma só chamada de envio');
  assert.ok(tela.some((m) => m.papel === 'usuario' && m.texto === 'quanto gastei hoje?'), 'a pergunta continua na tela');
  const bolha = tela.find((m) => m.texto === 'Hoje você gastou R$ 10,00.');
  assert.ok(bolha, 'a resposta aparece (recibo visível)');
  assert.equal(bolha.carregando, false);
  assert.ok(tela.some((m) => m.id === 'antiga'), 'o histórico que já estava continua');

  // Mutação: sem o descarte da leitura obsoleta, o cenário TEM que reprovar.
  const bloco = /\n\s*if \(enviosRef\.current !== enviosNoInicio\) \{[\s\S]*?return;\s*\n\s*\}/;
  assert.match(fonteReal, bloco, 'guarda da leitura obsoleta presente');
  const mutante = await cenario(fonteReal.replace(bloco, ''));
  assert.ok(
    !mutante.tela.some((m) => m.texto === 'Hoje você gastou R$ 10,00.'),
    'o mutante perde a resposta, então o teste distingue a correção',
  );
  console.log('granachat-recarga-durante-envio: ok');
})().catch((e) => { console.error(e); process.exit(1); });

/*
 * V20 (16/10/2026): falha na leitura do histórico do Granabô não esvazia a conversa na tela.
 *
 *   node __tests__/granachat-historico-offline.cjs
 *
 * Parte da reprodução do Sentinel (A4): executa `lib/assistente.ts` real e o efeito real de
 * `components/Granachat.tsx` com a consulta Supabase dublada para falhar por falta de rede.
 * Antes: fetchMensagens devolvia [] e a tela trocava as mensagens por nada.
 * Agora: fetchMensagens lança, a tela preserva o que mostra e deixa um recibo visível.
 * Asserta também nas CHAMADAS: nenhuma escrita no banco, log sem texto de conversa.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const repo = path.join(__dirname, '..');
let passou = 0;
const ok = (c, nome) => { assert.ok(c, nome); passou++; };

const logs = [];
let writes = 0;
let modo = 'rede-caiu';
const linhaComTextoSecreto = { id: 'srv-1', papel: 'usuario', texto: 'TEXTO-PRIVADO-DA-CONVERSA', ferramenta_usada: null, criado_em: new Date().toISOString() };
const supabase = {
  from() {
    const chain = {
      select() { return chain; }, gte() { return chain; }, order() { return chain; },
      async limit() {
        return modo === 'rede-caiu'
          ? { data: null, error: { code: '', message: 'Network request failed' } }
          : { data: [linhaComTextoSecreto], error: null };
      },
      insert() { writes++; throw new Error('escrita proibida'); },
      update() { writes++; throw new Error('escrita proibida'); },
      delete() { writes++; throw new Error('escrita proibida'); },
    };
    return chain;
  },
};
function transpilar(codigo) {
  return ts.transpileModule(codigo, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
function carregarAssistente() {
  const exports = {};
  vm.runInNewContext(transpilar(fs.readFileSync(path.join(repo, 'lib', 'assistente.ts'), 'utf8')), {
    exports, Date, process: { env: {} }, fetch: async () => { throw new Error('rede não usada'); },
    console: { error(...a) { logs.push(a); }, log() {} },
    require(id) { if (id === './supabase') return { supabase }; throw new Error(`import inesperado: ${id}`); },
  }, { filename: 'lib/assistente.ts' });
  return exports;
}
function trecho(fonte, ini, fim) {
  const a = fonte.indexOf(ini);
  const b = fonte.indexOf(fim, a);
  assert.ok(a >= 0 && b > a, `trecho não encontrado: ${ini}`);
  return fonte.slice(a, b);
}
const tick = () => new Promise((r) => setImmediate(r));

(async () => {
  const assistente = carregarAssistente();

  // 1) Contrato: erro discriminado, não lista vazia.
  let erro = null;
  try { await assistente.fetchMensagens(50); } catch (e) { erro = e; }
  ok(erro && erro.message === 'historico_indisponivel', 'falha da consulta lança historico_indisponivel em vez de devolver []');
  ok(logs.length === 1 && logs[0][0] === '[assistente] erro ao buscar mensagens:', 'a falha deixa um log');
  ok(!JSON.stringify(logs).includes('TEXTO-PRIVADO'), 'o log não carrega texto de conversa');
  modo = 'ok';
  const lidas = await assistente.fetchMensagens(50);
  ok(lidas.length === 1 && lidas[0].id === 'srv-1', 'leitura bem-sucedida continua devolvendo as mensagens');

  // 2) Tela: o efeito real preserva o que já mostra.
  const fonte = fs.readFileSync(path.join(repo, 'components', 'Granachat.tsx'), 'utf8');
  const codigo = trecho(fonte, '  const primeiraCargaRef = useRef(true);', '  /* ── Teclado');
  const js = transpilar(codigo);
  const executar = async (leitura, inicial) => {
    let tela = inicial;
    let carregando = true;
    const ctx = {
      console: { error(...a) { logs.push(a); }, log() {}, warn() {} }, Date, setTimeout, clearTimeout, AbortController,
      visivel: true, enviando: false, texto: '', mensagens: tela, reduzirMovimento: true,
      useRef: (v) => ({ current: v }), useEffect: (fn) => { fn(); }, useCallback: (fn) => fn,
      setMensagens: (v) => { tela = typeof v === 'function' ? v(tela) : v; },
      setEnviando() {}, setTexto() {}, setCarregando: (v) => { carregando = v; },
      manterScrollNoFimRef: { current: false }, requisicaoRef: { current: null },
      inputRef: { current: { focus() {} } }, fetchMensagens: leitura,
      enviarPergunta: async () => { throw new Error('envio não esperado'); },
      dentroDoPrazo: assistente.dentroDoPrazo, traduzirErro: (e, f) => f,
    };
    vm.runInNewContext(js, ctx, { filename: 'components/Granachat.tsx (efeito)' });
    await tick(); await tick();
    return { tela, carregando };
  };
  const agora = new Date().toISOString();
  const antiga = { id: 'msg-local', papel: 'assistente', texto: 'resposta anterior', ferramenta_usada: null, criado_em: agora };
  const venceu = { id: 'msg-velha', papel: 'usuario', texto: 'velha', ferramenta_usada: null, criado_em: new Date(Date.now() - 48 * 3600_000).toISOString() };

  modo = 'rede-caiu';
  const offline = await executar(() => assistente.fetchMensagens(50), [antiga, venceu]);
  ok(offline.tela.some((m) => m.id === 'msg-local'), 'offline: a mensagem já exibida continua na tela');
  ok(!offline.tela.some((m) => m.id === 'msg-velha'), 'offline: o que passou do prazo de 12 h ainda sai');
  const recibo = offline.tela.find((m) => m.id === 'falha-historico');
  ok(recibo && recibo.erro && /hist[óo]rico/i.test(recibo.texto), 'offline: recibo visível de que o histórico não carregou');
  ok(offline.carregando === false, 'offline: o indicador de carregando termina');

  const vazia = await executar(() => assistente.fetchMensagens(50), []);
  ok(vazia.tela.length === 1 && vazia.tela[0].id === 'falha-historico', 'offline sem nada na tela: aparece o recibo, não uma conversa "nova" muda');

  // 3) Volta a rede: a leitura nova substitui tudo, e o recibo some.
  modo = 'ok';
  const voltou = await executar(() => assistente.fetchMensagens(50), offline.tela);
  ok(voltou.tela.length === 1 && voltou.tela[0].id === 'srv-1', 'com rede de novo, o histórico do servidor substitui a lista e o recibo some');

  ok(writes === 0, 'nenhuma escrita no banco em nenhum dos caminhos');
  console.log(`granachat-historico-offline: ${passou} checagens passaram — 0 falhas`);
})().catch((e) => { console.error(e); process.exit(1); });

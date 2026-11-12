/*
 * V20 (16/10/2026): falha na leitura do histórico do Granabô não esvazia a conversa na tela.
 *
 *   node __tests__/granachat-historico-offline.cjs
 *
 * Parte da reprodução do Sentinel (A4): executa `lib/assistente.ts` real e o componente completo
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
const { criarGranachatCompleto } = require('./helpers/granachat-compat-completo.cjs');
const watchdog = setTimeout(() => { console.error('compat histórico não concluiu'); process.exit(2); }, 15000);
const repo = path.join(__dirname, '..');
let passou = 0;
const ok = (c, nome) => { assert.ok(c, nome); passou++; };

const logs = [];
let writes = 0;
let modo = 'rede-caiu';
const linhaComTextoSecreto = { id: 'srv-1', papel: 'usuario', texto: 'TEXTO-PRIVADO-DA-CONVERSA', ferramenta_usada: null, criado_em: new Date().toISOString() };
const supabase = {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'usuario-sintetico' }, access_token: 'token-sintetico' } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
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
    exports, Date, AbortController, setTimeout, clearTimeout, process: { env: {} }, fetch: async () => { throw new Error('rede não usada'); },
    console: { error(...a) { logs.push(a); }, warn(...a) { logs.push(a); }, log() {} },
    require(id) {
      if (id === './supabase') return { supabase };
      // 2244e190 (21/10): modo teste da landing; aqui vale o caminho real.
      if (id === './modo-teste') return { MODO_TESTE: false };
      if (id === './assistente-teste') return { respostaDoTeste: () => { throw new Error('modo teste fora do teste'); } };
      throw new Error(`import inesperado: ${id}`);
    },
  }, { filename: 'lib/assistente.ts' });
  return exports;
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

  // 2) Tela: componente real completo, sem depender de variáveis externas de trechos.
  const fonte = fs.readFileSync(path.join(repo, 'components', 'Granachat.tsx'), 'utf8');
  const executar = async (leitura, inicial) => {
    const ui = criarGranachatCompleto({ fonte, inicial, leitura });
    try {
      await tick(); await tick();
      const { tela, carregando, envios, logs: logsTela } = ui.resultado();
      assert.equal(envios.length, 0, 'carregar histórico não faz POST');
      logs.push(...logsTela);
      return { tela, carregando };
    } finally { ui.desmontar(); }
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
  ok(!JSON.stringify(logs).includes('TEXTO-PRIVADO'), 'logs de todos os caminhos continuam sem texto da conversa');
  console.log(`granachat-historico-offline: ${passou} checagens passaram — 0 falhas`);
})().then(() => clearTimeout(watchdog), (e) => { clearTimeout(watchdog); console.error(e); process.exit(1); });

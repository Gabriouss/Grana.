// Prazo de 12 h da conversa do Granachat (decisão do autor, 15/10/2026).
// Executa o módulo REAL lib/assistente.ts num sandbox com Date.now falso e um
// supabase de dublê. Asserta nas chamadas à consulta (filtro de data, tabela) e
// no que sai de fetchMensagens, e que o banco nunca recebe delete/update.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const HORA = 3600 * 1000;

function carregar(arquivo, dependencias, globais, fonte) {
  const exports = {};
  const js = ts.transpileModule(fonte ?? fs.readFileSync(path.join(root, arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console, Date: globais.Date, process: { env: {} }, fetch: async () => { throw new Error('sem rede'); },
    require(id) {
      if (id in dependencias) return dependencias[id];
      throw new Error(`Import não simulado: ${id}`);
    },
  }, { filename: arquivo });
  return exports;
}

function montar(agora, linhasPorConta, contaRef, fonte) {
  const chamadas = [];
  class DataFalsa extends Date {
    constructor(...a) { a.length ? super(...a) : super(agora); }
    static now() { return agora; }
  }
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
    from(tabela) {
      const q = { tabela, filtros: [] };
      chamadas.push(q);
      const cadeia = {
        select() { return cadeia; },
        gte(col, val) { q.filtros.push([col, val]); return cadeia; },
        order() { return cadeia; },
        async limit() {
          // O banco real filtraria por gte; devolvemos TUDO da conta de propósito,
          // para provar que o cliente também corta (defesa em dois lugares).
          return { data: [...linhasPorConta[contaRef.atual]], error: null };
        },
        delete() { throw new Error('delete proibido: banco fica como está'); },
        update() { throw new Error('update proibido'); },
      };
      return cadeia;
    },
  };
  const mod = carregar('lib/assistente.ts', { './supabase': { supabase } }, { Date: DataFalsa }, fonte);
  return { mod, chamadas };
}

(async () => {
  const T0 = Date.UTC(2026, 9, 15, 12, 0, 0);
  const msg = (id, minAtras, papel = 'usuario') => ({
    id, papel, texto: id, ferramenta_usada: null,
    criado_em: new Date(T0 - minAtras * 60000).toISOString(),
  });
  const contas = {
    A: [msg('a-11h59', 11 * 60 + 59), msg('a-12h01', 12 * 60 + 1), msg('a-agora', 1), msg('a-ontem', 30 * 60)],
    B: [msg('b-1h', 60)],
  };
  const conta = { atual: 'A' };
  const { mod, chamadas } = montar(T0, contas, conta);

  assert.equal(mod.PRAZO_CONVERSA_MS, 12 * HORA);
  assert.equal(mod.dentroDoPrazo(new Date(T0 - (12 * HORA - 60000)).toISOString(), T0), true);   // 11h59
  assert.equal(mod.dentroDoPrazo(new Date(T0 - (12 * HORA + 60000)).toISOString(), T0), false);  // 12h01
  assert.equal(mod.dentroDoPrazo('lixo', T0), false);

  const a = (await mod.fetchMensagens(50)).map((m) => m.id);
  assert.deepEqual(a.sort(), ['a-11h59', 'a-agora'], 'só 11h59 e recente ficam; 12h01 e 30h somem');

  // A consulta leva o corte de 12 h, sobre a tabela certa, sem escrita.
  const q = chamadas[0];
  assert.equal(q.tabela, 'assistant_messages');
  assert.deepEqual(q.filtros, [['criado_em', new Date(T0 - 12 * HORA).toISOString()]]);

  // Troca de conta: nova consulta, nunca a conversa da anterior.
  conta.atual = 'B';
  assert.deepEqual((await mod.fetchMensagens(50)).map((m) => m.id), ['b-1h']);

  // Mutação: com o prazo ignorado (no filtro do cliente e na consulta), as
  // mesmas asserções TÊM que reprovar.
  const fonteMut = fs.readFileSync(path.join(root, 'lib/assistente.ts'), 'utf8')
    .replace('agora - quando <= PRAZO_CONVERSA_MS', 'true');
  assert.notEqual(fonteMut, fs.readFileSync(path.join(root, 'lib/assistente.ts'), 'utf8'), 'mutação não aplicou');
  const contaMut = { atual: 'A' };
  const mut = montar(T0, contas, contaMut, fonteMut);
  const idsMut = (await mut.mod.fetchMensagens(50)).map((m) => m.id).sort();
  assert.throws(() => assert.deepEqual(idsMut, ['a-11h59', 'a-agora']), 'mutante sem prazo precisa reprovar');

  // O Granachat usa o MESMO filtro no histórico enviado ao Granabô e recarrega ao abrir.
  const tela = fs.readFileSync(path.join(root, 'components/Granachat.tsx'), 'utf8');
  assert.match(tela, /\.filter\(\(m\) => !m\.carregando && !m\.erro && dentroDoPrazo\(m\.criado_em\)\)/);
  assert.match(tela, /atual\.filter\(\(m\) => dentroDoPrazo\(m\.criado_em\)\)/, 'sem rede, a tela também corta o vencido');
  assert.match(tela, /\}, \[visivel\]\);\s*\n\s*\n\s*\/\* ── Teclado/);
  console.log('granachat-prazo: ok');
})().catch((e) => { console.error(e); process.exit(1); });

// Adaptação dos três compat: componente COMPLETO, sem editar o helper P2 congelado.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const componente = path.join(root, 'components/Granachat.tsx');
const helper = require.resolve('./chat-cancelamento-p2.cjs');
function criarGranachatCompleto({ fonte, inicial = [], leitura, resposta, consulta } = {}) {
  assert.ok(!process.env.SENTINEL_CHAT_RED, 'compatibilidade usa GREEN; remover SENTINEL_CHAT_RED do filho');
  const ler = fs.readFileSync, executar = vm.runInNewContext;
  let semeouMensagens = false, componenteCarregado = false, c, ferramentas;
  // Cada cenário (inclusive o mutante) tem compilação/cache próprios. Só a
  // fronteira React semeia o estado que o teste original já tinha em tela.
  delete require.cache[helper];
  try {
    if (fonte !== undefined) fs.readFileSync = function (file, ...args) {
      return typeof file === 'string' && path.resolve(file).toLowerCase() === componente.toLowerCase() ? fonte : ler.call(fs, file, ...args);
    };
    vm.runInNewContext = function (js, contexto, opts) {
      if (opts?.filename === 'lib/assistente.ts' || opts?.filename === 'components/Granachat.tsx') contexto.Date = Date;
      if (opts?.filename === 'components/Granachat.tsx') {
        componenteCarregado = true;
        const requerer = contexto.require;
        contexto.require = id => {
          const mod = requerer(id);
          if (id === 'react') return { ...mod, useState(init) {
            if (!semeouMensagens && Array.isArray(init)) { semeouMensagens = true; return mod.useState([...inicial]); }
            return mod.useState(init);
          } };
          // A leitura injetada pelos compat offline chama o módulo real do
          // assistente com seu SDK de dublê, como no cenário anterior.
          if (id === '@/lib/assistente' && leitura) return { ...mod, fetchMensagens: leitura };
          return mod;
        };
      }
      return executar.call(vm, js, contexto, opts);
    };
    ferramentas = require(helper);
    c = ferramentas.ambiente();
    if (consulta) c.history = consulta;
    if (resposta) c.body = resposta;
    c.mount();
  } finally { fs.readFileSync = ler; vm.runInNewContext = executar; }
  assert.ok(componenteCarregado && semeouMensagens, 'Granachat real completo carregado e estado React inicial oferecido');
  return {
    c,
    render: () => c.render(),
    enviar(texto) { ferramentas.digitar(c, texto); const p = ferramentas.find(c, 'Enviar mensagem').props.onPress(); c.render(); return p; },
    resultado() {
      c.render();
      const lista = ferramentas.nodes(c.tree).find(n => n.type === 'FlatList');
      assert.ok(lista, 'lista real do Granachat disponível');
      const vazio = lista.props.ListEmptyComponent;
      return { tela: ferramentas.linhas(c), carregando: typeof vazio === 'function' ? vazio() === null : false,
        envios: c.posts.map(p => { const corpo = JSON.parse(p.options.body); return { pergunta: corpo.mensagem, historico: corpo.historico }; }), logs: c.logs };
    },
    desmontar: () => c.unmount(),
  };
}
module.exports = { criarGranachatCompleto };

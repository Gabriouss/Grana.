'use strict';
// Modo teste da landing (lib/modo-teste.ts, lib/lancamentos-teste.ts, lib/assistente-teste.ts), nos módulos reais:
// só liga na web e em /experimentar, a marca não vaza para a landing, lançar no teste é compartilhado entre
// telas e avisa a página-mãe, e fora do teste nada muda (lista fixa de exemplo, nada guardado).
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const transpilar = (arq) => ts.transpileModule(fs.readFileSync(arq, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

const DEMO = [{ id: 'd1', type: 'out', description: 'Supermercado', amount: 100, category: 'Alimentação', color: '#f00', occurred_on: new Date().toISOString().slice(0, 10), recurring: false, parent_id: null }];

function carregar({ os = 'web', caminho = '/', nome = '', pai = null } = {}) {
  const avisos = [];
  const janela = { location: { pathname: caminho, origin: 'http://x' }, name: nome };
  janela.parent = pai ? { postMessage: (m, o) => avisos.push([m, o]) } : janela;
  const modulos = {};
  const req = (nome) => {
    if (nome === 'react-native') return { Platform: { OS: os } };
    if (nome === './demo-data') return { DEMO_TRANSACTIONS: DEMO };
    if (nome === './modo-teste') return modulos.modo;
    if (nome === './lancamentos-teste') return modulos.lanc;
    return {};
  };
  const rodar = (arq) => { const exp = {}; vm.runInNewContext(transpilar(arq), { exports: exp, require: req, window: os === 'web' ? janela : undefined, console, Date, Math }); return exp; };
  modulos.modo = rodar('lib/modo-teste.ts');
  modulos.lanc = rodar('lib/lancamentos-teste.ts');
  modulos.assist = rodar('lib/assistente-teste.ts');
  return { ...modulos, janela, avisos };
}

let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };

// 1. Quando liga
eq(carregar({ os: 'android', caminho: '/experimentar' }).modo.MODO_TESTE, false, 'nativo nunca entra no modo teste');
eq(carregar({ caminho: '/' }).modo.MODO_TESTE, false, 'landing comum não é teste');
eq(carregar({ caminho: '/lancamentos' }).modo.MODO_TESTE, false, 'área do app comum não é teste');
const entrada = carregar({ caminho: '/experimentar' });
eq(entrada.modo.MODO_TESTE, true, '/experimentar liga o teste');
eq(entrada.janela.name, 'grana-modo-teste', 'a marca fica no nome da janela');
eq(carregar({ caminho: '/', nome: 'grana-modo-teste' }).modo.MODO_TESTE, true, 'recarregar o teste (já em /) continua teste');
entrada.modo.sairDoModoTeste();
eq(entrada.janela.name, '', 'sair limpa a marca');

// 2. Fora do teste nada é guardado e a lista é a fixa
const comum = carregar({ caminho: '/' });
comum.lanc.guardarLancamentosDeExemplo([]);
eq(comum.lanc.lancamentosDeExemplo(), DEMO, '"Dados de exemplo" do Perfil continua com a lista fixa');

// 3. No teste: lançar é compartilhado entre telas e avisa a landing que contém o iframe
const t = carregar({ caminho: '/experimentar', pai: true });
const novo = t.lanc.adicionarLancamentoDeTeste({ type: 'out', description: 'Mercado', amount: 45.9, category: 'Alimentação', color: '#0f0', occurred_on: DEMO[0].occurred_on });
eq(t.lanc.lancamentosDeExemplo()[0], novo, 'o lançamento novo vem primeiro na lista compartilhada');
eq(t.lanc.lancamentosDeExemplo().length, 2, 'lista de exemplo mais o lançamento');
eq(t.avisos, [['grana-teste:lancamento', 'http://x']], 'avisa a página-mãe uma vez, só para a mesma origem');
const editada = t.lanc.lancamentosDeExemplo().map((x) => ({ ...x, amount: 1 }));
t.lanc.guardarLancamentosDeExemplo(editada);
eq(t.lanc.lancamentosDeExemplo(), editada, 'o que a tela edita vale nas outras');

// 4. Granabô do teste responde com os números da lista em uso
const t2 = carregar({ caminho: '/experimentar' });
t2.lanc.adicionarLancamentoDeTeste({ type: 'out', description: 'Mercado', amount: 45.9, category: 'Alimentação', color: '#0f0', occurred_on: DEMO[0].occurred_on });
const resposta = t2.assist.respostaDoTeste('quanto gastei com alimentação?').replace(/ /g, ' ');
ok(resposta.includes('145,90'), 'soma a categoria com o lançamento do teste: ' + resposta);
ok(/mais pesou.*Alimentação/.test(t2.assist.respostaDoTeste('onde mais gastei?')), 'maior categoria');
ok(/Pergunte/.test(t2.assist.respostaDoTeste('oi')), 'fora dos temas, ensina o que perguntar');
for (const r of ['quanto gastei?', 'onde mais gastei?', 'quanto entrou?', 'oi']) ok(!/—/.test(t2.assist.respostaDoTeste(r)), 'sem travessão');

// 5. Nenhuma chamada do Supabase sai no teste: a recusa é a primeira coisa do fetch do cliente.
const sup = fs.readFileSync('lib/supabase.ts', 'utf8');
ok(/fetchComRetentativaDeRelogio\([^)]*\)[^{]*\{\s*(\/\*[\s\S]*?\*\/\s*)?if \(MODO_TESTE\) throw new RedeDesligadaNoTeste\(\);/.test(sup), 'fetch do Supabase recusa tudo no modo teste antes de qualquer pedido');
const assistente = fs.readFileSync('lib/assistente.ts', 'utf8');
ok(/fetchMensagens[\s\S]{0,200}if \(MODO_TESTE\) return \[\];/.test(assistente), 'histórico do chat não consulta o servidor no teste');
ok(/if \(MODO_TESTE\) \{[\s\S]{0,120}respostaDoTeste\(mensagem\)/.test(assistente), 'pergunta ao Granabô responde local no teste, sem a Edge Function');

console.log(`modo-teste: ${checks} checks; só web em /experimentar, marca por janela, memória compartilhada, aviso à landing, respostas locais OK`);
